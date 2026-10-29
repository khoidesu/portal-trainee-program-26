const fs = require('fs');
const path = require('path');

const rootDir = '/Users/juberry/Documents/Code/portal-tp-26';
const indexHtmlPath = path.join(rootDir, 'public', 'index.html');
const componentsDir = path.join(rootDir, 'public', 'components');

if (!fs.existsSync(componentsDir)) {
  fs.mkdirSync(componentsDir, { recursive: true });
}

const fullHtml = fs.readFileSync(indexHtmlPath, 'utf8');
const lines = fullHtml.split('\n');

// Definition of component ranges (1-based line numbers)
const componentDefs = [
  {
    file: 'sidebar.html',
    start: 50,
    end: 197,
    name: 'SIDEBAR NAVIGATION (Menu Điều Hướng Bên Trái)',
    func: 'Thanh menu bên trái hiển thị logo, các mục điều hướng chức năng cho học viên và ban quản trị.',
    links: 'public/js/modules/navigation.js, public/css/style.css',
    tasks: [
      'Hiển thị thương hiệu và logo UIT Portal',
      'Menu học vụ: Thời khóa biểu, Điểm danh & Điểm rèn luyện (Sao), Bài tập rèn luyện (Duolingo), Bảng xếp hạng',
      'Menu tiện ích: Xin nghỉ học, Hỏi đáp Q&A',
      'Menu Admin: Quản trị hệ thống (chỉ hiển thị khi tài khoản có quyền admin)',
      'Nút thu gọn/mở rộng sidebar trên desktop và di động'
    ]
  },
  {
    file: 'navbar.html',
    start: 201,
    end: 330,
    name: 'TOP NAVBAR (Thanh Điều Hướng Phía Trên)',
    func: 'Header trên cùng hiển thị tiêu đề trang, breadcrumb, bộ chọn giao diện (Sáng/Tối/Hệ thống) và trạng thái người dùng.',
    links: 'public/js/modules/core.js, public/js/modules/auth.js, public/css/style.css',
    tasks: [
      'Nút toggle mở sidebar trên thiết bị di động',
      'Breadcrumb và tiêu đề trang thay đổi động theo tab',
      'Dropdown chuyển đổi chế độ giao diện: Sáng, Tối, Hệ thống',
      'Badge trạng thái tài khoản: Guest, Sinh viên hoặc Quản trị viên (Admin)',
      'Nút Đăng xuất và nút mở modal đổi mật khẩu / cấu hình MongoDB'
    ]
  },
  {
    file: 'view-dashboard.html',
    start: 334,
    end: 672,
    name: 'TAB VIEW: DASHBOARD (Trang Tổng Quan Sinh Viên)',
    func: 'Màn hình tổng quan thông số KPI, lịch học hôm nay, việc cần làm và tin tức mới.',
    links: 'public/js/modules/dashboard.js, public/js/chart.js, public/css/style.css',
    tasks: [
      'Student Profile Card: Banner thông tin cá nhân của thực tập sinh',
      '4 KPI Metrics: Sao tích lũy, Số buổi học, Điểm bài tập, Thứ hạng xếp loại',
      'Thời khóa biểu hôm nay và link tham gia buổi học MS Teams nhanh',
      'Danh sách dịch vụ đang xử lý (yêu cầu hỗ trợ, đơn xin nghỉ)',
      'Biểu đồ diễn biến sao qua các buổi và bảng tin thông báo mới nhất'
    ]
  },
  {
    file: 'view-profile.html',
    start: 673,
    end: 887,
    name: 'TAB VIEW: USER PROFILE (Hồ Sơ Cá Nhân & Cài Đặt)',
    func: 'Xem và cập nhật thông tin cá nhân, avatar, đổi mật khẩu và gửi yêu cầu hỗ trợ.',
    links: 'public/js/modules/profile.js, public/css/style.css',
    tasks: [
      'Card tổng quan đại diện: Avatar Dicebear, họ tên, MSSV, chuyên ban (Track), vai trò',
      'Form cập nhật thông tin cá nhân (Họ tên, Email liên hệ)',
      'Form đổi mật khẩu tài khoản trực tiếp (yêu cầu mật khẩu cũ)',
      'Form quên mật khẩu & gửi yêu cầu cấp lại mật khẩu tới Admin'
    ]
  },
  {
    file: 'view-schedule.html',
    start: 888,
    end: 1031,
    name: 'TAB VIEW: TIMETABLE & MONTHLY SCHEDULE (Thời Khóa Biểu & Lịch Học Trực Tuyến)',
    func: 'Hiển thị lịch học trực tuyến MS Teams dạng tháng và dạng lịch trình chi tiết.',
    links: 'public/js/modules/schedule.js, public/js/scheduleData.js, public/css/style.css',
    tasks: [
      'Thanh công cụ: Bộ lọc tháng/năm học, chuyển đổi chế độ xem (Lịch tháng / Danh sách)',
      'Nút tải file Excel thời khóa biểu và tải đề cương môn học',
      'Nút đồng bộ Google Calendar',
      'Nút Thêm/Chỉnh sửa buổi học (chỉ dành riêng cho Admin)',
      'Khung lịch trực quan chứa link Microsoft Teams vào học trực tiếp'
    ]
  },
  {
    file: 'view-leaderboard.html',
    start: 1032,
    end: 1150,
    name: 'TAB VIEW: LEADERBOARD (Bảng Xếp Hạng Thực Tập Sinh)',
    func: 'Vinh danh Top 3 thực tập sinh xuất sắc và hiển thị bảng xếp hạng toàn bộ sinh viên.',
    links: 'public/js/modules/leaderboard.js, public/css/style.css',
    tasks: [
      'Hero Banner thống kê tổng quan (tổng số thực tập sinh, sao cao nhất, điểm trung bình)',
      'Podium Top 3: Bục vinh danh Vàng - Bạc - Đồng tương tác đẹp mắt',
      'Thanh tìm kiếm theo MSSV/họ tên và bộ lọc chuyên ban (AI, Frontend, Backend, Data, etc.)',
      'Bảng danh sách xếp hạng chi tiết, có nút bấm xem hồ sơ cá nhân từng sinh viên'
    ]
  },
  {
    file: 'view-grades.html',
    start: 1151,
    end: 1344,
    name: 'TAB VIEW: STAR TRANSCRIPT (Bảng Điểm Sao Buổi Học)',
    func: 'Bảng điểm chi tiết sao tích lũy và đánh giá rèn luyện theo từng buổi học.',
    links: 'public/js/modules/grades.js, public/css/style.css',
    tasks: [
      'Hero Card tóm tắt: Tổng sao tích lũy, số buổi đã tham gia, tỷ lệ tham gia',
      'Bộ lọc các giai đoạn (Phase 1, Phase 2, Chuyên sâu)',
      'Bảng chi tiết từng buổi học: Ngày, Chuyên đề, Sao tham gia, Sao trả lời, Sao bài tập, Điểm cộng',
      'Nút xem chi tiết minh chứng đánh giá của từng buổi học'
    ]
  },
  {
    file: 'view-assignments.html',
    start: 1345,
    end: 1625,
    name: 'TAB VIEW: DUOLINGO ASSIGNMENTS (Lộ Trình Bài Tập Rèn Luyện)',
    func: 'Lộ trình 11 bài tập phong cách Duolingo với đồng hồ đếm ngược thời gian còn lại (Deadline).',
    links: 'public/js/duolingo.js, public/css/duolingo.css',
    tasks: [
      'Thanh thông số Gamification: Chuỗi ngày Streak, Tổng XP, Đá quý Gems, Tim Lives',
      'Đường dẫn học tập uốn lượn phong cách Duolingo với 11 bài tập thực hành',
      'Huy hiệu đồng hồ đếm ngược thời gian còn lại (Deadline Countdown) dưới mỗi nút bài tập',
      'Cột phụ bên phải: Mục tiêu hàng ngày (Daily Quests) và bảng xếp hạng rèn luyện mini',
      'Tích hợp mở modal làm bài và nút gán link/thiết lập deadline nhanh cho Admin'
    ]
  },
  {
    file: 'view-leave.html',
    start: 1626,
    end: 1878,
    name: 'TAB VIEW: ONLINE LEAVE REQUEST (Đơn Xin Nghỉ Học Trực Tuyến)',
    func: 'Biểu mẫu nộp đơn xin vắng học trực tuyến kèm minh chứng và theo dõi lịch sử đơn từ.',
    links: 'public/js/modules/leave.js, public/css/style.css',
    tasks: [
      'Banner thông tin quy định xin nghỉ học và chính sách bù buổi học',
      'Form đăng ký nghỉ học: Chọn buổi học, lý do vắng, tải minh chứng đính kèm',
      'Bảng theo dõi lịch sử các đơn đã nộp kèm trạng thái duyệt (Chờ duyệt, Đã duyệt, Từ chối)',
      'Tự động đồng bộ và lưu trữ lịch sử'
    ]
  },
  {
    file: 'view-questions.html',
    start: 1879,
    end: 2167,
    name: 'TAB VIEW: Q&A FORUM (Diễn Đàn Hỏi Đáp & Giải Đáp Cộng Đồng)',
    func: 'Nơi sinh viên đặt câu hỏi (hỗ trợ ẩn danh) và nhận câu trả lời chính thức từ Mentor / Giảng viên.',
    links: 'public/js/modules/qa.js, public/css/style.css',
    tasks: [
      'Banner giới thiệu kênh hỏi đáp học thuật',
      'Form đặt câu hỏi: Tùy chọn ẩn danh, chọn danh mục chủ đề, tiêu đề, nội dung chi tiết',
      'Gợi ý nhanh các mẫu câu hỏi thường gặp',
      'Bảng danh sách câu hỏi cộng đồng kèm bộ lọc chủ đề và ô tìm kiếm',
      'Xem câu trả lời chính thức từ Giảng viên / Mentor'
    ]
  },
  {
    file: 'view-admin.html',
    start: 2168,
    end: 2629,
    name: 'TAB VIEW: ADMIN CONTROL PANEL (Trang Quản Trị Hệ Thống)',
    func: 'Trung tâm điều hành của Admin: quản lý sinh viên, lịch học, chấm sao buổi học, quản lý 11 bài tập & deadline, xử lý yêu cầu hỗ trợ.',
    links: 'public/js/modules/admin.js, public/css/style.css',
    tasks: [
      '4 KPI Cards tổng quan quản trị: Tổng SV, Điểm trung bình, Buổi học, Yêu cầu chờ duyệt',
      'Quản lý thực tập sinh: Thêm mới, chỉnh sửa chỉ số KPI, đặt lại mật khẩu, xóa tài khoản',
      'Quản lý thời khóa biểu: Thêm buổi học, chỉnh sửa link MS Teams, xóa/reset lịch',
      'Quản lý cộng sao theo buổi học: Cấp sao hàng loạt theo danh sách điểm danh từng buổi',
      'Quản lý 11 bài tập Duolingo: Đổi tiêu đề, gán link làm bài, cấu hình hạn chót đếm ngược (Deadline)',
      'Quản lý yêu cầu hỗ trợ: Duyệt và cấp lại mật khẩu cho học viên quên tài khoản'
    ]
  },
  {
    file: 'modals.html',
    start: 2635,
    end: 3516,
    name: 'COMPONENTS: SYSTEM MODALS (Hộp Thoại Tương Tác Toàn Hệ Thống)',
    func: 'Tập hợp toàn bộ các modal popup tương tác phục vụ sinh viên và admin.',
    links: 'public/js/modules/*.js, public/js/duolingo.js, public/css/style.css',
    tasks: [
      'Modal #traineeDetailModal: Xem chi tiết hồ sơ cá nhân và lịch sử học tập của sinh viên',
      'Modal #mongoConfigModal: Xem trạng thái và cấu hình kết nối MongoDB Atlas (Admin)',
      'Modal #scheduleModal: Thêm / sửa thông tin buổi học và gán link MS Teams (Admin)',
      'Modal #createUserModal: Thêm tài khoản thực tập sinh mới vào hệ thống (Admin)',
      'Modal #editUserModal: Chỉnh sửa thông số KPI và sao từng buổi của sinh viên (Admin)',
      'Modal #deleteConfirmModal: Xác nhận xóa tài khoản sinh viên khỏi cơ sở dữ liệu',
      'Modal #changePasswordModal: Đổi mật khẩu tài khoản trực tiếp',
      'Modal #forgotPasswordModal: Gửi yêu cầu hỗ trợ quên mật khẩu',
      'Modal #duoAssignmentModal: Xem chi tiết bài tập Duolingo, đồng hồ đếm ngược và gán deadline',
      'Modal #adminEditAssignmentModal: Form sửa đầy đủ thông tin bài tập (tiêu đề, link, deadline, xp, gems)',
      'Modal #qaDetailModal: Xem chi tiết câu hỏi và form gửi phản hồi chính thức cho Mentor',
      'Modal #awardStarsDetailModal: Xem minh chứng chi tiết điểm sao từng buổi học'
    ]
  }
];

