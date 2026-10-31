const fs = require('node:fs');
const path = require('node:path');

const dataFile = path.join(__dirname, 'imports', 'trainees.json');
let mockTrainees = [];
let schedules = [];
if (fs.existsSync(dataFile)) {
  const dataset = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  if (!dataset.profilesVerified || !Array.isArray(dataset.trainees)) throw new Error('Dữ liệu Trainee chưa được đối chiếu.');
  mockTrainees = dataset.trainees;
  schedules = dataset.schedulesVerified && Array.isArray(dataset.schedules) ? dataset.schedules : [];
}

module.exports = { mockTrainees, mockAnnouncements: [], schedules };
