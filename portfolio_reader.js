require("dotenv").config();
const { google } = require("googleapis");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");

// Подключаем Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Авторизация в Google Sheets API
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS),
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});


const sheets = google.sheets({ version: "v4", auth });

// Функция для загрузки данных в Supabase
async function uploadPortfolioData() {
  try {
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: "TE21B!A1:L100", // Диапазон данных (зависит от таблицы)
    });

    const [headers, ...rows] = data.values;

    let records = [];

    rows.forEach(row => {
      const fullName = row[1]; // ФИО
      for (let i = 2; i < headers.length; i++) {
        let subject = headers[i]; // Название предмета
        let status = row[i] === "✅"; // Если галочка, значит сдано

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

const express = require("express");
const app = express();

app.get("/", (req, res) => res.send("Server is running"));

app.listen(3000, () => console.log("Keep-alive server is running"));

// Пинг каждые 20 секунд
setInterval(() => {
  require("axios").get(process.env.RENDER_EXTERNAL_URL).catch(() => {});
}, 20000);
