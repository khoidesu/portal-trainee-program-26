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
  currentTraineeId: null, // Khôi Trương Trần Anh
  activeTab: 'schedule',
  scheduleWeekOffset: 0,
  scheduleViewMode: 'week',
  trainees: [],
  currentTrainee: null,
  profileTargetId: null,
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

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Chọn avatar cá voi ổn định theo mã Trainee.
 */
function getTraineeDicebearAvatar(traineeOrId, name = '') {
  let seed = '';
  if (typeof traineeOrId === 'object' && traineeOrId !== null) {
    const avatar = String(traineeOrId.avatar || '').trim();
    if (/^\/uploads\/avatars\/[a-zA-Z0-9_-]+\.(?:jpe?g|png|webp)$/i.test(avatar) ||
        /^\/assets\/whale_[1-4]\.png$/.test(avatar)) {
      return avatar;
    }
    seed = traineeOrId.traineeId || traineeOrId.username || traineeOrId.email || traineeOrId.fullName || 'student';
  } else {
    seed = String(traineeOrId || 'student').trim();
  }
  const hash = Array.from(String(seed)).reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 0);
  return `/assets/whale_${hash % 4 + 1}.png`;
}

function getAdminAvatar() {
  return 'https://api.dicebear.com/9.x/bottts/svg?seed=uit-admin&backgroundColor=d1d4f9';
}

function canManage(permission) {
  const user = state.currentUser;
  return Boolean(user && (user.isOwner || user.permissions?.includes(permission)));
}

function canViewMssv() {
  const user = state.currentUser;
  if (!user) return false;
  if (user.isOwner) return true;
  if (Array.isArray(user.permissions) && user.permissions.some(p =>
    ['trainees:manage', 'leave:manage', 'questions:manage', 'attendance:manage', 'accounts:manage'].includes(p)
  )) {
    return true;
  }
  return false;
}
window.canViewMssv = canViewMssv;

async function refreshPortalData() {
  await loadTrainees();
  renderLeaderboard();
  if (canManage('trainees:manage')) renderAdminTable();
  if (state.activeTab === 'grades') await renderGradesView(false);
}

function formatTraineeMetric(value, suffix = '') {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) + suffix : '—';
}

function formatStarDelta(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const number = Number(value);
  return (number > 0 ? '+' : '') + number;
}

function attendanceLabel(status) {
  return { present: 'Có mặt', absent_excused: 'Vắng có phép', absent_unexcused: 'Vắng không phép', not_recorded: 'Chưa có bản ghi' }[status] || 'Chưa có bản ghi';
}

