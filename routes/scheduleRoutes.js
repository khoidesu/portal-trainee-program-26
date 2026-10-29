/**
 * ==============================================================================
 * COMPONENT: Schedule Router (Điều Hướng Lịch Học Trực Tuyến & MS Teams)
 * CHỨC NĂNG CHÍNH: Quản lý thời khóa biểu, các buổi học trực tuyến qua Microsoft
 *                  Teams, hỗ trợ lọc ngày tháng và các thao tác quản trị lịch.
 * LIÊN KẾT & PHỤ THUỘC: utils/security.js, config/db.js
 * NHIỆM VỤ CHI TIẾT:
 *   - GET /: Lấy danh sách toàn bộ lịch học (hỗ trợ lọc tháng & năm)
 *   - POST /: Thêm buổi học mới và link MS Teams (Chỉ Admin)
 *   - PUT /:id: Cập nhật thông tin buổi học (Chỉ Admin)
 *   - DELETE /:id: Xóa buổi học (Chỉ Admin)
 *   - POST /reset: Khôi phục lại lịch đào tạo mẫu mặc định (Chỉ Admin)
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../utils/security');
const {
  getAllSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  resetSchedules
} = require('../config/db');

// Lấy toàn bộ lịch học / thời khóa biểu
router.get('/', async (req, res) => {
  try {
    const schedules = await getAllSchedules(req.query);
    res.json({
      success: true,
      count: schedules.length,
      data: schedules
    });
  } catch (err) {
    console.error('Lỗi API /api/schedules:', err.message);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi tải dữ liệu thời khóa biểu'
    });
  }
});

// Thêm một buổi học mới vào thời khóa biểu (Chỉ Admin)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const newSchedule = await createSchedule(req.body);
    res.status(201).json({
      success: true,
      message: 'Đã thêm buổi học thành công!',
      data: newSchedule
    });
  } catch (err) {
    console.error('Lỗi API POST /api/schedules:', err.message);
    res.status(400).json({
      success: false,
      message: err.message || 'Lỗi khi thêm buổi học'
    });
  }
});

// Cập nhật thông tin buổi học (Chỉ Admin)
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const updated = await updateSchedule(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy buổi học để cập nhật'
      });
    }
    res.json({
      success: true,
      message: 'Đã cập nhật buổi học thành công!',
      data: updated
    });
  } catch (err) {
    console.error('Lỗi API PUT /api/schedules/:id:', err.message);
    res.status(400).json({
      success: false,
      message: err.message || 'Lỗi khi cập nhật buổi học'
    });
  }
});

// Xóa buổi học (Chỉ Admin)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const deleted = await deleteSchedule(req.params.id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy buổi học để xóa'
      });
    }
    res.json({
      success: true,
      message: 'Đã xóa buổi học khỏi lịch thành công!'
    });
  } catch (err) {
    console.error('Lỗi API DELETE /api/schedules/:id:', err.message);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi xóa buổi học'
    });
  }
});

// Reset toàn bộ lịch về mặc định ban đầu (Chỉ Admin)
router.post('/reset', requireAdmin, async (req, res) => {
  try {
    const result = await resetSchedules(req.body && req.body.reseed !== false);
    res.json({
      success: true,
      message: 'Đã khôi phục lại lịch mẫu mặc định thành công!',
      data: result
    });
  } catch (err) {
    console.error('Lỗi API POST /api/schedules/reset:', err.message);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi đặt lại thời khóa biểu'
    });
  }
});

module.exports = router;

