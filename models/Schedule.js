const mongoose = require('mongoose');

const ScheduleSchema = new mongoose.Schema({
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
  note: { type: String, default: '' }, // Ghi chú / Yêu cầu chuẩn bị
  status: { type: String, default: 'upcoming' }, // upcoming (sắp tới), live (đang học), completed (đã xong)
  credits: { type: Number, default: 3 }
}, {
  timestamps: true
});

module.exports = mongoose.model('Schedule', ScheduleSchema);
