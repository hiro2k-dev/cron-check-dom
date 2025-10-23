const axios = require("axios");
require("dotenv").config();

const connectDB = require("./db");
const User = require("./models/User");

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TELEGRAM_BOT_TOKEN || !process.env.MONGO_URI) {
  console.error("Missing TELEGRAM_BOT_TOKEN or MONGO_URI");
  process.exit(1);
}

let pollOffset = 0;

async function pollTelegram() {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`;
  try {
    const { data } = await axios.get(url, {
      params: { timeout: 25, offset: pollOffset + 1 },
    });
    const updates = data?.result || [];
    console.log(`Received ${updates.length} updates from Telegram`);
    for (const up of updates) {
      pollOffset = Math.max(pollOffset, up.update_id || 0);
      const msg = up.message || up.edited_message || up.channel_post;
      if (!msg) continue;
      const chat = msg.chat;
      const text = (msg.text || "").trim();
      console.log(`Processing message from chat ${chat.id}:`, text);

      if (text === "/start" || text.startsWith("/start ")) {
        const chatId = String(chat.id);
        await User.updateOne(
          { chatId },
          {
            $setOnInsert: { chatId },
            $set: {
              active: true,
              username: chat.username || undefined,
              firstName: chat.first_name || undefined,
              lastName: chat.last_name || undefined,
            },
          },
          { upsert: true }
        );
        await axios.post(
          `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            chat_id: chatId,
            text:
              "Hello! This is helper bot developed by Hiro to notify you about new dormitory listings at TU Dortmund.\n\n" +
              "Please note that this bot *DOES NOT* register or apply on your behalf. It only reminds you when new housing offers appear on the Studierendenwerk Dortmund website.\n\n" +
              "You must still submit your dorm application manually. This reminder system exists to make it easier for everyone to stay informed — and to ensure fairness in the housing process.",
            parse_mode: "Markdown",
          }
        );
        await axios.post(
          `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            chat_id: chatId,
            text:
              "✅ Subscribed. You will receive new housing offers.\n\n" +
              "If you wish to stop receiving notifications, type /stop.",
          }
        );
      }

      if (text === "/stop") {
        const chatId = String(chat.id);
        await User.updateOne({ chatId }, { $set: { active: false } });
        await axios.post(
          `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            chat_id: chatId,
            text: "🛑 Unsubscribed. Send /start to subscribe again.",
          }
        );
      }
    }
  } catch (_) {}
}

(async () => {
  await connectDB();
  setInterval(pollTelegram, 3000);
})();
