require("dotenv").config();
const { google } = require("googleapis");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
 
app.use(cors());
app.options("*", cors());

app.use(cors({
  origin: "http://localhost:3000", // Для локальной разработки
  // origin: "https://your-frontend.com", // Замени на свой домен на проде
  methods: "GET,POST",
  allowedHeaders: "Content-Type,Authorization",
}));

// Читаем JSON-файл с учетными данными
const credentialsPath = process.env.GOOGLE_CREDENTIALS_JSON;
const credentialsJson = fs.readFileSync(credentialsPath, "utf8");

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(credentialsJson),
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});

const sheets = google.sheets({ version: "v4", auth });

// Функция для загрузки данных в Supabase
async function uploadPortfolioData() {
  try {
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: "ТЕ-21б!A1:L100", // Диапазон данных (зависит от таблицы)
    });

    const [headers, ...rows] = data.values;
    let records = [];

    rows.forEach(row => {
      const fullName = row[1]; // ФИО
      for (let i = 2; i < headers.length; i++) {
        let subject = headers[i];
        let cellValue = row[i]?.trim().toUpperCase(); 
        let status = cellValue === "TRUE"; // Проверяем статус

        records.push({
          full_name: fullName,
          group: "TE21B",
          subject: subject,
          status: status,
          updated_at: new Date().toISOString(),
        });
      }
    });

    // Отправка в Supabase
    const { error } = await supabase
      .from("portfolio_te21b")
      .upsert(records, { onConflict: ["full_name", "subject"] });

    if (error) console.error("Ошибка отправки в Supabase:", error);
    else console.log("Данные успешно обновлены!");
  } catch (err) {
    console.error("Ошибка при получении данных:", err);
  }
}

// Запуск раз в 1 час
setInterval(uploadPortfolioData, 60 * 60 * 1000);
uploadPortfolioData(); // Первый запуск сразу

// Keep-alive сервер
app.get("/", (req, res) => res.send("Server is running"));

app.listen(3000, () => console.log("Server started on port 3000"));

setInterval(() => {
  axios.get(process.env.RENDER_EXTERNAL_URL).catch(() => {});
}, 20000);

app.get("/user-subjects", async (req, res) => {
  const { firstName, lastName } = req.query;

  if (!firstName || !lastName) {
    return res.status(400).json({ error: "Имя и фамилия обязательны" });
  }

  try {
    // Формируем поиск по подстроке
    const searchPattern = `${lastName} ${firstName}`;

    const { data: subjects, error } = await supabase
      .from("portfolio_te21b")
      .select("subject")
      .ilike("full_name", `%${searchPattern}%`) // Ищем подстроку
      .eq("status", true);

    if (error) throw error;

    res.json({ subjects: subjects.map((item) => item.subject) });
  } catch (err) {
    console.error("Ошибка при получении данных:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

