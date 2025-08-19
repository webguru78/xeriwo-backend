// routes/products.js
const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

// Get all products (public)
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const category = req.query.category;
    const skip = (page - 1) * limit;

    // Build query
    let query = { isActive: true };
    if (category && category !== 'all') {
      query.category = category;
    }

    // Get products with pagination
    const products = await Product.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-__v');

    // Get total count
    const total = await Product.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      products,
      pagination: {
        currentPage: page,
        totalPages,
        totalProducts: total,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
      error: error.message
    });
  }
});

// Get featured products (public)
router.get('/featured', async (req, res) => {
  try {
    const products = await Product.find({ 
      isActive: true, 
      featured: true 
    })
      .sort({ createdAt: -1 })
      .limit(8)
      .select('-__v');

    res.json({
      success: true,
      products
    });

  } catch (error) {
    console.error('Get featured products error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch featured products',
      error: error.message
    });
  }
});

// Get product stats (public)
router.get('/stats', async (req, res) => {
  try {
    const totalProducts = await Product.countDocuments({ isActive: true });
    const totalDownloads = await Product.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: null, total: { $sum: '$downloads' } } }
    ]);

    res.json({
      success: true,
      stats: {
        totalProducts,
        totalDownloads: totalDownloads[0]?.total || 0
      }
    });

  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stats',
      error: error.message
    });
  }
});

// Get products for admin
router.get('/admin', adminAuth, async (req, res) => {
  try {
    const products = await Product.find()
      .sort({ createdAt: -1 })
      .select('-__v');

    res.json({
      success: true,
      products
    });

  } catch (error) {
    console.error('Get admin products error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
      error: error.message
    });
  }
});

// Get single product by ID
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findOne({ 
      _id: req.params.id, 
      isActive: true 
    }).select('-__v');

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      product
    });

  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product',
      error: error.message
    });
  }
});

// Create product (admin only)
router.post('/', adminAuth, async (req, res) => {
  try {
    const { title, category, imageUrl, previewUrl, downloadUrl, featured} = req.body;

    // Validation
    if (!title || !category || !imageUrl || !previewUrl || !downloadUrl) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be provided'
      });
    }

    // Check if product with same title already exists
    const existingProduct = await Product.findOne({ 
      title: { $regex: new RegExp('^' + title + '$', 'i') } 
    });

    if (existingProduct) {
      return res.status(400).json({
        success: false,
        message: 'Product with this title already exists'
      });
    }

    const product = new Product({
      title: title.trim(),
      category,
      imageUrl: imageUrl.trim(),
      previewUrl: previewUrl.trim(),
      downloadUrl: downloadUrl.trim(),
      featured: featured || false,
     
    });

    await product.save();

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      product
    });

  } catch (error) {
    console.error('Create product error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create product',
      error: error.message
    });
  }
});

// Update product (admin only)
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const { title, category, imageUrl, previewUrl, downloadUrl, featured} = req.body;

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check if title is being changed and if new title already exists
    if (title && title !== product.title) {
      const existingProduct = await Product.findOne({ 
        title: { $regex: new RegExp('^' + title + '$', 'i') },
        _id: { $ne: req.params.id }
      });

      if (existingProduct) {
        return res.status(400).json({
          success: false,
          message: 'Product with this title already exists'
        });
      }
    }

    // Update fields
    if (title) product.title = title.trim();
    if (category) product.category = category;
    if (imageUrl) product.imageUrl = imageUrl.trim();
    if (previewUrl) product.previewUrl = previewUrl.trim();
    if (downloadUrl) product.downloadUrl = downloadUrl.trim();
    if (typeof featured !== 'undefined') product.featured = featured;
    
    await product.save();

    res.json({
      success: true,
      message: 'Product updated successfully',
      product
    });

  } catch (error) {
    console.error('Update product error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update product',
      error: error.message
    });
  }
});

// Delete product (admin only)
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });

  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete product',
      error: error.message
    });
  }
});

// Track download (authenticated users)
router.post('/:id/download', auth, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product || !product.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Increment download count
    product.downloads = (product.downloads || 0) + 1;
    await product.save();

    res.json({
      success: true,
      message: 'Download tracked successfully',
      downloadUrl: product.downloadUrl
    });

  } catch (error) {
    console.error('Track download error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track download',
      error: error.message
    });
  }
});

module.exports = router;
