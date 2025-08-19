// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const { apiLimiter } = require('./middleware/rateLimiters'); // Only use minimal API limiter

// Load environment variables
dotenv.config();

const app = express();

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('📁 Created uploads directory');
}

// CORS Configuration
app.use(cors({
  origin: [
    'http://localhost:3000', 
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    process.env.CLIENT_URL
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token', 'X-Requested-With'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset']
}));

// Body parsing middleware
app.use(express.json({ 
  limit: '50mb',
  verify: (req, res, buf, encoding) => {
    try {
      JSON.parse(buf);
    } catch (e) {
      res.status(400).json({ success: false, message: 'Invalid JSON' });
      return;
    }
  }
}));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '1d',
  etag: false
}));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} ${req.method} ${req.originalUrl} - ${req.ip}`);
  next();
});

// Apply ONLY minimal API rate limiter (no download rate limiting)
app.use('/api/', apiLimiter);

// FIXED: MongoDB Connection
const connectDB = async () => {
  try {
    mongoose.set('strictQuery', false);
    
    const mongooseOptions = {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 5,
      maxIdleTimeMS: 30000,
      family: 4,
    };

    console.log('🔄 Connecting to MongoDB...');
    console.log(`📍 URI: ${process.env.MONGODB_URI ? process.env.MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@') : 'Not provided'}`);

    const conn = await mongoose.connect(process.env.MONGODB_URI, mongooseOptions);

    console.log('✅ MongoDB Connected Successfully');
    console.log(`📊 Database: ${conn.connection.name}`);
    console.log(`🔗 Host: ${conn.connection.host}:${conn.connection.port}`);
    
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err.message);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB disconnected');
    });
    
    mongoose.connection.on('reconnected', () => {
      console.log('🔄 MongoDB reconnected successfully');
    });

  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.log('❌ Database connection failed. Server will start without database.');
    mongoose.connection.readyState = 0;
  }
};

// Initialize database connection
connectDB();

// Health check endpoint
app.get('/api/health', (req, res) => {
  const uptime = process.uptime();
  const memory = process.memoryUsage();
  
  res.json({
    success: true,
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: {
      status: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
      readyState: mongoose.connection.readyState,
    },
    server: {
      uptime: `${Math.floor(uptime / 60)} minutes`,
      memory: {
        used: `${Math.round(memory.heapUsed / 1024 / 1024)} MB`,
        total: `${Math.round(memory.heapTotal / 1024 / 1024)} MB`
      }
    }
  });
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: '🎉 API is working correctly!',
    timestamp: new Date().toISOString(),
    database: {
      status: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    }
  });
});

// Load routes function
const loadRoute = (routePath, mountPath, middleware = null, routeName) => {
  try {
    const fullPath = path.join(__dirname, routePath);
    if (!fs.existsSync(fullPath + '.js')) {
      console.warn(`⚠️  Route file not found: ${fullPath}.js`);
      createFallbackRoute(mountPath, routeName);
      return false;
    }

    const route = require(routePath);
    
    if (typeof route !== 'function') {
      throw new Error(`Route ${routePath} does not export a valid router`);
    }

    if (middleware) {
      app.use(mountPath, middleware, route);
    } else {
      app.use(mountPath, route);
    }
    
    console.log(`✅ Route loaded: ${routeName || routePath} -> ${mountPath}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to load route ${routePath}:`, error.message);
    createFallbackRoute(mountPath, routeName);
    return false;
  }
};

// Create fallback route
const createFallbackRoute = (mountPath, routeName) => {
  app.use(mountPath, (req, res) => {
    console.warn(`⚠️  Fallback route accessed: ${req.method} ${req.originalUrl}`);
    res.status(503).json({ 
      success: false,
      error: 'Service Unavailable',
      message: `${routeName || mountPath} service is currently unavailable`,
      path: req.originalUrl,
      method: req.method
    });
  });
  console.log(`🔄 Created fallback route for ${mountPath}`);
};

// Load all routes WITHOUT rate limiting
console.log('\n📡 Loading API routes...');

// Core routes (NO rate limiting - business logic handles limits)
loadRoute('./routes/auth', '/api/auth', null, 'Authentication');
loadRoute('./routes/products', '/api/products', null, 'Products');
loadRoute('./routes/user', '/api/user', null, 'User Management');

// Download route WITHOUT rate limiting - business logic handles 15/day limit
loadRoute('./routes/download', '/api/download', null, 'Downloads');

