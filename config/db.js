const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  // Ignore if cannot set servers
}

const mongoose = require('mongoose');
const crypto = require('crypto');
const { escapeRegex, hashPassword, verifyPassword, isProduction, CONTENT_PERMISSIONS } = require('../utils/security');
const Trainee = require('../models/Trainee');
const Account = require('../models/Account');
const Announcement = require('../models/Announcement');
const Schedule = require('../models/Schedule');
const SupportRequest = require('../models/SupportRequest');
const Question = require('../models/Question');
const Assignment = require('../models/Assignment');
const { mockTrainees, mockAnnouncements, schedules: importedSchedules = [] } = require('../data/mockData');

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
  if (score === null || score === undefined || score === '') return 'Chưa xếp loại';
  const s = Number(score);
  if (isNaN(s)) return 'Chưa xếp loại';
  if (s >= 9.0) return 'Xuất sắc';
  if (s >= 8.0) return 'Giỏi';
  if (s >= 6.5) return 'Khá';
  if (s >= 5.0) return 'Trung bình';
  return 'Yếu';
}

/**
 * Tạo URL avatar Dicebear độc nhất cho mỗi tài khoản dựa trên Mã Trainee (traineeId)
 */
function getDicebearAvatarUrl(traineeId, fullName = '') {
  const seed = String(traineeId || fullName || 'student').trim();
  const hash = Array.from(seed).reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 0);
  return `/assets/whale_${hash % 4 + 1}.png`;
}

/**
 * Tự động cập nhật lại thứ hạng (Rank) cho toàn bộ Trainee theo số sao tích lũy (accumulatedStars giảm dần)
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
              rankNote: `Hạng ${rank} / ${trainees.length} Trainee (Dựa trên số sao tích lũy)`,
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
let connectionPromise;
mongoose.set('bufferCommands', false);
mongoose.connection.on('disconnected', () => { isMongoDBConnected = false; });
const CONNECT_COOLDOWN_MS = 60000; // Cooldown 60s để tránh làm nghẽn server và request khi DB offline

/**
 * Kết nối tới MongoDB Atlas
 */
async function connectDB(force = false) {
  if (mongoose.connection.readyState === 1 && isMongoDBConnected) return true;
  if (connectionPromise) return connectionPromise;
  connectionPromise = openDatabase(force);
  try {
    return await connectionPromise;
  } finally {
    connectionPromise = null;
  }
}

async function openDatabase(force = false) {
  const uri = process.env.MONGODB_URI;

  if (!uri || uri.trim() === '') {
    connectionError = 'MONGODB_URI chưa được cấu hình trong file .env';
    isMongoDBConnected = false;
    activeDatabaseType = 'in-memory-fallback';
    console.error('❌ [Database Error] MONGODB_URI chưa được cấu hình.');
    return false;
  }

  // Nếu vừa mới thử kết nối thất bại và chưa hết cooldown thì không chặn tiếp
  const now = Date.now();
  if (!force && lastConnectAttempt > 0 && now - lastConnectAttempt < CONNECT_COOLDOWN_MS) {
    return false;
  }
  lastConnectAttempt = now;

  try {
    console.log('🔗 [MongoDB] Đang kết nối cơ sở dữ liệu...');
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 5,
      minPoolSize: 0
    });

    isMongoDBConnected = true;
    activeDatabaseType = 'mongodb';
    connectionError = null;
    console.log('✅ [MongoDB] Kết nối cơ sở dữ liệu MongoDB Atlas THÀNH CÔNG!');

    // Đồng bộ lại rank theo số sao cho toàn bộ Trainee trong DB
    return true;
  } catch (err) {
    connectionError = err.message;
    isMongoDBConnected = false;
    activeDatabaseType = 'in-memory-fallback';
    console.warn('[MongoDB] Kết nối thất bại.');
    return false;
  }
}

/**
 * Lấy danh sách Trainees từ MongoDB Atlas (hoặc Fallback InMemory nếu mất kết nối DB)
 * Bảng xếp hạng sắp xếp mặc định thuần túy dựa trên SỐ SAO TÍCH LŨY (accumulatedStars)
 */
async function getAllTrainees({ search = '', track = '', sort = 'stars_desc' } = {}) {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
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
        if ((sort === 'stars_desc' || !sort) && Number.isFinite(t.accumulatedStars)) {
          t.currentRank = idx + 1;
          t.rank = idx + 1;
        }
        t.avatar = getDicebearAvatarUrl(t.traineeId, t.fullName);
        return attachRealStarHistory(t);
      });
    } catch (err) {
      if (isProduction) throw err;
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
    if ((sort === 'stars_desc' || !sort) && Number.isFinite(t.accumulatedStars)) {
      t.currentRank = idx + 1;
      t.rank = idx + 1;
    }
    t.avatar = getDicebearAvatarUrl(t.traineeId, t.fullName);
    return attachRealStarHistory(t);
  });
}

function attachRealStarHistory(trainee) {
  if (!trainee) return trainee;
  const sessions = Array.isArray(trainee.sessionStars) ? trainee.sessionStars : [];
  let running = 0;
  trainee.starHistory = sessions.map((session, index) => {
    running += Number(session.starsAwarded) || 0;
    return { period: `Buổi ${index + 1}`, periodStars: Number(session.starsAwarded) || 0, cumulativeStars: running };
  });
  trainee.sessionStars = sessions;
  return trainee;
}

/**
 * Lấy chi tiết 1 Trainee theo traineeId hoặc _id từ MongoDB Atlas (hoặc Fallback InMemory)
 */
async function getTraineeById(id) {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
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
        trainee.avatar = getDicebearAvatarUrl(trainee.traineeId, trainee.fullName);
        trainee.assignmentClassification = computeAssignmentClassification(trainee.assignmentScore);
        return attachRealStarHistory(trainee);
      }
      return null;
    } catch (err) {
      if (isProduction) throw err;
      console.warn('Lỗi getTraineeById từ MongoDB, chuyển sang InMemory:', err.message);
    }
  }

  // Fallback InMemory
  let trainee = inMemoryTrainees.find(t => t.traineeId === cleanId);
  if (trainee) {
    const copy = { ...trainee };
    delete copy.password;
    copy.avatar = getDicebearAvatarUrl(copy.traineeId, copy.fullName);
    copy.assignmentClassification = computeAssignmentClassification(copy.assignmentScore);
    return attachRealStarHistory(copy);
  }

  return null;
}

