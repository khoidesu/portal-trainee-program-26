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
function setupMobileNavbarAutoHide() {
  const navbar = document.querySelector('.top-navbar');
  if (!navbar || navbar.dataset.autoHideReady === 'true') return;

  navbar.dataset.autoHideReady = 'true';
  const mobileViewport = window.matchMedia('(max-width: 640px)');
  let scrollAnchor = Math.max(0, window.scrollY);
  let animationFrame = 0;

  const updateNavbar = () => {
    animationFrame = 0;
    const scrollTop = Math.max(0, window.scrollY);
    const scrollDelta = scrollTop - scrollAnchor;

    if (!mobileViewport.matches || scrollTop <= 16) {
      navbar.classList.remove('mobile-nav-hidden');
      scrollAnchor = scrollTop;
    } else if (scrollDelta >= 10) {
      navbar.classList.add('mobile-nav-hidden');
      scrollAnchor = scrollTop;
    } else if (scrollDelta <= -6) {
      navbar.classList.remove('mobile-nav-hidden');
      scrollAnchor = scrollTop;
    }
  };

  const queueNavbarUpdate = () => {
    if (animationFrame) return;
    animationFrame = window.requestAnimationFrame(updateNavbar);
  };

  const resetNavbar = () => {
    scrollAnchor = Math.max(0, window.scrollY);
    navbar.classList.remove('mobile-nav-hidden');
  };

  window.addEventListener('scroll', queueNavbarUpdate, { passive: true });
  mobileViewport.addEventListener('change', resetNavbar);
}

function setupEventListeners() {
  setupMobileNavbarAutoHide();

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
      state.profileTargetId = null;
      switchTab('profile');
    });
  }

  if (elements.menuBtnGoProfile) {
    elements.menuBtnGoProfile.addEventListener('click', (e) => {
      e.preventDefault();
      if (elements.headerAccountWrapper) elements.headerAccountWrapper.classList.remove('open');
      if (elements.accountDropdownMenu) elements.accountDropdownMenu.classList.remove('active');
      state.profileTargetId = null;
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

  // Mobile Menu Toggle & Dismiss
  if (elements.mobileMenuBtn && elements.sidebar) {
    elements.mobileMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelector('.top-navbar')?.classList.remove('mobile-nav-hidden');
      elements.sidebar.classList.toggle('mobile-open');
    });

    elements.sidebar.querySelectorAll('.nav-link').forEach((link) => {
      link.addEventListener('click', () => {
        elements.sidebar.classList.remove('mobile-open');
      });
    });

    document.addEventListener('click', (e) => {
      if (elements.sidebar.classList.contains('mobile-open')) {
        if (!elements.sidebar.contains(e.target) && !elements.mobileMenuBtn.contains(e.target)) {
          elements.sidebar.classList.remove('mobile-open');
        }
      }
    });
  }

  const sidebarMobileCloseBtn = document.getElementById('sidebarMobileCloseBtn');
  if (sidebarMobileCloseBtn && elements.sidebar) {
    sidebarMobileCloseBtn.addEventListener('click', () => {
      elements.sidebar.classList.remove('mobile-open');
    });
  }

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
        openLoginModal(state.activeTab);
        return;
      }
      if (elements.headerAccountWrapper) {
        const willOpen = !elements.headerAccountWrapper.classList.contains('open');
        if (willOpen) {
          if (typeof closeAllDropdowns === 'function') closeAllDropdowns(elements.headerAccountWrapper);
          elements.headerAccountWrapper.classList.add('open');
        } else {
          elements.headerAccountWrapper.classList.remove('open');
        }
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
      openLoginModal(state.activeTab);
    });
  }

  if (elements.menuBtnLogout) {
    elements.menuBtnLogout.addEventListener('click', () => {
      if (elements.headerAccountWrapper) elements.headerAccountWrapper.classList.remove('open');
      handleLogout();
    });
  }

  if (elements.openLoginModalBtn) {
    elements.openLoginModalBtn.addEventListener('click', () => openLoginModal(state.activeTab));
  }

  if (elements.headerLogoutBtn) {
    elements.headerLogoutBtn.addEventListener('click', handleLogout);
  }

  // Sidebar Login & Logout Events
  if (elements.sidebarLoginBtn) {
    elements.sidebarLoginBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openLoginModal(state.activeTab);
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
      if (window.showToast) window.showToast('Đã làm mới dữ liệu.', 'success');
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
  const adminStatusFilter = document.getElementById('adminStatusFilter');
  if (adminStatusFilter) {
    adminStatusFilter.addEventListener('change', (e) => {
      state.adminSelectedStatus = e.target.value;
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

  document.getElementById('leaderboardTrackFilter')?.addEventListener('change', event => {
    state.selectedTrack = event.target.value;
    renderLeaderboardTable();
  });

  if (elements.leaderboardSortSelect) {
    elements.leaderboardSortSelect.addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      renderLeaderboardTable();
    });
  }

  // Modals with null guards
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

  // Lắng nghe phím Escape trên toàn hệ thống để đóng bất kỳ modal nào đang mở
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.keyCode === 27) {
      const openModals = Array.from(document.querySelectorAll(
        '.modal-overlay.open, .modal-overlay.show, .modal-overlay.active, .duo-modal-overlay.active, .login-modal-overlay.show'
      )).filter(m => window.getComputedStyle(m).display !== 'none');

      if (openModals.length > 0) {
        e.preventDefault();
        const topModal = openModals[openModals.length - 1];

        if (topModal.id === 'sessionDetailModal') {
          if (typeof window.closeSessionDetailModal === 'function') {
            window.closeSessionDetailModal();
          } else if (window.ScheduleManager?.closeSessionDetailModal) {
            window.ScheduleManager.closeSessionDetailModal();
          } else {
            topModal.classList.remove('open', 'show', 'active');
          }
        } else if (topModal.id === 'scheduleModal' && typeof window.closeScheduleModal === 'function') {
          window.closeScheduleModal();
        } else if (topModal.id === 'questionDetailModal' && typeof window.closeQuestionDetailModal === 'function') {
          window.closeQuestionDetailModal();
        } else if (topModal.id === 'traineeDetailModal' && typeof window.closeDetailModal === 'function') {
          window.closeDetailModal();
        } else if (topModal.id === 'sessionStarDetailModal' && typeof window.closeSessionStarDetailModal === 'function') {
          window.closeSessionStarDetailModal();
        } else if (topModal.id === 'createUserModal' && typeof window.closeCreateTraineeModal === 'function') {
          window.closeCreateTraineeModal();
        } else if (topModal.id === 'editUserModal' && typeof window.closeEditTraineeModal === 'function') {
          window.closeEditTraineeModal();
        } else if (topModal.id === 'deleteConfirmModal' && typeof window.closeDeleteModal === 'function') {
          window.closeDeleteModal();
        } else if (topModal.id === 'changePasswordModal' && typeof window.closeChangePasswordModal === 'function') {
          window.closeChangePasswordModal();
        } else if (topModal.id === 'duoAssignmentModal') {
          if (window.duolingoManager?.closeAssignmentModal) {
            window.duolingoManager.closeAssignmentModal();
          } else {
            document.getElementById('duoModalCloseBtn')?.click();
          }
        } else if (topModal.id === 'adminEditAssignmentModal' && typeof window.closeAdminEditAssignmentModal === 'function') {
          window.closeAdminEditAssignmentModal();
        } else {
          const closeBtn = topModal.querySelector(
            '.modal-close-btn, .btn-modal-close, #duoModalCloseBtn, [data-modal-close], button[id*="close" i], button[id*="cancel" i], .btn-secondary'
          );
          if (closeBtn) {
            closeBtn.click();
          } else {
            topModal.classList.remove('open', 'show', 'active');
          }
        }
        return;
      }

      if (elements.headerAccountWrapper?.classList.contains('open')) {
        elements.headerAccountWrapper.classList.remove('open');
      }
      if (elements.themeModeWrapper?.classList.contains('open')) {
        elements.themeModeWrapper.classList.remove('open');
      }
    }
  });

  // Đóng mọi custom dropdown & calendar & popover khi click bên ngoài hoặc bấm Esc
  document.addEventListener('click', (e) => {
    const insideDropdown = e.target.closest('.uit-select, .uit-select-menu, .uit-date-picker, .uit-date-popover, .uit-time-picker, .uit-time-popover, #headerAccountWrapper, #themeModeWrapper, #notificationWrapper');
    if (!insideDropdown) {
      closeAllDropdowns();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllDropdowns();
    }
  });

  window.addEventListener('beforeunload', (e) => {
    if (typeof window.hasUnsavedGradeChanges === 'function' && window.hasUnsavedGradeChanges()) {
      e.preventDefault();
      e.returnValue = 'Bạn có thay đổi điểm số chưa lưu!';
      return e.returnValue;
    }
  });

  initCustomSelects();
  initCustomDatePickers();
  initCustomTimePickers();
}

