const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// Test route
app.get("/", (req, res) => {
  res.send("Server is running...");
});

// MongoDB connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Create HTTP server
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173", // Frontend
    methods: ["GET", "POST"],
  },
});

// Socket.IO middleware for auth
io.use((socket, next) => {
  try {
    const { token, username } = socket.handshake.auth;
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = { id: decoded.user.id, username: decoded.user.username };
    } else {
      socket.user = { id: socket.id, username: username || "Guest" }; // Fallback: use socket.id as userId
    }
    next();
  } catch (err) {
    next(new Error("Authentication failed"));
  }
});

// Track room members: { roomCode: [{ userId, username, online }, ...] }
const roomMembers = {};

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.user.username}`);

  // Handle join_room
  socket.on("join_room", ({ roomCode }) => {
    socket.join(roomCode);

    // Initialize room members array if it doesn't exist
    if (!roomMembers[roomCode]) {
      roomMembers[roomCode] = [];
    }

    // Check if user already exists in the room
    const existing = roomMembers[roomCode].find((m) => m.userId === socket.user.id);
    if (existing) {
      existing.online = true; // Mark as online
    } else {
      // Add new user
      roomMembers[roomCode].push({
        userId: socket.user.id,
        username: socket.user.username,
        online: true,
      });
      // Emit system message for new join
      socket.to(roomCode).emit("receive_message", {
        author: "System",
        text: `${socket.user.username} joined the room`,
        time: new Date().toLocaleTimeString(),
      });
    }

    // Emit updated member list to the room
    io.to(roomCode).emit("room_members", roomMembers[roomCode]);
  });

  // Handle send_message
  socket.on("send_message", ({ roomCode, text }) => {
    const msg = {
      author: socket.user.username,
      text,
      time: new Date().toLocaleTimeString(),
    };
    io.to(roomCode).emit("receive_message", msg);
  });

  // Handle leave_room
  socket.on("leave_room", ({ roomCode }) => {
    socket.leave(roomCode);

    if (roomMembers[roomCode]) {
      const member = roomMembers[roomCode].find((m) => m.userId === socket.user.id);
      if (member) {
        member.online = false; // Mark as offline
        io.to(roomCode).emit("room_members", roomMembers[roomCode]);
        socket.to(roomCode).emit("receive_message", {
          author: "System",
          text: `${socket.user.username} left the room`,
          time: new Date().toLocaleTimeString(),
        });
      }
    }
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    for (const roomCode in roomMembers) {
      const member = roomMembers[roomCode].find((m) => m.userId === socket.user.id);
      if (member) {
        member.online = false; // Mark as offline
        io.to(roomCode).emit("room_members", roomMembers[roomCode]);
      }
    }
    console.log(`${socket.user.username} disconnected`);
  });
});

// Routes
const authRoutes = require("./routes/auth");
app.use("/api/auth", authRoutes);

const roomsRoutes = require("./routes/rooms");
app.use("/api/rooms", roomsRoutes);

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);