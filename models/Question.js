const mongoose = require('mongoose');

const QuestionSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  mssv: {
    type: String,
    trim: true,
    default: 'Ẩn danh'
  },
  fullName: {
    type: String,
    trim: true,
    default: 'Sinh viên ẩn danh'
  },
  isAnonymous: {
    type: Boolean,
    default: false
  },
  category: {
    type: String,
    default: 'Kỹ thuật & Code',
    trim: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'answered', 'closed'],
    default: 'pending'
  },
  answer: {
    type: String,
    default: '',
    trim: true
  },
  answeredBy: {
    type: String,
    default: '',
    trim: true
  },
  answeredRole: {
    type: String,
    default: 'Giảng viên / Mentor UIT',
    trim: true
  },
  answeredAt: {
    type: Date
  },
  likesCount: {
    type: Number,
    default: 0
  },
  likedBy: {
    type: [String],
    default: []
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Question', QuestionSchema);