// ==========================================
// UIT DROPDOWN MUTUAL EXCLUSION & HELPER
// ==========================================
function positionFloatingDropdown(trigger, popover, matchTriggerWidth = false) {
  const viewportPadding = 8;
  const gap = 6;
  const triggerRect = trigger.getBoundingClientRect();

  if (matchTriggerWidth) {
    popover.style.minWidth = `${triggerRect.width}px`;
  }

  popover.style.top = '0px';
  popover.style.left = '0px';
  const popoverRect = popover.getBoundingClientRect();
  const availableBelow = window.innerHeight - triggerRect.bottom - viewportPadding;
  const availableAbove = triggerRect.top - viewportPadding;
  const openUpwards = availableBelow < popoverRect.height + gap && availableAbove > availableBelow;
  const top = openUpwards
    ? Math.max(viewportPadding, triggerRect.top - popoverRect.height - gap)
    : Math.min(triggerRect.bottom + gap, Math.max(viewportPadding, window.innerHeight - popoverRect.height - viewportPadding));
  let left = triggerRect.left;

  if (left + popoverRect.width > window.innerWidth - viewportPadding) {
    left = triggerRect.right - popoverRect.width;
  }
  left = Math.max(viewportPadding, Math.min(left, window.innerWidth - popoverRect.width - viewportPadding));

  popover.style.top = `${Math.round(top)}px`;
  popover.style.left = `${Math.round(left)}px`;
  popover.dataset.placement = openUpwards ? 'top' : 'bottom';
}

function openFloatingDropdown(wrapper, trigger, popover, matchTriggerWidth = false) {
  if (popover._uitFloatingCleanup) popover._uitFloatingCleanup();

  wrapper.classList.add('is-open');
  document.body.appendChild(popover);
  popover.classList.add('uit-floating-popover', 'uit-floating-open');

  let frameId = 0;
  const updatePosition = () => {
    frameId = 0;
    if (!wrapper.isConnected || !wrapper.classList.contains('is-open')) return;
    const rect = trigger.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
      wrapper._uitCloseDropdown?.();
      return;
    }
    positionFloatingDropdown(trigger, popover, matchTriggerWidth);
  };
  const schedulePosition = () => {
    if (frameId) return;
    frameId = window.requestAnimationFrame(updatePosition);
  };
  const cleanup = () => {
    window.removeEventListener('resize', schedulePosition);
    document.removeEventListener('scroll', schedulePosition, true);
    if (frameId) window.cancelAnimationFrame(frameId);
    frameId = 0;
    popover._uitFloatingCleanup = null;
  };

  popover._uitFloatingCleanup = cleanup;
  window.addEventListener('resize', schedulePosition);
  document.addEventListener('scroll', schedulePosition, true);
  updatePosition();
}

function closeFloatingDropdown(wrapper, popover) {
  popover._uitFloatingCleanup?.();
  wrapper.classList.remove('is-open');
  popover.classList.remove('uit-floating-popover', 'uit-floating-open');
  popover.removeAttribute('data-placement');
  popover.style.removeProperty('top');
  popover.style.removeProperty('left');
  popover.style.removeProperty('min-width');
  wrapper.appendChild(popover);
}

