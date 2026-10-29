const fs = require('fs');
const path = require('path');

const rootDir = '/Users/juberry/Documents/Code/portal-tp-26';
const appJsPath = path.join(rootDir, 'public', 'js', 'app.js');
const modulesDir = path.join(rootDir, 'public', 'js', 'modules');

const fullCode = fs.readFileSync(appJsPath, 'utf8');
const lines = fullCode.split('\n');

function sliceLines(start, end) {
  return lines.slice(start - 1, end).join('\n');
}

// 1. CORE MODULE (lines 6-356, 420-546, 1059-1156, 1799-1855)
const coreHeader = `/**
 * ==============================================================================
 * COMPONENT: Core Module (Quản Lý State, DOM Elements & Utilities Toàn Hệ Thống)
 * CHỨC NĂNG CHÍNH: Quản trị biến trạng thái trung tâm, cache DOM, các hàm tiện ích
 *                  mã hóa XSS, avatar Dicebear, theme Sáng/Tối và nạp dữ liệu DB.
 * LIÊN KẾT & PHỤ THUỘC: public/js/api.js, toàn bộ các modules khác.
 * NHIỆM VỤ CHI TIẾT:
 *   - Định nghĩa state trung tâm (window.state)
 *   - Cache toàn bộ phần tử giao diện (window.elements)
 *   - Tiện ích bảo mật: escapeHtml, sanitizeUrl
 *   - Tiện ích hiển thị: getTraineeDicebearAvatar, getAdminAvatar, showToast
 *   - Điều khiển chế độ giao diện: Sáng, Tối, Hệ thống (localStorage)
 *   - Tải dữ liệu API: checkDbStatus, loadTrainees, loadCurrentTrainee, loadAnnouncements
 * ==============================================================================
 */\n\n`;

const coreContent = coreHeader +
sliceLines(6, 356) + '\n\n' +
sliceLines(420, 546) + '\n\n' +
sliceLines(1059, 1156) + '\n\n' +
sliceLines(1799, 1855) + '\n\n' +
`// Expose to global window
window.state = state;
window.elements = elements;
window.getTraineeDicebearAvatar = getTraineeDicebearAvatar;
window.getAdminAvatar = getAdminAvatar;
window.getSavedThemeMode = getSavedThemeMode;
window.setThemeMode = setThemeMode;
window.applyThemeMode = applyThemeMode;
window.initTheme = initTheme;
window.toggleSidebar = toggleSidebar;
window.checkDbStatus = checkDbStatus;
window.loadTrainees = loadTrainees;
window.loadCurrentTrainee = loadCurrentTrainee;
window.loadAnnouncements = loadAnnouncements;
window.getAssignmentClassification = getAssignmentClassification;
window.openMongoModal = openMongoModal;
window.initMongoConfigModal = initMongoConfigModal;
`;

fs.writeFileSync(path.join(modulesDir, 'core.js'), coreContent, 'utf8');
console.log('Saved: core.js');

// 2. AUTH MODULE (lines 2271-2427)
const authHeader = `/**
 * ==============================================================================
 * COMPONENT: Auth Module (Quản Lý Xác Thực & Phân Quyền Người Dùng)
 * CHỨC NĂNG CHÍNH: Xử lý trạng thái đăng nhập, xác thực quyền Admin / Sinh viên,
 *                  đồng bộ token JWT và điều hướng giao diện theo role.
 * LIÊN KẾT & PHỤ THUỘC: public/js/modules/core.js, public/login.html, localStorage
 * NHIỆM VỤ CHI TIẾT:
 *   - initAuth: Đọc token và user từ localStorage, phân quyền hiển thị
 *   - updateAuthUI: Hiển thị / ẩn menu Admin trên sidebar và navbar
 *   - logout: Xóa token JWT, dọn dẹp state và chuyển hướng về trang login
 *   - Chặn truy cập trái phép vào các tab dành riêng cho Quản trị viên
 * ==============================================================================
 */\n\n`;

const authContent = authHeader +
sliceLines(2271, 2427) + '\n\n' +
`// Expose to global window
window.initAuth = initAuth;
window.logout = logout;
window.updateAuthUI = updateAuthUI;
window.checkAdminAuth = checkAdminAuth;
`;

