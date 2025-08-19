// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters']
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  subscription: {
    type: String,
    enum: ['free', 'premium'],
    default: 'free'
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  otp: {
    type: String
  },
  otpExpiry: {
    type: Date
  },
  
  // Enhanced download tracking with 24-hour auto reset
  dailyDownloads: { 
    type: Number, 
    default: 0,
    min: [0, 'Daily downloads cannot be negative']
  },
  dailyDownloadDate: { 
    type: Date, 
    default: Date.now 
  },
  monthlyDownloads: { 
    type: Number, 
    default: 0,
    min: [0, 'Monthly downloads cannot be negative']
  },
  monthlyDownloadMonth: { 
    type: String,
    default: () => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
  },
  totalDownloads: { 
    type: Number, 
    default: 0,
    min: [0, 'Total downloads cannot be negative']
  },
  
  // Premium subscription tracking
  premiumExpiry: {
    type: Date
  },
  premiumStartDate: {
    type: Date
  },
  
  // User activity tracking
  lastLogin: {
    type: Date
  },
  verifiedAt: {
    type: Date
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  
  // Enhanced download history
  downloads: [{
    productId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Product',
      required: true
    },
    productTitle: {
      type: String,
      required: true
    },
    productCategory: {
      type: String,
      enum: ['themes', 'plugins', 'templates', 'graphics'],
      required: true
    },
    downloadedAt: { 
      type: Date, 
      default: Date.now 
    },
    downloadSource: { 
      type: String, 
      enum: ['web', 'api', 'mobile'],
      default: 'web' 
    },
    ipAddress: {
      type: String,
      default: 'unknown'
    }
  }],

  // User preferences and settings
  preferences: {
    emailNotifications: { type: Boolean, default: true },
    downloadNotifications: { type: Boolean, default: true },
    marketingEmails: { type: Boolean, default: false },
    theme: { type: String, enum: ['light', 'dark', 'auto'], default: 'auto' },
    language: { type: String, default: 'en' }
  },

  // Download statistics
  downloadStats: {
    totalDownloads: { type: Number, default: 0 },
    themesDownloaded: { type: Number, default: 0 },
    pluginsDownloaded: { type: Number, default: 0 },
    templatesDownloaded: { type: Number, default: 0 },
    graphicsDownloaded: { type: Number, default: 0 },
    averageDownloadsPerDay: { type: Number, default: 0 },
    mostActiveDay: String,
    lastStatsUpdate: { type: Date, default: Date.now }
  }
}, {
  timestamps: true
});