function closeAllDropdowns(except = null) {
  document.querySelectorAll('.uit-select.is-open').forEach(el => {
    if (el !== except && !el.contains(except)) {
      if (typeof el._uitCloseDropdown === 'function') el._uitCloseDropdown();
      else el.classList.remove('is-open');
    }
  });

  document.querySelectorAll('.uit-date-picker.is-open').forEach(el => {
    if (el !== except && !el.contains(except)) {
      if (typeof el._uitCloseDropdown === 'function') el._uitCloseDropdown();
      else el.classList.remove('is-open');
    }
  });

  document.querySelectorAll('.uit-time-picker.is-open').forEach(el => {
    if (el !== except && !el.contains(except)) {
      if (typeof el._uitCloseDropdown === 'function') el._uitCloseDropdown();
      else el.classList.remove('is-open');
    }
  });

  const acc = document.getElementById('headerAccountWrapper');
  if (acc && acc !== except && !acc.contains(except)) {
    acc.classList.remove('open');
  }

  const themeWrapper = document.getElementById('themeModeWrapper');
  if (themeWrapper && themeWrapper !== except && !themeWrapper.contains(except)) {
    if (typeof toggleThemeDropdown === 'function') {
      toggleThemeDropdown(false);
    } else {
      elements.themeDropdownMenu?.classList.remove('show');
      elements.themeToggleBtn?.setAttribute('aria-expanded', 'false');
    }
  }

  const notifWrapper = document.getElementById('notificationWrapper');
  if (notifWrapper && notifWrapper !== except && !notifWrapper.contains(except)) {
    if (typeof window.closeNotificationDropdown === 'function') {
      window.closeNotificationDropdown();
    } else {
      document.getElementById('notificationDropdown')?.classList.remove('show');
      document.getElementById('notificationBtn')?.setAttribute('aria-expanded', 'false');
    }
  }
}
window.closeAllDropdowns = closeAllDropdowns;

// ==========================================
// UIT CUSTOM SELECT DROPDOWN COMPONENT
// ==========================================
function setupCustomSelect(select) {
  if (!select || select.dataset.uitCustom === 'true' || !select.parentNode) return;
  select.dataset.uitCustom = 'true';

  const wrapper = document.createElement('div');
  wrapper.className = 'uit-select';
  if (select.id) wrapper.dataset.selectId = select.id;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'uit-select-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  const ariaLabel = select.getAttribute('aria-label') || select.getAttribute('placeholder') || '';
  if (ariaLabel) trigger.setAttribute('aria-label', ariaLabel);

  const labelSpan = document.createElement('span');
  labelSpan.className = 'uit-select-label';

  const arrowSpan = document.createElement('span');
  arrowSpan.className = 'uit-select-arrow';
  arrowSpan.setAttribute('aria-hidden', 'true');
  arrowSpan.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';

  trigger.appendChild(labelSpan);
  trigger.appendChild(arrowSpan);

  const menu = document.createElement('div');
  menu.className = 'uit-select-menu';
  menu.setAttribute('role', 'listbox');

  wrapper.appendChild(trigger);
  wrapper.appendChild(menu);

  select.classList.add('uit-select-native-hidden');
  select.parentNode.insertBefore(wrapper, select.nextSibling);

  function renderItems() {
    menu.innerHTML = '';
    const options = Array.from(select.options);
    const selectedOption = options.find(o => o.selected) || options[0];

    options.forEach((opt, index) => {
      const item = document.createElement('div');
      item.className = 'uit-select-item';
      item.setAttribute('role', 'option');
      item.dataset.value = opt.value;
      item.dataset.index = String(index);

      const isSel = opt.selected || opt.value === select.value;
      if (isSel) {
        item.classList.add('is-selected');
        item.setAttribute('aria-selected', 'true');
      } else {
        item.setAttribute('aria-selected', 'false');
      }

      if (opt.disabled) {
        item.classList.add('is-disabled');
        item.setAttribute('aria-disabled', 'true');
      }

      const textSpan = document.createElement('span');
      textSpan.className = 'uit-select-item-text';
      textSpan.textContent = opt.text;

      item.appendChild(textSpan);

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        if (opt.disabled) return;
        selectValue(opt.value);
        closeDropdown();
        trigger.focus();
      });

      menu.appendChild(item);
    });

    labelSpan.textContent = selectedOption ? selectedOption.text : (options[0]?.text || '');
    wrapper.classList.toggle('is-disabled', Boolean(select.disabled));
    trigger.disabled = Boolean(select.disabled);
  }

  function selectValue(val) {
    if (select.value !== val) {
      select.value = val;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      select.dispatchEvent(new Event('input', { bubbles: true }));
    }
    syncSelection();
  }

  function syncSelection() {
    const selectedOpt = select.options[select.selectedIndex];
    labelSpan.textContent = selectedOpt ? selectedOpt.text : (select.options[0]?.text || '');
    menu.querySelectorAll('.uit-select-item').forEach(item => {
      const isSel = item.dataset.value === select.value;
      item.classList.toggle('is-selected', isSel);
      item.setAttribute('aria-selected', String(isSel));
    });
    wrapper.classList.toggle('is-disabled', Boolean(select.disabled));
    trigger.disabled = Boolean(select.disabled);
  }

  function openDropdown() {
    if (select.disabled) return;
    closeAllDropdowns(wrapper);
    openFloatingDropdown(wrapper, trigger, menu, true);
    trigger.setAttribute('aria-expanded', 'true');

    const activeItem = menu.querySelector('.uit-select-item.is-selected');
    if (activeItem) activeItem.scrollIntoView({ block: 'nearest' });
  }

  function closeDropdown() {
    closeFloatingDropdown(wrapper, menu);
    trigger.setAttribute('aria-expanded', 'false');
  }

  wrapper._uitCloseDropdown = closeDropdown;

  function toggleDropdown() {
    if (wrapper.classList.contains('is-open')) {
      closeDropdown();
    } else {
      openDropdown();
    }
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdown();
  });

  select.addEventListener('change', syncSelection);
  select.addEventListener('focus', () => trigger.focus());

  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => {
      renderItems();
    });
    observer.observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
  }

  trigger.addEventListener('keydown', (e) => {
    if (select.disabled) return;
    const isOpen = wrapper.classList.contains('is-open');
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      if (!isOpen) {
        openDropdown();
        return;
      }
      const items = Array.from(menu.querySelectorAll('.uit-select-item:not(.is-disabled)'));
      if (!items.length) return;
      const currentIdx = items.findIndex(item => item.classList.contains('is-selected') || item.classList.contains('is-focused'));
      let nextIdx = 0;
      if (e.key === 'ArrowDown') {
        nextIdx = currentIdx >= items.length - 1 ? 0 : currentIdx + 1;
      } else if (e.key === 'ArrowUp') {
        nextIdx = currentIdx <= 0 ? items.length - 1 : currentIdx - 1;
      } else if (e.key === 'Enter' || e.key === ' ') {
        const focused = menu.querySelector('.uit-select-item.is-focused') || items[currentIdx];
        if (focused) {
          selectValue(focused.dataset.value);
          closeDropdown();
        }
        return;
      }
      items.forEach(it => it.classList.remove('is-focused'));
      items[nextIdx].classList.add('is-focused');
      items[nextIdx].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Escape' && isOpen) {
      e.preventDefault();
      closeDropdown();
    }
  });

  renderItems();
}

