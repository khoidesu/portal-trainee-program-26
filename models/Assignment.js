const mongoose = require('mongoose');

const AssignmentSchema = new mongoose.Schema({
  assignmentId: { 
    type: Number, 
    required: true, 
    unique: true 
  }, // ID số nguyên từ 1 đến 11
  title: { 
    type: String, 
    required: true 
  }, // Tên bài tập (VD: Bài 1: Làm quen Git, GitHub & Quy chuẩn Code UIT)
  desc: { 
    type: String, 
    default: '' 
  }, // Mô tả tóm tắt nội dung bài tập
  unit: { 
    type: String, 
    default: 'Unit 10' 
  }, // Học phần (VD: Unit 10)
  type: { 
    type: String, 
    default: 'lesson' 
  }, // lesson / chest
  icon: { 
    type: String, 
    default: 'check' 
  }, // check / star / lock / book
  status: { 
    type: String, 
    default: 'locked',
    enum: ['completed', 'active', 'locked']
  }, // Trạng thái: completed (xong), active (đang học), locked (khóa)
  isCurrent: { 
    type: Boolean, 
    default: false 
  }, // Bài hiện tại đang học
  score: { 
    type: Number, 
    default: 0 
  }, // Điểm bài tập (thang 100)
  xp: { 
    type: Number, 
    default: 50 
  }, // Điểm kinh nghiệm XP
  gems: { 
    type: Number, 
    default: 10 
  }, // Số đá quý Gems nhận được
  link: { 
    type: String, 
    default: '' 
  }, // Đường link bài tập do Admin gán (Google Colab, Form, GitHub, Drive...)
  deadline: { 
    type: Date, 
    default: null 
  }, // Thời hạn nộp bài (do Admin đặt, null = không giới hạn)
  offset: { 
    type: String, 
    default: 'offset-center' 
  } // Vị trí ziczac trên đường đi Duolingo
}, {
  timestamps: true
});

module.exports = mongoose.model('Assignment', AssignmentSchema);
