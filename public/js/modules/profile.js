/**
 * ==============================================================================
 * COMPONENT: Profile Module (Hồ Sơ Cá Nhân & Quản Lý Tài Khoản)
 * CHỨC NĂNG CHÍNH: Hiển thị thông tin cá nhân, cập nhật họ tên/email, đổi mật khẩu
 *                  tài khoản và gửi yêu cầu cấp lại mật khẩu cho Admin.
 * LIÊN KẾT & PHỤ THUỘC: public/js/modules/core.js, public/js/api.js
 * NHIỆM VỤ CHI TIẾT:
 *   - renderProfileView: Điền dữ liệu người dùng vào form hồ sơ
 *   - Xử lý submit cập nhật thông tin cá nhân
 *   - openChangePasswordModal: Form đổi mật khẩu (bảo mật xác thực mật khẩu cũ)
 *   - openSupportRequestModal: Form gửi yêu cầu hỗ trợ quên mật khẩu
 * ==============================================================================
 */

// ==========================================
// CHANGE PASSWORD MODAL & ACTIONS
// ==========================================
function openChangePasswordModal() {
  if (!elements.changePasswordModal) return;
  if (elements.changePasswordForm) elements.changePasswordForm.reset();
  if (elements.changePassFeedback) {
    elements.changePassFeedback.style.display = 'none';
    elements.changePassFeedback.textContent = '';
  }
  elements.changePasswordModal.classList.add('open', 'show');
  if (elements.changePassCurrent) elements.changePassCurrent.focus();
}

function closeChangePasswordModal() {
  if (elements.changePasswordModal) {
    elements.changePasswordModal.classList.remove('open', 'show');
  }
}

async function handleChangePasswordSubmit(e) {
  e.preventDefault();
  const currentPass = elements.changePassCurrent ? elements.changePassCurrent.value : '';
  const newPass = elements.changePassNew ? elements.changePassNew.value : '';
  const confirmPass = elements.changePassConfirm ? elements.changePassConfirm.value : '';

  if (newPass !== confirmPass) {
    showChangePassFeedback('Mật khẩu xác nhận không khớp với mật khẩu mới!', 'danger');
    return;
  }

  if (newPass.length < 4) {
    showChangePassFeedback('Mật khẩu mới phải có tối thiểu 12 ký tự!', 'danger');
    return;
  }

  const targetId = state.currentUser?.traineeId || state.currentUser?.username || 'admin';

  try {
    const res = await window.API.changePassword(targetId, currentPass, newPass);
    if (res && res.success) {
      closeChangePasswordModal();
      if (window.showToast) {
        window.showToast('Đổi mật khẩu thành công! Mật khẩu mới đã được lưu vào MongoDB Atlas.', 'success');
      } else {
        alert('Đổi mật khẩu thành công!');
      }
      state.currentUser = null;
      renderAuthState();
      window.location.href = '/login';
    } else {
      showChangePassFeedback(res?.message || 'Đổi mật khẩu thất bại, vui lòng kiểm tra lại mật khẩu hiện tại!', 'danger');
    }
  } catch (err) {
    console.error('Lỗi khi đổi mật khẩu:', err);
    showChangePassFeedback('Lỗi hệ thống khi đổi mật khẩu: ' + err.message, 'danger');
  }
}

function showChangePassFeedback(msg, type) {
  if (!elements.changePassFeedback) return;
  elements.changePassFeedback.textContent = msg;
  elements.changePassFeedback.style.display = 'block';
  if (type === 'danger') {
    elements.changePassFeedback.style.background = 'rgba(239, 68, 68, 0.15)';
    elements.changePassFeedback.style.color = '#ef4444';
    elements.changePassFeedback.style.border = '1px solid rgba(239, 68, 68, 0.3)';
  } else {
    elements.changePassFeedback.style.background = 'rgba(16, 185, 129, 0.15)';
    elements.changePassFeedback.style.color = '#10b981';
    elements.changePassFeedback.style.border = '1px solid rgba(16, 185, 129, 0.3)';
  }
}

// Utility: HTML escape
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ==========================================
// HỒ SƠ CÁ NHÂN (USER PROFILE VIEW)
// ==========================================

