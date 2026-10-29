const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  // Ignore if cannot set servers
}

const mongoose = require('mongoose');
const { escapeRegex, hashPassword, verifyPassword } = require('../utils/security');
const Trainee = require('../models/Trainee');
const Announcement = require('../models/Announcement');
const Schedule = require('../models/Schedule');
const SupportRequest = require('../models/SupportRequest');
const Question = require('../models/Question');
const Assignment = require('../models/Assignment');
const { mockTrainees, mockAnnouncements } = require('../data/mockData');

let isMongoDBConnected = false;
let connectionError = null;
let activeDatabaseType = 'mongodb';

// Bộ nhớ đệm Mock Trainees (khởi tạo khi DB offline để người dùng xem và trải nghiệm web bình thường)
let inMemoryTrainees = JSON.parse(JSON.stringify(mockTrainees));
let inMemorySupportRequests = [];

/**
 * Tính toán xếp loại bài tập theo đúng tiêu chuẩn yêu cầu:
 * - 9.0 - 10.0: Xuất sắc
 * - 8.0 - < 9.0: Giỏi
 * - 6.5 - < 8.0: Khá
 * - 5.0 - < 6.5: Trung bình
 * - < 5.0: Yếu
 */
function computeAssignmentClassification(score) {
  const s = Number(score);
  if (isNaN(s)) return 'Chưa xếp loại';
  if (s >= 9.0) return 'Xuất sắc';
  if (s >= 8.0) return 'Giỏi';
  if (s >= 6.5) return 'Khá';
  if (s >= 5.0) return 'Trung bình';
  return 'Yếu';
}

/**
 * Tạo URL avatar Dicebear độc nhất cho mỗi tài khoản dựa trên Mã sinh viên (traineeId)
 */
