require("dotenv").config();
const { google } = require("googleapis");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const app = express();

// Настройки
const PORT = process.env.PORT || 10000;

console.log("SUPABASE_URL:", process.env.SUPABASE_URL);
console.log("🔧 SUPABASE_KEY:", process.env.SUPABASE_KEY ? "✅" : "❌ NOT SET");
console.log("🔧 SHEET_ID:", process.env.SHEET_ID);
console.log("🔧 GOOGLE_CREDENTIALS_JSON:", process.env.GOOGLE_CREDENTIALS_JSON);

// Инициализация Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Middleware
app.use(morgan("dev"));
app.use(cors({ origin: "*" }));
app.use(express.json());

// Проверка подключения к Google Sheets
let sheets;
async function initializeGoogleSheets() {
  try {
    const credentialsPath = process.env.GOOGLE_CREDENTIALS_JSON;
    const credentialsJson = fs.readFileSync(credentialsPath, "utf8");

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(credentialsJson),
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    sheets = google.sheets({ version: "v4", auth });

    await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: "ТЕ-21б!A1:A1",
    });

    console.log("✅ Google Sheets API подключен");
  } catch (error) {
    console.error("🔥 Ошибка Google Sheets:", error.message);
    process.exit(1);
  }
}

// Получение предметов пользователя
app.get("/user-subjects", async (req, res) => {
  console.log("🔍 Запрос получен:", req.query);

  const { firstName, lastName } = req.query;
  if (!firstName || !lastName) {
    return res.status(400).json({ error: "Имя и фамилия обязательны" });
  }

  const searchPattern = `%${lastName} ${firstName}%`;
  console.log("🔍 Поиск по шаблону:", searchPattern);

  const { data: subjects, error } = await supabase
    .from("portfolio_te21b")
    .select("subject")
    .ilike("full_name", searchPattern)
    .eq("status", true);

  if (error) {
    console.error("❌ Ошибка Supabase:", error);
    return res.status(500).json({ error: "Ошибка при получении данных" });
  }

  res.json({ subjects: subjects.map((item) => item.subject) });
});

// Keep-alive для Render
app.get("/", (req, res) => {
  res.send("✅ API работает");
});

// Запуск сервера
async function startServer() {
  await initializeGoogleSheets();

  app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
  });
}

startServer();
