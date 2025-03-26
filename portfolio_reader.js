require("dotenv").config();
const { google } = require("googleapis");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const morgan = require("morgan");

const app = express();

// Объявляем переменные в глобальной области видимости
let supabase;
let sheets;

async function initializeServices() {
  try {
    // 1. Инициализация Supabase
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

    // 2. Инициализация Google Sheets
    const credentialsPath = process.env.GOOGLE_CREDENTIALS_JSON;
    const credentialsJson = fs.readFileSync(credentialsPath, "utf8");
    
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(credentialsJson),
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    sheets = google.sheets({ version: "v4", auth });

    // Проверка подключения
    await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: "ТЕ-21б!A1:A1",
    });

    console.log("✅ Services initialized successfully");
  } catch (error) {
    console.error("🔥 Failed to initialize services:", error.message);
    process.exit(1);
  }
}

// Middleware
app.use(morgan("dev"));
app.use(cors({
  origin: "*",
  methods: "GET,POST",
  allowedHeaders: "Content-Type,Authorization",
}));
app.use(express.json());

// Функция синхронизации данных
async function uploadPortfolioData() {
  try {
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: "ТЕ-21б!A1:L100",
    });

    // ... остальная часть функции без изменений ...
  } catch (err) {
    console.error("Google Sheets sync error:", err.message);
  }
}

// Эндпоинты
app.get("/user-subjects", async (req, res) => {
  // ... реализация эндпоинта ...
});

// Инициализация и запуск сервера
async function startServer() {
  try {
    await initializeServices();
    
    const PORT = process.env.PORT || 3000;
    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      
      // Начальная синхронизация
      uploadPortfolioData();
      
      // Периодическая синхронизация
      setInterval(uploadPortfolioData, 60 * 60 * 1000);
    });

  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();