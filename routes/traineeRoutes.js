/**
 * ==============================================================================
 * COMPONENT: Trainee Router (Điều Hướng Dữ Liệu Thực Tập Sinh & Xếp Hạng)
 * CHỨC NĂNG CHÍNH: Quản lý thông tin học viên, bảng xếp hạng, tìm kiếm, lọc theo
 *                  chuyên ban và các thao tác CRUD dành riêng cho Quản trị viên.
 * LIÊN KẾT & PHỤ THUỘC: utils/security.js, config/db.js
 * NHIỆM VỤ CHI TIẾT:
 *   - GET /: Lấy danh sách thực tập sinh (hỗ trợ lọc search & track kết hợp)
 *   - GET /:id: Lấy chi tiết học viên (trả về 404 nếu không tìm thấy)
 *   - POST /: Thêm thực tập sinh mới (Chỉ Admin)
 *   - PUT /:id: Cập nhật thông số học viên (Chỉ Admin)
 *   - DELETE /:id: Xóa học viên khỏi hệ thống (Chỉ Admin)
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const { requirePermission, hasPermission, maskSessionStarsForGuest } = require('../utils/security');
const {
  getAllTrainees,
  getTraineeById,
  getSessionStars,
  createTrainee,
  updateTrainee,
  deleteTrainee
} = require('../config/db');

function visibleTrainee(trainee, req) {
  if (hasPermission(req.user, 'trainees:manage')) return trainee;
  const guest = !req.user;
  const fields = ['traineeId', 'fullName', 'avatar', 'batch', 'track', 'department', 'status', 'accumulatedStars',
    'starClassification', 'attendedSessions', 'totalSessions', 'absentExcused', 'absentUnexcused',
    'attendanceRate',
    'currentRank', 'rank', 'totalStudentsInRank', 'rankClassification', 'sessionStars', 'starHistory', 'skills', 'bio'];
  const visible = Object.fromEntries(fields.filter(field => trainee[field] !== undefined).map(field => [field, trainee[field]]));
  if (guest && visible.sessionStars) visible.sessionStars = maskSessionStarsForGuest(visible.sessionStars);
  return visible;
}

// Lấy danh sách chi tiết sao từng buổi học của sinh viên
router.get('/:id/session-stars', async (req, res) => {
  try {
    const data = await getSessionStars(req.params.id);
    data.trainee = visibleTrainee(data.trainee, req);
    if (!req.user) data.sessionStars = maskSessionStarsForGuest(data.sessionStars);
    res.json({
      success: true,
      data
    });
  } catch (err) {
    console.error('Lỗi API /api/trainees/:id/session-stars:', err.message);
    res.status(404).json({
      success: false,
      message: err.message || 'Không tìm thấy dữ liệu sao của sinh viên này'
    });
  }
});

// Lấy danh sách tất cả thực tập sinh
router.get('/', async (req, res) => {
  try {
    const trainees = await getAllTrainees(req.query);
    res.json({
      success: true,
      count: trainees.length,
      data: trainees.map(trainee => visibleTrainee(trainee, req))
    });
  } catch (err) {
    console.error('Lỗi API /api/trainees:', err.message);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi tải danh sách thực tập sinh'
    });
  }
});

// Lấy thông tin 1 thực tập sinh theo MSSV
router.get('/:id', async (req, res) => {
  try {
    const trainee = await getTraineeById(req.params.id);
    if (!trainee) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thực tập sinh với mã này'
      });
    }
    res.json({
      success: true,
      data: visibleTrainee(trainee, req)
    });
  } catch (err) {
    console.error('Lỗi API /api/trainees/:id:', err.message);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi tải thông tin thực tập sinh'
    });
  }
});

// Thêm thực tập sinh mới (Chỉ Admin)
router.post('/', requirePermission('trainees:manage'), async (req, res) => {
  try {
    const newTrainee = await createTrainee(req.body);
    res.status(201).json({
      success: true,
      message: 'Tạo tài khoản thực tập sinh thành công!',
      data: newTrainee
    });
  } catch (err) {
    console.error('Lỗi API POST /api/trainees:', err.message);
    res.status(400).json({
      success: false,
      message: err.message || 'Lỗi khi tạo thực tập sinh'
    });
  }
});

// Cập nhật thông tin thực tập sinh (Chỉ Admin)
router.put('/:id', requirePermission('trainees:manage'), async (req, res) => {
  try {
    const updated = await updateTrainee(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thực tập sinh để cập nhật'
      });
    }
    res.json({
      success: true,
      message: 'Cập nhật thông tin thành công!',
      data: updated
    });
  } catch (err) {
    console.error('Lỗi API PUT /api/trainees/:id:', err.message);
    res.status(400).json({
      success: false,
      message: err.message || 'Lỗi khi cập nhật thực tập sinh'
    });
  }
});

// Xóa thực tập sinh (Chỉ Admin)
router.delete('/:id', requirePermission('trainees:manage'), async (req, res) => {
  try {
    const deleted = await deleteTrainee(req.params.id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thực tập sinh để xóa'
      });
    }
    res.json({
      success: true,
      message: `Đã xóa thực tập sinh ${req.params.id} thành công!`
    });
  } catch (err) {
    console.error('Lỗi API DELETE /api/trainees/:id:', err.message);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi xóa thực tập sinh'
    });
  }
});

module.exports = router;

