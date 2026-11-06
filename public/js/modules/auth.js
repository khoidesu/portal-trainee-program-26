/**
 * ==============================================================================
 * COMPONENT: Auth Module (Quản Lý Xác Thực & Phân Quyền Người Dùng)
 * CHỨC NĂNG CHÍNH: Xử lý trạng thái đăng nhập, xác thực quyền Admin / Trainee,
 *                  đồng bộ token JWT và điều hướng giao diện theo role.
 * LIÊN KẾT & PHỤ THUỘC: public/js/modules/core.js, public/login.html, localStorage
 * NHIỆM VỤ CHI TIẾT:
 *   - initAuth: Đọc token và user từ localStorage, phân quyền hiển thị
 *   - updateAuthUI: Hiển thị / ẩn menu Admin trên sidebar và navbar
 *   - logout: Xóa token JWT, dọn dẹp state và chuyển hướng về trang login
 *   - Chặn truy cập trái phép vào các tab dành riêng cho Quản trị viên
 * ==============================================================================
 */

// ==========================================
// AUTHENTICATION & ACCESS CONTROL
// ==========================================

let authSessionSyncPromise = null;
let authSessionListenersBound = false;
let lastAuthSessionSyncAt = 0;

function getAuthLandingTab(user) {
  if (!user) return 'schedule';
  if (user.isOwner || user.permissions?.includes('accounts:manage')) return 'admin';
  if (user.role === 'trainee') return 'profile';
  return 'schedule';
}

let privateUiKey = null;

function getPrivateUiKey(user) {
  if (!user) return '';
  return [user.username, user.role, user.isOwner ? 1 : 0, user.mustChangePassword ? 1 : 0, [...(user.permissions || [])].sort().join(',')].join('|');
}

function loadPrivateScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Không tải được tài nguyên.'));
    document.head.appendChild(script);
  });
}

// Giao diện và script dành riêng cho Trainee/Admin chỉ được máy chủ gửi sau khi xác thực đúng quyền.
async function loadPrivateUi(user) {
  privateUiKey = getPrivateUiKey(user);
  if (!user) return;
  const response = await fetch('/api/ui', { cache: 'no-store', credentials: 'same-origin' });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || 'Không tải được giao diện.');
  document.querySelectorAll('template[data-private-slot]').forEach(slot => {
    const html = result.data.slots[slot.dataset.privateSlot];
    if (!html) return;
    const holder = document.createElement('template');
    holder.innerHTML = html;
    slot.replaceWith(holder.content);
  });
  for (const src of result.data.scripts) await loadPrivateScript(src);
}

async function bootstrapSession() {
  let user = null;
  try {
    const response = await fetch('/api/auth/me', { cache: 'no-store', credentials: 'same-origin' });
    const result = await response.json();
    if (response.ok && result.success) user = result.user || null;
  } catch {}
  state.currentUser = user;
  try {
    await loadPrivateUi(user);
  } catch {
    window.showToast?.('Chưa tải được một số chức năng dành cho tài khoản. Vui lòng tải lại trang.', 'danger');
  }
  document.querySelectorAll('template[data-private-slot]').forEach(slot => slot.remove());
}

async function refreshAuthSession(redirectOnLogin = false) {
  if (authSessionSyncPromise) return authSessionSyncPromise;
  authSessionSyncPromise = (async () => {
    const previousUser = state.currentUser;
    let nextUser = previousUser || null;
    try {
      // Chỉ tin vào phản hồi của máy chủ (cookie HttpOnly). Không dùng token/cache trong storage.
      const response = await fetch('/api/auth/me', {
        cache: 'no-store',
        credentials: 'same-origin'
      });
      const result = await response.json();
      if (response.ok && result.success) {
        nextUser = result.user || null;
      } else if (response.status === 401) {
        nextUser = null;
      }
    } catch {}
    clearLegacyAuthStorage();

    if (state.authInitialized && getPrivateUiKey(nextUser) !== privateUiKey) {
      window.location.reload();
      return Boolean(nextUser);
    }

    state.currentUser = nextUser;
    renderAuthState();

    if (nextUser?.mustChangePassword && !nextUser.isOwner && typeof openChangePasswordModal === 'function') {
      openChangePasswordModal();
    }

    const identityChanged = nextUser && (!previousUser || previousUser.username !== nextUser.username || previousUser.role !== nextUser.role);
    if (redirectOnLogin && identityChanged && typeof switchTab === 'function') {
      switchTab(getAuthLandingTab(nextUser));
    }
    return Boolean(nextUser);
  })().finally(() => {
    authSessionSyncPromise = null;
  });
  return authSessionSyncPromise;
}

// Dọn token/cache cũ còn sót trong trình duyệt từ phiên bản trước.
function clearLegacyAuthStorage() {
  try {
    for (const key of ['uit_trainee_auth_token', 'uit_auth_user_cache', 'uit_trainee_auth_user']) {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    }
  } catch {}
}