fs.writeFileSync(path.join(modulesDir, 'auth.js'), authContent, 'utf8');
console.log('Saved: auth.js');

// 3. NAVIGATION MODULE (lines 547-1058)
const navHeader = `/**
 * ==============================================================================
 * COMPONENT: Navigation Module (Điều Hướng Tab, Sidebar & Hash Routing)
 * CHỨC NĂNG CHÍNH: Quản lý chuyển đổi giữa các tab giao diện, điều khiển thanh menu
 *                  sidebar trên desktop và mobile, đồng bộ URL hash.
 * LIÊN KẾT & PHỤ THUỘC: public/js/modules/core.js, public/js/modules/auth.js
 * NHIỆM VỤ CHI TIẾT:
 *   - switchTab: Kích hoạt hiển thị tab được chọn, cập nhật breadcrumb & title
 *   - setupEventListeners: Gán sự kiện click cho các nút menu sidebar
 *   - Lắng nghe hashchange (#schedule, #assignments, #leaderboard, etc.)
 *   - toggleSidebar & toggleMobileMenu: Thu gọn / mở rộng sidebar
 * ==============================================================================
 */\n\n`;

const navContent = navHeader +
sliceLines(547, 1058) + '\n\n' +
`// Expose to global window
window.switchTab = switchTab;
window.setupEventListeners = setupEventListeners;
`;

fs.writeFileSync(path.join(modulesDir, 'navigation.js'), navContent, 'utf8');
console.log('Saved: navigation.js');

// 4. DASHBOARD MODULE (lines 1157-1509)
const dashHeader = `/**
 * ==============================================================================
 * COMPONENT: Dashboard View Module (Trang Tổng Quan Thực Tập Sinh)
 * CHỨC NĂNG CHÍNH: Hiển thị thông số tổng hợp KPI, thẻ sinh viên, lịch học hôm nay,
 *                  biểu đồ diễn biến sao tích lũy và bảng tin thông báo.
 * LIÊN KẾT & PHỤ THUỘC: public/js/modules/core.js, public/js/chart.js
 * NHIỆM VỤ CHI TIẾT:
 *   - renderDashboard: Vẽ thẻ profile sinh viên, 4 KPI cards
 *   - renderTodaySchedule: Danh sách buổi học trong ngày kèm nút vào học MS Teams
 *   - renderPendingServices: Danh sách yêu cầu đang xử lý
 *   - renderAnnouncements: Bản tin thông báo học vụ mới nhất
 * ==============================================================================
 */\n\n`;

const dashContent = dashHeader +
sliceLines(1157, 1509) + '\n\n' +
`// Expose to global window
window.renderDashboard = renderDashboard;
`;

fs.writeFileSync(path.join(modulesDir, 'dashboard.js'), dashContent, 'utf8');
console.log('Saved: dashboard.js');

// 5. LEADERBOARD MODULE (lines 1510-1798)
const leaderHeader = `/**
 * ==============================================================================
 * COMPONENT: Leaderboard Module (Bảng Xếp Hạng & Bục Vinh Danh Podium)
 * CHỨC NĂNG CHÍNH: Tính toán xếp hạng, hiển thị bục vinh danh Top 3, bộ lọc tìm kiếm
 *                  theo chuyên ban và modal xem chi tiết hồ sơ sinh viên.
 * LIÊN KẾT & PHỤ THUỘC: public/js/modules/core.js, public/js/api.js
 * NHIỆM VỤ CHI TIẾT:
 *   - renderLeaderboard: Sắp xếp danh sách sinh viên theo sao và phân hạng
 *   - renderPodium: Hiển thị bục vinh danh Top 1, 2, 3 với hiệu ứng nổi bật
 *   - renderRankingTable: Bảng danh sách toàn bộ sinh viên kèm tìm kiếm & lọc Track
 *   - openTraineeDetail: Mở modal xem hồ sơ chi tiết và lịch sử sao của từng SV
 * ==============================================================================
 */\n\n`;

