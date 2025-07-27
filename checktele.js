const axios = require("axios");

// Replace with your real bot token
const TELEGRAM_BOT_TOKEN = "8143300137:AAEdaGklGSzlTp8mpZl_IE2Q523d3390iak";

const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`;

async function getChatId() {
  try {
    const response = await axios.get(TELEGRAM_API_URL);
    const updates = response.data.result;

    if (!updates || updates.length === 0) {
      console.log(
        "⚠️ No messages received by the bot yet. Please send a message to your bot on Telegram first."
      );
      return;
    }

    const lastUpdate = updates[updates.length - 1];
    const chatId = lastUpdate.message.chat.id;
    const username = lastUpdate.message.from.username;

    console.log("✅ Found chat ID:");
    console.log(`Chat ID: ${chatId}`);
    console.log(`Telegram Username: @${username}`);
  } catch (err) {
    console.error("❌ Failed to fetch chat ID:", err.message);
  }
}

getChatId();
