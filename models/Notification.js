const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  traineeId: { type: String, required: true, trim: true },
  type: { type: String, required: true, enum: ['schedule', 'assignment', 'question', 'leave'] },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  body: { type: String, default: '', trim: true, maxlength: 300 },
  link: { type: String, default: '', enum: ['', 'schedule', 'assignments', 'questions', 'leave'] },
  dueAt: { type: Date, default: null },
  refKey: { type: String, required: true, maxlength: 200 },
  readAt: { type: Date, default: null }
}, {
  timestamps: true
});

NotificationSchema.index({ traineeId: 1, refKey: 1 }, { unique: true });
NotificationSchema.index({ traineeId: 1, createdAt: -1 });
// Không có job nền để dọn dẹp, để MongoDB tự xóa thông báo cũ.
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

module.exports = mongoose.model('Notification', NotificationSchema);
