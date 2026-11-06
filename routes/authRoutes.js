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
  signToken,
  hashPassword,
  verifyPassword,
  createRateLimiter,
  requireAuth,
  requirePermission,
  setSession,
  clearSession
} = require('../utils/security');
const { authenticateUser, getAccounts, saveAccount, deleteAccount, changeAccountPassword, adminResetPassword, adminRequirePasswordChange, adminToggleAccountActive } = require('../config/db');

// Giới hạn 5 lần đăng nhập sai trong 1 phút chống tấn công brute-force
const loginLimiter = createRateLimiter(5, 60000);
// Giới hạn theo tên đăng nhập (chống dò mật khẩu phân tán từ nhiều IP): 10 lần / 15 phút
const accountLoginLimiter = createRateLimiter(10, 900000, req => 'u:' + String(req.body?.username || '').trim().toLowerCase().slice(0, 100));

// Đăng nhập hệ thống (Cấp JWT Token an toàn & Rate Limiting)
router.post('/login', loginLimiter, accountLoginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password || username.length > 100 || password.length > 256) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu!'
      });
    }

    const clientInfo = {
      ip: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1',
      userAgent: req.headers['user-agent'] || ''
    };

    const authResult = await authenticateUser(username, password, clientInfo);
    if (!authResult.success) {
      return res.status(401).json(authResult);
    }

    const sessionPayload = {
      username: authResult.user.username,
      role: authResult.user.role,
      fullName: authResult.user.fullName,
      accountId: authResult.user.id,
      traineeId: authResult.user.traineeId,
      sessionVersion: authResult.user.sessionVersion
    };

    // Phiên chỉ nằm trong cookie HttpOnly; không trả token về JS để tránh bị đánh cắp qua XSS.
    setSession(res, sessionPayload);

    res.json(authResult);
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
  const minLen = 8;
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || newPassword.length < minLen || newPassword.length > 256) {
    return res.status(400).json({ success: false, message: `Mật khẩu mới cần ${minLen}–256 ký tự.` });
  }
  try {
    await changeAccountPassword(req.user, currentPassword, newPassword);
    clearSession(res);
    res.json({ success: true, message: 'Đã đổi mật khẩu. Vui lòng đăng nhập lại.' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/admin/reset-password', requirePermission('accounts:manage'), async (req, res) => {
  const { id, identifier, password } = req.body;
  const target = id || identifier;
  if (!target) return res.status(400).json({ success: false, message: 'Thiếu định danh tài khoản cần đặt lại mật khẩu.' });
  try {
    const result = await adminResetPassword(target, password);
    res.json(result);
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/admin/require-password-change', requirePermission('accounts:manage'), async (req, res) => {
  const target = req.body.id || req.body.identifier;
  if (!target) return res.status(400).json({ success: false, message: 'Thiếu định danh tài khoản.' });
  try {
    res.json(await adminRequirePasswordChange(target));
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put('/admin/toggle-active/:id', requirePermission('accounts:manage'), async (req, res) => {
  const { active } = req.body;
  if (typeof active !== 'boolean') return res.status(400).json({ success: false, message: 'Thiếu hoặc sai trạng thái kích hoạt.' });
  try {
    const result = await adminToggleAccountActive(req.params.id, active);
    res.json(result);
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

router.delete('/accounts/:id', requirePermission('accounts:manage'), async (req, res) => {
  try {
    const result = await deleteAccount(req.params.id, req.user);
    res.json({ success: true, message: result.message });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Lỗi khi xóa tài khoản.' });
  }
});

module.exports = router;