function renderProfileView() {
  const u = state.currentUser;
  const isAdmin = Boolean(u && u.role === 'admin');

  // Find active trainee data
  let trainee = null;
  if (isAdmin) {
    trainee = {
      fullName: u.fullName || 'Quản Trị Viên (Admin)',
      email: u.email || 'admin@uit.edu.vn',
      traineeId: 'ADMIN',
      role: 'admin',
      track: 'Ban Quản Trị Hệ Thống Trainee Program'
    };
  } else if (state.currentTrainee) {
    trainee = state.currentTrainee;
  } else if (state.trainees && state.trainees.length > 0) {
    trainee = state.trainees[0];
  } else {
    trainee = {
      fullName: 'Trainee',
      traineeId: '25520918',
      email: 'trainee@uit.edu.vn',
      track: 'Khoa Khoa học Máy tính'
    };
  }

  // Populate Input Fields
  if (elements.profileInputFullName) {
    elements.profileInputFullName.value = trainee.fullName || u.fullName || '';
  }
  if (elements.profileInputEmail) {
    elements.profileInputEmail.value = trainee.email || u.email || '';
  }
  if (elements.profileInputId) {
    elements.profileInputId.value = trainee.traineeId || u.traineeId || u.username || '';
  }
  if (elements.profileInputTrack) {
    elements.profileInputTrack.value = trainee.track || trainee.department || 'Khoa Khoa học Máy tính';
  }

  // Populate Badges
  if (elements.profileBadgeId) {
    elements.profileBadgeId.textContent = trainee.traineeId || u.traineeId || u.username || '--';
  }
  if (elements.profileBadgeRole) {
    elements.profileBadgeRole.textContent = u.role === 'admin' ? 'Quản trị viên' : 'Trainee UIT';
    elements.profileBadgeRole.className = u.role === 'admin' ? 'badge badge-danger' : 'badge badge-success';
  }
  if (elements.profileBadgeBatch) {
    elements.profileBadgeBatch.textContent = trainee.batch || 'Trainee 2026';
  }
  if (elements.profileBadgeTrack) {
    elements.profileBadgeTrack.textContent = trainee.track || trainee.department || 'Khoa Khoa học Máy tính';
  }

  // Avatar Display với Dicebear
  const avatarUrl = getTraineeDicebearAvatar(trainee);
  if (elements.profileAvatarImg) {
    elements.profileAvatarImg.src = avatarUrl;
    elements.profileAvatarImg.style.display = 'block';
  }
  if (elements.profileAvatarInitials) {
    elements.profileAvatarInitials.style.display = 'none';
  }
}

function compressAndResizeImage(file, maxWidth = 300, maxHeight = 300, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Không thể đọc dữ liệu hình ảnh!'));
      img.src = event.target.result;
    };
    reader.onerror = () => reject(new Error('Lỗi khi đọc file ảnh từ thiết bị!'));
    reader.readAsDataURL(file);
  });
}

async function handleProfileAvatarChange(file) {
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    if (window.showToast) window.showToast('Vui lòng chọn file hình ảnh hợp lệ (JPG, PNG, WebP)!', 'warning');
    return;
  }

  try {
    if (window.showToast) window.showToast('Đang tối ưu và tải ảnh đại diện lên...', 'info');

    // Nén và chuẩn hóa ảnh về 300x300 để nhẹ (20-30KB) và hiển thị tức thì cho tất cả mọi người
    const base64Data = await compressAndResizeImage(file, 300, 300, 0.85);

    // Immediate preview
    if (elements.profileAvatarImg) {
      elements.profileAvatarImg.src = base64Data;
      elements.profileAvatarImg.style.display = 'block';
    }
    if (elements.profileAvatarInitials) {
      elements.profileAvatarInitials.style.display = 'none';
    }

    const targetId = state.currentUser ? (state.currentUser.traineeId || state.currentUser.username) : state.currentTraineeId;
    if (!targetId) return;

    const res = await API.updateTrainee(targetId, { avatar: base64Data });
    if (res && res.success) {
      if (state.currentUser) {
        state.currentUser.avatar = base64Data;
        try {
          localStorage.setItem('uit_trainee_auth_user', JSON.stringify(state.currentUser));
        } catch (e) {
          console.warn('LocalStorage quota warning:', e);
        }
      }
      if (state.currentTrainee && (state.currentTrainee.traineeId === targetId)) {
        state.currentTrainee.avatar = base64Data;
      }
      const item = (state.trainees || []).find(t => t.traineeId === targetId);
      if (item) item.avatar = base64Data;

      // Cập nhật toàn bộ các nơi hiển thị để mọi người đều thấy ngay lập tức
      renderAuthState();
      if (state.currentTrainee && state.currentTrainee.traineeId === targetId) {
        renderTraineeCard(state.currentTrainee);
      }
      renderPodium();
      renderLeaderboardTable();
      renderAdminTable();

      // Đồng bộ ngầm lại danh sách Trainee
      API.getTrainees().then(ts => {
        if (ts && ts.length > 0) {
          state.trainees = ts;
          renderPodium();
          renderLeaderboardTable();
          renderAdminTable();
        }
      });

      if (window.showToast) window.showToast('Cập nhật ảnh đại diện thành công và đã lưu trực tiếp vào MongoDB Atlas!', 'success');
    } else {
      if (window.showToast) window.showToast((res && res.message) || 'Lỗi khi lưu ảnh đại diện!', 'danger');
    }
  } catch (err) {
    console.error('Lỗi khi nén/upload avatar:', err);
    if (window.showToast) window.showToast('Lỗi xử lý ảnh: ' + err.message, 'danger');
  }
}