function generateHeader(def) {
  const taskLines = def.tasks.map(t => ` *   - ${t}`).join('\n');
  return `<!-- ==============================================================================
 * COMPONENT: ${def.name}
 * CHỨC NĂNG CHÍNH: ${def.func}
 * LIÊN KẾT & PHỤ THUỘC: ${def.links}
 * NHIỆM VỤ CHI TIẾT:
${taskLines}
 * ============================================================================== -->\n\n`;
}

// 1. Write individual component files
for (const def of componentDefs) {
  const content = lines.slice(def.start - 1, def.end).join('\n');
  const fileContent = generateHeader(def) + content + '\n';
  const targetPath = path.join(componentsDir, def.file);
  fs.writeFileSync(targetPath, fileContent, 'utf8');
  console.log(`Saved component: ${def.file} (${def.end - def.start + 1} lines)`);
}

// 2. Build index.template.html
const headPart = lines.slice(0, 49).join('\n');
const mainWrapperStart = lines.slice(197, 200).join('\n');
const mainBodyStart = lines.slice(330, 333).join('\n');
const mainWrapperEnd = lines.slice(2629, 2634).join('\n');
const footerPart = lines.slice(3516).join('\n');

const templateContent = `${headPart}
    <!-- include: components/sidebar.html -->

${mainWrapperStart}
      <!-- include: components/navbar.html -->

${mainBodyStart}
        <!-- include: components/view-dashboard.html -->
        <!-- include: components/view-profile.html -->
        <!-- include: components/view-schedule.html -->
        <!-- include: components/view-leaderboard.html -->
        <!-- include: components/view-grades.html -->
        <!-- include: components/view-assignments.html -->
        <!-- include: components/view-leave.html -->
        <!-- include: components/view-questions.html -->
        <!-- include: components/view-admin.html -->
${mainWrapperEnd}

  <!-- include: components/modals.html -->

${footerPart}
`;

const templatePath = path.join(rootDir, 'public', 'index.template.html');
fs.writeFileSync(templatePath, templateContent, 'utf8');
console.log('Saved template: public/index.template.html');

console.log('HTML component extraction completed successfully!');

