/**
 * Script nạp dữ liệu thủ công vào MongoDB
 * Chạy: npm run seed
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Trainee = require('../models/Trainee');
const Announcement = require('../models/Announcement');
const { mockTrainees, mockAnnouncements } = require('../data/mockData');

async function seed() {
  const uri = process.env.MONGODB_URI;
  if (!uri || uri.trim() === '') {
    console.error('❌ Lỗi: Chưa cấu hình MONGODB_URI trong file .env');
    console.log('Vui lòng mở file .env và điền connection string MongoDB của bạn trước khi chạy seed.');
    process.exit(1);
  }

  try {
    console.log('🔄 Đang kết nối tới MongoDB...');
    await mongoose.connect(uri);
    console.log('✅ Đã kết nối MongoDB thành công.');

    console.log('🧹 Đang làm sạch dữ liệu cũ...');
    await Trainee.deleteMany({});
    await Announcement.deleteMany({});

    console.log('🌱 Đang chèn danh sách thực tập sinh & thông báo...');
    await Trainee.insertMany(mockTrainees);
    await Announcement.insertMany(mockAnnouncements);

    console.log(`✨ Thành công! Đã nạp ${mockTrainees.length} thực tập sinh và ${mockAnnouncements.length} thông báo vào MongoDB.`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Lỗi khi nạp dữ liệu vào MongoDB:', err);
    process.exit(1);
  }
}

seed();
