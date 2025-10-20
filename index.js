const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");
const cheerio = require("cheerio");
const cron = require("node-cron");
require("dotenv").config();

const URL =
  "https://www.stwdo.de/en/living-houses-application/current-housing-offers";
const LAST_STATUS_FILE = "last_status.txt";
const SEEN_FILE = path.join(__dirname, "last_offers.json");

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const logger = {
  _ts: () => new Date().toISOString(),
  info: (...args) => console.log(`[${new Date().toISOString()}] [INFO]`, ...args),
  warn: (...args) => console.warn(`[${new Date().toISOString()}] [WARN]`, ...args),
  error: (...args) => console.error(`[${new Date().toISOString()}] [ERROR]`, ...args),
  debug: (...args) => console.debug(`[${new Date().toISOString()}] [DEBUG]`, ...args),
};

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  logger.error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
  process.exit(1);
}

async function checkHousing() {
  logger.info("Starting checkHousing run");
  logger.debug("Target URL:", URL);

  try {
    logger.debug("Fetching URL...");
    const response = await axios.get(URL, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
      validateStatus: (s) => s >= 200 && s < 400,
    });
    logger.info("Fetched page", "status:", response.status);

    const html = response.data;
    const $ = cheerio.load(html);
    const offerItems = $("#residential-offer-list .grid-item");
    const hasOffers = offerItems.length > 0;
    logger.info("Parsed offers count:", offerItems.length);

    const seen = (() => {
      try {
        const raw = fs.readFileSync(SEEN_FILE, "utf8");
        const parsed = JSON.parse(raw);
        logger.debug("Read seen file", SEEN_FILE, "entries:", parsed.length);
        return new Set(parsed);
      } catch (err) {
        logger.warn("No seen file or failed to read/parse seen file:", err.message);
        return null;
      }
    })();

    const pick = (c) => {
      const title = c.find(".teaser__title").text().trim();
      const location = c.find(".teaser__meta span").first().text().trim();
      const linkPath =
        c.find(".teaser.js-link-area").attr("data-href") ||
        c.find("a.teaser").attr("href") ||
        "";
      const link = linkPath.startsWith("http")
        ? linkPath
        : `https://www.stwdo.de${linkPath}`;
      const id = crypto
        .createHash("sha256")
        .update((link || title + location).toLowerCase())
        .digest("hex");
      return { id, title, location, link, container: c };
    };

    const offers = offerItems.map((_, el) => pick($(el))).get();
    logger.debug("Collected offer ids:", offers.map((o) => o.id).slice(0, 20));

    const prev = fs.existsSync(LAST_STATUS_FILE)
      ? fs.readFileSync(LAST_STATUS_FILE, "utf8").trim()
      : "none";
    logger.info("Previous last status:", prev);

    fs.writeFileSync(LAST_STATUS_FILE, hasOffers ? "yes" : "no", "utf8");
    logger.info("Wrote last status:", hasOffers ? "yes" : "no");

    if (seen === null) {
      logger.info("Initializing seen file with current offer ids");
      fs.writeFileSync(
        SEEN_FILE,
        JSON.stringify(
          offers.map((o) => o.id),
          null,
          2
        ),
        "utf8"
      );
      logger.debug("Wrote seen file entries:", offers.length);
      return;
    }

    const seenSet = new Set(seen);
    const newOffers = offers.filter((o) => !seenSet.has(o.id));
    logger.info("New offers found:", newOffers.length);

    if (!newOffers.length) {
      logger.info("No new offers. Updating seen file with current offers.");
      fs.writeFileSync(
        SEEN_FILE,
        JSON.stringify(
          offers.map((o) => o.id),
          null,
          2
        ),
        "utf8"
      );
      logger.debug("Wrote seen file entries:", offers.length);
      return;
    }

    const mk = (o) => {
      const c = o.container;
      const area =
        c.find('dt:contains("Living space") + dd').text().trim() ||
        c.find('dt:contains("Wohnfläche") + dd').text().trim();
      const price =
        c.find('dt:contains("Rent") + dd').text().trim() ||
        c.find('dt:contains("Miete") + dd').text().trim();
      const available =
        c.find('dt:contains("Available from") + dd').text().trim() ||
        c.find('dt:contains("Verfügbar ab") + dd').text().trim();
      return `🏠 *${o.title || "Offer"}* (${o.location || "-"})\n📐 ${
        area || "-"
      } | 💶 ${price || "-"} | 📅 ${available || "-"}\n🔗 ${o.link}`;
    };

    newOffers.forEach((o, idx) =>
      logger.info(`New offer #${idx + 1}: id=${o.id}, title="${o.title}", link=${o.link}`)
    );

    const body = newOffers.map(mk).join("\n\n");

    try {
      logger.info("Sending Telegram message with", newOffers.length, "new offers");
      const resp = await axios.post(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          chat_id: TELEGRAM_CHAT_ID,
          text: `🚨 *[STWDO Housing]* ${newOffers.length} new offer${
            newOffers.length > 1 ? "s" : ""
          }:\n\n${body}`,
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        },
        { timeout: 15000 }
      );
      logger.info("Telegram API response status:", resp.status);
      if (resp.data && resp.data.ok === false) {
        logger.warn("Telegram API returned ok=false:", resp.data);
      } else {
        logger.debug("Telegram API response data:", resp.data && resp.data.result ? "result present" : resp.data);
      }
    } catch (telErr) {
      logger.error("Failed to send Telegram message:", telErr.stack || telErr.message || telErr);
    }

    fs.writeFileSync(
      SEEN_FILE,
      JSON.stringify(
        offers.map((o) => o.id),
        null,
        2
      ),
      "utf8"
    );
    logger.info("Updated seen file after processing new offers");
  } catch (error) {
    logger.error("Error checking housing offers:", error.stack || error.message || error);
  }
}

(async () => {
  logger.info("Initial run");
  await checkHousing();
})();

cron.schedule("*/1 * * * *", () => {
  logger.info("Scheduled run triggered");
  checkHousing();
}, {
  timezone: "Europe/Berlin",
});

logger.info("Cron scheduled: every minute (Europe/Berlin)");
