const fs = require('fs');
const path = require('path');

const mongoose = require('mongoose');
const crypto = require('crypto');
const { escapeRegex, hashPassword, verifyPassword, sanitizeUrl, isProduction, CONTENT_PERMISSIONS } = require('../utils/security');
const Trainee = require('../models/Trainee');
const Account = require('../models/Account');
const Announcement = require('../models/Announcement');
const Schedule = require('../models/Schedule');
const SupportRequest = require('../models/SupportRequest');
const Question = require('../models/Question');
const Notification = require('../models/Notification');
const Assignment = require('../models/Assignment');
const { mockTrainees, mockAnnouncements, schedules: importedSchedules = [] } = require('../data/mockData');

const DEFAULT_TRAINEE_PASSWORD = process.env.TRAINEE_DEFAULT_PASSWORD || 'traineeprogram';
if (isProduction && (!process.env.TRAINEE_DEFAULT_PASSWORD || process.env.TRAINEE_DEFAULT_PASSWORD.length < 12)) {
  // Cho phép dùng mật khẩu chung (vd. 'traineeprogram') vì mọi tài khoản dùng nó đều bị ép đổi mật khẩu
  // ở lần đăng nhập đầu (mustChangePassword, được chặn ở server trong utils/security.js).
  throw new Error('Production cần đặt TRAINEE_DEFAULT_PASSWORD (tối thiểu 12 ký tự) trong biến môi trường.');
}

let isMongoDBConnected = false;
let connectionError = null;
let activeDatabaseType = 'mongodb';

// Bộ nhớ đệm Mock Trainees (khởi tạo khi DB offline để người dùng xem và trải nghiệm web bình thường)
let inMemoryTrainees = JSON.parse(JSON.stringify(mockTrainees));
if (inMemoryTrainees.length === 0 && !isProduction && process.env.NODE_ENV !== 'test') {
  inMemoryTrainees.push({
    traineeId: '25520918',
    fullName: 'Khôi Trương Trần Anh',
    email: '25520918@gm.uit.edu.vn',
    track: 'AI Engineering',
    batch: 'K2026',
    department: 'Khoa Khoa học Máy tính',
    status: 'Đang học',
    accumulatedStars: 24,
    attendedSessions: 8,
    totalSessions: 10,
    absentExcused: 1,
    absentUnexcused: 1,
    sessionStars: []
  });
}
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

function getPublicAvatar(trainee) {
  const avatar = String(trainee?.avatar || '').trim();
  if (/^\/uploads\/avatars\/[a-zA-Z0-9_-]+\.(?:jpe?g|png|webp)$/i.test(avatar) || /^\/assets\/whale_[1-4]\.png$/.test(avatar)) return avatar;
  return getDicebearAvatarUrl(trainee?.traineeId, trainee?.fullName);
}

function compareTraineesForRank(a, b) {
  const starDiff = (Number(b.accumulatedStars) || 0) - (Number(a.accumulatedStars) || 0);
  if (starDiff !== 0) return starDiff;
  return String(a.traineeId || '').localeCompare(String(b.traineeId || ''));
}

function buildStarRankMap(trainees) {
  const sorted = [...trainees].filter(item => Number.isFinite(item.accumulatedStars)).sort(compareTraineesForRank);
  const ranks = new Map();
  let previousStars;
  let rank = 0;
  sorted.forEach((trainee, index) => {
    const stars = Number(trainee.accumulatedStars);
    if (index === 0 || stars !== previousStars) rank = index + 1;
    ranks.set(String(trainee.traineeId), rank);
    previousStars = stars;
  });
  return ranks;
}

function buildStarCounts(trainees) {
  return trainees.reduce((counts, trainee) => {
    if (!Number.isFinite(trainee.accumulatedStars)) return counts;
    const stars = Number(trainee.accumulatedStars);
    counts.set(stars, (counts.get(stars) || 0) + 1);
    return counts;
  }, new Map());
}

function getRankClassification(rank) {
  if (rank === 1) return '🥇 Quán quân Trainee';
  if (rank === 2) return '🥈 Á quân Trainee';
  if (rank === 3) return '🥉 Hạng 3 Trainee';
  return `Top ${rank}`;
}

function applyStarRankMetadata(trainee, rankMap, starCounts, total) {
  if (!Number.isFinite(trainee.accumulatedStars)) {
    trainee.currentRank = null;
    trainee.rank = null;
    trainee.rankClassification = 'Chưa xếp hạng';
    trainee.rankNote = 'Chưa có dữ liệu sao để xếp hạng';
    trainee.totalStudentsInRank = total;
    return trainee;
  }
  const stars = Number(trainee.accumulatedStars);
  const rank = rankMap.get(String(trainee.traineeId));
  const isTied = (starCounts.get(stars) || 0) > 1;
  trainee.currentRank = rank;
  trainee.rank = rank;
  trainee.rankClassification = getRankClassification(rank);
  trainee.rankNote = `${isTied ? 'Đồng hạng' : 'Hạng'} ${rank} / ${total} Trainee (Dựa trên số sao tích lũy)`;
  trainee.totalStudentsInRank = total;
  return trainee;
}

/**
 * Tự động cập nhật lại thứ hạng (Rank) cho toàn bộ Trainee theo số sao tích lũy (accumulatedStars giảm dần)
 */
