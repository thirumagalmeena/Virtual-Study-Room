// models/Room.js
const mongoose = require("mongoose");

const RoomSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true }, // 6-8 digit code
  name: { type: String, required: true },
  description: { type: String, default: "" },
  isPrivate: { type: Boolean, default: false },
  // pin will be stored hashed when provided (only for private rooms)
  pin: { type: String },
  capacity: { type: Number, default: 40, min: 1, max: 40 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
}, { timestamps: true });

module.exports = mongoose.model("Room", RoomSchema);