/**
 * Lấy danh sách thông báo từ MongoDB Atlas (hoặc Fallback)
 */
async function getAnnouncements() {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  if (isMongoDBConnected) {
    try {
      const list = await Announcement.find().sort({ createdAt: -1 }).lean();
      if (list && (list.length > 0 || isProduction)) return list;
    } catch (e) {
      if (isProduction) throw e;
      console.warn('Lỗi getAnnouncements từ MongoDB, dùng mock:', e.message);
    }
  }
  return mockAnnouncements || [];
}

/**
 * Tạo mới 1 Trainee trong database MongoDB Atlas (Chỉ Admin)
 */
async function createTrainee(data) {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  if (typeof data.traineeId !== 'string' || !/^\d{6,12}$/.test(data.traineeId) || typeof data.fullName !== 'string' || data.fullName.length > 150) {
    throw new Error('MSSV cần 6–12 chữ số và họ tên tối đa 150 ký tự.');
  }
  if (!data.traineeId || !data.fullName) {
    throw new Error('Vui lòng nhập đầy đủ Mã Trainee (MSSV) và Họ tên!');
  }

  const cleanTraineeId = String(data.traineeId).trim();

  // Kiểm tra trùng lặp
  if (isMongoDBConnected) {
    const existing = await Trainee.findOne({ traineeId: cleanTraineeId });
    if (existing) {
      throw new Error(`Mã Trainee ${cleanTraineeId} đã tồn tại trong database!`);
    }
  } else {
    const existingMem = inMemoryTrainees.find(t => t.traineeId === cleanTraineeId);
    if (existingMem) {
      throw new Error(`Mã Trainee ${cleanTraineeId} đã tồn tại trong danh sách!`);
    }
  }

  const stars = Number(data.accumulatedStars) || 0;
  const attended = Number(data.attendedSessions) || 0;
  const total = Number(data.totalSessions) || 0;
  const excused = Number(data.absentExcused) || 0;
  const unexcused = Number(data.absentUnexcused) || 0;
  const rate = total > 0 ? Math.round((attended / total) * 1000) / 10 : null;
  const assignScore = data.assignmentScore === null || data.assignmentScore === undefined || data.assignmentScore === '' ? null : Number(data.assignmentScore);

  // Hash password bằng scrypt an toàn
  const rawPass = String(data.password || crypto.randomBytes(24).toString('base64url')).trim();
  const hashedPassword = hashPassword(rawPass);

  const newDoc = {
    traineeId: cleanTraineeId,
    fullName: String(data.fullName).trim(),
    email: String(data.email || '').trim(),
    department: String(data.department || '').trim(),
    track: String(data.track || '').trim(),
    batch: String(data.batch || 'Trainee 2026').trim(),
    status: ['Đang học', 'Ngừng học', 'Hoàn thành'].includes(data.status) ? data.status : 'Đang học',
    bio: String(data.bio || '').trim(),
    skills: Array.isArray(data.skills) ? data.skills.map(s => String(s).trim()) : [],
    accumulatedStars: stars,
    starClassification: stars >= 40 ? 'Hạng Kim Cương ⭐⭐⭐⭐' : stars >= 30 ? 'Hạng Vàng ⭐⭐⭐' : 'Hạng Bạc ⭐⭐',
    starTrend: '',
    starTrendIsPositive: true,
    attendedSessions: attended,
    totalSessions: total,
    absentExcused: excused,
    absentUnexcused: unexcused,
    attendanceRate: rate,
    attendanceNote: `Đã tham gia: <span>${attended}</span> buổi · Vắng có phép: <span>${excused}</span> · Không phép: <span>${unexcused}</span>`,
    assignmentScore: assignScore,
    assignmentClassification: computeAssignmentClassification(assignScore),
    completedAssignments: Number.isFinite(Number(data.completedAssignments)) ? Number(data.completedAssignments) : 0,
    totalAssignments: Number(data.totalAssignments) || 11,
    assignmentNote: `Đạt tiêu chuẩn yêu cầu Trainee Program`,
    avatar: getDicebearAvatarUrl(cleanTraineeId, data.fullName),
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
async function updateTrainee(id, updateData, expectedVersion) {
  const conflict = () => Object.assign(new Error('Dữ liệu vừa được thay đổi. Hãy tải lại bảng và thử lưu lại.'), { code: 'EDIT_CONFLICT' });
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  const allowedFields = [
    'fullName', 'email', 'department', 'track', 'batch', 'status',
    'bio', 'skills', 'avatar', 'accumulatedStars', 'attendedSessions',
    'totalSessions', 'absentExcused', 'absentUnexcused', 'assignmentScore',
    'completedAssignments', 'totalAssignments', 'sessionStars'
  ];

  const safeData = {};
  const numericFields = ['accumulatedStars', 'attendedSessions', 'totalSessions', 'absentExcused', 'absentUnexcused', 'assignmentScore', 'completedAssignments', 'totalAssignments'];
  for (const field of numericFields) {
    if (updateData[field] !== undefined && updateData[field] !== null && (typeof updateData[field] !== 'number' || !Number.isFinite(updateData[field]) || updateData[field] < (field === 'accumulatedStars' ? -10000 : 0) || updateData[field] > (field === 'assignmentScore' ? 10 : 100000))) throw new Error('Chỉ số Trainee không hợp lệ.');
  }
  for (const field of ['fullName', 'email', 'department', 'track', 'batch', 'status', 'bio']) {
    if (updateData[field] !== undefined && (typeof updateData[field] !== 'string' || updateData[field].length > 2000)) throw new Error('Thông tin Trainee không hợp lệ.');
  }
  if (updateData.avatar !== undefined && (typeof updateData.avatar !== 'string' || (updateData.avatar && !/^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(updateData.avatar) && !/^https:\/\/api\.dicebear\.com\/[a-z0-9/?=&%.,_-]+$/i.test(updateData.avatar)))) throw new Error('Ảnh đại diện không hợp lệ.');
  for (const field of allowedFields) {
    if (updateData[field] !== undefined) {
      safeData[field] = updateData[field];
    }
  }

  if (safeData.attendedSessions !== undefined || safeData.totalSessions !== undefined || safeData.absentExcused !== undefined || safeData.absentUnexcused !== undefined) {
    const attended = Number(safeData.attendedSessions) || 0;
    const total = Number(safeData.totalSessions) || 0;
    const excused = Number(safeData.absentExcused) || 0;
    const unexcused = Number(safeData.absentUnexcused) || 0;
    safeData.attendanceRate = total > 0 ? Math.round((attended / total) * 1000) / 10 : null;
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
    safeData.assignmentClassification = computeAssignmentClassification(safeData.assignmentScore);
  }

  if (updateData.password !== undefined) {
    const pw = String(updateData.password).trim();
    if (pw) {
      safeData.password = hashPassword(pw);
    }
  }

  if (isMongoDBConnected) {
    let updated = await Trainee.findOneAndUpdate(
      { traineeId: id, ...(expectedVersion !== undefined ? { __v: expectedVersion } : {}) },
      { $set: safeData, $inc: { __v: 1 } },
      { new: true, runValidators: true }
    ).select('-password').lean();

    if (!updated && expectedVersion !== undefined) throw conflict();
    if (!updated && mongoose.Types.ObjectId.isValid(id)) {
      updated = await Trainee.findByIdAndUpdate(
        id,
        { $set: safeData },
        { new: true }
      ).select('-password').lean();
    }

    if (!updated) {
      throw new Error(`Không tìm thấy Trainee với mã ${id} để cập nhật!`);
    }

    await syncRanksByStars();
    const refreshed = await getTraineeById(id);
    return refreshed || updated;
  }

  // Fallback InMemory
  let idx = inMemoryTrainees.findIndex(t => t.traineeId === id);
  if (idx === -1) {
    throw new Error(`Không tìm thấy Trainee với mã ${id} để cập nhật!`);
  }
  if (expectedVersion !== undefined && (inMemoryTrainees[idx].__v || 0) !== expectedVersion) throw conflict();
  Object.assign(inMemoryTrainees[idx], safeData, { __v: (inMemoryTrainees[idx].__v || 0) + 1 });
  return getTraineeById(id);
}

/**
 * Xóa Trainee khỏi MongoDB Atlas (Chỉ Admin)
 */
async function deleteTrainee(id) {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
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
      throw new Error(`Không tìm thấy Trainee với mã ${cleanId} để xóa!`);
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
    throw new Error(`Không tìm thấy Trainee với mã ${cleanId} để xóa!`);
  }
  const removed = inMemoryTrainees.splice(idx, 1)[0];
  delete removed.password;
  return removed;
}

/**
 * Xác thực đăng nhập: CHỈ CHO PHÉP DUY NHẤT TÀI KHOẢN ADMIN ĐĂNG NHẬP
 * Trainee không cần đăng nhập, có thể trực tiếp vào xem lịch học và thứ hạng của các MSSV.
 */
const inMemoryAccounts = new Map();

function ownerAccount() {
  return {
    username: (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase(),
    fullName: 'Quản trị hệ thống', role: 'admin', isOwner: true, active: true,
    permissions: ['accounts:manage', ...CONTENT_PERMISSIONS]
  };
}

function visibleAccount(account) {
  return {
    id: String(account._id), username: account.username, fullName: account.fullName,
    role: account.role, permissions: account.permissions || [], active: account.active,
    sessionVersion: account.sessionVersion || 0, createdAt: account.createdAt
  };
}

async function getAccounts() {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  const list = isMongoDBConnected ? await Account.find().sort({ username: 1 }).lean() : [...inMemoryAccounts.values()];
  return [ownerAccount(), ...list.map(visibleAccount)];
}

async function saveAccount(id, data) {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  if (typeof data.fullName !== 'string' || !data.fullName.trim() || data.fullName.length > 150 ||
      !['admin', 'trainer'].includes(data.role) || typeof data.active !== 'boolean' ||
      !Array.isArray(data.permissions) || data.permissions.some(permission => !CONTENT_PERMISSIONS.includes(permission))) throw new Error('Thông tin hoặc quyền tài khoản không hợp lệ.');
  const password = typeof data.password === 'string' ? data.password.trim() : data.password;
  if ((!id || password) && (typeof password !== 'string' || password.length < 12 || password.length > 256)) throw new Error('Mật khẩu cần 12–256 ký tự.');
  let current;
  if (id) {
    current = isMongoDBConnected
      ? (mongoose.isValidObjectId(id) ? await Account.findById(id).select('+password').lean() : null)
      : inMemoryAccounts.get(id);
    if (!current) throw new Error('Không tìm thấy tài khoản.');
  }
  const username = current?.username || (typeof data.username === 'string' ? data.username.trim().toLowerCase() : '');
  if (!/^[a-z0-9][a-z0-9_.-]{2,79}$/.test(username) || username === ownerAccount().username) throw new Error('Tên tài khoản không hợp lệ hoặc đã dành cho quản trị gốc.');
  const changes = {
    fullName: data.fullName.trim(), role: data.role, active: data.active,
    permissions: data.role === 'admin' ? [...CONTENT_PERMISSIONS] : [...new Set(data.permissions)],
    ...(password ? { password: hashPassword(password) } : {})
  };
  if (isMongoDBConnected) {
    if (id) {
      const account = await Account.findByIdAndUpdate(id, { $set: changes, $inc: { sessionVersion: 1 } }, { new: true, runValidators: true }).lean();
      return visibleAccount(account);
    }
    await Account.init();
    return visibleAccount((await Account.create({ username, ...changes })).toObject());
  }
  if (!id && [...inMemoryAccounts.values()].some(account => account.username === username)) throw new Error('Tên tài khoản đã tồn tại.');
  const account = { ...current, _id: id || crypto.randomUUID(), username, ...changes, sessionVersion: id ? current.sessionVersion + 1 : 0, createdAt: current?.createdAt || new Date() };
  inMemoryAccounts.set(account._id, account);
  return visibleAccount(account);
}

async function resolveAccountSession(payload) {
  if (payload.root === true && payload.username === ownerAccount().username) return ownerAccount();
  if (!payload.accountId) return null;
  if (!isMongoDBConnected) await connectDB();
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  const account = isMongoDBConnected
    ? (mongoose.isValidObjectId(payload.accountId) ? await Account.findById(payload.accountId).lean() : null)
    : inMemoryAccounts.get(payload.accountId);
  if (!account || !account.active || account.sessionVersion !== payload.sessionVersion) return null;
  return visibleAccount(account);
}

async function authenticateUser(username, password) {
  const clean = String(username).trim().toLowerCase();
  const owner = ownerAccount();
  if (clean === owner.username) {
    if (verifyPassword(password, process.env.ADMIN_PASSWORD || '')) return { success: true, user: owner };
  } else {
    if (!isMongoDBConnected) await connectDB();
    if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
    const account = isMongoDBConnected
      ? await Account.findOne({ username: clean }).select('+password').lean()
      : [...inMemoryAccounts.values()].find(item => item.username === clean);
    if (account?.active && verifyPassword(password, account.password)) return { success: true, user: visibleAccount(account) };
  }
  return { success: false, message: 'Tài khoản hoặc mật khẩu không chính xác.' };
}

/**
 * Dữ liệu mặc định Lịch học Tháng 10 dành cho Trainee Program (Học Online, MS Teams link gán sau)
 */
const DEFAULT_OCTOBER_SCHEDULES = JSON.parse(JSON.stringify(importedSchedules));

const DEFAULT_OCTOBER_SCHEDULE_SEED = JSON.parse(JSON.stringify(DEFAULT_OCTOBER_SCHEDULES));

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
async function getAllSchedules({ month, year } = {}) {
  const today = new Date(Date.now() + 7 * 3600000);
  month = month === undefined ? today.getUTCMonth() + 1 : Number(month);
  year = year === undefined ? today.getUTCFullYear() : Number(year);
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('Tháng hoặc năm không hợp lệ.');
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  if (!isMongoDBConnected) {
    await connectDB();
  }

  if (isMongoDBConnected) {
    const m = Number(month) || 10;
    const y = Number(year) || 2026;

    let items = await Schedule.find({ month: m, year: y }).sort({ date: 1, startTime: 1 }).lean();


    return items;
  }

  // Fallback nếu không có kết nối DB
  return DEFAULT_OCTOBER_SCHEDULES.filter(s => s.month === Number(month) && s.year === Number(year));
}

/**
 * Tạo một buổi học mới vào lịch tháng (Chỉ Admin)
 */
function scheduleDocumentUrl(value) {
  if (value === undefined || value === '') return '';
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Link tài liệu không hợp lệ.');
  const text = value.trim();
  if (!text) return '';
  let url;
  try { url = new URL(text); } catch { throw new Error('Link tài liệu phải là URL http hoặc https hợp lệ.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Link tài liệu phải là URL http hoặc https hợp lệ.');
  return text;
}

async function createSchedule(data) {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  if (!data.title) {
    throw new Error('Vui lòng nhập tên buổi học / chuyên đề!');
  }

  const dateStr = String(data.date || '');
  Schedule.validateTiming({ date: dateStr, startTime: data.startTime || '19:30', endTime: data.endTime || '21:30' });
  const month = Number(dateStr.slice(5, 7));
  const year = Number(dateStr.slice(0, 4));
  const dayText = computeDayOfWeekText(dateStr);

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
    instructor: data.instructor || 'Trainer',
    room: data.room || 'MS Teams Trực Tuyến',
    teamsUrl: data.teamsUrl ? String(data.teamsUrl).trim() : '',
    documentUrl: scheduleDocumentUrl(data.documentUrl),
    note: data.note ? String(data.note).trim() : '',
    status: data.status || 'upcoming',
    isTentative: data.isTentative === true,
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
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  const existing = isMongoDBConnected
    ? (mongoose.Types.ObjectId.isValid(id) ? await Schedule.findById(id).lean() : null)
    : DEFAULT_OCTOBER_SCHEDULES.find(item => item._id === id || item.code === id);
  if (!existing) throw new Error('Không tìm thấy buổi học.');
  const requestedIsTentative = data.isTentative;
  const requestedDocumentUrl = data.documentUrl;
  const fields = ['title', 'code', 'date', 'startTime', 'endTime', 'periods', 'type', 'instructor', 'room', 'teamsUrl', 'note'];
  data = Object.fromEntries(fields.filter(field => data[field] !== undefined).map(field => [field, String(data[field]).trim()]));
  if (requestedDocumentUrl !== undefined) data.documentUrl = scheduleDocumentUrl(requestedDocumentUrl);
  if (requestedIsTentative !== undefined) {
    if (typeof requestedIsTentative !== 'boolean') throw new Error('Trạng thái lịch dự kiến không hợp lệ.');
    data.isTentative = requestedIsTentative;
  }
  const merged = Schedule.validateTiming({ ...existing, ...data });
  data.month = Number(merged.date.slice(5, 7));
  data.year = Number(merged.date.slice(0, 4));
  data.dayOfWeekText = computeDayOfWeekText(merged.date);

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
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
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
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(y) || y < 2000 || y > 2100) throw new Error('Tháng hoặc năm không hợp lệ.');
  const sourceItems = DEFAULT_OCTOBER_SCHEDULE_SEED.filter(item => item.month === m && item.year === y);
  if (reseed && !sourceItems.length) throw new Error('Tháng đang chọn chưa có lịch mẫu từ dữ liệu nguồn.');
  let items = reseed ? JSON.parse(JSON.stringify(sourceItems)) : [];
  if (isMongoDBConnected) {
    await Schedule.deleteMany({ month: m, year: y });
    if (items.length) items = await Schedule.insertMany(items);
  } else {
    for (let index = DEFAULT_OCTOBER_SCHEDULES.length - 1; index >= 0; index--) {
      const item = DEFAULT_OCTOBER_SCHEDULES[index];
      if (item.month === m && item.year === y) DEFAULT_OCTOBER_SCHEDULES.splice(index, 1);
    }
    DEFAULT_OCTOBER_SCHEDULES.push(...items);
  }
  return { success: true, message: `Đã cập nhật lịch học Tháng ${m}/${y}.`, count: items.length };
}

/**
 * Tạo mới yêu cầu hỗ trợ (Quên mật khẩu, feedback, v.v.)
 */
async function createSupportRequest(data) {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  let traineeId = String(data.traineeId || data.username || '').trim();
  if (!traineeId) {
    throw new Error('Vui lòng nhập Mã Trainee (MSSV) hoặc tên tài khoản!');
  }

  let fullName = String(data.fullName || '').trim();
  let email = String(data.email || '').trim();

  // Tìm kiếm thông tin Trainee từ database để bổ sung nếu thiếu
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
      console.warn('Lỗi tìm kiếm Trainee khi tạo yêu cầu:', e.message);
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

  doc._id = 'req_' + crypto.randomUUID();
  inMemorySupportRequests.unshift(doc);
  return doc;
}

/**
 * Lấy danh sách yêu cầu hỗ trợ (Chỉ Admin)
 */
async function getSupportRequests({ type, status } = {}) {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  if (isMongoDBConnected) {
    const query = {};
    if (typeof type === 'string' && type) query.type = type;
    if (typeof status === 'string' && status) query.status = status;
    return await SupportRequest.find(query).sort({ createdAt: -1 }).lean();
  }

  let list = [...inMemorySupportRequests];
  if (type) list = list.filter(r => r.type === type);
  if (status) list = list.filter(r => r.status === status);
  return list;
}

async function createLeaveRequest(data) {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  if (typeof data.traineeId !== 'string' || !/^\d{6,12}$/.test(data.traineeId) || typeof data.fullName !== 'string' || data.fullName.length > 150 ||
      typeof data.scheduleCode !== 'string' || !/^[\w.-]{1,80}$/.test(data.scheduleCode) ||
      typeof data.scheduleDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.scheduleDate) ||
      typeof data.reason !== 'string' || data.reason.trim().length < 10 || data.reason.length > 3000 || data.commit !== true) {
    throw new Error('Vui lòng kiểm tra MSSV, họ tên, buổi học, lý do (10–3000 ký tự) và cam kết.');
  }
  const trainee = await getTraineeById(data.traineeId);
  const normalizeName = value => value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN');
  if (!trainee || normalizeName(trainee.fullName) !== normalizeName(data.fullName)) throw new Error('MSSV và họ tên không khớp danh sách Trainee.');
  const [year, month] = data.scheduleDate.split('-').map(Number);
  const schedules = await getAllSchedules({ month, year });
  const schedule = schedules.find(item => item.code === data.scheduleCode && item.date === data.scheduleDate);
  if (!schedule) throw new Error('Buổi học không tồn tại hoặc đã thay đổi. Vui lòng tải lại lịch.');
  const submissionKey = crypto.createHash('sha256').update(`${trainee.traineeId}:${schedule.code}:${schedule.date}`).digest('hex');
  const doc = {
    type: 'leave', traineeId: trainee.traineeId, fullName: trainee.fullName,
    email: trainee.email, message: data.reason.trim(), status: 'pending',
    scheduleCode: schedule.code, scheduleTitle: schedule.title, scheduleDate: schedule.date,
    scheduleTime: `${schedule.startTime} - ${schedule.endTime}`, submissionKey,
    publicVisible: true, createdAt: new Date()
  };
  if (isMongoDBConnected) {
    await SupportRequest.init();
    try {
      return await SupportRequest.findOneAndUpdate({ type: 'leave', submissionKey }, { $setOnInsert: doc }, { upsert: true, new: true, runValidators: true }).lean();
    } catch (err) {
      if (err.code === 11000) return await SupportRequest.findOne({ type: 'leave', submissionKey }).lean();
      throw err;
    }
  }
  const existing = inMemorySupportRequests.find(item => item.submissionKey === submissionKey);
  if (existing) return existing;
  if (inMemorySupportRequests.length >= 500) throw new Error('Bộ nhớ thử nghiệm đã đầy. Vui lòng cấu hình MongoDB.');
  doc._id = 'req_' + crypto.randomUUID();
  inMemorySupportRequests.unshift(doc);
  return doc;
}


async function getPublicLeaveRequests() {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  const list = isMongoDBConnected
    ? await SupportRequest.find({ type: 'leave', publicVisible: true }).sort({ createdAt: -1 }).limit(100).lean()
    : inMemorySupportRequests.filter(item => item.type === 'leave' && item.publicVisible).slice(0, 100);
  return list.map(item => ({
    id: String(item._id), traineeId: item.traineeId, fullName: item.fullName,
    reason: item.message, scheduleCode: item.scheduleCode, scheduleTitle: item.scheduleTitle,
    scheduleDate: item.scheduleDate, scheduleTime: item.scheduleTime,
    submittedAt: item.createdAt, status: item.status, resolvedAt: item.resolvedAt || null
  }));
}

async function getSupportRequest(id) {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  if (isMongoDBConnected) return mongoose.isValidObjectId(id) ? SupportRequest.findById(id).lean() : null;
  return inMemorySupportRequests.find(item => item._id === id) || null;
}

async function updateLeaveRequest(id, update, claimEmail = false) {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  const available = { $or: [
    { emailStatus: { $in: ['pending', 'failed', 'not_configured'] } },
    { emailStatus: 'sending', emailAttemptedAt: { $lt: new Date(Date.now() - 120000) } }
  ] };
  if (isMongoDBConnected) {
    if (!mongoose.isValidObjectId(id)) return null;
    return SupportRequest.findOneAndUpdate({ _id: id, type: 'leave', ...(claimEmail ? available : {}) }, { $set: update }, { new: true, runValidators: true }).lean();
  }
  const item = inMemorySupportRequests.find(value => value._id === id && value.type === 'leave');
  if (!item || (claimEmail && (item.emailStatus === 'sent' || (item.emailStatus === 'sending' && new Date(item.emailAttemptedAt).getTime() >= Date.now() - 120000)))) return null;
  Object.assign(item, update);
  return item;
}

/**
 * Xử lý yêu cầu quên mật khẩu: Reset mật khẩu của Trainee về mật khẩu mới (Mặc định 1234)
 */
async function resolveSupportRequest(requestId, newPassword = '1234', adminUser = 'Admin') {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
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
    trainee: trainee ? Object.fromEntries(Object.entries(trainee).filter(([key]) => key !== 'password')) : null
  };
}

