const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const Trainee = require('../models/Trainee');
const Schedule = require('../models/Schedule');

function validateDataset(dataset) {
  if (!dataset?.profilesVerified || !Array.isArray(dataset.trainees) || dataset.trainees.length !== 30) throw new Error('Cần đúng 30 hồ sơ Trainee đã đối chiếu nguồn.');
  const ids = new Set();
  for (const trainee of dataset.trainees) {
    if (!/^\d{8}$/.test(trainee.traineeId) || ids.has(trainee.traineeId)) throw new Error('MSSV bị trùng hoặc không hợp lệ.');
    ids.add(trainee.traineeId);
    if (trainee.role !== 'student' || !trainee.fullName?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trainee.email || '')) throw new Error('Hồ sơ thiếu tên, email hoặc role không hợp lệ.');
    const error = new Trainee(trainee).validateSync();
    if (error) throw new Error('Hồ sơ không hợp lệ: ' + error.message);
    if (dataset.attendanceVerified) {
      if (!Array.isArray(trainee.sessionStars) || !trainee.sessionStars.length || trainee.sessionStars.length > 2) throw new Error('Thiếu dữ liệu điểm danh đã đối chiếu.');
      if (trainee.status === 'Đang học' && trainee.sessionStars.length !== 2) throw new Error('Trainee đang học cần đủ hai buổi đã diễn ra.');
      if (new Set(trainee.sessionStars.map(session => session.sessionCode)).size !== trainee.sessionStars.length) throw new Error('Trùng buổi học.');
      for (const session of trainee.sessionStars) {
        if (!['present', 'absent_excused', 'absent_unexcused'].includes(session.attendanceStatus) || !Number.isFinite(session.starsAwarded)) throw new Error('Thiếu trạng thái điểm danh hoặc điểm sao.');
      }
      const count = status => trainee.sessionStars.filter(session => session.attendanceStatus === status).length;
      if (trainee.attendedSessions !== count('present') || trainee.absentExcused !== count('absent_excused') || trainee.absentUnexcused !== count('absent_unexcused') || trainee.totalSessions !== trainee.sessionStars.length) throw new Error('Tổng điểm danh không khớp chi tiết buổi học.');
      const stars = trainee.sessionStars.reduce((sum, session) => sum + session.starsAwarded, 0);
      if (!Number.isFinite(stars) || stars !== trainee.accumulatedStars) throw new Error('Tổng sao không khớp chi tiết buổi học.');
    } else {
      for (const field of ['accumulatedStars', 'attendedSessions', 'totalSessions', 'absentExcused', 'absentUnexcused', 'attendanceRate']) {
        if (trainee[field] !== null) throw new Error('Chưa có nguồn điểm danh thì chỉ số phải để trống.');
      }
      if (trainee.sessionStars?.length) throw new Error('Chưa có nguồn điểm danh thì không được tạo buổi giả.');
    }
  }
  const stopped = dataset.trainees.filter(trainee => trainee.status === 'Ngừng học').map(trainee => trainee.traineeId).sort();
  if (stopped.join(',') !== ['26521358', '26521694', '26521910'].join(',')) throw new Error('Danh sách Ngừng học chưa khớp ba bạn tô đỏ.');
  if (dataset.schedulesVerified) {
    if (!Array.isArray(dataset.schedules) || dataset.schedules.length !== 12 || new Set(dataset.schedules.map(item => item.code)).size !== 12) throw new Error('Cần đủ 12 buổi từ lịch giảng dạy, không gồm Template.');
    for (const item of dataset.schedules) {
      Schedule.validateTiming(item);
      const error = new Schedule(item).validateSync();
      if (error || !item.instructor?.trim() || item.title === 'Template') throw new Error('Bài giảng hoặc Trainer không hợp lệ.');
    }
    for (const trainee of dataset.trainees) {
      for (const session of trainee.sessionStars) {
        const schedule = dataset.schedules.find(item => item.code === session.sessionCode);
        if (!schedule || schedule.date !== session.sessionDate || schedule.instructor !== session.trainerName) throw new Error('Điểm danh chưa khớp buổi học và Trainer.');
      }
    }
  }
  return dataset.trainees;
}

async function seed(args = process.argv.slice(2)) {
  require('dotenv').config({ quiet: true });
  const input = path.resolve(__dirname, '../data/imports/trainees.json');
  const dataset = JSON.parse(fs.readFileSync(input, 'utf8'));
  const trainees = validateDataset(dataset);
  const summary = { trainees: trainees.length, active: trainees.filter(trainee => trainee.status === 'Đang học').length, stopped: 3, attendanceVerified: dataset.attendanceVerified, schedules: dataset.schedulesVerified ? dataset.schedules.length : 0 };
  if (!args.includes('--apply') && !args.includes('--apply-profiles')) {
    console.log(JSON.stringify({ mode: 'validate-only', ...summary }));
    return;
  }
  if (!dataset.attendanceVerified && !args.includes('--apply-profiles')) throw new Error('Chưa đọc được nguồn điểm danh. Dùng --apply-profiles để chỉ cập nhật hồ sơ và để trống điểm danh/sao.');
  if (!process.env.MONGODB_URI?.trim()) {
    console.log(JSON.stringify({ mode: 'local-data-only', ...summary }));
    return;
  }
  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000, maxPoolSize: 2 });
    await Promise.all([Trainee.init(), Schedule.init()]);
    const previous = await Trainee.find({ role: { $ne: 'admin' } }).select('+password').lean();
    const previousSchedules = dataset.schedulesVerified ? await Schedule.find().lean() : null;
    const directory = path.join(__dirname, '../data/imports/backups');
    fs.mkdirSync(directory, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = path.join(directory, 'trainees-' + stamp + '.json');
    fs.writeFileSync(backup, JSON.stringify({ trainees: previous, schedules: previousSchedules }, null, 2), { mode: 0o600 });
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await Trainee.deleteMany({ role: { $ne: 'admin' } }, { session });
        await Trainee.insertMany(trainees, { session, ordered: true });
        if (dataset.schedulesVerified) {
          await Schedule.deleteMany({}, { session });
          await Schedule.insertMany(dataset.schedules, { session, ordered: true });
        }
      });
    } finally {
      await session.endSession();
    }
    console.log(JSON.stringify({ mode: 'mongodb-updated', previousCount: previous.length, backup, datasetHash: crypto.createHash('sha256').update(fs.readFileSync(input)).digest('hex'), ...summary }));
  } finally {
    await mongoose.disconnect();
  }
}

module.exports = { validateDataset, seed };
if (require.main === module) seed().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
