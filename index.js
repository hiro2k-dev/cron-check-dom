const cron = require("node-cron");
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
require("dotenv").config(); // Load .env variables

// === CONFIGURATION ===
const URL =
  "https://www.stwdo.de/en/living-houses-application/current-housing-offers";
const LAST_STATUS_FILE = path.join(__dirname, "last_status.txt");

// Load from environment
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error(
    "❌ Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in .env file."
  );
  process.exit(1);
}

// === MAIN LOGIC ===
async function checkHousing() {
  try {
    const response = await axios.get(URL, {
      headers: { "User-Agent": "Mozilla/5.0 (Node.js script)" },
    });

    const $ = cheerio.load(response.data);
    const offerItems = $("#residential-offer-list .grid-item");
    const timestamp = new Date().toISOString();

    const hasOffers = offerItems.length > 0;

    const lastStatus = fs.existsSync(LAST_STATUS_FILE)
      ? fs.readFileSync(LAST_STATUS_FILE, "utf-8").trim()
      : "none";

    console.log(
      `[${timestamp}] Current: ${
        hasOffers ? "offers available" : "no offers"
      } | Previous: ${lastStatus}`
    );

    if ((lastStatus === "no" || lastStatus === "none") && hasOffers) {
      const offerSummaries = [];

      offerItems.each((i, el) => {
        const container = $(el);
        const title = container.find(".teaser__title").text().trim();
        const location = container
          .find(".teaser__meta > span")
          .first()
          .text()
          .trim();
        const linkPath = container
          .find(".teaser.js-link-area")
          .attr("data-href")
          ?.trim();
        const area = container
          .find('.residential-offer__details dt:contains("Living space") + dd')
          .text()
          .trim();
        const price = container
          .find('.residential-offer__details dt:contains("Rent") + dd')
          .text()
          .trim();
        const available = container
          .find(
            '.residential-offer__details dt:contains("Available from") + dd'
          )
          .text()
          .trim();

        offerSummaries.push(
          `🏠 *${title}* (${location})\n📐 ${area} | 💶 ${price} | 📅 ${available}\n🔗 https://www.stwdo.de${linkPath}`
        );
      });

      const fullMessage = `🚨 *[STWDO Housing]* ${
        offerSummaries.length
      } new offer(s) found:\n\n${offerSummaries.join("\n\n")}`;
      await sendTelegramAlert(fullMessage);
    }

    fs.writeFileSync(LAST_STATUS_FILE, hasOffers ? "yes" : "no");
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error: ${err.message}`);
  }
}

// === TELEGRAM NOTIFICATION ===
async function sendTelegramAlert(message) {
  try {
    await axios.post(TELEGRAM_API_URL, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    });
    console.log(`[${new Date().toISOString()}] ✅ Telegram alert sent.`);
  } catch (err) {
    console.error(
      `[${new Date().toISOString()}] ❌ Failed to send Telegram message: ${
        err.message
      }`
    );
  }
}

// === CRON ENTRY POINT ===
cron.schedule("*/15 * * * *", () => {
  checkHousing();
});