/**
 * Xóa yêu cầu hỗ trợ
 */
async function deleteSupportRequest(requestId) {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
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
    connectionError: connectionError ? 'Không kết nối được cơ sở dữ liệu.' : null
  };
}

/**
 * Admin tổng hợp và cộng sao theo buổi học cho Trainee (ràng buộc chặt chẽ theo từng buổi học)
 */
async function awardSessionStars({ traineeId = 'all', scheduleCode = '', scheduleTitle = '', sessionDate = '', stage = 'Giai đoạn 1', stageName = 'Training', starsAwarded = 0, note = '', trainerName = 'Võ Thị Xuân Quỳnh' } = {}) {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
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
      throw new Error(`Không tìm thấy Trainee có mã: ${traineeId}`);
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
        message: `Đã cập nhật/cộng ${addStars} ⭐ thành công cho ${targetTrainees.length} Trainee tại ${targetTitle} (In-Memory)!`
      };
    } else {
      const refreshed = await getTraineeById(traineeId);
      return {
        success: true,
        trainee: refreshed,
        message: `Đã cập nhật ${addStars} ⭐ thành công cho Trainee ${targetTrainees[0].fullName} tại ${targetTitle}!`
      };
    }
  }

  // Nếu cộng cho TẤT CẢ Trainee trên MongoDB
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
      message: `Đã cập nhật/cộng ${addStars} ⭐ thành công cho ${updatedList.length} Trainee tại ${targetTitle}!`
    };
  }

  // Nếu cộng cho 1 Trainee cụ thể
  let trainee = await Trainee.findOne({ traineeId });
  if (!trainee && mongoose.Types.ObjectId.isValid(traineeId)) {
    trainee = await Trainee.findById(traineeId);
  }

  if (!trainee) {
    throw new Error(`Không tìm thấy Trainee có mã: ${traineeId}`);
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
    message: `Đã cập nhật ${addStars} ⭐ thành công cho Trainee ${trainee.fullName} tại ${targetTitle}!`
  };
}

