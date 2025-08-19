// middleware/adminAuth.js
const adminAuth = (req, res, next) => {
  try {
    const token = req.header('Authorization');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token, admin authorization denied'
      });
    }

    // Simple token validation (you can make this more secure)
    if (token.startsWith('admin_')) {
      req.admin = { adminId: 'admin', role: 'admin' };
      next();
    } else {
      res.status(401).json({
        success: false,
        message: 'Invalid admin token'
      });
    }
  } catch (err) {
    console.error('Admin auth middleware error:', err);
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

module.exports = adminAuth;
