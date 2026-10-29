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
const fs = require('fs');

// Tự động assemble các HTML components vào public/index.html
const assembleHtmlComponents = require('./scripts/assemble-components');
assembleHtmlComponents();

const {
  connectDB,
  getDatabaseStatus,
  getAnnouncements
} = require('./config/db');

const { requireAdmin } = require('./utils/security');

// Nạp các Router Components
const authRoutes = require('./routes/authRoutes');
const traineeRoutes = require('./routes/traineeRoutes');
const scheduleRoutes = require('./routes/scheduleRoutes');
const questionRoutes = require('./routes/questionRoutes');
const assignmentRoutes = require('./routes/assignmentRoutes');
const supportRoutes = require('./routes/supportRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// 1. CẤU HÌNH BẢO MẬT & MIDDLEWARES
// ==========================================

// HTTP Security Headers chống XSS & Clickjacking
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Giới hạn CORS an toàn
const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({
  origin: corsOrigin === '*' ? '*' : corsOrigin.split(','),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Giới hạn kích thước payload (2MB)
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

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

// Kiểm tra trạng thái cơ sở dữ liệu
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    data: getDatabaseStatus()
  });
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
  const clientIp = req.ip || (req.connection && req.connection.remoteAddress) || '';
  const isLocal = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp.includes('127.0.0.1') || clientIp === '::ffff:127.0.0.1';
  if (!isLocal && process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      success: false,
      message: 'Tính năng này bị khóa trên môi trường Production vì lý do an toàn.'
    });
  }

  const { uri } = req.body;
  if (!uri || !uri.startsWith('mongodb')) {
    return res.status(400).json({
      success: false,
      message: 'Chuỗi kết nối không hợp lệ! URI phải bắt đầu bằng mongodb:// hoặc mongodb+srv://'
    });
  }

  try {
    const envPath = path.join(__dirname, '.env');
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
      envContent = envContent.replace(/^MONGODB_URI=.*/m, `MONGODB_URI=${uri}`);
    } else {
      envContent = `MONGODB_URI=${uri}\nPORT=3000\n`;
    }
    fs.writeFileSync(envPath, envContent, 'utf8');
    process.env.MONGODB_URI = uri;

    const connected = await connectDB();
    if (connected) {
      res.json({
        success: true,
        message: 'Đã lưu cấu hình và kết nối thành công tới MongoDB Atlas!'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Đã lưu cấu hình vào .env nhưng không thể kết nối tới cơ sở dữ liệu.'
      });
    }
  } catch (err) {
    console.error('Lỗi cấu hình MongoDB:', err.message);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lưu cấu hình cơ sở dữ liệu'
    });
  }
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

// SPA Fallback: điều hướng request trang về index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
