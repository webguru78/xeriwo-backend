// models/Download.js
const mongoose = require('mongoose');

const downloadSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    index: true
  },
  downloadDate: {
    type: Date,
    default: Date.now,
    index: true
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  },
  downloadUrl: {
    type: String
  }
}, {
  timestamps: true
});

// Compound indexes for better performance
downloadSchema.index({ userId: 1, downloadDate: -1 });
downloadSchema.index({ productId: 1, downloadDate: -1 });

module.exports = mongoose.model('Download', downloadSchema);
