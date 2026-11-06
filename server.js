/**
 * ==============================================================================
 * COMPONENT: Server Master Entry Point (Máy Chủ Trung Tâm Express & API Gateway)
 * CHỨC NĂNG CHÍNH: Khởi động Express Server, kết nối MongoDB Atlas, nạp các tầng
 *                  bảo mật HTTP, lắp ráp các routers và phục vụ giao diện SPA.
 * LIÊN KẾT & PHỤ THUỘC: routes/*.js, config/db.js, scripts/assemble-components.js
 * NHIỆM VỤ CHI TIẾT:
 *   - Nạp biến môi trường từ .env
 *   - Lắp ráp tự động các components HTML trước khi khởi động
 *   - Áp dụng các tầng bảo vệ HTTP (CORS whitelist, Security Headers, JSON body limit)
 *   - Mount các REST API Routers: Auth, Trainees, Schedules, Questions, Assignments, Requests, Admin
 *   - Xử lý API 404 handler và SPA fallback routing
 * ==============================================================================
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Tự động assemble các HTML components vào public/index.html
const assembleHtmlComponents = require('./scripts/assemble-components');
if (!process.env.VERCEL) assembleHtmlComponents();

const {
  connectDB,
  getAnnouncements
} = require('./config/db');

const { requireAdmin, optionalAuth, enforcePasswordChange, validateInput, isProduction } = require('./utils/security');

// Nạp các Router Components
const authRoutes = require('./routes/authRoutes');
const traineeRoutes = require('./routes/traineeRoutes');
const scheduleRoutes = require('./routes/scheduleRoutes');
const questionRoutes = require('./routes/questionRoutes');
const assignmentRoutes = require('./routes/assignmentRoutes');
const supportRoutes = require('./routes/supportRoutes');
const adminRoutes = require('./routes/adminRoutes');
const profileRoutes = require('./routes/profileRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const uiRoutes = require('./routes/uiRoutes');

const app = express();
const PORT = process.env.PORT || 3000;
app.disable('x-powered-by');
if (process.env.VERCEL) app.set('trust proxy', 1);
else if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.set('query parser', 'simple');
const allowedOrigins = (process.env.APP_ORIGIN || '').split(',').map(value => value.trim()).filter(Boolean);
if (isProduction && (!process.env.MONGODB_URI || !allowedOrigins.length || allowedOrigins.some(value => { try { return new URL(value).origin !== value || !value.startsWith('https://'); } catch { return true; } }))) {
  throw new Error('Production cần MONGODB_URI và APP_ORIGIN là địa chỉ HTTPS chính thức.');
}

// ==========================================
// 1. CẤU HÌNH BẢO MẬT & MIDDLEWARES
// ==========================================

// HTTP Security Headers chống XSS & Clickjacking
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: https://api.dicebear.com; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com");
  if (isProduction) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  next();
});

// Giới hạn CORS an toàn
app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || allowedOrigins.includes(origin));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Giới hạn kích thước payload (6MB hỗ trợ upload avatar)
app.use(express.json({ limit: '6mb' }));
app.use(express.urlencoded({ extended: true, limit: '6mb' }));
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.headers.origin;
    const localOrigin = !isProduction && origin === `${req.protocol}://${req.get('host')}`;
    if ((origin && !allowedOrigins.includes(origin) && !localOrigin) || req.headers['sec-fetch-site'] === 'cross-site') {
      return res.status(403).json({ success: false, message: 'Nguồn gửi yêu cầu không được phép.' });
    }
    if (isProduction && !origin) return res.status(403).json({ success: false, message: 'Yêu cầu cần có Origin hợp lệ.' });
    const contentType = req.get('content-type') || '';
    const nativeLogin = req.method === 'POST' && req.path === '/auth/login' && /^application\/x-www-form-urlencoded(?:;|$)/i.test(contentType);
    if (!nativeLogin && !/^application\/json(?:;|$)/i.test(contentType)) return res.status(415).json({ success: false, message: 'Chỉ nhận dữ liệu JSON.' });
  }
  next();
}, validateInput, optionalAuth, enforcePasswordChange);
app.use('/api', async (req, res, next) => {
  if (isProduction && !await connectDB()) {
    return res.status(503).json({ success: false, message: 'Cơ sở dữ liệu tạm thời không khả dụng. Vui lòng thử lại sau.' });
  }
  next();
});

app.use((req, res, next) => {
  const requestPath = req.path.toLowerCase();
  if (/^\/\.env(?:$|[./_-])/.test(requestPath) || /^\/\.git(?:$|\/)/.test(requestPath) ||
      /\.(?:bak|backup|dump|sql|sqlite|db|zip|7z|tar|gz)(?:$|\/)/.test(requestPath)) {
    return res.sendStatus(404);
  }
  next();
});

app.get('/robots.txt', (req, res) => {
  const origin = allowedOrigins[0] || `${req.protocol}://${req.get('host')}`;
  res.type('text/plain').send(`User-agent: *\nDisallow: /api/\nDisallow: /login\nSitemap: ${origin}/sitemap.xml\n`);
});

app.get(['/security.txt', '/.well-known/security.txt'], (req, res) => {
  const origin = allowedOrigins[0] || `${req.protocol}://${req.get('host')}`;
  const expires = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
  res.type('text/plain').send(`Contact: https://github.com/khoidesu/portal-trainee-program-26/security/advisories/new\nExpires: ${expires}\nPreferred-Languages: vi, en\nCanonical: ${origin}/.well-known/security.txt\n`);
});

app.get('/sitemap.xml', (req, res) => {
  const origin = allowedOrigins[0] || `${req.protocol}://${req.get('host')}`;
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/</loc></url></urlset>`);
});

// Phục vụ tài nguyên tĩnh từ thư mục public
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 2. MOUNT CÁC ROUTER COMPONENTS
// ==========================================

app.use('/api/auth', authRoutes);
app.use('/api/trainees', traineeRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/requests', supportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/ui', uiRoutes);

// Kiểm tra trạng thái cơ sở dữ liệu
app.get('/api/status', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/public-config', (req, res) => {
  res.json({ success: true, data: { turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || '' } });
});

// Lấy danh sách thông báo & sự kiện
app.get('/api/announcements', async (req, res) => {
  try {
    const list = await getAnnouncements();
    res.json({
      success: true,
      data: list
    });
  } catch (err) {
    console.error('Lỗi API /api/announcements:', err.message);
    res.status(500).json({
      success: false,
      message: 'Không thể lấy danh sách thông báo'
    });
  }
});

// Cấu hình URI MongoDB (Bảo mật: Chỉ Admin + Localhost)
app.post('/api/config/mongodb', requireAdmin, async (req, res) => {
  res.status(410).json({ success: false, message: 'Hãy cấu hình MONGODB_URI trong biến môi trường của máy chủ rồi khởi động lại.' });
});

// ==========================================
// 3. XỬ LÝ ĐIỀU HƯỚNG & 404
// ==========================================

// API 404 handler: Trả về JSON 404 cho API không tồn tại
app.all('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint ${req.method} ${req.originalUrl} không tồn tại trên hệ thống!`
  });
});

// Điều hướng rõ ràng cho trang đăng nhập
app.get(['/login', '/login.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// SPA Fallback: điều hướng request trang về index.html
app.get('*', (req, res) => {
  if (path.extname(req.path)) return res.sendStatus(404);
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  const status = err.type === 'entity.too.large' ? 413 : err instanceof SyntaxError ? 400 : 500;
  res.status(status).json({ success: false, message: status === 413 ? 'Dữ liệu vượt quá kích thước cho phép.' : status === 400 ? 'JSON không hợp lệ.' : 'Không thể xử lý yêu cầu.' });
});

// Khởi động server
async function startServer() {
  await connectDB();
  
  app.listen(PORT, () => {
    console.log('====================================================');
    console.log(`🚀 CỔNG THÔNG TIN TRAINEE PROGRAM SẴN SÀNG!`);
    console.log(`🌐 Truy cập trang web tại: http://localhost:${PORT}`);
    console.log('🛡️ Hệ thống bảo mật JWT + Scrypt + Anti-XSS Đã Kích Hoạt!');
    console.log('====================================================');
  });
}

if (require.main === module) {
  startServer();
}

module.exports = app;