function initCustomSelects(root = document) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const target = (root && typeof root.querySelectorAll === 'function') ? root : document;
  const eligibleSelects = target.querySelectorAll(
    'select:not([data-uit-custom="true"])'
  );

  eligibleSelects.forEach(select => {
    if (select.closest('template') || select.id === 'traineeSelect' || select.style?.display === 'none') return;
    setupCustomSelect(select);
  });
}

// ==========================================
// UIT CUSTOM DROPDOWN CALENDAR (SYNCFUSION STYLE)
// ==========================================
function setupCustomDatePicker(input) {
  if (!input || input.dataset.uitCustom === 'true' || !input.parentNode) return;
  input.dataset.uitCustom = 'true';

  const isMonthOnly = input.type === 'month';
  const wrapper = document.createElement('div');
  wrapper.className = 'uit-date-picker';
  if (input.id) wrapper.dataset.inputId = input.id;
  if (input.classList.contains('form-input')) wrapper.classList.add('form-input-datepicker');

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'uit-date-trigger';
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');

  const textSpan = document.createElement('span');
  textSpan.className = 'uit-date-display';

  const iconSpan = document.createElement('span');
  iconSpan.className = 'uit-date-icon';
  iconSpan.setAttribute('aria-hidden', 'true');
  iconSpan.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="18" y2="10"></line></svg>';

  trigger.appendChild(textSpan);
  trigger.appendChild(iconSpan);

  const popover = document.createElement('div');
  popover.className = 'uit-date-popover';
  popover.setAttribute('role', 'dialog');

  wrapper.appendChild(trigger);
  wrapper.appendChild(popover);

  input.classList.add('uit-date-native-hidden');
  input.parentNode.insertBefore(wrapper, input.nextSibling);

  input.addEventListener('focus', () => trigger.focus());

  function parseDateValue(val, isMonth) {
    if (!val) return null;
    if (isMonth) {
      const parts = val.split('-');
      if (parts.length === 2) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        if (!isNaN(y) && !isNaN(m)) return new Date(y, m, 1);
      }
    } else {
      const parts = val.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        if (!isNaN(y) && !isNaN(m) && !isNaN(d)) return new Date(y, m, d);
      }
    }
    return null;
  }

  function formatDisplayDate(val) {
    if (!val) return input.getAttribute('placeholder') || (isMonthOnly ? 'Chọn tháng...' : 'Chọn ngày...');
    if (isMonthOnly) {
      const parts = val.split('-');
      if (parts.length === 2) return `Tháng ${parts[1]}/${parts[0]}`;
    } else {
      const parts = val.split('-');
      if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return val;
  }

  let viewDate = new Date();
  const initParsed = parseDateValue(input.value, isMonthOnly);
  if (initParsed) viewDate = initParsed;
  let currentView = isMonthOnly ? 'months' : 'days';
  let yearPageStart = Math.floor(viewDate.getFullYear() / 12) * 12;

  function updateTriggerDisplay() {
    textSpan.textContent = formatDisplayDate(input.value);
    wrapper.classList.toggle('is-disabled', Boolean(input.disabled));
    trigger.disabled = Boolean(input.disabled);
  }

  function setDate(y, m, d) {
    const val = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    input.value = val;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    updateTriggerDisplay();
    closeCalendar();
  }

  function setMonth(y, m) {
    const val = `${y}-${String(m + 1).padStart(2, '0')}`;
    input.value = val;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    updateTriggerDisplay();
    if (isMonthOnly) {
      closeCalendar();
    } else {
      viewDate = new Date(y, m, 1);
      currentView = 'days';
      renderCalendar();
    }
  }

  const proto = HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  if (descriptor && !input._uitCalendarHooked) {
    input._uitCalendarHooked = true;
    Object.defineProperty(input, 'value', {
      get() { return descriptor.get.call(this); },
      set(val) {
        descriptor.set.call(this, val);
        updateTriggerDisplay();
        const p = parseDateValue(val, isMonthOnly);
        if (p) viewDate = p;
      }
    });
  }

  input.addEventListener('input', () => {
    updateTriggerDisplay();
    const p = parseDateValue(input.value, isMonthOnly);
    if (p) viewDate = p;
  });

  input.addEventListener('change', () => {
    updateTriggerDisplay();
    const p = parseDateValue(input.value, isMonthOnly);
    if (p) viewDate = p;
  });

  function renderCalendar() {
    popover.innerHTML = '';

    const y = viewDate.getFullYear();
    const m = viewDate.getMonth();
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === y && today.getMonth() === m;
    const selectedDate = parseDateValue(input.value, isMonthOnly);

    // 1. Header
    const header = document.createElement('div');
    header.className = 'uit-cal-header';

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'uit-cal-nav-btn';
    prevBtn.setAttribute('aria-label', 'Trước');
    prevBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>';

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'uit-cal-nav-btn';
    nextBtn.setAttribute('aria-label', 'Sau');
    nextBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';

    const titleBtn = document.createElement('button');
    titleBtn.type = 'button';
    titleBtn.className = 'uit-cal-title-btn';

    if (currentView === 'days') {
      titleBtn.textContent = `Tháng ${m + 1}, ${y}`;
      titleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        currentView = 'months';
        renderCalendar();
      });
      prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        viewDate = new Date(y, m - 1, 1);
        renderCalendar();
      });
      nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        viewDate = new Date(y, m + 1, 1);
        renderCalendar();
      });
    } else if (currentView === 'months') {
      titleBtn.textContent = `Năm ${y}`;
      titleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        yearPageStart = Math.floor(y / 12) * 12;
        currentView = 'years';
        renderCalendar();
      });
      prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        viewDate = new Date(y - 1, m, 1);
        renderCalendar();
      });
      nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        viewDate = new Date(y + 1, m, 1);
        renderCalendar();
      });
    } else {
      titleBtn.textContent = `${yearPageStart} - ${yearPageStart + 11}`;
      titleBtn.style.cursor = 'default';
      prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        yearPageStart -= 12;
        renderCalendar();
      });
      nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        yearPageStart += 12;
        renderCalendar();
      });
    }

    header.appendChild(prevBtn);
    header.appendChild(titleBtn);
    header.appendChild(nextBtn);
    popover.appendChild(header);

    // 2. Body View
    if (currentView === 'days') {
      const weekdays = document.createElement('div');
      weekdays.className = 'uit-cal-weekdays';
      ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].forEach(name => {
        const span = document.createElement('span');
        span.textContent = name;
        if (name === 'CN') span.classList.add('is-sunday');
        weekdays.appendChild(span);
      });
      popover.appendChild(weekdays);

      const daysGrid = document.createElement('div');
      daysGrid.className = 'uit-cal-days';

      const firstDayOfMonth = new Date(y, m, 1);
      const startDay = firstDayOfMonth.getDay();
      const startOffset = (startDay === 0 ? 6 : startDay - 1);

      const totalDays = new Date(y, m + 1, 0).getDate();
      const prevMonthDays = new Date(y, m, 0).getDate();

      for (let i = startOffset - 1; i >= 0; i--) {
        const d = prevMonthDays - i;
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'uit-cal-day is-other-month';
        cell.textContent = String(d);
        cell.addEventListener('click', (e) => {
          e.stopPropagation();
          const prevM = m === 0 ? 11 : m - 1;
          const prevY = m === 0 ? y - 1 : y;
          setDate(prevY, prevM, d);
        });
        daysGrid.appendChild(cell);
      }

      for (let d = 1; d <= totalDays; d++) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'uit-cal-day';
        cell.textContent = String(d);

        const isToday = isCurrentMonth && today.getDate() === d;
        if (isToday) cell.classList.add('is-today');

        const isSel = selectedDate && selectedDate.getFullYear() === y && selectedDate.getMonth() === m && selectedDate.getDate() === d;
        if (isSel) {
          cell.classList.add('is-selected');
          cell.setAttribute('aria-selected', 'true');
        }

        cell.addEventListener('click', (e) => {
          e.stopPropagation();
          setDate(y, m, d);
        });
        daysGrid.appendChild(cell);
      }

      const totalCells = startOffset + totalDays;
      const nextDays = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
      for (let d = 1; d <= nextDays; d++) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'uit-cal-day is-other-month';
        cell.textContent = String(d);
        cell.addEventListener('click', (e) => {
          e.stopPropagation();
          const nextM = m === 11 ? 0 : m + 1;
          const nextY = m === 11 ? y + 1 : y;
          setDate(nextY, nextM, d);
        });
        daysGrid.appendChild(cell);
      }

      popover.appendChild(daysGrid);

    } else if (currentView === 'months') {
      const monthGrid = document.createElement('div');
      monthGrid.className = 'uit-cal-month-grid';
      for (let mi = 0; mi < 12; mi++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'uit-cal-month-item';
        btn.textContent = `Tháng ${mi + 1}`;
        if (selectedDate && selectedDate.getFullYear() === y && selectedDate.getMonth() === mi) {
          btn.classList.add('is-selected');
        }
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          setMonth(y, mi);
        });
        monthGrid.appendChild(btn);
      }
      popover.appendChild(monthGrid);

    } else {
      const yearGrid = document.createElement('div');
      yearGrid.className = 'uit-cal-year-grid';
      for (let yi = yearPageStart; yi < yearPageStart + 12; yi++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'uit-cal-year-item';
        btn.textContent = String(yi);
        if (selectedDate && selectedDate.getFullYear() === yi) {
          btn.classList.add('is-selected');
        }
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          viewDate = new Date(yi, m, 1);
          currentView = isMonthOnly ? 'months' : 'days';
          renderCalendar();
        });
        yearGrid.appendChild(btn);
      }
      popover.appendChild(yearGrid);
    }

    // 3. Footer
    const footer = document.createElement('div');
    footer.className = 'uit-cal-footer';

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'uit-cal-footer-btn text-muted';
    clearBtn.textContent = 'Xóa';
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      updateTriggerDisplay();
      closeCalendar();
    });

    const todayBtn = document.createElement('button');
    todayBtn.type = 'button';
    todayBtn.className = 'uit-cal-footer-btn text-primary';
    todayBtn.textContent = isMonthOnly ? 'Tháng này' : 'Hôm nay';
    todayBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const n = new Date();
      if (isMonthOnly) {
        setMonth(n.getFullYear(), n.getMonth());
      } else {
        setDate(n.getFullYear(), n.getMonth(), n.getDate());
      }
    });

    footer.appendChild(clearBtn);
    footer.appendChild(todayBtn);
    popover.appendChild(footer);
  }

  function openCalendar() {
    if (input.disabled) return;
    closeAllDropdowns(wrapper);

    if (input.value) {
      const p = parseDateValue(input.value, isMonthOnly);
      if (p) viewDate = p;
    } else {
      viewDate = new Date();
    }
    currentView = isMonthOnly ? 'months' : 'days';
    renderCalendar();
    openFloatingDropdown(wrapper, trigger, popover);
    trigger.setAttribute('aria-expanded', 'true');
  }

  function closeCalendar() {
    closeFloatingDropdown(wrapper, popover);
    trigger.setAttribute('aria-expanded', 'false');
  }

  wrapper._uitCloseDropdown = closeCalendar;

  function toggleCalendar() {
    if (wrapper.classList.contains('is-open')) closeCalendar();
    else openCalendar();
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleCalendar();
  });

  updateTriggerDisplay();
}

