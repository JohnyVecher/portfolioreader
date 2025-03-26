require("dotenv").config();
const { google } = require("googleapis");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Единая настройка CORS
app.use(cors({
  origin: "*",
  methods: "GET,POST",
  allowedHeaders: "Content-Type,Authorization",
}));

// Парсинг JSON (если понадобится для будущих эндпоинтов)
app.use(express.json());

// Чтение учетных данных Google
const credentialsPath = process.env.GOOGLE_CREDENTIALS_JSON;
const credentialsJson = fs.readFileSync(credentialsPath, "utf8");

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(credentialsJson),
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});

const sheets = google.sheets({ version: "v4", auth });

// Функция загрузки данных в Supabase
async function uploadPortfolioData() {
  try {
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: "ТЕ-21б!A1:L100",
    });

    const [headers, ...rows] = data.values;
    const records = [];

    rows.forEach(row => {
      const fullName = row[1];
      for (let i = 2; i < headers.length; i++) {
        const subject = headers[i];
        const cellValue = row[i]?.trim().toUpperCase();
        const status = cellValue === "TRUE";

        records.push({
          full_name: fullName,
          group: "TE21B",
          subject: subject,
          status: status,
          updated_at: new Date().toISOString(),
        });
      }
    });

    const { error } = await supabase
      .from("portfolio_te21b")
      .upsert(records, { onConflict: ["full_name", "subject"] });

    if (error) console.error("Supabase upload error:", error);
    else console.log("Data updated successfully");
  } catch (err) {
    console.error("Google Sheets error:", err);
  }
}

// Запуск обновления данных
setInterval(uploadPortfolioData, 60 * 60 * 1000);
uploadPortfolioData();

// Keep-alive эндпоинт
app.get("/", (req, res) => {
  res.send("Portfolio Reader API is running");
});

// Основной эндпоинт для фронта
app.get("/user-subjects", async (req, res) => {
  try {
    const { firstName, lastName } = req.query;
    
    if (!firstName || !lastName) {
      return res.status(400).json({ error: "Missing name parameters" });
    }

    const searchPattern = `${lastName} ${firstName}`;
    
    const { data: subjects, error } = await supabase
      .from("portfolio_te21b")
      .select("subject")
      .ilike("full_name", `%${searchPattern}%`)
      .eq("status", true);

    if (error) throw error;

    res.json({ 
      success: true,
      subjects: subjects.map(item => item.subject) 
    });
    
  } catch (err) {
    console.error("API Error:", err);
    res.status(500).json({ 
      success: false,
      error: "Internal server error" 
    });
  }
});

// Настройка порта
const PORT = process.env.PORT || 3000;

// Запуск сервера
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
  // Keep-alive для Render
  if (process.env.NODE_ENV === "production") {
    setInterval(() => {
      axios.get(process.env.RENDER_EXTERNAL_URL)
        .catch(error => console.log("Keep-alive ping failed:", error.message));
    }, 20_000);
  }
});