// Indexes for better performance
userSchema.index({ email: 1 });
userSchema.index({ isVerified: 1 });
userSchema.index({ subscription: 1 });
userSchema.index({ dailyDownloadDate: 1 });
userSchema.index({ monthlyDownloadMonth: 1 });
userSchema.index({ premiumExpiry: 1 });
userSchema.index({ createdAt: -1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Update lastActivity on save
userSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.lastActivity = new Date();
  }
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(password) {
  try {
    return await bcrypt.compare(password, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

// Reset daily downloads if new day (24-hour auto reset)
userSchema.methods.resetDailyDownloadsIfNeeded = function() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // Start of today (00:00:00)
  const lastDownloadDate = this.dailyDownloadDate ? new Date(this.dailyDownloadDate) : null;
  const lastDownloadDay = lastDownloadDate ? new Date(lastDownloadDate.getFullYear(), lastDownloadDate.getMonth(), lastDownloadDate.getDate()) : null;
  
  // If it's a new day (24 hours have passed), auto-reset daily downloads
  if (!lastDownloadDay || today.getTime() > lastDownloadDay.getTime()) {
    const wasReset = this.dailyDownloads > 0; // Only log if there were downloads to reset
    if (wasReset) {
      console.log(`🔄 AUTO-RESET: Daily downloads for ${this.email} (${this.dailyDownloads} → 0) - Last: ${lastDownloadDay ? lastDownloadDay.toDateString() : 'Never'}, Today: ${today.toDateString()}`);
    }
    this.dailyDownloads = 0;
    this.dailyDownloadDate = today;
    return wasReset;
  }
  
  return false;
};

// Reset monthly downloads if new month (auto reset)
userSchema.methods.resetMonthlyDownloadsIfNeeded = function() {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  // If it's a new month, auto-reset monthly downloads
  if (this.monthlyDownloadMonth !== currentMonth) {
    const wasReset = this.monthlyDownloads > 0; // Only log if there were downloads to reset
    if (wasReset) {
      console.log(`🔄 AUTO-RESET: Monthly downloads for ${this.email} (${this.monthlyDownloads} → 0) - Last: ${this.monthlyDownloadMonth}, Current: ${currentMonth}`);
    }
    this.monthlyDownloads = 0;
    this.monthlyDownloadMonth = currentMonth;
    return wasReset;
  }
  
  return false;
};

// Enhanced canDownload method with 24-hour reset info
userSchema.methods.canDownload = function() {
  // Check if user is verified
  if (!this.isVerified) {
    return {
      canDownload: false,
      reason: 'Email not verified - please check your email and verify your account',
      subscription: this.subscription,
      daily: { used: 0, limit: 15, remaining: 15 },
      monthly: { used: 0, limit: 350, remaining: 350 },
      total: this.totalDownloads || 0,
      requiresVerification: true,
      subscriptionStatus: { active: false, daysLeft: 0 }
    };
  }

  // Auto-reset counters if needed (24-hour and monthly check)
  const dailyReset = this.resetDailyDownloadsIfNeeded();
  const monthlyReset = this.resetMonthlyDownloadsIfNeeded();

  // Define limits based on subscription
  const isPremium = this.subscription === 'premium';
  const isActive = isPremium && this.premiumExpiry && this.premiumExpiry > new Date();
  
  const dailyLimit = 15; // Everyone gets 15 per day
  const monthlyLimit = isActive ? 500 : 350; // Premium: 500, Free: 350

  const dailyUsed = this.dailyDownloads || 0;
  const monthlyUsed = this.monthlyDownloads || 0;
  
  const dailyRemaining = Math.max(0, dailyLimit - dailyUsed);
  const monthlyRemaining = Math.max(0, monthlyLimit - monthlyUsed);

  // Can download if BOTH daily AND monthly limits allow
  const canDownload = dailyRemaining > 0 && monthlyRemaining > 0;

  // Calculate subscription status
  const subscriptionStatus = {
    active: isActive,
    expiry: this.premiumExpiry,
    daysLeft: isPremium && this.premiumExpiry 
      ? Math.max(0, Math.ceil((this.premiumExpiry - new Date()) / (1000 * 60 * 60 * 24)))
      : 0
  };

  // Calculate time until next reset (24 hours from now)
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1); // Start of next day
  const hoursUntilDailyReset = Math.ceil((tomorrow - now) / (1000 * 60 * 60));

  // Calculate time until next month
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const daysUntilMonthlyReset = Math.ceil((nextMonth - now) / (1000 * 60 * 60 * 24));

  // Generate appropriate reason message
  let reason = 'Within limits';
  if (!canDownload) {
    if (dailyRemaining <= 0) {
      reason = `Daily limit reached (${dailyUsed}/${dailyLimit}). Resets automatically in ${hoursUntilDailyReset} hour${hoursUntilDailyReset === 1 ? '' : 's'}.`;
    } else if (monthlyRemaining <= 0) {
      reason = `Monthly limit reached (${monthlyUsed}/${monthlyLimit}). Resets in ${daysUntilMonthlyReset} day${daysUntilMonthlyReset === 1 ? '' : 's'}.${!isActive && isPremium === false ? ' Upgrade to premium for 500 downloads/month!' : ''}`;
    }
  }

  return {
    canDownload,
    reason,
    subscription: this.subscription,
    daily: { 
      used: dailyUsed, 
      limit: dailyLimit, 
      remaining: dailyRemaining,
      hoursUntilReset: hoursUntilDailyReset
    },
    monthly: { 
      used: monthlyUsed, 
      limit: monthlyLimit, 
      remaining: monthlyRemaining,
      daysUntilReset: daysUntilMonthlyReset
    },
    total: this.totalDownloads || 0,
    subscriptionStatus,
    resetInfo: {
      dailyReset,
      monthlyReset,
      nextDailyReset: tomorrow.toISOString(),
      nextMonthlyReset: nextMonth.toISOString()
    }
  };
};

// Enhanced increment download count with statistics tracking
userSchema.methods.incrementDownloadCount = async function(productData = {}) {
  // Auto-reset counters if needed
  this.resetDailyDownloadsIfNeeded();
  this.resetMonthlyDownloadsIfNeeded();
  
  // Increment counters
  this.dailyDownloads = (this.dailyDownloads || 0) + 1;
  this.monthlyDownloads = (this.monthlyDownloads || 0) + 1;
  this.totalDownloads = (this.totalDownloads || 0) + 1;
  
  // Add to detailed download history
  if (productData.productId) {
    this.downloads.push({
      productId: productData.productId,
      productTitle: productData.productTitle || 'Unknown Product',
      productCategory: productData.productCategory || 'unknown',
      downloadedAt: new Date(),
      downloadSource: productData.downloadSource || 'web',
      ipAddress: productData.ipAddress || 'unknown'
    });

    // Update statistics
    this.downloadStats.totalDownloads = this.totalDownloads;
    
    // Update category-specific stats
    const category = productData.productCategory;
    if (category === 'themes') {
      this.downloadStats.themesDownloaded = (this.downloadStats.themesDownloaded || 0) + 1;
    } else if (category === 'plugins') {
      this.downloadStats.pluginsDownloaded = (this.downloadStats.pluginsDownloaded || 0) + 1;
    } else if (category === 'templates') {
      this.downloadStats.templatesDownloaded = (this.downloadStats.templatesDownloaded || 0) + 1;
    } else if (category === 'graphics') {
      this.downloadStats.graphicsDownloaded = (this.downloadStats.graphicsDownloaded || 0) + 1;
    }

    // Update average downloads per day
    const daysSinceRegistration = Math.max(1, Math.floor((Date.now() - new Date(this.createdAt)) / (1000 * 60 * 60 * 24)));
    this.downloadStats.averageDownloadsPerDay = Number((this.totalDownloads / daysSinceRegistration).toFixed(2));
    
    // Update most active day of week
    const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    this.downloadStats.mostActiveDay = dayOfWeek;
    this.downloadStats.lastStatsUpdate = new Date();
  }
  
  const isPremium = this.subscription === 'premium';
  const isActive = isPremium && this.premiumExpiry && this.premiumExpiry > new Date();
  const monthlyLimit = isActive ? 500 : 350;
  
  console.log(`📥 ${this.email} - Daily: ${this.dailyDownloads}/15, Monthly: ${this.monthlyDownloads}/${monthlyLimit}, Total: ${this.totalDownloads}`);
  
  try {
    await this.save();
    return {
      dailyCount: this.dailyDownloads,
      monthlyCount: this.monthlyDownloads,
      totalCount: this.totalDownloads,
      dailyRemaining: Math.max(0, 15 - this.dailyDownloads),
      monthlyRemaining: Math.max(0, monthlyLimit - this.monthlyDownloads)
    };
  } catch (error) {
    console.error('❌ Error saving download count:', error);
    throw new Error('Failed to update download count');
  }
};

// Get comprehensive download statistics
userSchema.methods.getDownloadStats = function() {
  this.resetDailyDownloadsIfNeeded();
  this.resetMonthlyDownloadsIfNeeded();
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Calculate stats from detailed history
  const todayDownloads = this.downloads.filter(download => {
    const downloadDate = new Date(download.downloadedAt);
    downloadDate.setHours(0, 0, 0, 0);
    return downloadDate.getTime() === today.getTime();
  });

  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekDownloads = this.downloads.filter(download => 
    new Date(download.downloadedAt) >= weekAgo
  );

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const monthDownloads = this.downloads.filter(download => {
    const downloadDate = new Date(download.downloadedAt);
    return downloadDate.getMonth() === currentMonth && downloadDate.getFullYear() === currentYear;
  });

  // Category breakdown
  const categoryStats = this.downloads.reduce((acc, download) => {
    const category = download.productCategory || 'unknown';
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});

  // Source breakdown
  const sourceStats = this.downloads.reduce((acc, download) => {
    const source = download.downloadSource || 'web';
    acc[source] = (acc[source] || 0) + 1;
    return acc;
  }, {});

  const isPremium = this.subscription === 'premium';
  const isActive = isPremium && this.premiumExpiry && this.premiumExpiry > new Date();
  const monthlyLimit = isActive ? 500 : 350;

  return {
    // Current counters
    dailyDownloads: this.dailyDownloads || 0,
    monthlyDownloads: this.monthlyDownloads || 0,
    totalDownloads: this.totalDownloads || 0,
    
    // Detailed history counts
    todayDownloadsDetailed: todayDownloads.length,
    weekDownloads: weekDownloads.length,
    monthDownloadsDetailed: monthDownloads.length,
    
    // Limits and remaining
    dailyLimit: 15,
    monthlyLimit: monthlyLimit,
    dailyRemaining: Math.max(0, 15 - (this.dailyDownloads || 0)),
    monthlyRemaining: Math.max(0, monthlyLimit - (this.monthlyDownloads || 0)),
    
    // Breakdowns
    categoryBreakdown: categoryStats,
    sourceBreakdown: sourceStats,
    
    // Account info
    subscription: this.subscription,
    isPremium: isActive,
    accountAge: Math.floor((Date.now() - new Date(this.createdAt)) / (1000 * 60 * 60 * 24)),
    averageDownloadsPerDay: this.downloadStats.averageDownloadsPerDay || 0,
    mostActiveCategory: Object.keys(categoryStats).reduce((a, b) => 
      categoryStats[a] > categoryStats[b] ? a : b, 'none'
    ),
    lastDownloadDate: this.downloads.length > 0 ? 
      this.downloads[this.downloads.length - 1].downloadedAt : null
  };
};

// Check if user has downloaded a specific product recently
userSchema.methods.hasDownloadedRecently = function(productId, minutes = 30) {
  const recentTime = new Date(Date.now() - minutes * 60 * 1000);
  
  return this.downloads.some(download => {
    return download.productId.toString() === productId.toString() && 
           new Date(download.downloadedAt) >= recentTime;
  });
};

// Get user's download history for a specific period
userSchema.methods.getDownloadHistory = function(days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.downloads.filter(download => 
    new Date(download.downloadedAt) >= startDate
  ).sort((a, b) => new Date(b.downloadedAt) - new Date(a.downloadedAt));
};

// Update premium subscription
userSchema.methods.updatePremiumSubscription = async function(durationInDays = 30) {
  this.subscription = 'premium';
  this.premiumStartDate = new Date();
  this.premiumExpiry = new Date(Date.now() + (durationInDays * 24 * 60 * 60 * 1000));
  
  try {
    await this.save();
    console.log(`✅ Premium subscription activated for ${this.email} until ${this.premiumExpiry.toDateString()}`);
    return this;
  } catch (error) {
    console.error('❌ Error updating premium subscription:', error);
    throw new Error('Failed to update premium subscription');
  }
};

// Cancel premium subscription
userSchema.methods.cancelPremiumSubscription = async function() {
  this.subscription = 'free';
  this.premiumExpiry = new Date(); // Expire immediately
  
  try {
    await this.save();
    console.log(`✅ Premium subscription cancelled for ${this.email}`);
    return this;
  } catch (error) {
    console.error('❌ Error cancelling premium subscription:', error);
    throw new Error('Failed to cancel premium subscription');
  }
};

// Enhanced JSON transformation (exclude sensitive data)
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  
  // Remove sensitive fields
  delete user.password;
  delete user.otp;
  delete user.__v;
  
  // Add computed fields
  user.downloadStats = this.getDownloadStats();
  user.canDownloadInfo = this.canDownload();
  
  return user;
};

// Static method to get top downloaders
userSchema.statics.getTopDownloaders = function(limit = 10, period = 'total') {
  let sortField = 'totalDownloads';
  let matchStage = { isVerified: true };
  
  if (period === 'daily') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    matchStage.dailyDownloadDate = { $gte: today };
    sortField = 'dailyDownloads';
  } else if (period === 'monthly') {
    const now = new Date();
    const monthString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    matchStage.monthlyDownloadMonth = monthString;
    sortField = 'monthlyDownloads';
  }
  
  return this.aggregate([
    { $match: matchStage },
    { $project: { 
        name: 1, 
        email: 1, 
        totalDownloads: 1,
        dailyDownloads: 1,
        monthlyDownloads: 1,
        subscription: 1,
        createdAt: 1,
        downloadCount: `$${sortField}`
    }},
    { $sort: { downloadCount: -1 } },
    { $limit: limit }
  ]);
};

