const mongoose = require('mongoose');

const AccountSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  fullName: { type: String, required: true, maxlength: 150 },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ['admin', 'trainer', 'trainee'], required: true },
  traineeId: { type: String, unique: true, sparse: true, trim: true }, // Linked MSSV when role is 'trainee'
  traineeRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Trainee', unique: true, sparse: true },
  permissions: [{ type: String, enum: ['trainees:manage', 'schedules:manage', 'attendance:manage', 'assignments:manage', 'questions:manage', 'leave:manage'] }],
  // Quản trị gốc: chỉ được tạo bằng `npm run create-admin` (không có API nào ghi được trường này).
  isOwner: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
  sessionVersion: { type: Number, default: 0 },
  lastLoginAt: { type: Date },
  lastPasswordChangeAt: { type: Date },
  mustChangePassword: { type: Boolean, default: false },
  loginHistory: [{
    timestamp: { type: Date, default: Date.now },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' }
  }]
}, { timestamps: true });

module.exports = mongoose.model('Account', AccountSchema);
