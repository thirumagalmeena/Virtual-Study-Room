// routes/files.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");

// Set storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // folder to save files
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + "_" + file.originalname;
    cb(null, uniqueName);
  },
});

// File filter (images & PDFs)
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|pdf/;
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedTypes.test(ext)) cb(null, true);
  else cb(new Error("Only images and PDFs allowed"));
};

const upload = multer({ 
  storage, 
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

router.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });
  // Send back file info
  res.json({ 
    filename: req.file.filename, 
    originalname: req.file.originalname, 
    path: `uploads/${req.file.filename}` 
  });
});

// Optional: handle multer errors
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // File too large
    return res.status(400).json({ message: err.message });
  } else if (err) {
    return res.status(400).json({ message: err.message });
  }
  next();
});


module.exports = router;