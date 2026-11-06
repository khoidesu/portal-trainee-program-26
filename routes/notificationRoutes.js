const express = require('express');
const router = express.Router();
const { requireAuth } = require('../utils/security');
const { getNotifications, markNotificationsRead } = require('../config/db');

function requireNotificationUser(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role === 'trainee' && req.user.traineeId) req.notificationRecipient = req.user.traineeId;
    else if (req.user.role === 'admin') req.notificationRecipient = `account:${req.user.id}`;
    else return res.status(403).json({ success: false, message: 'Tài khoản không có hộp thông báo.' });
    next();
  });
}

router.get('/', requireNotificationUser, async (req, res) => {
  try {
    res.json({ success: true, data: await getNotifications(req.notificationRecipient, req.user.role === 'trainee') });
  } catch (err) {
    console.error('Lỗi API GET /api/notifications:', err.message);
    res.status(500).json({ success: false, message: 'Không tải được thông báo.' });
  }
});

router.put('/read-all', requireNotificationUser, async (req, res) => {
  try {
    await markNotificationsRead(req.notificationRecipient);
    res.json({ success: true, data: await getNotifications(req.notificationRecipient, req.user.role === 'trainee') });
  } catch (err) {
    console.error('Lỗi API PUT /api/notifications/read-all:', err.message);
    res.status(500).json({ success: false, message: 'Không cập nhật được thông báo.' });
  }
});

router.put('/:id/read', requireNotificationUser, async (req, res) => {
  try {
    await markNotificationsRead(req.notificationRecipient, req.params.id);
    res.json({ success: true, data: await getNotifications(req.notificationRecipient, req.user.role === 'trainee') });
  } catch (err) {
    console.error('Lỗi API PUT /api/notifications/:id/read:', err.message);
    res.status(500).json({ success: false, message: 'Không cập nhật được thông báo.' });
  }
});

module.exports = router;
