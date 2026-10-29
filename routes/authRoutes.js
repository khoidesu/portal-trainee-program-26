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
  createRateLimiter
} = require('../utils/security');
const { authenticateUser } = require('../config/db');

// Giới hạn 5 lần đăng nhập sai trong 1 phút chống tấn công brute-force
const loginLimiter = createRateLimiter(60000, 5, 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau 1 phút!');

// Đăng nhập hệ thống (Cấp JWT Token an toàn & Rate Limiting)
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu!'
      });
    }

    const authResult = await authenticateUser(username, password);
    if (!authResult.success) {
      return res.status(401).json(authResult);
    }

    const token = signToken({
      username: authResult.user.username,
      role: authResult.user.role,
      fullName: authResult.user.fullName
    }, 86400);

    res.json({
      ...authResult,
      token
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
  res.json({
    success: true,
    message: 'Đăng xuất thành công!'
  });
});

// Đổi mật khẩu tài khoản người dùng (Xác thực mật khẩu cũ & Hash scrypt)
router.post('/change-password', async (req, res) => {
  try {
    const { traineeId, currentPassword, newPassword } = req.body;
    if (!traineeId || !currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp mã sinh viên, mật khẩu hiện tại và mật khẩu mới!'
      });
    }

    if (String(newPassword).trim().length < 4) {
      return res.status(400).json({
        success: false,
        message: 'Mật khẩu mới phải có tối thiểu 4 ký tự!'
      });
    }

    const trainee = await Trainee.findOne({ traineeId: String(traineeId).trim() });
    if (!trainee) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy tài khoản người dùng trong cơ sở dữ liệu!'
      });
    }

    const isCurrentValid = verifyPassword(currentPassword, trainee.password);
    if (!isCurrentValid) {
      return res.status(400).json({
        success: false,
        message: 'Mật khẩu hiện tại không chính xác!'
      });
    }

    trainee.password = hashPassword(String(newPassword).trim());
    await trainee.save();

    res.json({
      success: true,
      message: 'Đổi mật khẩu thành công! Mật khẩu mới đã được lưu an toàn vào MongoDB Atlas.'
    });
  } catch (err) {
    console.error('Lỗi API /api/auth/change-password:', err.message);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi cập nhật mật khẩu'
    });
  }
});

module.exports = router;

