/**
 * ==============================================================================
 * COMPONENT: Profile Router (Quản Lý Hồ Sơ Cá Nhân Trainee & Hoạt Động)
 * CHỨC NĂNG CHÍNH: Cung cấp API xem/sửa hồ sơ cá nhân, upload avatar an toàn,
 *                  xem nhật ký hoạt động gần đây và quản trị hồ sơ Trainee.
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const { requireAuth, hasPermission, createRateLimiter } = require('../utils/security');
const {
  getTraineeProfile,
  updateTraineeProfile,
  updateTraineeAvatar,
  deleteTraineeAvatar,
  getTraineeActivityHistory
} = require('../config/db');

const avatarLimiter = createRateLimiter(10, 60000);

function isTrainee(req) {
  return req.user?.role === 'trainee' && Boolean(req.user.traineeId);
}

function canManageProfiles(req) {
  return hasPermission(req.user, 'trainees:manage');
}

// 1. Lấy thông tin hồ sơ của chính người dùng đang đăng nhập
router.get('/', requireAuth, async (req, res) => {
  if (!isTrainee(req)) return res.status(403).json({ success: false, message: 'Trang Hồ sơ cá nhân chỉ dành cho Trainee.' });
  try {
    const identifier = req.user.traineeId || req.user.username;
    const profile = await getTraineeProfile(identifier);
    res.json({ success: true, data: profile });
  } catch (error) {
    res.status(404).json({ success: false, message: error.message || 'Không tìm thấy hồ sơ cá nhân.' });
  }
});

// 2. Cập nhật thông tin hồ sơ cá nhân của chính mình
router.put('/', requireAuth, async (req, res) => {
  if (!isTrainee(req)) return res.status(403).json({ success: false, message: 'Trang Hồ sơ cá nhân chỉ dành cho Trainee.' });
  try {
    const identifier = req.user.traineeId || req.user.username;
    const updated = await updateTraineeProfile(identifier, req.body, false);
    res.json({ success: true, message: 'Đã Lưu thay đổi hồ sơ thành công!', data: updated });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Lỗi khi cập nhật hồ sơ.' });
  }
});

// 3. Tải lên và thay thế ảnh đại diện (Avatar)
router.post('/avatar', requireAuth, avatarLimiter, async (req, res) => {
  if (!isTrainee(req)) return res.status(403).json({ success: false, message: 'Chỉ Trainee được cập nhật ảnh đại diện của chính mình.' });
  try {
    const identifier = req.user.traineeId || req.user.username;
    const { avatarBase64 } = req.body;
    if (!avatarBase64) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp dữ liệu ảnh đại diện.' });
    }
    const result = await updateTraineeAvatar(identifier, avatarBase64);
    res.json({ success: true, message: 'Cập nhật ảnh đại diện thành công!', avatarUrl: result.avatarUrl });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Lỗi khi tải ảnh đại diện.' });
  }
});

// 4. Xóa ảnh đại diện tùy chỉnh (trở về avatar mặc định)
router.delete('/avatar', requireAuth, async (req, res) => {
  if (!isTrainee(req)) return res.status(403).json({ success: false, message: 'Chỉ Trainee được cập nhật ảnh đại diện của chính mình.' });
  try {
    const identifier = req.user.traineeId || req.user.username;
    const result = await deleteTraineeAvatar(identifier);
    res.json({ success: true, message: 'Đã đặt lại ảnh đại diện về mặc định.', avatarUrl: result.avatarUrl });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Lỗi khi gỡ ảnh đại diện.' });
  }
});

// 5. Lấy lịch sử hoạt động cá nhân gần đây
router.get('/activities', requireAuth, async (req, res) => {
  if (!isTrainee(req)) return res.status(403).json({ success: false, message: 'Chỉ Trainee được xem lịch sử cá nhân của chính mình.' });
  try {
    const identifier = req.user.traineeId || req.user.username;
    const activities = await getTraineeActivityHistory(identifier);
    res.json({ success: true, data: activities });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Lỗi khi lấy lịch sử hoạt động.' });
  }
});

// 6. Admin xem hồ sơ của một Trainee cụ thể
router.get('/:traineeId', requireAuth, async (req, res) => {
  const isPrivileged = canManageProfiles(req);
  if (!isPrivileged && req.user.traineeId !== req.params.traineeId && req.user.username !== req.params.traineeId) {
    return res.status(403).json({ success: false, message: 'Bạn không có quyền truy cập hồ sơ của người khác.' });
  }
  try {
    const profile = await getTraineeProfile(req.params.traineeId);
    res.json({ success: true, data: profile });
  } catch (error) {
    res.status(404).json({ success: false, message: error.message || 'Không tìm thấy hồ sơ Trainee.' });
  }
});

// 7. Admin chỉnh sửa hồ sơ của một Trainee cụ thể
router.put('/:traineeId', requireAuth, async (req, res) => {
  const isPrivileged = canManageProfiles(req);
  if (!isPrivileged && req.user.traineeId !== req.params.traineeId && req.user.username !== req.params.traineeId) {
    return res.status(403).json({ success: false, message: 'Bạn không có quyền chỉnh sửa hồ sơ của người khác.' });
  }
  try {
    const updated = await updateTraineeProfile(req.params.traineeId, req.body, isPrivileged);
    res.json({ success: true, message: 'Đã cập nhật hồ sơ Trainee thành công!', data: updated });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Lỗi khi cập nhật hồ sơ Trainee.' });
  }
});

// 8. Admin xem lịch sử hoạt động của một Trainee cụ thể
router.get('/activities/:traineeId', requireAuth, async (req, res) => {
  const isPrivileged = canManageProfiles(req);
  if (!isPrivileged && req.user.traineeId !== req.params.traineeId && req.user.username !== req.params.traineeId) {
    return res.status(403).json({ success: false, message: 'Bạn không có quyền xem lịch sử hoạt động của người khác.' });
  }
  try {
    const activities = await getTraineeActivityHistory(req.params.traineeId);
    res.json({ success: true, data: activities });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Lỗi khi lấy lịch sử hoạt động.' });
  }
});

router.post('/:traineeId/avatar', requireAuth, avatarLimiter, async (req, res) => {
  if (!canManageProfiles(req)) return res.status(403).json({ success: false, message: 'Bạn không có quyền quản lý ảnh đại diện Trainee.' });
  try {
    const result = await updateTraineeAvatar(req.params.traineeId, req.body.avatarBase64);
    res.json({ success: true, message: 'Cập nhật ảnh đại diện thành công!', avatarUrl: result.avatarUrl });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Lỗi khi tải ảnh đại diện.' });
  }
});

router.delete('/:traineeId/avatar', requireAuth, async (req, res) => {
  if (!canManageProfiles(req)) return res.status(403).json({ success: false, message: 'Bạn không có quyền quản lý ảnh đại diện Trainee.' });
  try {
    const result = await deleteTraineeAvatar(req.params.traineeId);
    res.json({ success: true, message: 'Đã đặt lại ảnh đại diện về mặc định.', avatarUrl: result.avatarUrl });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Lỗi khi gỡ ảnh đại diện.' });
  }
});

module.exports = router;