/**
 * Admin cập nhật danh sách sao theo từng buổi học cho tất cả Trainee (Ràng buộc chặt chẽ theo buổi)
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
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
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

  // Tự động sắp xếp lại thứ hạng cho toàn bộ Trainee theo số sao mới
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
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  if (!isMongoDBConnected) {
    let trainee = inMemoryTrainees.find(t => t.traineeId === traineeId);
    if (!trainee) {
      throw new Error(`Không tìm thấy Trainee có mã: ${traineeId}`);
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

    trainee.accumulatedStars = runningStars;
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
    throw new Error(`Không tìm thấy Trainee có mã: ${traineeId}`);
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
    throw new Error(`Không tìm thấy Trainee ${traineeId}`);
  }

  const sessionStars = trainee.sessionStars || [];

  const groups = new Map();
  for (const log of sessionStars) {
    const code = log.stage || 'Giai đoạn 1';
    if (!groups.has(code)) groups.set(code, []);
    groups.get(code).push(log);
  }
  const plannedSessions = isMongoDBConnected ? await Schedule.countDocuments() : importedSchedules.length;
  let cumulative = 0;
  const stagesSummary = [...groups].map(([code, logs], index) => {
    const starsEarned = logs.reduce((sum, log) => sum + (Number(log.starsAwarded) || 0), 0);
    cumulative += starsEarned;
    return {
      stageId: 'stage-' + (index + 1), stageCode: code, stageName: logs[0].stageName || code,
      title: logs[0].stageName || code, totalSessions: plannedSessions || null, completedSessions: logs.length,
      starsEarned, cumulativeStars: cumulative, classification: 'Đã ghi nhận',
      status: 'active', statusText: 'Đã ghi nhận ' + logs.length + ' buổi', progress: plannedSessions ? Math.min(100, Math.round(logs.length / plannedSessions * 100)) : null
    };
  });

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
    answeredRole: 'Trainer',
    answeredAt: new Date(Date.now() - 3600000 * 24),
    likesCount: 15,
    likedBy: [],
    createdAt: new Date(Date.now() - 3600000 * 26)
  }
];

async function getAllQuestions({ category = '', status = '', isAnonymous = '', search = '' } = {}) {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  if (isMongoDBConnected) {
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
    return list;
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
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  const isAnonymous = data.isAnonymous === true || data.isAnonymous === 'true';
  let mssv = String(data.mssv || '').trim();
  let fullName = String(data.fullName || '').trim();

  if (isAnonymous) {
    if (!mssv) mssv = 'Ẩn danh';
    fullName = 'Trainee ẩn danh';
  } else {
    if (!mssv) {
      throw new Error('Vui lòng nhập Mã số Trainee (MSSV) hoặc chọn chế độ Ẩn danh!');
    }
    // Tra cứu tên Trainee nếu có
    if (!fullName && isMongoDBConnected) {
      try {
        const trainee = await Trainee.findOne({ traineeId: mssv }).lean();
        if (trainee) fullName = trainee.fullName;
      } catch (e) {}
    }
    if (!fullName) fullName = `Trainee ${mssv}`;
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
    fullName: isAnonymous ? 'Trainee ẩn danh' : fullName,
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
    const created = await Question.create(newDoc);
    return created.toObject();
  }

  newDoc._id = `q_${Date.now()}`;
  inMemoryQuestions.unshift(newDoc);
  return newDoc;
}

async function answerQuestion(questionId, answer, answeredBy = 'Trainer', answeredRole = 'Ban Tổ chức Trainee Program') {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  if (typeof answer !== 'string' || !answer.trim() || answer.length > 5000) throw new Error('Vui lòng nhập câu trả lời từ 1 đến 5000 ký tự.');
  const changes = {
    status: 'answered', answer: answer.trim(),
    answeredBy: String(answeredBy || 'Trainer').trim(),
    answeredRole: String(answeredRole || 'Trainer').trim(), answeredAt: new Date()
  };
  if (isMongoDBConnected) {
    const filter = mongoose.Types.ObjectId.isValid(questionId) ? { _id: questionId } : { code: String(questionId) };
    const updated = await Question.findOneAndUpdate(filter, { $set: changes }, { new: true, runValidators: true });
    return updated ? updated.toObject() : null;
  }
  const item = inMemoryQuestions.find(q => q._id === questionId || q.code === questionId);
  if (!item) return null;
  Object.assign(item, changes);
  return item;
}

async function toggleLikeQuestion(questionId, userId = 'anonymous_user') {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
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
      if (isProduction) throw err;
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
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  if (isMongoDBConnected) {
    const filter = mongoose.Types.ObjectId.isValid(questionId) ? { _id: questionId } : { code: String(questionId) };
    const deleted = await Question.findOneAndDelete(filter);
    return deleted ? deleted.toObject() : null;
  }
  const idx = inMemoryQuestions.findIndex(q => q._id === questionId || q.code === questionId);
  return idx === -1 ? null : inMemoryQuestions.splice(idx, 1)[0];
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
 * Lấy danh mục bài tập đang hiển thị.
 */
