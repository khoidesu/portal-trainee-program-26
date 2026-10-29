/**
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
 */

// ==========================================
// EVENT LISTENERS
// ==========================================
function setupEventListeners() {
  // Navigation Tabs
  if (elements.navDashboard) {
    elements.navDashboard.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab('dashboard');
    });
  }

  if (elements.navProfile) {
    elements.navProfile.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab('profile');
    });
  }

  if (elements.menuBtnGoProfile) {
    elements.menuBtnGoProfile.addEventListener('click', (e) => {
      e.preventDefault();
      if (elements.headerAccountWrapper) elements.headerAccountWrapper.classList.remove('open');
      if (elements.accountDropdownMenu) elements.accountDropdownMenu.classList.remove('active');
      switchTab('profile');
    });
  }

  if (elements.navSchedule) {
    elements.navSchedule.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab('schedule');
    });
  }

  if (elements.navLeaderboard) {
    elements.navLeaderboard.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab('leaderboard');
    });
  }

  if (elements.navGrades) {
    elements.navGrades.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab('grades');
    });
  }

  if (elements.navAssignments) {
    elements.navAssignments.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab('assignments');
    });
  }

  if (elements.navLeave) {
    elements.navLeave.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab('leave');
    });
  }

  if (elements.navQuestions) {
    elements.navQuestions.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab('questions');
    });
  }

  // Setup Leave Request Form Events
  setupLeaveFormEvents();

  // Setup Question & Q&A Forum Events
  setupQuestionEvents();

  // Disabled nav items notification
  document.querySelectorAll('.nav-link.nav-item-disabled').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const feature = btn.getAttribute('data-feature') || 'chức năng';
      if (window.showToast) {
        window.showToast(`Phần "${feature}" đang được phát triển trong cổng UIT.`, 'info');
      }
    });
  });

  // Clicking "Thời khóa biểu hôm nay" on Dashboard directs to Schedule tab
  const cardSchedule = document.getElementById('cardSchedule');
  if (cardSchedule) {
    cardSchedule.style.cursor = 'pointer';
    cardSchedule.title = 'Bấm để xem Thời khóa biểu đầy đủ theo tuần';
    cardSchedule.addEventListener('click', (e) => {
      // Don't trigger if clicking on an anchor
      if (!e.target.closest('a')) {
        switchTab('schedule');
      }
    });
  }

  // Mobile Menu
  elements.mobileMenuBtn.addEventListener('click', () => {
    elements.sidebar.classList.toggle('mobile-open');
  });

  // Sidebar Collapse
  elements.collapseSidebarBtn.addEventListener('click', toggleSidebar);

  // Theme Dropdown Toggle Button
  if (elements.themeToggleBtn) {
    elements.themeToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleThemeDropdown();
    });
  }

  // Theme Dropdown Options
  if (elements.themeOptionItems) {
    elements.themeOptionItems.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const mode = btn.getAttribute('data-mode');
        applyThemeMode(mode, true);
        toggleThemeDropdown(false);
      });
    });
  }

  // Click outside closes theme dropdown
  document.addEventListener('click', (e) => {
    if (elements.themeModeWrapper && !elements.themeModeWrapper.contains(e.target)) {
      toggleThemeDropdown(false);
    }
  });

  // Admin Nav Link
  if (elements.navAdmin) {
    elements.navAdmin.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab('admin');
    });
  }

  // Header Account Pill click (Toggles account dropdown menu)
  if (elements.headerAccountPill) {
    elements.headerAccountPill.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!state.currentUser) {
        openLoginModal();
        return;
      }
      if (elements.headerAccountWrapper) {
        elements.headerAccountWrapper.classList.toggle('open');
      }
    });
  }

  // Document click outside closes account dropdown menu
  document.addEventListener('click', (e) => {
    if (elements.headerAccountWrapper && !elements.headerAccountWrapper.contains(e.target)) {
      elements.headerAccountWrapper.classList.remove('open');
    }
  });

  // Account dropdown menu actions
  if (elements.menuBtnGoAdmin) {
    elements.menuBtnGoAdmin.addEventListener('click', () => {
      if (elements.headerAccountWrapper) elements.headerAccountWrapper.classList.remove('open');
      switchTab('admin');
    });
  }

  if (elements.menuBtnOpenLogin) {
    elements.menuBtnOpenLogin.addEventListener('click', () => {
      if (elements.headerAccountWrapper) elements.headerAccountWrapper.classList.remove('open');
      openLoginModal();
    });
  }

  if (elements.menuBtnLogout) {
    elements.menuBtnLogout.addEventListener('click', () => {
      if (elements.headerAccountWrapper) elements.headerAccountWrapper.classList.remove('open');
      handleLogout();
    });
  }

  if (elements.openLoginModalBtn) {
    elements.openLoginModalBtn.addEventListener('click', openLoginModal);
  }

  if (elements.headerLogoutBtn) {
    elements.headerLogoutBtn.addEventListener('click', handleLogout);
  }

  // Sidebar Login & Logout Events
  if (elements.sidebarLoginBtn) {
    elements.sidebarLoginBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openLoginModal();
    });
  }

  if (elements.sidebarLogoutBtn) {
    elements.sidebarLogoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      handleLogout();
    });
  }

  // Admin View Toolbar Events

  // Admin View Toolbar Events
  if (elements.btnAdminRefresh) {
    elements.btnAdminRefresh.addEventListener('click', async () => {
      await loadTrainees();
      renderAdminView();
      if (window.showToast) window.showToast('Đã làm mới dữ liệu từ MongoDB Atlas!', 'success');
    });
  }
  if (elements.btnOpenCreateUserModal) {
    elements.btnOpenCreateUserModal.addEventListener('click', openCreateTraineeModal);
  }
  if (elements.adminSearchInput) {
    elements.adminSearchInput.addEventListener('input', (e) => {
      state.adminSearchQuery = e.target.value.trim();
      renderAdminTable();
    });
  }
  if (elements.adminTrackFilter) {
    elements.adminTrackFilter.addEventListener('change', (e) => {
      state.adminSelectedTrack = e.target.value;
      renderAdminTable();
    });
  }

  // Create Trainee Modal Events
  if (elements.closeCreateTraineeModalBtn) elements.closeCreateTraineeModalBtn.addEventListener('click', closeCreateTraineeModal);
  if (elements.cancelCreateTraineeBtn) elements.cancelCreateTraineeBtn.addEventListener('click', closeCreateTraineeModal);
  if (elements.createTraineeModal) {
    elements.createTraineeModal.addEventListener('click', (e) => {
      if (e.target === elements.createTraineeModal) closeCreateTraineeModal();
    });
  }
  if (elements.createTraineeForm) {
    elements.createTraineeForm.addEventListener('submit', handleCreateTraineeSubmit);
  }

  // Edit Trainee Modal Events
  if (elements.closeEditTraineeModalBtn) elements.closeEditTraineeModalBtn.addEventListener('click', closeEditTraineeModal);
  if (elements.cancelEditTraineeBtn) elements.cancelEditTraineeBtn.addEventListener('click', closeEditTraineeModal);
  if (elements.editTraineeModal) {
    elements.editTraineeModal.addEventListener('click', (e) => {
      if (e.target === elements.editTraineeModal) closeEditTraineeModal();
    });
  }
  if (elements.editTraineeForm) {
    elements.editTraineeForm.addEventListener('submit', handleEditTraineeSubmit);
  }

  // Trainee Selector Dropdown (with null guard)
  if (elements.traineeSelect) {
    elements.traineeSelect.addEventListener('change', (e) => {
      const id = e.target.value;
      state.currentTraineeId = id;
      loadCurrentTrainee(id);
    });
  }

  // Search & Filter in Leaderboard
  if (elements.leaderboardSearchInput) {
    elements.leaderboardSearchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.trim();
      renderLeaderboardTable();
    });
  }

  if (elements.filterPills) {
    elements.filterPills.forEach(pill => {
      pill.addEventListener('click', () => {
        elements.filterPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        state.selectedTrack = pill.dataset.track;
        renderLeaderboardTable();
      });
    });
  }

  if (elements.leaderboardSortSelect) {
    elements.leaderboardSortSelect.addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      renderLeaderboardTable();
    });
  }

  // Modals with null guards
  if (elements.openMongoModalBtn) elements.openMongoModalBtn.addEventListener('click', openMongoModal);
  if (elements.dbStatusButton) elements.dbStatusButton.addEventListener('click', openMongoModal);
  if (elements.closeMongoModalBtn) elements.closeMongoModalBtn.addEventListener('click', closeMongoModal);
  if (elements.cancelMongoBtn) elements.cancelMongoBtn.addEventListener('click', closeMongoModal);
  if (elements.mongoConfigModal) {
    elements.mongoConfigModal.addEventListener('click', (e) => {
      if (e.target === elements.mongoConfigModal) closeMongoModal();
    });
  }
  if (elements.mongoConnectForm) {
    elements.mongoConnectForm.addEventListener('submit', handleSaveMongoUri);
  }

  // Detail Modal
  if (elements.closeDetailModalBtn) elements.closeDetailModalBtn.addEventListener('click', closeDetailModal);
  if (elements.traineeDetailModal) {
    elements.traineeDetailModal.addEventListener('click', (e) => {
      if (e.target === elements.traineeDetailModal) closeDetailModal();
    });
  }

  // Change Password Modal Events
  if (elements.menuBtnOpenChangePassword) {
    elements.menuBtnOpenChangePassword.addEventListener('click', () => {
      if (elements.headerAccountWrapper) elements.headerAccountWrapper.classList.remove('open');
      openChangePasswordModal();
    });
  }
  if (elements.closeChangePasswordModalBtn) {
    elements.closeChangePasswordModalBtn.addEventListener('click', closeChangePasswordModal);
  }
  if (elements.cancelChangePasswordBtn) {
    elements.cancelChangePasswordBtn.addEventListener('click', closeChangePasswordModal);
  }
  if (elements.changePasswordModal) {
    elements.changePasswordModal.addEventListener('click', (e) => {
      if (e.target === elements.changePasswordModal) closeChangePasswordModal();
    });
  }
  if (elements.changePasswordForm) {
    elements.changePasswordForm.addEventListener('submit', handleChangePasswordSubmit);
  }

  // Custom Delete Trainee Modal Events
  if (elements.closeDeleteTraineeModalBtn) {
    elements.closeDeleteTraineeModalBtn.addEventListener('click', closeDeleteModal);
  }
  if (elements.cancelDeleteTraineeBtn) {
    elements.cancelDeleteTraineeBtn.addEventListener('click', closeDeleteModal);
  }
  if (elements.deleteTraineeConfirmModal) {
    elements.deleteTraineeConfirmModal.addEventListener('click', (e) => {
      if (e.target === elements.deleteTraineeConfirmModal) closeDeleteModal();
    });
  }
  if (elements.confirmDeleteTraineeBtn) {
    elements.confirmDeleteTraineeBtn.addEventListener('click', confirmDeleteTrainee);
  }
  if (elements.btnDeleteFromEditModal) {
    elements.btnDeleteFromEditModal.addEventListener('click', () => {
      const id = elements.editTraineeIdHidden ? elements.editTraineeIdHidden.value : '';
      if (id) {
        openDeleteModal(id);
      }
    });
  }

  // Profile View Event Listeners
  if (elements.btnUploadProfileAvatar) {
    elements.btnUploadProfileAvatar.addEventListener('click', () => {
      if (elements.profileAvatarFileInput) elements.profileAvatarFileInput.click();
    });
  }
  if (elements.profileAvatarFileInput) {
    elements.profileAvatarFileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) handleProfileAvatarChange(file);
      e.target.value = '';
    });
  }
  if (elements.btnRemoveProfileAvatar) {
    elements.btnRemoveProfileAvatar.addEventListener('click', handleRemoveProfileAvatar);
  }
  if (elements.profileInfoForm) {
    elements.profileInfoForm.addEventListener('submit', handleProfileInfoSave);
  }
  if (elements.profileSecurityForm) {
    elements.profileSecurityForm.addEventListener('submit', handleProfilePasswordChange);
  }

  // Profile Forgot Password Modal Events
  if (elements.btnProfileSendForgotReq) {
    elements.btnProfileSendForgotReq.addEventListener('click', openProfileForgotModal);
  }
  if (elements.closeProfileForgotModalBtn) {
    elements.closeProfileForgotModalBtn.addEventListener('click', closeProfileForgotModal);
  }
  if (elements.cancelProfileForgotBtn) {
    elements.cancelProfileForgotBtn.addEventListener('click', closeProfileForgotModal);
  }
  if (elements.profileForgotModal) {
    elements.profileForgotModal.addEventListener('click', (e) => {
      if (e.target === elements.profileForgotModal) closeProfileForgotModal();
    });
  }
  if (elements.profileForgotForm) {
    elements.profileForgotForm.addEventListener('submit', handleProfileForgotSubmit);
  }

  // Admin Support Requests Refresh
  if (elements.btnAdminRefreshSupport) {
    elements.btnAdminRefreshSupport.addEventListener('click', () => {
      renderAdminSupportRequests();
      if (window.showToast) window.showToast('Đã làm mới danh sách yêu cầu hỗ trợ từ MongoDB Atlas!', 'success');
    });
  }
}

