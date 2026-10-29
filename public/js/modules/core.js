/**
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
 */

// Application State
const state = {
  currentUser: null, // Logged in user: { username, fullName, role, email, avatar, traineeId } (Chỉ admin mới đăng nhập)
  currentTraineeId: '25520918', // Khôi Trương Trần Anh
  activeTab: 'schedule',
  scheduleWeekOffset: 0,
  scheduleViewMode: 'week',
  trainees: [],
  currentTrainee: null,
  announcements: [],
  dbStatus: null,
  searchQuery: '',
  selectedTrack: 'all',
  sortBy: 'stars_desc',
  adminSearchQuery: '',
  adminSelectedTrack: 'all',
  isSidebarCollapsed: false,
  isDarkMode: false,
  themeMode: 'system' // 'light' | 'dark' | 'system'
};

/**
 * Tạo URL avatar Dicebear SVG độc nhất cho từng tài khoản Trainee dựa theo MSSV
 * Style avataaars với bảng màu nền pastel cao cấp
 */
function getTraineeDicebearAvatar(traineeOrId, name = '') {
  let seed = '';
  if (typeof traineeOrId === 'object' && traineeOrId !== null) {
    if (traineeOrId.avatar && (traineeOrId.avatar.startsWith('data:image') || traineeOrId.avatar.includes('dicebear.com'))) {
      return traineeOrId.avatar;
    }
    seed = traineeOrId.traineeId || traineeOrId.username || traineeOrId.email || traineeOrId.fullName || 'student';
  } else {
    seed = String(traineeOrId || 'student').trim();
  }
  return `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(seed)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
}

function getAdminAvatar() {
  return 'https://api.dicebear.com/9.x/bottts/svg?seed=uit-admin&backgroundColor=d1d4f9';
}

// DOM Elements
const elements = {
  // Navigation & Layout
  sidebar: document.getElementById('sidebar'),
  collapseSidebarBtn: document.getElementById('collapseSidebarBtn'),
  mobileMenuBtn: document.getElementById('mobileMenuBtn'),
  navDashboard: document.getElementById('navDashboard'),
  navProfile: document.getElementById('navProfile'),
  navSchedule: document.getElementById('navSchedule'),
  navLeaderboard: document.getElementById('navLeaderboard'),
  navGrades: document.getElementById('navGrades'),
  navAssignments: document.getElementById('navAssignments'),
  navLeave: document.getElementById('navLeave'),
  navQuestions: document.getElementById('navQuestions'),
  navAdmin: document.getElementById('navAdmin'),
  adminNavGroupLabel: document.getElementById('adminNavGroupLabel'),
  adminNavList: document.getElementById('adminNavList'),
  viewDashboard: document.getElementById('viewDashboard'),
  viewProfile: document.getElementById('viewProfile'),
  viewSchedule: document.getElementById('viewSchedule'),
  viewLeaderboard: document.getElementById('viewLeaderboard'),
  viewGrades: document.getElementById('viewGrades'),
  viewAssignments: document.getElementById('viewAssignments'),
  viewLeave: document.getElementById('viewLeave'),
  viewQuestions: document.getElementById('viewQuestions'),
  viewAdmin: document.getElementById('viewAdmin'),
  pageMainTitle: document.getElementById('pageMainTitle'),
  pageSubBreadcrumb: document.getElementById('pageSubBreadcrumb'),
  traineeCountBadge: document.getElementById('traineeCountBadge'),
  
  // Timetable & Monthly Schedule Elements
  scheduleMonthContainer: document.getElementById('scheduleMonthContainer'),
  btnModeAgenda: document.getElementById('btnModeAgenda'),
  btnModeCalendar: document.getElementById('btnModeCalendar'),
  filterScheduleMonth: document.getElementById('filterScheduleMonth'),
  btnDownloadScheduleExcel: document.getElementById('btnDownloadScheduleExcel'),
  btnDownloadSyllabus: document.getElementById('btnDownloadSyllabus'),
  btnGoogleCalendar: document.getElementById('btnGoogleCalendar'),
  btnOpenScheduleEditor: document.getElementById('btnOpenScheduleEditor'),
  scheduleFilterForm: document.getElementById('scheduleFilterForm'),
  
  // Schedule Modal Elements
  scheduleModal: document.getElementById('scheduleModal'),
  closeScheduleModalBtn: document.getElementById('closeScheduleModalBtn'),
  cancelScheduleBtn: document.getElementById('cancelScheduleBtn'),
  scheduleCourseForm: document.getElementById('scheduleCourseForm'),
  btnResetDefaultSchedule: document.getElementById('btnResetDefaultSchedule'),
  btnDeleteCourse: document.getElementById('btnDeleteCourse'),
  courseEditId: document.getElementById('courseEditId'),
  courseTitleInput: document.getElementById('courseTitleInput'),
  courseCodeInput: document.getElementById('courseCodeInput'),
  courseDateInput: document.getElementById('courseDateInput'),
  courseStartTime: document.getElementById('courseStartTime'),
  courseEndTime: document.getElementById('courseEndTime'),
  courseDaySelect: document.getElementById('courseDaySelect'),
  coursePeriods: document.getElementById('coursePeriods'),
  courseStatusSelect: document.getElementById('courseStatusSelect'),
  courseTypeSelect: document.getElementById('courseTypeSelect'),
  courseInstructorInput: document.getElementById('courseInstructorInput'),
  courseTeamsUrl: document.getElementById('courseTeamsUrl'),
  courseNoteInput: document.getElementById('courseNoteInput'),
  scheduleModalTitle: document.getElementById('scheduleModalTitle'),
  
  // Admin Schedule Table Elements
  adminScheduleTableBody: document.getElementById('adminScheduleTableBody'),
  btnAdminAddSchedule: document.getElementById('btnAdminAddSchedule'),
  btnAdminGoSchedule: document.getElementById('btnAdminGoSchedule'),
  btnAdminResetSchedule: document.getElementById('btnAdminResetSchedule'),
  
  // Header controls & Theme dropdown
  traineeSelect: document.getElementById('traineeSelect'),
  themeModeWrapper: document.getElementById('themeModeWrapper'),
  themeToggleBtn: document.getElementById('themeToggleBtn'),
  themeDropdownMenu: document.getElementById('themeDropdownMenu'),
  themeOptionItems: document.querySelectorAll('.theme-option-item'),
  openMongoModalBtn: document.getElementById('openMongoModalBtn'),
  dbStatusButton: document.getElementById('dbStatusButton'),
  dbStatusDot: document.getElementById('dbStatusDot'),
  dbStatusText: document.getElementById('dbStatusText'),
  
  // Header User Account Pill & Dropdown
  openLoginModalBtn: document.getElementById('openLoginModalBtn'),
  headerLogoutBtn: document.getElementById('headerLogoutBtn'),
  sidebarLoginItem: document.getElementById('sidebarLoginItem'),
  sidebarLoginBtn: document.getElementById('sidebarLoginBtn'),
  sidebarLogoutItem: document.getElementById('sidebarLogoutItem'),
  sidebarLogoutBtn: document.getElementById('sidebarLogoutBtn'),
  guestBannerNotice: document.getElementById('guestBannerNotice'),
  guestBannerLoginBtn: document.getElementById('guestBannerLoginBtn'),
  guestBannerAdminBtn: document.getElementById('guestBannerAdminBtn'),
  menuBtnOpenLoginText: document.getElementById('menuBtnOpenLoginText'),
  studentGreetingTag: document.querySelector('#studentProfileCard .greeting-tag'),
  traineeSelectorWrap: document.querySelector('.trainee-selector-dropdown'),
  headerAccountWrapper: document.getElementById('headerAccountWrapper'),
  headerAccountPill: document.getElementById('headerAccountPill'),
  headerAccountAvatar: document.getElementById('headerAccountAvatar'),
  headerAccountInitials: document.getElementById('headerAccountInitials'),
  headerAccountName: document.getElementById('headerAccountName'),
  headerAccountId: document.getElementById('headerAccountId'),
  accountDropdownMenu: document.getElementById('accountDropdownMenu'),
  menuAccountName: document.getElementById('menuAccountName'),
  menuAccountRole: document.getElementById('menuAccountRole'),
  menuBtnGoAdmin: document.getElementById('menuBtnGoAdmin'),
  menuBtnOpenLogin: document.getElementById('menuBtnOpenLogin'),
  menuBtnLogout: document.getElementById('menuBtnLogout'),
  menuBtnGoProfile: document.getElementById('menuBtnGoProfile'),

  // Profile View Elements
  profileAvatarImg: document.getElementById('profileAvatarImg'),
  profileAvatarInitials: document.getElementById('profileAvatarInitials'),
  profileAvatarFileInput: document.getElementById('profileAvatarFileInput'),
  btnUploadProfileAvatar: document.getElementById('btnUploadProfileAvatar'),
  btnRemoveProfileAvatar: document.getElementById('btnRemoveProfileAvatar'),
  profileBadgeId: document.getElementById('profileBadgeId'),
  profileBadgeRole: document.getElementById('profileBadgeRole'),
  profileBadgeBatch: document.getElementById('profileBadgeBatch'),
  profileBadgeTrack: document.getElementById('profileBadgeTrack'),
  profileInfoForm: document.getElementById('profileInfoForm'),
  profileInputFullName: document.getElementById('profileInputFullName'),
  profileInputEmail: document.getElementById('profileInputEmail'),
  profileInputId: document.getElementById('profileInputId'),
  profileInputTrack: document.getElementById('profileInputTrack'),
  btnSaveProfileInfo: document.getElementById('btnSaveProfileInfo'),
  profileSecurityForm: document.getElementById('profileSecurityForm'),
  profileOldPass: document.getElementById('profileOldPass'),
  profileNewPass: document.getElementById('profileNewPass'),
  profileConfirmPass: document.getElementById('profileConfirmPass'),
  btnSaveNewPassword: document.getElementById('btnSaveNewPassword'),
  btnProfileSendForgotReq: document.getElementById('btnProfileSendForgotReq'),
  profileForgotModal: document.getElementById('profileForgotModal'),
  closeProfileForgotModalBtn: document.getElementById('closeProfileForgotModalBtn'),
  cancelProfileForgotBtn: document.getElementById('cancelProfileForgotBtn'),
  profileForgotForm: document.getElementById('profileForgotForm'),
  profileForgotIdentifier: document.getElementById('profileForgotIdentifier'),
  profileForgotEmail: document.getElementById('profileForgotEmail'),
  profileForgotPhone: document.getElementById('profileForgotPhone'),
  profileForgotNote: document.getElementById('profileForgotNote'),

  // Admin Support Requests Elements
  adminSupportTableBody: document.getElementById('adminSupportTableBody'),
  adminSupportPendingBadge: document.getElementById('adminSupportPendingBadge'),
  adminSupportEmptyState: document.getElementById('adminSupportEmptyState'),
  btnAdminRefreshSupport: document.getElementById('btnAdminRefreshSupport'),

  // Dashboard Trainee Card
  studentAvatar: document.getElementById('studentAvatar'),
  studentAvatarFallback: document.getElementById('studentAvatarFallback'),
  studentName: document.getElementById('studentName'),
  studentId: document.getElementById('studentId'),
  studentBatch: document.getElementById('studentBatch'),
  studentTrack: document.getElementById('studentTrack'),
  studentEmail: document.getElementById('studentEmail'),
  studentStatusBadge: document.getElementById('studentStatusBadge'),
  studentCohortBadge: document.getElementById('studentCohortBadge'),
  studentAcademicYear: document.getElementById('studentAcademicYear'),

  // 4 KPI Metrics trang chủ (Dễ dàng link sync với Admin & Database)
  metricStars: document.getElementById('metricStars'),
  metricStarClass: document.getElementById('metricStarClass'),
  metricStarTrendWrap: document.getElementById('metricStarTrendWrap'),
  metricStarTrend: document.getElementById('metricStarTrend'),
  metricStarTrendText: document.getElementById('metricStarTrendText'),

  metricAttendedSessions: document.getElementById('metricAttendedSessions'),
  metricAttendanceRate: document.getElementById('metricAttendanceRate'),
  metricAttendanceDetail: document.getElementById('metricAttendanceDetail'),
  metricAttendanceBar: document.getElementById('metricAttendanceBar'),

  metricAssignmentScore: document.getElementById('metricAssignmentScore'),
  metricAssignmentClass: document.getElementById('metricAssignmentClass'),
  metricAssignmentDetail: document.getElementById('metricAssignmentDetail'),

  metricRank: document.getElementById('metricRank'),
  metricRankClass: document.getElementById('metricRankClass'),
  metricRankNote: document.getElementById('metricRankNote'),

  // Dashboard Subsections
  scheduleListContainer: document.getElementById('scheduleListContainer'),
  scheduleCountBadge: document.getElementById('scheduleCountBadge'),
  pendingRequestsContainer: document.getElementById('pendingRequestsContainer'),
  mentorAvatar: document.getElementById('mentorAvatar'),
  mentorName: document.getElementById('mentorName'),
  mentorEmail: document.getElementById('mentorEmail'),
  mentorPhone: document.getElementById('mentorPhone'),
  newsListContainer: document.getElementById('newsListContainer'),

  // Leaderboard Elements
  leaderboardSummaryStats: document.getElementById('leaderboardSummaryStats'),
  podiumRank1: document.getElementById('podiumRank1'),
  podiumRank2: document.getElementById('podiumRank2'),
  podiumRank3: document.getElementById('podiumRank3'),
  podium1Avatar: document.getElementById('podium1Avatar'),
  podium1Name: document.getElementById('podium1Name'),
  podium1Track: document.getElementById('podium1Track'),
  podium1Score: document.getElementById('podium1Score'),
  podium2Avatar: document.getElementById('podium2Avatar'),
  podium2Name: document.getElementById('podium2Name'),
  podium2Track: document.getElementById('podium2Track'),
  podium2Score: document.getElementById('podium2Score'),
  podium3Avatar: document.getElementById('podium3Avatar'),
  podium3Name: document.getElementById('podium3Name'),
  podium3Track: document.getElementById('podium3Track'),
  podium3Score: document.getElementById('podium3Score'),
  leaderboardSearchInput: document.getElementById('leaderboardSearchInput'),
  leaderboardSortSelect: document.getElementById('leaderboardSortSelect'),
  leaderboardTableBody: document.getElementById('leaderboardTableBody'),
  filterPills: document.querySelectorAll('.filter-pill'),

  // Admin View Elements
  adminDbChipText: document.getElementById('adminDbChipText'),
  btnAdminRefresh: document.getElementById('btnAdminRefresh'),
  btnOpenCreateUserModal: document.getElementById('btnOpenCreateUserModal'),
  adminMetricTotalUsers: document.getElementById('adminMetricTotalUsers'),
  adminMetricTotalStars: document.getElementById('adminMetricTotalStars'),
  adminMetricAvgAttendance: document.getElementById('adminMetricAvgAttendance'),
  adminMetricAvgScore: document.getElementById('adminMetricAvgScore'),
  adminSearchInput: document.getElementById('adminSearchInput'),
  adminTrackFilter: document.getElementById('adminTrackFilter'),
  adminTableCountBadge: document.getElementById('adminTableCountBadge'),
  adminTraineesTableBody: document.getElementById('adminTraineesTableBody'),
  adminEmptyState: document.getElementById('adminEmptyState'),

  // Modals
  mongoConfigModal: document.getElementById('mongoConfigModal'),
  closeMongoModalBtn: document.getElementById('closeMongoModalBtn'),
  cancelMongoBtn: document.getElementById('cancelMongoBtn'),
  mongoConnectForm: document.getElementById('mongoConnectForm'),
  mongoUriInput: document.getElementById('mongoUriInput'),
  modalStatusDot: document.getElementById('modalStatusDot'),
  modalStatusTitle: document.getElementById('modalStatusTitle'),
  modalStatusDesc: document.getElementById('modalStatusDesc'),
  traineeDetailModal: document.getElementById('traineeDetailModal'),
  closeDetailModalBtn: document.getElementById('closeDetailModalBtn'),
  traineeDetailModalBody: document.getElementById('traineeDetailModalBody'),

  // Login Modal
  loginModal: document.getElementById('loginModal'),
  closeLoginModalBtn: document.getElementById('closeLoginModalBtn'),
  cancelLoginBtn: document.getElementById('cancelLoginBtn'),
  loginForm: document.getElementById('loginForm'),
  loginUsernameInput: document.getElementById('loginUsernameInput'),
  loginPasswordInput: document.getElementById('loginPasswordInput'),
  btnSubmitLogin: document.getElementById('btnSubmitLogin'),
  btnQuickAdminLogin: document.getElementById('btnQuickAdminLogin'),
  btnQuickStudentLogin: document.getElementById('btnQuickStudentLogin'),
  loginFeedbackAlert: document.getElementById('loginFeedbackAlert'),

  // Create Trainee Modal
  createTraineeModal: document.getElementById('createTraineeModal'),
  closeCreateTraineeModalBtn: document.getElementById('closeCreateTraineeModalBtn'),
  cancelCreateTraineeBtn: document.getElementById('cancelCreateTraineeBtn'),
  createTraineeForm: document.getElementById('createTraineeForm'),
  createTraineeId: document.getElementById('createTraineeId'),
  createFullName: document.getElementById('createFullName'),
  createEmail: document.getElementById('createEmail'),
  createTrack: document.getElementById('createTrack'),
  createBatch: document.getElementById('createBatch'),
  createStars: document.getElementById('createStars'),
  createAttended: document.getElementById('createAttended'),
  createTotalSessions: document.getElementById('createTotalSessions'),
  createExcused: document.getElementById('createExcused'),
  createUnexcused: document.getElementById('createUnexcused'),
  createAssignmentScore: document.getElementById('createAssignmentScore'),

  // Edit Trainee Modal
  editTraineeModal: document.getElementById('editTraineeModal'),
  closeEditTraineeModalBtn: document.getElementById('closeEditTraineeModalBtn'),
  cancelEditTraineeBtn: document.getElementById('cancelEditTraineeBtn'),
  editTraineeForm: document.getElementById('editTraineeForm'),
  editTraineeIdHidden: document.getElementById('editTraineeIdHidden'),
  editTraineeId: document.getElementById('editTraineeId'),
  editFullName: document.getElementById('editFullName'),
  editEmail: document.getElementById('editEmail'),
  editTrack: document.getElementById('editTrack'),
  editBatch: document.getElementById('editBatch'),
  editStars: document.getElementById('editStars'),
  editAttendedSessions: document.getElementById('editAttendedSessions'),
  editTotalSessions: document.getElementById('editTotalSessions'),
  editAbsentExcused: document.getElementById('editAbsentExcused'),
  editAbsentUnexcused: document.getElementById('editAbsentUnexcused'),
  editAssignmentScore: document.getElementById('editAssignmentScore'),
  editCompletedAssignments: document.getElementById('editCompletedAssignments'),
  btnDeleteFromEditModal: document.getElementById('btnDeleteFromEditModal'),
  editTraineeSessionsContainer: document.getElementById('editTraineeSessionsContainer'),
  btnAddSessionToStudentBtn: document.getElementById('btnAddSessionToStudentBtn'),

  // Student Navigation Sections Wrapper
  studentOnlyNavSections: document.getElementById('studentOnlyNavSections'),

  // Change Password Modal
  menuBtnOpenChangePassword: document.getElementById('menuBtnOpenChangePassword'),
  changePasswordModal: document.getElementById('changePasswordModal'),
  closeChangePasswordModalBtn: document.getElementById('closeChangePasswordModalBtn'),
  cancelChangePasswordBtn: document.getElementById('cancelChangePasswordBtn'),
  changePasswordForm: document.getElementById('changePasswordForm'),
  changePassCurrent: document.getElementById('changePassCurrent'),
  changePassNew: document.getElementById('changePassNew'),
  changePassConfirm: document.getElementById('changePassConfirm'),
  changePassFeedback: document.getElementById('changePassFeedback'),

  // Delete Trainee Confirmation Modal
  deleteTraineeConfirmModal: document.getElementById('deleteTraineeConfirmModal'),
  closeDeleteTraineeModalBtn: document.getElementById('closeDeleteTraineeModalBtn'),
  deleteConfirmMessage: document.getElementById('deleteConfirmMessage'),
  deleteTargetTraineeId: document.getElementById('deleteTargetTraineeId'),
  cancelDeleteTraineeBtn: document.getElementById('cancelDeleteTraineeBtn'),
  confirmDeleteTraineeBtn: document.getElementById('confirmDeleteTraineeBtn')
};


function getSavedThemeMode() {
  return localStorage.getItem('uit_trainee_theme_mode') || 'system';
}

function initTheme() {
  const savedMode = getSavedThemeMode();
  applyThemeMode(savedMode, false);

  // Lắng nghe thay đổi theme từ hệ điều hành máy
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (state.themeMode === 'system') {
        applyThemeMode('system', false);
      }
    });
  }
}

function applyThemeMode(mode, save = true) {
  state.themeMode = mode;
  if (save) {
    localStorage.setItem('uit_trainee_theme_mode', mode);
  }

  let effectiveDark = false;
  if (mode === 'dark') {
    effectiveDark = true;
  } else if (mode === 'light') {
    effectiveDark = false;
  } else {
    // Mode 'system': theo cài đặt máy
    effectiveDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  state.isDarkMode = effectiveDark;
  const themeMeta = document.getElementById('themeColorMeta');

  if (effectiveDark) {
    document.documentElement.classList.add('dark-theme');
    document.documentElement.classList.remove('light-theme');
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.style.backgroundColor = '#0b0f19';
    document.documentElement.style.colorScheme = 'dark';

    document.body.classList.add('dark-theme');
    document.body.classList.remove('light-theme');
    document.body.style.backgroundColor = '#0b0f19';
    document.body.style.colorScheme = 'dark';

    if (themeMeta) themeMeta.content = '#0b0f19';
  } else {
    document.documentElement.classList.remove('dark-theme');
    document.documentElement.classList.add('light-theme');
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.style.backgroundColor = '#f4f6fa';
    document.documentElement.style.colorScheme = 'light';

    document.body.classList.remove('dark-theme');
    document.body.classList.add('light-theme');
    document.body.style.backgroundColor = '#f4f6fa';
    document.body.style.colorScheme = 'light';

    if (themeMeta) themeMeta.content = '#f4f6fa';
  }

  // Cập nhật icon trên nút theme
  updateThemeButtonIcon(mode);

  // Cập nhật trạng thái active & checkmark trong popup menu
  updateThemeDropdownUI(mode);

  // Re-render chart để vẽ lại theo màu nền
  if (state.currentTrainee) {
    if (window.renderStarChart) {
      window.renderStarChart(state.currentTrainee.starHistory, state.currentTrainee.accumulatedStars);
    } else if (window.renderGpaChart) {
      window.renderGpaChart(state.currentTrainee.starHistory, state.currentTrainee.accumulatedStars);
    }
  }
}

function updateThemeButtonIcon(mode) {
  if (!elements.themeToggleBtn) return;
  const iconSystem = elements.themeToggleBtn.querySelector('.icon-system');
  const iconSun = elements.themeToggleBtn.querySelector('.icon-sun');
  const iconMoon = elements.themeToggleBtn.querySelector('.icon-moon');

  if (iconSystem) iconSystem.style.display = mode === 'system' ? 'block' : 'none';
  if (iconSun) iconSun.style.display = mode === 'light' ? 'block' : 'none';
  if (iconMoon) iconMoon.style.display = mode === 'dark' ? 'block' : 'none';
}

function updateThemeDropdownUI(mode) {
  if (!elements.themeOptionItems) return;
  elements.themeOptionItems.forEach((btn) => {
    const itemMode = btn.getAttribute('data-mode');
    if (itemMode === mode) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

function toggleThemeDropdown(show) {
  if (!elements.themeDropdownMenu) return;
  const isShowing = elements.themeDropdownMenu.classList.contains('show');
  const willShow = (typeof show === 'boolean') ? show : !isShowing;

  if (willShow) {
    elements.themeDropdownMenu.classList.add('show');
    if (elements.themeToggleBtn) {
      elements.themeToggleBtn.setAttribute('aria-expanded', 'true');
    }
  } else {
    elements.themeDropdownMenu.classList.remove('show');
    if (elements.themeToggleBtn) {
      elements.themeToggleBtn.setAttribute('aria-expanded', 'false');
    }
  }
}

function toggleSidebar() {
  state.isSidebarCollapsed = !state.isSidebarCollapsed;
  elements.sidebar.classList.toggle('collapsed', state.isSidebarCollapsed);
}


// ==========================================
// DATA LOADING
// ==========================================

// 1. Kiểm tra trạng thái DB (MongoDB Atlas vs Mock DB)
async function loadDatabaseStatus() {
  const status = await window.API.getStatus();
  state.dbStatus = status;

  if (elements.dbStatusDot && elements.dbStatusText) {
    if (status.isMongoDBConnected) {
      elements.dbStatusDot.style.backgroundColor = '#10b981';
      elements.dbStatusText.textContent = 'MongoDB Atlas';
      elements.dbStatusText.title = 'Đang kết nối cơ sở dữ liệu MongoDB Atlas';
    } else {
      elements.dbStatusDot.style.backgroundColor = '#f59e0b';
      elements.dbStatusText.textContent = 'Mock DB';
      elements.dbStatusText.title = 'Đang chạy Mock Database (Sẵn sàng nối MongoDB)';
    }
  }
}

// 2. Tải danh sách tất cả Trainee
async function loadTrainees() {
  const trainees = await window.API.getTrainees();
  state.trainees = trainees;

  // Update badge count
  if (elements.traineeCountBadge) {
    elements.traineeCountBadge.textContent = trainees.length;
  }

  // Populate Dropdown selector if present
  if (elements.traineeSelect) {
    elements.traineeSelect.innerHTML = '';
    trainees.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.traineeId;
      opt.textContent = `${t.fullName} (${t.traineeId})`;
      if (t.traineeId === state.currentTraineeId) {
        opt.selected = true;
      }
      elements.traineeSelect.appendChild(opt);
    });
  }

  // Refresh active view with newly loaded trainees
  if (state.activeTab === 'admin') {
    renderAdminView();
  } else if (state.activeTab === 'leaderboard') {
    renderLeaderboard();
  }
}

// 3. Tải chi tiết thực tập sinh hiện tại
async function loadCurrentTrainee(id) {
  let targetId = id;
  if (!targetId) {
    if (state.currentTraineeId) {
      targetId = state.currentTraineeId;
    } else if (state.trainees && state.trainees.length > 0) {
      targetId = state.trainees[0].traineeId;
    }
  }

  if (!targetId) return;

  const trainee = await window.API.getTraineeById(targetId);
  if (!trainee) return;

  state.currentTrainee = trainee;
  state.currentTraineeId = trainee.traineeId;

  // Render Dashboard
  renderDashboard(trainee);
}

// 4. Tải danh sách thông báo
async function loadAnnouncements() {
  const news = await window.API.getAnnouncements();
  state.announcements = news;
  renderAnnouncements(news);
}

// ==========================================
// ASSIGNMENT SCORE CLASSIFICATION HELPERS
// (9-10: Xuất sắc, 8-9: Giỏi, 6.5-8: Khá, 5-6.5: Trung bình, < 5: Yếu)
// Chỉ Admin xem được số điểm cụ thể, User/Student chỉ xem chữ xếp loại
// ==========================================
function getAssignmentClassification(score) {
  const s = Number(score);
  if (isNaN(s)) return 'Chưa xếp loại';
  if (s >= 9.0) return 'Xuất sắc';
  if (s >= 8.0) return 'Giỏi';
  if (s >= 6.5) return 'Khá';
  if (s >= 5.0) return 'Trung bình';
  return 'Yếu';
}

function getAssignmentBadgeClass(score) {
  const s = Number(score);
  if (isNaN(s)) return 'badge-fair';
  if (s >= 9.0) return 'badge-excellent';
  if (s >= 8.0) return 'badge-good';
  if (s >= 6.5) return 'badge-fair';
  if (s >= 5.0) return 'badge-average';
  return 'badge-poor';
}


// ==========================================
// MODAL: MONGODB CONFIGURATION
// ==========================================
function openMongoModal() {
  const status = state.dbStatus || {};
  if (status.isMongoDBConnected) {
    elements.modalStatusDot.style.backgroundColor = '#10b981';
    elements.modalStatusTitle.textContent = 'Trạng thái: ĐÃ KẾT NỐI MONGODB ATLAS';
    elements.modalStatusDesc.textContent = 'Dữ liệu sinh viên đang được lưu trữ và truy vấn trực tiếp từ cụm MongoDB của bạn.';
  } else {
    elements.modalStatusDot.style.backgroundColor = '#f59e0b';
    elements.modalStatusTitle.textContent = 'Trạng thái: MOCK DATABASE (Sẵn sàng nối MongoDB)';
    elements.modalStatusDesc.textContent = 'Hệ thống đang chạy với dữ liệu mẫu hoàn chỉnh. Bạn chỉ cần dán chuỗi kết nối MongoDB Atlas để kích hoạt.';
  }

  elements.mongoConfigModal.classList.add('open');
}

function closeMongoModal() {
  elements.mongoConfigModal.classList.remove('open');
}

async function handleSaveMongoUri(e) {
  e.preventDefault();
  const uri = elements.mongoUriInput.value.trim();
  if (!uri) return;

  const btn = document.getElementById('saveMongoBtn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '<span>Đang kết nối...</span>';
  btn.disabled = true;

  const res = await window.API.saveMongoUri(uri);
  btn.innerHTML = originalText;
  btn.disabled = false;

  if (res.success) {
    alert('Đã cập nhật cấu hình MongoDB thành công!\nHệ thống sẽ kết nối và đồng bộ dữ liệu.');
    closeMongoModal();
    await loadDatabaseStatus();
    await loadTrainees();
  } else {
    alert('Không thể kết nối MongoDB: ' + res.message);
  }
}

function initMongoConfigModal() {
  if (elements.mongoConfigForm) {
    elements.mongoConfigForm.addEventListener('submit', handleSaveMongoUri);
  }
}

// Helper: Lấy ký tự viết tắt từ Họ Tên (ví dụ "Khôi Trương Trần Anh" -> "TA")
function getInitials(name) {
  if (!name) return 'TA';
  if (name.includes('Trần Anh') || name.includes('Khôi Trương Trần Anh') || name.includes('Trương Trần Anh Khôi')) {
    return 'TA';
  }
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}


function setThemeMode(mode) {
  applyThemeMode(mode, true);
}

// Expose to global window
window.state = state;
window.elements = elements;
window.getTraineeDicebearAvatar = getTraineeDicebearAvatar;
window.getAdminAvatar = getAdminAvatar;
window.getSavedThemeMode = getSavedThemeMode;
window.setThemeMode = setThemeMode;
window.applyThemeMode = applyThemeMode;
window.initTheme = initTheme;
window.toggleSidebar = toggleSidebar;
window.checkDbStatus = loadDatabaseStatus;
window.loadDatabaseStatus = loadDatabaseStatus;
window.loadTrainees = loadTrainees;
window.loadCurrentTrainee = loadCurrentTrainee;
window.loadAnnouncements = loadAnnouncements;
window.getAssignmentClassification = getAssignmentClassification;
window.openMongoModal = openMongoModal;
window.initMongoConfigModal = initMongoConfigModal;