async function getAllAssignments() {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  if (isMongoDBConnected) {
    const list = await Assignment.find({ deletedAt: null }).sort({ assignmentId: 1 });
    return list.map(item => item.toObject());
  }
  return inMemoryAssignments.filter(item => !item.deletedAt).sort((a, b) => a.assignmentId - b.assignmentId);
}

function assignmentFields(updateData) {
  const safeFields = {};
  for (const [field, maxLength] of [['title', 240], ['desc', 3000], ['link', 2048]]) {
    if (updateData[field] === undefined) continue;
    if (typeof updateData[field] !== 'string' || updateData[field].length > maxLength) throw new Error('Thông tin bài tập không hợp lệ.');
    safeFields[field] = updateData[field].trim();
  }
  if (safeFields.title !== undefined && !safeFields.title) throw new Error('Vui lòng nhập tên bài tập.');
  if (safeFields.link === '#') safeFields.link = '';
  if (safeFields.link) {
    let url;
    try { url = new URL(safeFields.link); } catch { throw new Error('Link nộp bài phải là URL http hoặc https hợp lệ.'); }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Link nộp bài phải là URL http hoặc https hợp lệ.');
  }
  if (updateData.details !== undefined) {
    if (typeof updateData.details !== 'string' || updateData.details.length > 12000) throw new Error('Chi tiết bài tập tối đa 12000 ký tự.');
    safeFields.details = updateData.details.trim();
  }
  if (updateData.status !== undefined) {
    if (!['active', 'locked', 'closed', 'completed'].includes(updateData.status)) throw new Error('Trạng thái bài tập không hợp lệ.');
    safeFields.status = updateData.status === 'completed' ? 'active' : updateData.status;
  }
  if (updateData.isCurrent !== undefined) safeFields.isCurrent = Boolean(updateData.isCurrent);
  if (updateData.score !== undefined) safeFields.score = Number(updateData.score) || 0;
  if (updateData.xp !== undefined) safeFields.xp = Number(updateData.xp) || 0;
  if (updateData.gems !== undefined) safeFields.gems = Number(updateData.gems) || 0;
  if (updateData.deadline !== undefined) {
    if (!updateData.deadline || updateData.deadline === '' || updateData.deadline === 'null') {
      safeFields.deadline = null;
    } else {
      const d = new Date(updateData.deadline);
      if (isNaN(d.getTime())) throw new Error('Thời hạn nộp bài không hợp lệ.');
      safeFields.deadline = d;
    }
  }

  return safeFields;
}

