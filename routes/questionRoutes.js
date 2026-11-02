/**
 * ==============================================================================
 * COMPONENT: Question Router (Điều Hướng Diễn Đàn Hỏi Đáp Q&A)
 * CHỨC NĂNG CHÍNH: Quản lý câu hỏi từ sinh viên (hỗ trợ gửi ẩn danh) và các phản hồi
 *                  chính thức từ Giảng viên / Mentor.
 * LIÊN KẾT & PHỤ THUỘC: utils/security.js, config/db.js
 * NHIỆM VỤ CHI TIẾT:
 *   - GET /: Lấy danh sách câu hỏi cộng đồng (hỗ trợ lọc theo danh mục & tìm kiếm)
 *   - POST /: Gửi câu hỏi mới lên diễn đàn (cho phép ẩn danh)
 *   - PUT /:id/answer: Giảng viên / Mentor trả lời câu hỏi (Chỉ Admin)
 *   - DELETE /:id: Xóa câu hỏi (Chỉ Admin)
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const { requirePermission, canViewMssv, createRateLimiter } = require('../utils/security');
const {
  getAllQuestions,
  createQuestion,
  answerQuestion,
  deleteQuestion
} = require('../config/db');

function publicQuestion(question, allowMssv = false) {
  const { realMssv, likedBy, traineeId, ...visible } = question;
  if (visible.isAnonymous) {
    visible.mssv = 'Ẩn danh';
    visible.fullName = 'Sinh viên ẩn danh';
    if (allowMssv) {
      visible.realMssv = realMssv;
    }
    return visible;
  }
  if (allowMssv) {
    return visible;
  }
  // Trainee / Guest: bảo mật mã số sinh viên, không công khai
  delete visible.mssv;
  delete visible.realMssv;
  return visible;
}

// Lấy danh sách toàn bộ câu hỏi trên diễn đàn
router.get('/', async (req, res) => {
  try {
    const list = await getAllQuestions(req.query);
    const allowMssv = canViewMssv(req.user);
    res.json({
      success: true,
      count: list.length,
      data: list.map(q => publicQuestion(q, allowMssv))
    });
  } catch (err) {
    console.error('Lỗi API /api/questions:', err.message);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi tải danh sách câu hỏi'
    });
  }
});

// Gửi câu hỏi mới lên diễn đàn
router.post('/', createRateLimiter(5, 60000), async (req, res) => {
  if (['title', 'content'].some(key => typeof req.body[key] !== 'string' || req.body[key].length > (key === 'title' ? 200 : 5000)) ||
      ['mssv', 'fullName', 'category'].some(key => req.body[key] !== undefined && (typeof req.body[key] !== 'string' || req.body[key].length > 150))) {
    return res.status(400).json({ success: false, message: 'Thông tin câu hỏi không hợp lệ.' });
  }
  try {
    const newQ = await createQuestion({ ...req.body, traineeId: req.user?.role === 'trainee' ? req.user.traineeId : '' });
    res.status(201).json({
      success: true,
      message: 'Đã gửi câu hỏi lên diễn đàn thành công!',
      data: publicQuestion(newQ)
    });
  } catch (err) {
    console.error('Lỗi API POST /api/questions:', err.message);
    res.status(400).json({
      success: false,
      message: err.message || 'Lỗi khi gửi câu hỏi'
    });
  }
});

// Giảng viên / Mentor trả lời câu hỏi (Chỉ Admin)
router.put('/:id/answer', requirePermission('questions:manage'), async (req, res) => {
  try {
    if (typeof req.body.answer !== 'string' || req.body.answer.length > 5000) return res.status(400).json({ success: false, message: 'Câu trả lời không hợp lệ.' });
    const updated = await answerQuestion(req.params.id, req.body.answer, req.user.fullName || req.user.username);
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy câu hỏi để trả lời'
      });
    }
    res.json({
      success: true,
      message: 'Đã gửi phản hồi thành công!',
      data: publicQuestion(updated)
    });
  } catch (err) {
    console.error('Lỗi API PUT /api/questions/:id/answer:', err.message);
    res.status(400).json({
      success: false,
      message: err.message || 'Lỗi khi phản hồi câu hỏi'
    });
  }
});

// Xóa câu hỏi (Chỉ Admin)
router.delete('/:id', requirePermission('questions:manage'), async (req, res) => {
  try {
    const deleted = await deleteQuestion(req.params.id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy câu hỏi để xóa'
      });
    }
    res.json({
      success: true,
      message: 'Đã xóa câu hỏi khỏi diễn đàn thành công!'
    });
  } catch (err) {
    console.error('Lỗi API DELETE /api/questions/:id:', err.message);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi xóa câu hỏi'
    });
  }
});

module.exports = router;

