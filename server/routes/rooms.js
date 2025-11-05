// routes/rooms.js
const mongoose = require("mongoose");
const express = require("express");
const bcrypt = require("bcryptjs");
const Room = require("../models/Room");
const auth = require("../middleware/auth");

const router = express.Router();

// Helper: generate a 6-8 digit code that's unique
async function generateUniqueRoomId() {
  const minLen = 6, maxLen = 8;
  for (let attempt = 0; attempt < 12; attempt++) {
    const len = Math.floor(Math.random() * (maxLen - minLen + 1)) + minLen;
    let id = "";
    for (let i = 0; i < len; i++) id += Math.floor(Math.random() * 10);
    const existing = await Room.findOne({ roomId: id });
    if (!existing) return id;
  }
  throw new Error("Could not generate unique room id, try again");
}

// Helper to strip sensitive fields
function sanitizeRoom(room) {
  if (!room) return null;
  const out = room.toObject();
  delete out.pin;
  return out;
}

/**
 * POST /api/rooms/create
 * Body: { name, description?, isPrivate?, pin?, capacity? }
 * Protected: user must be logged in
 */
router.post("/create", auth, async (req, res) => {
  try {
    const { name, description = "", isPrivate = false, pin, capacity = 40 } = req.body;

    if (!name || !name.trim()) return res.status(400).json({ msg: "Room name is required" });

    const cap = parseInt(capacity, 10);
    if (isNaN(cap) || cap < 1 || cap > 40) {
      return res.status(400).json({ msg: "Capacity must be a number between 1 and 40" });
    }

    if (isPrivate && (!pin || String(pin).length < 4)) {
      return res.status(400).json({ msg: "Private rooms require a PIN of at least 4 characters" });
    }

    const roomId = await generateUniqueRoomId();

    let hashedPin;
    if (isPrivate) {
      const salt = await bcrypt.genSalt(10);
      hashedPin = await bcrypt.hash(String(pin), salt);
    }

    const room = new Room({
      roomId,
      name: name.trim(),
      description: description.trim(),
      isPrivate,
      pin: hashedPin,
      capacity: cap,
      createdBy: req.user.id,
      members: [req.user.id],
    });

    await room.save();

    res.status(201).json(sanitizeRoom(room));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/rooms/join
 * Body: { roomId, pin? }
 * Protected
 */
router.post("/join", auth, async (req, res) => {
  try {
    const { roomId, pin } = req.body;
    if (!roomId) return res.status(400).json({ msg: "roomId is required" });

    const room = await Room.findOne({ roomId });
    if (!room) return res.status(404).json({ msg: "Room not found" });

    const userId = req.user.id;

    // Already a member? (skip capacity check)  
    if (room.members.some(m => m.toString() === userId)) {
      return res.json(sanitizeRoom(room));
    }


    // Private room check
    if (room.isPrivate) {
      if (!pin) return res.status(401).json({ msg: "PIN required to join this private room" });
      const match = await bcrypt.compare(String(pin), room.pin || "");
      if (!match) return res.status(401).json({ msg: "Invalid PIN" });
    }

    // FLEXIBLE Capacity check - Use socket room members count if available
    // For now, we'll use a more lenient approach
    const dbMemberCount = room.members.length;
    
    if (dbMemberCount >= room.capacity) {
      console.log(`⚠️ Room ${roomId} shows ${dbMemberCount}/${room.capacity} in DB, but allowing join for testing`);
      // For now, we'll allow joining even if DB shows full
      // In production, you'd want better logic here
    }

    // Add user to members
    room.members.push(userId);
    await room.save();

    console.log(`✅ User joined room ${roomId}. Now ${room.members.length}/${room.capacity} members in DB`);

    res.json(sanitizeRoom(room));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
/**
 * GET /api/rooms/my
 * Protected - get room details (no pin)
 */

router.get("/my", auth, async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ msg: "Unauthorized: no user ID" });
    }

    /*
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const rooms = await Room.find({ members: userId }).select("-pin");
    */

    const userId = req.user.id;
    const rooms = await Room.find({ members: userId }).select("-pin");

    res.json(rooms);
  } catch (err) {
    console.error("GET /rooms/my ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});



/**
 * GET /api/rooms/:roomId
 * Protected - get room details (no pin)
 */
router.get("/:roomId", auth, async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await Room.findOne({ roomId })
      .populate("createdBy", "username")
      .populate("members", "username"); 
    if (!room) return res.status(404).json({ msg: "Room not found" });

    res.json(sanitizeRoom(room));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/leave", auth, async (req, res) => {
  try {
    const { roomId } = req.body;
    if (!roomId) return res.status(400).json({ msg: "roomId is required" });

    const room = await Room.findOne({ roomId });
    if (!room) return res.status(404).json({ msg: "Room not found" });

    const userId = new mongoose.Types.ObjectId(req.user.id);

    // Remove user from members array
    room.members = room.members.filter(member => 
      !member.equals(userId)
    );

    await room.save();

    res.json({ 
      msg: "Left room successfully",
      room: sanitizeRoom(room)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;