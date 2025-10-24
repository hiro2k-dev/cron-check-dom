const mongoose = require("mongoose");
require("dotenv").config();

const connectDB = require("./db");
const User = require("./models/User");

(async () => {
  try {
    await connectDB();

    const activeUsers = await User.find({ active: true }).lean();
    const inactiveUsers = await User.find({ active: false }).lean();
    const total = await User.countDocuments();

    console.log("=== User Status Report ===");
    console.log(`Total users in database: ${total}`);
    console.log(`Active users: ${activeUsers.length}`);
    console.log(`Inactive users: ${inactiveUsers.length}`);
    console.log("---------------------------");

    if (activeUsers.length) {
      console.log("Active user list:");
      activeUsers.forEach((u, i) => {
        console.log(
          `${i + 1}. ChatID: ${u.chatId} | Username: ${
            u.username || "-"
          } | Name: ${u.firstName || ""} ${u.lastName || ""}`
        );
      });
    } else {
      console.log("No active users found.");
    }

    await mongoose.connection.close();
    console.log("\n✅ MongoDB connection closed.");
  } catch (err) {
    console.error("❌ Error checking active users:", err.message);
    process.exit(1);
  }
})();
