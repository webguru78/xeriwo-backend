// middleware/rateLimiter.js
const rateLimit = require('express-rate-limit');

// Very minimal API rate limiter - only to prevent extreme abuse
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5000, // 5000 requests per 15 minutes (extremely generous)
  message: {
    success: false,
    error: 'Extreme rate limit exceeded',
    message: 'Too many requests detected. Please contact support if this is an error.',
    retryAfter: 900
  },
  standardHeaders: false,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: (req, res) => {
    // Skip rate limiting for successful responses and common endpoints
    return res.statusCode < 400 || req.path.includes('/health') || req.path.includes('/test');
  }
});

// NO download rate limiter - business logic handles this
const noDownloadRateLimit = (req, res, next) => {
  // Pass through - no rate limiting for downloads
  // Download limits are handled by User model business logic
  next();
};

// Minimal auth rate limiter (only for brute force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 auth attempts per 15 minutes (generous for legitimate use)
  message: {
    success: false,
    error: 'Authentication rate limit exceeded',
    message: 'Too many login attempts. Please try again in 15 minutes.',
    retryAfter: 900
  },
  standardHeaders: false,
  legacyHeaders: false,
  skipSuccessfulRequests: true // Don't count successful logins
});

// No rate limiter for other endpoints
const noRateLimit = (req, res, next) => {
  next();
};

module.exports = {
  // Main limiters
  apiLimiter,
  downloadLimiter: noDownloadRateLimit, // NO rate limiting for downloads
  authLimiter,
  dashboardLimiter: noRateLimit, // NO rate limiting for dashboard
  productsLimiter: noRateLimit, // NO rate limiting for products
  
  // Utility functions
  noRateLimit,
  
  // Legacy exports (for backward compatibility)
  apiLimiters: apiLimiter,
  downloadLimiters: noDownloadRateLimit
};
