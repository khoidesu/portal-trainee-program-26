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
  // 1. Kích hoạt tab đích NGAY LẬP TỨC (đồng bộ) để chống giật trang / không bị chớp Thời khóa biểu 1s
  const validTabs = ['schedule', 'assignments', 'leaderboard', 'grades', 'leave', 'questions', 'profile', 'admin'];
  const initialHash = window.location.hash.replace('#', '');
  const savedTab = (() => {
    try { return sessionStorage.getItem('uit_portal_active_tab'); } catch (e) { return null; }
  })();

  let activeInitialTab = 'schedule';
  if (initialHash && validTabs.includes(initialHash)) {
    activeInitialTab = initialHash;
  } else if (savedTab && validTabs.includes(savedTab)) {
    activeInitialTab = savedTab;
  }

  // Khởi tạo theme & sự kiện điều hướng trước
  initTheme();
  if (window.initSidebarCollapse) window.initSidebarCollapse();
  setupEventListeners();

  // Khởi tạo schedule module sớm (trước switchTab) để ScheduleManager sẵn sàng render
  if (window.initScheduleModule) window.initScheduleModule();

  // Đối với các tab công khai, chuyển ngay lập tức để không bị giật trang 1s.
  // Riêng các tab yêu cầu quyền ('admin', 'profile', 'assignments'), cần xác thực phiên đăng nhập trước để tránh reload / redirect loop.
  if (activeInitialTab !== 'admin' && activeInitialTab !== 'profile' && activeInitialTab !== 'assignments') {
    switchTab(activeInitialTab);
  }

  // 2. Khởi tạo xác thực & nạp session từ backend
  const isAuthed = await initAuth();
  if (window.setupAuthSessionSync) window.setupAuthSessionSync();
  if (activeInitialTab === 'admin') {
    if (checkAdminAuth()) {
      switchTab('admin');
    } else {
      switchTab('schedule');
    }
  } else if (activeInitialTab === 'profile') {
    if (state.currentUser?.role === 'trainee') {
      switchTab('profile');
    } else {
      switchTab('schedule');
    }
  } else if (activeInitialTab === 'assignments') {
    if (state.currentUser) {
      switchTab('assignments');
    } else {
      switchTab('schedule');
    }
  } else if (state.activeTab === 'admin' && !checkAdminAuth()) {
    switchTab('schedule');
  }

  // 3. Tải dữ liệu ban đầu từ DB (MongoDB Atlas)
  await checkDbStatus();
  await loadTrainees();
  await loadCurrentTrainee();
  await loadAnnouncements();

  // Sau khi data load xong, re-render schedule nếu đang ở tab schedule
  if (state.activeTab === 'schedule' && window.renderScheduleView) {
    await window.renderScheduleView();
  }

  // 4. Khởi tạo các module nghiệp vụ (bỏ initScheduleModule vì đã gọi sớm hơn)
  if (window.initDuolingoModule) window.initDuolingoModule();
  if (window.initGradesModule) window.initGradesModule();
  if (window.initLeaveModule) window.initLeaveModule();
  if (window.initQaModule) window.initQaModule();
  if (window.setupAdminAwardStarsSection) window.setupAdminAwardStarsSection();

  // 5. Lắng nghe thay đổi URL Hash
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '');
    if (hash && hash !== state.activeTab) {
      switchTab(hash);
    }
  });

  console.log(' Trainee Portal 2026 Modular App Initialized Successfully!');
});