async function createAssignment(data) {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  const safeFields = assignmentFields(data);
  if (!safeFields.title) throw new Error('Vui lòng nhập tên bài tập.');
  const offsets = ['offset-center', 'offset-right-1', 'offset-right-2', 'offset-right-1', 'offset-center', 'offset-left-1', 'offset-left-2', 'offset-left-1'];
  if (isMongoDBConnected) {
    await Assignment.init();
    for (let attempt = 0; attempt < 5; attempt++) {
      const last = await Assignment.findOne().sort({ assignmentId: -1 }).select('assignmentId').lean();
      const id = (last?.assignmentId || 0) + 1;
      if (!Number.isSafeInteger(id)) throw new Error('Không thể cấp thêm mã bài tập.');
      try {
        const doc = await Assignment.create({ status: 'locked', ...safeFields, assignmentId: id, offset: offsets[(id - 1) % offsets.length] });
        return doc.toObject();
      } catch (error) {
        if (error.code !== 11000) throw error;
      }
    }
    throw new Error('Có người khác đang thêm bài tập. Vui lòng thử lại.');
  }
  const id = Math.max(0, ...inMemoryAssignments.map(item => item.assignmentId)) + 1;
  if (!Number.isSafeInteger(id)) throw new Error('Không thể cấp thêm mã bài tập.');
  const doc = { status: 'locked', ...safeFields, assignmentId: id, offset: offsets[(id - 1) % offsets.length] };
  inMemoryAssignments.push(doc);
  return doc;
}

