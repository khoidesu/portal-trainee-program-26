const mongoose = require('mongoose');

const ScheduleSchema = new mongoose.Schema({
  isTentative: { type: Boolean, default: false },
  title: { type: String, required: true }, // Tên buổi học / môn học (VD: Chuyên đề Kiến trúc Hệ thống)
  code: { type: String, default: '' }, // Mã buổi học (VD: TP-M10.01)
  month: { type: Number, required: true, default: 10 }, // Tháng (VD: 10)
  year: { type: Number, default: 2026 }, // Năm (VD: 2026)
  date: { type: String, required: true }, // Ngày học (YYYY-MM-DD, VD: 2026-10-06)
  dayOfWeekText: { type: String, default: 'Thứ 3' }, // Thứ 2, Thứ 3, ...
  startTime: { type: String, default: '19:30' }, // Giờ bắt đầu (VD: 19:30)
  endTime: { type: String, default: '21:30' }, // Giờ kết thúc (VD: 21:30)
  periods: { type: String, default: 'Tiết 1 - 4' }, // Tiết học
  type: { type: String, default: 'Online' }, // Hình thức: Online (Trực tuyến) / LT / HT
  instructor: { type: String, default: 'TS. Dương Việt Hằng' }, // Giảng viên / Mentor
  room: { type: String, default: 'MS Teams Trực Tuyến' }, // Phòng học
  teamsUrl: { type: String, default: '' }, // Link Microsoft Teams (có thể để trống để gán sau)
  documentUrl: { type: String, default: '', maxlength: 2048 },
  note: { type: String, default: '' }, // Ghi chú / Yêu cầu chuẩn bị
  status: { type: String, default: 'upcoming' }, // upcoming (sắp tới), live (đang học), completed (đã xong)
  credits: { type: Number, default: 3 }
}, {
  timestamps: true
});

ScheduleSchema.statics.getTiming = function(item, now = Date.now()) {
  const startsAt = Date.parse(`${item.date}T${item.startTime}:00+07:00`);
  const endsAt = Date.parse(`${item.date}T${item.endTime}:00+07:00`);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) return { status: 'unknown' };
  return { startsAt, endsAt, status: item.isTentative ? 'tentative' : now < startsAt ? 'upcoming' : now < endsAt ? 'live' : 'completed' };
};

ScheduleSchema.statics.validateTiming = function(item) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date || '') || new Date(item.date + 'T00:00:00Z').toISOString().slice(0, 10) !== item.date
      || !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.startTime || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.endTime || '')
      || this.getTiming(item).status === 'unknown') throw new Error('Ngày hoặc giờ học không hợp lệ; giờ kết thúc phải sau giờ bắt đầu trong cùng ngày.');
  return item;
};

module.exports = mongoose.model('Schedule', ScheduleSchema);
