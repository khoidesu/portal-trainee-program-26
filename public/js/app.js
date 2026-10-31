/**
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
 */


document.addEventListener('DOMContentLoaded', async () => {
  // 1. Khởi tạo xác thực & giao diện
  const isAuthed = await initAuth();
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

  console.log(' Trainee Portal 2026 Modular App Initialized Successfully!');
});