// Optional routes
loadRoute('./routes/admin', '/api/admin', null, 'Admin Panel');
loadRoute('./routes/chatbot', '/api/chatbot', null, 'Chatbot');

console.log('📡 Route loading completed\n');

// Error handling middleware
app.use((err, req, res, next) => {
  const timestamp = new Date().toISOString();
  console.error(`🚨 ${timestamp} Global Error [${req.method} ${req.originalUrl}]:`, err.message);
  
  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({
      success: false,
      error: 'Validation Error',
      message: errors.join(', ')
    });
  }
  
  // Mongoose cast error
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: 'Invalid ID Format',
      message: `Invalid ${err.path}: ${err.value}`
    });
  }
  
  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    const value = (err.keyValue || {})[field] || 'unknown';
    return res.status(400).json({
      success: false,
      error: 'Duplicate Entry',
      message: `${field} '${value}' already exists`
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'Invalid Token',
      message: 'Authentication token is invalid'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: 'Token Expired',
      message: 'Authentication token has expired'
    });
  }

  // Database connection error
  if (err.name === 'MongooseError' || err.name === 'MongoError') {
    return res.status(503).json({
      success: false,
      error: 'Database Error',
      message: 'Database is temporarily unavailable. Please try again later.'
    });
  }

  // Default server error
  res.status(err.status || 500).json({
    success: false,
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' 
      ? err.message 
      : 'Something went wrong on our end. Please try again later.'
  });
});

// 404 handler
app.all('*', (req, res) => {
  console.warn(`❌ 404 Error: ${req.method} ${req.originalUrl} from ${req.ip}`);
  
  res.status(404).json({
    success: false,
    error: 'Route Not Found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('\n' + '='.repeat(70));
  console.log('🚀 SERVER STARTED SUCCESSFULLY!');
  console.log('='.repeat(70));
  console.log(`📡 Port: ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Server URL: http://localhost:${PORT}`);
  console.log(`📊 MongoDB: ${mongoose.connection.readyState === 1 ? 'Connected ✅' : 'Disconnected ❌'}`);
  console.log(`💾 Download Limit: 15/day (resets every 24 hours automatically)`);
  console.log(`⚡ Rate Limiting: MINIMAL (only extreme abuse prevention)`);
  console.log('='.repeat(70));
  console.log('📚 Available Endpoints:');
  console.log('   🔐 Auth: /api/auth/* (login, register, verify-otp)');
  console.log('   📦 Products: /api/products/* (list, create, update, delete)');
  console.log('   👤 User: /api/user/* (stats, profile)');
  console.log('   📥 Downloads: /api/download/* (NO rate limiting - business logic only)');
  console.log('   🛠️  Admin: /api/admin/* (dashboard, management)');
  console.log('   ❤️  Health: /api/health (server status)');
  console.log('   🧪 Test: /api/test (connectivity test)');
  console.log('='.repeat(70));

  if (mongoose.connection.readyState !== 1) {
    console.warn('⚠️  Warning: MongoDB not connected. Some features may not work.');
  } else {
    console.log('✅ All systems operational!');
  }
  console.log('');
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`\n👋 ${signal} received. Starting graceful shutdown...`);
  
  server.close((err) => {
    if (err) {
      console.error('❌ Error during server shutdown:', err);
      return process.exit(1);
    }
    
    console.log('🔌 HTTP server closed');
    
    if (mongoose.connection.readyState === 1) {
      mongoose.connection.close(false, (err) => {
        if (err) {
          console.error('❌ Error during MongoDB shutdown:', err);
          return process.exit(1);
        }
        
        console.log('📊 MongoDB connection closed');
        console.log('✅ Graceful shutdown completed');
        process.exit(0);
      });
    } else {
      console.log('📊 MongoDB was not connected');
      console.log('✅ Graceful shutdown completed');
      process.exit(0);
    }
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('❌ Forced shutdown - could not close connections gracefully');
    process.exit(1);
  }, 10000);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (err, promise) => {
  console.error('❌ Unhandled Promise Rejection:', err.message);
  
  if (process.env.NODE_ENV === 'production') {
    console.log('🚨 Production environment - shutting down gracefully');
    gracefulShutdown('UNHANDLED_REJECTION');
  } else {
    console.log('🔄 Development environment - server will continue running');
  }
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err.message);
  console.log('🚨 This is a critical error. Shutting down...');
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

module.exports = app;
