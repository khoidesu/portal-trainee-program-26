const mongoose = require('mongoose');

const AccountSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  fullName: { type: String, required: true, maxlength: 150 },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ['admin', 'trainer'], required: true },
  permissions: [{ type: String, enum: ['trainees:manage', 'schedules:manage', 'attendance:manage', 'assignments:manage', 'questions:manage', 'leave:manage'] }],
  active: { type: Boolean, default: true },
  sessionVersion: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Account', AccountSchema);