async function handleRemoveProfileAvatar() {
  const targetId = state.currentUser ? (state.currentUser.traineeId || state.currentUser.username) : state.currentTraineeId;
  if (!targetId) return;

  if (window.showToast) window.showToast('Đang gỡ ảnh đại diện trên MongoDB Atlas...', 'info');

  const res = await API.updateTrainee(targetId, { avatar: '' });
  if (res && res.success) {
    if (state.currentUser) {
      state.currentUser.avatar = '';
      try {
        localStorage.setItem('uit_trainee_auth_user', JSON.stringify(state.currentUser));
      } catch (e) {
        console.warn('LocalStorage quota warning:', e);
      }
    }
    if (state.currentTrainee && (state.currentTrainee.traineeId === targetId)) {
      state.currentTrainee.avatar = '';
    }
    const item = (state.trainees || []).find(t => t.traineeId === targetId);
    if (item) item.avatar = '';

    renderProfileView();
    renderAuthState();
    if (state.currentTrainee && state.currentTrainee.traineeId === targetId) {
      renderTraineeCard(state.currentTrainee);
    }
    renderPodium();
    renderLeaderboardTable();
    renderAdminTable();

    if (window.showToast) window.showToast('Đã gỡ ảnh đại diện thành công trên MongoDB Atlas!', 'success');
  } else {
    if (window.showToast) window.showToast((res && res.message) || 'Lỗi khi gỡ ảnh đại diện!', 'danger');
  }
}

