const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");
const cheerio = require("cheerio");
const cron = require("node-cron");
require("dotenv").config();

const connectDB = require("./db");
const User = require("./models/User");

const URL =
  "https://www.stwdo.de/en/living-houses-application/current-housing-offers";
const LAST_STATUS_FILE = "last_status.txt";
const SEEN_FILE = path.join(__dirname, "last_offers.json");

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TELEGRAM_BOT_TOKEN || !process.env.MONGO_URI) {
  console.error("Missing TELEGRAM_BOT_TOKEN or MONGO_URI");
  process.exit(1);
}

function loadSeen() {
  try {
    return new Set(JSON.parse(fs.readFileSync(SEEN_FILE, "utf8")));
  } catch {
    return null;
  }
}

function saveSeen(ids) {
  fs.writeFileSync(SEEN_FILE, JSON.stringify(ids, null, 2), "utf8");
}

async function scrapeOffers() {
  const res = await axios.get(URL, {
    headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "en" },
    timeout: 15000,
  });
  const $ = cheerio.load(res.data);
  const items = $("#residential-offer-list .grid-item");

  const pick = (c) => {
    const linkPath =
      c.find(".teaser.js-link-area").attr("data-href") ||
      c.find("a.teaser").attr("href") ||
      "";
    const link = linkPath.startsWith("http")
      ? linkPath
      : `https://www.stwdo.de${linkPath}`;

    const title =
      c.find("h5.headline-5").text().trim() ||
      c.find(".teaser__title").text().trim();

    const location =
      c.find(".teaser-header .subheader-5").first().text().trim() ||
      c.find(".teaser__meta span").first().text().trim();

    const facts = {};
    c.find(".residential-offer-card-facts > div").each((_, div) => {
      const k = $(div).find(".subheader-4").text().trim().toLowerCase();
      const v = $(div).find(".headline-4").text().trim();
      if (k) facts[k] = v;
    });

    const area = facts["living space"] || facts["wohnfläche"] || "";

    const price =
      facts["all-inclusive rent"] || facts["rent"] || facts["miete"] || "";

    const available = facts["available from"] || facts["verfügbar ab"] || "";

    const id = crypto
      .createHash("sha256")
      .update((link || title + location).toLowerCase())
      .digest("hex");

    return { id, title, location, link, area, price, available };
  };

  return items.map((_, el) => pick($(el))).get();
}

function mkTextMarkdown(offers) {
  const rows = offers.map((o) => {
    const area = o.area || "-";
    const price = o.price || "-";
    const available = o.available || "-";
    const title = o.title || "Offer";
    const loc = o.location || "-";
    return `🏠 *${title}* (${loc})\n📐 ${area} | 💶 ${price} | 📅 ${available}\n🔗 ${o.link}`;
  });
  const head = `🚨 *[STWDO Housing]* ${offers.length} new offer${
    offers.length > 1 ? "s" : ""
  }:`;
  return `${head}\n\n${rows.join("\n\n")}`;
}

async function sendToUsers(text) {
  const users = await User.find({ active: true }).lean();
  if (!users.length) return;

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  for (const u of users) {
    try {
      await axios.post(url, {
        chat_id: u.chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      });
    } catch (e) {
      const status = e?.response?.status;
      if (status === 403 || status === 401) {
        await User.updateOne({ chatId: u.chatId }, { $set: { active: false } });
      }
    }
  }
}

async function checkHousing() {
  try {
    const offers = await scrapeOffers();
    const hasOffers = offers.length > 0;

    const prev = fs.existsSync(LAST_STATUS_FILE)
      ? fs.readFileSync(LAST_STATUS_FILE, "utf8").trim()
      : "none";
    fs.writeFileSync(LAST_STATUS_FILE, hasOffers ? "yes" : "no", "utf8");

    let seen = loadSeen();
    if (seen === null) {
      saveSeen(offers.map((o) => o.id));
      return;
    }

    const newOffers = offers.filter((o) => !seen.has(o.id));
    if (!newOffers.length) {
      saveSeen(offers.map((o) => o.id));
      return;
    }

    const text = mkTextMarkdown(newOffers);
    await sendToUsers(text);
    saveSeen(offers.map((o) => o.id));
  } catch (err) {
    console.error("checkHousing error:", err.message || err);
  }
}

(async () => {
  await connectDB();
  await checkHousing();
  cron.schedule("*/1 * * * *", () => checkHousing(), {
    timezone: "Europe/Berlin",
  });
})();
