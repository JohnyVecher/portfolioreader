require("dotenv").config();
const { google } = require("googleapis");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON),
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});

const sheets = google.sheets({ version: "v4", auth });

async function uploadPortfolioData() {
  try {
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: "ТЕ-21б!A1:L100", // Используем название листа из таблицы
    });

    const [headers, ...rows] = data.values;

    let records = [];

    rows.forEach(row => {
      const fullName = row[1]; // ФИО во 2-й колонке (B)
      for (let i = 2; i < headers.length; i++) {
        let subject = headers[i]; // Название предмета
        let status = row[i] === "✅"; // Если галочка, значит сдано

        records.push({
          full_name: fullName,
          group: "ТЕ-21б",
          subject: subject,
          status: status,
          updated_at: new Date().toISOString(),
        });
      }
    });

    const { error } = await supabase
      .from("portfolio_te21b")
      .upsert(records, { onConflict: ["full_name", "subject"] });

    if (error) console.error("Ошибка отправки в Supabase:", error);
    else console.log("✅ Данные успешно обновлены!");
  } catch (err) {
    console.error("❌ Ошибка при получении данных:", err);
  }
}

uploadPortfolioData(); // Первый запуск сразу

const express = require("express");
const axios = require("axios");

const app = express();
app.get("/", (req, res) => res.send("Server is running"));
app.listen(3000, () => console.log("🚀 Keep-alive server started"));

setInterval(() => {
  axios.get(process.env.RENDER_EXTERNAL_URL).catch(() => {});
}, 20000);