function initCustomDatePickers(root = document) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const target = (root && typeof root.querySelectorAll === 'function') ? root : document;
  const eligibleInputs = target.querySelectorAll(
    'input[type="date"]:not([data-uit-custom="true"]), input[type="month"]:not([data-uit-custom="true"])'
  );
  eligibleInputs.forEach(input => {
    if (input.closest('template') || input.style?.display === 'none') return;
    setupCustomDatePicker(input);
  });
}

// ==========================================
// UIT CUSTOM DROPDOWN TIME PICKER
// ==========================================
function setupCustomTimePicker(input) {
  if (!input || input.dataset.uitCustom === 'true' || !input.parentNode) return;
  input.dataset.uitCustom = 'true';

  const wrapper = document.createElement('div');
  wrapper.className = 'uit-time-picker';
  if (input.id) wrapper.dataset.inputId = input.id;
  if (input.classList.contains('form-input')) wrapper.classList.add('form-input-timepicker');

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'uit-time-trigger';
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');

  const textSpan = document.createElement('span');
  textSpan.className = 'uit-time-display';

  const iconSpan = document.createElement('span');
  iconSpan.className = 'uit-time-icon';
  iconSpan.setAttribute('aria-hidden', 'true');
  iconSpan.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>';

  trigger.appendChild(textSpan);
  trigger.appendChild(iconSpan);

  const popover = document.createElement('div');
  popover.className = 'uit-time-popover';
  popover.setAttribute('role', 'dialog');

  wrapper.appendChild(trigger);
  wrapper.appendChild(popover);

  input.classList.add('uit-time-native-hidden');
  input.parentNode.insertBefore(wrapper, input.nextSibling);

  input.addEventListener('focus', () => trigger.focus());

  function parseTime(val) {
    if (!val || typeof val !== 'string') return { hour: '23', minute: '59' };
    const parts = val.split(':');
    let h = parseInt(parts[0], 10);
    let m = parseInt(parts[1], 10);
    if (isNaN(h) || h < 0 || h > 23) h = 23;
    if (isNaN(m) || m < 0 || m > 59) m = 59;
    return {
      hour: String(h).padStart(2, '0'),
      minute: String(m).padStart(2, '0')
    };
  }

  function formatTimeValue(h, m) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function updateTriggerDisplay() {
    const val = input.value;
    textSpan.textContent = val || input.getAttribute('placeholder') || '--:--';
    wrapper.classList.toggle('is-disabled', Boolean(input.disabled));
    trigger.disabled = Boolean(input.disabled);
  }

  function setTime(h, m) {
    const val = formatTimeValue(h, m);
    input.value = val;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    updateTriggerDisplay();
    highlightActiveTime();
  }

  const proto = HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  if (descriptor && !input._uitTimeHooked) {
    input._uitTimeHooked = true;
    Object.defineProperty(input, 'value', {
      get() { return descriptor.get.call(this); },
      set(val) {
        descriptor.set.call(this, val);
        updateTriggerDisplay();
        highlightActiveTime();
      }
    });
  }

  input.addEventListener('input', () => {
    updateTriggerDisplay();
    highlightActiveTime();
  });
  input.addEventListener('change', () => {
    updateTriggerDisplay();
    highlightActiveTime();
  });

  if (input.form) {
    input.form.addEventListener('reset', () => {
      setTimeout(() => {
        updateTriggerDisplay();
        highlightActiveTime();
      }, 0);
    });
  }

  function renderPopover() {
    popover.innerHTML = '';

    // 1. Presets header
    const presetsDiv = document.createElement('div');
    presetsDiv.className = 'uit-time-presets';
    const presets = [
      { label: '23:59', val: '23:59', title: 'Cuối ngày (Deadline)' },
      { label: '21:30', val: '21:30', title: 'Kết thúc ca tối' },
      { label: '19:30', val: '19:30', title: 'Bắt đầu ca tối' },
      { label: '17:00', val: '17:00', title: 'Tan học chiều' },
      { label: '12:00', val: '12:00', title: 'Nghỉ trưa' }
    ];
    presets.forEach(p => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'uit-time-chip';
      chip.textContent = p.label;
      chip.title = p.title;
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        const parts = p.val.split(':');
        setTime(parts[0], parts[1]);
        scrollToActive();
      });
      presetsDiv.appendChild(chip);
    });
    popover.appendChild(presetsDiv);

    // 2. Columns Body (Hours & Minutes)
    const body = document.createElement('div');
    body.className = 'uit-time-body';

    // Hours column
    const hCol = document.createElement('div');
    hCol.className = 'uit-time-col uit-time-col-hours';
    const hHeader = document.createElement('div');
    hHeader.className = 'uit-time-col-header';
    hHeader.textContent = 'Giờ';
    const hList = document.createElement('div');
    hList.className = 'uit-time-list uit-time-hours-list';
    hList.setAttribute('role', 'listbox');

    for (let h = 0; h < 24; h++) {
      const hStr = String(h).padStart(2, '0');
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'uit-time-item';
      item.dataset.hour = hStr;
      item.textContent = hStr;
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const cur = parseTime(input.value);
        setTime(hStr, cur.minute);
      });
      hList.appendChild(item);
    }
    hCol.appendChild(hHeader);
    hCol.appendChild(hList);

    // Separator
    const sep = document.createElement('div');
    sep.className = 'uit-time-separator';
    sep.textContent = ':';

    // Minutes column
    const mCol = document.createElement('div');
    mCol.className = 'uit-time-col uit-time-col-minutes';
    const mHeader = document.createElement('div');
    mHeader.className = 'uit-time-col-header';
    mHeader.textContent = 'Phút';
    const mList = document.createElement('div');
    mList.className = 'uit-time-list uit-time-minutes-list';
    mList.setAttribute('role', 'listbox');

    for (let m = 0; m < 60; m++) {
      const mStr = String(m).padStart(2, '0');
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'uit-time-item';
      item.dataset.minute = mStr;
      item.textContent = mStr;
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const cur = parseTime(input.value);
        setTime(cur.hour, mStr);
      });
      mList.appendChild(item);
    }
    mCol.appendChild(mHeader);
    mCol.appendChild(mList);

    body.appendChild(hCol);
    body.appendChild(sep);
    body.appendChild(mCol);
    popover.appendChild(body);

    // 3. Footer
    const footer = document.createElement('div');
    footer.className = 'uit-time-footer';

    const nowBtn = document.createElement('button');
    nowBtn.type = 'button';
    nowBtn.className = 'uit-time-footer-btn text-muted';
    nowBtn.textContent = 'Hiện tại';
    nowBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const n = new Date();
      setTime(n.getHours(), n.getMinutes());
      scrollToActive();
    });

    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'uit-time-footer-btn text-primary';
    doneBtn.textContent = 'Xong';
    doneBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTimePicker();
    });

    footer.appendChild(nowBtn);
    footer.appendChild(doneBtn);
    popover.appendChild(footer);

    highlightActiveTime();
  }

  function highlightActiveTime() {
    const cur = parseTime(input.value);
    popover.querySelectorAll('.uit-time-chip').forEach(c => {
      c.classList.toggle('is-selected', c.textContent.trim() === `${cur.hour}:${cur.minute}`);
    });
    popover.querySelectorAll('.uit-time-hours-list .uit-time-item').forEach(it => {
      const isSel = it.dataset.hour === cur.hour;
      it.classList.toggle('is-selected', isSel);
      it.setAttribute('aria-selected', String(isSel));
    });
    popover.querySelectorAll('.uit-time-minutes-list .uit-time-item').forEach(it => {
      const isSel = it.dataset.minute === cur.minute;
      it.classList.toggle('is-selected', isSel);
      it.setAttribute('aria-selected', String(isSel));
    });
  }

  function scrollToActive() {
    setTimeout(() => {
      const selHour = popover.querySelector('.uit-time-hours-list .uit-time-item.is-selected');
      if (selHour) selHour.scrollIntoView({ block: 'center' });
      const selMin = popover.querySelector('.uit-time-minutes-list .uit-time-item.is-selected');
      if (selMin) selMin.scrollIntoView({ block: 'center' });
    }, 10);
  }

  function openTimePicker() {
    if (input.disabled) return;
    closeAllDropdowns(wrapper);

    renderPopover();
    openFloatingDropdown(wrapper, trigger, popover);
    trigger.setAttribute('aria-expanded', 'true');

    scrollToActive();
  }

  function closeTimePicker() {
    closeFloatingDropdown(wrapper, popover);
    trigger.setAttribute('aria-expanded', 'false');
  }

  wrapper._uitCloseDropdown = closeTimePicker;

  function toggleTimePicker() {
    if (wrapper.classList.contains('is-open')) closeTimePicker();
    else openTimePicker();
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleTimePicker();
  });

  updateTriggerDisplay();
}

