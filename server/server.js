const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const Message = require("./models/Message");

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
    origin: "http://localhost:5173", 
    methods: ["GET", "POST"],
  },
});

// Track room members: { roomCode: [{ userId, username, online }, ...] }
const roomMembers = {};

// --- Attach Socket.IO middleware for auth ---
io.use((socket, next) => {
  try {
    const { token, username } = socket.handshake.auth;
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = { 
        id: decoded.user?.id || decoded.id, 
        username: decoded.user?.username || decoded.username 
      };
    } else {
      socket.user = { 
        id: socket.id, 
        username: username || "Guest" 
      };
    }
    next();
  } catch (err) {
    console.error("Socket auth error:", err);
    next(new Error("Authentication failed"));
  }
});

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.user.username} (ID: ${socket.user.id})`);

socket.on("join_room", async ({ roomCode }) => {
  if (!socket.rooms.has(roomCode)) {
    socket.join(roomCode);
    
    // Initialize room members array if it doesn't exist
    if (!roomMembers[roomCode]) {
      roomMembers[roomCode] = [];
    }

    // Check if user already exists in the room
    const existingMemberIndex = roomMembers[roomCode].findIndex(
      (m) => m.userId === socket.user.id
    );

    if (existingMemberIndex === -1) {
      // Add new user to room
      roomMembers[roomCode].push({
        userId: socket.user.id,
        username: socket.user.username,
        online: true,
        socketId: socket.id
      });

      console.log(`✅ User ${socket.user.username} JOINED room ${roomCode}`);
      
      // Save system message for new joins
      try {
        const systemMessage = new Message({
          roomCode: roomCode,
          author: "System",
          userId: "system",
          text: `${socket.user.username} joined the room`,
          type: "system"
        });
        await systemMessage.save();
      } catch (err) {
        console.error("Error saving system message:", err);
      }
      
    } else {
      // Update existing user to online
      roomMembers[roomCode][existingMemberIndex].online = true;
      roomMembers[roomCode][existingMemberIndex].socketId = socket.id;
      console.log(`🔄 User ${socket.user.username} RECONNECTED to room ${roomCode}`);
    }

    // Emit updated member list to EVERYONE in the room
    io.to(roomCode).emit("room_members", roomMembers[roomCode]);
    
    // Emit system message for new joins only (not reconnects)
    if (existingMemberIndex === -1) {
      socket.to(roomCode).emit("receive_message", {
        author: "System",
        text: `${socket.user.username} joined the room`,
        time: new Date().toLocaleTimeString(),
        type: "system"
      });
    }

    console.log(`Room ${roomCode} members:`, roomMembers[roomCode].length);
  }
});

  // Updated send_message to save messages to database
  socket.on("send_message", async ({ roomCode, text }) => {
    try {
      const msgData = {
        author: socket.user.username,
        text: text.trim(),
        time: new Date().toLocaleTimeString(),
        userId: socket.user.id,
        timestamp: new Date()
      };
      
      // Save message to database
      const savedMessage = new Message({
        roomCode: roomCode,
        author: socket.user.username,
        userId: socket.user.id,
        text: text.trim(),
        type: "user"
      });
      
      await savedMessage.save();
      
      // Broadcast message to all in the room including sender
      io.to(roomCode).emit("receive_message", msgData);
      
      console.log(`Message from ${socket.user.username} in ${roomCode}: ${text}`);
    } catch (err) {
      console.error("Error saving message:", err);
      // Still emit the message even if save fails
      io.to(roomCode).emit("receive_message", {
        author: socket.user.username,
        text: text.trim(),
        time: new Date().toLocaleTimeString(),
        userId: socket.user.id,
        timestamp: new Date()
      });
    }
  });

socket.on("leave_room", async ({ roomCode }) => {
  try {
    socket.leave(roomCode);

    if (roomMembers[roomCode]) {
      const memberIndex = roomMembers[roomCode].findIndex(
        (m) => m.userId === socket.user.id
      );

      if (memberIndex !== -1) {
        // Remove user completely from room (not just mark offline)
        const leftUser = roomMembers[roomCode].splice(memberIndex, 1)[0];
        
        console.log(`❌ User ${leftUser.username} LEFT room ${roomCode}`);

        // Save system message for user leaving
        try {
          const systemMessage = new Message({
            roomCode: roomCode,
            author: "System",
            userId: "system",
            text: `${leftUser.username} left the room`,
            type: "system"
          });
          await systemMessage.save();
        } catch (err) {
          console.error("Error saving leave message:", err);
        }

        // Emit system message
        socket.to(roomCode).emit("receive_message", {
          author: "System", 
          text: `${leftUser.username} left the room`,
          time: new Date().toLocaleTimeString(),
          type: "system"
        });

        // Emit updated member list to everyone in room
        io.to(roomCode).emit("room_members", roomMembers[roomCode]);
      }

      // Clean up empty rooms
      if (roomMembers[roomCode].length === 0) {
        delete roomMembers[roomCode];
        console.log(`🧹 Room ${roomCode} cleaned up (empty)`);
      }
    }

    console.log(`User ${socket.user.username} left room ${roomCode} - socket only`);
    
  } catch (err) {
    console.error("Error in leave_room:", err);
  }
});

// UPDATE the disconnect handler to save system messages
socket.on("disconnect", async (reason) => {
  console.log(`📵 User disconnected: ${socket.user.username} (${reason})`);

  // Remove user from all rooms they were in
  for (const roomCode in roomMembers) {
    const memberIndex = roomMembers[roomCode].findIndex(
      (m) => m.socketId === socket.id
    );

    if (memberIndex !== -1) {
      const disconnectedUser = roomMembers[roomCode][memberIndex];
      
      // Remove user from socket room
      roomMembers[roomCode].splice(memberIndex, 1);
      
      console.log(`🔴 User ${disconnectedUser.username} DISCONNECTED from room ${roomCode}`);

      // Save system message for disconnect
      try {
        const systemMessage = new Message({
          roomCode: roomCode,
          author: "System",
          userId: "system",
          text: `${disconnectedUser.username} disconnected`,
          type: "system"
        });
        await systemMessage.save();
      } catch (err) {
        console.error("Error saving disconnect message:", err);
      }

      // Notify room
      socket.to(roomCode).emit("receive_message", {
        author: "System",
        text: `${disconnectedUser.username} disconnected`,
        time: new Date().toLocaleTimeString(),
        type: "system"
      });

      // Send updated member list
      io.to(roomCode).emit("room_members", roomMembers[roomCode]);

      // Clean up empty rooms
      if (roomMembers[roomCode].length === 0) {
        delete roomMembers[roomCode];
        console.log(`🧹 Room ${roomCode} cleaned up after disconnect`);
      }
    }
  }
});


  socket.on("typing_start", ({ roomCode }) => {
    socket.to(roomCode).emit("user_typing", {
      username: socket.user.username,
      userId: socket.user.id,
      isTyping: true
    });
  });

  socket.on("typing_stop", ({ roomCode }) => {
    socket.to(roomCode).emit("user_typing", {
      username: socket.user.username,
      userId: socket.user.id,
      isTyping: false
    });
  });

  // File sharing socket events
  socket.on("file_uploaded", ({ roomCode, file }) => {
    // Broadcast to all room members except sender
    socket.to(roomCode).emit("new_file", {
      file,
      uploadedBy: socket.user.username,
      message: `${socket.user.username} shared a file: ${file.originalName}`
    });
  });

  socket.on("file_deleted", ({ roomCode, fileId }) => {
    socket.to(roomCode).emit("file_removed", {
      fileId,
      deletedBy: socket.user.username
    });
  });

  // Error handling
  socket.on("error", (error) => {
    console.error(`Socket error for user ${socket.user.username}:`, error);
  });
});

// API routes
const authRoutes = require("./routes/auth");
app.use("/api/auth", authRoutes);

const roomsRoutes = require("./routes/rooms");
app.use("/api/rooms", roomsRoutes);

// File sharing routes
const filesRoutes = require("./routes/files");
app.use("/api/files", filesRoutes);

// Message history routes
const messagesRoutes = require("./routes/messages");
app.use("/api/messages", messagesRoutes);

// Serve uploaded files statically
app.use("/uploads", express.static("uploads"));

// Optional: Add endpoint to get room stats (for debugging)
app.get("/api/room-stats", (req, res) => {
  const stats = {};
  for (const roomCode in roomMembers) {
    stats[roomCode] = {
      totalMembers: roomMembers[roomCode].length,
      onlineMembers: roomMembers[roomCode].filter(m => m.online).length,
      members: roomMembers[roomCode]
    };
  }
  res.json(stats);
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);