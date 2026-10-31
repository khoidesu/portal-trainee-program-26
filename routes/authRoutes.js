/**
 * ==============================================================================
 * COMPONENT: Auth Router (Điều Hướng Xác Thực & Bảo Mật Tài Khoản)
 * CHỨC NĂNG CHÍNH: Cung cấp API đăng nhập bảo mật với JWT, giới hạn tốc độ truy cập
 *                  (Rate Limiting), đăng xuất và đổi mật khẩu an toàn với scrypt.
 * LIÊN KẾT & PHỤ THUỘC: utils/security.js, config/db.js, models/Trainee.js
 * NHIỆM VỤ CHI TIẾT:
 *   - POST /login: Kiểm tra danh tính, cấp token JWT có thời hạn 24 giờ
 *   - POST /logout: Xử lý đăng xuất tài khoản
 *   - POST /change-password: Bắt buộc kiểm tra mật khẩu cũ, mã hóa mật khẩu mới
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const Trainee = require('../models/Trainee');
const {
  hashPassword,
  verifyPassword,
  createRateLimiter,
  requireAuth,
  requirePermission,
  setSession,
  clearSession
} = require('../utils/security');
const { authenticateUser, getAccounts, saveAccount, changeAccountPassword } = require('../config/db');

// Giới hạn 5 lần đăng nhập sai trong 1 phút chống tấn công brute-force
const loginLimiter = createRateLimiter(5, 60000);

// Đăng nhập hệ thống (Cấp JWT Token an toàn & Rate Limiting)
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password || username.length > 100 || password.length > 256) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu!'
      });
    }

    const authResult = await authenticateUser(username, password);
    if (!authResult.success) {
      return res.status(401).json(authResult);
    }

    setSession(res, {
      username: authResult.user.username,
      role: authResult.user.role,
      fullName: authResult.user.fullName,
      root: authResult.user.isOwner === true,
      accountId: authResult.user.id,
      sessionVersion: authResult.user.sessionVersion
    });

    res.json({
      ...authResult
    });
  } catch (err) {
    console.error('Lỗi khi xử lý đăng nhập:', err.message);
    res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ khi xử lý đăng nhập'
    });
  }
});

// Đăng xuất hệ thống
router.post('/logout', (req, res) => {
  clearSession(res);
  res.json({
    success: true,
    message: 'Đăng xuất thành công!'
  });
});

router.get('/me', (req, res) => {
  res.json({ success: true, user: req.user || null });
});

// Đổi mật khẩu tài khoản người dùng (Xác thực mật khẩu cũ & Hash scrypt)
router.post('/change-password', requireAuth, loginLimiter, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || newPassword.length < 12 || newPassword.length > 256) return res.status(400).json({ success: false, message: 'Mật khẩu mới cần 12–256 ký tự.' });
  try {
    await changeAccountPassword(req.user, currentPassword, newPassword);
    clearSession(res);
    res.json({ success: true, message: 'Đã đổi mật khẩu. Vui lòng đăng nhập lại.' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/accounts', requirePermission('accounts:manage'), async (req, res) => {
  try { res.json({ success: true, data: await getAccounts() }); }
  catch { res.status(503).json({ success: false, message: 'Không tải được tài khoản.' }); }
});

router.post('/accounts', requirePermission('accounts:manage'), async (req, res) => {
  try { res.status(201).json({ success: true, data: await saveAccount(null, req.body) }); }
  catch (error) { res.status(400).json({ success: false, message: error.code === 11000 ? 'Tên tài khoản đã tồn tại.' : error.message }); }
});

router.put('/accounts/:id', requirePermission('accounts:manage'), async (req, res) => {
  try { res.json({ success: true, data: await saveAccount(req.params.id, req.body) }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

module.exports = router;