function initCustomTimePickers(root = document) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const target = (root && typeof root.querySelectorAll === 'function') ? root : document;
  const eligibleInputs = target.querySelectorAll(
    'input[type="time"]:not([data-uit-custom="true"])'
  );
  eligibleInputs.forEach(input => {
    if (input.closest('template') || input.style?.display === 'none') return;
    setupCustomTimePicker(input);
  });
}

if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
  const bodySelectObserver = new MutationObserver((mutations) => {
    let shouldScan = false;
    for (const m of mutations) {
      if (m.addedNodes.length) {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1 && (
            node.tagName === 'SELECT' ||
            node.tagName === 'INPUT' ||
            (node.querySelector && (node.querySelector('select') || node.querySelector('input[type="date"], input[type="month"], input[type="time"]')))
          )) {
            shouldScan = true;
            break;
          }
        }
      }
      if (shouldScan) break;
    }
    if (shouldScan) {
      initCustomSelects();
      initCustomDatePickers();
      initCustomTimePickers();
    }
  });
  if (document.body) {
    bodySelectObserver.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      bodySelectObserver.observe(document.body, { childList: true, subtree: true });
    });
  }
}

window.initCustomSelects = initCustomSelects;
window.initCustomDatePickers = initCustomDatePickers;
window.initCustomTimePickers = initCustomTimePickers;

