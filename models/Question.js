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
    default: 'Trainee ẩn danh'
  },
  traineeId: {
    type: String,
    trim: true,
    default: ''
  },
  realMssv: {
    type: String,
    trim: true,
    default: ''
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
    trim: true,
    maxlength: 200
  },
  content: {
    type: String,
    required: true,
    trim: true,
    minlength: 10,
    maxlength: 5000
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
    default: 'Trainer UIT',
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