function getDicebearAvatarUrl(traineeId, fullName = '') {
  const seed = encodeURIComponent(String(traineeId || fullName || 'student').trim());
  return `https://api.dicebear.com/9.x/avataaars/svg?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
}

/**
 * Tự động cập nhật lại thứ hạng (Rank) cho toàn bộ học viên theo số sao tích lũy (accumulatedStars giảm dần)
 */
async function syncRanksByStars() {
  if (!isMongoDBConnected) return;
  try {
    const trainees = await Trainee.find().sort({ accumulatedStars: -1 }).select('_id accumulatedStars assignmentScore');
    if (!trainees || trainees.length === 0) return;

    const bulkOps = trainees.map((t, i) => {
      const rank = i + 1;
      let rankClass = `Top ${rank}`;
      if (rank === 1) rankClass = '🥇 Quán quân Trainee';
      else if (rank === 2) rankClass = '🥈 Á quân Trainee';
      else if (rank === 3) rankClass = '🥉 Hạng 3 Trainee';

      return {
        updateOne: {
          filter: { _id: t._id },
          update: {
            $set: {
              currentRank: rank,
              rank: rank,
              rankClassification: rankClass,
              rankNote: `Hạng ${rank} / ${trainees.length} sinh viên (Dựa trên số sao tích lũy)`,
              totalStudentsInRank: trainees.length,
              assignmentClassification: computeAssignmentClassification(t.assignmentScore)
            }
          }
        }
      };
    });

    await Trainee.bulkWrite(bulkOps);
  } catch (err) {
    console.error('Lỗi khi đồng bộ thứ hạng theo số sao:', err.message);
  }
}

let lastConnectAttempt = 0;
const CONNECT_COOLDOWN_MS = 60000; // Cooldown 60s để tránh làm nghẽn server và request khi DB offline

/**
 * Kết nối tới MongoDB Atlas
 */
async function connectDB(force = false) {
  const uri = process.env.MONGODB_URI;

  if (!uri || uri.trim() === '') {
    connectionError = 'MONGODB_URI chưa được cấu hình trong file .env';
    isMongoDBConnected = false;
    activeDatabaseType = 'in-memory-fallback';
    console.error('❌ [Database Error] MONGODB_URI chưa được cấu hình.');
    return;
  }

  // Nếu vừa mới thử kết nối thất bại và chưa hết cooldown thì không chặn tiếp
  const now = Date.now();
  if (!force && lastConnectAttempt > 0 && now - lastConnectAttempt < CONNECT_COOLDOWN_MS) {
    return;
  }
  lastConnectAttempt = now;

  try {
    console.log('🔗 [MongoDB] Đang kết nối tới:', uri.replace(/:([^:@]{4,})@/, ':****@'));
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000
    });

    isMongoDBConnected = true;
    activeDatabaseType = 'mongodb';
    connectionError = null;
    console.log('✅ [MongoDB] Kết nối cơ sở dữ liệu MongoDB Atlas THÀNH CÔNG!');

    // Đồng bộ lại rank theo số sao cho toàn bộ sinh viên trong DB
    await syncRanksByStars();
  } catch (err) {
    connectionError = err.message;
    isMongoDBConnected = false;
    activeDatabaseType = 'in-memory-fallback';
    console.warn('⚠️ [MongoDB Atlas] Không thể kết nối trực tiếp (' + err.message + '). Đang kích hoạt chế độ Fallback In-Memory để hệ thống tiếp tục vận hành trơn tru!');
  }
}

/**
 * Lấy danh sách Trainees từ MongoDB Atlas (hoặc Fallback InMemory nếu mất kết nối DB)
 * Bảng xếp hạng sắp xếp mặc định thuần túy dựa trên SỐ SAO TÍCH LŨY (accumulatedStars)
 */
async function getAllTrainees({ search = '', track = '', sort = 'stars_desc' } = {}) {
  if (isMongoDBConnected) {
    try {
      const andClauses = [];
      if (search && search.trim()) {
        const safeSearch = escapeRegex(search.trim());
        andClauses.push({
          $or: [
            { fullName: { $regex: safeSearch, $options: 'i' } },
            { traineeId: { $regex: safeSearch, $options: 'i' } },
            { email: { $regex: safeSearch, $options: 'i' } }
          ]
        });
      }
      if (track && track !== 'all') {
        const safeTrack = escapeRegex(track.trim());
        andClauses.push({
          $or: [
            { track: { $regex: safeTrack, $options: 'i' } },
            { department: { $regex: safeTrack, $options: 'i' } }
          ]
        });
      }

      const query = andClauses.length > 0 ? { $and: andClauses } : {};

      let sortOption = { accumulatedStars: -1 };
      if (sort === 'stars_desc') sortOption = { accumulatedStars: -1 };
      else if (sort === 'stars_asc') sortOption = { accumulatedStars: 1 };
      else if (sort === 'attended_desc') sortOption = { attendedSessions: -1 };
      else if (sort === 'name_asc') sortOption = { fullName: 1 };
      else if (sort === 'gpa_desc') sortOption = { cumulativeGpa: -1 };
      else sortOption = { accumulatedStars: -1 };

      const trainees = await Trainee.find(query).select('-password').sort(sortOption).lean();

      return trainees.map((t, idx) => {
        delete t.password;
        t.assignmentClassification = computeAssignmentClassification(t.assignmentScore);
        if (sort === 'stars_desc' || !sort) {
          t.currentRank = idx + 1;
          t.rank = idx + 1;
        }
        if (!t.avatar || !t.avatar.startsWith('data:image')) {
          t.avatar = getDicebearAvatarUrl(t.traineeId, t.fullName);
        }
        return attachRealStarHistory(t);
      });
    } catch (err) {
      console.warn('Lỗi đọc Trainees từ MongoDB, chuyển sang Fallback InMemory:', err.message);
    }
  }

  // Fallback InMemory khi DB chưa sẵn sàng / rớt mạng
  let list = inMemoryTrainees.map(t => ({ ...t }));
  if (search && search.trim()) {
    const s = search.trim().toLowerCase();
    list = list.filter(t => 
      (t.fullName && t.fullName.toLowerCase().includes(s)) ||
      (t.traineeId && t.traineeId.toLowerCase().includes(s)) ||
      (t.email && t.email.toLowerCase().includes(s))
    );
  }
  if (track && track !== 'all') {
    list = list.filter(t => (t.track || '').includes(track) || (t.department || '').includes(track));
  }

  // Sắp xếp
  if (sort === 'stars_desc' || !sort) {
    list.sort((a, b) => (Number(b.accumulatedStars) || 0) - (Number(a.accumulatedStars) || 0));
  } else if (sort === 'stars_asc') {
    list.sort((a, b) => (Number(a.accumulatedStars) || 0) - (Number(b.accumulatedStars) || 0));
  } else if (sort === 'attended_desc') {
    list.sort((a, b) => (Number(b.attendedSessions) || 0) - (Number(a.attendedSessions) || 0));
  } else if (sort === 'name_asc') {
    list.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
  }

  return list.map((t, idx) => {
    delete t.password;
    t.assignmentClassification = computeAssignmentClassification(t.assignmentScore);
    if (sort === 'stars_desc' || !sort) {
      t.currentRank = idx + 1;
      t.rank = idx + 1;
    }
    if (!t.avatar || !t.avatar.startsWith('data:image')) {
      t.avatar = getDicebearAvatarUrl(t.traineeId, t.fullName);
    }
    return attachRealStarHistory(t);
  });
}

function attachRealStarHistory(trainee) {
  if (!trainee) return trainee;
  const n = Number(trainee.accumulatedStars) || 0;

  // Khởi tạo chi tiết sao từng buổi (sessionStars) nếu chưa có
  if (!trainee.sessionStars || trainee.sessionStars.length === 0) {
    const w1 = Math.max(1, Math.round(n * 0.22));
    const w2 = Math.max(1, Math.round(n * 0.26));
    const w3 = Math.max(1, Math.round(n * 0.24));
    const w4 = Math.max(0, n - (w1 + w2 + w3));

    trainee.sessionStars = [
      {
        sessionCode: 'TP-M10.01',
        sessionTitle: 'Buổi 1: Khởi động Trainee Program & Tổng quan Hệ thống',
        sessionDate: '2026-10-06',
        stage: 'Giai đoạn 1',
        stageName: 'Training',
        starsAwarded: w1,
        cumulativeStars: w1,
        note: 'Điểm danh đúng giờ, làm quen hệ thống và đạt điểm test đầu vào xuất sắc',
        trainerName: 'Võ Thị Xuân Quỳnh',
        createdAt: new Date('2026-10-06T21:30:00Z')
      },
      {
        sessionCode: 'TP-M10.02',
        sessionTitle: 'Buổi 2: Thiết kế Cơ sở dữ liệu MongoDB Atlas & Mongoose Modeling',
        sessionDate: '2026-10-13',
        stage: 'Giai đoạn 1',
        stageName: 'Training',
        starsAwarded: w2,
        cumulativeStars: w1 + w2,
        note: 'Hoàn thành mô hình hóa Schema MongoDB Atlas và tối ưu quan hệ dữ liệu',
        trainerName: 'Võ Thị Xuân Quỳnh',
        createdAt: new Date('2026-10-13T21:30:00Z')
      },
      {
        sessionCode: 'TP-M10.03',
        sessionTitle: 'Buổi 3: Xây dựng RESTful API, Middleware & Cơ chế Phân quyền',
        sessionDate: '2026-10-20',
        stage: 'Giai đoạn 1',
        stageName: 'Training',
        starsAwarded: w3,
        cumulativeStars: w1 + w2 + w3,
        note: 'Thực hành API Middleware, xử lý xác thực bảo mật & phân quyền Role chuẩn UIT',
        trainerName: 'Võ Thị Xuân Quỳnh',
        createdAt: new Date('2026-10-20T21:30:00Z')
      },
      {
        sessionCode: 'TP-M10.04',
        sessionTitle: 'Buổi 4: Hoàn thiện Giao diện Portal, Tích hợp Thời khóa biểu Trực tuyến',
        sessionDate: '2026-10-27',
        stage: 'Giai đoạn 1',
        stageName: 'Training',
        starsAwarded: w4,
        cumulativeStars: n,
        note: 'Hoàn thiện giao diện Portal, đáp ứng chuẩn Responsive Mobile & Dark Mode',
        trainerName: 'Võ Thị Xuân Quỳnh',
        createdAt: new Date('2026-10-27T21:30:00Z')
      }
    ];
  }

  // Tự động đồng bộ biểu đồ Diễn biến sao từ danh sách chi tiết các buổi học
  if (trainee.sessionStars && trainee.sessionStars.length > 0) {
    trainee.starHistory = trainee.sessionStars.map((s, idx) => ({
      period: `Buổi ${idx + 1}`,
      periodStars: Number(s.starsAwarded) || 0,
      cumulativeStars: Number(s.cumulativeStars) || 0
    }));
  }

  if (!trainee.mentor) {
    trainee.mentor = {
      name: 'Võ Thị Xuân Quỳnh',
      role: 'Trainer Trainee Program',
      email: 'quynhvtx@uit.edu.vn',
      phone: '0904607220',
      avatarInitial: 'VQ'
    };
  } else {
    trainee.mentor.name = 'Võ Thị Xuân Quỳnh';
    trainee.mentor.role = 'Trainer Trainee Program';
    trainee.mentor.avatarInitial = 'VQ';
    trainee.mentor.email = 'quynhvtx@uit.edu.vn';
  }
  return trainee;
}

/**
 * Lấy chi tiết 1 Trainee theo traineeId hoặc _id từ MongoDB Atlas (hoặc Fallback InMemory)
 */
async function getTraineeById(id) {
  const cleanId = String(id || '').trim();
  if (!cleanId) return null;

  if (isMongoDBConnected) {
    try {
      let trainee = await Trainee.findOne({ traineeId: cleanId }).select('-password').lean();
      if (!trainee && mongoose.Types.ObjectId.isValid(cleanId)) {
        trainee = await Trainee.findById(cleanId).select('-password').lean();
      }

      if (trainee) {
        delete trainee.password;
        if (!trainee.avatar || !trainee.avatar.startsWith('data:image')) {
          trainee.avatar = getDicebearAvatarUrl(trainee.traineeId, trainee.fullName);
        }
        trainee.assignmentClassification = computeAssignmentClassification(trainee.assignmentScore);
        return attachRealStarHistory(trainee);
      }
    } catch (err) {
      console.warn('Lỗi getTraineeById từ MongoDB, chuyển sang InMemory:', err.message);
    }
  }

  // Fallback InMemory
  let trainee = inMemoryTrainees.find(t => t.traineeId === cleanId);
  if (trainee) {
    const copy = { ...trainee };
    delete copy.password;
    if (!copy.avatar || !copy.avatar.startsWith('data:image')) {
      copy.avatar = getDicebearAvatarUrl(copy.traineeId, copy.fullName);
    }
    copy.assignmentClassification = computeAssignmentClassification(copy.assignmentScore);
    return attachRealStarHistory(copy);
  }

  return null;
}

/**
 * Lấy danh sách thông báo từ MongoDB Atlas (hoặc Fallback)
 */
async function getAnnouncements() {
  if (isMongoDBConnected) {
    try {
      const list = await Announcement.find().sort({ createdAt: -1 }).lean();
      if (list && list.length > 0) return list;
    } catch (e) {
      console.warn('Lỗi getAnnouncements từ MongoDB, dùng mock:', e.message);
    }
  }
  return mockAnnouncements || [];
}

/**
 * Tạo mới 1 Trainee trong database MongoDB Atlas (Chỉ Admin)
 */
async function createTrainee(data) {
  if (!data.traineeId || !data.fullName) {
    throw new Error('Vui lòng nhập đầy đủ Mã sinh viên (MSSV) và Họ tên!');
  }

  const cleanTraineeId = String(data.traineeId).trim();

  // Kiểm tra trùng lặp
  if (isMongoDBConnected) {
    const existing = await Trainee.findOne({ traineeId: cleanTraineeId });
    if (existing) {
      throw new Error(`Mã sinh viên ${cleanTraineeId} đã tồn tại trong database!`);
    }
  } else {
    const existingMem = inMemoryTrainees.find(t => t.traineeId === cleanTraineeId);
    if (existingMem) {
      throw new Error(`Mã sinh viên ${cleanTraineeId} đã tồn tại trong danh sách!`);
    }
  }

  const stars = Number(data.accumulatedStars) || 0;
  const attended = Number(data.attendedSessions) || 0;
  const total = Number(data.totalSessions) || 45;
  const excused = Number(data.absentExcused) || 0;
  const unexcused = Number(data.absentUnexcused) || 0;
  const rate = total > 0 ? Math.round((attended / total) * 1000) / 10 : 100;
  const assignScore = Number(data.assignmentScore) !== undefined && !isNaN(Number(data.assignmentScore)) ? Number(data.assignmentScore) : 8.0;

  // Hash password bằng scrypt an toàn
  const rawPass = String(data.password || '1234').trim();
  const hashedPassword = hashPassword(rawPass);

  const newDoc = {
    traineeId: cleanTraineeId,
    fullName: String(data.fullName).trim(),
    email: String(data.email || `${cleanTraineeId}@trainee.uit.edu.vn`).trim(),
    department: String(data.department || 'Khoa Khoa học Máy tính').trim(),
    track: String(data.track || 'Khoa học Máy tính').trim(),
    batch: String(data.batch || 'Trainee 2026').trim(),
    status: data.status === 'completed' || data.status === 'paused' ? data.status : 'active',
    bio: String(data.bio || '').trim(),
    skills: Array.isArray(data.skills) ? data.skills.map(s => String(s).trim()) : ['Node.js', 'React', 'MongoDB'],
    accumulatedStars: stars,
    starClassification: stars >= 40 ? 'Hạng Kim Cương ⭐⭐⭐⭐' : stars >= 30 ? 'Hạng Vàng ⭐⭐⭐' : 'Hạng Bạc ⭐⭐',
    starTrend: '+2 sao tuần này',
    starTrendIsPositive: true,
    attendedSessions: attended,
    totalSessions: total,
    absentExcused: excused,
    absentUnexcused: unexcused,
    attendanceRate: rate,
    attendanceNote: `Đã tham gia: <span>${attended}</span> buổi · Vắng có phép: <span>${excused}</span> · Không phép: <span>${unexcused}</span>`,
    assignmentScore: assignScore,
    assignmentClassification: computeAssignmentClassification(assignScore),
    completedAssignments: Number(data.completedAssignments) || 12,
    totalAssignments: Number(data.totalAssignments) || 15,
    assignmentNote: `Đạt tiêu chuẩn yêu cầu Trainee Program`,
    avatar: data.avatar && data.avatar.startsWith('data:image') ? data.avatar : getDicebearAvatarUrl(cleanTraineeId, data.fullName),
    password: hashedPassword,
    role: 'student'
  };

  if (isMongoDBConnected) {
    const created = await Trainee.create(newDoc);
    await syncRanksByStars();
    const obj = created.toObject();
    delete obj.password;
    return obj;
  }

  // Fallback InMemory
  inMemoryTrainees.push(newDoc);
  const obj = { ...newDoc };
  delete obj.password;
  return obj;
}

/**
 * Cập nhật thông tin Trainee trong MongoDB Atlas (Chỉ Admin)
 */
async function updateTrainee(id, updateData) {
  const allowedFields = [
    'fullName', 'email', 'department', 'track', 'batch', 'status',
    'bio', 'skills', 'avatar', 'accumulatedStars', 'attendedSessions',
    'totalSessions', 'absentExcused', 'absentUnexcused', 'assignmentScore',
    'completedAssignments', 'totalAssignments', 'sessionStars'
  ];

  const safeData = {};
  for (const field of allowedFields) {
    if (updateData[field] !== undefined) {
      safeData[field] = updateData[field];
    }
  }

  if (safeData.attendedSessions !== undefined || safeData.totalSessions !== undefined || safeData.absentExcused !== undefined || safeData.absentUnexcused !== undefined) {
    const attended = Number(safeData.attendedSessions) || 0;
    const total = Number(safeData.totalSessions) || 45;
    const excused = Number(safeData.absentExcused) || 0;
    const unexcused = Number(safeData.absentUnexcused) || 0;
    safeData.attendanceRate = total > 0 ? Math.round((attended / total) * 1000) / 10 : 100;
    safeData.attendanceNote = `Đã tham gia: <span>${attended}</span> buổi · Vắng có phép: <span>${excused}</span> · Không phép: <span>${unexcused}</span>`;
  }

  if (Array.isArray(safeData.sessionStars)) {
    safeData.sessionStars.sort((a, b) => {
      if (a.sessionDate && b.sessionDate) return new Date(a.sessionDate) - new Date(b.sessionDate);
      return (a.sessionCode || '').localeCompare(b.sessionCode || '');
    });

    let running = 0;
    safeData.sessionStars.forEach((s) => {
      running += Number(s.starsAwarded) || 0;
      s.cumulativeStars = running;
    });

    safeData.accumulatedStars = running;
    safeData.starClassification = running >= 40 ? 'Hạng Kim Cương ⭐⭐⭐⭐' : running >= 30 ? 'Hạng Vàng ⭐⭐⭐' : 'Hạng Bạc ⭐⭐';
    safeData.starHistory = safeData.sessionStars.map((s, idx) => ({
      period: `Buổi ${idx + 1}`,
      periodStars: Number(s.starsAwarded) || 0,
      cumulativeStars: Number(s.cumulativeStars) || 0
    }));
  } else if (safeData.accumulatedStars !== undefined) {
    const stars = Number(safeData.accumulatedStars);
    safeData.starClassification = stars >= 40 ? 'Hạng Kim Cương ⭐⭐⭐⭐' : stars >= 30 ? 'Hạng Vàng ⭐⭐⭐' : 'Hạng Bạc ⭐⭐';
  }

  if (safeData.assignmentScore !== undefined) {
    const score = Number(safeData.assignmentScore);
    safeData.assignmentClassification = computeAssignmentClassification(score);
  }

  if (updateData.password !== undefined) {
    const pw = String(updateData.password).trim();
    if (pw) {
      safeData.password = hashPassword(pw);
    }
  }

  if (isMongoDBConnected) {
    let updated = await Trainee.findOneAndUpdate(
      { traineeId: id },
      { $set: safeData },
      { new: true }
    ).select('-password').lean();

    if (!updated && mongoose.Types.ObjectId.isValid(id)) {
      updated = await Trainee.findByIdAndUpdate(
        id,
        { $set: safeData },
        { new: true }
      ).select('-password').lean();
    }

    if (!updated) {
      throw new Error(`Không tìm thấy sinh viên với mã ${id} để cập nhật!`);
    }

    await syncRanksByStars();
    const refreshed = await getTraineeById(id);
    return refreshed || updated;
  }

  // Fallback InMemory
  let idx = inMemoryTrainees.findIndex(t => t.traineeId === id);
  if (idx === -1) {
    throw new Error(`Không tìm thấy sinh viên với mã ${id} để cập nhật!`);
  }
  Object.assign(inMemoryTrainees[idx], safeData);
  return getTraineeById(id);
}

/**
 * Xóa Trainee khỏi MongoDB Atlas (Chỉ Admin)
 */
async function deleteTrainee(id) {
  const cleanId = String(id || '').trim();
  const safeRegex = escapeRegex(cleanId);

  if (isMongoDBConnected) {
    let deleted = await Trainee.findOneAndDelete({ traineeId: cleanId }).lean();
    if (!deleted) {
      deleted = await Trainee.findOneAndDelete({ traineeId: { $regex: new RegExp(`^${safeRegex}$`, 'i') } }).lean();
    }
    if (!deleted && mongoose.Types.ObjectId.isValid(cleanId)) {
      deleted = await Trainee.findByIdAndDelete(cleanId).lean();
    }

    if (!deleted) {
      throw new Error(`Không tìm thấy sinh viên với mã ${cleanId} để xóa!`);
    }

    try {
      await syncRanksByStars();
    } catch (syncErr) {
      console.warn('Lỗi khi cập nhật lại thứ hạng sau khi xóa:', syncErr.message);
    }

    delete deleted.password;
    return deleted;
  }

  // Fallback InMemory
  let idx = inMemoryTrainees.findIndex(t => t.traineeId === cleanId);
  if (idx === -1) {
    throw new Error(`Không tìm thấy sinh viên với mã ${cleanId} để xóa!`);
  }
  const removed = inMemoryTrainees.splice(idx, 1)[0];
  delete removed.password;
  return removed;
}

/**
 * Xác thực đăng nhập: CHỈ CHO PHÉP DUY NHẤT TÀI KHOẢN ADMIN ĐĂNG NHẬP
 * Sinh viên không cần đăng nhập, có thể trực tiếp vào xem lịch học và thứ hạng của các MSSV.
 */
async function authenticateUser(username, password) {
  const u = (username || '').trim();
  const p = (password || '').trim();
  const uLower = u.toLowerCase();

  const adminUser = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
  const adminPass = (process.env.ADMIN_PASSWORD || '1234').trim();

  // 1. Chỉ tài khoản Admin mới có quyền đăng nhập vào hệ thống
  if (uLower === adminUser) {
    if (verifyPassword(p, adminPass)) {
      return {
        success: true,
        user: {
          username: 'admin',
          fullName: 'Quản Trị Viên (Admin)',
          role: 'admin',
          avatar: 'https://api.dicebear.com/9.x/bottts/svg?seed=uit-admin&backgroundColor=d1d4f9',
          email: 'admin@uit.edu.vn'
        }
      };
    }
    return {
      success: false,
      message: 'Mật khẩu Quản trị viên (Admin) không chính xác!'
    };
  }

  // 2. Nếu đăng nhập bằng MSSV hoặc tài khoản khác, thông báo rõ sinh viên không cần đăng nhập
  return {
    success: false,
    message: 'Chỉ tài khoản Quản trị viên (Admin) mới cần đăng nhập vào hệ thống! Sinh viên không cần đăng nhập, có thể trực tiếp tra cứu lịch học và thứ hạng các MSSV.'
  };
}

/**
 * Dữ liệu mặc định Lịch học Tháng 10 dành cho Trainee Program (Học Online, MS Teams link gán sau)
 */
const DEFAULT_OCTOBER_SCHEDULES = [
  {
    title: 'Buổi 1: Khởi động Trainee Program & Tổng quan Hệ thống',
    code: 'TP-M10.01',
    month: 10,
    year: 2026,
    date: '2026-10-06',
    dayOfWeekText: 'Thứ 3',
    startTime: '19:30',
    endTime: '21:30',
    periods: 'Tiết 1 - 4 (Tối)',
    type: 'Online',
    instructor: 'TS. Dương Việt Hằng',
    room: 'MS Teams Trực Tuyến',
    teamsUrl: '',
    note: 'Cài đặt môi trường Node.js & Git. Giới thiệu tổng quan cấu trúc chương trình đào tạo.',
    status: 'completed',
    credits: 3
  },
  {
    title: 'Buổi 2: Thiết kế Cơ sở dữ liệu MongoDB Atlas & Mongoose Modeling',
    code: 'TP-M10.02',
    month: 10,
    year: 2026,
    date: '2026-10-13',
    dayOfWeekText: 'Thứ 3',
    startTime: '19:30',
    endTime: '21:30',
    periods: 'Tiết 1 - 4 (Tối)',
    type: 'Online',
    instructor: 'ThS. Dương Phi Long',
    room: 'MS Teams Trực Tuyến',
    teamsUrl: '',
    note: 'Kết nối MongoDB cluster, schema validation và tối ưu chỉ mục index.',
    status: 'completed',
    credits: 3
  },
  {
    title: 'Buổi 3: Xây dựng RESTful API, Middleware & Cơ chế Phân quyền',
    code: 'TP-M10.03',
    month: 10,
    year: 2026,
    date: '2026-10-20',
    dayOfWeekText: 'Thứ 3',
    startTime: '19:30',
    endTime: '21:30',
    periods: 'Tiết 1 - 4 (Tối)',
    type: 'Online',
    instructor: 'ThS. Phạm Minh Quân',
    room: 'MS Teams Trực Tuyến',
    teamsUrl: '',
    note: 'Thực hành viết API xác thực, phân quyền Admin & Student.',
    status: 'completed',
    credits: 3
  },
  {
    title: 'Buổi 4: Hoàn thiện Giao diện Portal, Tích hợp Thời khóa biểu Trực tuyến',
    code: 'TP-M10.04',
    month: 10,
    year: 2026,
    date: '2026-10-27',
    dayOfWeekText: 'Thứ 3',
    startTime: '19:30',
    endTime: '21:30',
    periods: 'Tiết 1 - 4 (Tối)',
    type: 'Online',
    instructor: 'ThS. Trần Thị Dung',
    room: 'MS Teams Trực Tuyến',
    teamsUrl: '',
    note: 'Đánh giá tiến độ giữa kỳ và kiểm tra tích hợp link MS Teams vào học trực tuyến.',
    status: 'live',
    credits: 3
  },
  {
    title: 'Buổi 5: Tối ưu Trải nghiệm, Tải dữ liệu Báo cáo & Đồ án Khóa học',
    code: 'TP-M10.05',
    month: 10,
    year: 2026,
    date: '2026-10-29',
    dayOfWeekText: 'Thứ 5',
    startTime: '19:30',
    endTime: '21:30',
    periods: 'Tiết 1 - 4 (Tối)',
    type: 'Online',
    instructor: 'TS. Dương Việt Hằng',
    room: 'MS Teams Trực Tuyến',
    teamsUrl: '',
    note: 'Hướng dẫn xuất báo cáo Excel, PDF, lịch iCal và nộp đồ án Trainee.',
    status: 'upcoming',
    credits: 3
  }
];

function computeDayOfWeekText(dateStr) {
  if (!dateStr) return 'Thứ 2';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    const dayNames = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    return dayNames[d.getDay()] || 'Thứ 2';
  } catch (e) {
    return 'Thứ 2';
  }
}

/**
 * Lấy danh sách lịch học chung theo tháng (Mặc định tháng 10/2026)
 */
async function getAllSchedules({ month = 10, year = 2026 } = {}) {
  if (!isMongoDBConnected) {
    await connectDB();
  }

  if (isMongoDBConnected) {
    const m = Number(month) || 10;
    const y = Number(year) || 2026;

    let items = await Schedule.find({ month: m, year: y }).sort({ date: 1, startTime: 1 }).lean();

    // Nếu chưa có lịch nào trong DB cho tháng 10, tự động khởi tạo lịch tháng 10 mẫu
    if (items.length === 0 && m === 10) {
      const inserted = await Schedule.insertMany(DEFAULT_OCTOBER_SCHEDULES);
      items = inserted.map(doc => doc.toObject());
    }

    return items;
  }

  // Fallback nếu không có kết nối DB
  return DEFAULT_OCTOBER_SCHEDULES.filter(s => s.month === Number(month) && s.year === Number(year));
}

/**
 * Tạo một buổi học mới vào lịch tháng (Chỉ Admin)
 */
async function createSchedule(data) {
  if (!data.title) {
    throw new Error('Vui lòng nhập tên buổi học / chuyên đề!');
  }

  const dateStr = data.date || '2026-10-27';
  const parsedDate = new Date(dateStr + 'T00:00:00');
  const month = data.month ? Number(data.month) : (parsedDate.getMonth() + 1);
  const year = data.year ? Number(data.year) : parsedDate.getFullYear();
  const dayText = data.dayOfWeekText || computeDayOfWeekText(dateStr);

  const doc = {
    title: String(data.title).trim(),
    code: String(data.code || `TP-M${month}.${Date.now().toString().slice(-2)}`).trim(),
    month,
    year,
    date: dateStr,
    dayOfWeekText: dayText,
    startTime: data.startTime || '19:30',
    endTime: data.endTime || '21:30',
    periods: data.periods || 'Tiết 1 - 4 (Tối)',
    type: data.type || 'Online',
    instructor: data.instructor || 'Mentor UIT',
    room: data.room || 'MS Teams Trực Tuyến',
    teamsUrl: data.teamsUrl ? String(data.teamsUrl).trim() : '',
    note: data.note ? String(data.note).trim() : '',
    status: data.status || 'upcoming',
    credits: Number(data.credits) || 3
  };

  if (isMongoDBConnected) {
    const created = await Schedule.create(doc);
    return created.toObject();
  }

  // Fallback InMemory
  const mockItem = { _id: 'sched_' + Date.now(), ...doc };
  DEFAULT_OCTOBER_SCHEDULES.push(mockItem);
  return mockItem;
}

/**
 * Cập nhật buổi học trong lịch tháng (Chỉ Admin - có thể gán link MS Teams)
 */
async function updateSchedule(id, data) {
  if (data.date && !data.dayOfWeekText) {
    data.dayOfWeekText = computeDayOfWeekText(data.date);
    const parsedDate = new Date(data.date + 'T00:00:00');
    data.month = parsedDate.getMonth() + 1;
    data.year = parsedDate.getFullYear();
  }

  if (isMongoDBConnected) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error(`ID buổi học "${id}" không hợp lệ!`);
    }

    const updated = await Schedule.findByIdAndUpdate(id, { $set: data }, { new: true }).lean();
    if (!updated) {
      throw new Error(`Không tìm thấy buổi học với ID: ${id}`);
    }

    return updated;
  }

  // Fallback InMemory
  let item = DEFAULT_OCTOBER_SCHEDULES.find(s => s._id === id || s.code === id);
  if (!item) {
    throw new Error(`Không tìm thấy buổi học với ID: ${id}`);
  }
  Object.assign(item, data);
  return item;
}

/**
 * Xóa một buổi học khỏi lịch tháng (Chỉ Admin)
 */
async function deleteSchedule(id) {
  if (isMongoDBConnected) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error(`ID buổi học "${id}" không hợp lệ!`);
    }

    const deleted = await Schedule.findByIdAndDelete(id).lean();
    if (!deleted) {
      throw new Error(`Không tìm thấy buổi học để xóa!`);
    }

    return deleted;
  }

  // Fallback InMemory
  const idx = DEFAULT_OCTOBER_SCHEDULES.findIndex(s => s._id === id || s.code === id);
  if (idx === -1) {
    throw new Error(`Không tìm thấy buổi học để xóa!`);
  }
  return DEFAULT_OCTOBER_SCHEDULES.splice(idx, 1)[0];
}

/**
 * Xóa toàn bộ lịch hoặc khởi tạo lại lịch tháng (Chỉ Admin)
 */
async function resetSchedules({ month = 10, year = 2026, reseed = true } = {}) {
  const m = Number(month) || 10;
  const y = Number(year) || 2026;

  if (isMongoDBConnected) {
    await Schedule.deleteMany({ month: m, year: y });
    let items = [];
    if (reseed && m === 10) {
      items = await Schedule.insertMany(DEFAULT_OCTOBER_SCHEDULES);
    }
    return {
      success: true,
      message: reseed ? `Đã làm mới lại toàn bộ lịch học Tháng ${m}/${y}!` : `Đã xóa sạch toàn bộ lịch học Tháng ${m}/${y}!`,
      count: items.length
    };
  }

  return {
    success: true,
    message: reseed ? `Đã làm mới lại toàn bộ lịch học Tháng ${m}/${y}!` : `Đã xóa sạch toàn bộ lịch học Tháng ${m}/${y}!`,
    count: DEFAULT_OCTOBER_SCHEDULES.length
  };
}

/**
 * Tạo mới yêu cầu hỗ trợ (Quên mật khẩu, feedback, v.v.)
 */
async function createSupportRequest(data) {
  let traineeId = String(data.traineeId || data.username || '').trim();
  if (!traineeId) {
    throw new Error('Vui lòng nhập Mã sinh viên (MSSV) hoặc tên tài khoản!');
  }

  let fullName = String(data.fullName || '').trim();
  let email = String(data.email || '').trim();

  // Tìm kiếm thông tin sinh viên từ database để bổ sung nếu thiếu
  if (isMongoDBConnected) {
    try {
      const trainee = await Trainee.findOne({
        $or: [
          { traineeId: traineeId },
          { email: traineeId }
        ]
      }).lean();

      if (trainee) {
        if (!fullName) fullName = trainee.fullName;
        if (!email) email = trainee.email;
        if (trainee.traineeId) traineeId = trainee.traineeId;
      }
    } catch (e) {
      console.warn('Lỗi tìm kiếm học viên khi tạo yêu cầu:', e.message);
    }
  } else {
    const memTrainee = inMemoryTrainees.find(t => t.traineeId === traineeId || t.email === traineeId);
    if (memTrainee) {
      if (!fullName) fullName = memTrainee.fullName;
      if (!email) email = memTrainee.email;
      if (memTrainee.traineeId) traineeId = memTrainee.traineeId;
    }
  }

  const doc = {
    _id: 'req_' + Date.now(),
    type: data.type || 'forgot_password',
    traineeId,
    fullName: fullName || traineeId,
    email: email || `${traineeId}@trainee.uit.edu.vn`,
    phone: String(data.phone || '').trim(),
    message: String(data.message || 'Yêu cầu cấp lại mật khẩu tài khoản').trim(),
    status: 'pending',
    createdAt: new Date()
  };

  if (isMongoDBConnected) {
    const created = await SupportRequest.create(doc);
    return created.toObject();
  }

  inMemorySupportRequests.unshift(doc);
  return doc;
}

/**
 * Lấy danh sách yêu cầu hỗ trợ (Chỉ Admin)
 */
async function getSupportRequests({ type, status } = {}) {
  if (isMongoDBConnected) {
    const query = {};
    if (type) query.type = type;
    if (status) query.status = status;
    return await SupportRequest.find(query).sort({ createdAt: -1 }).lean();
  }

  let list = [...inMemorySupportRequests];
  if (type) list = list.filter(r => r.type === type);
  if (status) list = list.filter(r => r.status === status);
  return list;
}

/**
 * Xử lý yêu cầu quên mật khẩu: Reset mật khẩu của Trainee về mật khẩu mới (Mặc định 1234)
 */
async function resolveSupportRequest(requestId, newPassword = '1234', adminUser = 'Admin') {
  const passToSet = String(newPassword || '1234').trim();
  const hashedPassword = hashPassword(passToSet);

  if (isMongoDBConnected) {
    const request = await SupportRequest.findById(requestId);
    if (!request) {
      throw new Error('Không tìm thấy yêu cầu hỗ trợ!');
    }

    let updatedTrainee = null;
    const matchCriteria = [];
    if (request.traineeId) matchCriteria.push({ traineeId: request.traineeId });
    if (request.email) matchCriteria.push({ email: request.email });

    if (matchCriteria.length > 0) {
      updatedTrainee = await Trainee.findOneAndUpdate(
        { $or: matchCriteria },
        { $set: { password: hashedPassword } },
        { new: true }
      ).select('-password');
    }

    request.status = 'resolved';
    request.resolvedPassword = '[Đã mã hóa an toàn]';
    request.resolvedBy = adminUser;
    request.resolvedAt = new Date();
    await request.save();

    return {
      request: request.toObject(),
      trainee: updatedTrainee ? updatedTrainee.toObject() : null
    };
  }

  // Fallback InMemory
  const reqItem = inMemorySupportRequests.find(r => r._id === requestId);
  if (!reqItem) {
    throw new Error('Không tìm thấy yêu cầu hỗ trợ!');
  }

  let trainee = inMemoryTrainees.find(t => t.traineeId === reqItem.traineeId || t.email === reqItem.email);
  if (trainee) {
    trainee.password = hashedPassword;
  }

  reqItem.status = 'resolved';
  reqItem.resolvedPassword = '[Đã mã hóa an toàn]';
  reqItem.resolvedBy = adminUser;
  reqItem.resolvedAt = new Date();

  return {
    request: reqItem,
    trainee: trainee || null
  };
}

/**
 * Xóa yêu cầu hỗ trợ
 */
async function deleteSupportRequest(requestId) {
  if (isMongoDBConnected) {
    return await SupportRequest.findByIdAndDelete(requestId).lean();
  }
  const idx = inMemorySupportRequests.findIndex(r => r._id === requestId);
  if (idx !== -1) {
    return inMemorySupportRequests.splice(idx, 1)[0];
  }
  return null;
}

/**
 * Lấy trạng thái kết nối Database
 */
function getDatabaseStatus() {
  return {
    isMongoDBConnected,
    activeDatabaseType,
    connectionError,
    uri: process.env.MONGODB_URI ? process.env.MONGODB_URI.replace(/:([^:@]{4,})@/, ':****@') : ''
  };
}

/**
 * Admin tổng hợp và cộng sao theo buổi học cho sinh viên (ràng buộc chặt chẽ theo từng buổi học)
 */
async function awardSessionStars({ traineeId = 'all', scheduleCode = '', scheduleTitle = '', sessionDate = '', stage = 'Giai đoạn 1', stageName = 'Training', starsAwarded = 0, note = '', trainerName = 'Võ Thị Xuân Quỳnh' } = {}) {
  const addStars = Number(starsAwarded) || 0;
  const targetDate = sessionDate || new Date().toISOString().split('T')[0];
  const targetTrainer = trainerName || 'Võ Thị Xuân Quỳnh';
  const targetTitle = scheduleTitle || 'Buổi học Trainee Program';
  const targetCode = scheduleCode || 'TP-M10.0X';
  const targetNote = note || 'Hoàn thành bài tập & tham gia tích cực buổi học';

  if (!isMongoDBConnected) {
    // Chế độ in-memory
    const targetTrainees = (traineeId === 'all' || !traineeId) 
      ? inMemoryTrainees 
      : inMemoryTrainees.filter(t => t.traineeId === traineeId);

    if (targetTrainees.length === 0) {
      throw new Error(`Không tìm thấy sinh viên có mã: ${traineeId}`);
    }

    for (const t of targetTrainees) {
      if (!t.sessionStars || t.sessionStars.length === 0) {
        attachRealStarHistory(t);
      }
      const existingIndex = t.sessionStars.findIndex(s => s.sessionCode === targetCode);
      if (existingIndex >= 0) {
        t.sessionStars[existingIndex].starsAwarded = addStars;
        t.sessionStars[existingIndex].sessionTitle = targetTitle;
        t.sessionStars[existingIndex].sessionDate = targetDate;
        t.sessionStars[existingIndex].trainerName = targetTrainer;
        t.sessionStars[existingIndex].note = targetNote;
      } else {
        t.sessionStars.push({
          _id: 'star_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          sessionCode: targetCode,
          sessionTitle: targetTitle,
          sessionDate: targetDate,
          stage: stage || 'Giai đoạn 1',
          stageName: stageName || 'Training',
          starsAwarded: addStars,
          cumulativeStars: 0,
          note: targetNote,
          trainerName: targetTrainer,
          createdAt: new Date()
        });
      }

      t.sessionStars.sort((a, b) => {
        if (a.sessionDate && b.sessionDate) return new Date(a.sessionDate) - new Date(b.sessionDate);
        return (a.sessionCode || '').localeCompare(b.sessionCode || '');
      });

      let running = 0;
      t.sessionStars.forEach((s) => {
        running += Number(s.starsAwarded) || 0;
        s.cumulativeStars = running;
      });

      t.accumulatedStars = running;
      t.starClassification = running >= 40 ? 'Hạng Kim Cương ⭐⭐⭐⭐' : running >= 30 ? 'Hạng Vàng ⭐⭐⭐' : 'Hạng Bạc ⭐⭐';
      t.starHistory = t.sessionStars.map((s, idx) => ({
        period: `Buổi ${idx + 1}`,
        periodStars: Number(s.starsAwarded) || 0,
        cumulativeStars: Number(s.cumulativeStars) || 0
      }));
    }

    if (traineeId === 'all' || !traineeId) {
      return {
        success: true,
        count: targetTrainees.length,
        message: `Đã cập nhật/cộng ${addStars} ⭐ thành công cho ${targetTrainees.length} sinh viên tại ${targetTitle} (In-Memory)!`
      };
    } else {
      const refreshed = await getTraineeById(traineeId);
      return {
        success: true,
        trainee: refreshed,
        message: `Đã cập nhật ${addStars} ⭐ thành công cho sinh viên ${targetTrainees[0].fullName} tại ${targetTitle}!`
      };
    }
  }

  // Nếu cộng cho TẤT CẢ sinh viên trên MongoDB
  if (traineeId === 'all' || !traineeId) {
    const trainees = await Trainee.find();
    const updatedList = [];

    for (const t of trainees) {
      if (!t.sessionStars || t.sessionStars.length === 0) {
        attachRealStarHistory(t);
      }

      const existingIndex = t.sessionStars.findIndex(s => s.sessionCode === targetCode);
      if (existingIndex >= 0) {
        // Cập nhật buổi học đã có
        t.sessionStars[existingIndex].starsAwarded = addStars;
        t.sessionStars[existingIndex].sessionTitle = targetTitle;
        t.sessionStars[existingIndex].sessionDate = targetDate;
        t.sessionStars[existingIndex].trainerName = targetTrainer;
        t.sessionStars[existingIndex].note = targetNote;
      } else {
        // Thêm buổi học mới
        t.sessionStars.push({
          sessionCode: targetCode,
          sessionTitle: targetTitle,
          sessionDate: targetDate,
          stage: stage || 'Giai đoạn 1',
          stageName: stageName || 'Training',
          starsAwarded: addStars,
          cumulativeStars: 0,
          note: targetNote,
          trainerName: targetTrainer,
          createdAt: new Date()
        });
      }

      // Sắp xếp lại theo ngày học
      t.sessionStars.sort((a, b) => {
        if (a.sessionDate && b.sessionDate) return new Date(a.sessionDate) - new Date(b.sessionDate);
        return (a.sessionCode || '').localeCompare(b.sessionCode || '');
      });

      // Tính lại lũy kế và tổng sao chuẩn xác
      let running = 0;
      t.sessionStars.forEach((s) => {
        running += Number(s.starsAwarded) || 0;
        s.cumulativeStars = running;
      });

      t.accumulatedStars = running;
      t.starClassification = running >= 40 ? 'Hạng Kim Cương ⭐⭐⭐⭐' : running >= 30 ? 'Hạng Vàng ⭐⭐⭐' : 'Hạng Bạc ⭐⭐';
      t.starHistory = t.sessionStars.map((s, idx) => ({
        period: `Buổi ${idx + 1}`,
        periodStars: Number(s.starsAwarded) || 0,
        cumulativeStars: Number(s.cumulativeStars) || 0
      }));

      await t.save();
      updatedList.push(t);
    }

    // Tự động sắp xếp lại thứ hạng theo số sao sau khi cộng
    await syncRanksByStars();

    return {
      success: true,
      count: updatedList.length,
      message: `Đã cập nhật/cộng ${addStars} ⭐ thành công cho ${updatedList.length} sinh viên tại ${targetTitle}!`
    };
  }

  // Nếu cộng cho 1 sinh viên cụ thể
  let trainee = await Trainee.findOne({ traineeId });
  if (!trainee && mongoose.Types.ObjectId.isValid(traineeId)) {
    trainee = await Trainee.findById(traineeId);
  }

  if (!trainee) {
    throw new Error(`Không tìm thấy sinh viên có mã: ${traineeId}`);
  }

  if (!trainee.sessionStars || trainee.sessionStars.length === 0) {
    attachRealStarHistory(trainee);
  }

  const existingIndex = trainee.sessionStars.findIndex(s => s.sessionCode === targetCode);
  if (existingIndex >= 0) {
    trainee.sessionStars[existingIndex].starsAwarded = addStars;
    trainee.sessionStars[existingIndex].sessionTitle = targetTitle;
    trainee.sessionStars[existingIndex].sessionDate = targetDate;
    trainee.sessionStars[existingIndex].trainerName = targetTrainer;
    trainee.sessionStars[existingIndex].note = targetNote;
  } else {
    trainee.sessionStars.push({
      sessionCode: targetCode,
      sessionTitle: targetTitle,
      sessionDate: targetDate,
      stage: stage || 'Giai đoạn 1',
      stageName: stageName || 'Training',
      starsAwarded: addStars,
      cumulativeStars: 0,
      note: targetNote,
      trainerName: targetTrainer,
      createdAt: new Date()
    });
  }

  // Sắp xếp lại theo ngày học
  trainee.sessionStars.sort((a, b) => {
    if (a.sessionDate && b.sessionDate) return new Date(a.sessionDate) - new Date(b.sessionDate);
    return (a.sessionCode || '').localeCompare(b.sessionCode || '');
  });

  // Tính lại lũy kế và tổng sao
  let running = 0;
  trainee.sessionStars.forEach((s) => {
    running += Number(s.starsAwarded) || 0;
    s.cumulativeStars = running;
  });

  trainee.accumulatedStars = running;
  trainee.starClassification = running >= 40 ? 'Hạng Kim Cương ⭐⭐⭐⭐' : running >= 30 ? 'Hạng Vàng ⭐⭐⭐' : 'Hạng Bạc ⭐⭐';
  trainee.starHistory = trainee.sessionStars.map((s, idx) => ({
    period: `Buổi ${idx + 1}`,
    periodStars: Number(s.starsAwarded) || 0,
    cumulativeStars: Number(s.cumulativeStars) || 0
  }));

  await trainee.save();
  await syncRanksByStars();

  const refreshed = await getTraineeById(trainee.traineeId);
  return {
    success: true,
    trainee: refreshed,
    message: `Đã cập nhật ${addStars} ⭐ thành công cho sinh viên ${trainee.fullName} tại ${targetTitle}!`
  };
}

/**
 * Admin cập nhật danh sách sao theo từng buổi học cho tất cả sinh viên (Ràng buộc chặt chẽ theo buổi)
 */
async function batchUpdateSessionStars({
  sessionCode = '',
  sessionTitle = '',
  sessionDate = '',
  trainerName = 'Võ Thị Xuân Quỳnh',
  stage = 'Giai đoạn 1',
  stageName = 'Training',
  studentRatings = [] // array of { traineeId, starsAwarded, note }
} = {}) {
  if (!sessionCode) {
    throw new Error('Vui lòng chọn hoặc nhập mã buổi học!');
  }

  if (!isMongoDBConnected) {
    // In-Memory Fallback
    const updatedTrainees = [];
    for (const t of inMemoryTrainees) {
      if (!t.sessionStars || t.sessionStars.length === 0) {
        attachRealStarHistory(t);
      }

      const rating = studentRatings.find(r => r.traineeId === t.traineeId);
      const awarded = rating && rating.starsAwarded !== undefined ? (Number(rating.starsAwarded) || 0) : null;
      const note = rating ? (rating.note || '') : '';

      let existingIndex = t.sessionStars.findIndex(s => s.sessionCode === sessionCode);
      if (existingIndex >= 0) {
        if (awarded !== null) {
          t.sessionStars[existingIndex].starsAwarded = awarded;
          if (note) t.sessionStars[existingIndex].note = note;
        }
        if (sessionTitle) t.sessionStars[existingIndex].sessionTitle = sessionTitle;
        if (sessionDate) t.sessionStars[existingIndex].sessionDate = sessionDate;
        if (trainerName) t.sessionStars[existingIndex].trainerName = trainerName;
        if (stage) t.sessionStars[existingIndex].stage = stage;
        if (stageName) t.sessionStars[existingIndex].stageName = stageName;
      } else if (awarded !== null) {
        t.sessionStars.push({
          _id: 'star_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          sessionCode,
          sessionTitle: sessionTitle || `Buổi học ${sessionCode}`,
          sessionDate: sessionDate || new Date().toISOString().split('T')[0],
          trainerName: trainerName || 'Võ Thị Xuân Quỳnh',
          stage: stage || 'Giai đoạn 1',
          stageName: stageName || 'Training',
          starsAwarded: awarded,
          cumulativeStars: 0,
          note: note || 'Hoàn thành buổi học',
          createdAt: new Date()
        });
      }

      t.sessionStars.sort((a, b) => {
        if (a.sessionDate && b.sessionDate) return new Date(a.sessionDate) - new Date(b.sessionDate);
        return (a.sessionCode || '').localeCompare(b.sessionCode || '');
      });

      let running = 0;
      t.sessionStars.forEach(s => {
        running += Number(s.starsAwarded) || 0;
        s.cumulativeStars = running;
      });

      t.accumulatedStars = running;
      t.starClassification = running >= 40 ? 'Hạng Kim Cương ⭐⭐⭐⭐' : running >= 30 ? 'Hạng Vàng ⭐⭐⭐' : 'Hạng Bạc ⭐⭐';
      t.starHistory = t.sessionStars.map((s, idx) => ({
        period: `Buổi ${idx + 1}`,
        periodStars: Number(s.starsAwarded) || 0,
        cumulativeStars: Number(s.cumulativeStars) || 0
      }));

      updatedTrainees.push(t);
    }

    return {
      success: true,
      count: updatedTrainees.length,
      message: `Đã lưu cập nhật điểm sao thành công cho buổi ${sessionCode} (${sessionTitle})!`
    };
  }

  const trainees = await Trainee.find();
  const updatedTrainees = [];

  for (const t of trainees) {
    if (!t.sessionStars || t.sessionStars.length === 0) {
      attachRealStarHistory(t);
    }

    const rating = studentRatings.find(r => r.traineeId === t.traineeId);
    const awarded = rating && rating.starsAwarded !== undefined ? (Number(rating.starsAwarded) || 0) : null;
    const note = rating ? (rating.note || '') : '';

    // Tìm xem buổi này đã có trong sessionStars chưa
    let existingIndex = t.sessionStars.findIndex(s => s.sessionCode === sessionCode);
    if (existingIndex >= 0) {
      if (awarded !== null) {
        t.sessionStars[existingIndex].starsAwarded = awarded;
        if (note) t.sessionStars[existingIndex].note = note;
      }
      if (sessionTitle) t.sessionStars[existingIndex].sessionTitle = sessionTitle;
      if (sessionDate) t.sessionStars[existingIndex].sessionDate = sessionDate;
      if (trainerName) t.sessionStars[existingIndex].trainerName = trainerName;
      if (stage) t.sessionStars[existingIndex].stage = stage;
      if (stageName) t.sessionStars[existingIndex].stageName = stageName;
    } else if (awarded !== null) {
      t.sessionStars.push({
        sessionCode,
        sessionTitle: sessionTitle || `Buổi học ${sessionCode}`,
        sessionDate: sessionDate || new Date().toISOString().split('T')[0],
        trainerName: trainerName || 'Võ Thị Xuân Quỳnh',
        stage: stage || 'Giai đoạn 1',
        stageName: stageName || 'Training',
        starsAwarded: awarded,
        cumulativeStars: 0,
        note: note || 'Hoàn thành buổi học',
        createdAt: new Date()
      });
    }

    // Sắp xếp lại theo sessionDate
    t.sessionStars.sort((a, b) => {
      if (a.sessionDate && b.sessionDate) return new Date(a.sessionDate) - new Date(b.sessionDate);
      return (a.sessionCode || '').localeCompare(b.sessionCode || '');
    });

    // Tính lại lũy kế và tổng sao chuẩn xác
    let running = 0;
    t.sessionStars.forEach(s => {
      running += Number(s.starsAwarded) || 0;
      s.cumulativeStars = running;
    });

    t.accumulatedStars = running;
    t.starClassification = running >= 40 ? 'Hạng Kim Cương ⭐⭐⭐⭐' : running >= 30 ? 'Hạng Vàng ⭐⭐⭐' : 'Hạng Bạc ⭐⭐';
    t.starHistory = t.sessionStars.map((s, idx) => ({
      period: `Buổi ${idx + 1}`,
      periodStars: Number(s.starsAwarded) || 0,
      cumulativeStars: Number(s.cumulativeStars) || 0
    }));

    await t.save();
    updatedTrainees.push(t);
  }

  // Tự động sắp xếp lại thứ hạng cho toàn bộ học viên theo số sao mới
  await syncRanksByStars();

  return {
    success: true,
    count: updatedTrainees.length,
    message: `Đã lưu cập nhật điểm sao thành công cho buổi ${sessionCode} (${sessionTitle})!`
  };
}

/**
 * Xóa 1 bản ghi cộng sao buổi học (nếu Admin nhập nhầm)
 */
async function deleteSessionStar(traineeId, starLogId) {
  if (!isMongoDBConnected) {
    let trainee = inMemoryTrainees.find(t => t.traineeId === traineeId);
    if (!trainee) {
      throw new Error(`Không tìm thấy sinh viên có mã: ${traineeId}`);
    }
    const targetStar = (trainee.sessionStars || []).find(s => String(s._id) === String(starLogId));
    if (!targetStar) {
      throw new Error('Không tìm thấy bản ghi cộng sao cần xóa!');
    }
    trainee.sessionStars = trainee.sessionStars.filter(s => String(s._id) !== String(starLogId));

    let runningStars = 0;
    trainee.sessionStars.forEach((s) => {
      runningStars += Number(s.starsAwarded) || 0;
      s.cumulativeStars = runningStars;
    });

    trainee.accumulatedStars = Math.max(0, runningStars);
    trainee.starClassification = trainee.accumulatedStars >= 40 ? 'Hạng Kim Cương ⭐⭐⭐⭐' : trainee.accumulatedStars >= 30 ? 'Hạng Vàng ⭐⭐⭐' : 'Hạng Bạc ⭐⭐';
    trainee.starHistory = trainee.sessionStars.map((s, idx) => ({
      period: `Buổi ${idx + 1}`,
      periodStars: Number(s.starsAwarded) || 0,
      cumulativeStars: Number(s.cumulativeStars) || 0
    }));

    return await getTraineeById(trainee.traineeId);
  }

  let trainee = await Trainee.findOne({ traineeId });
  if (!trainee && mongoose.Types.ObjectId.isValid(traineeId)) {
    trainee = await Trainee.findById(traineeId);
  }
  if (!trainee) {
    throw new Error(`Không tìm thấy sinh viên có mã: ${traineeId}`);
  }

  const targetStar = trainee.sessionStars.id(starLogId) || trainee.sessionStars.find(s => String(s._id) === String(starLogId));
  if (!targetStar) {
    throw new Error('Không tìm thấy bản ghi cộng sao cần xóa!');
  }

  trainee.sessionStars = trainee.sessionStars.filter(s => String(s._id) !== String(starLogId));

  // Tính toán lại lũy kế cho các buổi còn lại
  let runningStars = 0;
  trainee.sessionStars.forEach((s) => {
    runningStars += Number(s.starsAwarded) || 0;
    s.cumulativeStars = runningStars;
  });

  trainee.accumulatedStars = Math.max(0, runningStars);
  trainee.starClassification = trainee.accumulatedStars >= 40 ? 'Hạng Kim Cương ⭐⭐⭐⭐' : trainee.accumulatedStars >= 30 ? 'Hạng Vàng ⭐⭐⭐' : 'Hạng Bạc ⭐⭐';

  trainee.starHistory = trainee.sessionStars.map((s, idx) => ({
    period: `Buổi ${idx + 1}`,
    periodStars: Number(s.starsAwarded) || 0,
    cumulativeStars: Number(s.cumulativeStars) || 0
  }));

  await trainee.save();
  await syncRanksByStars();

  return await getTraineeById(trainee.traineeId);
}

/**
 * Lấy danh sách chi tiết sao từng buổi học và thông tin tổng kết theo giai đoạn
 */
async function getSessionStars(traineeId) {
  const trainee = await getTraineeById(traineeId);
  if (!trainee) {
    throw new Error(`Không tìm thấy sinh viên ${traineeId}`);
  }

  const sessionStars = trainee.sessionStars || [];

  // Tổng hợp dữ liệu theo 3 giai đoạn tiêu chuẩn Trainee Program
  const stage1Stars = sessionStars
    .filter(s => s.stage === 'Giai đoạn 1' || !s.stage)
    .reduce((sum, s) => sum + (Number(s.starsAwarded) || 0), 0);

  const stage2Stars = sessionStars
    .filter(s => s.stage === 'Giai đoạn 2')
    .reduce((sum, s) => sum + (Number(s.starsAwarded) || 0), 0);

  const stage3Stars = sessionStars
    .filter(s => s.stage === 'Giai đoạn 3')
    .reduce((sum, s) => sum + (Number(s.starsAwarded) || 0), 0);

  const stagesSummary = [
    {
      stageId: 'stage-1',
      stageCode: 'Giai đoạn 1',
      stageName: 'Training',
      title: 'Training kiến thức nền tảng & Hệ thống',
      totalSessions: 15,
      completedSessions: sessionStars.filter(s => s.stage === 'Giai đoạn 1' || !s.stage).length,
      starsEarned: stage1Stars,
      cumulativeStars: stage1Stars,
      classification: stage1Stars >= 40 ? 'Hạng Kim Cương ⭐⭐⭐⭐' : stage1Stars >= 30 ? 'Hạng Vàng ⭐⭐⭐' : 'Hạng Bạc ⭐⭐',
      status: 'active',
      statusText: 'Đang diễn ra',
      progress: Math.min(100, Math.round((sessionStars.filter(s => s.stage === 'Giai đoạn 1' || !s.stage).length / 15) * 100))
    },
    {
      stageId: 'stage-2',
      stageCode: 'Giai đoạn 2',
      stageName: 'Capstone Project',
      title: 'Thực chiến Dự án & Phát triển Tính năng',
      totalSessions: 20,
      completedSessions: sessionStars.filter(s => s.stage === 'Giai đoạn 2').length,
      starsEarned: stage2Stars,
      cumulativeStars: stage1Stars + stage2Stars,
      classification: stage2Stars > 0 ? (stage2Stars >= 40 ? 'Hạng Kim Cương ⭐⭐⭐⭐' : 'Hạng Vàng ⭐⭐⭐') : 'Chưa bắt đầu',
      status: stage2Stars > 0 ? 'active' : 'upcoming',
      statusText: stage2Stars > 0 ? 'Đang diễn ra' : 'Sắp tới',
      progress: Math.min(100, Math.round((sessionStars.filter(s => s.stage === 'Giai đoạn 2').length / 20) * 100))
    },
    {
      stageId: 'stage-3',
      stageCode: 'Giai đoạn 3',
      stageName: 'Đánh giá & Tốt nghiệp',
      title: 'Bảo vệ Đồ án & Đánh giá Tốt nghiệp',
      totalSessions: 10,
      completedSessions: sessionStars.filter(s => s.stage === 'Giai đoạn 3').length,
      starsEarned: stage3Stars,
      cumulativeStars: stage1Stars + stage2Stars + stage3Stars,
      classification: stage3Stars > 0 ? 'Xuất sắc' : 'Chưa bắt đầu',
      status: stage3Stars > 0 ? 'active' : 'upcoming',
      statusText: stage3Stars > 0 ? 'Đang diễn ra' : 'Sắp tới',
      progress: Math.min(100, Math.round((sessionStars.filter(s => s.stage === 'Giai đoạn 3').length / 10) * 100))
    }
  ];

  return {
    trainee,
    sessionStars,
    stagesSummary,
    totalAccumulatedStars: trainee.accumulatedStars || 0
  };
}

// ==========================================
// QUẢN LÝ CÂU HỎI & DIỄN ĐÀN HỎI ĐÁP (Q&A)
// ==========================================

let inMemoryQuestions = [
  {
    _id: 'q_mock_01',
    code: 'Q-2026-001',
    mssv: '25520918',
    fullName: 'Khôi Trương Trần Anh',
    isAnonymous: false,
    category: 'Kỹ thuật & Code',
    title: 'Lỗi MongooseServerSelectionError khi kết nối MongoDB Atlas',
    content: 'Em chạy server node server.js thì báo lỗi MongooseServerSelectionError: Could not connect to any servers in your MongoDB Atlas cluster. Đã kiểm tra chuỗi kết nối URI và mật khẩu đúng.',
    status: 'answered',
    answer: 'Chào em, lỗi này thường do IP mạng Wifi em đang dùng chưa được thêm vào whitelist của MongoDB Atlas. Em đăng nhập vào trang chủ MongoDB Cloud -> vào mục Security -> Network Access -> bấm Add IP Address -> chọn "Allow Access From Anywhere (0.0.0.0/0)" hoặc IP hiện tại rồi đợi 1 phút và thử lại nhé!',
    answeredBy: 'TS. Dương Việt Hằng',
    answeredRole: 'Giảng viên Hướng dẫn UIT',
    answeredAt: new Date(Date.now() - 3600000 * 24),
    likesCount: 15,
    likedBy: [],
    createdAt: new Date(Date.now() - 3600000 * 26)
  },
  {
    _id: 'q_mock_02',
    code: 'Q-2026-002',
    mssv: 'Ẩn danh',
    fullName: 'Sinh viên ẩn danh',
    isAnonymous: true,
    category: 'Bài tập & Đồ án',
    title: 'Hạn chót nộp bài tập Tuần 2 và cách gắn link GitHub',
    content: 'Thầy cô cho em hỏi hạn nộp bài tập Tuần 2 môn Phát triển ứng dụng Web là ngày nào ạ? Khi nộp có cần deploy lên Vercel không hay chỉ cần nộp link GitHub?',
    status: 'answered',
    answer: 'Chào bạn, deadline nộp bài tập Tuần 2 là 23h59 Chủ nhật tuần này. Về yêu cầu nộp: bạn chỉ cần commit code lên Github repository (chế độ Public) và gửi link repo. Khuyến khích (được cộng thêm sao) nếu bạn deploy bản demo qua Render hoặc Vercel nhé!',
    answeredBy: 'ThS. Nguyễn Văn A',
    answeredRole: 'Mentor Trainee Program',
    answeredAt: new Date(Date.now() - 3600000 * 12),
    likesCount: 8,
    likedBy: [],
    createdAt: new Date(Date.now() - 3600000 * 15)
  },
  {
    _id: 'q_mock_03',
    code: 'Q-2026-003',
    mssv: '25520112',
    fullName: 'Nguyễn Minh Tuấn',
    isAnonymous: false,
    category: 'Lịch học & Điểm danh',
    title: 'Em có thể xem lại video ghi hình buổi học trực tuyến ở đâu?',
    content: 'Buổi học thứ 3 vừa rồi em có việc bận gia đình nên xin nghỉ có phép. Thầy cô cho em hỏi đường link video Recording của buổi đó được đăng tải ở đâu để em ôn lại bài ạ?',
    status: 'answered',
    answer: 'Chào Tuấn, tất cả video ghi hình buổi học được tự động lưu trong kênh Microsoft Teams của lớp -> Tab "Files" -> thư mục "Recordings". Ngoài ra Ban Điều phối cũng cập nhật link trực tiếp tại mục Lịch đào tạo trên Cổng thông tin này nhé.',
    answeredBy: 'Ban Điều phối UIT',
    answeredRole: 'Quản trị viên Đào tạo',
    answeredAt: new Date(Date.now() - 3600000 * 4),
    likesCount: 11,
    likedBy: [],
    createdAt: new Date(Date.now() - 3600000 * 8)
  },
  {
    _id: 'q_mock_04',
    code: 'Q-2026-004',
    mssv: 'Ẩn danh',
    fullName: 'Sinh viên ẩn danh',
    isAnonymous: true,
    category: 'Chương trình Trainee',
    title: 'Quy chế xét tặng sao thưởng ⭐ trên Bảng xếp hạng Trainee',
    content: 'Cho em hỏi cơ chế cộng sao rèn luyện trên Bảng xếp hạng: nếu phát biểu xây dựng bài trong buổi học online hoặc hoàn thành bài tập sớm thì được cộng bao nhiêu sao ạ?',
    status: 'pending',
    answer: '',
    answeredBy: '',
    answeredRole: '',
    answeredAt: null,
    likesCount: 5,
    likedBy: [],
    createdAt: new Date(Date.now() - 3600000 * 2)
  }
];

async function getAllQuestions({ category = '', status = '', isAnonymous = '', search = '' } = {}) {
  if (isMongoDBConnected) {
    try {
      const query = {};
      if (category && category !== 'all') query.category = category;
      if (status && status !== 'all') query.status = status;
      if (isAnonymous === 'true') query.isAnonymous = true;
      else if (isAnonymous === 'false') query.isAnonymous = false;

      if (search && search.trim()) {
        const safeSearch = escapeRegex(search.trim());
        query.$or = [
          { title: { $regex: safeSearch, $options: 'i' } },
          { content: { $regex: safeSearch, $options: 'i' } },
          { mssv: { $regex: safeSearch, $options: 'i' } },
          { code: { $regex: safeSearch, $options: 'i' } }
        ];
      }

      const list = await Question.find(query).sort({ createdAt: -1 }).lean();
      if (list && list.length > 0) return list;
    } catch (err) {
      console.warn('Lỗi truy vấn Question từ MongoDB, chuyển sang inMemory:', err.message);
    }
  }

  // Fallback to inMemoryQuestions
  let list = [...inMemoryQuestions];
  if (category && category !== 'all') {
    list = list.filter(q => q.category === category);
  }
  if (status && status !== 'all') {
    list = list.filter(q => q.status === status);
  }
  if (isAnonymous === 'true') {
    list = list.filter(q => q.isAnonymous === true);
  } else if (isAnonymous === 'false') {
    list = list.filter(q => !q.isAnonymous);
  }
  if (search) {
    const s = search.toLowerCase();
    list = list.filter(q => 
      (q.title && q.title.toLowerCase().includes(s)) ||
      (q.content && q.content.toLowerCase().includes(s)) ||
      (q.mssv && q.mssv.toLowerCase().includes(s)) ||
      (q.code && q.code.toLowerCase().includes(s))
    );
  }
  return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function createQuestion(data) {
  const isAnonymous = data.isAnonymous === true || data.isAnonymous === 'true';
  let mssv = String(data.mssv || '').trim();
  let fullName = String(data.fullName || '').trim();

  if (isAnonymous) {
    if (!mssv) mssv = 'Ẩn danh';
    fullName = 'Sinh viên ẩn danh';
  } else {
    if (!mssv) {
      throw new Error('Vui lòng nhập Mã số sinh viên (MSSV) hoặc chọn chế độ Ẩn danh!');
    }
    // Tra cứu tên sinh viên nếu có
    if (!fullName && isMongoDBConnected) {
      try {
        const trainee = await Trainee.findOne({ traineeId: mssv }).lean();
        if (trainee) fullName = trainee.fullName;
      } catch (e) {}
    }
    if (!fullName) fullName = `Sinh viên ${mssv}`;
  }

  const title = String(data.title || '').trim();
  const content = String(data.content || '').trim();

  if (!title) throw new Error('Vui lòng nhập Tiêu đề câu hỏi!');
  if (!content || content.length < 5) throw new Error('Vui lòng nhập nội dung chi tiết câu hỏi (tối thiểu 5 ký tự)!');

  const randomNum = Math.floor(100 + Math.random() * 900);
  const code = `Q-2026-${Date.now().toString().slice(-3)}${randomNum.toString().slice(-1)}`;

  const newDoc = {
    code,
    mssv: isAnonymous ? 'Ẩn danh' : mssv,
    realMssv: isAnonymous ? mssv : mssv,
    fullName: isAnonymous ? 'Sinh viên ẩn danh' : fullName,
    isAnonymous,
    category: data.category || 'Kỹ thuật & Code',
    title,
    content,
    status: 'pending',
    answer: '',
    answeredBy: '',
    answeredRole: '',
    answeredAt: null,
    likesCount: 0,
    likedBy: [],
    createdAt: new Date(),
    updatedAt: new Date()
  };

  if (isMongoDBConnected) {
    try {
      const created = await Question.create(newDoc);
      return created.toObject();
    } catch (err) {
      console.warn('Lỗi lưu Question vào MongoDB, lưu tạm vào inMemory:', err.message);
    }
  }

  newDoc._id = `q_${Date.now()}`;
  inMemoryQuestions.unshift(newDoc);
  return newDoc;
}

async function answerQuestion(questionId, answer, answeredBy = 'Giảng viên UIT', answeredRole = 'Ban Cố vấn & Đào tạo') {
  if (!answer || !answer.trim()) {
    throw new Error('Vui lòng nhập nội dung câu trả lời!');
  }

  if (isMongoDBConnected) {
    try {
      const updated = await Question.findByIdAndUpdate(
        questionId,
        {
          status: 'answered',
          answer: answer.trim(),
          answeredBy: answeredBy.trim(),
          answeredRole: answeredRole.trim(),
          answeredAt: new Date()
        },
        { new: true }
      );
      if (updated) return updated.toObject();
    } catch (err) {
      console.warn('Lỗi cập nhật câu trả lời MongoDB:', err.message);
    }
  }

  const item = inMemoryQuestions.find(q => q._id === questionId || q.code === questionId);
  if (!item) throw new Error('Không tìm thấy câu hỏi để trả lời!');
  item.status = 'answered';
  item.answer = answer.trim();
  item.answeredBy = answeredBy.trim();
  item.answeredRole = answeredRole.trim();
  item.answeredAt = new Date();
  return item;
}

async function toggleLikeQuestion(questionId, userId = 'anonymous_user') {
  if (isMongoDBConnected) {
    try {
      const q = await Question.findById(questionId);
      if (q) {
        const hasLiked = q.likedBy && q.likedBy.includes(userId);
        if (hasLiked) {
          q.likedBy = q.likedBy.filter(id => id !== userId);
          q.likesCount = Math.max(0, (q.likesCount || 1) - 1);
        } else {
          if (!q.likedBy) q.likedBy = [];
          q.likedBy.push(userId);
          q.likesCount = (q.likesCount || 0) + 1;
        }
        await q.save();
        return q.toObject();
      }
    } catch (err) {
      console.warn('Lỗi like question MongoDB:', err.message);
    }
  }

  const item = inMemoryQuestions.find(q => q._id === questionId || q.code === questionId);
  if (!item) throw new Error('Không tìm thấy câu hỏi!');
  if (!item.likedBy) item.likedBy = [];
  const hasLiked = item.likedBy.includes(userId);
  if (hasLiked) {
    item.likedBy = item.likedBy.filter(id => id !== userId);
    item.likesCount = Math.max(0, (item.likesCount || 1) - 1);
  } else {
    item.likedBy.push(userId);
    item.likesCount = (item.likesCount || 0) + 1;
  }
  return item;
}

async function deleteQuestion(questionId) {
  if (isMongoDBConnected) {
    try {
      const deleted = await Question.findByIdAndDelete(questionId);
      if (deleted) return deleted.toObject();
    } catch (err) {
      console.warn('Lỗi xóa Question MongoDB:', err.message);
    }
  }

  const idx = inMemoryQuestions.findIndex(q => q._id === questionId || q.code === questionId);
  if (idx !== -1) {
    const deleted = inMemoryQuestions.splice(idx, 1)[0];
    return deleted;
  }
  throw new Error('Không tìm thấy câu hỏi cần xóa!');
}

// ==========================================
// 16. QUẢN LÝ 11 BÀI TẬP RÈN LUYỆN (ASSIGNMENTS)
// ==========================================

const DEFAULT_11_ASSIGNMENTS = [
  {
    assignmentId: 1,
    title: 'Bài 1: Làm quen Git, GitHub & Quy chuẩn Code UIT',
    desc: 'Làm quen với các lệnh Git cơ bản: clone, checkout, commit, push và tạo Pull Request theo quy chuẩn Trainee Program UIT.',
    unit: 'Unit 10',
    type: 'lesson',
    icon: 'check',
    status: 'completed',
    isCurrent: false,
    score: 100,
    xp: 50,
    gems: 10,
    link: 'https://github.com',
    offset: 'offset-center'
  },
  {
    assignmentId: 2,
    title: 'Bài 2: JavaScript ES6+, DOM Scripting & Event Handling',
    desc: 'Thực hành Arrow functions, Destructuring, Spread operator, Promises và thao tác DOM động tương tác người dùng.',
    unit: 'Unit 10',
    type: 'lesson',
    icon: 'check',
    status: 'completed',
    isCurrent: false,
    score: 95,
    xp: 60,
    gems: 15,
    link: 'https://github.com',
    offset: 'offset-right-1'
  },
  {
    assignmentId: 3,
    title: 'Bài 3: Kiến trúc Web, RESTful API & Lập trình Bất đồng bộ',
    desc: 'Hiểu rõ mô hình Client-Server, HTTP Methods, Fetch API, Async/Await và bẫy lỗi xử lý dữ liệu JSON an toàn.',
    unit: 'Unit 10',
    type: 'lesson',
    icon: 'check',
    status: 'completed',
    isCurrent: false,
    score: 98,
    xp: 70,
    gems: 20,
    link: 'https://developer.mozilla.org',
    offset: 'offset-right-2'
  },
  {
    assignmentId: 4,
    title: 'Bài 4: Xây dựng REST API với Node.js & Express.js',
    desc: 'Thiết kế hệ thống Routing chuẩn RESTful, viết middleware xác thực, log request và xử lý lỗi tập trung.',
    unit: 'Unit 10',
    type: 'lesson',
    icon: 'check',
    status: 'completed',
    isCurrent: false,
    score: 92,
    xp: 75,
    gems: 20,
    link: 'https://expressjs.com',
    offset: 'offset-right-1'
  },
  {
    assignmentId: 5,
    title: 'Bài 5: Thiết kế Cơ sở Dữ liệu & Tương tác MongoDB Atlas',
    desc: 'Thiết kế Schema và Models với Mongoose ODM, thực hiện các thao tác CRUD và tối ưu Index dữ liệu.',
    unit: 'Unit 10',
    type: 'lesson',
    icon: 'check',
    status: 'completed',
    isCurrent: false,
    score: 96,
    xp: 80,
    gems: 25,
    link: 'https://mongodb.com',
    deadline: new Date(Date.now() + 18 * 3600 * 1000), // < 1 ngày -> x h x phút còn lại
    offset: 'offset-center'
  },
  {
    assignmentId: 6,
    title: 'Bài 6: Xác thực Người dùng với JWT & Phân quyền RBAC',
    desc: 'Mã hóa mật khẩu an toàn với bcrypt, phát hành token JWT và phân quyền hạn Admin/Trainee chặt chẽ.',
    unit: 'Unit 10',
    type: 'lesson',
    icon: 'star',
    status: 'active',
    isCurrent: true,
    score: 0,
    xp: 85,
    gems: 25,
    link: 'https://jwt.io',
    deadline: new Date(Date.now() + (3 * 24 + 4) * 3600 * 1000), // > 1 ngày -> x ngày x h còn lại
    offset: 'offset-left-1'
  },
  {
    assignmentId: 7,
    title: 'Bài 7: Xây dựng Giao diện React / Component Architecture',
    desc: 'Xây dựng giao diện Single Page Application hiện đại với React Component, Hooks (useState, useEffect) và Styling.',
    unit: 'Unit 10',
    type: 'lesson',
    icon: 'lock',
    status: 'locked',
    isCurrent: false,
    score: 0,
    xp: 90,
    gems: 30,
    link: 'https://react.dev',
    offset: 'offset-left-2'
  },
  {
    assignmentId: 8,
    title: 'Bài 8: Quản lý Trạng thái State & Tích hợp Frontend - Backend',
    desc: 'Kết nối ứng dụng Frontend với hệ thống Backend API, quản lý State toàn cục và xử lý UI Loading/Error states.',
    unit: 'Unit 10',
    type: 'lesson',
    icon: 'lock',
    status: 'locked',
    isCurrent: false,
    score: 0,
    xp: 90,
    gems: 30,
    link: 'https://redux-toolkit.js.org',
    offset: 'offset-left-1'
  },
  {
    assignmentId: 9,
    title: 'Bài 9: Kiểm thử Tự động (Unit Test & Integration Test)',
    desc: 'Viết bộ test tự động với Jest & Supertest kiểm thử logic nghiệp vụ và API endpoints, đạt độ phủ code chuẩn UIT.',
    unit: 'Unit 10',
    type: 'lesson',
    icon: 'lock',
    status: 'locked',
    isCurrent: false,
    score: 0,
    xp: 95,
    gems: 35,
    link: 'https://jestjs.io',
    offset: 'offset-center'
  },
  {
    assignmentId: 10,
    title: 'Bài 10: Đóng gói Docker Container & CI/CD Pipeline',
    desc: 'Viết Dockerfile tối ưu đa tầng (Multi-stage build), docker-compose và thiết lập GitHub Actions tự động kiểm thử.',
    unit: 'Unit 10',
    type: 'lesson',
    icon: 'lock',
    status: 'locked',
    isCurrent: false,
    score: 0,
    xp: 100,
    gems: 40,
    link: 'https://docker.com',
    offset: 'offset-right-1'
  },
  {
    assignmentId: 11,
    title: 'Bài 11: Đồ Án Tổng Hợp Capstone & Triển khai Cloud (Deploy)',
    desc: 'Hoàn thiện toàn diện đồ án sản phẩm thực tế Trainee, bảo mật và triển khai lên hạ tầng Cloud Production.',
    unit: 'Unit 10',
    type: 'lesson',
    icon: 'lock',
    status: 'locked',
    isCurrent: false,
    score: 0,
    xp: 150,
    gems: 50,
    link: 'https://uit.edu.vn',
    offset: 'offset-right-2'
  }
];

let inMemoryAssignments = JSON.parse(JSON.stringify(DEFAULT_11_ASSIGNMENTS));

/**
 * Lấy danh sách 11 bài tập (tự động khởi tạo seed vào MongoDB nếu chưa có)
 */
async function getAllAssignments() {
  if (isMongoDBConnected) {
    try {
      const count = await Assignment.countDocuments();
      if (count === 0) {
        console.log('🌱 [MongoDB] Khởi tạo dữ liệu mẫu 11 bài tập Trainee Program...');
        await Assignment.insertMany(DEFAULT_11_ASSIGNMENTS);
      }
      const list = await Assignment.find().sort({ assignmentId: 1 });
      return list.map(item => item.toObject());
    } catch (err) {
      console.warn('Lỗi lấy Assignments từ MongoDB:', err.message);
    }
  }
  return inMemoryAssignments;
}

/**
 * Cập nhật thông tin hoặc đường link của 1 bài tập cụ thể
 */
async function updateAssignment(assignmentId, updateData) {
  const idNum = Number(assignmentId);
  if (isNaN(idNum) || idNum < 1 || idNum > 11) {
    throw new Error('Mã bài tập không hợp lệ (Phải từ 1 đến 11)!');
  }

  const safeFields = {};
  if (updateData.title !== undefined) safeFields.title = String(updateData.title).trim();
  if (updateData.desc !== undefined) safeFields.desc = String(updateData.desc).trim();
  if (updateData.link !== undefined) safeFields.link = String(updateData.link).trim();
  if (updateData.status !== undefined) safeFields.status = updateData.status;
  if (updateData.isCurrent !== undefined) safeFields.isCurrent = Boolean(updateData.isCurrent);
  if (updateData.score !== undefined) safeFields.score = Number(updateData.score) || 0;
  if (updateData.xp !== undefined) safeFields.xp = Number(updateData.xp) || 0;
  if (updateData.gems !== undefined) safeFields.gems = Number(updateData.gems) || 0;
  if (updateData.deadline !== undefined) {
    if (!updateData.deadline || updateData.deadline === '' || updateData.deadline === 'null') {
      safeFields.deadline = null;
    } else {
      const d = new Date(updateData.deadline);
      safeFields.deadline = isNaN(d.getTime()) ? null : d;
    }
  }

  if (isMongoDBConnected) {
    try {
      let doc = await Assignment.findOne({ assignmentId: idNum });
      if (!doc) {
        // Nếu chưa có, tạo mới dựa trên mặc định
        const def = DEFAULT_11_ASSIGNMENTS.find(a => a.assignmentId === idNum) || { assignmentId: idNum, title: `Bài ${idNum}` };
        doc = new Assignment({ ...def, ...safeFields });
      } else {
        Object.assign(doc, safeFields);
      }
      await doc.save();
      return doc.toObject();
    } catch (err) {
      console.warn('Lỗi cập nhật Assignment trên MongoDB:', err.message);
    }
  }

  // Cập nhật in-memory
  const idx = inMemoryAssignments.findIndex(a => a.assignmentId === idNum);
  if (idx !== -1) {
    inMemoryAssignments[idx] = { ...inMemoryAssignments[idx], ...safeFields };
    return inMemoryAssignments[idx];
  }

  throw new Error('Không tìm thấy bài tập cần cập nhật!');
}

/**
 * Cập nhật đồng loạt toàn bộ 11 bài tập (Batch update cho Admin)
 */
async function batchUpdateAssignments(assignmentsList) {
  if (!Array.isArray(assignmentsList) || assignmentsList.length === 0) {
    throw new Error('Dữ liệu danh sách bài tập không hợp lệ!');
  }

  const updatedResults = [];
  for (const item of assignmentsList) {
    const id = item.assignmentId || item.id;
    if (id) {
      const updated = await updateAssignment(id, item);
      updatedResults.push(updated);
    }
  }

  return updatedResults;
}

/**
 * Khôi phục 11 bài tập về mặc định ban đầu
 */
async function resetAssignments() {
  if (isMongoDBConnected) {
    try {
      await Assignment.deleteMany({});
      await Assignment.insertMany(DEFAULT_11_ASSIGNMENTS);
      const list = await Assignment.find().sort({ assignmentId: 1 });
      return list.map(item => item.toObject());
    } catch (err) {
      console.warn('Lỗi reset Assignments trên MongoDB:', err.message);
    }
  }

  inMemoryAssignments = JSON.parse(JSON.stringify(DEFAULT_11_ASSIGNMENTS));
  return inMemoryAssignments;
}

module.exports = {
  connectDB,
  getAllTrainees,
  getTraineeById,
  createTrainee,
  updateTrainee,
  deleteTrainee,
  authenticateUser,
  getAnnouncements,
  getAllSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  resetSchedules,
  DEFAULT_OCTOBER_SCHEDULES,
  getDatabaseStatus,
  computeAssignmentClassification,
  createSupportRequest,
  getSupportRequests,
  resolveSupportRequest,
  deleteSupportRequest,
  awardSessionStars,
  batchUpdateSessionStars,
  deleteSessionStar,
  getSessionStars,
  // Question & Q&A
  getAllQuestions,
  createQuestion,
  answerQuestion,
  toggleLikeQuestion,
  deleteQuestion,
  // 11 Assignments
  getAllAssignments,
  updateAssignment,
  batchUpdateAssignments,
  resetAssignments,
  DEFAULT_11_ASSIGNMENTS
};



