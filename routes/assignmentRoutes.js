/**
 * ==============================================================================
 * COMPONENT: Assignment Router (Điều Hướng 11 Bài Tập Rèn Luyện & Deadline)
 * CHỨC NĂNG CHÍNH: Quản lý lộ trình 11 bài tập rèn luyện phong cách Duolingo,
 *                  thiết lập thời hạn nộp đếm ngược (Deadline) và cập nhật đường link.
 * LIÊN KẾT & PHỤ THUỘC: utils/security.js, config/db.js
 * NHIỆM VỤ CHI TIẾT:
 *   - GET /: Lấy danh sách 11 bài tập kèm thời hạn nộp (Deadline) và trạng thái
 *   - PUT /:id: Cập nhật thông tin, link và deadline của 1 bài tập (Chỉ Admin)
 *   - POST /batch: Cập nhật hàng loạt bài tập (Chỉ Admin)
 *   - POST /reset: Khôi phục lại 11 bài tập mẫu ban đầu (Chỉ Admin)
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const { requirePermission, hasPermission } = require('../utils/security');
const {
  getAllAssignments,
  createAssignment,
  deleteAssignment,
  getAssignmentSubmissions,
  updateAssignmentSubmission,
  updateAssignment,
  batchUpdateAssignments,
  resetAssignments
} = require('../config/db');


function visibleAssignment(item, req) {
  const isEditor = hasPermission(req.user, 'assignments:manage');
  const fields = ['assignmentId', 'title', 'unit', 'type', 'icon', 'isCurrent', 'deadline', 'offset'];
  const isExpired = Boolean(item.deadline && Number.isFinite(new Date(item.deadline).getTime()) && new Date(item.deadline).getTime() <= Date.now());

  if (item.status !== 'locked' || isEditor) {
    fields.push('desc', 'details');
    // Khóa liên kết form đối với người dùng thông thường khi bài tập đã hết hạn
    if (!isExpired || isEditor) {
      fields.push('link');
    }
  }
  return {
    ...Object.fromEntries(fields.filter(field => item[field] !== undefined).map(field => [field, item[field]])),
    isExpired,
    status: item.status === 'completed' ? 'active' : item.status
  };
}

router.get('/:id/submissions', requirePermission('assignments:manage'), async (req, res) => {
  try {
    res.json({ success: true, data: await getAssignmentSubmissions(req.params.id) });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.put('/:id/submissions/:traineeId', requirePermission('assignments:manage'), async (req, res) => {
  try {
    const data = await updateAssignmentSubmission(req.params.id, req.params.traineeId, req.body, req.user.username || req.user.traineeId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Lấy danh sách toàn bộ 11 bài tập
router.get('/', async (req, res) => {
  try {
    const list = await getAllAssignments();
    res.json({
      success: true,
      count: list.length,
      data: list.map(item => visibleAssignment(item, req))
    });
  } catch (err) {
    console.error('Lỗi API /api/assignments:', err.message);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi tải danh sách bài tập'
    });
  }
});

router.post('/', requirePermission('assignments:manage'), async (req, res) => {
  try {
    const created = await createAssignment(req.body);
    res.status(201).json({ success: true, message: 'Đã thêm bài tập.', data: visibleAssignment(created, req) });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Không thêm được bài tập.' });
  }
});

router.delete('/:id', requirePermission('assignments:manage'), async (req, res) => {
  try {
    if (!await deleteAssignment(req.params.id)) return res.status(404).json({ success: false, message: 'Không tìm thấy bài tập.' });
    res.json({ success: true, message: 'Đã xóa bài tập khỏi lộ trình. Xác nhận bài nộp vẫn được lưu để đối chiếu.' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Không xóa được bài tập.' });
  }
});

// Cập nhật thông tin / đường link / deadline của 1 bài tập (Chỉ Admin)
router.put('/:id', requirePermission('assignments:manage'), async (req, res) => {
  try {
    const updated = await updateAssignment(req.params.id, req.body);
    res.json({
      success: true,
      message: `Đã cập nhật bài tập #${req.params.id} thành công!`,
      data: updated
    });
  } catch (err) {
    console.error('Lỗi API PUT /api/assignments/:id:', err.message);
    res.status(400).json({
      success: false,
      message: err.message || 'Lỗi khi cập nhật bài tập'
    });
  }
});

// Cập nhật hàng loạt nhiều bài tập cùng lúc (Chỉ Admin)
router.post('/batch', requirePermission('assignments:manage'), async (req, res) => {
  try {
    const { assignments } = req.body;
    if (!Array.isArray(assignments)) {
      return res.status(400).json({
        success: false,
        message: 'Dữ liệu bài tập không hợp lệ (phải là mảng)!'
      });
    }

    const updatedList = await batchUpdateAssignments(assignments);
    res.json({
      success: true,
      message: `Đã cập nhật thành công ${updatedList.length} bài tập!`,
      data: updatedList
    });
  } catch (err) {
    console.error('Lỗi API POST /api/assignments/batch:', err.message);
    res.status(400).json({
      success: false,
      message: err.message || 'Lỗi khi cập nhật hàng loạt bài tập'
    });
  }
});

// Reset toàn bộ danh sách 11 bài tập về mặc định (Chỉ Admin)
router.post('/reset', requirePermission('assignments:manage'), async (req, res) => {
  try {
    const list = await resetAssignments();
    res.json({
      success: true,
      message: 'Đã đặt lại toàn bộ 11 bài tập về mặc định ban đầu!',
      data: list
    });
  } catch (err) {
    console.error('Lỗi API POST /api/assignments/reset:', err.message);
    res.status(500).json({
      success: false,
      message: err.message || 'Lỗi khi đặt lại danh sách bài tập'
    });
  }
});

module.exports = router;

