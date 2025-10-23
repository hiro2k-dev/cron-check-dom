const axios = require("axios");
require("dotenv").config();

const connectDB = require("./db");
const User = require("./models/User");

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TELEGRAM_BOT_TOKEN || !process.env.MONGO_URI) {
  console.error("❌ Missing TELEGRAM_BOT_TOKEN or MONGO_URI");
  process.exit(1);
}

let pollOffset = 0;

async function sendMessage(chatId, text, parseMode = null) {
  try {
    const payload = { chat_id: chatId, text };
    if (parseMode) payload.parse_mode = parseMode;
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      payload
    );
    console.log(`✅ Message sent to chat ${chatId}`);
  } catch (err) {
    console.error(`⚠️ Failed to send message to chat ${chatId}:`, err.message);
  }
}

async function handleStartCommand(chat) {
  const chatId = String(chat.id);
  try {
    console.log(`🟢 /start received from chat ${chatId}`);
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

    await sendMessage(
      chatId,
      "👋 Hello! This is *Hiro*, a helper bot developed by Hiro to notify you about new dormitory listings at TU Dortmund.\n\n" +
        "Please note that this bot *DOES NOT* register or apply on your behalf. It only reminds you when new housing offers appear on the Studierendenwerk Dortmund website.\n\n" +
        "You must still submit your dorm application manually. This reminder system exists to make it easier for everyone to stay informed — and to ensure fairness in the housing process.",
      "Markdown"
    );

    await sendMessage(
      chatId,
      "✅ Subscribed. You will receive new housing offers.\n\nIf you wish to stop receiving notifications, type /stop."
    );
  } catch (err) {
    console.error(`❌ Error handling /start for chat ${chatId}:`, err.message);
    await sendMessage(
      chatId,
      "⚠️ Sorry, something went wrong while processing your subscription. Please try again later."
    );
  }
}

async function handleStopCommand(chat) {
  const chatId = String(chat.id);
  try {
    console.log(`🔴 /stop received from chat ${chatId}`);
    await User.updateOne({ chatId }, { $set: { active: false } });
    await sendMessage(
      chatId,
      "🛑 Unsubscribed. Send /start to subscribe again."
    );
  } catch (err) {
    console.error(`❌ Error handling /stop for chat ${chatId}:`, err.message);
    await sendMessage(
      chatId,
      "⚠️ Failed to unsubscribe. Please try again later."
    );
  }
}

async function pollTelegram() {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`;
  try {
    const { data } = await axios.get(url, {
      params: { timeout: 25, offset: pollOffset + 1 },
    });

    const updates = data?.result || [];
    if (updates.length > 0) {
      console.log(`📩 Received ${updates.length} update(s) from Telegram`);
    }

    for (const up of updates) {
      pollOffset = Math.max(pollOffset, up.update_id || 0);
      const msg = up.message || up.edited_message || up.channel_post;
      if (!msg) continue;

      const chat = msg.chat;
      const text = (msg.text || "").trim();
      console.log(`➡️ Message from chat ${chat.id}: "${text}"`);

      if (text === "/start" || text.startsWith("/start ")) {
        await handleStartCommand(chat);
      } else if (text === "/stop") {
        await handleStopCommand(chat);
      } else {
        await sendMessage(
          chat.id,
          "🤖 Unknown command. Type /start to subscribe or /stop to unsubscribe."
        );
      }
    }
  } catch (err) {
    console.error("⚠️ Telegram polling error:", err.message);
  }
}

(async () => {
  try {
    await connectDB();
    console.log("✅ Database connected successfully");
    console.log("🚀 Bot polling started...");
    setInterval(pollTelegram, 3000);
  } catch (err) {
    console.error("❌ Fatal error initializing bot:", err.message);
    process.exit(1);
  }
})();