// Static method to get global download statistics
userSchema.statics.getGlobalStats = function() {
  return this.aggregate([
    { $match: { isVerified: true } },
    { $group: {
        _id: null,
        totalUsers: { $sum: 1 },
        totalDownloads: { $sum: '$totalDownloads' },
        totalDailyDownloads: { $sum: '$dailyDownloads' },
        totalMonthlyDownloads: { $sum: '$monthlyDownloads' },
        premiumUsers: { 
          $sum: { $cond: [{ $eq: ["$subscription", "premium"] }, 1, 0] } 
        },
        freeUsers: { 
          $sum: { $cond: [{ $eq: ["$subscription", "free"] }, 1, 0] } 
        },
        averageDownloadsPerUser: { $avg: '$totalDownloads' }
    }}
  ]);
};

// Static method to reset expired premium subscriptions
userSchema.statics.resetExpiredPremiumSubscriptions = async function() {
  const now = new Date();
  const result = await this.updateMany(
    { 
      subscription: 'premium',
      premiumExpiry: { $lt: now }
    },
    { 
      $set: { subscription: 'free' }
    }
  );
  
  if (result.modifiedCount > 0) {
    console.log(`🔄 Reset ${result.modifiedCount} expired premium subscriptions`);
  }
  
  return result;
};

module.exports = mongoose.model('User', userSchema);
