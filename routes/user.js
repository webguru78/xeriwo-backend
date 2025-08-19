// routes/user.js
const express = require('express');
const User = require('../models/User');
const Download = require('../models/Download');
const auth = require('../middleware/auth');

const router = express.Router();

// GET /api/user/stats - Get comprehensive user statistics
router.get('/stats', auth, async (req, res) => {
  try {
    console.log('🔄 Fetching user stats for:', req.user.userId);

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // FIXED: Only reset if needed and save once
    const wasReset = user.resetDailyDownloadsIfNeeded();
    let userNeedsSave = wasReset;

    // Get today's date range for database queries
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    try {
      // Get actual download counts from database
      const [totalDownloads, todayDownloads, weekDownloads, monthDownloads] = await Promise.all([
        Download.countDocuments({ userId: req.user.userId }),
        Download.countDocuments({ 
          userId: req.user.userId, 
          downloadDate: { $gte: startOfToday, $lt: endOfToday } 
        }),
        Download.countDocuments({ 
          userId: req.user.userId, 
          downloadDate: { $gte: startOfWeek } 
        }),
        Download.countDocuments({ 
          userId: req.user.userId, 
          downloadDate: { $gte: startOfMonth } 
        })
      ]);

      // Sync user's download count with actual database count
      if (user.downloadsToday !== todayDownloads) {
        console.log(`🔄 Syncing download count: DB=${todayDownloads}, User Model=${user.downloadsToday}`);
        user.downloadsToday = todayDownloads;
        userNeedsSave = true;
      }

      // Save user only if changes were made
      if (userNeedsSave) {
        await user.save();
      }

      const downloadCheck = user.canDownload();
      const stats = {
        totalDownloads,
        downloadsToday: todayDownloads,
        downloadsThisWeek: weekDownloads,
        downloadsThisMonth: monthDownloads,
        remainingToday: user.getRemainingDownloads(),
        subscription: user.subscription,
        downloadLimit: user.subscription === 'premium' ? 'Unlimited' : 10,
        canDownload: downloadCheck.canDownload,
        memberSince: user.createdAt,
        lastLogin: user.lastLogin,
        isVerified: user.isVerified,
        lastResetDate: user.lastResetDate
      };

      console.log('✅ User stats fetched successfully:', {
        userId: req.user.userId,
        totalDownloads: stats.totalDownloads,
        downloadsToday: stats.downloadsToday,
        remainingToday: stats.remainingToday,
        canDownload: stats.canDownload,
        lastResetDate: user.lastResetDate
      });

      res.json({
        success: true,
        stats,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          subscription: user.subscription,
          downloadsToday: todayDownloads,
          isVerified: user.isVerified,
          createdAt: user.createdAt,
          lastLogin: user.lastLogin
        }
      });

    } catch (dbError) {
      // Fallback to user model data if database queries fail
      console.log('📊 Using fallback user stats due to database error:', dbError.message);
      
      if (userNeedsSave) {
        await user.save();
      }

      const downloadCheck = user.canDownload();
      const fallbackStats = {
        totalDownloads: user.downloadsToday || 0,
        downloadsToday: user.downloadsToday || 0,
        downloadsThisWeek: user.downloadsToday || 0,
        downloadsThisMonth: user.downloadsToday || 0,
        remainingToday: user.getRemainingDownloads(),
        subscription: user.subscription,
        downloadLimit: user.subscription === 'premium' ? 'Unlimited' : 10,
        canDownload: downloadCheck.canDownload,
        memberSince: user.createdAt,
        lastLogin: user.lastLogin,
        isVerified: user.isVerified
      };

      res.json({
        success: true,
        stats: fallbackStats,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          subscription: user.subscription,
          downloadsToday: user.downloadsToday || 0,
          isVerified: user.isVerified,
          createdAt: user.createdAt,
          lastLogin: user.lastLogin
        }
      });
    }

  } catch (error) {
    console.error('❌ Error fetching user stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user statistics',
      stats: {
        totalDownloads: 0,
        downloadsToday: 0,
        downloadsThisWeek: 0,
        downloadsThisMonth: 0,
        remainingToday: 10,
        subscription: 'free',
        canDownload: true
      },
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/user/download-status - Quick check of download status
router.get('/download-status', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Reset if needed
    const wasReset = user.resetDailyDownloadsIfNeeded();

    // Get today's actual downloads from database for accuracy
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

    let todayDownloads = 0;
    try {
      todayDownloads = await Download.countDocuments({
        userId: req.user.userId,
        downloadDate: { $gte: startOfToday, $lt: endOfToday }
      });
    } catch (error) {
      console.log('Using user model count due to DB error');
      todayDownloads = user.downloadsToday || 0;
    }

    // Sync with database and save if needed
    if (user.downloadsToday !== todayDownloads || wasReset) {
      user.downloadsToday = todayDownloads;
      await user.save();
    }

    const downloadCheck = user.canDownload();

    res.json({
      success: true,
      downloadStatus: {
        canDownload: downloadCheck.canDownload,
        downloadsToday: todayDownloads,
        remainingToday: user.getRemainingDownloads(),
        dailyLimit: user.subscription === 'premium' ? 'Unlimited' : 10,
        subscription: user.subscription,
        reason: downloadCheck.reason || 'OK',
        resetDate: user.lastResetDate
      }
    });

  } catch (error) {
    console.error('❌ Error checking download status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check download status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/user/profile - Get detailed user profile
router.get('/profile', auth, async (req, res) => {
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

    // Get total downloads count
    let totalDownloads = 0;
    try {
      totalDownloads = await Download.countDocuments({ userId: req.user.userId });
    } catch (error) {
      totalDownloads = user.downloadsToday || 0;
    }

    const profile = {
      ...user,
      totalDownloads,
      membershipDuration: Math.floor((new Date() - new Date(user.createdAt)) / (1000 * 60 * 60 * 24)),
      downloadLimit: user.subscription === 'premium' ? 'Unlimited' : '10/day',
      accountStatus: user.isVerified ? 'Active' : 'Pending Verification'
    };

    res.json({
      success: true,
      profile
    });
  } catch (error) {
    console.error('❌ Error fetching user profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