/**
 * Cập nhật thông tin hoặc đường link của 1 bài tập cụ thể
 */
async function updateAssignment(assignmentId, updateData) {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  const idNum = Number(assignmentId);
  if (!Number.isSafeInteger(idNum) || idNum < 1) throw new Error('Mã bài tập không hợp lệ.');
  const safeFields = assignmentFields(updateData);
  if (isMongoDBConnected) {
    const doc = await Assignment.findOneAndUpdate({ assignmentId: idNum, deletedAt: null }, { $set: safeFields }, { new: true, runValidators: true });
    if (!doc) throw new Error('Không tìm thấy bài tập cần cập nhật.');
    return doc.toObject();
  }

  // Cập nhật in-memory
  const idx = inMemoryAssignments.findIndex(a => a.assignmentId === idNum && !a.deletedAt);
  if (idx !== -1) {
    inMemoryAssignments[idx] = { ...inMemoryAssignments[idx], ...safeFields };
    return inMemoryAssignments[idx];
  }

  throw new Error('Không tìm thấy bài tập cần cập nhật!');
}

async function deleteAssignment(assignmentId) {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  const id = Number(assignmentId);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Mã bài tập không hợp lệ.');
  if (isMongoDBConnected) {
    return Boolean(await Assignment.findOneAndUpdate({ assignmentId: id, deletedAt: null }, { $set: { deletedAt: new Date() } }, { new: true, runValidators: true }));
  }
  const item = inMemoryAssignments.find(assignment => assignment.assignmentId === id && !assignment.deletedAt);
  if (!item) return false;
  item.deletedAt = new Date();
  return true;
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
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  const hasSubmissions = isMongoDBConnected ? await AssignmentSubmission.exists({}) : inMemoryAssignmentSubmissions.size > 0;
  if (hasSubmissions) throw new Error('Đã có xác nhận bài nộp; không thể khôi phục danh mục mẫu vì có thể làm sai liên kết bài tập.');
  if (isMongoDBConnected) {
    try {
      await Assignment.deleteMany({});
      await Assignment.insertMany(DEFAULT_11_ASSIGNMENTS);
      const list = await Assignment.find().sort({ assignmentId: 1 });
      return list.map(item => item.toObject());
    } catch (err) {
      if (isProduction) throw err;
      console.warn('Lỗi reset Assignments trên MongoDB:', err.message);
    }
  }

  inMemoryAssignments = JSON.parse(JSON.stringify(DEFAULT_11_ASSIGNMENTS));
  return inMemoryAssignments;
}


