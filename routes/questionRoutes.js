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
const { requireAdmin } = require('../utils/security');
const {
  getAllQuestions,
  createQuestion,
  answerQuestion,
  deleteQuestion
} = require('../config/db');

// Lấy danh sách toàn bộ câu hỏi trên diễn đàn
router.get('/', async (req, res) => {
  try {
    const list = await getAllQuestions(req.query);
    res.json({
      success: true,
      count: list.length,
      data: list
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
router.post('/', async (req, res) => {
  try {
    const newQ = await createQuestion(req.body);
    res.status(201).json({
      success: true,
      message: 'Đã gửi câu hỏi lên diễn đàn thành công!',
      data: newQ
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
router.put('/:id/answer', requireAdmin, async (req, res) => {
  try {
    const updated = await answerQuestion(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy câu hỏi để trả lời'
      });
    }
    res.json({
      success: true,
      message: 'Đã gửi phản hồi thành công!',
      data: updated
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
router.delete('/:id', requireAdmin, async (req, res) => {
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

