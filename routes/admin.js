const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

// Admin middleware
const adminAuth = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin rights required.'
    });
  }
  next();
};

// Get admin dashboard
router.get('/dashboard', auth, adminAuth, async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Admin dashboard endpoint working',
      totalDownloads: 0 // Placeholder value
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Get all users
router.get('/users', auth, adminAuth, async (req, res) => {
  try {
    res.json({
      success: true,
      users: [] // Placeholder array
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

module.exports = router;
