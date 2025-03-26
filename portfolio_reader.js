require("dotenv").config();
const { google } = require("googleapis");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const morgan = require("morgan"); // Добавляем логирование запросов

const app = express();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 1. Middleware Configuration
app.use(morgan("dev")); // Логирование всех запросов
app.use(cors({
  origin: "*",
  methods: "GET,POST",
  allowedHeaders: "Content-Type,Authorization",
}));
app.use(express.json());

// 2. Google Sheets Authentication
try {
  const credentialsPath = process.env.GOOGLE_CREDENTIALS_JSON;
  const credentialsJson = fs.readFileSync(credentialsPath, "utf8");
  
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(credentialsJson),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });
} catch (error) {
  console.error("FATAL ERROR: Google Auth failed:", error.message);
  process.exit(1);
}

// 3. Data Sync Functions
async function uploadPortfolioData() {
  try {
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: "ТЕ-21б!A1:L100",
    });

    const [headers, ...rows] = data.values;
    const records = [];

    rows.forEach(row => {
      const fullName = row[1]?.trim();
      if (!fullName) return;

      for (let i = 2; i < headers.length; i++) {
        const subject = headers[i]?.trim();
        const cellValue = row[i]?.trim().toUpperCase();
        const status = cellValue === "TRUE";

        if (subject) {
          records.push({
            full_name: fullName,
            group: "TE21B",
            subject: subject,
            status: status,
            updated_at: new Date().toISOString(),
          });
        }
      }
    });

    const { error } = await supabase
      .from("portfolio_te21b")
      .upsert(records, { onConflict: ["full_name", "subject"] });

    if (error) {
      console.error("Supabase upload error:", error);
    } else {
      console.log(`Data updated successfully (${records.length} records)`);
    }
  } catch (err) {
    console.error("Google Sheets sync error:", err.message);
  }
}

// 4. Endpoints
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version
  });
});

app.get("/user-subjects", async (req, res) => {
  try {
    const { firstName, lastName } = req.query;
    console.log("Request received:", { firstName, lastName });

    if (!firstName || !lastName) {
      return res.status(400).json({
        success: false,
        error: "Параметры firstName и lastName обязательны"
      });
    }

    const searchPattern = `${lastName.trim()} ${firstName.trim()}`;
    console.log("Search pattern:", searchPattern);

    const { data, error } = await supabase
      .from("portfolio_te21b")
      .select("subject")
      .ilike("full_name", `%${searchPattern}%`)
      .eq("status", true);

    if (error) {
      console.error("Supabase error:", error);
      return res.status(500).json({
        success: false,
        error: "Ошибка базы данных"
      });
    }

    console.log("Found subjects:", data);
    res.json({
      success: true,
      subjects: data.map(item => item.subject) 
    });
    
  } catch (err) {
    console.error("API Error:", err.stack);
    res.status(500).json({ 
      success: false,
      error: "Внутренняя ошибка сервера" 
    });
  }
});

// 5. Server Initialization
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
  // Initial data sync
  uploadPortfolioData();
  
  // Scheduled sync
  setInterval(uploadPortfolioData, 60 * 60 * 1000);

  // Keep-alive for Render
  if (process.env.NODE_ENV === "production") {
    setInterval(() => {
      axios.get(process.env.RENDER_EXTERNAL_URL)
        .catch(error => console.log("Keep-alive ping failed:", error.message));
    }, 20_000);
  }
});

// 6. Error Handling
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  server.close(() => process.exit(1));
});