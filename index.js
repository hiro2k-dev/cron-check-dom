// checkHousingCron.js
const cron = require('node-cron');
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
require('dotenv').config(); // Load .env variables

// === CONFIGURATION ===
const URL =
  "https://www.stwdo.de/en/living-houses-application/current-housing-offers";
const LAST_STATUS_FILE = path.join(__dirname, "last_status.txt");

// Load from environment
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error("❌ Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in .env file.");
  process.exit(1);
}

// === MAIN LOGIC ===
async function checkHousing() {
  try {
    const response = await axios.get(URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Node.js script)",
      },
    });

    const $ = cheerio.load(response.data);
    const notificationText = $(".notification__header").text().trim();
    const timestamp = new Date().toISOString();

    const hasOffers = notificationText !== "No results";

    const lastStatus = fs.existsSync(LAST_STATUS_FILE)
      ? fs.readFileSync(LAST_STATUS_FILE, "utf-8").trim()
      : "none";

    // Log status to console
    console.log(
      `[${timestamp}] Current: ${
        hasOffers ? "offers available" : "no offers"
      } | Previous: ${lastStatus}`
    );

    // Trigger notification if status changes from 'no' to 'yes'
    if ((lastStatus === "no" || lastStatus === "none") && hasOffers) {
      await sendTelegramAlert();
    }

    // Save current status
    fs.writeFileSync(LAST_STATUS_FILE, hasOffers ? "yes" : "no");
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error: ${err.message}`);
  }
}

// === TELEGRAM NOTIFICATION ===
async function sendTelegramAlert() {
  const message = `🚨 [STWDO Housing] New room offers may be available!\nCheck: ${URL}`;
  try {
    await axios.post(TELEGRAM_API_URL, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: "Markdown",
    });
    console.log(`[${new Date().toISOString()}] ✅ Telegram alert sent.`);
  } catch (err) {
    console.error(
      `[${new Date().toISOString()}] ❌ Failed to send Telegram message: ${err.message}`
    );
  }
}

// === ENTRY POINT ===
cron.schedule("*/15 * * * *", () => {
  checkHousing();
});