// ==========================================
// TAB SWITCHING
// ==========================================
function switchTab(tab) {
  state.activeTab = tab;

  // Reset all nav links
  const allNavs = [elements.navDashboard, elements.navProfile, elements.navSchedule, elements.navLeaderboard, elements.navGrades, elements.navAssignments, elements.navLeave, elements.navQuestions, elements.navAdmin];
  allNavs.forEach(n => {
    if (n) n.classList.remove('active');
  });

  // Reset all views
  const allViews = [elements.viewDashboard, elements.viewProfile, elements.viewSchedule, elements.viewLeaderboard, elements.viewGrades, elements.viewAssignments, elements.viewLeave, elements.viewQuestions, elements.viewAdmin];
  allViews.forEach(v => {
    if (v) v.classList.remove('active');
  });

  if (tab === 'dashboard' || tab === 'profile') {
    return switchTab('schedule');
  }

  if (tab === 'schedule') {
    if (elements.navSchedule) elements.navSchedule.classList.add('active');
    if (elements.viewSchedule) elements.viewSchedule.classList.add('active');

    elements.pageMainTitle.textContent = 'Thời khóa biểu';
    elements.pageSubBreadcrumb.textContent = 'Danh sách lớp đã đăng ký học phần và lịch học theo tuần';

    renderScheduleView();
  } else if (tab === 'assignments') {
    if (elements.navAssignments) elements.navAssignments.classList.add('active');
    if (elements.viewAssignments) elements.viewAssignments.classList.add('active');

    elements.pageMainTitle.textContent = 'Bài tập rèn luyện';
    elements.pageSubBreadcrumb.textContent = 'Lộ trình bài tập thực hành Trainee Program (Duolingo Style)';

    if (window.initDuolingoModule) {
      window.initDuolingoModule();
    }
  } else if (tab === 'leaderboard') {
    if (elements.navLeaderboard) elements.navLeaderboard.classList.add('active');
    if (elements.viewLeaderboard) elements.viewLeaderboard.classList.add('active');

    elements.pageMainTitle.textContent = 'Bảng Xếp Hạng Sinh Viên & Trainee';
    elements.pageSubBreadcrumb.textContent = 'Tổng hợp thành tích & đánh giá năng lực thực tập sinh';

    renderLeaderboard();
  } else if (tab === 'grades') {
    if (elements.navGrades) elements.navGrades.classList.add('active');
    if (elements.viewGrades) elements.viewGrades.classList.add('active');

    elements.pageMainTitle.textContent = 'Bảng Điểm Sao Buổi Học';
    elements.pageSubBreadcrumb.textContent = 'Theo dõi chi tiết số sao cộng thêm của từng học viên sau mỗi buổi học thực tế';

    renderGradesView();
  } else if (tab === 'leave') {
    if (elements.navLeave) elements.navLeave.classList.add('active');
    if (elements.viewLeave) elements.viewLeave.classList.add('active');

    elements.pageMainTitle.textContent = 'Đơn Xin Nghỉ Học';
    elements.pageSubBreadcrumb.textContent = 'Đơn xin phép vắng mặt buổi học trực tuyến Trainee Program UIT';

    renderLeaveView();
  } else if (tab === 'questions') {
    if (elements.navQuestions) elements.navQuestions.classList.add('active');
    if (elements.viewQuestions) elements.viewQuestions.classList.add('active');

    elements.pageMainTitle.textContent = 'Diễn Đàn Hỏi Đáp & Đặt Câu Hỏi';
    elements.pageSubBreadcrumb.textContent = 'Gửi câu hỏi thắc mắc tới Giảng viên, Mentor và Ban Điều phối UIT';

    renderQuestionsView();
  } else if (tab === 'admin') {
    // SECURITY CHECK: Only allow admin role
    if (!state.currentUser || state.currentUser.role !== 'admin') {
      if (window.showToast) {
        window.showToast('Chỉ Quản trị viên (Admin) mới có quyền truy cập trang này!', 'danger');
      }
      openLoginModal();
      switchTab('schedule');
      return;
    }

    if (elements.navAdmin) elements.navAdmin.classList.add('active');
    if (elements.viewAdmin) elements.viewAdmin.classList.add('active');

    elements.pageMainTitle.textContent = 'Bảng Điều Khiển Quản Trị Hệ Thống';
    elements.pageSubBreadcrumb.textContent = 'Cập nhật số sao, số buổi học, buổi vắng, điểm bài tập & Quản lý người dùng MongoDB';

    renderAdminView();
  }

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Close mobile sidebar if open
  elements.sidebar.classList.remove('mobile-open');
}


// Expose to global window
window.switchTab = switchTab;
window.setupEventListeners = setupEventListeners;
