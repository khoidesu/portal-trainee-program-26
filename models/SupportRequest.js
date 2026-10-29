const mongoose = require('mongoose');

const SupportRequestSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['forgot_password', 'feedback', 'account_issue', 'other'],
    default: 'forgot_password'
  },
  traineeId: {
    type: String,
    required: true,
    trim: true
  },
  fullName: {
    type: String,
    default: '',
    trim: true
  },
  email: {
    type: String,
    default: '',
    trim: true
  },
  phone: {
    type: String,
    default: '',
    trim: true
  },
  message: {
    type: String,
    default: 'Yêu cầu cấp lại mật khẩu tài khoản'
  },
  status: {
    type: String,
    enum: ['pending', 'resolved', 'rejected'],
    default: 'pending'
  },
  resolvedPassword: {
    type: String,
    default: ''
  },
  resolvedBy: {
    type: String,
    default: ''
  },
  resolvedAt: {
    type: Date
  },
  note: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('SupportRequest', SupportRequestSchema);
