const mongoose = require('mongoose');

const ScheduleItemSchema = new mongoose.Schema({
  time: { type: String, required: true },
  title: { type: String, required: true },
  courseCode: { type: String, default: '' },
  type: { type: String, default: 'LÝ THUYẾT' },
  room: { type: String, default: '' },
  instructor: { type: String, default: '' }
}, { _id: false });

const PendingRequestSchema = new mongoose.Schema({
  id: { type: String, required: true },
  title: { type: String, required: true },
  date: { type: String, default: '' },
  status: { type: String, default: 'Đang xử lý' },
  statusType: { type: String, default: 'pending' } // pending, in-progress, completed
}, { _id: false });

const GpaHistorySchema = new mongoose.Schema({
  semester: { type: String, required: true }, // e.g. "1-25", "2-25", "3-25"
  semesterGpa: { type: Number, required: true },
  cumulativeGpa: { type: Number, required: true }
}, { _id: false });

const StarHistorySchema = new mongoose.Schema({
  period: { type: String, required: true }, // e.g. "Tuần 1", "Tuần 2", "Tuần 3", "Tuần 4"
  periodStars: { type: Number, required: true },
  cumulativeStars: { type: Number, required: true }
}, { _id: false });

const SessionStarSchema = new mongoose.Schema({
  sessionId: { type: String, default: '' }, // link to Schedule _id or code
  sessionCode: { type: String, default: '' }, // e.g. 'TP-M10.01'
  sessionTitle: { type: String, required: true }, // e.g. 'Buổi 1: Khởi động Trainee Program & Tổng quan Hệ thống'
  sessionDate: { type: String, default: '' }, // e.g. '2026-10-06'
  stage: { type: String, default: 'Giai đoạn 1' },
  stageName: { type: String, default: 'Training' },
  starsAwarded: { type: Number, required: true, default: 0 },
  cumulativeStars: { type: Number, default: 0 },
  note: { type: String, default: 'Tham gia đầy đủ, hoàn thành bài tập buổi học' },
  trainerName: { type: String, default: 'Võ Thị Xuân Quỳnh' },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const MentorSchema = new mongoose.Schema({
  name: { type: String, default: 'Võ Thị Xuân Quỳnh' },
  role: { type: String, default: 'Trainer Trainee Program' },
  email: { type: String, default: 'quynhvtx@uit.edu.vn' },
  phone: { type: String, default: '0904607220' },
  avatarInitial: { type: String, default: 'VQ' }
}, { _id: false });

const TraineeSchema = new mongoose.Schema({
  traineeId: { type: String, required: true, unique: true }, // MSSV / Trainee Code (e.g. 25520918)
  fullName: { type: String, required: true },
  avatar: { 
    type: String, 
    default: function() {
      const seed = this.traineeId || 'student';
      return `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(seed)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
    }
  },
  email: { type: String, required: true },
  batch: { type: String, default: 'KHMT2026.2' },
  track: { type: String, default: 'Khoa Khoa học Máy tính' },
  department: { type: String, default: 'Khoa học Máy tính' },
  status: { type: String, default: 'Đang học' }, // Đang học, Đang đào tạo, Tốt nghiệp
  cohortYear: { type: String, default: '2025' },
  academicYear: { type: String, default: '2026-2027' },
  
  // Legacy metrics for backward compatibility
  cumulativeGpa: { type: Number, default: 8.67 },
  gpaClassification: { type: String, default: 'Tốt' },
  gpaTrend: { type: String, default: '-14.8% so với HK trước' },
  gpaTrendIsPositive: { type: Boolean, default: false },
  
  completedCredits: { type: Number, default: 52 },
  totalCredits: { type: Number, default: 126 },
  creditsPercent: { type: Number, default: 41.3 },
  actualCredits: { type: Number, default: 44 },
  
  trainingScore: { type: Number, default: 98.0 },
  trainingClassification: { type: String, default: 'Xuất sắc' },
  
  previousSemesterGpa: { type: Number, default: 7.82 },
  previousSemesterNote: { type: String, default: 'Chưa có dữ liệu HK trước -trước' },

  // ========================================================
  // DASHBOARD 4 KPIS (DỄ DÀNG LINK SYNC VỚI ADMIN & DATABASE)
  // ========================================================
  // 1. Sao tích lũy
  accumulatedStars: { type: Number, default: 28 },
  starClassification: { type: String, default: 'Hạng Vàng ⭐⭐⭐' },
  starTrend: { type: String, default: '+4 sao tuần này' },
  starTrendIsPositive: { type: Boolean, default: true },
  
  // 2. Số buổi học đã tham gia & Chuyên cần
  attendedSessions: { type: Number, default: 42 },
  totalSessions: { type: Number, default: 45 },
  absentExcused: { type: Number, default: 3 }, // Vắng có phép
  absentUnexcused: { type: Number, default: 0 }, // Vắng không phép
  attendanceRate: { type: Number, default: 93.3 },
  attendanceNote: { type: String, default: 'Đã tham gia: 42 buổi · Vắng có phép: 3 · Không phép: 0' },
  
  // 3. Điểm bài tập
  assignmentScore: { type: Number, default: 9.6 },
  assignmentClassification: { type: String, default: 'Xuất sắc' },
  completedAssignments: { type: Number, default: 14 },
  totalAssignments: { type: Number, default: 15 },
  assignmentNote: { type: String, default: 'Đạt 14/15 bài tập · Đạt yêu cầu 100%' },
  
  // 4. Thứ hạng xếp loại
  currentRank: { type: Number, default: 1 },
  totalStudentsInRank: { type: Number, default: 12 },
  rankClassification: { type: String, default: '🥇 Quán quân Trainee' },
  rankNote: { type: String, default: 'Hạng 1 / 12 sinh viên · Dẫn đầu toàn khóa' },

  // Authentication & Access Control
  password: { type: String, default: '1234' },
  role: { type: String, default: 'student' }, // 'student' | 'admin'
  
  // Sub-sections
  mentor: { type: MentorSchema, default: () => ({}) },
  scheduleToday: [ScheduleItemSchema],
  pendingRequests: [PendingRequestSchema],
  gpaHistory: [GpaHistorySchema],
  starHistory: [StarHistorySchema],
  sessionStars: [SessionStarSchema],
  
  // Trainee Leaderboard specific fields
  rank: { type: Number, default: 1 },
  completedTasks: { type: Number, default: 18 },
  totalTasks: { type: Number, default: 24 },
  skills: [{ type: String }],
  bio: { type: String, default: '' }
}, {
  timestamps: true
});

module.exports = mongoose.model('Trainee', TraineeSchema);
