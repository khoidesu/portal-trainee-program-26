const mongoose = require('mongoose');

const AnnouncementSchema = new mongoose.Schema({
  title: { type: String, required: true },
  summary: { type: String, default: '' },
  category: { type: String, default: 'Tin tức' },
  date: { type: String, default: '' },
  isNewItem: { type: Boolean, default: false },
  link: { type: String, default: '#' }
}, {
  timestamps: true
});

module.exports = mongoose.model('Announcement', AnnouncementSchema);
