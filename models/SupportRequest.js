const mongoose = require('mongoose');

const SupportRequestSchema = new mongoose.Schema({
  publicVisible: { type: Boolean, default: false },
  type: {
    type: String,
    enum: ['forgot_password', 'feedback', 'account_issue', 'other', 'leave'],
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
    default: 'Yêu cầu cấp lại mật khẩu tài khoản',
    maxlength: 3000
  },
  scheduleCode: { type: String, maxlength: 80 },
  scheduleTitle: { type: String, maxlength: 300 },
  scheduleDate: { type: String, maxlength: 10 },
  scheduleTime: { type: String, maxlength: 30 },
  submissionKey: { type: String },
  emailStatus: { type: String, enum: ['pending', 'sending', 'sent', 'failed', 'not_configured'] },
  emailAttemptedAt: { type: Date },
  emailSentAt: { type: Date },
  emailId: { type: String },
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

SupportRequestSchema.index({ submissionKey: 1 }, { unique: true, partialFilterExpression: { type: 'leave' } });

module.exports = mongoose.model('SupportRequest', SupportRequestSchema);