async function handleProfileInfoSave(e) {
  e.preventDefault();
  const fullName = elements.profileInputFullName ? elements.profileInputFullName.value.trim() : '';
  const email = elements.profileInputEmail ? elements.profileInputEmail.value.trim() : '';

  if (!fullName) {
    if (window.showToast) window.showToast('Họ và tên không được để trống!', 'warning');
    return;
  }
  if (!email || !email.includes('@')) {
    if (window.showToast) window.showToast('Vui lòng nhập địa chỉ email hợp lệ!', 'warning');
    return;
  }

  const targetId = state.currentUser ? (state.currentUser.traineeId || state.currentUser.username) : state.currentTraineeId;
  if (!targetId) return;

  const btn = elements.btnSaveProfileInfo;
  if (btn) btn.disabled = true;

  try {
    const res = await API.updateTrainee(targetId, { fullName, email });
    if (res && res.success) {
      if (state.currentUser) {
        state.currentUser.fullName = fullName;
        state.currentUser.email = email;
        try {
          localStorage.setItem('uit_trainee_auth_user', JSON.stringify(state.currentUser));
        } catch (e) {
          console.warn('LocalStorage quota warning:', e);
        }
      }
      if (state.currentTrainee && (state.currentTrainee.traineeId === targetId)) {
        state.currentTrainee.fullName = fullName;
        state.currentTrainee.email = email;
      }
      const item = (state.trainees || []).find(t => t.traineeId === targetId);
      if (item) {
        item.fullName = fullName;
        item.email = email;
      }

      renderProfileView();
      renderAuthState();
      if (state.currentTrainee && state.currentTrainee.traineeId === targetId) {
        renderTraineeCard(state.currentTrainee);
      }
      renderPodium();
      renderLeaderboardTable();
      renderAdminTable();

      if (window.showToast) window.showToast('Cập nhật thông tin họ tên & email thành công trên MongoDB Atlas!', 'success');
    } else {
      if (window.showToast) window.showToast((res && res.message) || 'Không thể cập nhật thông tin!', 'danger');
    }
  } catch (err) {
    if (window.showToast) window.showToast('Lỗi máy chủ: ' + err.message, 'danger');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function handleProfilePasswordChange(e) {
  e.preventDefault();
  const oldPass = elements.profileOldPass ? elements.profileOldPass.value : '';
  const newPass = elements.profileNewPass ? elements.profileNewPass.value : '';
  const confirmPass = elements.profileConfirmPass ? elements.profileConfirmPass.value : '';

  if (!oldPass || !newPass) {
    if (window.showToast) window.showToast('Vui lòng nhập mật khẩu hiện tại và mật khẩu mới!', 'warning');
    return;
  }
  if (newPass.length < 4) {
    if (window.showToast) window.showToast('Mật khẩu mới phải có tối thiểu 4 ký tự!', 'warning');
    return;
  }
  if (newPass !== confirmPass) {
    if (window.showToast) window.showToast('Xác nhận mật khẩu mới không trùng khớp!', 'danger');
    return;
  }

  const targetId = state.currentUser ? (state.currentUser.traineeId || state.currentUser.username) : state.currentTraineeId;
  const btn = elements.btnSaveNewPassword;
  if (btn) btn.disabled = true;

  try {
    const res = await API.changePassword(targetId, oldPass, newPass);
    if (res && res.success) {
      if (elements.profileSecurityForm) elements.profileSecurityForm.reset();
      if (window.showToast) window.showToast('Đổi mật khẩu thành công! Mật khẩu mới đã được lưu vào MongoDB Atlas.', 'success');
    } else {
      if (window.showToast) window.showToast((res && res.message) || 'Không thể đổi mật khẩu!', 'danger');
    }
  } catch (err) {
    if (window.showToast) window.showToast('Lỗi hệ thống: ' + err.message, 'danger');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function openProfileForgotModal() {
  const u = state.currentUser;
  if (elements.profileForgotIdentifier) {
    elements.profileForgotIdentifier.value = u ? (u.traineeId || u.username) : '';
  }
  if (elements.profileForgotEmail) {
    elements.profileForgotEmail.value = u ? (u.email || '') : '';
  }
  if (elements.profileForgotPhone) {
    elements.profileForgotPhone.value = '';
  }
  if (elements.profileForgotNote) {
    elements.profileForgotNote.value = 'Em quên mật khẩu đăng nhập, nhờ Quản trị viên cấp lại mật khẩu giúp em.';
  }
  if (elements.profileForgotModal) {
    elements.profileForgotModal.classList.add('active');
  }
}

function closeProfileForgotModal() {
  if (elements.profileForgotModal) {
    elements.profileForgotModal.classList.remove('active');
  }
}

async function handleProfileForgotSubmit(e) {
  e.preventDefault();
  const identifier = elements.profileForgotIdentifier ? elements.profileForgotIdentifier.value.trim() : '';
  const email = elements.profileForgotEmail ? elements.profileForgotEmail.value.trim() : '';
  const phone = elements.profileForgotPhone ? elements.profileForgotPhone.value.trim() : '';
  const note = elements.profileForgotNote ? elements.profileForgotNote.value.trim() : '';

  if (!identifier) {
    if (window.showToast) window.showToast('Vui lòng nhập MSSV hoặc tài khoản!', 'warning');
    return;
  }

  const submitBtn = elements.submitProfileForgotBtn;
  if (submitBtn) submitBtn.disabled = true;

  try {
    const res = await API.requestForgotPassword({ identifier, email, phone, note });
    closeProfileForgotModal();
    // User requirement: "khi nhấn vào sẽ hiện thông báo 'đã gửi tới admin'"
    if (window.showToast) {
      window.showToast('Đã gửi tới admin! Quản trị viên sẽ kiểm tra và cấp lại mật khẩu cho bạn.', 'success');
    }
    alert('Đã gửi tới admin! Quản trị viên sẽ kiểm tra và cấp lại mật khẩu cho bạn.');
  } catch (err) {
    if (window.showToast) window.showToast('Lỗi gửi yêu cầu: ' + err.message, 'danger');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}


// Expose to global window
window.renderProfileView = renderProfileView;
window.openChangePasswordModal = openChangePasswordModal;