async function initAuth() {
  clearLegacyAuthStorage();
  await refreshAuthSession(false);
  state.authInitialized = true;
  return Boolean(state.currentUser);
}

function setupAuthSessionSync() {
  if (authSessionListenersBound) return;
  authSessionListenersBound = true;
  const sync = () => {
    if (document.visibilityState === 'hidden' || Date.now() - lastAuthSessionSyncAt < 500) return;
    lastAuthSessionSyncAt = Date.now();
    refreshAuthSession(true).catch(() => {});
  };
  window.addEventListener('pageshow', sync);
  window.addEventListener('focus', sync);
  document.addEventListener('visibilitychange', sync);
}

function renderAuthState() {
  const u = state.currentUser;
  const isTrainee = Boolean(u && u.role === 'trainee');
  const isAdmin = Boolean(u && u.role !== 'trainee');
  const canAccessAdmin = Boolean(u && (u.isOwner || u.role === 'admin' || canManage('accounts:manage')));
  const isLoggedIn = Boolean(u);

  // 1. Sidebar Sections: Luôn hiển thị Học vụ cho Trainee, Quản trị Admin chỉ hiển thị khi đã đăng nhập Admin
  if (elements.studentOnlyNavSections) {
    elements.studentOnlyNavSections.style.display = 'block';
  }
  // Nhóm Hồ sơ cá nhân chỉ hiển thị khi đã đăng nhập (không xuất hiện ở chế độ web khách)
  if (elements.profileNavGroupLabel) {
    elements.profileNavGroupLabel.style.display = isTrainee ? 'block' : 'none';
  }
  if (elements.profileNavList) {
    elements.profileNavList.style.display = isTrainee ? 'block' : 'none';
  }
  if (elements.adminNavGroupLabel) {
    elements.adminNavGroupLabel.style.display = canAccessAdmin ? 'block' : 'none';
  }
  if (elements.adminNavList) {
    elements.adminNavList.style.display = canAccessAdmin ? 'block' : 'none';
  }
  if (elements.menuBtnGoAdmin) {
    elements.menuBtnGoAdmin.style.display = canAccessAdmin ? 'flex' : 'none';
  }
  if (elements.menuBtnOpenChangePassword) {
    elements.menuBtnOpenChangePassword.style.display = u && !u.isOwner ? 'flex' : 'none';
  }

  // 2. Sidebar Login vs Logout items
  if (elements.sidebarLoginItem) {
    elements.sidebarLoginItem.style.display = isLoggedIn ? 'none' : 'block';
  }
  if (elements.sidebarLogoutItem) {
    elements.sidebarLogoutItem.style.display = isLoggedIn ? 'block' : 'none';
  }

  // 3. Header Buttons: Login vs Status & Logout
  if (elements.openLoginModalBtn) {
    elements.openLoginModalBtn.style.display = isLoggedIn ? 'none' : 'inline-flex';
  }
  const headerUserStatus = document.getElementById('headerUserStatus');
  if (headerUserStatus) {
    headerUserStatus.style.display = isLoggedIn ? 'inline-flex' : 'none';
  }
  const headerAdminBadge = document.getElementById('headerAdminStatus');
  if (headerAdminBadge) {
    headerAdminBadge.style.display = isAdmin && canAccessAdmin ? 'inline-flex' : 'none';
  }
  const headerTraineeBadge = document.getElementById('headerTraineeBadge');
  const headerTraineeBadgeName = document.getElementById('headerTraineeBadgeName');
  if (headerTraineeBadge) {
    headerTraineeBadge.style.display = isTrainee ? 'inline-flex' : 'none';
    if (headerTraineeBadgeName && isTrainee) {
      headerTraineeBadgeName.textContent = u.fullName ? `${u.fullName}` : 'Hồ sơ Trainee';
    }
  }
  if (elements.headerLogoutBtn) {
    elements.headerLogoutBtn.style.display = isLoggedIn ? 'inline-flex' : 'none';
  }

  // 4. Header User Profile Pill
  if (elements.headerAccountPill) {
    if (isAdmin) {
      elements.headerAccountPill.classList.add('is-admin');
      if (elements.headerAccountAvatar) {
        elements.headerAccountAvatar.style.background = 'transparent';
        elements.headerAccountAvatar.innerHTML = `<img src="${getAdminAvatar()}" alt="Admin" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
      }
      if (elements.headerAccountName) elements.headerAccountName.textContent = u.fullName || 'Quản Trị Viên (Admin)';
      if (elements.headerAccountId) elements.headerAccountId.textContent = 'Quản trị hệ thống';
      if (elements.menuAccountName) elements.menuAccountName.textContent = u.fullName || 'Admin';
      if (elements.menuAccountRole) elements.menuAccountRole.textContent = u.isOwner ? 'Quản trị gốc' : u.role === 'admin' ? 'Quản trị nội dung' : 'Trainer';
      if (elements.menuBtnOpenLogin) elements.menuBtnOpenLogin.style.display = 'none';
      if (elements.menuBtnGoProfile) elements.menuBtnGoProfile.style.display = 'none';
      if (elements.menuBtnLogout) elements.menuBtnLogout.style.display = 'flex';
      if (elements.menuBtnGoAdmin) elements.menuBtnGoAdmin.style.display = canManage('accounts:manage') ? 'flex' : 'none';
    } else if (isTrainee) {
      elements.headerAccountPill.classList.remove('is-admin');
      const avatarUrl = u.avatar || getTraineeDicebearAvatar(u);
      if (elements.headerAccountAvatar) {
        elements.headerAccountAvatar.style.background = 'transparent';
        elements.headerAccountAvatar.innerHTML = `<img src="${avatarUrl}" alt="${escapeHtml(u.fullName || 'Trainee')}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
      }
      if (elements.headerAccountName) {
        elements.headerAccountName.textContent = u.fullName || u.username;
      }
      if (elements.headerAccountId) {
        elements.headerAccountId.textContent = `MSSV: ${u.traineeId || u.username}`;
      }
      if (elements.menuAccountName) {
        elements.menuAccountName.textContent = u.fullName || u.username;
      }
      if (elements.menuAccountRole) {
        elements.menuAccountRole.textContent = `Trainee UIT (MSSV: ${u.traineeId || u.username})`;
      }
      if (elements.menuBtnOpenLogin) elements.menuBtnOpenLogin.style.display = 'none';
      if (elements.menuBtnGoProfile) elements.menuBtnGoProfile.style.display = 'flex';
      if (elements.menuBtnLogout) elements.menuBtnLogout.style.display = 'flex';
      if (elements.menuBtnGoAdmin) elements.menuBtnGoAdmin.style.display = 'none';
    } else {
      // Chế độ xem dành cho Khách (Chưa đăng nhập)
      elements.headerAccountPill.classList.remove('is-admin');
      const activeTrainee = state.currentTrainee;
      const avatarUrl = activeTrainee
        ? getTraineeDicebearAvatar(activeTrainee)
        : getTraineeDicebearAvatar('guest');

      if (elements.headerAccountAvatar) {
        elements.headerAccountAvatar.style.background = 'transparent';
        elements.headerAccountAvatar.innerHTML = `<img src="${avatarUrl}" alt="Student Avatar" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
      }
      if (elements.headerAccountName) {
        elements.headerAccountName.textContent = activeTrainee ? activeTrainee.fullName : 'Trainee';
      }
      const showMssv = Boolean(window.canViewMssv && window.canViewMssv());
      if (elements.headerAccountId) {
        elements.headerAccountId.textContent = activeTrainee ? (showMssv ? `MSSV: ${activeTrainee.traineeId}` : (activeTrainee.track || 'Cổng thông tin Trainee')) : 'Xem lịch & thứ hạng';
      }
      if (elements.menuAccountName) {
        elements.menuAccountName.textContent = activeTrainee ? activeTrainee.fullName : 'Khách / Trainee UIT';
      }
      if (elements.menuAccountRole) {
        elements.menuAccountRole.textContent = activeTrainee ? (showMssv ? `Trainee (MSSV: ${activeTrainee.traineeId})` : 'Trainee UIT') : 'Chế độ xem mở - Không cần đăng nhập';
      }
      if (elements.menuBtnOpenLogin) elements.menuBtnOpenLogin.style.display = 'flex';
      if (elements.menuBtnOpenLoginText) elements.menuBtnOpenLoginText.textContent = 'Đăng nhập';
      if (elements.menuBtnGoProfile) elements.menuBtnGoProfile.style.display = 'none';
      if (elements.menuBtnLogout) elements.menuBtnLogout.style.display = 'none';
      if (elements.menuBtnGoAdmin) elements.menuBtnGoAdmin.style.display = 'none';
    }
  }

  // 5. Profile banner greeting tag
  if (elements.studentGreetingTag) {
    elements.studentGreetingTag.textContent = isAdmin ? 'QUẢN TRỊ VIÊN,' : 'Trainee,';
  }

  // 6. Cập nhật quyền hiển thị các phần tử chỉ dành cho Admin (admin-only-element)
  document.querySelectorAll('.admin-only-element').forEach(el => {
    if (el === headerAdminBadge || el === elements.adminNavGroupLabel || el === elements.adminNavList) return;
    const page = el.closest?.('[id^="view"]')?.id;
    const permission = el.dataset.permission || ({ viewSchedule: 'schedules:manage', viewQuestions: 'questions:manage', viewAssignments: 'assignments:manage', viewGrades: 'attendance:manage', viewLeaderboard: 'trainees:manage' })[page];
    el.style.display = permission ? (canManage(permission) ? '' : 'none') : (isAdmin ? '' : 'none');
  });

  document.querySelectorAll('[data-permission]').forEach(element => {
    if (element === headerAdminBadge || element === elements.adminNavGroupLabel || element === elements.adminNavList) return;
    element.style.display = canManage(element.dataset.permission) ? '' : 'none';
  });
  const manager = window.duolingoManager;
  if (manager) {
    manager.renderPath();
    if (manager.selectedAssignment?.status === 'locked' && !canManage('assignments:manage')) {
      document.getElementById('duoAssignmentModal')?.classList.remove('active');
      manager.selectedAssignment = null;
    }
  }

  // Người dùng thường không thể truy cập tab admin
  if (!canManage('accounts:manage') && state.activeTab === 'admin') {
    switchTab('schedule');
  }
  if (!isTrainee && state.activeTab === 'profile' && !(canManage('trainees:manage') && state.profileTargetId)) switchTab('schedule');
  if (!state.currentUser && state.activeTab === 'assignments') switchTab('schedule');

  if (typeof renderScheduleView === 'function') renderScheduleView(false);
  if (typeof renderGradesView === 'function') renderGradesView(false);
  if (typeof renderLeaderboardTable === 'function') renderLeaderboardTable();
  if (typeof renderLeaveHistoryTable === 'function') renderLeaveHistoryTable();
  if (typeof renderQuestionsList === 'function') renderQuestionsList();
  if (window.syncNotificationBell) window.syncNotificationBell();
}

function getInitials(name) {
  if (!name) return 'SV';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function openLoginModal(targetTab) {
  const fromTab = targetTab || (window.state && window.state.activeTab) || window.location.hash.replace('#', '') || 'schedule';
  try {
    sessionStorage.setItem('uit_login_from_tab', fromTab);
  } catch (e) {}
  window.location.href = '/login?from=' + encodeURIComponent(fromTab);
}

function closeLoginModal() {
  // Modal has been migrated to dedicated /login page
}

async function handleLogout() {
  try {
    const response = await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: '{}' });
    if (!response.ok) throw new Error();
  } catch {
    window.showToast?.('Chưa đăng xuất được. Vui lòng thử lại.', 'danger');
    return;
  }
  clearLegacyAuthStorage();
  try {
    sessionStorage.removeItem('uit_portal_active_tab');
    history.replaceState(null, '', '#schedule');
  } catch (e) {}
  window.location.reload();
}


function openChangePasswordModal() {
  if (!elements.changePasswordModal) return;
  elements.changePasswordForm?.reset();
  elements.changePasswordModal.classList.add('open', 'show');
  elements.changePassCurrent?.focus();
}

function closeChangePasswordModal() {
  elements.changePasswordModal?.classList.remove('open', 'show');
}

async function handleChangePasswordSubmit(e) {
  e.preventDefault();
  const currentPass = elements.changePassCurrent?.value || '';
  const newPass = elements.changePassNew?.value || '';
  const confirmPass = elements.changePassConfirm?.value || '';
  const minLen = 8;
  const fail = message => window.showToast ? window.showToast(message, 'danger') : alert(message);

  if (newPass !== confirmPass) return fail('Mật khẩu xác nhận không khớp với mật khẩu mới.');
  if (newPass.length < minLen) return fail(`Mật khẩu mới cần tối thiểu ${minLen} ký tự.`);

  const res = await window.API.changePassword(state.currentUser?.traineeId, currentPass, newPass);
  if (!res?.success) return fail(res?.message || 'Đổi mật khẩu thất bại, vui lòng kiểm tra lại mật khẩu hiện tại.');

  closeChangePasswordModal();
  state.currentUser = null;
  window.location.href = '/login';
}

function checkAdminAuth() {
  const u = state.currentUser;
  return Boolean(u && (u.isOwner || u.role === 'admin' || canManage('accounts:manage')));
}

function updateAuthUI() {
  renderAuthState();
}

// Expose to global window
window.initAuth = initAuth;
window.bootstrapSession = bootstrapSession;
window.refreshAuthSession = refreshAuthSession;
window.setupAuthSessionSync = setupAuthSessionSync;
window.checkAdminAuth = checkAdminAuth;
window.openChangePasswordModal = openChangePasswordModal;
window.closeChangePasswordModal = closeChangePasswordModal;
window.handleChangePasswordSubmit = handleChangePasswordSubmit;
window.logout = handleLogout;
window.handleLogout = handleLogout;
window.updateAuthUI = updateAuthUI;
window.checkAdminAuth = checkAdminAuth;
window.openLoginModal = openLoginModal;
window.closeLoginModal = closeLoginModal;
