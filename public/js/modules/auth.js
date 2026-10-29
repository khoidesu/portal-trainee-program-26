/**
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
 */

// ==========================================
// AUTHENTICATION & ACCESS CONTROL
// ==========================================

function initAuth() {
  const savedUser = localStorage.getItem('uit_trainee_auth_user');
  if (savedUser) {
    try {
      const parsed = JSON.parse(savedUser);
      // Chỉ tài khoản Admin mới được xem là currentUser đã đăng nhập
      if (parsed && parsed.role === 'admin') {
        state.currentUser = parsed;
      } else {
        state.currentUser = null;
        localStorage.removeItem('uit_trainee_auth_user');
        localStorage.removeItem('uit_trainee_auth_token');
      }
    } catch (e) {
      state.currentUser = null;
      localStorage.removeItem('uit_trainee_auth_user');
      localStorage.removeItem('uit_trainee_auth_token');
    }
  } else {
    state.currentUser = null;
  }
  // Khách & Sinh viên truy cập trực tiếp, KHÔNG chuyển hướng sang /login
  renderAuthState();
  return true;
}

function renderAuthState() {
  const u = state.currentUser;
  const isAdmin = Boolean(u && u.role === 'admin');

  // 1. Sidebar Sections: Luôn hiển thị Học vụ cho Sinh viên, Quản trị Admin chỉ hiển thị khi đã đăng nhập Admin
  if (elements.studentOnlyNavSections) {
    elements.studentOnlyNavSections.style.display = 'block';
  }
  if (elements.adminNavGroupLabel) {
    elements.adminNavGroupLabel.style.display = isAdmin ? 'block' : 'none';
  }
  if (elements.adminNavList) {
    elements.adminNavList.style.display = isAdmin ? 'block' : 'none';
  }
  if (elements.menuBtnGoAdmin) {
    elements.menuBtnGoAdmin.style.display = isAdmin ? 'flex' : 'none';
  }
  if (elements.menuBtnOpenChangePassword) {
    elements.menuBtnOpenChangePassword.style.display = isAdmin ? 'flex' : 'none';
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
      if (elements.menuAccountRole) elements.menuAccountRole.textContent = 'Quản trị viên hệ thống (admin@uit.edu.vn)';
      if (elements.menuBtnOpenLogin) elements.menuBtnOpenLogin.style.display = 'none';
      if (elements.menuBtnGoProfile) elements.menuBtnGoProfile.style.display = 'none';
      if (elements.menuBtnLogout) elements.menuBtnLogout.style.display = 'flex';
      if (elements.menuBtnGoAdmin) elements.menuBtnGoAdmin.style.display = 'flex';
    } else {
      // Chế độ xem dành cho Sinh viên & Khách (Không cần đăng nhập)
      elements.headerAccountPill.classList.remove('is-admin');
      const activeTrainee = state.currentTrainee;
      const avatarUrl = activeTrainee 
        ? getTraineeDicebearAvatar(activeTrainee) 
        : 'https://api.dicebear.com/9.x/avataaars/svg?seed=uit-student&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf';
      
      if (elements.headerAccountAvatar) {
        elements.headerAccountAvatar.style.background = 'transparent';
        elements.headerAccountAvatar.innerHTML = `<img src="${avatarUrl}" alt="Student Avatar" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
      }
      if (elements.headerAccountName) {
        elements.headerAccountName.textContent = activeTrainee ? activeTrainee.fullName : 'Sinh viên Trainee';
      }
      if (elements.headerAccountId) {
        elements.headerAccountId.textContent = activeTrainee ? `MSSV: ${activeTrainee.traineeId}` : 'Xem lịch & thứ hạng';
      }
      if (elements.menuAccountName) {
        elements.menuAccountName.textContent = activeTrainee ? activeTrainee.fullName : 'Khách / Sinh viên UIT';
      }
      if (elements.menuAccountRole) {
        elements.menuAccountRole.textContent = activeTrainee ? `Sinh viên (MSSV: ${activeTrainee.traineeId})` : 'Chế độ xem mở - Không cần đăng nhập';
      }
      if (elements.menuBtnOpenLogin) elements.menuBtnOpenLogin.style.display = 'flex';
      if (elements.menuBtnOpenLoginText) elements.menuBtnOpenLoginText.textContent = 'Đăng nhập Admin';
      if (elements.menuBtnGoProfile) elements.menuBtnGoProfile.style.display = 'flex';
      if (elements.menuBtnLogout) elements.menuBtnLogout.style.display = 'none';
      if (elements.menuBtnGoAdmin) elements.menuBtnGoAdmin.style.display = 'none';
    }
  }

  // 5. Profile banner greeting tag
  if (elements.studentGreetingTag) {
    elements.studentGreetingTag.textContent = isAdmin ? 'QUẢN TRỊ VIÊN,' : 'SINH VIÊN TRAINEE,';
  }

  // 6. Cập nhật quyền hiển thị các phần tử chỉ dành cho Admin (admin-only-element)
  document.querySelectorAll('.admin-only-element').forEach(el => {
    el.style.display = isAdmin ? '' : 'none';
  });

  // Người dùng thường không thể truy cập tab admin
  if (!isAdmin && state.activeTab === 'admin') {
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

function handleLogout() {
  state.currentUser = null;
  localStorage.removeItem('uit_trainee_auth_user');
  localStorage.removeItem('uit_trainee_auth_token');
  renderAuthState();
  switchTab('schedule');
  if (window.showToast) {
    window.showToast('Đã đăng xuất khỏi tài khoản Quản trị viên!', 'info');
  }
}


function updateAuthUI() {
  renderAuthState();
}

// Expose to global window
window.initAuth = initAuth;
window.logout = handleLogout;
window.handleLogout = handleLogout;
window.updateAuthUI = updateAuthUI;
window.checkAdminAuth = checkAdminAuth;
window.openLoginModal = openLoginModal;
window.closeLoginModal = closeLoginModal;
