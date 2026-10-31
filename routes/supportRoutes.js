const express = require('express');
const router = express.Router();
const { requirePermission, requireAuth, hasPermission, createRateLimiter, isProduction } = require('../utils/security');
const {
  getSupportRequests, getPublicLeaveRequests, getSupportRequest, createSupportRequest, createLeaveRequest,
  updateLeaveRequest, resolveSupportRequest, deleteSupportRequest
} = require('../config/db');

const publicLimiter = createRateLimiter(5, 60000);

async function verifyLeaveChallenge(req, res, next) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret && !isProduction) return next();
  if (!secret || !process.env.TURNSTILE_SITE_KEY) return res.status(503).json({ success: false, message: 'Chức năng xin nghỉ chưa được cấu hình xác minh chống spam.' });
  const token = req.body.turnstileToken;
  if (typeof token !== 'string' || !token || token.length > 2048) return res.status(400).json({ success: false, message: 'Vui lòng hoàn tất xác minh chống spam.' });
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token }),
      signal: AbortSignal.timeout(8000)
    });
    const result = await response.json();
    const expectedHosts = (process.env.APP_ORIGIN || `${req.protocol}://${req.get('host')}`).split(',').map(value => new URL(value.trim()).hostname);
    if (!response.ok || !result.success || !expectedHosts.includes(result.hostname) || result.action !== 'leave') {
      return res.status(400).json({ success: false, message: 'Xác minh chống spam không hợp lệ hoặc đã hết hạn. Vui lòng thử lại.' });
    }
    next();
  } catch {
    res.status(503).json({ success: false, message: 'Không kết nối được dịch vụ xác minh. Vui lòng thử lại sau.' });
  }
}

router.get('/leave', async (req, res) => {
  try { const list = await getPublicLeaveRequests(); res.json({ success: true, count: list.length, data: list }); }
  catch { res.status(503).json({ success: false, message: 'Không tải được bảng xin nghỉ.' }); }
});

router.get('/', requirePermission('accounts:manage'), async (req, res) => {
  try {
    const list = await getSupportRequests(req.query);
    res.json({ success: true, count: list.length, data: list });
  } catch {
    res.status(500).json({ success: false, message: 'Lỗi khi tải danh sách yêu cầu.' });
  }
});

router.post('/leave', publicLimiter, verifyLeaveChallenge, async (req, res) => {
  try {
    const request = await createLeaveRequest(req.body);

    res.status(201).json({ success: true, data: {
      id: String(request._id), status: request.status, publicVisible: request.publicVisible, submittedAt: request.createdAt
    }, message: request.publicVisible ? 'Đã đăng đơn xin nghỉ lên bảng công khai. Đơn đang chờ xem xét.' : 'Đơn đã được gửi trước đây và được giữ riêng theo lựa chọn khi gửi.' });
  } catch (err) {
    const validationError = /^(Vui lòng|MSSV|Buổi học|Bộ nhớ)/.test(err.message || '');
    res.status(validationError ? 400 : 503).json({ success: false, message: validationError ? err.message : 'Chưa thể hoàn tất việc tiếp nhận đơn. Vui lòng thử lại sau.' });
  }
});

router.post(['/', '/forgot-password'], publicLimiter, async (req, res) => {
  const body = req.body;
  const traineeId = body.traineeId || body.username;
  if (typeof traineeId !== 'string' || traineeId.length > 150 || !traineeId.trim() ||
      ['fullName', 'email', 'phone', 'message'].some(key => body[key] !== undefined && (typeof body[key] !== 'string' || body[key].length > (key === 'message' ? 3000 : 150))) ||
      (body.type && !['forgot_password', 'feedback', 'account_issue', 'other'].includes(body.type))) {
    return res.status(400).json({ success: false, message: 'Thông tin yêu cầu không hợp lệ.' });
  }
  try {
    await createSupportRequest({ ...body, traineeId });
    res.status(201).json({ success: true, message: 'Đã gửi yêu cầu tới Ban Điều phối.' });
  } catch {
    res.status(400).json({ success: false, message: 'Không thể ghi nhận yêu cầu. Vui lòng thử lại.' });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const request = await getSupportRequest(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Không tìm thấy yêu cầu.' });
    let updated;
    if (request.type === 'leave') {
      if (!hasPermission(req.user, 'leave:manage')) return res.status(403).json({ success: false, message: 'Chưa có quyền xử lý đơn xin nghỉ.' });
      if (!['resolved', 'rejected'].includes(req.body.status)) return res.status(400).json({ success: false, message: 'Trạng thái xử lý không hợp lệ.' });
      updated = await updateLeaveRequest(req.params.id, { status: req.body.status, resolvedBy: req.user.username, resolvedAt: new Date() });
    } else if (request.type === 'forgot_password') {
      if (!hasPermission(req.user, 'accounts:manage')) return res.status(403).json({ success: false, message: 'Chưa có quyền quản lý tài khoản.' });
      const password = req.body.newPassword;
      if (typeof password !== 'string' || password.length < 12 || password.length > 256) return res.status(400).json({ success: false, message: 'Mật khẩu mới cần 12–256 ký tự.' });
      updated = await resolveSupportRequest(req.params.id, password, req.user.username);
    } else {
      return res.status(400).json({ success: false, message: 'Loại yêu cầu này không hỗ trợ đặt lại mật khẩu.' });
    }
    res.json({ success: true, data: request.type === 'leave' ? { id: String(updated._id), status: updated.status, resolvedAt: updated.resolvedAt } : updated, message: 'Đã cập nhật yêu cầu. Điểm danh được quản lý tại Bảng điểm.' });
  } catch {
    res.status(500).json({ success: false, message: 'Không thể cập nhật yêu cầu.' });
  }
});

router.delete('/:id', requirePermission('accounts:manage'), async (req, res) => {
  try {
    const request = await getSupportRequest(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Không tìm thấy yêu cầu.' });
    if (request.type === 'leave') return res.status(400).json({ success: false, message: 'Đơn xin nghỉ được giữ lại để đối chiếu. Hãy duyệt hoặc từ chối đơn.' });
    await deleteSupportRequest(req.params.id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, message: 'Không thể xóa yêu cầu.' });
  }
});

module.exports = router;