// DOM Elements
const elements = {
  // Navigation & Layout
  get sidebar() { return document.getElementById('sidebar'); },
  get collapseSidebarBtn() { return document.getElementById('collapseSidebarBtn'); },
  get mobileMenuBtn() { return document.getElementById('mobileMenuBtn'); },
  get navDashboard() { return document.getElementById('navDashboard'); },
  get navProfile() { return document.getElementById('navProfile'); },
  get navSchedule() { return document.getElementById('navSchedule'); },
  get navLeaderboard() { return document.getElementById('navLeaderboard'); },
  get navGrades() { return document.getElementById('navGrades'); },
  get navAssignments() { return document.getElementById('navAssignments'); },
  get navLeave() { return document.getElementById('navLeave'); },
  get navQuestions() { return document.getElementById('navQuestions'); },
  get navAdmin() { return document.getElementById('navAdmin'); },
  get profileNavGroupLabel() { return document.getElementById('profileNavGroupLabel'); },
  get profileNavList() { return document.getElementById('profileNavList'); },
  get adminNavGroupLabel() { return document.getElementById('adminNavGroupLabel'); },
  get adminNavList() { return document.getElementById('adminNavList'); },
  get viewDashboard() { return document.getElementById('viewDashboard'); },
  get viewProfile() { return document.getElementById('viewProfile'); },
  get viewSchedule() { return document.getElementById('viewSchedule'); },
  get viewLeaderboard() { return document.getElementById('viewLeaderboard'); },
  get viewGrades() { return document.getElementById('viewGrades'); },
  get viewAssignments() { return document.getElementById('viewAssignments'); },
  get viewLeave() { return document.getElementById('viewLeave'); },
  get viewQuestions() { return document.getElementById('viewQuestions'); },
  get viewAdmin() { return document.getElementById('viewAdmin'); },
  get pageMainTitle() { return document.getElementById('pageMainTitle'); },
  get pageSubBreadcrumb() { return document.getElementById('pageSubBreadcrumb'); },
  get traineeCountBadge() { return document.getElementById('traineeCountBadge'); },

  // Timetable & Monthly Schedule Elements
  get scheduleMonthContainer() { return document.getElementById('scheduleMonthContainer'); },
  get btnModeAgenda() { return document.getElementById('btnModeAgenda'); },
  get btnModeCalendar() { return document.getElementById('btnModeCalendar'); },
  get filterScheduleMonth() { return document.getElementById('filterScheduleMonth'); },
  get btnDownloadScheduleExcel() { return document.getElementById('btnDownloadScheduleExcel'); },
  get btnDownloadSyllabus() { return document.getElementById('btnDownloadSyllabus'); },
  get btnGoogleCalendar() { return document.getElementById('btnGoogleCalendar'); },
  get btnOpenScheduleEditor() { return document.getElementById('btnOpenScheduleEditor'); },
  get scheduleFilterForm() { return document.getElementById('scheduleFilterForm'); },

  // Schedule Modal Elements
  get scheduleModal() { return document.getElementById('scheduleModal'); },
  get closeScheduleModalBtn() { return document.getElementById('closeScheduleModalBtn'); },
  get cancelScheduleBtn() { return document.getElementById('cancelScheduleBtn'); },
  get scheduleCourseForm() { return document.getElementById('scheduleCourseForm'); },
  get btnResetDefaultSchedule() { return document.getElementById('btnResetDefaultSchedule'); },
  get btnDeleteCourse() { return document.getElementById('btnDeleteCourse'); },
  get courseEditId() { return document.getElementById('courseEditId'); },
  get courseTitleInput() { return document.getElementById('courseTitleInput'); },
  get courseCodeInput() { return document.getElementById('courseCodeInput'); },
  get courseDateInput() { return document.getElementById('courseDateInput'); },
  get courseStartTime() { return document.getElementById('courseStartTime'); },
  get courseEndTime() { return document.getElementById('courseEndTime'); },
  get courseDaySelect() { return document.getElementById('courseDaySelect'); },
  get coursePeriods() { return document.getElementById('coursePeriods'); },
  get courseStatusSelect() { return document.getElementById('courseStatusSelect'); },
  get courseTypeSelect() { return document.getElementById('courseTypeSelect'); },
  get courseInstructorInput() { return document.getElementById('courseInstructorInput'); },
  get courseTeamsUrl() { return document.getElementById('courseTeamsUrl'); },
  get courseRecordUrl() { return document.getElementById('courseRecordUrl'); },
  get courseDocumentUrl() { return document.getElementById('courseDocumentUrl'); },
  get courseRoomInput() { return document.getElementById('courseRoomInput'); },
  get courseOfflineLocationGroup() { return document.getElementById('courseOfflineLocationGroup'); },
  get courseDocCountInput() { return document.getElementById('courseDocCountInput'); },
  get courseDocumentsContainer() { return document.getElementById('courseDocumentsContainer'); },
  get btnAddDocRowBtn() { return document.getElementById('btnAddDocRowBtn'); },
  get courseNoteInput() { return document.getElementById('courseNoteInput'); },
  get scheduleModalTitle() { return document.getElementById('scheduleModalTitle'); },

  // Session Detail Modal (Link vào học MS Teams & Link Record)
  get sessionDetailModal() { return document.getElementById('sessionDetailModal'); },
  get closeSessionDetailModalBtn() { return document.getElementById('closeSessionDetailModalBtn'); },
  get sessionDetailModalTitle() { return document.getElementById('sessionDetailModalTitle'); },
  get sessionDetailModalSubtitle() { return document.getElementById('sessionDetailModalSubtitle'); },
  get sessionDetailModalBody() { return document.getElementById('sessionDetailModalBody'); },

  // Admin Schedule Table Elements
  get adminScheduleTableBody() { return document.getElementById('adminScheduleTableBody'); },
  get btnAdminAddSchedule() { return document.getElementById('btnAdminAddSchedule'); },
  get btnAdminGoSchedule() { return document.getElementById('btnAdminGoSchedule'); },
  get btnAdminResetSchedule() { return document.getElementById('btnAdminResetSchedule'); },

  // Header controls & Theme dropdown
  get traineeSelect() { return document.getElementById('traineeSelect'); },
  get themeModeWrapper() { return document.getElementById('themeModeWrapper'); },
  get themeToggleBtn() { return document.getElementById('themeToggleBtn'); },
  get themeDropdownMenu() { return document.getElementById('themeDropdownMenu'); },
  get themeOptionItems() { return document.querySelectorAll('.theme-option-item'); },

  // Header User Account Pill & Dropdown
  get openLoginModalBtn() { return document.getElementById('openLoginModalBtn'); },
  get headerLogoutBtn() { return document.getElementById('headerLogoutBtn'); },
  get sidebarLoginItem() { return document.getElementById('sidebarLoginItem'); },
  get sidebarLoginBtn() { return document.getElementById('sidebarLoginBtn'); },
  get sidebarLogoutItem() { return document.getElementById('sidebarLogoutItem'); },
  get sidebarLogoutBtn() { return document.getElementById('sidebarLogoutBtn'); },
  get guestBannerNotice() { return document.getElementById('guestBannerNotice'); },
  get guestBannerLoginBtn() { return document.getElementById('guestBannerLoginBtn'); },
  get guestBannerAdminBtn() { return document.getElementById('guestBannerAdminBtn'); },
  get menuBtnOpenLoginText() { return document.getElementById('menuBtnOpenLoginText'); },
  get studentGreetingTag() { return document.querySelector('#studentProfileCard .greeting-tag'); },
  get traineeSelectorWrap() { return document.querySelector('.trainee-selector-dropdown'); },
  get headerAccountWrapper() { return document.getElementById('headerAccountWrapper'); },
  get headerAccountPill() { return document.getElementById('headerAccountPill'); },
  get headerAccountAvatar() { return document.getElementById('headerAccountAvatar'); },
  get headerAccountInitials() { return document.getElementById('headerAccountInitials'); },
  get headerAccountName() { return document.getElementById('headerAccountName'); },
  get headerAccountId() { return document.getElementById('headerAccountId'); },
  get accountDropdownMenu() { return document.getElementById('accountDropdownMenu'); },
  get menuAccountName() { return document.getElementById('menuAccountName'); },
  get menuAccountRole() { return document.getElementById('menuAccountRole'); },
  get menuBtnGoAdmin() { return document.getElementById('menuBtnGoAdmin'); },
  get menuBtnOpenLogin() { return document.getElementById('menuBtnOpenLogin'); },
  get menuBtnLogout() { return document.getElementById('menuBtnLogout'); },
  get menuBtnGoProfile() { return document.getElementById('menuBtnGoProfile'); },

  // Profile View Elements
  get profileAvatarImg() { return document.getElementById('profileAvatarImg'); },
  get profileAvatarInitials() { return document.getElementById('profileAvatarInitials'); },
  get profileAvatarFileInput() { return document.getElementById('profileAvatarFileInput'); },
  get profileAvatarPreviewBox() { return document.getElementById('profileAvatarPreviewBox'); },
  get profileAvatarPreviewImg() { return document.getElementById('profileAvatarPreviewImg'); },
  get btnConfirmUploadAvatar() { return document.getElementById('btnConfirmUploadAvatar'); },
  get btnCancelAvatarPreview() { return document.getElementById('btnCancelAvatarPreview'); },
  get btnUploadProfileAvatar() { return document.getElementById('btnUploadProfileAvatar'); },
  get btnRemoveProfileAvatar() { return document.getElementById('btnRemoveProfileAvatar'); },
  get profileBadgeId() { return document.getElementById('profileBadgeId'); },
  get profileBadgeRole() { return document.getElementById('profileBadgeRole'); },
  get profileBadgeProgramStatus() { return document.getElementById('profileBadgeProgramStatus'); },
  get profileBadgeBatch() { return document.getElementById('profileBadgeBatch'); },
  get profileBadgeTrack() { return document.getElementById('profileBadgeTrack'); },
  get profileBadgeMentor() { return document.getElementById('profileBadgeMentor'); },
  get profileAccountUsername() { return document.getElementById('profileAccountUsername'); },
  get profileAccountStatusBadge() { return document.getElementById('profileAccountStatusBadge'); },
  get profileAccountCreatedAt() { return document.getElementById('profileAccountCreatedAt'); },
  get profileAccountLastLogin() { return document.getElementById('profileAccountLastLogin'); },
  get profileAccountLastPassChange() { return document.getElementById('profileAccountLastPassChange'); },
  get profileInfoForm() { return document.getElementById('profileInfoForm'); },
  get profileInputFullName() { return document.getElementById('profileInputFullName'); },
  get profileInputEmail() { return document.getElementById('profileInputEmail'); },
  get profileInputId() { return document.getElementById('profileInputId'); },
  get profileInputPhone() { return document.getElementById('profileInputPhone'); },
  get profileInputDob() { return document.getElementById('profileInputDob'); },
  get profileSelectGender() { return document.getElementById('profileSelectGender'); },
  get profileInputAddress() { return document.getElementById('profileInputAddress'); },
  get profileInputFacebook() { return document.getElementById('profileInputFacebook'); },
  get profileInputLinkedin() { return document.getElementById('profileInputLinkedin'); },
  get profileTextareaBio() { return document.getElementById('profileTextareaBio'); },
  get profilePrefSchedule() { return document.getElementById('profilePrefSchedule'); },
  get profilePrefAssignments() { return document.getElementById('profilePrefAssignments'); },
  get profilePrefQuestions() { return document.getElementById('profilePrefQuestions'); },
  get profileProgStatusDisplay() { return document.getElementById('profileProgStatusDisplay'); },
  get profileProgBatchDisplay() { return document.getElementById('profileProgBatchDisplay'); },
  get profileProgStarsDisplay() { return document.getElementById('profileProgStarsDisplay'); },
  get profileProgAttendanceDisplay() { return document.getElementById('profileProgAttendanceDisplay'); },
  get profileActivitiesContainer() { return document.getElementById('profileActivitiesContainer'); },
  get btnRefreshActivities() { return document.getElementById('btnRefreshActivities'); },
  get btnSaveProfileInfo() { return document.getElementById('btnSaveProfileInfo'); },
  get profileSecurityForm() { return document.getElementById('profileSecurityForm'); },
  get profileOldPass() { return document.getElementById('profileOldPass'); },
  get profileNewPass() { return document.getElementById('profileNewPass'); },
  get profileConfirmPass() { return document.getElementById('profileConfirmPass'); },
  get btnSaveNewPassword() { return document.getElementById('btnSaveNewPassword'); },
  get btnProfileSendForgotReq() { return document.getElementById('btnProfileSendForgotReq'); },
  get profileForgotModal() { return document.getElementById('profileForgotModal'); },
  get closeProfileForgotModalBtn() { return document.getElementById('closeProfileForgotModalBtn'); },
  get cancelProfileForgotBtn() { return document.getElementById('cancelProfileForgotBtn'); },
  get profileForgotForm() { return document.getElementById('profileForgotForm'); },
  get profileForgotIdentifier() { return document.getElementById('profileForgotIdentifier'); },
  get profileForgotEmail() { return document.getElementById('profileForgotEmail'); },
  get profileForgotPhone() { return document.getElementById('profileForgotPhone'); },
  get profileForgotNote() { return document.getElementById('profileForgotNote'); },

  // Admin Support Requests Elements
  get adminSupportTableBody() { return document.getElementById('adminSupportTableBody'); },
  get adminSupportPendingBadge() { return document.getElementById('adminSupportPendingBadge'); },
  get adminSupportEmptyState() { return document.getElementById('adminSupportEmptyState'); },
  get btnAdminRefreshSupport() { return document.getElementById('btnAdminRefreshSupport'); },

  // Dashboard Trainee Card
  get studentAvatar() { return document.getElementById('studentAvatar'); },
  get studentAvatarFallback() { return document.getElementById('studentAvatarFallback'); },
  get studentName() { return document.getElementById('studentName'); },
  get studentId() { return document.getElementById('studentId'); },
  get studentBatch() { return document.getElementById('studentBatch'); },
  get studentTrack() { return document.getElementById('studentTrack'); },
  get studentEmail() { return document.getElementById('studentEmail'); },
  get studentStatusBadge() { return document.getElementById('studentStatusBadge'); },
  get studentCohortBadge() { return document.getElementById('studentCohortBadge'); },
  get studentAcademicYear() { return document.getElementById('studentAcademicYear'); },

  // 4 KPI Metrics trang chủ (Dễ dàng link sync với Admin & Database)
  get metricStars() { return document.getElementById('metricStars'); },
  get metricStarClass() { return document.getElementById('metricStarClass'); },
  get metricStarTrendWrap() { return document.getElementById('metricStarTrendWrap'); },
  get metricStarTrend() { return document.getElementById('metricStarTrend'); },
  get metricStarTrendText() { return document.getElementById('metricStarTrendText'); },

  get metricAttendedSessions() { return document.getElementById('metricAttendedSessions'); },
  get metricAttendanceRate() { return document.getElementById('metricAttendanceRate'); },
  get metricAttendanceDetail() { return document.getElementById('metricAttendanceDetail'); },
  get metricAttendanceBar() { return document.getElementById('metricAttendanceBar'); },

  get metricAssignmentScore() { return document.getElementById('metricAssignmentScore'); },
  get metricAssignmentClass() { return document.getElementById('metricAssignmentClass'); },
  get metricAssignmentDetail() { return document.getElementById('metricAssignmentDetail'); },

  get metricRank() { return document.getElementById('metricRank'); },
  get metricRankClass() { return document.getElementById('metricRankClass'); },
  get metricRankNote() { return document.getElementById('metricRankNote'); },

  // Dashboard Subsections
  get scheduleListContainer() { return document.getElementById('scheduleListContainer'); },
  get scheduleCountBadge() { return document.getElementById('scheduleCountBadge'); },
  get pendingRequestsContainer() { return document.getElementById('pendingRequestsContainer'); },
  get mentorAvatar() { return document.getElementById('mentorAvatar'); },
  get mentorName() { return document.getElementById('mentorName'); },
  get mentorEmail() { return document.getElementById('mentorEmail'); },
  get mentorPhone() { return document.getElementById('mentorPhone'); },
  get newsListContainer() { return document.getElementById('newsListContainer'); },

  // Leaderboard Elements
  get leaderboardSummaryStats() { return document.getElementById('leaderboardSummaryStats'); },
  get leaderboardSearchInput() { return document.getElementById('leaderboardSearchInput'); },
  get leaderboardSortSelect() { return document.getElementById('leaderboardSortSelect'); },
  get leaderboardTableBody() { return document.getElementById('leaderboardTableBody'); },
  get filterPills() { return document.querySelectorAll('.filter-pill'); },

  // Admin View Elements
  get adminDbChipText() { return document.getElementById('adminDbChipText'); },
  get btnAdminRefresh() { return document.getElementById('btnAdminRefresh'); },
  get btnOpenCreateUserModal() { return document.getElementById('btnOpenCreateUserModal'); },
  get adminMetricTotalUsers() { return document.getElementById('adminMetricTotalUsers'); },
  get adminMetricTotalStars() { return document.getElementById('adminMetricTotalStars'); },
  get adminMetricAvgAttendance() { return document.getElementById('adminMetricAvgAttendance'); },
  get adminMetricAvgScore() { return document.getElementById('adminMetricAvgScore'); },
  get adminSearchInput() { return document.getElementById('adminSearchInput'); },
  get adminTrackFilter() { return document.getElementById('adminTrackFilter'); },
  get adminTableCountBadge() { return document.getElementById('adminTableCountBadge'); },
  get adminTraineesTableBody() { return document.getElementById('adminTraineesTableBody'); },
  get adminEmptyState() { return document.getElementById('adminEmptyState'); },

  // Modals
  get traineeDetailModal() { return document.getElementById('traineeDetailModal'); },
  get closeDetailModalBtn() { return document.getElementById('closeDetailModalBtn'); },
  get traineeDetailModalBody() { return document.getElementById('traineeDetailModalBody'); },

  // Login Modal
  get loginModal() { return document.getElementById('loginModal'); },
  get closeLoginModalBtn() { return document.getElementById('closeLoginModalBtn'); },
  get cancelLoginBtn() { return document.getElementById('cancelLoginBtn'); },
  get loginForm() { return document.getElementById('loginForm'); },
  get loginUsernameInput() { return document.getElementById('loginUsernameInput'); },
  get loginPasswordInput() { return document.getElementById('loginPasswordInput'); },
  get btnSubmitLogin() { return document.getElementById('btnSubmitLogin'); },
  get btnQuickAdminLogin() { return document.getElementById('btnQuickAdminLogin'); },
  get btnQuickStudentLogin() { return document.getElementById('btnQuickStudentLogin'); },
  get loginFeedbackAlert() { return document.getElementById('loginFeedbackAlert'); },

  // Create Trainee Modal
  get createTraineeModal() { return document.getElementById('createTraineeModal'); },
  get closeCreateTraineeModalBtn() { return document.getElementById('closeCreateTraineeModalBtn'); },
  get cancelCreateTraineeBtn() { return document.getElementById('cancelCreateTraineeBtn'); },
  get createTraineeForm() { return document.getElementById('createTraineeForm'); },
  get createTraineeId() { return document.getElementById('createTraineeId'); },
  get createFullName() { return document.getElementById('createFullName'); },
  get createEmail() { return document.getElementById('createEmail'); },
  get createTrack() { return document.getElementById('createTrack'); },
  get createBatch() { return document.getElementById('createBatch'); },
  get createStars() { return document.getElementById('createStars'); },
  get createAttended() { return document.getElementById('createAttended'); },
  get createTotalSessions() { return document.getElementById('createTotalSessions'); },
  get createExcused() { return document.getElementById('createExcused'); },
  get createUnexcused() { return document.getElementById('createUnexcused'); },
  get createAssignmentScore() { return document.getElementById('createAssignmentScore'); },

  // Edit Trainee Modal
  get editTraineeModal() { return document.getElementById('editTraineeModal'); },
  get closeEditTraineeModalBtn() { return document.getElementById('closeEditTraineeModalBtn'); },
  get cancelEditTraineeBtn() { return document.getElementById('cancelEditTraineeBtn'); },
  get editTraineeForm() { return document.getElementById('editTraineeForm'); },
  get editTraineeIdHidden() { return document.getElementById('editTraineeIdHidden'); },
  get editTraineeId() { return document.getElementById('editTraineeId'); },
  get editFullName() { return document.getElementById('editFullName'); },
  get editEmail() { return document.getElementById('editEmail'); },
  get editTrack() { return document.getElementById('editTrack'); },
  get editBatch() { return document.getElementById('editBatch'); },
  get editProgramStatus() { return document.getElementById('editProgramStatus'); },
  get editMentorName() { return document.getElementById('editMentorName'); },
  get editMentorEmail() { return document.getElementById('editMentorEmail'); },
  get editMentorRole() { return document.getElementById('editMentorRole'); },
  get editMentorPhone() { return document.getElementById('editMentorPhone'); },
  get editStars() { return document.getElementById('editStars'); },
  get editAttendedSessions() { return document.getElementById('editAttendedSessions'); },
  get editTotalSessions() { return document.getElementById('editTotalSessions'); },
  get editAbsentExcused() { return document.getElementById('editAbsentExcused'); },
  get editAbsentUnexcused() { return document.getElementById('editAbsentUnexcused'); },
  get editAssignmentScore() { return document.getElementById('editAssignmentScore'); },
  get editCompletedAssignments() { return document.getElementById('editCompletedAssignments'); },
  get btnDeleteFromEditModal() { return document.getElementById('btnDeleteFromEditModal'); },
  get editTraineeSessionsContainer() { return document.getElementById('editTraineeSessionsContainer'); },
  get btnAddSessionToStudentBtn() { return document.getElementById('btnAddSessionToStudentBtn'); },

  // Student Navigation Sections Wrapper
  get studentOnlyNavSections() { return document.getElementById('studentOnlyNavSections'); },

  // Change Password Modal
  get menuBtnOpenChangePassword() { return document.getElementById('menuBtnOpenChangePassword'); },
  get changePasswordModal() { return document.getElementById('changePasswordModal'); },
  get closeChangePasswordModalBtn() { return document.getElementById('closeChangePasswordModalBtn'); },
  get cancelChangePasswordBtn() { return document.getElementById('cancelChangePasswordBtn'); },
  get changePasswordForm() { return document.getElementById('changePasswordForm'); },
  get changePassCurrent() { return document.getElementById('changePassCurrent'); },
  get changePassNew() { return document.getElementById('changePassNew'); },
  get changePassConfirm() { return document.getElementById('changePassConfirm'); },
  get changePassFeedback() { return document.getElementById('changePassFeedback'); },

  // Delete Trainee Confirmation Modal
  get deleteTraineeConfirmModal() { return document.getElementById('deleteTraineeConfirmModal'); },
  get closeDeleteTraineeModalBtn() { return document.getElementById('closeDeleteTraineeModalBtn'); },
  get deleteConfirmMessage() { return document.getElementById('deleteConfirmMessage'); },
  get deleteTargetTraineeId() { return document.getElementById('deleteTargetTraineeId'); },
  get cancelDeleteTraineeBtn() { return document.getElementById('cancelDeleteTraineeBtn'); },
  get confirmDeleteTraineeBtn() { return document.getElementById('confirmDeleteTraineeBtn'); },
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
    document.documentElement.style.backgroundColor = '#eaf4ff';
    document.documentElement.style.colorScheme = 'light';

    document.body.classList.remove('dark-theme');
    document.body.classList.add('light-theme');
    document.body.style.backgroundColor = '#eaf4ff';
    document.body.style.colorScheme = 'light';

    if (themeMeta) themeMeta.content = '#eaf4ff';
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
  const label = elements.themeToggleBtn.querySelector('.theme-toggle-label');
  const icon = elements.themeToggleBtn.querySelector('use');
  const name = { light: 'sun', dark: 'moon', system: 'monitor' }[mode] || 'monitor';
  if (label) label.textContent = { light: 'Sáng', dark: 'Tối', system: 'Hệ thống' }[mode] || 'Giao diện';
  if (icon) icon.setAttribute('href', `#theme-icon-${name}`);
  const titleText = `Chế độ giao diện: ${{ light: 'Sáng', dark: 'Tối', system: 'Theo Hệ thống' }[mode] || 'Hệ thống'}`;
  elements.themeToggleBtn.setAttribute('aria-label', titleText);
  elements.themeToggleBtn.setAttribute('title', titleText);
}