const leaderContent = leaderHeader +
sliceLines(1510, 1798) + '\n\n' +
`// Expose to global window
window.renderLeaderboard = renderLeaderboard;
window.renderPodium = renderPodium;
window.openTraineeDetail = openTraineeDetail;
`;

fs.writeFileSync(path.join(modulesDir, 'leaderboard.js'), leaderContent, 'utf8');
console.log('Saved: leaderboard.js');

// 6. SCHEDULE MODULE (lines 1856-2270)
const schedHeader = `/**
 * ==============================================================================
 * COMPONENT: Schedule Module (Thời Khóa Biểu & Lịch Học Trực Tuyến MS Teams)
 * CHỨC NĂNG CHÍNH: Quản lý xem lịch học theo tháng, chuyển đổi chế độ xem, tải file
 *                  thời khóa biểu và công cụ thêm/sửa/xóa lịch học cho Admin.
 * LIÊN KẾT & PHỤ THUỘC: public/js/modules/core.js, public/js/scheduleData.js
 * NHIỆM VỤ CHI TIẾT:
 *   - initScheduleModule: Khởi động bộ quản lý lịch học ScheduleManager
 *   - Bộ lọc tháng, năm học và chế độ hiển thị (Lịch tháng / Danh sách)
 *   - Tải file Excel thời khóa biểu và đề cương bài học
 *   - Modal thêm / chỉnh sửa thông tin buổi học & link MS Teams (Admin)
 * ==============================================================================
 */\n\n`;

const schedContent = schedHeader +
sliceLines(1856, 2270) + '\n\n' +
`// Expose to global window
window.initScheduleModule = initScheduleModule;
window.openScheduleModal = openScheduleModal;
`;

fs.writeFileSync(path.join(modulesDir, 'schedule.js'), schedContent, 'utf8');
console.log('Saved: schedule.js');

// 7. PROFILE MODULE (lines 2934-3384)
const profileHeader = `/**
 * ==============================================================================
 * COMPONENT: Profile Module (Hồ Sơ Cá Nhân & Quản Lý Tài Khoản)
 * CHỨC NĂNG CHÍNH: Hiển thị thông tin cá nhân, cập nhật họ tên/email, đổi mật khẩu
 *                  tài khoản và gửi yêu cầu cấp lại mật khẩu cho Admin.
 * LIÊN KẾT & PHỤ THUỘC: public/js/modules/core.js, public/js/api.js
 * NHIỆM VỤ CHI TIẾT:
 *   - renderProfileView: Điền dữ liệu người dùng vào form hồ sơ
 *   - Xử lý submit cập nhật thông tin cá nhân
 *   - openChangePasswordModal: Form đổi mật khẩu (bảo mật xác thực mật khẩu cũ)
 *   - openSupportRequestModal: Form gửi yêu cầu hỗ trợ quên mật khẩu
 * ==============================================================================
 */\n\n`;

const profileContent = profileHeader +
sliceLines(2934, 3384) + '\n\n' +
`// Expose to global window
window.renderProfileView = renderProfileView;
window.openChangePasswordModal = openChangePasswordModal;
`;

fs.writeFileSync(path.join(modulesDir, 'profile.js'), profileContent, 'utf8');
console.log('Saved: profile.js');

// 8. GRADES MODULE (lines 3490-4197)
const gradesHeader = `/**
 * ==============================================================================
 * COMPONENT: Grades Module (Bảng Điểm Sao Rèn Luyện Theo Buổi Học)
 * CHỨC NĂNG CHÍNH: Hiển thị chi tiết bảng điểm sao rèn luyện của sinh viên qua từng
 *                  buổi đào tạo (sao tham gia, sao trả lời, sao bài tập, điểm cộng).
 * LIÊN KẾT & PHỤ THUỘC: public/js/modules/core.js, public/js/api.js
 * NHIỆM VỤ CHI TIẾT:
 *   - gradesState & initGradesModule: Khởi tạo dữ liệu bảng điểm sao
 *   - renderGradesView: Hiển thị 3 chỉ số KPI tổng sao, số buổi, chuyên cần
 *   - Bộ lọc giai đoạn: Tất cả, Phase 1, Phase 2, Chuyên sâu
 *   - openStarDetailModal: Xem minh chứng đánh giá chi tiết cho từng buổi học
 * ==============================================================================
 */\n\n`;

