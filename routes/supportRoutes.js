/**
 * ==============================================================================
 * COMPONENT: Support Router (Điều Hướng Yêu Cầu Hỗ Trợ & Quên Mật Khẩu)
 * CHỨC NĂNG CHÍNH: Tiếp nhận yêu cầu trợ giúp từ sinh viên và cung cấp giao diện
 *                  xử lý, cấp lại mật khẩu cho Quản trị viên.
 * LIÊN KẾT & PHỤ THUỘC: utils/security.js, config/db.js
 * NHIỆM VỤ CHI TIẾT:
 *   - GET /: Lấy danh sách yêu cầu hỗ trợ (Chỉ Admin)
 *   - POST /: Gửi yêu cầu hỗ trợ / quên mật khẩu từ học viên
 *   - PUT /:id: Xử lý và cấp lại mật khẩu an toàn (Chỉ Admin)
 *   - DELETE /:id: Xóa yêu cầu hỗ trợ (Chỉ Admin)
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../utils/security');
const {
  getAllSupportRequests,
  createSupportRequest,
  resolveSupportRequest
} = require('../config/db');
const SupportRequest = require('../models/SupportRequest');

// Lấy danh sách toàn bộ yêu cầu hỗ trợ (Chỉ Admin)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const list = await getAllSupportRequests(req.query);
    res.json({
      success: true,
      count: list.length,
      data: list
    });
  } catch (err) {
    console.error('Lỗi API /api/requests:', err.message);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi tải danh sách yêu cầu hỗ trợ'
    });
  }
});

// Gửi một yêu cầu hỗ trợ / quên mật khẩu mới
router.post('/', async (req, res) => {
  try {
    const newReq = await createSupportRequest(req.body);
    res.status(201).json({
      success: true,
      message: 'Đã gửi yêu cầu hỗ trợ thành công! Ban Quản trị sẽ xử lý trong thời gian sớm nhất.',
      data: newReq
    });
  } catch (err) {
    console.error('Lỗi API POST /api/requests:', err.message);
    res.status(400).json({
      success: false,
      message: err.message || 'Lỗi khi tạo yêu cầu hỗ trợ'
    });
  }
});

// Xử lý và cấp lại mật khẩu cho sinh viên (Chỉ Admin)
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const updated = await resolveSupportRequest(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy yêu cầu để xử lý'
      });
    }
    res.json({
      success: true,
      message: 'Đã xử lý yêu cầu hỗ trợ và cập nhật mật khẩu mới thành công!',
      data: updated
    });
  } catch (err) {
    console.error('Lỗi API PUT /api/requests/:id:', err.message);
    res.status(400).json({
      success: false,
      message: err.message || 'Lỗi khi xử lý yêu cầu'
    });
  }
});

// Xóa yêu cầu hỗ trợ (Chỉ Admin)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const deleted = await SupportRequest.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy yêu cầu để xóa'
      });
    }
    res.json({
      success: true,
      message: 'Đã xóa yêu cầu hỗ trợ thành công!'
    });
  } catch (err) {
    console.error('Lỗi API DELETE /api/requests/:id:', err.message);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi xóa yêu cầu hỗ trợ'
    });
  }
});

module.exports = router;