const AssignmentSubmission = require('../models/AssignmentSubmission');
const inMemoryAssignmentSubmissions = new Map();

async function getAssignmentSubmissions(assignmentId) {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  const id = Number(assignmentId);
  if (!(await getAllAssignments()).some(item => item.assignmentId === id)) throw new Error('Không tìm thấy bài tập.');
  const trainees = await getAllTrainees();
  const records = isMongoDBConnected
    ? await AssignmentSubmission.find({ assignmentId: id }).lean()
    : [...inMemoryAssignmentSubmissions.values()].filter(item => item.assignmentId === id);
  return trainees.map(trainee => ({
    traineeId: trainee.traineeId,
    fullName: trainee.fullName,
    ...(records.find(item => item.traineeId === trainee.traineeId) || { status: 'not_submitted', responseId: '', submittedAt: null, note: '' })
  }));
}

async function updateAssignmentSubmission(assignmentId, traineeId, data, reviewer) {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  const id = Number(assignmentId);
  if (!(await getAllAssignments()).some(item => item.assignmentId === id)) throw new Error('Không tìm thấy bài tập.');
  if (!(await getTraineeById(traineeId))) throw new Error('Không tìm thấy Trainee.');
  if (!['not_submitted', 'submitted', 'needs_revision', 'completed'].includes(data.status)) throw new Error('Trạng thái ghi nhận không hợp lệ.');
  if (typeof data.responseId !== 'string' || data.responseId.length > 120 || typeof data.note !== 'string' || data.note.length > 2000) throw new Error('Mã phản hồi hoặc ghi chú không hợp lệ.');
  const submittedAt = data.submittedAt ? new Date(data.submittedAt) : null;
  if (submittedAt && !Number.isFinite(submittedAt.getTime())) throw new Error('Thời điểm nộp không hợp lệ.');
  const record = {
    assignmentId: id, traineeId, status: data.status,
    responseId: data.responseId.trim(), note: data.note.trim(), submittedAt,
    reviewedBy: String(reviewer || 'admin'), reviewedAt: new Date()
  };
  if (isMongoDBConnected) {
    return AssignmentSubmission.findOneAndUpdate({ assignmentId: id, traineeId }, { $set: record },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }).lean();
  }
  inMemoryAssignmentSubmissions.set(id + ':' + traineeId, record);
  return record;
}


async function changeAccountPassword(user, currentPassword, newPassword) {
  if (user.isOwner) throw new Error('Tài khoản gốc đổi mật khẩu qua ADMIN_PASSWORD trên máy chủ.');
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  const account = isMongoDBConnected
    ? await Account.findById(user.id).select('+password')
    : inMemoryAccounts.get(user.id);
  if (!account || !verifyPassword(currentPassword, account.password)) throw new Error('Mật khẩu hiện tại không chính xác.');
  if (typeof newPassword !== 'string' || newPassword.trim().length < 12 || newPassword.length > 256) throw new Error('Mật khẩu mới cần 12–256 ký tự.');
  account.password = hashPassword(newPassword.trim());
  account.sessionVersion += 1;
  if (isMongoDBConnected) await account.save();
}

async function saveAttendanceEntry(traineeId, sessionCode, data, actor) {
  if (!/^[\w.-]{1,80}$/.test(sessionCode) || !/^\d{6,12}$/.test(traineeId) ||
      !['present', 'absent_excused', 'absent_unexcused', 'not_recorded'].includes(data.attendanceStatus) ||
      typeof data.starsAwarded !== 'number' || !Number.isFinite(data.starsAwarded) || data.starsAwarded < -20 || data.starsAwarded > 100 ||
      typeof data.note !== 'string' || data.note.length > 1000 || !/^\d{4}-\d{2}-\d{2}$/.test(data.sessionDate || '')) throw new Error('Thông tin điểm danh hoặc điểm sao không hợp lệ.');
  const trainee = await getTraineeById(traineeId);
  if (!trainee) throw new Error('Không tìm thấy Trainee.');
  const [year, month] = data.sessionDate.split('-').map(Number);
  const schedule = (await getAllSchedules({ month, year })).find(item => item.code === sessionCode && item.date === data.sessionDate);
  if (!schedule) throw new Error('Không tìm thấy buổi học.');
  const logs = JSON.parse(JSON.stringify(trainee.sessionStars || []));
  const previous = logs.find(log => log.sessionCode === sessionCode);
  const log = {
    ...previous, _id: previous?._id || new mongoose.Types.ObjectId().toString(),
    sessionId: String(schedule._id || schedule.code), sessionCode,
    sessionDate: schedule.date, sessionTitle: schedule.title, trainerName: schedule.instructor || '',
    stage: previous?.stage || 'Giai đoạn 1', stageName: previous?.stageName || 'Vòng 1',
    attendanceStatus: data.attendanceStatus, starsAwarded: data.starsAwarded,
    note: data.note.trim(), updatedBy: actor, updatedAt: new Date()
  };
  if (previous) logs[logs.indexOf(previous)] = log;
  else logs.push(log);
  const count = status => logs.filter(item => item.attendanceStatus === status).length;
  const updated = await updateTrainee(traineeId, {
    sessionStars: logs, attendedSessions: count('present'),
    totalSessions: count('present') + count('absent_excused') + count('absent_unexcused'),
    absentExcused: count('absent_excused'), absentUnexcused: count('absent_unexcused')
  }, trainee.__v || 0);
  return Object.fromEntries(['traineeId', 'sessionStars', 'accumulatedStars', 'attendedSessions', 'totalSessions', 'absentExcused', 'absentUnexcused', 'attendanceRate'].map(key => [key, updated[key]]));
}

module.exports = {
  changeAccountPassword,
  saveAttendanceEntry,
  resolveAccountSession,
  getAccounts,
  saveAccount,
  getPublicLeaveRequests,
  getAssignmentSubmissions,
  updateAssignmentSubmission,
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
  createLeaveRequest,
  getSupportRequest,
  updateLeaveRequest,
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
  createAssignment,
  deleteAssignment,
  updateAssignment,
  batchUpdateAssignments,
  resetAssignments,
  DEFAULT_11_ASSIGNMENTS
};



