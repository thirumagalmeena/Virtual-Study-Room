const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const auth = require("../middleware/auth");

const router = express.Router();

// REGISTER
router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Optional: check password length before hashing
    if (password.length < 6) {
      return res.status(400).json({ msg: "Password must be at least 6 characters" });
    }

    // Check if email or username already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });
    if (existingUser) {
      if (existingUser.email === email) return res.status(400).json({ msg: "Email already exists" });
      if (existingUser.username === username) return res.status(400).json({ msg: "Username already exists" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const newUser = new User({ username, email, password: hashedPassword });
    await newUser.save();

    // Generate JWT
    const payload = {
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email,
      },
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "5h" });

    res.json({ token, user: payload.user });
  } catch (err) {
    // Handle duplicate key error from MongoDB (just in case)
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      return res.status(400).json({ msg: `${field} already exists` });
    }
    res.status(500).json({ error: err.message });
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    // Find user by username
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ msg: "User does not exist" });

    // Validate password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: "Invalid credentials" });

    // Generate JWT
    const payload = {
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "5h" });


    res.json({ token, user: payload.user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// PROTECTED ROUTE
router.get("/protected", auth, (req, res) => {
  res.json({
    msg: "You are authorized",
    user: req.user, // contains id, username, email
  });
});

module.exports = router;
