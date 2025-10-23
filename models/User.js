const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    chatId: { type: String, unique: true, index: true, required: true },
    username: String,
    firstName: String,
    lastName: String,
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);
