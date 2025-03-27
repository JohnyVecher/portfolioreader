require("dotenv").config();
const { google } = require("googleapis");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const morgan = require("morgan");

const app = express();

// 🔹 Проверяем, загружаются ли переменные окружения
console.log("🔧 SUPABASE_URL:", process.env.SUPABASE_URL);
console.log("🔧 SUPABASE_KEY:", process.env.SUPABASE_KEY ? "✅" : "⛔ МISSING");
console.log("🔧 SHEET_ID:", process.env.SHEET_ID);
console.log("🔧 GOOGLE_CREDENTIALS_JSON:", process.env.GOOGLE_CREDENTIALS_JSON);

let supabase;
let sheets;

async function initializeServices() {
  try {
    // 🔹 1. Инициализация Supabase
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

    // 🔹 2. Инициализация Google Sheets
    const credentialsPath = process.env.GOOGLE_CREDENTIALS_JSON;
    if (!fs.existsSync(credentialsPath)) {
      throw new Error(`Файл ${credentialsPath} не найден!`);
    }

    const credentialsJson = fs.readFileSync(credentialsPath, "utf8");
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(credentialsJson),
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    sheets = google.sheets({ version: "v4", auth });

    // 🔹 Проверяем подключение к Google Sheets
    await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: "ТЕ-21б!A1:A1",
    });

    console.log("✅ Services initialized successfully");
  } catch (error) {
    console.error("🔥 Ошибка инициализации сервисов:", error.message);
    process.exit(1);
  }
}

// 🔹 Middleware
app.use(morgan("dev"));
app.use(cors({
  origin: "*",  // Разрешаем запросы со всех доменов (на время отладки)
  methods: "GET,POST",
  allowedHeaders: "Content-Type,Authorization",
}));
app.use(express.json());

// 📌 **Функция синхронизации данных из Google Sheets**
async function uploadPortfolioData() {
  try {
    console.log("🔄 Синхронизация данных с Google Sheets...");
    
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: "ТЕ-21б!A1:L100",  // Загружаем данные
    });

    const rows = data.values;
    if (!rows || rows.length === 0) {
      console.log("❌ Нет данных в Google Sheets.");
      return;
    }

    // 🔹 Удаляем старые данные перед загрузкой новых
    await supabase.from("portfolio_te21b").delete().neq("id", 0);

    // 🔹 Парсим данные
    const formattedData = rows.slice(1).map(row => ({
      full_name: `${row[1]} ${row[0]}`.trim(),  // Фамилия + Имя
      subject: row[2]?.trim() || "Неизвестный предмет",
      status: row[3]?.toLowerCase() === "сдано",
    }));

    // 🔹 Загружаем в Supabase
    const { error } = await supabase.from("portfolio_te21b").insert(formattedData);
    if (error) throw error;

    console.log(`✅ Загружено ${formattedData.length} записей в Supabase.`);
  } catch (err) {
    console.error("🔥 Ошибка синхронизации с Google Sheets:", err.message);
  }
}

// 📌 **Эндпоинт для получения предметов пользователя**
app.get("/user-subjects", async (req, res) => {
  try {
    const { firstName, lastName } = req.query;

    if (!firstName || !lastName) {
      return res.status(400).json({ error: "Имя и фамилия обязательны" });
    }

    console.log(`🔍 Ищем предметы для: ${lastName} ${firstName}`);

    // 🔹 Поиск по ФИО
    const searchPattern = `%${lastName} ${firstName}%`;
    const { data: subjects, error } = await supabase
      .from("portfolio_te21b")
      .select("subject")
      .ilike("full_name", searchPattern)
      .eq("status", true);

    if (error) throw error;

    res.json({ subjects: subjects.map(item => item.subject) });
  } catch (err) {
    console.error("🔥 Ошибка при получении предметов:", err.message);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// 📌 **Запуск сервера**
async function startServer() {
  try {
    await initializeServices();

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`🚀 Сервер запущен на порту ${PORT}`);

      // 🔹 Запускаем синхронизацию данных при старте
      uploadPortfolioData();

      // 🔹 Устанавливаем периодическую синхронизацию (раз в час)
      setInterval(uploadPortfolioData, 60 * 60 * 1000);
    });
  } catch (error) {
    console.error("🔥 Ошибка запуска сервера:", error);
    process.exit(1);
  }
}

startServer();
