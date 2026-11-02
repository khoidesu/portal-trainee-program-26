const express = require('express');
const router = express.Router();
const { requireAuth } = require('../utils/security');
const { getNotifications, markNotificationsRead } = require('../config/db');

function requireTrainee(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'trainee' || !req.user.traineeId) {
      return res.status(403).json({ success: false, message: 'Thông báo chỉ dành cho Trainee.' });
    }
    next();
  });
}

router.get('/', requireTrainee, async (req, res) => {
  try {
    res.json({ success: true, data: await getNotifications(req.user.traineeId) });
  } catch (err) {
    console.error('Lỗi API GET /api/notifications:', err.message);
    res.status(500).json({ success: false, message: 'Không tải được thông báo.' });
  }
});

router.put('/read-all', requireTrainee, async (req, res) => {
  try {
    await markNotificationsRead(req.user.traineeId);
    res.json({ success: true, data: await getNotifications(req.user.traineeId) });
  } catch (err) {
    console.error('Lỗi API PUT /api/notifications/read-all:', err.message);
    res.status(500).json({ success: false, message: 'Không cập nhật được thông báo.' });
  }
});

router.put('/:id/read', requireTrainee, async (req, res) => {
  try {
    await markNotificationsRead(req.user.traineeId, req.params.id);
    res.json({ success: true, data: await getNotifications(req.user.traineeId) });
  } catch (err) {
    console.error('Lỗi API PUT /api/notifications/:id/read:', err.message);
    res.status(500).json({ success: false, message: 'Không cập nhật được thông báo.' });
  }
});

module.exports = router;