function updateThemeDropdownUI(mode) {
  if (!elements.themeOptionItems) return;
  elements.themeOptionItems.forEach((btn) => {
    const itemMode = btn.getAttribute('data-mode');
    btn.setAttribute('aria-pressed', String(itemMode === mode));
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
    if (typeof window.closeAllDropdowns === 'function') {
      window.closeAllDropdowns(document.getElementById('themeModeWrapper'));
    } else if (window.closeNotificationDropdown) {
      window.closeNotificationDropdown();
    }
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

function applySidebarCollapsed(isCollapsed) {
  state.isSidebarCollapsed = Boolean(isCollapsed);
  if (elements.sidebar) {
    elements.sidebar.classList.toggle('collapsed', state.isSidebarCollapsed);
  }
  if (elements.collapseSidebarBtn) {
    const iconSvg = state.isSidebarCollapsed
      ? '<svg class="collapse-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m14 9 3 3-3 3"/></svg>'
      : '<svg class="collapse-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m16 15-3-3 3-3"/></svg>';
    const textHtml = state.isSidebarCollapsed ? '' : '<span class="collapse-text">Thu gọn</span>';
    elements.collapseSidebarBtn.innerHTML = `${iconSvg}${textHtml}`;
    elements.collapseSidebarBtn.setAttribute('aria-expanded', String(!state.isSidebarCollapsed));
    elements.collapseSidebarBtn.title = state.isSidebarCollapsed ? 'Mở rộng menu' : 'Thu gọn menu';
  }
}

function toggleSidebar() {
  const next = !state.isSidebarCollapsed;
  applySidebarCollapsed(next);
  try {
    localStorage.setItem('uit_portal_sidebar_collapsed', String(next));
  } catch (e) {}
}

function initSidebarCollapse() {
  try {
    const saved = localStorage.getItem('uit_portal_sidebar_collapsed');
    applySidebarCollapsed(saved === 'true');
  } catch (e) {
    applySidebarCollapsed(false);
  } finally {
    document.documentElement.classList.remove('preload-sidebar-collapsed');
  }
}


// ==========================================
// DATA LOADING
// ==========================================

// 1. Tải trạng thái cơ sở dữ liệu (chỉ dùng nội bộ, không hiển thị)
async function loadDatabaseStatus() {
  state.dbStatus = await window.API.getStatus();
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

  const tracks = [...new Set(state.trainees.map(trainee => trainee.track || trainee.department).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
  ['leaderboardTrackFilter', 'adminTrackFilter', 'selectGradesTrack'].forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;
    const previous = select.value;
    select.innerHTML = '<option value="all">Tất cả</option>' + tracks.map(track => `<option value="${escapeHtml(track)}">${escapeHtml(track)}</option>`).join('');
    select.value = tracks.includes(previous) ? previous : 'all';
  });
  const options = document.getElementById('traineeTrackOptions');
  if (options) options.innerHTML = tracks.map(track => `<option value="${escapeHtml(track)}"></option>`).join('');

  // Refresh active view with newly loaded trainees
  if (state.activeTab === 'admin') {
    renderAdminView();
  } else if (state.activeTab === 'leaderboard') {
    renderLeaderboard();
  }
}

// 3. Tải chi tiết Trainee hiện tại
async function loadCurrentTrainee(id) {
  let targetId = id;
  if (!targetId || targetId === 'undefined' || targetId === 'null') {
    if (state.currentTraineeId && state.currentTraineeId !== 'undefined' && state.currentTraineeId !== 'null') {
      targetId = state.currentTraineeId;
    } else if (state.trainees && state.trainees.length > 0) {
      targetId = state.trainees[0]?.traineeId;
    } else {
      targetId = null;
    }
  }

  if (!targetId || targetId === 'undefined' || targetId === 'null') return;

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


// ==========================================
// IN BẢNG DỮ LIỆU (tài liệu in riêng, không in giao diện web)
// ==========================================
function buildPrintDocument({ title, subtitle = '', meta = [], columns, rows, footerRows = [], landscape = false }) {
  const cell = (tag, value, column) => `<${tag}${column.align ? ` class="${column.align}"` : ''}>${escapeHtml(value ?? '')}</${tag}>`;
  const cells = (row, tag = 'td') => row.map((value, index) => cell(tag, value, columns[index] || {})).join('');
  const printedAt = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
  const dense = columns.length > 12 ? ' dense' : '';
  return `<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Source Sans 3', 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #000; background: #fff; }
  .print-head { border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 12px; }
  .print-org { font-size: 9pt; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #333; }
  h1 { margin: 4px 0 2px; font-size: 17pt; }
  .print-sub { margin: 0; font-size: 10pt; color: #333; }
  .print-meta { display: flex; flex-wrap: wrap; gap: 4px 20px; margin: 10px 0 12px; font-size: 10pt; }
  table { width: 100%; border-collapse: collapse; table-layout: auto; }
  th, td { border: 1px solid #555; padding: 5px 7px; text-align: left; vertical-align: top; font-size: 10pt; overflow-wrap: anywhere; }
  .dense th, .dense td { padding: 3px 4px; font-size: 8pt; }
  th { background: #e5e7eb; font-weight: 700; }
  td.center, th.center { text-align: center; }
  td.right, th.right { text-align: right; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  tfoot td { background: #f3f4f6; font-weight: 700; }
  tr { break-inside: avoid; }
  .print-foot { margin-top: 12px; font-size: 9pt; color: #444; }
  .print-empty { padding: 24px; text-align: center; border: 1px solid #555; }
</style></head>
<body>
  <div class="print-head">
    <div class="print-org">Trainee Program · CS UIT</div>
    <h1>${escapeHtml(title)}</h1>
    ${subtitle ? `<p class="print-sub">${escapeHtml(subtitle)}</p>` : ''}
  </div>
  ${meta.length ? `<div class="print-meta">${meta.map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : ''}
  ${rows.length ? `<table class="${dense.trim()}">
    <thead><tr>${columns.map(column => cell('th', column.label, column)).join('')}</tr></thead>
    <tbody>${rows.map(row => `<tr>${cells(row)}</tr>`).join('')}</tbody>
    ${footerRows.length ? `<tfoot>${footerRows.map(row => `<tr>${cells(row)}</tr>`).join('')}</tfoot>` : ''}
  </table>` : '<div class="print-empty">Không có dữ liệu để in.</div>'}
  <div class="print-foot">In lúc ${escapeHtml(printedAt)} (giờ Việt Nam)</div>
</body></html>`;
}

function printTable(options) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  frame.srcdoc = buildPrintDocument(options);
  frame.onload = () => {
    const win = frame.contentWindow;
    win.onafterprint = () => frame.remove();
    win.focus();
    win.print();
    setTimeout(() => frame.remove(), 60000);
  };
  document.body.appendChild(frame);
}


function showToast(message, type = 'info') {
  if (!message) return;
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'true');
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `uit-toast uit-toast-${type} ${type}`;
  toast.textContent = String(message);

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 350);
  }, 4000);
}

function setThemeMode(mode) {
  applyThemeMode(mode, true);
}

// Expose to global window
window.canManage = canManage;
window.refreshPortalData = refreshPortalData;
window.state = state;
window.elements = elements;
window.escapeHtml = escapeHtml;
window.buildPrintDocument = buildPrintDocument;
window.printTable = printTable;
window.getTraineeDicebearAvatar = getTraineeDicebearAvatar;
window.getAdminAvatar = getAdminAvatar;
window.getSavedThemeMode = getSavedThemeMode;
window.setThemeMode = setThemeMode;
window.applyThemeMode = applyThemeMode;
window.initTheme = initTheme;
window.initSidebarCollapse = initSidebarCollapse;
window.applySidebarCollapsed = applySidebarCollapsed;
window.toggleSidebar = toggleSidebar;
window.showToast = showToast;
window.checkDbStatus = loadDatabaseStatus;
window.loadDatabaseStatus = loadDatabaseStatus;
window.loadTrainees = loadTrainees;
window.loadCurrentTrainee = loadCurrentTrainee;
window.loadAnnouncements = loadAnnouncements;
window.getAssignmentClassification = getAssignmentClassification;