async function syncRanksByStars() {
  if (!isMongoDBConnected) return;
  try {
    const trainees = await Trainee.find().sort({ accumulatedStars: -1, traineeId: 1 }).select('_id accumulatedStars assignmentScore traineeId');
    if (!trainees || trainees.length === 0) return;

    const rankMap = buildStarRankMap(trainees);
    const starCounts = buildStarCounts(trainees);

    const bulkOps = trainees.map(t => {
      const metadata = applyStarRankMetadata(t, rankMap, starCounts, trainees.length);

      return {
        updateOne: {
          filter: { _id: t._id },
          update: {
            $set: {
              currentRank: metadata.currentRank,
              rank: metadata.rank,
              rankClassification: metadata.rankClassification,
              rankNote: metadata.rankNote,
              totalStudentsInRank: metadata.totalStudentsInRank,
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

    const count = await Trainee.countDocuments();
    if (count === 0 && inMemoryTrainees.length > 0) {
      console.log('🌱 [MongoDB] Khởi tạo dữ liệu Trainees ban đầu cho cơ sở dữ liệu mới...');
      await Trainee.insertMany(inMemoryTrainees);
    }

    await ensureTraineeAccountsInMongo();
    return true;
  } catch (err) {
    connectionError = err.message;
    isMongoDBConnected = false;
    activeDatabaseType = 'in-memory-fallback';
    const configuredUri = String(process.env.MONGODB_URI || '');
    const safeMessage = String(err.message || 'Không rõ nguyên nhân')
      .replace(configuredUri, '[MONGODB_URI đã ẩn]')
      .replace(/mongodb(?:\+srv)?:\/\/[^@\s]+@/gi, 'mongodb+srv://[thông tin xác thực đã ẩn]@');
    const errorCode = err.code ? `, mã ${err.code}` : '';
    console.warn(`[MongoDB] Kết nối thất bại (${err.name || 'Error'}${errorCode}): ${safeMessage}`);
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
    syncScheduleDepartmentsInMongo().catch(() => {});
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

      let sortOption = { accumulatedStars: -1, traineeId: 1 };
      if (sort === 'stars_desc') sortOption = { accumulatedStars: -1, traineeId: 1 };
      else if (sort === 'stars_asc') sortOption = { accumulatedStars: 1, traineeId: 1 };
      else if (sort === 'attended_desc') sortOption = { attendedSessions: -1, accumulatedStars: -1, assignmentScore: -1, traineeId: 1 };
      else if (sort === 'name_asc') sortOption = { fullName: 1, traineeId: 1 };
      else if (sort === 'gpa_desc') sortOption = { cumulativeGpa: -1, accumulatedStars: -1, traineeId: 1 };
      else sortOption = { accumulatedStars: -1, traineeId: 1 };

      const trainees = await Trainee.find(query).select('-password').sort(sortOption).lean();
      const ranked = await Trainee.find().select('traineeId accumulatedStars').sort({ accumulatedStars: -1, traineeId: 1 }).lean();
      const rankMap = buildStarRankMap(ranked);
      const starCounts = buildStarCounts(ranked);

      return trainees.map((t) => {
        delete t.password;
        t.assignmentClassification = computeAssignmentClassification(t.assignmentScore);
        applyStarRankMetadata(t, rankMap, starCounts, ranked.length);
        t.avatar = getPublicAvatar(t);
        return attachRealStarHistory(t);
      });
    } catch (err) {
      if (isProduction) throw err;
      console.warn('Lỗi đọc Trainees từ MongoDB, chuyển sang Fallback InMemory:', err.message);
    }
  }

  // Fallback InMemory khi DB chưa sẵn sàng / rớt mạng
  let list = inMemoryTrainees.map(t => ({ ...t }));
  const rankMap = buildStarRankMap(list);
  const starCounts = buildStarCounts(list);
  const totalRankedTrainees = list.length;
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
    list.sort(compareTraineesForRank);
  } else if (sort === 'stars_asc') {
    list.sort((a, b) => -compareTraineesForRank(a, b));
  } else if (sort === 'attended_desc') {
    list.sort((a, b) => {
      const attDiff = (Number(b.attendedSessions) || 0) - (Number(a.attendedSessions) || 0);
      if (attDiff !== 0) return attDiff;
      return compareTraineesForRank(a, b);
    });
  } else if (sort === 'name_asc') {
    list.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'vi') || String(a.traineeId || '').localeCompare(String(b.traineeId || '')));
  }

  return list.map((t, idx) => {
    delete t.password;
    t.assignmentClassification = computeAssignmentClassification(t.assignmentScore);
    applyStarRankMetadata(t, rankMap, starCounts, totalRankedTrainees);
    t.avatar = getPublicAvatar(t);
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
        trainee.avatar = getPublicAvatar(trainee);
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
    copy.avatar = getPublicAvatar(copy);
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
  if (typeof data.traineeId !== 'string' || !/^\d{6,12}$/.test(data.traineeId.trim()) || typeof data.fullName !== 'string' || !data.fullName.trim() || data.fullName.length > 150) {
    throw new Error('MSSV cần 6–12 chữ số và họ tên tối đa 150 ký tự.');
  }
  if (!data.traineeId || !data.fullName) {
    throw new Error('Vui lòng nhập đầy đủ Mã Trainee (MSSV) và Họ tên!');
  }

  const cleanTraineeId = String(data.traineeId).trim();
  const email = String(data.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Email Trainee không hợp lệ.');
  const phone = String(data.phone || '').trim();
  if (phone && !/^[0-9+() -]{8,20}$/.test(phone)) throw new Error('Số điện thoại không hợp lệ.');
  const dateOfBirth = String(data.dateOfBirth || '').trim();
  if (dateOfBirth) {
    const parsedDate = new Date(`${dateOfBirth}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== dateOfBirth || parsedDate > new Date()) throw new Error('Ngày sinh không hợp lệ.');
  }
  const facebookUrl = data.facebookUrl ? sanitizeUrl(String(data.facebookUrl).trim()) : '';
  const linkedinUrl = data.linkedinUrl ? sanitizeUrl(String(data.linkedinUrl).trim()) : '';
  if ((data.facebookUrl && !facebookUrl) || (data.linkedinUrl && !linkedinUrl)) throw new Error('Liên kết mạng xã hội không hợp lệ.');

  // Kiểm tra trùng lặp
  if (isMongoDBConnected) {
    const existing = await Trainee.findOne({ traineeId: cleanTraineeId });
    if (existing) {
      throw new Error(`Mã Trainee ${cleanTraineeId} đã tồn tại trong database!`);
    }
    const existingAccount = await Account.findOne({ $or: [{ username: cleanTraineeId.toLowerCase() }, { traineeId: cleanTraineeId }] }).lean();
    if (existingAccount) throw new Error(`Tài khoản ${cleanTraineeId} đã tồn tại trong database!`);
  } else {
    const existingMem = inMemoryTrainees.find(t => t.traineeId === cleanTraineeId);
    const existingAccount = [...inMemoryAccounts.values()].find(account => account.username === cleanTraineeId.toLowerCase() || account.traineeId === cleanTraineeId);
    if (existingMem || existingAccount) {
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

  const newDoc = {
    traineeId: cleanTraineeId,
    fullName: String(data.fullName).trim(),
    email,
    phone,
    dateOfBirth,
    gender: ['Nam', 'Nữ', 'Khác'].includes(data.gender) ? data.gender : '',
    address: String(data.address || '').trim().slice(0, 300),
    facebookUrl,
    linkedinUrl,
    department: String(data.department || '').trim().slice(0, 150),
    track: String(data.track || '').trim().slice(0, 80),
    batch: String(data.batch || 'Trainee 2026').trim().slice(0, 80),
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
    role: 'student'
  };

  if (isMongoDBConnected) {
    const created = await Trainee.create(newDoc);
    let account;
    try {
      account = await Account.create({
        username: cleanTraineeId.toLowerCase(),
        fullName: newDoc.fullName,
        password: hashPassword(DEFAULT_TRAINEE_PASSWORD),
        role: 'trainee',
        traineeId: cleanTraineeId,
        traineeRef: created._id,
        permissions: [],
        active: true,
        mustChangePassword: true,
        loginHistory: []
      });
      created.accountRef = account._id;
      await created.save();
    } catch (error) {
      await Trainee.deleteOne({ _id: created._id }).catch(() => {});
      throw error;
    }
    await syncRanksByStars();
    const obj = created.toObject();
    delete obj.password;
    return obj;
  }

  // Fallback InMemory
  newDoc._id = crypto.randomUUID();
  const accountId = 'acc-' + cleanTraineeId.toLowerCase();
  newDoc.accountRef = accountId;
  inMemoryTrainees.push(newDoc);
  inMemoryAccounts.set(accountId, {
    _id: accountId,
    username: cleanTraineeId.toLowerCase(),
    fullName: newDoc.fullName,
    password: hashPassword(DEFAULT_TRAINEE_PASSWORD),
    role: 'trainee',
    traineeId: cleanTraineeId,
    traineeRef: newDoc._id,
    permissions: [],
    active: true,
    sessionVersion: 0,
    createdAt: new Date(),
    lastPasswordChangeAt: null,
    mustChangePassword: true,
    loginHistory: []
  });
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
    'completedAssignments', 'totalAssignments', 'sessionStars', 'mentor'
  ];

  const safeData = {};
  const numericFields = ['accumulatedStars', 'attendedSessions', 'totalSessions', 'absentExcused', 'absentUnexcused', 'assignmentScore', 'completedAssignments', 'totalAssignments'];
  for (const field of numericFields) {
    if (updateData[field] !== undefined && updateData[field] !== null && (typeof updateData[field] !== 'number' || !Number.isFinite(updateData[field]) || updateData[field] < (field === 'accumulatedStars' ? -10000 : 0) || updateData[field] > (field === 'assignmentScore' ? 10 : 100000))) throw new Error('Chỉ số Trainee không hợp lệ.');
  }
  for (const field of ['fullName', 'email', 'department', 'track', 'batch', 'status', 'bio']) {
    if (updateData[field] !== undefined && (typeof updateData[field] !== 'string' || updateData[field].length > 2000)) throw new Error('Thông tin Trainee không hợp lệ.');
  }
  if (updateData.status !== undefined && !['Đang học', 'Ngừng học', 'Hoàn thành', 'Active', 'Completed', 'Inactive'].includes(updateData.status)) throw new Error('Trạng thái chương trình không hợp lệ.');
  if (updateData.mentor !== undefined) {
    const mentor = updateData.mentor;
    if (!mentor || typeof mentor !== 'object' || !mentor.name || !String(mentor.name).trim()) {
      safeData.mentor = null;
    } else {
      if (typeof mentor.name !== 'string' || mentor.name.trim().length > 150) throw new Error('Thông tin Mentor không hợp lệ.');
      const mentorEmail = String(mentor.email || '').trim().toLowerCase();
      if (mentorEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mentorEmail)) throw new Error('Email Mentor không hợp lệ.');
      safeData.mentor = {
        name: mentor.name.trim(),
        role: String(mentor.role || 'Mentor Trainee Program').trim().slice(0, 120),
        email: mentorEmail,
        phone: String(mentor.phone || '').trim().slice(0, 30),
        avatarInitial: String(mentor.avatarInitial || '').trim().slice(0, 4)
      };
    }
  }
  if (updateData.avatar !== undefined && (typeof updateData.avatar !== 'string' || (updateData.avatar && !/^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(updateData.avatar) && !/^https:\/\/api\.dicebear\.com\/[a-z0-9/?=&%.,_-]+$/i.test(updateData.avatar)))) throw new Error('Ảnh đại diện không hợp lệ.');
  for (const field of allowedFields) {
    if (field !== 'mentor' && updateData[field] !== undefined) {
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
let traineeAccountsSynced = false;

async function ensureTraineeAccountsInMongo() {
  if (!isMongoDBConnected || mongoose.connection.readyState !== 1 || traineeAccountsSynced) return;
  try {
    await Trainee.updateMany(
      { $or: [{ 'mentor.name': 'Võ Thị Xuân Quỳnh' }, { 'mentor.name': 'Ban Tổ chức UIT' }] },
      { $set: { mentor: null } }
    ).catch(() => {});
    const trainees = await Trainee.find().select('_id traineeId fullName status accountRef').lean();
    const accounts = await Account.find().select('_id username fullName role traineeId traineeRef sessionVersion').lean();
    const byTraineeId = new Map(accounts.map(account => [String(account.traineeId || account.username).toLowerCase(), account]));
    let failedAccounts = 0;
    for (const trainee of trainees) {
      try {
        const username = String(trainee.traineeId).trim().toLowerCase();
        let account = byTraineeId.get(username);
        if (account && account.role !== 'trainee') {
          failedAccounts++;
          console.warn(`[Account Sync] Bỏ qua MSSV ${trainee.traineeId} vì username đang thuộc tài khoản ${account.role}.`);
          continue;
        }
        if (!account) {
          const created = await Account.create({
            username,
            fullName: trainee.fullName,
            password: hashPassword(DEFAULT_TRAINEE_PASSWORD),
            role: 'trainee',
            traineeId: trainee.traineeId,
            traineeRef: trainee._id,
            permissions: [],
            active: trainee.status !== 'Ngừng học' && trainee.status !== 'Inactive',
            mustChangePassword: true,
            loginHistory: []
          });
          account = created.toObject ? created.toObject() : created;
        } else {
          await Account.updateOne({ _id: account._id }, { $set: {
            fullName: trainee.fullName,
            traineeRef: trainee._id,
            traineeId: trainee.traineeId,
            sessionVersion: Number.isInteger(account.sessionVersion) ? account.sessionVersion : 0
          } });
        }
        if (!trainee.accountRef || String(trainee.accountRef) !== String(account._id)) {
          await Trainee.updateOne({ _id: trainee._id }, { $set: { accountRef: account._id } });
        }
      } catch (error) {
        failedAccounts++;
        console.warn(`[Account Sync] Không thể tạo tài khoản cho MSSV ${trainee.traineeId}:`, error.message);
      }
    }
    await Trainee.updateMany({ password: { $exists: true } }, { $unset: { password: '' } });
    if (failedAccounts > 0) console.warn(`[Account Sync] Có ${failedAccounts} hồ sơ chưa thể liên kết tài khoản.`);
    traineeAccountsSynced = true;
  } catch (error) {
    console.warn('[Account Sync] Chưa đồng bộ được tài khoản Trainee:', error.message);
  }
}

function ensureTraineeAccountsInMemory() {
  for (const t of inMemoryTrainees) {
    const uname = String(t.traineeId).toLowerCase().trim();
    if (![...inMemoryAccounts.values()].some(a => a.username === uname)) {
      const id = 'acc-' + uname;
      inMemoryAccounts.set(id, {
        _id: id,
        username: uname,
        fullName: t.fullName,
        password: hashPassword(DEFAULT_TRAINEE_PASSWORD),
        role: 'trainee',
        traineeId: t.traineeId,
        permissions: [],
        active: t.status !== 'Ngừng học' && t.status !== 'Inactive',
        sessionVersion: 0,
        createdAt: new Date(),
        lastPasswordChangeAt: null,
        mustChangePassword: true,
        loginHistory: []
      });
    }
  }
}
ensureTraineeAccountsInMemory();

let dummyPasswordHash;
function burnPasswordCheck(password) {
  // Tốn thời gian tương đương khi tài khoản không tồn tại, tránh dò tên đăng nhập qua độ trễ.
  dummyPasswordHash = dummyPasswordHash || hashPassword('timing-equalizer-not-a-real-password');
  verifyPassword(password, dummyPasswordHash);
}

async function createOwnerAccount({ username, fullName = 'Quản trị hệ thống', password }) {
  const clean = String(username || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_.-]{2,79}$/.test(clean)) throw new Error('Tên tài khoản không hợp lệ.');
  if (typeof password !== 'string' || password.length < 8 || password.length > 256) throw new Error('Mật khẩu quản trị gốc cần 8–256 ký tự.');
  const doc = {
    username: clean, fullName, password: hashPassword(password), role: 'admin', isOwner: true,
    permissions: [...CONTENT_PERMISSIONS], active: true, sessionVersion: 0, mustChangePassword: false, loginHistory: []
  };
  if (isMongoDBConnected) {
    await Account.init();
    if (await Account.exists({ isOwner: true })) throw new Error('Đã có tài khoản quản trị gốc.');
    return visibleAccount((await Account.create(doc)).toObject());
  }
  if ([...inMemoryAccounts.values()].some(account => account.isOwner)) throw new Error('Đã có tài khoản quản trị gốc.');
  const account = { ...doc, _id: crypto.randomUUID(), createdAt: new Date() };
  inMemoryAccounts.set(account._id, account);
  return visibleAccount(account);
}

function visibleAccount(account, includeHistory = false) {
  const visible = {
    id: String(account._id), username: account.username, fullName: account.fullName,
    role: account.role, traineeId: account.traineeId || (account.role === 'trainee' ? account.username : null),
    isOwner: account.isOwner === true,
    permissions: account.isOwner === true ? ['accounts:manage', ...CONTENT_PERMISSIONS] : (account.permissions || []), active: account.active !== false,
    sessionVersion: account.sessionVersion || 0, createdAt: account.createdAt,
    lastLoginAt: account.lastLoginAt || null,
    lastPasswordChangeAt: account.lastPasswordChangeAt || null,
    mustChangePassword: Boolean(account.mustChangePassword)
  };
  if (includeHistory) {
    visible.loginHistory = (account.loginHistory || []).slice(-10).reverse().map(item => ({
      timestamp: item.timestamp,
      ip: item.ip || '',
      userAgent: item.userAgent || ''
    }));
  }
  return visible;
}

async function getAccounts() {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  ensureTraineeAccountsInMemory();
  if (isMongoDBConnected) await ensureTraineeAccountsInMongo();
  const list = isMongoDBConnected ? await Account.find().sort({ username: 1 }).lean() : [...inMemoryAccounts.values()];
  return list.map(account => visibleAccount(account, true));
}

async function saveAccount(id, data) {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  if (typeof data.fullName !== 'string' || !data.fullName.trim() || data.fullName.length > 150 ||
      !['admin', 'trainer', 'trainee'].includes(data.role) || typeof data.active !== 'boolean' ||
      !Array.isArray(data.permissions) || data.permissions.some(permission => !CONTENT_PERMISSIONS.includes(permission))) throw new Error('Thông tin hoặc quyền tài khoản không hợp lệ.');
  const password = typeof data.password === 'string' ? data.password.trim() : data.password;
  if ((!id || password) && data.role !== 'trainee' && (typeof password !== 'string' || password.length < 8 || password.length > 256)) throw new Error('Mật khẩu cần 8–256 ký tự.');
  let current;
  if (id) {
    current = isMongoDBConnected
      ? (mongoose.isValidObjectId(id) ? await Account.findById(id).select('+password').lean() : null)
      : inMemoryAccounts.get(id);
    if (!current) throw new Error('Không tìm thấy tài khoản.');
  }
  const username = current?.username || (typeof data.username === 'string' ? data.username.trim().toLowerCase() : '');
  if (!/^[a-z0-9][a-z0-9_.-]{2,79}$/.test(username)) throw new Error('Tên tài khoản không hợp lệ.');
  if (current?.isOwner) throw new Error('Không sửa tài khoản Quản trị gốc qua giao diện; đổi mật khẩu bằng chức năng Đổi mật khẩu.');
  const passToUse = password || (data.role === 'trainee' && !id ? DEFAULT_TRAINEE_PASSWORD : null);
  const changes = {
    fullName: data.fullName.trim(), role: data.role, active: data.active,
    traineeId: data.traineeId || (data.role === 'trainee' ? username : undefined),
    permissions: data.role === 'trainee' ? [] : [...new Set(data.permissions)],
    ...(passToUse ? { password: hashPassword(passToUse) } : {})
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

async function deleteAccount(id, actorUser) {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  if (!id) throw new Error('Thiếu định danh tài khoản.');
  if (!isMongoDBConnected) await connectDB();

  let target = isMongoDBConnected
    ? (mongoose.isValidObjectId(id) ? await Account.findById(id).lean() : await Account.findOne({ username: String(id).toLowerCase() }).lean())
    : inMemoryAccounts.get(id);

  if (!target) throw new Error('Không tìm thấy tài khoản để xóa.');
  if (target.role === 'trainee') throw new Error('Tài khoản Trainee được liên kết với hồ sơ; hãy khóa tài khoản thay vì xóa.');

  if (target.isOwner) {
    throw new Error('Không thể xóa tài khoản Quản trị gốc (Admin Owner).');
  }

  if (actorUser && (actorUser.id === String(target._id) || actorUser.username === target.username)) {
    throw new Error('Bạn không thể tự xóa tài khoản của chính mình.');
  }

  if (isMongoDBConnected) {
    await Account.findByIdAndDelete(target._id);
  } else {
    inMemoryAccounts.delete(target._id);
  }
  return { success: true, message: `Đã xóa tài khoản "${target.username}" thành công khỏi hệ thống.` };
}

async function resolveAccountSession(payload) {
  if (!payload.accountId) return null;
  if (!isMongoDBConnected) await connectDB();
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  ensureTraineeAccountsInMemory();
  let account = isMongoDBConnected
    ? (mongoose.isValidObjectId(payload.accountId) ? await Account.findById(payload.accountId).lean() : null)
    : inMemoryAccounts.get(payload.accountId);
  if (!account && isMongoDBConnected && payload.username) {
    account = await Account.findOne({ username: String(payload.username).toLowerCase() }).lean();
  }
  if (!account && !isMongoDBConnected && payload.username) {
    account = [...inMemoryAccounts.values()].find(item => item.username === String(payload.username).toLowerCase());
  }
  const accountSessionVersion = Number.isInteger(account?.sessionVersion) ? account.sessionVersion : 0;
  const payloadSessionVersion = Number.isInteger(payload.sessionVersion) ? payload.sessionVersion : 0;
  if (!account || account.active === false || accountSessionVersion !== payloadSessionVersion) return null;
  const user = visibleAccount(account);
  if (account.role === 'trainee') {
    const tid = account.traineeId || account.username;
    const trainee = isMongoDBConnected
      ? await Trainee.findOne({ traineeId: tid }).lean()
      : inMemoryTrainees.find(t => t.traineeId.toLowerCase() === String(tid).toLowerCase());
    if (trainee) {
      user.avatar = trainee.avatar || '';
      user.email = trainee.email || '';
      user.track = trainee.track || '';
      user.batch = trainee.batch || '';
      user.department = trainee.department || '';
      user.status = trainee.status || 'Đang học';
      user.phone = trainee.phone || '';
      user.bio = trainee.bio || '';
      user.traineeId = trainee.traineeId;
    }
  }
  return user;
}

async function authenticateUser(username, password, clientInfo = {}) {
  const clean = String(username).trim().toLowerCase();
  {
    if (!isMongoDBConnected) await connectDB();
    if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
    ensureTraineeAccountsInMemory();
    if (isMongoDBConnected) await ensureTraineeAccountsInMongo();

    let account = isMongoDBConnected
      ? await Account.findOne({ $or: [{ username: clean }, { traineeId: clean }, { traineeId: clean.toUpperCase() }] }).select('+password').lean()
      : [...inMemoryAccounts.values()].find(item => item.username === clean || String(item.traineeId || '').toLowerCase() === clean);

    if (!account) {
      burnPasswordCheck(password);
      return { success: false, message: 'Tài khoản hoặc mật khẩu không chính xác.' };
    }

    if (account.active === false) {
      return { success: false, message: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Admin để được hỗ trợ mở khóa.' };
    }

    const passwordValid = verifyPassword(password, account.password);

    if (!passwordValid) {
      return { success: false, message: 'Tài khoản hoặc mật khẩu không chính xác.' };
    }

    if (!String(account.password).startsWith('scrypt$')) {
      account.password = hashPassword(password);
      if (isMongoDBConnected) await Account.updateOne({ _id: account._id }, { $set: { password: account.password } });
    }

    const now = new Date();
    const loginEntry = {
      timestamp: now,
      ip: clientInfo.ip || '127.0.0.1',
      userAgent: clientInfo.userAgent || ''
    };

    if (isMongoDBConnected) {
      try {
        if (typeof Account.updateOne === 'function') {
          await Account.updateOne({ _id: account._id }, { $set: { lastLoginAt: now }, $push: { loginHistory: { $each: [loginEntry], $slice: -20 } } });
        }
      } catch (e) {}
    } else {
      account.lastLoginAt = now;
      account.loginHistory = account.loginHistory || [];
      account.loginHistory.push(loginEntry);
      if (account.loginHistory.length > 20) account.loginHistory.shift();
    }

    const userObj = visibleAccount(account);
    if (account.role === 'trainee') {
      const tid = account.traineeId || account.username;
      const trainee = isMongoDBConnected
        ? await Trainee.findOne({ traineeId: tid }).lean()
        : inMemoryTrainees.find(t => t.traineeId.toLowerCase() === String(tid).toLowerCase());
      if (trainee) {
        userObj.avatar = trainee.avatar || '';
        userObj.email = trainee.email || '';
        userObj.track = trainee.track || '';
        userObj.batch = trainee.batch || '';
        userObj.department = trainee.department || '';
        userObj.status = trainee.status || 'Đang học';
        userObj.phone = trainee.phone || '';
        userObj.bio = trainee.bio || '';
        userObj.traineeId = trainee.traineeId;
      }
    }

    return { success: true, user: userObj };
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

/**
 * Tự động đồng bộ và chuẩn hóa Ban (Hệ thống / Truyền thông - Sự kiện) và làm sạch Ghi chú trong MongoDB
 */
async function syncScheduleDepartmentsInMongo() {
  if (!isMongoDBConnected) return;
  try {
    const schedules = await Schedule.find({ $or: [{ department: { $in: ['', null] } }, { note: { $regex: /ban\s*(hệ\s*thống|truyền\s*thông)/i } }] }).lean();
    if (!schedules || schedules.length === 0) return;
    for (const s of schedules) {
      let dept = (s.department || '').trim();
      let note = (s.note || '').trim();
      const title = (s.title || '').trim();

      if (!dept) {
        if (/hệ\s*thống/i.test(note) || /hệ\s*thống/i.test(title)) dept = 'Hệ thống';
        else if (/truyền\s*thông|sự\s*kiện|canva/i.test(note) || /truyền\s*thông|sự\s*kiện|canva/i.test(title)) dept = 'Truyền thông - Sự kiện';
      }

      let cleanedNote = note;
      if (note) {
        cleanedNote = note
          .replace(/^(\s*\[?\s*BAN\s*HỆ\s*THỐNG\s*\]?\s*[:\-–—]?\s*)/i, '')
          .replace(/^(\s*\[?\s*HỆ\s*THỐNG\s*\]?\s*[:\-–—]?\s*)/i, '')
          .replace(/^(\s*\[?\s*BAN\s*TRUYỀN\s*THÔNG\s*(-|–|—)?\s*(SỰ\s*KIỆN)?\s*\]?\s*[:\-–—]?\s*)/i, '')
          .replace(/^(\s*\[?\s*TRUYỀN\s*THÔNG\s*(-|–|—)?\s*(SỰ\s*KIỆN)?\s*\]?\s*[:\-–—]?\s*)/i, '')
          .trim();
      }

      if (dept !== s.department || cleanedNote !== s.note) {
        await Schedule.updateOne({ _id: s._id }, { $set: { department: dept, note: cleanedNote } });
      }
    }
  } catch (err) {
    // Non-blocking
  }
}

async function getAllSchedules({ month, year, all } = {}) {
  const isAll = all === true || all === 'true' || all === '1';
  if (!isAll) {
    const today = new Date(Date.now() + 7 * 3600000);
    month = month === undefined ? today.getUTCMonth() + 1 : Number(month);
    year = year === undefined ? today.getUTCFullYear() : Number(year);
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('Tháng hoặc năm không hợp lệ.');
  }
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  if (!isMongoDBConnected) {
    await connectDB();
  }

  if (isMongoDBConnected) {
    syncScheduleDepartmentsInMongo().catch(() => {});
    const query = isAll ? {} : { month: Number(month) || 10, year: Number(year) || 2026 };
    let items = await Schedule.find(query).sort({ date: 1, startTime: 1 }).lean();

    return items.map(s => {
      let dept = (s.department || '').trim();
      let note = (s.note || '').trim();
      const title = (s.title || '').trim();
      if (!dept) {
        if (/hệ\s*thống/i.test(note) || /hệ\s*thống/i.test(title)) dept = 'Hệ thống';
        else if (/truyền\s*thông|sự\s*kiện|canva/i.test(note) || /truyền\s*thông|sự\s*kiện|canva/i.test(title)) dept = 'Truyền thông - Sự kiện';
      }
      let cleanedNote = note;
      if (note) {
        cleanedNote = note
          .replace(/^(\s*\[?\s*BAN\s*HỆ\s*THỐNG\s*\]?\s*[:\-–—]?\s*)/i, '')
          .replace(/^(\s*\[?\s*HỆ\s*THỐNG\s*\]?\s*[:\-–—]?\s*)/i, '')
          .replace(/^(\s*\[?\s*BAN\s*TRUYỀN\s*THÔNG\s*(-|–|—)?\s*(SỰ\s*KIỆN)?\s*\]?\s*[:\-–—]?\s*)/i, '')
          .replace(/^(\s*\[?\s*TRUYỀN\s*THÔNG\s*(-|–|—)?\s*(SỰ\s*KIỆN)?\s*\]?\s*[:\-–—]?\s*)/i, '')
          .trim();
      }
      let docs = Array.isArray(s.documents) && s.documents.length > 0 ? s.documents : [];
      if (docs.length === 0 && s.documentUrl) {
        docs = [{ title: 'Tài liệu buổi học', url: s.documentUrl }];
      }
      let room = (s.room || '').trim();
      if (s.type === 'Offline' && (!room || room === 'MS Teams Trực Tuyến')) {
        room = 'Phòng học trực tiếp';
      } else if (!room) {
        room = 'MS Teams Trực Tuyến';
      }
      return { ...s, department: dept, note: cleanedNote, documents: docs, room };
    });
  }

  // Fallback nếu không có kết nối DB
  if (isAll) {
    return [...DEFAULT_OCTOBER_SCHEDULES].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }
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

function sanitizeScheduleDocuments(rawDocs) {
  if (!rawDocs) return [];
  if (!Array.isArray(rawDocs)) return [];
  const results = [];
  for (const item of rawDocs) {
    if (!item) continue;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const rawUrl = typeof item.url === 'string' ? item.url.trim() : '';
    if (!rawUrl) continue;
    let url;
    try { url = new URL(rawUrl); } catch { throw new Error(`Link tài liệu "${rawUrl}" phải là URL http hoặc https hợp lệ.`); }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`Link tài liệu "${rawUrl}" phải là URL http hoặc https hợp lệ.`);
    results.push({
      title: title || 'Tài liệu buổi học',
      url: rawUrl
    });
  }
  return results;
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
    department: data.department ? String(data.department).trim() : '',
    month,
    year,
    date: dateStr,
    dayOfWeekText: dayText,
    startTime: data.startTime || '19:30',
    endTime: data.endTime || '21:30',
    periods: data.periods || 'Tiết 1 - 4 (Tối)',
    type: data.type || 'Online',
    instructor: data.instructor || 'Trainer',
    room: data.room ? String(data.room).trim() : (data.type === 'Offline' ? 'Phòng học trực tiếp' : 'MS Teams Trực Tuyến'),
    teamsUrl: data.teamsUrl ? String(data.teamsUrl).trim() : '',
    recordUrl: data.recordUrl ? String(data.recordUrl).trim() : '',
    documentUrl: (() => {
      const docs = sanitizeScheduleDocuments(data.documents);
      if (docs.length > 0) return docs[0].url;
      return scheduleDocumentUrl(data.documentUrl);
    })(),
    documents: (() => {
      const docs = sanitizeScheduleDocuments(data.documents);
      if (docs.length > 0) return docs;
      const dUrl = scheduleDocumentUrl(data.documentUrl);
      return dUrl ? [{ title: 'Tài liệu buổi học', url: dUrl }] : [];
    })(),
    note: data.note ? String(data.note).trim() : '',
    status: data.status || 'upcoming',
    isTentative: data.isTentative === true,
    credits: Number(data.credits) || 3
  };

  if (isMongoDBConnected) {
    const created = (await Schedule.create(doc)).toObject();
    await notifyScheduleChange(created, true);
    return created;
  }

  // Fallback InMemory
  const mockItem = { _id: 'sched_' + Date.now(), ...doc };
  DEFAULT_OCTOBER_SCHEDULES.push(mockItem);
  await notifyScheduleChange(mockItem, true);
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
  const requestedDocuments = data.documents;
  const fields = ['title', 'code', 'date', 'startTime', 'endTime', 'periods', 'type', 'instructor', 'room', 'teamsUrl', 'recordUrl', 'note', 'department'];
  data = Object.fromEntries(fields.filter(field => data[field] !== undefined).map(field => [field, String(data[field]).trim()]));
  if (requestedDocuments !== undefined) {
    const docs = sanitizeScheduleDocuments(requestedDocuments);
    data.documents = docs;
    data.documentUrl = docs.length > 0 ? docs[0].url : '';
  } else if (requestedDocumentUrl !== undefined) {
    data.documentUrl = scheduleDocumentUrl(requestedDocumentUrl);
    data.documents = data.documentUrl ? [{ title: 'Tài liệu buổi học', url: data.documentUrl }] : [];
  }
  if (data.type === 'Offline' && (!data.room || data.room === 'MS Teams Trực Tuyến')) {
    data.room = 'Phòng học trực tiếp';
  }
  if (requestedIsTentative !== undefined) {
    if (typeof requestedIsTentative !== 'boolean') throw new Error('Trạng thái lịch dự kiến không hợp lệ.');
    data.isTentative = requestedIsTentative;
  }
  const merged = Schedule.validateTiming({ ...existing, ...data });
  data.month = Number(merged.date.slice(5, 7));
  data.year = Number(merged.date.slice(0, 4));
  data.dayOfWeekText = computeDayOfWeekText(merged.date);
  const rescheduled = ['date', 'startTime', 'endTime', 'room', 'type'].some(field => data[field] !== undefined && data[field] !== existing[field])
    || (data.isTentative !== undefined && data.isTentative !== Boolean(existing.isTentative));

  if (isMongoDBConnected) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error(`ID buổi học "${id}" không hợp lệ!`);
    }

    const updated = await Schedule.findByIdAndUpdate(id, { $set: data }, { new: true }).lean();
    if (!updated) {
      throw new Error(`Không tìm thấy buổi học với ID: ${id}`);
    }

    if (rescheduled) await notifyScheduleChange(updated, false);
    return updated;
  }

  // Fallback InMemory
  let item = DEFAULT_OCTOBER_SCHEDULES.find(s => s._id === id || s.code === id);
  if (!item) {
    throw new Error(`Không tìm thấy buổi học với ID: ${id}`);
  }
  Object.assign(item, data);
  if (rescheduled) await notifyScheduleChange(item, false);
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
  if (!isMongoDBConnected) {
    await connectDB();
  }
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

async function createLeaveRequest(data, traineeId) {
  if (!isMongoDBConnected) {
    await connectDB();
  }
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  if (typeof traineeId !== 'string' || !/^\d{6,12}$/.test(traineeId) ||
      typeof data.scheduleCode !== 'string' || !/^[\w.-]{1,80}$/.test(data.scheduleCode) ||
      typeof data.scheduleDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.scheduleDate) ||
      typeof data.reason !== 'string' || data.reason.trim().length < 10 || data.reason.length > 3000 || data.commit !== true) {
    throw new Error('Vui lòng kiểm tra buổi học, lý do (10–3000 ký tự) và cam kết.');
  }
  const trainee = await getTraineeById(traineeId);
  if (!trainee) throw new Error('Tài khoản không liên kết với hồ sơ Trainee.');
  const [year, month] = data.scheduleDate.split('-').map(Number);
  const schedules = await getAllSchedules({ month, year });
  let schedule = schedules.find(item => item.code === data.scheduleCode && item.date === data.scheduleDate);
  if (!schedule) {
    const allSchedules = await getAllSchedules({ all: true });
    schedule = allSchedules.find(item => item.code === data.scheduleCode && item.date === data.scheduleDate);
  }
  if (!schedule) throw new Error('Buổi học không tồn tại hoặc đã thay đổi. Vui lòng tải lại lịch.');
  const submissionKey = crypto.createHash('sha256').update(`${trainee.traineeId}:${schedule.code}:${schedule.date}`).digest('hex');
  const doc = {
    type: 'leave', traineeId: trainee.traineeId, fullName: trainee.fullName,
    email: trainee.email, message: data.reason.trim(), status: 'pending',
    scheduleCode: schedule.code, scheduleTitle: schedule.title, scheduleDate: schedule.date,
    scheduleTime: `${schedule.startTime} - ${schedule.endTime}`, submissionKey,
    publicVisible: false, createdAt: new Date()
  };
  let request;
  if (isMongoDBConnected) {
    await SupportRequest.init();
    try {
      request = await SupportRequest.findOneAndUpdate({ type: 'leave', submissionKey }, { $setOnInsert: doc }, { upsert: true, new: true, runValidators: true }).lean();
    } catch (err) {
      if (err.code === 11000) request = await SupportRequest.findOne({ type: 'leave', submissionKey }).lean();
      else throw err;
    }
    await notifyAdminsOfLeave(request).catch(err => console.warn('Không tạo được thông báo đơn xin nghỉ:', err.message));
    return request;
  }
  request = inMemorySupportRequests.find(item => item.submissionKey === submissionKey);
  if (!request) {
    if (inMemorySupportRequests.length >= 500) throw new Error('Hệ thống tạm thời chưa nhận thêm đơn. Vui lòng thử lại sau.');
    doc._id = 'req_' + crypto.randomUUID();
    inMemorySupportRequests.unshift(doc);
    request = doc;
  }
  await notifyAdminsOfLeave(request).catch(err => console.warn('Không tạo được thông báo đơn xin nghỉ:', err.message));
  return request;
}


async function getLeaveRequests(traineeId = null) {
  if (!isMongoDBConnected) {
    await connectDB();
  }
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  const filter = { type: 'leave' };
  if (traineeId) filter.traineeId = traineeId;
  const list = isMongoDBConnected
    ? await SupportRequest.find(filter).sort({ createdAt: -1 }).limit(100).lean()
    : inMemorySupportRequests.filter(item => item.type === 'leave' && (!traineeId || item.traineeId === traineeId)).slice(0, 100);
  return list.map(item => ({
    id: String(item._id), traineeId: item.traineeId, fullName: item.fullName,
    reason: item.message, scheduleCode: item.scheduleCode, scheduleTitle: item.scheduleTitle,
    scheduleDate: item.scheduleDate, scheduleTime: item.scheduleTime,
    submittedAt: item.createdAt, status: item.status, resolvedAt: item.resolvedAt || null
  }));
}

async function getSupportRequest(id) {
  if (!isMongoDBConnected) {
    await connectDB();
  }
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  if (isMongoDBConnected) return mongoose.isValidObjectId(id) ? SupportRequest.findById(id).lean() : null;
  return inMemorySupportRequests.find(item => item._id === id) || null;
}

async function updateLeaveRequest(id, update, claimEmail = false) {
  if (!isMongoDBConnected) {
    await connectDB();
  }
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

async function resolveSupportRequest(requestId, newPassword = DEFAULT_TRAINEE_PASSWORD, adminUser = 'Admin') {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');

  if (isMongoDBConnected) {
    const request = await SupportRequest.findById(requestId);
    if (!request) {
      throw new Error('Không tìm thấy yêu cầu hỗ trợ!');
    }

    await adminResetPassword(request.traineeId, newPassword);
    const updatedTrainee = await Trainee.findOne({ traineeId: request.traineeId }).lean();

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

  await adminResetPassword(reqItem.traineeId, newPassword);
  const trainee = inMemoryTrainees.find(t => t.traineeId === reqItem.traineeId || t.email === reqItem.email);

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
    createdAt: new Date('2026-10-30T10:15:00.000Z'),
    answeredAt: new Date('2026-10-30T14:30:00.000Z'),
    likesCount: 15,
    likedBy: []
  }
];

function sanitizeQuestionTimestamps(q) {
  if (!q) return q;
  let cTime = q.createdAt ? new Date(q.createdAt).getTime() : NaN;
  let aTime = q.answeredAt ? new Date(q.answeredAt).getTime() : NaN;
  if (isNaN(cTime)) {
    cTime = !isNaN(aTime) ? aTime - 45 * 60 * 1000 : Date.now();
    q.createdAt = new Date(cTime);
  }
  if (!isNaN(aTime) && cTime > aTime) {
    // Thời gian giải đáp phải sau thời gian gửi câu hỏi
    q.answeredAt = new Date(cTime + 15 * 60 * 1000);
    if (isMongoDBConnected && q._id && typeof Question.updateOne === 'function') {
      Question.updateOne({ _id: q._id }, { $set: { answeredAt: q.answeredAt } }).catch(() => {});
    }
  }
  return q;
}

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
    return list.map(sanitizeQuestionTimestamps);
  }

  // Fallback to inMemoryQuestions
  let list = inMemoryQuestions.map(q => sanitizeQuestionTimestamps({ ...q }));
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
  const linkedTraineeId = String(data.traineeId || '').trim();
  if (linkedTraineeId) mssv = linkedTraineeId;
  let trainee = null;
  if (mssv && mssv !== 'Ẩn danh') {
    if (!/^\d{6,12}$/.test(mssv)) throw new Error('MSSV phải gồm 6–12 chữ số.');
    trainee = await getTraineeById(mssv);
    if (trainee) {
      mssv = trainee.traineeId;
    }
  }
  if (!isAnonymous && !mssv) throw new Error('Vui lòng nhập MSSV hợp lệ hoặc chọn chế độ Ẩn danh.');
  if (!isAnonymous && !/^\d{6,12}$/.test(mssv)) throw new Error('MSSV phải gồm 6–12 chữ số.');
  const fullName = isAnonymous ? 'Trainee ẩn danh' : (trainee?.fullName || (data.fullName && data.fullName !== 'Trainee ẩn danh' ? String(data.fullName).trim() : `Sinh viên ${mssv}`));

  const title = String(data.title || '').trim();
  const content = String(data.content || '').trim();

  if (!title) throw new Error('Vui lòng nhập Tiêu đề câu hỏi!');
  if (!content || content.length < 10) throw new Error('Vui lòng nhập nội dung chi tiết câu hỏi (tối thiểu 10 ký tự)!');

  const randomNum = Math.floor(100 + Math.random() * 900);
  const code = `Q-2026-${Date.now().toString().slice(-3)}${randomNum.toString().slice(-1)}`;

  const newDoc = {
    code,
    traineeId: linkedTraineeId || (trainee ? trainee.traineeId : (isAnonymous ? '' : mssv)),
    mssv: isAnonymous ? 'Ẩn danh' : mssv,
    realMssv: trainee?.traineeId || (mssv && mssv !== 'Ẩn danh' ? mssv : ''),
    fullName,
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
    if (!updated) return null;
    const result = updated.toObject();
    await notifyQuestionAnswered(result);
    return result;
  }
  const item = inMemoryQuestions.find(q => q._id === questionId || q.code === questionId);
  if (!item) return null;
  Object.assign(item, changes);
  await notifyQuestionAnswered(item);
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

async function updateAssignmentSubmission(assignmentId, traineeId, data = {}, reviewer) {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  const id = Number(assignmentId);
  if (!(await getAllAssignments()).some(item => item.assignmentId === id)) throw new Error('Không tìm thấy bài tập.');
  if (!(await getTraineeById(traineeId))) throw new Error('Không tìm thấy Trainee.');
  if (!['not_submitted', 'submitted', 'needs_revision', 'completed'].includes(data.status)) throw new Error('Trạng thái ghi nhận không hợp lệ.');
  const responseId = data.responseId ?? '';
  const note = data.note ?? '';
  if (typeof responseId !== 'string' || responseId.length > 120 || typeof note !== 'string' || note.length > 2000) throw new Error('Mã phản hồi hoặc ghi chú không hợp lệ.');
  const record = {
    assignmentId: id, traineeId, status: data.status,
    responseId: responseId.trim(), note: note.trim(),
    reviewedBy: String(reviewer || 'admin'), reviewedAt: new Date()
  };
  // Trạng thái "Chưa ghi nhận" không kèm dữ liệu nghĩa là chưa có gì để lưu; xóa bản ghi để không hiện như một hoạt động của Trainee.
  if (record.status === 'not_submitted' && !record.responseId && !record.note) {
    if (isMongoDBConnected) await AssignmentSubmission.deleteOne({ assignmentId: id, traineeId });
    else inMemoryAssignmentSubmissions.delete(id + ':' + traineeId);
    return { assignmentId: id, traineeId, status: 'not_submitted', responseId: '', note: '', reviewedAt: null };
  }
  if (isMongoDBConnected) {
    return AssignmentSubmission.findOneAndUpdate({ assignmentId: id, traineeId }, { $set: record },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }).lean();
  }
  const previous = inMemoryAssignmentSubmissions.get(id + ':' + traineeId);
  inMemoryAssignmentSubmissions.set(id + ':' + traineeId, { ...previous, ...record });
  return inMemoryAssignmentSubmissions.get(id + ':' + traineeId);
}


const NOTIFICATION_PREFERENCE_FIELDS = { schedule: 'scheduleNotify', assignment: 'assignmentNotify', question: 'questionNotify' };
const ACTIVE_TRAINEE_STATUSES = ['Đang học', 'Active'];
const NOTIFICATION_LIST_LIMIT = 30;
const NOTIFICATION_MEMORY_LIMIT_PER_TRAINEE = 100;
let inMemoryNotifications = [];
let inMemoryNotificationSeq = 0;

async function getNotificationRecipients(type, traineeIds) {
  const field = NOTIFICATION_PREFERENCE_FIELDS[type];
  if (isMongoDBConnected) {
    const query = traineeIds ? { traineeId: { $in: traineeIds } } : { status: { $in: ACTIVE_TRAINEE_STATUSES } };
    query[`notificationPreferences.${field}`] = { $ne: false };
    return (await Trainee.find(query).select('traineeId').lean()).map(item => item.traineeId);
  }
  return inMemoryTrainees
    .filter(item => (traineeIds ? traineeIds.includes(item.traineeId) : !item.status || ACTIVE_TRAINEE_STATUSES.includes(item.status)) && item.notificationPreferences?.[field] !== false)
    .map(item => item.traineeId);
}

async function pushNotifications(entries) {
  if (!entries.length) return;
  if (isMongoDBConnected) {
    await Notification.bulkWrite(entries.map(({ traineeId, refKey, ...fields }) => ({
      updateOne: { filter: { traineeId, refKey }, update: { $setOnInsert: { ...fields, readAt: null } }, upsert: true }
    })), { ordered: false });
    return;
  }
  for (const entry of entries) {
    if (inMemoryNotifications.some(item => item.traineeId === entry.traineeId && item.refKey === entry.refKey)) continue;
    inMemoryNotifications.unshift({ ...entry, dueAt: entry.dueAt || null, readAt: null, _id: 'n_' + (++inMemoryNotificationSeq), createdAt: new Date() });
  }
  const counts = new Map();
  inMemoryNotifications = inMemoryNotifications.filter(item => {
    const count = (counts.get(item.traineeId) || 0) + 1;
    counts.set(item.traineeId, count);
    return count <= NOTIFICATION_MEMORY_LIMIT_PER_TRAINEE;
  });
}

async function notifyAdminsOfLeave(request) {
  if (!request) return;
  const admins = isMongoDBConnected
    ? await Account.find({ role: 'admin', active: { $ne: false } }).select('_id').lean()
    : [...inMemoryAccounts.values()].filter(account => account.role === 'admin' && account.active !== false);
  await pushNotifications(admins.map(account => ({
    traineeId: `account:${account._id}`,
    type: 'leave',
    title: `Đơn xin nghỉ mới: ${request.fullName}`.slice(0, 200),
    body: `${request.scheduleTitle} · ${request.scheduleDate}`.slice(0, 300),
    link: 'leave',
    refKey: `leave:${request._id}`
  })));
}

function formatVietnamDateTime(value) {
  const [date, time] = new Date(new Date(value).getTime() + 7 * 3600000).toISOString().slice(0, 16).split('T');
  const [year, month, day] = date.split('-');
  return `${time} ${day}/${month}/${year}`;
}

async function notifyScheduleChange(item, isNew) {
  try {
    if (Schedule.getTiming(item).status === 'completed') return;
    const [year, month, day] = item.date.split('-');
    const when = `${item.dayOfWeekText ? item.dayOfWeekText + ', ' : ''}${day}/${month}/${year} · ${item.startTime} - ${item.endTime}${item.isTentative ? ' (dự kiến)' : ''}`;
    const refKey = `schedule:${item._id}:${isNew ? 'new' : Date.now()}`;
    const title = `${isNew ? 'Lịch học mới' : 'Lịch học thay đổi'}: ${item.title}`.slice(0, 200);
    const recipients = await getNotificationRecipients('schedule');
    await pushNotifications(recipients.map(traineeId => ({ traineeId, type: 'schedule', title, body: when, link: 'schedule', refKey })));
  } catch (err) {
    console.warn('Không tạo được thông báo lịch học:', err.message);
  }
}

async function notifyQuestionAnswered(question) {
  if (!question.traineeId) return;
  try {
    const [recipient] = await getNotificationRecipients('question', [question.traineeId]);
    if (!recipient) return;
    await pushNotifications([{
      traineeId: recipient, type: 'question', title: 'Câu hỏi của bạn đã được phản hồi',
      body: String(question.title || '').slice(0, 300), link: 'questions',
      refKey: `question:${question._id}:${new Date(question.answeredAt).getTime()}`
    }]);
  } catch (err) {
    console.warn('Không tạo được thông báo Q&A:', err.message);
  }
}

// Không có job nền (Vercel), nên nhắc hạn được tạo khi Trainee mở portal.
async function syncAssignmentReminders(traineeId) {
  const [recipient] = await getNotificationRecipients('assignment', [traineeId]);
  if (!recipient) return;
  const now = Date.now();
  const due = (await getAllAssignments()).filter(item => {
    const remaining = item.deadline ? new Date(item.deadline).getTime() - now : NaN;
    return ['active', 'completed'].includes(item.status) && remaining > 0 && remaining <= 24 * 3600000;
  });
  if (!due.length) return;
  const ids = due.map(item => item.assignmentId);
  const submissions = isMongoDBConnected
    ? await AssignmentSubmission.find({ traineeId, assignmentId: { $in: ids } }).select('assignmentId status').lean()
    : [...inMemoryAssignmentSubmissions.values()].filter(item => item.traineeId === traineeId && ids.includes(item.assignmentId));
  const finished = new Set(submissions.filter(item => ['submitted', 'completed'].includes(item.status)).map(item => item.assignmentId));
  await pushNotifications(due.filter(item => !finished.has(item.assignmentId)).map(item => ({
    traineeId, type: 'assignment', title: `Sắp đến hạn nộp: ${item.title}`.slice(0, 200),
    body: `Hạn nộp: ${formatVietnamDateTime(item.deadline)}`, link: 'assignments',
    dueAt: new Date(item.deadline), refKey: `assignment:${item.assignmentId}:${new Date(item.deadline).getTime()}`
  })));
}

async function getNotifications(traineeId, includeAssignmentReminders = true) {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  if (includeAssignmentReminders) await syncAssignmentReminders(traineeId).catch(err => console.warn('Không tạo được nhắc hạn bài tập:', err.message));
  const now = new Date();
  const visible = item => item.type !== 'assignment' || (item.dueAt && new Date(item.dueAt) > now);
  const publicItem = item => ({
    id: String(item._id), type: item.type, title: item.title, body: item.body || '', link: item.link || '',
    dueAt: item.dueAt || null, read: Boolean(item.readAt), createdAt: item.createdAt
  });
  if (isMongoDBConnected) {
    const filter = { traineeId, $or: [{ type: { $ne: 'assignment' } }, { dueAt: { $gt: now } }] };
    const [items, unread] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).limit(NOTIFICATION_LIST_LIMIT).lean(),
      Notification.countDocuments({ ...filter, readAt: null })
    ]);
    return { items: items.map(publicItem), unread };
  }
  const own = inMemoryNotifications.filter(item => item.traineeId === traineeId && visible(item));
  return { items: own.slice(0, NOTIFICATION_LIST_LIMIT).map(publicItem), unread: own.filter(item => !item.readAt).length };
}

async function markNotificationsRead(traineeId, id) {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  const readAt = new Date();
  if (isMongoDBConnected) {
    const filter = { traineeId, readAt: null };
    if (id) {
      if (!mongoose.Types.ObjectId.isValid(id)) return 0;
      filter._id = id;
    }
    return (await Notification.updateMany(filter, { $set: { readAt } })).modifiedCount;
  }
  let changed = 0;
  for (const item of inMemoryNotifications) {
    if (item.traineeId === traineeId && !item.readAt && (!id || item._id === id)) {
      item.readAt = readAt;
      changed++;
    }
  }
  return changed;
}

async function changeAccountPassword(user, currentPassword, newPassword) {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  const account = isMongoDBConnected
    ? await Account.findById(user.id).select('+password')
    : inMemoryAccounts.get(user.id);
  if (!account || !verifyPassword(currentPassword, account.password)) throw new Error('Mật khẩu hiện tại không chính xác.');
  const minLen = 8;
  if (typeof newPassword !== 'string' || newPassword.trim().length < minLen || newPassword.length > 256) throw new Error(`Mật khẩu mới cần ${minLen}–256 ký tự.`);
  account.password = hashPassword(newPassword.trim());
  account.sessionVersion = (account.sessionVersion || 0) + 1;
  account.lastPasswordChangeAt = new Date();
  account.mustChangePassword = false;
  if (isMongoDBConnected) await account.save();
}

async function adminResetPassword(identifier, newPassword = DEFAULT_TRAINEE_PASSWORD) {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  const clean = String(identifier).trim().toLowerCase();
  let account;
  if (isMongoDBConnected) {
    account = mongoose.isValidObjectId(clean)
      ? await Account.findById(clean).select('+password')
      : await Account.findOne({ $or: [{ username: clean }, { traineeId: clean }] }).select('+password');
  } else {
    account = inMemoryAccounts.get(clean) || [...inMemoryAccounts.values()].find(a => a.username === clean || a.traineeId === clean);
  }
  if (!account) throw new Error('Không tìm thấy tài khoản cần đặt lại mật khẩu.');
  if (account.isOwner) throw new Error('Không đặt lại mật khẩu Quản trị gốc qua giao diện.');
  const password = String(newPassword || DEFAULT_TRAINEE_PASSWORD);
  const minLength = 8;
  if (password.length < minLength || password.length > 256) throw new Error(`Mật khẩu tạm thời cần ${minLength}–256 ký tự.`);
  account.password = hashPassword(password);
  account.sessionVersion = (account.sessionVersion || 0) + 1;
  account.lastPasswordChangeAt = new Date();
  account.mustChangePassword = true;
  if (isMongoDBConnected) await account.save();
  return { success: true, message: `Đã đặt lại mật khẩu cho tài khoản "${account.username}" và yêu cầu đổi mật khẩu khi đăng nhập.` };
}

async function adminRequirePasswordChange(identifier) {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  const clean = String(identifier).trim().toLowerCase();
  const account = isMongoDBConnected
    ? (mongoose.isValidObjectId(clean)
      ? await Account.findById(clean)
      : await Account.findOne({ $or: [{ username: clean }, { traineeId: clean }] }))
    : inMemoryAccounts.get(clean) || [...inMemoryAccounts.values()].find(item => item.username === clean || String(item.traineeId || '').toLowerCase() === clean);
  if (!account) throw new Error('Không tìm thấy tài khoản.');
  account.mustChangePassword = true;
  account.sessionVersion = (account.sessionVersion || 0) + 1;
  if (isMongoDBConnected) await account.save();
  return { success: true, message: `Tài khoản "${account.username}" sẽ phải đổi mật khẩu ở lần đăng nhập tiếp theo.` };
}

async function adminToggleAccountActive(identifier, active) {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  const clean = String(identifier).trim().toLowerCase();
  let account;
  if (isMongoDBConnected) {
    account = mongoose.isValidObjectId(clean)
      ? await Account.findById(clean)
      : await Account.findOne({ $or: [{ username: clean }, { traineeId: clean }] });
  } else {
    account = inMemoryAccounts.get(clean) || [...inMemoryAccounts.values()].find(a => a.username === clean || a.traineeId === clean);
  }
  if (!account) throw new Error('Không tìm thấy tài khoản.');
  if (account.isOwner) throw new Error('Không thể khóa tài khoản Quản trị gốc.');
  account.active = Boolean(active);
  account.sessionVersion = (account.sessionVersion || 0) + 1;
  if (isMongoDBConnected) await account.save();
  return { success: true, active: account.active, message: account.active ? `Đã mở khóa tài khoản "${account.username}".` : `Đã khóa tài khoản "${account.username}".` };
}

async function getTraineeProfile(identifier) {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  if (!isMongoDBConnected) await connectDB();
  ensureTraineeAccountsInMemory();

  const clean = String(identifier).trim();
  let trainee = isMongoDBConnected
    ? await Trainee.findOne({ $or: [{ traineeId: clean }, { traineeId: clean.toLowerCase() }] }).lean()
    : inMemoryTrainees.find(t => t.traineeId.toLowerCase() === clean.toLowerCase() || t.traineeId === clean);

  if (!trainee) {
    let account = isMongoDBConnected
      ? (mongoose.isValidObjectId(clean) ? await Account.findById(clean).lean() : null)
      : inMemoryAccounts.get(clean);
    if (account?.traineeId) {
      trainee = isMongoDBConnected
        ? await Trainee.findOne({ traineeId: account.traineeId }).lean()
        : inMemoryTrainees.find(t => t.traineeId === account.traineeId);
    }
  }

  if (!trainee) throw new Error('Không tìm thấy hồ sơ Trainee.');

  const accountClauses = [
    ...(trainee.accountRef ? [{ _id: trainee.accountRef }] : []),
    ...(trainee._id ? [{ traineeRef: trainee._id }] : []),
    { traineeId: trainee.traineeId },
    { username: trainee.traineeId.toLowerCase() }
  ];
  let account = isMongoDBConnected
    ? await Account.findOne({ $or: accountClauses }).lean()
    : [...inMemoryAccounts.values()].find(a => a.username === trainee.traineeId.toLowerCase());

  return {
    traineeId: trainee.traineeId,
    fullName: trainee.fullName,
    email: trainee.email,
    phone: trainee.phone || '',
    dateOfBirth: trainee.dateOfBirth || '',
    gender: trainee.gender || '',
    address: trainee.address || '',
    facebookUrl: trainee.facebookUrl || '',
    linkedinUrl: trainee.linkedinUrl || '',
    bio: trainee.bio || '',
    avatar: getPublicAvatar(trainee),
    status: trainee.status || 'Đang học',
    batch: trainee.batch || 'Trainee 2026',
    track: trainee.track || 'Khoa KHMT',
    department: trainee.department || 'Khoa Khoa học Máy tính',
    mentor: (trainee.mentor && trainee.mentor.name) ? trainee.mentor : null,
    accumulatedStars: trainee.accumulatedStars || 0,
    attendedSessions: trainee.attendedSessions || 0,
    totalSessions: trainee.totalSessions || 0,
    completedAssignments: trainee.completedAssignments || 0,
    account: {
      username: account?.username || trainee.traineeId.toLowerCase(),
      active: account?.active !== false,
      role: account?.role || 'trainee',
      createdAt: account?.createdAt || trainee.createdAt || new Date(),
      lastLoginAt: account?.lastLoginAt || null,
      lastPasswordChangeAt: account?.lastPasswordChangeAt || null,
      mustChangePassword: Boolean(account?.mustChangePassword)
    },
    notificationPreferences: {
      assignmentNotify: trainee.notificationPreferences?.assignmentNotify !== false,
      scheduleNotify: trainee.notificationPreferences?.scheduleNotify !== false,
      questionNotify: trainee.notificationPreferences?.questionNotify !== false
    }
  };
}

async function updateTraineeProfile(identifier, updateData, isPrivileged = false) {
  if (isProduction && !isMongoDBConnected) throw new Error('Cơ sở dữ liệu chưa sẵn sàng.');
  if (!isMongoDBConnected) await connectDB();
  ensureTraineeAccountsInMemory();

  const clean = String(identifier).trim();
  let trainee = isMongoDBConnected
    ? await Trainee.findOne({ $or: [{ traineeId: clean.toLowerCase() }, { traineeId: clean }] })
    : inMemoryTrainees.find(t => t.traineeId.toLowerCase() === clean.toLowerCase() || t.traineeId === clean);

  if (!trainee) throw new Error('Không tìm thấy hồ sơ Trainee.');

  if (updateData.fullName !== undefined) {
    if (typeof updateData.fullName !== 'string' || !updateData.fullName.trim() || updateData.fullName.length > 150) {
      throw new Error('Họ và tên không hợp lệ (1-150 ký tự).');
    }
    trainee.fullName = updateData.fullName.trim();
  }

  if (updateData.email !== undefined) {
    const email = String(updateData.email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Email không đúng định dạng.');
    }
    trainee.email = email;
  }

  if (updateData.phone !== undefined) {
    const phone = String(updateData.phone).trim();
    if (phone && !/^[0-9+() -]{8,20}$/.test(phone)) {
      throw new Error('Số điện thoại không hợp lệ (8-20 ký tự).');
    }
    trainee.phone = phone;
  }

  if (updateData.dateOfBirth !== undefined) {
    const dateOfBirth = String(updateData.dateOfBirth).trim();
    if (dateOfBirth) {
      const parsed = new Date(`${dateOfBirth}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dateOfBirth || parsed > new Date()) {
        throw new Error('Ngày sinh không hợp lệ.');
      }
    }
    trainee.dateOfBirth = dateOfBirth;
  }

  if (updateData.gender !== undefined) {
    const g = String(updateData.gender).trim();
    if (!['Nam', 'Nữ', 'Khác', ''].includes(g)) throw new Error('Giới tính không hợp lệ.');
    trainee.gender = g;
  }

  if (updateData.address !== undefined) {
    trainee.address = String(updateData.address).trim().slice(0, 300);
  }

  if (updateData.facebookUrl !== undefined) {
    const value = String(updateData.facebookUrl).trim();
    const safeValue = value ? sanitizeUrl(value) : '';
    if (value && (!safeValue || safeValue.length > 300)) throw new Error('Link Facebook không hợp lệ.');
    trainee.facebookUrl = safeValue;
  }

  if (updateData.linkedinUrl !== undefined) {
    const value = String(updateData.linkedinUrl).trim();
    const safeValue = value ? sanitizeUrl(value) : '';
    if (value && (!safeValue || safeValue.length > 300)) throw new Error('Link LinkedIn không hợp lệ.');
    trainee.linkedinUrl = safeValue;
  }

  if (updateData.bio !== undefined) {
    trainee.bio = String(updateData.bio).trim().slice(0, 1500);
  }

  if (updateData.notificationPreferences && typeof updateData.notificationPreferences === 'object') {
    trainee.notificationPreferences = {
      assignmentNotify: updateData.notificationPreferences.assignmentNotify !== false,
      scheduleNotify: updateData.notificationPreferences.scheduleNotify !== false,
      questionNotify: updateData.notificationPreferences.questionNotify !== false
    };
  }

  if (isPrivileged) {
    if (updateData.status && ['Đang học', 'Ngừng học', 'Hoàn thành', 'Active', 'Completed', 'Inactive'].includes(updateData.status)) {
      trainee.status = updateData.status;
    }
    if (updateData.track && typeof updateData.track === 'string') {
      trainee.track = updateData.track.trim().slice(0, 80);
    }
    if (updateData.batch && typeof updateData.batch === 'string') {
      trainee.batch = updateData.batch.trim().slice(0, 80);
    }
    if (updateData.mentor !== undefined) {
      const mentor = updateData.mentor;
      if (!mentor || typeof mentor !== 'object' || !mentor.name || !String(mentor.name).trim()) {
        trainee.mentor = null;
      } else {
        if (typeof mentor.name !== 'string' || mentor.name.trim().length > 150) throw new Error('Thông tin Mentor không hợp lệ.');
        const mentorEmail = String(mentor.email || '').trim().toLowerCase();
        if (mentorEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mentorEmail)) throw new Error('Email Mentor không hợp lệ.');
        trainee.mentor = {
          name: mentor.name.trim(),
          role: String(mentor.role || 'Mentor Trainee Program').trim().slice(0, 120),
          email: mentorEmail,
          phone: String(mentor.phone || '').trim().slice(0, 30),
          avatarInitial: String(mentor.avatarInitial || '').trim().slice(0, 4)
        };
      }
    }
  }

  if (isMongoDBConnected) {
    await trainee.save();
    if (updateData.fullName) {
      await Account.findOneAndUpdate({ username: trainee.traineeId.toLowerCase() }, { fullName: trainee.fullName });
    }
  } else {
    const acc = [...inMemoryAccounts.values()].find(a => a.username === trainee.traineeId.toLowerCase());
    if (acc && updateData.fullName) acc.fullName = trainee.fullName;
  }

  return await getTraineeProfile(trainee.traineeId);
}

async function updateTraineeAvatar(traineeId, avatarBase64) {
  if (!avatarBase64 || typeof avatarBase64 !== 'string') {
    throw new Error('Dữ liệu ảnh không hợp lệ.');
  }

  const matches = avatarBase64.match(/^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!matches) {
    throw new Error('Định dạng ảnh không hợp lệ. Chỉ chấp nhận JPG, PNG hoặc WebP.');
  }

  const ext = matches[2] === 'jpeg' ? 'jpg' : matches[2];
  const buffer = Buffer.from(matches[3], 'base64');

  if (buffer.length > 3 * 1024 * 1024) {
    throw new Error('Kích thước ảnh tối đa là 3MB.');
  }

  const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8;
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
  const isWebp = buffer.slice(8, 12).toString('ascii') === 'WEBP';
  const expectedType = matches[2];
  if ((expectedType === 'jpeg' && !isJpeg) || (expectedType === 'png' && !isPng) || (expectedType === 'webp' && !isWebp)) {
    throw new Error('Tệp tải lên không phải là ảnh hợp lệ.');
  }

  const avatarDir = path.join(__dirname, '../public/uploads/avatars');
  await fs.promises.mkdir(avatarDir, { recursive: true });

  const cleanId = String(traineeId).replace(/[^a-zA-Z0-9_-]/g, '');
  const newFilename = `${cleanId}-${Date.now()}.${ext}`;
  const newFilePath = path.join(avatarDir, newFilename);

  const cleanTraineeId = String(traineeId).trim();
  let trainee = isMongoDBConnected
    ? await Trainee.findOne({ traineeId: cleanTraineeId })
    : inMemoryTrainees.find(t => String(t.traineeId).toLowerCase() === cleanTraineeId.toLowerCase());
  if (!trainee) throw new Error('Không tìm thấy Trainee.');

  const oldAvatarUrl = trainee.avatar;

  await fs.promises.writeFile(newFilePath, buffer, { flag: 'wx' });

  const newAvatarUrl = `/uploads/avatars/${newFilename}`;
  trainee.avatar = newAvatarUrl;
  try {
    if (isMongoDBConnected) await trainee.save();
  } catch (error) {
    trainee.avatar = oldAvatarUrl;
    await fs.promises.unlink(newFilePath).catch(() => {});
    throw error;
  }

  if (oldAvatarUrl && oldAvatarUrl.startsWith('/uploads/avatars/')) {
    const oldFilename = path.basename(oldAvatarUrl);
    const oldFilePath = path.join(avatarDir, oldFilename);
    try {
      if (fs.existsSync(oldFilePath) && oldFilePath !== newFilePath) {
        await fs.promises.unlink(oldFilePath);
      }
    } catch (err) {
      console.warn('[updateTraineeAvatar] Không thể xóa ảnh cũ:', err.message);
    }
  }

  return { success: true, avatarUrl: newAvatarUrl };
}

async function deleteTraineeAvatar(traineeId) {
  const cleanTraineeId = String(traineeId).trim();
  let trainee = isMongoDBConnected
    ? await Trainee.findOne({ traineeId: cleanTraineeId })
    : inMemoryTrainees.find(t => String(t.traineeId).toLowerCase() === cleanTraineeId.toLowerCase());
  if (!trainee) throw new Error('Không tìm thấy Trainee.');

  const oldAvatarUrl = trainee.avatar;
  const avatarDir = path.join(__dirname, '../public/uploads/avatars');
  const defaultAvatar = getDicebearAvatarUrl(cleanTraineeId, trainee.fullName);
  trainee.avatar = defaultAvatar;
  if (isMongoDBConnected) await trainee.save();

  if (oldAvatarUrl && oldAvatarUrl.startsWith('/uploads/avatars/')) {
    const oldFilePath = path.join(avatarDir, path.basename(oldAvatarUrl));
    await fs.promises.unlink(oldFilePath).catch(error => {
      if (error.code !== 'ENOENT') console.warn('[deleteTraineeAvatar] Lỗi xóa file:', error.message);
    });
  }

  return { success: true, avatarUrl: defaultAvatar };
}

async function getTraineeActivityHistory(traineeId) {
  if (!isMongoDBConnected) await connectDB();
  ensureTraineeAccountsInMemory();

  const cleanId = String(traineeId).trim();
  const activities = [];

  try {
    const leaves = isMongoDBConnected
      ? await SupportRequest.find({ type: 'leave', traineeId: cleanId }).sort({ createdAt: -1 }).limit(10).lean()
      : inMemorySupportRequests.filter(s => s.type === 'leave' && s.traineeId === cleanId).slice(0, 10);
    leaves.forEach(l => {
      activities.push({
        type: 'leave',
        id: String(l._id),
        title: `Đơn xin nghỉ: ${l.scheduleTitle || l.scheduleCode || 'Buổi học'}`,
        description: l.message,
        status: l.status,
        statusLabel: ({ pending: 'Chờ xem xét', resolved: 'Đã duyệt', rejected: 'Từ chối' })[l.status] || 'Chờ xem xét',
        timestamp: l.createdAt
      });
    });
  } catch (e) {}

  try {
    const questions = isMongoDBConnected
      ? await Question.find({ $or: [{ mssv: cleanId }, { realMssv: cleanId }] }).sort({ createdAt: -1 }).limit(10).lean()
      : (await getAllQuestions({})).filter(q => q.mssv === cleanId || q.realMssv === cleanId).slice(0, 10);
    questions.forEach(q => {
      activities.push({
        type: 'question',
        id: String(q._id || q.code),
        title: `Hỏi đáp: ${q.title}`,
        description: q.content ? q.content.slice(0, 120) : '',
        status: q.status,
        statusLabel: q.status === 'answered' ? 'Đã giải đáp' : 'Chờ giải đáp',
        timestamp: q.createdAt
      });
    });
  } catch (e) {}

  try {
    const trainee = isMongoDBConnected
      ? await Trainee.findOne({ traineeId: cleanId }).lean()
      : inMemoryTrainees.find(t => t.traineeId === cleanId);
    if (trainee?.sessionStars) {
      trainee.sessionStars.slice(-10).reverse().forEach(s => {
        activities.push({
          type: 'session',
          id: String(s._id || s.sessionCode),
          title: `Học phần: ${s.sessionTitle || s.sessionCode}`,
          description: s.note ? `${s.note} (${s.starsAwarded > 0 ? '+' : ''}${s.starsAwarded} sao)` : '',
          status: s.attendanceStatus,
          statusLabel: attendanceLabel(s.attendanceStatus),
          timestamp: s.updatedAt || s.createdAt || new Date()
        });
      });
    }
  } catch (e) {}

  try {
    const submissions = isMongoDBConnected
      ? await AssignmentSubmission.find({ traineeId: cleanId }).sort({ submittedAt: -1, reviewedAt: -1 }).limit(10).lean()
      : [...inMemoryAssignmentSubmissions.values()].filter(item => item.traineeId === cleanId).slice(-10).reverse();
    const assignments = await getAllAssignments();
    const assignmentMap = new Map(assignments.map(item => [Number(item.assignmentId), item]));
    submissions.forEach(submission => {
      const assignment = assignmentMap.get(Number(submission.assignmentId));
      const labels = { not_submitted: 'Chưa nộp', submitted: 'Đã nộp', needs_revision: 'Cần bổ sung', completed: 'Hoàn thành' };
      activities.push({
        type: 'assignment_submission',
        id: `${submission.assignmentId}-${cleanId}`,
        title: `Bài tập: ${assignment?.title || `#${submission.assignmentId}`}`,
        description: submission.note || (submission.responseId ? `Mã phản hồi: ${submission.responseId}` : 'Đã được Ban Tổ chức ghi nhận.'),
        status: submission.status,
        statusLabel: labels[submission.status] || 'Đã ghi nhận',
        timestamp: submission.submittedAt || submission.reviewedAt || submission.updatedAt
      });
    });
  } catch (e) {}

  try {
    const account = isMongoDBConnected
      ? await Account.findOne({ username: cleanId.toLowerCase() }).lean()
      : [...inMemoryAccounts.values()].find(a => a.username === cleanId.toLowerCase());
    if (account?.loginHistory) {
      account.loginHistory.slice(-5).reverse().forEach((log, idx) => {
        activities.push({
          type: 'login',
          id: `login-${idx}`,
          title: 'Đăng nhập hệ thống',
          description: `Đăng nhập từ IP: ${log.ip || '127.0.0.1'}`,
          status: 'success',
          statusLabel: 'Thành công',
          timestamp: log.timestamp
        });
      });
    }
  } catch (e) {}

  activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return activities.slice(0, 25);
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
  if (['upcoming', 'tentative'].includes(Schedule.getTiming(schedule).status)) throw new Error('Buổi học chưa diễn ra nên chưa thể chấm điểm.');
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
  adminResetPassword,
  adminRequirePasswordChange,
  adminToggleAccountActive,
  getTraineeProfile,
  updateTraineeProfile,
  updateTraineeAvatar,
  deleteTraineeAvatar,
  getTraineeActivityHistory,
  saveAttendanceEntry,
  resolveAccountSession,
  createOwnerAccount,
  getAccounts,
  saveAccount,
  deleteAccount,
  getLeaveRequests,
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
  // Notifications
  getNotifications,
  markNotificationsRead,
  // 11 Assignments
  getAllAssignments,
  createAssignment,
  deleteAssignment,
  updateAssignment,
  batchUpdateAssignments,
  resetAssignments,
  DEFAULT_11_ASSIGNMENTS
};