const gradesContent = gradesHeader +
sliceLines(3490, 4197) + '\n\n' +
`// Expose to global window
window.gradesState = gradesState;
window.initGradesModule = initGradesModule;
window.renderGradesView = renderGradesView;
window.openStarDetailModal = openStarDetailModal;
`;

fs.writeFileSync(path.join(modulesDir, 'grades.js'), gradesContent, 'utf8');
console.log('Saved: grades.js');

// 9. LEAVE MODULE (lines 4970-5291)
const leaveHeader = `/**
 * ==============================================================================
 * COMPONENT: Leave Request Module (Đơn Xin Nghỉ Học Trực Tuyến)
 * CHỨC NĂNG CHÍNH: Cho phép sinh viên đăng ký xin nghỉ học trực tuyến kèm lý do,
 *                  minh chứng và quản lý lịch sử đơn từ.
 * LIÊN KẾT & PHỤ THUỘC: public/js/modules/core.js, localStorage
 * NHIỆM VỤ CHI TIẾT:
 *   - initLeaveModule: Gắn sự kiện submit form xin nghỉ học
 *   - getSavedLeaveHistory & saveLeaveHistory: Lưu trữ lịch sử đơn
 *   - renderLeaveHistoryTable: Hiển thị danh sách các đơn đã nộp kèm trạng thái duyệt
 * ==============================================================================
 */\n\n`;

const leaveContent = leaveHeader +
sliceLines(4970, 5291) + '\n\n' +
`// Expose to global window
window.initLeaveModule = initLeaveModule;
window.getSavedLeaveHistory = getSavedLeaveHistory;
window.saveLeaveHistory = saveLeaveHistory;
`;

fs.writeFileSync(path.join(modulesDir, 'leave.js'), leaveContent, 'utf8');
console.log('Saved: leave.js');

// 10. QA MODULE (lines 5292-5978)
const qaHeader = `/**
 * ==============================================================================
 * COMPONENT: Q&A Module (Diễn Đàn Hỏi Đáp & Giải Đáp Cộng Đồng)
 * CHỨC NĂNG CHÍNH: Nơi sinh viên đặt câu hỏi (hỗ trợ ẩn danh) và nhận câu trả lời
 *                  chính thức từ Giảng viên / Mentor.
 * LIÊN KẾT & PHỤ THUỘC: public/js/modules/core.js, public/js/api.js
 * NHIỆM VỤ CHI TIẾT:
 *   - initQaModule: Nạp danh sách câu hỏi từ API / MongoDB
 *   - Form đặt câu hỏi: Tùy chọn ẩn danh, chọn chủ đề, tiêu đề, nội dung chi tiết
 *   - renderQuestionsTable: Bảng danh sách câu hỏi, lọc theo chủ đề & tìm kiếm
 *   - openQaDetailModal: Modal xem chi tiết câu hỏi & form trả lời cho Giảng viên
 * ==============================================================================
 */\n\n`;

const qaContent = qaHeader +
sliceLines(5292, 5978) + '\n\n' +
`// Expose to global window
window.initQaModule = initQaModule;
window.openQaDetailModal = openQaDetailModal;
`;

fs.writeFileSync(path.join(modulesDir, 'qa.js'), qaContent, 'utf8');
console.log('Saved: qa.js');

// 11. ADMIN MODULE (lines 2428-2933, 3385-3489, 4198-4969)
const adminHeader = `/**
 * ==============================================================================
 * COMPONENT: Admin Module (Trung Tâm Quản Trị Hệ Thống Toàn Diện)
 * CHỨC NĂNG CHÍNH: Quản trị danh sách thực tập sinh (CRUD), cộng sao theo buổi học,
 *                  quản lý 11 bài tập rèn luyện (deadline & link), xử lý hỗ trợ.
 * LIÊN KẾT & PHỤ THUỘC: public/js/modules/core.js, public/js/api.js, public/js/duolingo.js
 * NHIỆM VỤ CHI TIẾT:
 *   - renderAdminView: Vẽ bảng điều khiển tổng quan quản trị
 *   - Quản lý Sinh viên: Modal tạo mới, sửa chỉ số KPI, xóa sinh viên
 *   - setupAdminAwardStarsSection: Giao diện cộng sao hàng loạt theo danh sách buổi học
 *   - Quản lý 11 bài tập: renderAdminAssignmentsTable, sửa deadline countdown, lưu link
 *   - renderAdminSupportRequests: Duyệt và giải quyết yêu cầu quên mật khẩu
 * ==============================================================================
 */\n\n`;

