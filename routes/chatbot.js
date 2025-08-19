// routes/chatbot.js
const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const User = require('../models/User');
const auth = require('../middleware/auth');

// Enhanced chat endpoint with better search and responses
router.post('/chat', async (req, res) => {
  try {
    const { message, context } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    const lowerMessage = message.toLowerCase().trim();
    const userId = context?.userId;
    let botResponse = {};

    // Get active products
    const allProducts = await Product.find({ isActive: true }).sort({ 
      featured: -1, 
      downloads: -1, 
      createdAt: -1 
    });

    // Enhanced greeting responses
    if (isGreeting(lowerMessage)) {
      botResponse = {
        text: getRandomGreeting(context?.isLoggedIn),
        quickActions: [
          { text: '🎨 Browse Themes', action: 'show_themes' },
          { text: '🔌 Browse Plugins', action: 'show_plugins' },
          { text: '⭐ Featured Products', action: 'show_featured' },
          { text: '🆕 Latest Additions', action: 'show_latest' }
        ]
      };
    } 
    // Category-specific searches
    else if (lowerMessage.includes('theme') || lowerMessage.includes('themes')) {
      const themes = allProducts.filter(p => p.category === 'themes');
      
      if (themes.length > 0) {
        botResponse = {
          text: `🎨 Found ${themes.length} amazing WordPress themes! Here are the top ones:`,
          products: themes.slice(0, 6),
          totalFound: themes.length
        };
      } else {
        botResponse = getNoResultsResponse('themes', [
          'blog themes',
          'business themes',
          'ecommerce themes',
          'portfolio themes'
        ]);
      }
    }
    else if (lowerMessage.includes('plugin') || lowerMessage.includes('plugins')) {
      const plugins = allProducts.filter(p => p.category === 'plugins');
      
      if (plugins.length > 0) {
        botResponse = {
          text: `🔌 Found ${plugins.length} powerful WordPress plugins! Here are the top ones:`,
          products: plugins.slice(0, 6),
          totalFound: plugins.length
        };
      } else {
        botResponse = getNoResultsResponse('plugins', [
          'SEO plugins',
          'security plugins',
          'backup plugins',
          'contact form plugins'
        ]);
      }
    }
    // Featured products
    else if (lowerMessage.includes('featured') || lowerMessage.includes('popular') || lowerMessage.includes('best')) {
      const featured = allProducts.filter(p => p.featured);
      
      if (featured.length > 0) {
        botResponse = {
          text: `⭐ Here are our handpicked featured products:`,
          products: featured.slice(0, 6)
        };
      } else {
        botResponse = {
          text: `😔 No featured products are currently available. Check out our latest products instead!`,
          quickActions: [
            { text: '🆕 Show Latest', action: 'show_latest' },
            { text: '🎨 Browse Themes', action: 'show_themes' }
          ]
        };
      }
    }
    // Latest products
    else if (lowerMessage.includes('latest') || lowerMessage.includes('new') || lowerMessage.includes('recent')) {
      const latest = allProducts.slice(0, 6);
      
      if (latest.length > 0) {
        botResponse = {
          text: `🆕 Here are our latest WordPress products:`,
          products: latest
        };
      } else {
        botResponse = getNoProductsResponse();
      }
    }
    // Help requests
    else if (lowerMessage.includes('help') || lowerMessage.includes('how') || lowerMessage.includes('what can you do')) {
      botResponse = {
        text: `🤖 I'm here to help you find amazing WordPress themes and plugins! Here's what I can do:

• 🔍 Search for specific products
• 🎨 Show you WordPress themes
• 🔌 Display available plugins
• ⭐ Recommend featured products
• 📊 Track your download statistics
• 📥 Help you download products

Just type what you're looking for, like "blog theme", "SEO plugin", or "ecommerce"!`,
        quickActions: [
          { text: '🎨 Browse Themes', action: 'show_themes' },
          { text: '🔌 Browse Plugins', action: 'show_plugins' },
          { text: '⭐ Featured Products', action: 'show_featured' }
        ]
      };
    }
    // Specific search terms
    else {
      const searchResults = performAdvancedSearch(lowerMessage, allProducts);
      
      if (searchResults.length > 0) {
        const limitedResults = searchResults.slice(0, 6);
        botResponse = {
          text: `🔍 Found ${searchResults.length} product${searchResults.length > 1 ? 's' : ''} matching "${message}":`,
          products: limitedResults,
          totalFound: searchResults.length
        };

        // Add pagination hint if more results exist
        if (searchResults.length > 6) {
          botResponse.text += ` Showing top ${limitedResults.length} results.`;
        }
      } else {
        // Enhanced no results with smart suggestions
        const suggestions = generateSmartSuggestions(lowerMessage);
        botResponse = {
          text: `🔍 I couldn't find any products matching "${message}". This might be because:

• The product doesn't exist in our database
• Try using different keywords
• Check for typos in your search

Here are some suggestions:`,
          noResults: true,
          suggestions: suggestions,
          quickActions: [
            { text: '🎨 Browse All Themes', action: 'show_themes' },
            { text: '🔌 Browse All Plugins', action: 'show_plugins' },
            { text: '⭐ Show Featured', action: 'show_featured' }
          ]
        };
      }
    }

    res.json({
      success: true,
      response: botResponse
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      success: false,
      message: 'Sorry, I encountered an error. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Enhanced download endpoint with better error handling
router.post('/download/:productId', auth, async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.user.id;

    // Validate product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found in our database.'
      });
    }

    if (!product.isActive) {
      return res.status(400).json({
        success: false,
        message: 'This product is currently unavailable for download.'
      });
    }

    // Get user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found.'
      });
    }

    // Check daily download limits
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayDownloads = user.downloads.filter(download => {
      const downloadDate = new Date(download.downloadedAt);
      downloadDate.setHours(0, 0, 0, 0);
      return downloadDate.getTime() === today.getTime();
    });

    const DAILY_LIMIT = process.env.DAILY_DOWNLOAD_LIMIT || 10;
    
    if (todayDownloads.length >= DAILY_LIMIT) {
      const nextReset = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      return res.status(429).json({
        success: false,
        message: `🚫 You've reached your daily download limit of ${DAILY_LIMIT} products. Your downloads will reset tomorrow!`,
        limitReached: true,
        remainingDownloads: 0,
        nextResetTime: nextReset,
        todayDownloads: todayDownloads.length,
        dailyLimit: DAILY_LIMIT
      });
    }

    // Check if already downloaded today (allow re-download)
    const alreadyDownloadedToday = todayDownloads.find(
      download => download.productId.toString() === productId
    );

    let message;
    if (alreadyDownloadedToday) {
      message = `✅ "${product.title}" - Download link ready! (Previously downloaded today)`;
    } else {
      // Add to download history
      user.downloads.push({
        productId: product._id,
        productTitle: product.title,
        productCategory: product.category,
        downloadedAt: new Date()
      });

      // Update product download count
      product.downloads = (product.downloads || 0) + 1;
      
      await Promise.all([user.save(), product.save()]);
      
      message = `🎉 "${product.title}" is ready for download! Starting download now...`;
    }

    const remainingDownloads = DAILY_LIMIT - (alreadyDownloadedToday ? todayDownloads.length : todayDownloads.length + 1);

    res.json({
      success: true,
      message,
      product: {
        id: product._id,
        title: product.title,
        category: product.category,
        downloads: product.downloads,
        version: product.version
      },
      downloadUrl: product.downloadUrl,
      remainingDownloads: Math.max(0, remainingDownloads),
      todayDownloads: alreadyDownloadedToday ? todayDownloads.length : todayDownloads.length + 1,
      dailyLimit: DAILY_LIMIT,
      isRedownload: !!alreadyDownloadedToday
    });

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({
      success: false,
      message: 'Download service is temporarily unavailable. Please try again later.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Enhanced stats endpoint
router.get('/stats', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayDownloads = user.downloads.filter(download => {
      const downloadDate = new Date(download.downloadedAt);
      downloadDate.setHours(0, 0, 0, 0);
      return downloadDate.getTime() === today.getTime();
    });

    // This week downloads
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekDownloads = user.downloads.filter(download => {
      return new Date(download.downloadedAt) >= weekAgo;
    });

    const DAILY_LIMIT = process.env.DAILY_DOWNLOAD_LIMIT || 10;
    const remainingDownloads = DAILY_LIMIT - todayDownloads.length;

    // Category breakdown
    const categoryStats = user.downloads.reduce((acc, download) => {
      const category = download.productCategory || 'unknown';
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});

    res.json({
      success: true,
      stats: {
        totalDownloads: user.downloads.length,
        todayDownloads: todayDownloads.length,
        weekDownloads: weekDownloads.length,
        remainingDownloads: Math.max(0, remainingDownloads),
        dailyLimit: DAILY_LIMIT,
        nextResetTime: new Date(today.getTime() + 24 * 60 * 60 * 1000),
        categoryBreakdown: categoryStats,
        averageDownloadsPerDay: user.downloads.length / Math.max(1, Math.floor((Date.now() - new Date(user.createdAt)) / (1000 * 60 * 60 * 24)))
      }
    });

  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Helper Functions
function isGreeting(message) {
  const greetings = ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening', 'howdy', 'greetings'];
  return greetings.some(greeting => message.includes(greeting));
}

function getRandomGreeting(isLoggedIn) {
  const greetings = [
    "👋 Hello! I'm your WordPress product assistant!",
    "🎉 Hi there! Ready to discover amazing WordPress products?",
    "✨ Hey! I'm here to help you find the perfect themes and plugins!",
    "🚀 Greetings! Let's find some awesome WordPress goodies!"
  ];
  
  const greeting = greetings[Math.floor(Math.random() * greetings.length)];
  const loginMessage = isLoggedIn 
    ? " What can I help you find today?" 
    : " Please login to download products.";
    
  return greeting + loginMessage;
}

function performAdvancedSearch(query, products) {
  const searchTerms = query.toLowerCase().split(' ').filter(term => term.length > 2);
  
  return products.filter(product => {
    const searchableText = [
      product.title,
      product.description,
      product.category,
      ...(product.tags || [])
    ].join(' ').toLowerCase();

    // Exact match gets highest priority
    if (searchableText.includes(query)) {
      product.searchScore = 10;
      return true;
    }

    // Partial matches
    const matchingTerms = searchTerms.filter(term => searchableText.includes(term));
    if (matchingTerms.length > 0) {
      product.searchScore = matchingTerms.length;
      return true;
    }

    return false;
  }).sort((a, b) => (b.searchScore || 0) - (a.searchScore || 0));
}

function generateSmartSuggestions(query) {
  const commonSuggestions = [
    'WordPress themes',
    'blog themes',
    'business themes',
    'ecommerce themes',
    'portfolio themes',
    'SEO plugins',
    'security plugins',
    'contact form plugins',
    'backup plugins',
    'page builder plugins'
  ];

  // Add query-specific suggestions
  const suggestions = [...commonSuggestions];
  
  if (query.includes('shop') || query.includes('store')) {
    suggestions.unshift('ecommerce themes', 'WooCommerce plugins');
  }
  
  if (query.includes('blog')) {
    suggestions.unshift('blog themes', 'blogging plugins');
  }

  return suggestions.slice(0, 8);
}

function getNoResultsResponse(category, suggestions) {
  return {
    text: `😔 No ${category} found in our database currently. We're always adding new products!`,
    noResults: true,
    suggestions,
    quickActions: [
      { text: '🔄 Try Different Search', action: 'help' },
      { text: '⭐ Show Featured', action: 'show_featured' }
    ]
  };
}

function getNoProductsResponse() {
  return {
    text: `📦 No products are currently available in our database. Please check back later as we're always adding new content!`,
    quickActions: [
      { text: '🔄 Refresh', action: 'show_latest' },
      { text: '❓ Get Help', action: 'help' }
    ]
  };
}

module.exports = router;
