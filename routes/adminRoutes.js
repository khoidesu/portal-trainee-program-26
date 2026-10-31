const express = require('express');
const router = express.Router();
const { requirePermission } = require('../utils/security');
const { awardSessionStars, batchUpdateSessionStars, deleteSessionStar, saveAttendanceEntry } = require('../config/db');

router.use(requirePermission('attendance:manage'));

function validSession(body) {
  return typeof (body.scheduleCode || body.sessionCode) === 'string' &&
    /^[\w.-]{1,80}$/.test(body.scheduleCode || body.sessionCode) &&
    typeof body.sessionDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.sessionDate) &&
    ['sessionTitle', 'scheduleTitle', 'trainerName', 'stage', 'stageName', 'note'].every(key =>
      body[key] === undefined || (typeof body[key] === 'string' && body[key].length <= 1000));
}

router.post('/award-session-stars', async (req, res) => {
  const body = req.body;
  if (!validSession(body) || typeof body.traineeId !== 'string' ||
      !(body.traineeId === 'all' || /^\d{6,12}$/.test(body.traineeId)) ||
      typeof body.starsAwarded !== 'number' || !Number.isFinite(body.starsAwarded) || body.starsAwarded <= 0 || body.starsAwarded > 100) {
    return res.status(400).json({ success: false, message: 'Thông tin cộng sao không hợp lệ.' });
  }
  try {
    const result = await awardSessionStars({ ...body, trainerName: req.user.fullName });
    res.json({ success: true, message: 'Đã cập nhật sao theo buổi học.', data: result });
  } catch {
    res.status(400).json({ success: false, message: 'Không thể cập nhật sao. Kiểm tra sinh viên và buổi học.' });
  }
});

router.post('/batch-update-session-stars', async (req, res) => {
  const body = req.body;
  if (!validSession(body) || !Array.isArray(body.studentRatings) || !body.studentRatings.length ||
      body.studentRatings.some(item => !item || typeof item.traineeId !== 'string' || !/^\d{6,12}$/.test(item.traineeId) ||
        typeof item.starsAwarded !== 'number' || !Number.isFinite(item.starsAwarded) || item.starsAwarded < -20 || item.starsAwarded > 100 ||
        (item.note !== undefined && (typeof item.note !== 'string' || item.note.length > 1000)))) {
    return res.status(400).json({ success: false, message: 'Danh sách điểm sao không hợp lệ.' });
  }
  try {
    const result = await batchUpdateSessionStars({ ...body, trainerName: req.user.fullName });
    res.json({ success: true, message: 'Đã cập nhật bảng sao theo buổi học.', data: result });
  } catch {
    res.status(400).json({ success: false, message: 'Không thể cập nhật bảng sao.' });
  }
});

router.delete('/session-stars/:traineeId/:starLogId', async (req, res) => {
  if (!/^\d{6,12}$/.test(req.params.traineeId) || !/^[\w.-]{1,100}$/.test(req.params.starLogId)) {
    return res.status(400).json({ success: false, message: 'Mã sinh viên hoặc bản ghi sao không hợp lệ.' });
  }
  try {
    const result = await deleteSessionStar(req.params.traineeId, req.params.starLogId);
    res.json({ success: true, message: 'Đã xóa bản ghi sao.', data: result });
  } catch {
    res.status(400).json({ success: false, message: 'Không thể xóa bản ghi sao.' });
  }
});

router.put('/attendance/:traineeId/:sessionCode', async (req, res) => {
  try {
    const data = await saveAttendanceEntry(req.params.traineeId, req.params.sessionCode, req.body, req.user.username);
    res.json({ success: true, data });
  } catch (error) {
    res.status(error.code === 'EDIT_CONFLICT' ? 409 : 400).json({ success: false, message: error.message });
  }
});

module.exports = router;

