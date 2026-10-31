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

async function initAuth() {
  try {
    localStorage.removeItem('uit_trainee_auth_token');
    localStorage.removeItem('uit_trainee_auth_user');
    const response = await fetch('/api/auth/me', { cache: 'no-store' });
    const result = await response.json();
    state.currentUser = response.ok ? result.user : null;
  } catch {
    state.currentUser = null;
  }
  // Khách & Trainee truy cập trực tiếp, KHÔNG chuyển hướng sang /login
  renderAuthState();
  return true;
}

function renderAuthState() {
  const u = state.currentUser;
  const isAdmin = Boolean(u);

  // 1. Sidebar Sections: Luôn hiển thị Học vụ cho Trainee, Quản trị Admin chỉ hiển thị khi đã đăng nhập Admin
  if (elements.studentOnlyNavSections) {
    elements.studentOnlyNavSections.style.display = 'block';
  }
  if (elements.adminNavGroupLabel) {
    elements.adminNavGroupLabel.style.display = canManage('accounts:manage') ? 'block' : 'none';
  }
  if (elements.adminNavList) {
    elements.adminNavList.style.display = isAdmin ? 'block' : 'none';
  }
  if (elements.menuBtnGoAdmin) {
    elements.menuBtnGoAdmin.style.display = canManage('accounts:manage') ? 'flex' : 'none';
  }
  if (elements.menuBtnOpenChangePassword) {
    elements.menuBtnOpenChangePassword.style.display = u && !u.isOwner ? 'flex' : 'none';
  }

  // 2. Sidebar Login vs Logout items
  if (elements.sidebarLoginItem) {
    elements.sidebarLoginItem.style.display = isAdmin ? 'none' : 'block';
  }
  if (elements.sidebarLogoutItem) {
    elements.sidebarLogoutItem.style.display = isAdmin ? 'block' : 'none';
  }

  // 3. Header Buttons: Login Admin vs Logout Admin
  if (elements.openLoginModalBtn) {
    elements.openLoginModalBtn.style.display = isAdmin ? 'none' : 'inline-flex';
  }
  if (elements.headerLogoutBtn) {
    elements.headerLogoutBtn.style.display = isAdmin ? 'inline-flex' : 'none';
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
    } else {
      // Chế độ xem dành cho Trainee & Khách (Không cần đăng nhập)
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
      if (elements.headerAccountId) {
        elements.headerAccountId.textContent = activeTrainee ? `MSSV: ${activeTrainee.traineeId}` : 'Xem lịch & thứ hạng';
      }
      if (elements.menuAccountName) {
        elements.menuAccountName.textContent = activeTrainee ? activeTrainee.fullName : 'Khách / Trainee UIT';
      }
      if (elements.menuAccountRole) {
        elements.menuAccountRole.textContent = activeTrainee ? `Trainee (MSSV: ${activeTrainee.traineeId})` : 'Chế độ xem mở - Không cần đăng nhập';
      }
      if (elements.menuBtnOpenLogin) elements.menuBtnOpenLogin.style.display = 'flex';
      if (elements.menuBtnOpenLoginText) elements.menuBtnOpenLoginText.textContent = 'Đăng nhập';
      if (elements.menuBtnGoProfile) elements.menuBtnGoProfile.style.display = 'flex';
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
    const page = el.closest?.('[id^="view"]')?.id;
    const permission = el.dataset.permission || ({ viewSchedule: 'schedules:manage', viewQuestions: 'questions:manage', viewAssignments: 'assignments:manage', viewGrades: 'attendance:manage', viewLeaderboard: 'trainees:manage' })[page];
    el.style.display = permission ? (canManage(permission) ? '' : 'none') : (isAdmin ? '' : 'none');
  });

  document.querySelectorAll('[data-permission]').forEach(element => { element.style.display = canManage(element.dataset.permission) ? '' : 'none'; });
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
}

function getInitials(name) {
  if (!name) return 'SV';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function openLoginModal() {
  window.location.href = '/login';
}

function closeLoginModal() {
  // Modal has been migrated to dedicated /login page
}

async function handleLogout() {
  try {
    const response = await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!response.ok) throw new Error();
  } catch {
    window.showToast?.('Chưa đăng xuất được. Vui lòng thử lại.', 'danger');
    return;
  }
  state.currentUser = null;
  localStorage.removeItem('uit_trainee_auth_user');
  localStorage.removeItem('uit_trainee_auth_token');
  await loadTrainees();
  renderAuthState();
  switchTab('schedule');
  if (window.showToast) {
    window.showToast('Đã đăng xuất khỏi tài khoản Quản trị viên!', 'info');
  }
}


function checkAdminAuth() {
  return canManage('accounts:manage');
}

function updateAuthUI() {
  renderAuthState();
}

// Expose to global window
window.initAuth = initAuth;
window.checkAdminAuth = checkAdminAuth;
window.logout = handleLogout;
window.handleLogout = handleLogout;
window.updateAuthUI = updateAuthUI;
window.checkAdminAuth = checkAdminAuth;
window.openLoginModal = openLoginModal;
window.closeLoginModal = closeLoginModal;