// ==========================================
// TAB SWITCHING
// ==========================================
function switchTab(tab, updateHash = true) {
  if (state.activeTab === 'grades' && tab !== 'grades' && typeof window.hasUnsavedGradeChanges === 'function' && window.hasUnsavedGradeChanges()) {
    const confirmLeave = window.confirm('Bạn có thay đổi điểm số chưa lưu. Bạn có chắc chắn muốn rời khỏi trang mà không lưu không?');
    if (!confirmLeave) {
      if (elements.navGrades) elements.navGrades.classList.add('active');
      if (window.location.hash !== '#grades') {
        history.replaceState(null, '', '#grades');
      }
      return;
    }
    const container = document.getElementById('gradesSessionsList');
    if (container) {
      container.querySelectorAll('.inline-grade-star, .inline-grade-status, .inline-grade-note').forEach(el => {
        el.setAttribute('data-initial', el.value);
      });
    }
  }

  state.activeTab = tab;
  try {
    sessionStorage.setItem('uit_portal_active_tab', tab);
    if (updateHash && window.location.hash.replace('#', '') !== tab) {
      history.replaceState(null, '', '#' + tab);
    }
  } catch (e) {}

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

  if (tab === 'dashboard') {
    return switchTab('schedule');
  }

  if (tab === 'profile') {
    const canViewManagedProfile = canManage('trainees:manage') && Boolean(state.profileTargetId);
    if (state.currentUser?.role !== 'trainee' && !canViewManagedProfile) {
      return switchTab('schedule');
    }

    if (elements.navProfile) elements.navProfile.classList.add('active');
    if (elements.viewProfile) elements.viewProfile.classList.add('active');

    elements.pageMainTitle.textContent = 'Hồ sơ cá nhân';
    elements.pageSubBreadcrumb.textContent = 'Thông tin học viên, tài khoản & lịch sử hoạt động';

    renderProfileView(state.profileTargetId || undefined);
  } else if (tab === 'schedule') {
    if (elements.navSchedule) elements.navSchedule.classList.add('active');
    if (elements.viewSchedule) elements.viewSchedule.classList.add('active');

    elements.pageMainTitle.textContent = 'Thời khóa biểu';
    elements.pageSubBreadcrumb.textContent = 'Lịch học và hoạt động của Trainee Program';

    renderScheduleView();
  } else if (tab === 'assignments') {
    if (!state.currentUser) {
      if (window.showToast) {
        window.showToast('Vui lòng đăng nhập tài khoản để xem phần bài tập!', 'info');
      }
      try {
        sessionStorage.setItem('uit_portal_active_tab', 'schedule');
      } catch (e) {}
      if (typeof openLoginModal === 'function') {
        openLoginModal('assignments');
      }
      return switchTab('schedule', false);
    }

    if (elements.navAssignments) elements.navAssignments.classList.add('active');
    if (elements.viewAssignments) elements.viewAssignments.classList.add('active');

    elements.pageMainTitle.textContent = 'Bài tập rèn luyện';
    elements.pageSubBreadcrumb.textContent = 'Bài tập và ghi nhận bài nộp Trainee Program';
    if (canManage('assignments:manage')) renderAdminAssignmentsTable();

    if (window.initDuolingoModule) {
      window.initDuolingoModule();
    }
  } else if (tab === 'leaderboard') {
    if (elements.navLeaderboard) elements.navLeaderboard.classList.add('active');
    if (elements.viewLeaderboard) elements.viewLeaderboard.classList.add('active');

    elements.pageMainTitle.textContent = 'Bảng Xếp Hạng Trainee';
    elements.pageSubBreadcrumb.textContent = 'Tổng hợp thành tích & đánh giá năng lực Trainee';

    loadTrainees().then(() => { renderLeaderboard(); if (canManage('trainees:manage')) renderAdminTable(); });
  } else if (tab === 'grades') {
    if (elements.navGrades) elements.navGrades.classList.add('active');
    if (elements.viewGrades) elements.viewGrades.classList.add('active');

    elements.pageMainTitle.textContent = 'Bảng Điểm Sao Chi Tiết';
    elements.pageSubBreadcrumb.textContent = 'Theo dõi chi tiết số sao cộng thêm của từng Trainee sau mỗi buổi học thực tế';

    renderGradesView();
  } else if (tab === 'leave') {
    if (!state.currentUser) {
      window.showToast?.('Vui lòng đăng nhập tài khoản để sử dụng chức năng xin nghỉ.', 'info');
      try {
        sessionStorage.setItem('uit_portal_active_tab', 'schedule');
      } catch (e) {}
      if (typeof openLoginModal === 'function') {
        openLoginModal('leave');
      }
      return switchTab('schedule', false);
    }
    if (!['trainee', 'admin'].includes(state.currentUser.role)) {
      window.showToast?.('Tài khoản không có quyền truy cập đơn xin nghỉ.', 'warning');
      return switchTab('schedule');
    }
    if (elements.navLeave) elements.navLeave.classList.add('active');
    if (elements.viewLeave) elements.viewLeave.classList.add('active');

    elements.pageMainTitle.textContent = 'Đơn Xin Nghỉ Học';
    elements.pageSubBreadcrumb.textContent = 'Đơn xin phép vắng mặt buổi học trực tuyến Trainee Program UIT';

    renderLeaveView();
  } else if (tab === 'questions') {
    if (elements.navQuestions) elements.navQuestions.classList.add('active');
    if (elements.viewQuestions) elements.viewQuestions.classList.add('active');

    elements.pageMainTitle.textContent = 'Hỏi đáp';
    elements.pageSubBreadcrumb.textContent = 'Trao đổi với Trainer';

    renderQuestionsView();
  } else if (tab === 'admin') {
    // SECURITY CHECK: Only allow admin role
    if (!canManage('accounts:manage')) {
      if (window.showToast) {
        window.showToast('Chỉ Quản trị viên (Admin) mới có quyền truy cập trang này!', 'warning');
      }
      switchTab('schedule');
      return;
    }

    if (elements.navAdmin) elements.navAdmin.classList.add('active');
    if (elements.viewAdmin) elements.viewAdmin.classList.add('active');

    elements.pageMainTitle.textContent = 'Tài khoản và phân quyền';
    elements.pageSubBreadcrumb.textContent = 'Quản lý tài khoản, khóa truy cập và cấp quyền chỉnh sửa';

    renderAdminView();
  }

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Cập nhật custom dropdown cho tab mới
  setTimeout(initCustomSelects, 60);
  setTimeout(initCustomDatePickers, 60);
  setTimeout(initCustomTimePickers, 60);

  // Close mobile sidebar if open
  elements.sidebar.classList.remove('mobile-open');
}


// Expose to global window
window.switchTab = switchTab;
window.setupEventListeners = setupEventListeners;