const adminContent = adminHeader +
sliceLines(2428, 2933) + '\n\n' +
sliceLines(3385, 3489) + '\n\n' +
sliceLines(4198, 4969) + '\n\n' +
`// Expose to global window
window.renderAdminView = renderAdminView;
window.renderAdminTraineesTable = renderAdminTraineesTable;
window.openDeleteModal = openDeleteModal;
window.renderAdminSupportRequests = renderAdminSupportRequests;
window.setupAdminAwardStarsSection = setupAdminAwardStarsSection;
window.renderAdminAssignmentsTable = renderAdminAssignmentsTable;
window.openAdminEditAssignmentModal = openAdminEditAssignmentModal;
`;

fs.writeFileSync(path.join(modulesDir, 'admin.js'), adminContent, 'utf8');
console.log('Saved: admin.js');

// 12. MASTER APP.JS (lines 357-416 + orchestrator)
const masterAppHeader = `/**
 * ==============================================================================
 * COMPONENT: Application Master Orchestrator (Điểm Khởi Động Trung Tâm Ứng Dụng)
 * CHỨC NĂNG CHÍNH: Điều phối luồng khởi động, nạp các modules chức năng khi DOM sẵn
 *                  sàng và đồng bộ trạng thái ban đầu của hệ thống.
 * LIÊN KẾT & PHỤ THUỘC: public/js/modules/*.js, public/js/duolingo.js, public/js/scheduleData.js
 * NHIỆM VỤ CHI TIẾT:
 *   - Lắng nghe DOMContentLoaded
 *   - Khởi động Theme, Auth, Navigation
 *   - Nạp dữ liệu ban đầu từ MongoDB Atlas
 *   - Kích hoạt các module: Schedule, Duolingo, Grades, Leave, QA, Admin
 * ==============================================================================
 */\n\n`;

const masterAppContent = masterAppHeader + `
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Khởi tạo xác thực & giao diện
  const isAuthed = initAuth();
  initTheme();
  setupEventListeners();

  // 2. Tải dữ liệu ban đầu từ DB
  await checkDbStatus();
  await loadTrainees();
  await loadCurrentTrainee();
  await loadAnnouncements();

  // 3. Khởi tạo các module nghiệp vụ
  if (window.initScheduleModule) window.initScheduleModule();
  if (window.initDuolingoModule) window.initDuolingoModule();
  if (window.initGradesModule) window.initGradesModule();
  if (window.initLeaveModule) window.initLeaveModule();
  if (window.initQaModule) window.initQaModule();
  if (window.setupAdminAwardStarsSection) window.setupAdminAwardStarsSection();

  // 4. Kích hoạt tab ban đầu theo URL hash hoặc mặc định
  const initialHash = window.location.hash.replace('#', '');
  if (initialHash && ['schedule', 'assignments', 'leaderboard', 'grades', 'leave', 'questions', 'admin'].includes(initialHash)) {
    if (initialHash === 'admin' && !checkAdminAuth()) {
      switchTab('schedule');
    } else {
      switchTab(initialHash);
    }
  } else {
    switchTab('schedule');
  }

  // 5. Lắng nghe thay đổi URL Hash
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '');
    if (hash && hash !== state.activeTab) {
      switchTab(hash);
    }
  });

  console.log('🚀 Trainee Portal 2026 Modular App Initialized Successfully!');
});
`;

fs.writeFileSync(appJsPath, masterAppContent, 'utf8');
console.log('Saved: app.js (Master Orchestrator)');

console.log('All JS modules split successfully!');

