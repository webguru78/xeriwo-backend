// routes/auth.js
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// Email configuration - FIXED
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // Use TLS
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: false
    },
    debug: true, // Enable debug
    logger: true // Enable logging
  });
};

// Initialize transporter
let transporter;

const initializeEmail = async () => {
  try {
    transporter = createTransporter();
    await transporter.verify();
    console.log('✅ Email server is ready');
    console.log(`📧 Email configured for: ${process.env.EMAIL_USER}`);
    console.log(`📨 Admin email: ${process.env.ADMIN_EMAIL}`);
  } catch (error) {
    console.error('❌ Email configuration error:', error.message);
    console.log('💡 Please check your Gmail App Password');
    console.log('📝 Make sure 2-Factor Authentication is enabled');
    console.log('🔑 Generate App Password from: https://myaccount.google.com/apppasswords');
    
    // Still create transporter even if verification fails
    transporter = createTransporter();
  }
};

// Initialize email on startup
initializeEmail();

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// Generate OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send email with retry logic
const sendEmailWithRetry = async (mailOptions, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`📤 Sending email attempt ${i + 1}...`);
      const info = await transporter.sendMail(mailOptions);
      console.log(`✅ Email sent successfully: ${info.messageId}`);
      return info;
    } catch (error) {
      console.error(`❌ Email attempt ${i + 1} failed:`, error.message);
      
      if (i === retries - 1) {
        console.error('❌ All email attempts failed');
        throw error;
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
};

// Helper function to send OTP to admin
const sendOTPToAdmin = async (user, otp) => {
  const mailOptions = {
    from: `"${process.env.COMPANY_NAME || 'EnvatoClone'}" <${process.env.EMAIL_USER}>`,
    to: process.env.ADMIN_EMAIL,
    subject: `🔐 ${process.env.COMPANY_NAME || 'EnvatoClone'} - New User Registration OTP`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>New User Registration OTP</title>
        <style>
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            background-color: #f4f4f4; 
            margin: 0; 
            padding: 20px; 
          }
          .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background: white; 
            border-radius: 15px; 
            overflow: hidden; 
            box-shadow: 0 10px 30px rgba(0,0,0,0.1); 
          }
          .header { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            color: white; 
            padding: 30px; 
            text-align: center; 
          }
          .header h1 { 
            margin: 0; 
            font-size: 28px; 
            font-weight: 700;
          }
          .content { 
            padding: 40px 30px; 
          }
          .otp-container {
            text-align: center;
            margin: 30px 0;
          }
          .otp-code { 
            font-size: 48px; 
            font-weight: 900; 
            color: #667eea; 
            background: linear-gradient(45deg, #f0f2f5, #ffffff);
            padding: 25px 40px; 
            border: 3px solid #667eea; 
            border-radius: 15px;
            letter-spacing: 8px;
            display: inline-block;
            box-shadow: 0 5px 15px rgba(102, 126, 234, 0.2);
          }
          .user-info { 
            background: linear-gradient(135deg, #e8f5e8, #f0f8f0); 
            padding: 25px; 
            border-left: 5px solid #28a745; 
            margin: 25px 0;
            border-radius: 10px;
          }
          .info-row { 
            margin: 15px 0; 
            font-size: 16px; 
            display: flex;
            align-items: center;
          }
          .info-icon {
            margin-right: 10px;
            font-size: 18px;
          }
          .warning-box {
            background: linear-gradient(135deg, #fff3cd, #fef9e7);
            border: 2px solid #ffc107;
            border-radius: 10px;
            padding: 25px;
            margin: 25px 0;
          }
          .footer { 
            background: #f8f9fa; 
            text-align: center; 
            color: #666; 
            font-size: 14px; 
            padding: 25px; 
            border-top: 1px solid #dee2e6;
          }
          .btn {
            display: inline-block;
            padding: 12px 30px;
            background: #667eea;
            color: white;
            text-decoration: none;
            border-radius: 25px;
            font-weight: 600;
            margin: 10px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎯 ${process.env.COMPANY_NAME || 'EnvatoClone'}</h1>
            <p style="margin: 10px 0 0 0; font-size: 18px;">New User Registration Request</p>
          </div>
          <div class="content">
            <h2 style="color: #667eea; margin-bottom: 20px;">📝 User Registration Details</h2>
            <div class="user-info">
              <div class="info-row">
                <span class="info-icon">👤</span>
                <strong>Name:</strong> &nbsp; ${user.name}
              </div>
              <div class="info-row">
                <span class="info-icon">📧</span>
                <strong>Email:</strong> &nbsp; ${user.email}
              </div>
              <div class="info-row">
                <span class="info-icon">⏰</span>
                <strong>Registration Time:</strong> &nbsp; ${new Date().toLocaleString()}
              </div>
              <div class="info-row">
                <span class="info-icon">🔒</span>
                <strong>User ID:</strong> &nbsp; ${user._id}
              </div>
            </div>
            
            <h2 style="color: #667eea; text-align: center; margin: 30px 0 20px 0;">🔐 Verification OTP</h2>
            <div class="otp-container">
              <div class="otp-code">${otp}</div>
              <p style="margin-top: 15px; color: #666; font-size: 14px;">
                This OTP expires in 10 minutes
              </p>
            </div>
            
            <div class="warning-box">
              <h3 style="margin-top: 0; color: #856404;">⚡ Important Instructions</h3>
              <ul style="margin: 15px 0; padding-left: 20px;">
                <li><strong>Valid for 10 minutes only</strong></li>
                <li>Provide this OTP to user: <strong>${user.email}</strong></li>
                <li>User must enter this OTP to complete registration</li>
                <li>Do not share this OTP with anyone else</li>
              </ul>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <p style="font-size: 16px; color: #555;">
                Contact the user at: <a href="mailto:${user.email}" style="color: #667eea;">${user.email}</a>
              </p>
            </div>
          </div>
          <div class="footer">
            <p><strong>${process.env.COMPANY_NAME || 'EnvatoClone'}</strong> - Automated Registration System</p>
            <p>Support: <a href="mailto:${process.env.SUPPORT_EMAIL}">${process.env.SUPPORT_EMAIL}</a></p>
            <p style="margin-top: 15px; font-size: 12px; color: #999;">
              Generated at: ${new Date().toLocaleString()} | Server Time
            </p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  console.log('📧 Preparing to send OTP email...');
  console.log(`📤 From: ${mailOptions.from}`);
  console.log(`📨 To: ${mailOptions.to}`);
  console.log(`🔐 OTP: ${otp}`);

  await sendEmailWithRetry(mailOptions);
};

// REGISTER ENDPOINT
router.post('/register', async (req, res) => {
  try {
    console.log('🔄 Registration request received:', req.body);
    const { name, email, password } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    // Check if user already exists
    let existingUser = await User.findOne({ email: email.toLowerCase() });
    console.log('🔍 Checking existing user:', existingUser ? 'Found' : 'Not found');

    if (existingUser) {
      if (existingUser.isVerified) {
        return res.status(400).json({
          success: false,
          message: 'User already exists and is verified. Please login.'
        });
      } else {
        console.log('🔄 Updating existing unverified user');
        // User exists but not verified, update the existing user
        existingUser.name = name.trim();
        existingUser.password = password; // Will be hashed by pre-save middleware
        
        // Generate new OTP
        const otp = generateOTP();
        existingUser.otp = otp;
        existingUser.otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        
        await existingUser.save();
        console.log('✅ User updated successfully');

        // Send OTP to admin
        try {
          await sendOTPToAdmin(existingUser, otp);
          console.log('📧 OTP email sent successfully');
        } catch (emailError) {
          console.error('❌ Failed to send OTP email:', emailError);
        }

        return res.status(200).json({
          success: true,
          message: 'Registration updated! OTP has been sent to admin.',
          userId: existingUser._id,
          adminEmail: process.env.ADMIN_EMAIL,
          // FOR TESTING ONLY
          debug: process.env.NODE_ENV === 'development' ? { otp } : undefined
        });
      }
    }

    console.log('🆕 Creating new user');
    // Create new user
    const user = new User({
      name: name.trim(),
      email: email.toLowerCase(),
      password
    });

    // Generate OTP
    const otp = generateOTP();
    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await user.save();
    console.log('✅ User created successfully:', user._id);

    // Send OTP to admin
    let emailSent = false;
    try {
      await sendOTPToAdmin(user, otp);
      emailSent = true;
      console.log('📧 OTP email sent successfully');
    } catch (emailError) {
      console.error('❌ Failed to send OTP email:', emailError);
      console.log('⚠️  Registration will continue without email');
    }

    res.status(201).json({
      success: true,
      message: emailSent 
        ? 'Registration successful! OTP has been sent to admin.' 
        : 'Registration successful! Please contact admin for OTP (email service unavailable).',
      userId: user._id,
      adminEmail: process.env.ADMIN_EMAIL,
      emailSent,
      // FOR TESTING ONLY - Remove in production
      debug: process.env.NODE_ENV === 'development' ? { otp } : undefined
    });

  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// VERIFY OTP ENDPOINT
router.post('/verify-otp', async (req, res) => {
  try {
    const { userId, otp } = req.body;
    console.log('🔄 OTP Verification Request:', { userId, otp });

    // Validation
    if (!userId || !otp) {
      return res.status(400).json({
        success: false,
        message: 'User ID and OTP are required'
      });
    }

    // Validate MongoDB ObjectId format
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid User ID format'
      });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log('🔍 User found:', user.email, 'Verified:', user.isVerified);

    // Check if already verified
    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'User is already verified. Please login.'
      });
    }

    // Check OTP expiry
    if (!user.otpExpiry || new Date() > user.otpExpiry) {
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new registration.'
      });
    }

    console.log('🔐 Comparing OTP:', { provided: otp, stored: user.otp });

    // Verify OTP
    if (user.otp !== otp.toString().trim()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP. Please check and try again.'
      });
    }

    // OTP is valid - activate user
    user.isVerified = true;
    user.verifiedAt = new Date();
    user.otp = undefined;
    user.otpExpiry = undefined;
    
    await user.save();
    console.log('✅ User verified successfully:', user.email);

    // Generate JWT token
    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'OTP verified successfully! Your account is now active.',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        subscription: user.subscription,
        isVerified: user.isVerified,
        verifiedAt: user.verifiedAt
      }
    });

  } catch (error) {
    console.error('❌ OTP verification error:', error);
    res.status(500).json({
      success: false,
      message: 'OTP verification failed. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// LOGIN ENDPOINT
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('🔄 Login attempt:', { email });

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    console.log('🔍 User found:', user.email, 'Verified:', user.isVerified);

    // Check if user is verified
    if (!user.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'Account not verified. Please complete OTP verification first.',
        requiresVerification: true,
        userId: user._id
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token
    const token = generateToken(user._id);

    console.log(`✅ User logged in successfully: ${user.email}`);

    res.json({
      success: true,
      message: 'Login successful!',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        subscription: user.subscription,
        downloadsToday: user.downloadsToday,
        lastLogin: user.lastLogin,
        isVerified: user.isVerified
      }
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET USER PROFILE
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .select('-password -otp -otpExpiry')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('❌ Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// TEST EMAIL ENDPOINT
router.post('/test-email', async (req, res) => {
  try {
    console.log('🔄 Testing email configuration...');

    const testMailOptions = {
      from: `"${process.env.COMPANY_NAME || 'EnvatoClone'}" <${process.env.EMAIL_USER}>`,
      to: process.env.ADMIN_EMAIL,
      subject: '✅ Email Configuration Test - EnvatoClone',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9;">
          <div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 5px 15px rgba(0,0,0,0.1);">
            <h2 style="color: #007bff; margin-bottom: 20px;">✅ Email Configuration Test</h2>
            <p style="font-size: 16px; margin-bottom: 20px;">
              Congratulations! Your email configuration is working correctly.
            </p>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #495057;">Configuration Details:</h3>
              <p><strong>📧 From:</strong> ${process.env.EMAIL_USER}</p>
              <p><strong>📨 To:</strong> ${process.env.ADMIN_EMAIL}</p>
              <p><strong>⏰ Sent at:</strong> ${new Date().toLocaleString()}</p>
              <p><strong>🏢 Company:</strong> ${process.env.COMPANY_NAME || 'EnvatoClone'}</p>
            </div>
            <div style="background: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 15px; border-radius: 5px;">
              <strong>🎉 Success!</strong> Your email service is ready to send OTP notifications.
            </div>
          </div>
        </div>
      `
    };

    await sendEmailWithRetry(testMailOptions);

    res.json({
      success: true,
      message: 'Test email sent successfully! Check your inbox.',
      emailConfig: {
        from: process.env.EMAIL_USER,
        to: process.env.ADMIN_EMAIL,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Test email error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test email',
      error: error.message,
      emailConfig: {
        from: process.env.EMAIL_USER,
        to: process.env.ADMIN_EMAIL,
        error: error.message
      }
    });
  }
});

// GENERATE TEST OTP (Development only)
router.post('/generate-test-otp', async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        message: 'This endpoint is not available in production'
      });
    }

    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID required'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Generate new OTP
    const otp = generateOTP();
    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    console.log(`🔐 Test OTP generated for ${user.email}: ${otp}`);

    res.json({
      success: true,
      message: 'Test OTP generated',
      otp: otp,
      userId: user._id,
      expiresIn: '10 minutes',
      user: {
        email: user.email,
        name: user.name
      }
    });

  } catch (error) {
    console.error('❌ Generate test OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating OTP',
      error: error.message
    });
  }
});

module.exports = router;
