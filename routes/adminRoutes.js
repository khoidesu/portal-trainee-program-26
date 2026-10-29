/**
 * ==============================================================================
 * COMPONENT: Admin Router (Điều Hướng Các Thao Tác Chấm Điểm & Quản Trị Nâng Cao)
 * CHỨC NĂNG CHÍNH: Quản lý tính năng chấm sao theo buổi học, cập nhật điểm danh
 *                  và cấp phát sao hàng loạt cho danh sách sinh viên.
 * LIÊN KẾT & PHỤ THUỘC: utils/security.js, config/db.js
 * NHIỆM VỤ CHI TIẾT:
 *   - POST /award-session-stars: Cấp sao buổi học cho 1 sinh viên (Chỉ Admin)
 *   - POST /batch-update-session-stars: Cập nhật sao hàng loạt theo danh sách buổi học (Chỉ Admin)
 *   - DELETE /session-stars/:traineeId/:sessionNumber: Xóa bản ghi sao của buổi học (Chỉ Admin)
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../utils/security');
const {
  awardSessionStars,
  batchUpdateSessionStars,
  deleteSessionStars
} = require('../config/db');

// Cấp hoặc cập nhật điểm sao cho sinh viên theo từng buổi học cụ thể
router.post('/award-session-stars', requireAdmin, async (req, res) => {
  try {
    const { traineeId, sessionNumber, attendanceStars, quizStars, assignmentStars, bonusStars, sessionTitle, note } = req.body;
    if (!traineeId || sessionNumber === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu mã sinh viên (traineeId) hoặc số thứ tự buổi học (sessionNumber)!'
      });
    }

    const updatedTrainee = await awardSessionStars(traineeId, {
      sessionNumber: Number(sessionNumber),
      attendanceStars: Number(attendanceStars || 0),
      quizStars: Number(quizStars || 0),
      assignmentStars: Number(assignmentStars || 0),
      bonusStars: Number(bonusStars || 0),
      sessionTitle,
      note
    });

    res.json({
      success: true,
      message: `Đã cập nhật sao buổi #${sessionNumber} cho sinh viên ${traineeId}!`,
      data: updatedTrainee
    });
  } catch (err) {
    console.error('Lỗi API /api/admin/award-session-stars:', err.message);
    res.status(400).json({
      success: false,
      message: err.message || 'Lỗi khi cập nhật điểm sao theo buổi học'
    });
  }
});

// Cập nhật điểm sao hàng loạt cho toàn bộ sinh viên trong một buổi học
router.post('/batch-update-session-stars', requireAdmin, async (req, res) => {
  try {
    const { sessionNumber, sessionTitle, sessionDate, records } = req.body;
    if (!sessionNumber || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu số buổi học hoặc danh sách sinh viên rỗng!'
      });
    }

    const results = await batchUpdateSessionStars({
      sessionNumber: Number(sessionNumber),
      sessionTitle,
      sessionDate,
      records
    });

    res.json({
      success: true,
      message: `Đã lưu thành công điểm sao buổi #${sessionNumber} cho ${results.length} sinh viên vào MongoDB Atlas!`,
      data: results
    });
  } catch (err) {
    console.error('Lỗi API /api/admin/batch-update-session-stars:', err.message);
    res.status(400).json({
      success: false,
      message: err.message || 'Lỗi khi cập nhật điểm sao hàng loạt'
    });
  }
});

// Xóa bản ghi điểm sao của một buổi học cụ thể cho sinh viên
router.delete('/session-stars/:traineeId/:sessionNumber', requireAdmin, async (req, res) => {
  try {
    const { traineeId, sessionNumber } = req.params;
    const updated = await deleteSessionStars(traineeId, Number(sessionNumber));
    res.json({
      success: true,
      message: `Đã xóa sao buổi #${sessionNumber} của sinh viên ${traineeId}!`,
      data: updated
    });
  } catch (err) {
    console.error('Lỗi API DELETE session-stars:', err.message);
    res.status(400).json({
      success: false,
      message: err.message || 'Lỗi khi xóa bản ghi sao buổi học'
    });
  }
});

module.exports = router;

