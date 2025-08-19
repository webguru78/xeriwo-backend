// routes/download.js
const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');
const Download = require('../models/Download');
const auth = require('../middleware/auth');

const router = express.Router();

// NO RATE LIMITING - Pure business logic handles download limits

// GET /api/download/status
router.get('/status', auth, async (req, res) => {
  try {
    console.log('🔄 Fetching download status for user:', req.user.userId);

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const downloadStatus = user.canDownload();
    
    if (downloadStatus.dailyReset || downloadStatus.monthlyReset) {
      await user.save();
    }

    console.log(`✅ Status for ${user.email}:`, {
      daily: `${downloadStatus.daily.used}/${downloadStatus.daily.limit}`,
      monthly: `${downloadStatus.monthly.used}/${downloadStatus.monthly.limit}`,
      canDownload: downloadStatus.canDownload
    });

    res.json({
      success: true,
      status: {
        userId: user._id,
        email: user.email,
        subscription: downloadStatus.subscription,
        subscriptionStatus: downloadStatus.subscriptionStatus,
        daily: downloadStatus.daily,
        monthly: downloadStatus.monthly,
        total: downloadStatus.total,
        canDownload: downloadStatus.canDownload
      }
    });

  } catch (error) {
    console.error('❌ Error fetching download status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch download status'
    });
  }
});

// GET /api/download/history
router.get('/history', auth, async (req, res) => {
  try {
    console.log('🔄 Fetching download history for user:', req.user.userId);

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const downloads = await Download.find({ userId: req.user.userId })
      .populate('productId', 'title category previewUrl downloadUrl downloads imageUrl image')
      .sort({ downloadDate: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalDownloads = await Download.countDocuments({ userId: req.user.userId });
    const downloadStatus = user.canDownload();

    console.log(`✅ Found ${downloads.length} downloads for user ${user.email}`);

    res.json({
      success: true,
      downloads: downloads.map(download => ({
        _id: download._id,
        productId: download.productId,
        downloadDate: download.downloadDate,
        userId: download.userId
      })),
      pagination: {
        page,
        limit,
        total: totalDownloads,
        totalPages: Math.ceil(totalDownloads / limit)
      },
      downloadLimits: downloadStatus
    });

  } catch (error) {
    console.error('❌ Error fetching download history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch download history',
      downloads: []
    });
  }
});

// POST /api/download/:productId - NO RATE LIMITING, pure business logic
router.post('/:productId', auth, async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    const { productId } = req.params;
    console.log('🔄 Download request for product:', productId, 'by user:', req.user.userId);

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID format'
      });
    }

    await session.startTransaction();

    const user = await User.findById(req.user.userId).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!user.isVerified) {
      await session.abortTransaction();
      return res.status(403).json({
        success: false,
        message: 'Please verify your email to download products',
        requiresVerification: true
      });
    }

    // Check BUSINESS LOGIC download limits (15/day, 350/month free, 500/month premium)
    const downloadCheck = user.canDownload();
    
    console.log('📊 Download check:', {
      email: user.email,
      dailyUsed: downloadCheck.daily.used,
      dailyLimit: downloadCheck.daily.limit,
      monthlyUsed: downloadCheck.monthly.used,
      monthlyLimit: downloadCheck.monthly.limit,
      canDownload: downloadCheck.canDownload,
      reason: downloadCheck.reason
    });
    
    // Business logic check - NOT rate limiting
    if (!downloadCheck.canDownload) {
      await session.abortTransaction();
      
      let message = '';
      let resetInfo = {};
      
      if (downloadCheck.daily.remaining <= 0) {
        message = `Daily limit reached! You have used all ${downloadCheck.daily.limit} downloads today. Your limit will reset in 24 hours.`;
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        resetInfo = {
          type: 'daily',
          resetTime: tomorrow.toISOString(),
          hoursUntilReset: Math.ceil((tomorrow - new Date()) / (1000 * 60 * 60))
        };
      } else if (downloadCheck.monthly.remaining <= 0) {
        message = `Monthly limit reached! You have used all ${downloadCheck.monthly.limit} downloads this month. ${downloadCheck.subscription === 'free' ? 'Upgrade to premium for 500 downloads per month!' : 'Your limit will reset next month.'}`;
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        nextMonth.setDate(1);
        nextMonth.setHours(0, 0, 0, 0);
        resetInfo = {
          type: 'monthly',
          resetTime: nextMonth.toISOString(),
          daysUntilReset: Math.ceil((nextMonth - new Date()) / (1000 * 60 * 60 * 24))
        };
      }
      
      return res.status(429).json({
        success: false,
        message,
        error: 'Download limit exceeded',
        limits: {
          daily: downloadCheck.daily,
          monthly: downloadCheck.monthly,
          subscription: downloadCheck.subscription
        },
        resetInfo,
        canUpgrade: downloadCheck.subscription === 'free'
      });
    }

    const product = await Product.findById(productId).session(session);
    if (!product || !product.isActive) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Product not found or inactive'
      });
    }

    // Check for recent downloads (only to prevent spam - NOT business limit)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000); // Reduced from 1 hour to 30 minutes
    const existingRecentDownload = await Download.findOne({
      userId: req.user.userId,
      productId: productId,
      downloadDate: { $gte: thirtyMinutesAgo }
    }).session(session);

    if (existingRecentDownload) {
      await session.abortTransaction();
      console.log('🔄 User re-downloading same product within 30 minutes');
      
      return res.json({
        success: true,
        message: `You recently downloaded "${product.title}". Here's the download link again!`,
        downloadUrl: product.downloadUrl,
        product: {
          id: product._id,
          title: product.title,
          category: product.category
        },
        userStats: downloadCheck,
        isRedownload: true
      });
    }

    // Create download record
    const download = new Download({
      userId: req.user.userId,
      productId: productId,
      downloadDate: new Date(),
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      downloadUrl: product.downloadUrl
    });

    await download.save({ session });

    // Update user download count (business logic)
    await user.incrementDownloadCount({
      productId: product._id,
      productTitle: product.title,
      productCategory: product.category,
      downloadSource: 'web'
    });

    // Update product download count
    product.downloads = (product.downloads || 0) + 1;
    await product.save({ session });

    await session.commitTransaction();
    
    const updatedDownloadCheck = user.canDownload();

    console.log('✅ Download successful (NO rate limiting):', {
      userEmail: user.email,
      productTitle: product.title,
      newDailyCount: updatedDownloadCheck.daily.used,
      newMonthlyCount: updatedDownloadCheck.monthly.used,
      dailyRemaining: updatedDownloadCheck.daily.remaining,
      monthlyRemaining: updatedDownloadCheck.monthly.remaining
    });

    res.json({
      success: true,
      message: `🎉 "${product.title}" download started successfully!`,
      downloadUrl: product.downloadUrl,
      product: {
        id: product._id,
        title: product.title,
        category: product.category
      },
      userStats: updatedDownloadCheck,
      downloadInfo: {
        downloadId: download._id,
        downloadDate: download.downloadDate,
        dailyRemaining: updatedDownloadCheck.daily.remaining,
        monthlyRemaining: updatedDownloadCheck.monthly.remaining
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('❌ Download error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Download failed due to server error'
    });
  } finally {
    session.endSession();
  }
});

module.exports = router;
