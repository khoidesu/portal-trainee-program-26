/**
 * ==============================================================================
 * COMPONENT: Profile Module (Hồ Sơ Cá Nhân & Quản Lý Tài Khoản Trainee)
 * CHỨC NĂNG CHÍNH: Hiển thị và chỉnh sửa hồ sơ cá nhân, upload avatar an toàn (xóa ảnh cũ),
 *                  đổi mật khẩu, xem thông tin chương trình đào tạo và lịch sử hoạt động.
 * LIÊN KẾT & PHỤ THUỘC: public/js/modules/core.js, public/js/api.js, public/js/modules/auth.js
 * ==============================================================================
 */

let pendingAvatarDataUrl = null;

// ==========================================
// UTILITY HELPERS
// ==========================================
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateTimeVN(isoStr) {
  if (!isoStr) return '--';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  } catch {
    return isoStr;
  }
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
  const minLen = state.currentUser?.role === 'trainee' ? 6 : 12;
  const fail = message => window.showToast ? window.showToast(message, 'danger') : alert(message);

  if (newPass !== confirmPass) return fail('Mật khẩu xác nhận không khớp với mật khẩu mới.');
  if (newPass.length < minLen) return fail(`Mật khẩu mới cần tối thiểu ${minLen} ký tự.`);

  const res = await window.API.changePassword(state.currentUser?.traineeId, currentPass, newPass);
  if (!res?.success) return fail(res?.message || 'Đổi mật khẩu thất bại, vui lòng kiểm tra lại mật khẩu hiện tại.');

  closeChangePasswordModal();
  state.currentUser = null;
  try { sessionStorage.removeItem('uit_auth_user_cache'); } catch {}
  window.location.href = '/login';
}

// Nén và chuẩn hóa ảnh để tải lên nhanh và an toàn
function compressAndResizeImage(file, maxWidth = 350, maxHeight = 350, quality = 0.85) {
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
      img.onerror = () => reject(new Error('Không thể xử lý dữ liệu ảnh!'));
      img.src = event.target.result;
    };
    reader.onerror = () => reject(new Error('Lỗi khi đọc file ảnh từ thiết bị!'));
    reader.readAsDataURL(file);
  });
}

// ==========================================
// RENDER PROFILE VIEW
// ==========================================
async function renderProfileView(targetTraineeId) {
  const u = state.currentUser;
  if (!u) {
    if (window.showToast) window.showToast('Vui lòng đăng nhập để xem hồ sơ cá nhân!', 'info');
    window.location.href = '/login';
    return;
  }

  try {
    const isManagedProfile = Boolean(targetTraineeId && canManage('trainees:manage'));
    state.profileTargetId = isManagedProfile ? targetTraineeId : null;
    const res = await API.getProfile(targetTraineeId);
    if (!res || !res.success) {
      throw new Error(res?.message || 'Không thể lấy dữ liệu hồ sơ cá nhân.');
    }

    const p = res.data;
    const account = p.account || {};

    // 1. Avatar Display
    const avatarUrl = window.getTraineeDicebearAvatar ? getTraineeDicebearAvatar(p) : p.avatar || '';
    if (elements.profileAvatarImg) {
      if (avatarUrl) {
        elements.profileAvatarImg.src = avatarUrl;
        elements.profileAvatarImg.style.display = 'block';
        if (elements.profileAvatarInitials) elements.profileAvatarInitials.style.display = 'none';
      } else {
        elements.profileAvatarImg.style.display = 'none';
        if (elements.profileAvatarInitials) {
          elements.profileAvatarInitials.textContent = p.fullName ? getInitials(p.fullName) : 'SV';
          elements.profileAvatarInitials.style.display = 'flex';
        }
      }
    }

    // Reset avatar preview box if any was open
    resetAvatarPreview();

    // 2. Badges & Program Info
    const displayId = p.traineeId || p.username || '--';
    if (elements.profileBadgeId) elements.profileBadgeId.textContent = displayId;
    if (elements.profileBadgeRole) {
      elements.profileBadgeRole.textContent = 'Trainee UIT';
      elements.profileBadgeRole.className = 'badge badge-success';
    }
    if (elements.profileBadgeProgramStatus) {
      const statusKey = String(p.status || '').toLowerCase();
      const statusMap = { active: 'Đang học (Active)', 'đang học': 'Đang học (Active)', completed: 'Hoàn thành (Completed)', 'hoàn thành': 'Hoàn thành (Completed)', inactive: 'Ngừng học (Inactive)', 'ngừng học': 'Ngừng học (Inactive)' };
      elements.profileBadgeProgramStatus.textContent = statusMap[statusKey] || p.status || 'Đang học (Active)';
      elements.profileBadgeProgramStatus.className = ['completed', 'hoàn thành'].includes(statusKey) ? 'badge badge-success' : ['inactive', 'ngừng học'].includes(statusKey) ? 'badge badge-danger' : 'badge badge-primary';
    }
    if (elements.profileBadgeBatch) elements.profileBadgeBatch.textContent = p.batch || 'Trainee 2026';
    if (elements.profileBadgeTrack) elements.profileBadgeTrack.textContent = p.track || p.department || 'Khoa học Máy tính';
    if (elements.profileBadgeMentor) {
      const mentorName = p.mentor?.name || (typeof p.mentor === 'string' ? p.mentor : '');
      elements.profileBadgeMentor.textContent = mentorName || 'Chưa công bố';
    }

    // 3. Account Info & Security Summary
    if (elements.profileAccountUsername) elements.profileAccountUsername.textContent = account.username || displayId;
    if (elements.profileAccountStatusBadge) {
      elements.profileAccountStatusBadge.textContent = account.active === false ? 'Đã khóa' : account.mustChangePassword ? 'Cần đổi mật khẩu' : 'Đang hoạt động';
      elements.profileAccountStatusBadge.className = account.active === false ? 'badge badge-danger' : account.mustChangePassword ? 'badge badge-primary' : 'badge badge-success';
    }
    if (elements.profileAccountCreatedAt) elements.profileAccountCreatedAt.textContent = formatDateTimeVN(account.createdAt);
    if (elements.profileAccountLastLogin) elements.profileAccountLastLogin.textContent = formatDateTimeVN(account.lastLoginAt);
    if (elements.profileAccountLastPassChange) elements.profileAccountLastPassChange.textContent = account.lastPasswordChangeAt ? formatDateTimeVN(account.lastPasswordChangeAt) : 'Chưa thay đổi';

    // 4. Form Fields
    if (elements.profileInputFullName) elements.profileInputFullName.value = p.fullName || '';
    if (elements.profileInputId) elements.profileInputId.value = displayId;
    if (elements.profileInputEmail) elements.profileInputEmail.value = p.email || '';
    if (elements.profileInputPhone) elements.profileInputPhone.value = p.phone || '';
    if (elements.profileInputDob) elements.profileInputDob.value = p.dateOfBirth ? p.dateOfBirth.slice(0, 10) : '';
    if (elements.profileSelectGender) elements.profileSelectGender.value = p.gender || '';
    if (elements.profileInputAddress) elements.profileInputAddress.value = p.address || '';
    if (elements.profileInputFacebook) elements.profileInputFacebook.value = p.facebookUrl || '';
    if (elements.profileInputLinkedin) elements.profileInputLinkedin.value = p.linkedinUrl || '';
    if (elements.profileTextareaBio) elements.profileTextareaBio.value = p.bio || '';

    // Notification Preferences
    const prefs = p.notificationPreferences || {};
    if (elements.profilePrefSchedule) elements.profilePrefSchedule.checked = prefs.scheduleNotify !== false;
    if (elements.profilePrefAssignments) elements.profilePrefAssignments.checked = prefs.assignmentNotify !== false;
    if (elements.profilePrefQuestions) elements.profilePrefQuestions.checked = prefs.questionNotify !== false;

    // 5. Training Program Stat Displays (Read-only)
    if (elements.profileProgStatusDisplay) elements.profileProgStatusDisplay.textContent = p.status || 'Active';
    if (elements.profileProgBatchDisplay) elements.profileProgBatchDisplay.textContent = `${p.batch || 'Trainee 2026'} · ${p.track || 'Khoa KHMT'}`;
    if (elements.profileProgStarsDisplay) elements.profileProgStarsDisplay.textContent = `${p.accumulatedStars || 0} sao`;
    if (elements.profileProgAttendanceDisplay) elements.profileProgAttendanceDisplay.textContent = `${p.attendedSessions || 0} / ${p.totalSessions || 0} buổi`;

    const securityCard = document.getElementById('profileSecurityCard');
    const forgotCard = document.getElementById('profileForgotCard');
    if (securityCard) securityCard.style.display = isManagedProfile ? 'none' : '';
    if (forgotCard) forgotCard.style.display = isManagedProfile ? 'none' : '';

    const mentorGroup = document.getElementById('profileMentorGroup');
    const inputMentorName = document.getElementById('profileInputMentorName');
    const inputMentorEmail = document.getElementById('profileInputMentorEmail');
    if (mentorGroup) {
      mentorGroup.style.display = isManagedProfile ? 'block' : 'none';
    }
    if (inputMentorName) inputMentorName.value = p.mentor?.name || '';
    if (inputMentorEmail) inputMentorEmail.value = p.mentor?.email || '';

    // 6. Load Recent Activities
    loadProfileActivities(isManagedProfile ? targetTraineeId : undefined);
  } catch (err) {
    console.error('Lỗi khi nạp hồ sơ cá nhân:', err);
    if (window.showToast) window.showToast(err.message, 'danger');
  }
}

// ==========================================
// AVATAR UPLOAD, PREVIEW & DELETE
// ==========================================
function resetAvatarPreview() {
  pendingAvatarDataUrl = null;
  const box = document.getElementById('profileAvatarPreviewBox');
  const normalActions = document.getElementById('avatarNormalActions');
  const fileInput = document.getElementById('profileAvatarFileInput');
  if (box) box.style.display = 'none';
  if (normalActions) normalActions.style.display = 'flex';
  if (fileInput) fileInput.value = '';
}

async function handleAvatarFileSelect(file) {
  if (!file) return;

  const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    if (window.showToast) window.showToast('Vui lòng chọn file hình ảnh hợp lệ (JPG, PNG, WebP)!', 'warning');
    return;
  }

  // Max 3MB
  if (file.size > 3 * 1024 * 1024) {
    if (window.showToast) window.showToast('Dung lượng ảnh vượt quá 3MB! Vui lòng chọn ảnh nhỏ hơn.', 'warning');
    return;
  }

  try {
    // Nén và chuẩn bị preview
    const compressed = await compressAndResizeImage(file, 350, 350, 0.85);
    pendingAvatarDataUrl = compressed;

    const box = document.getElementById('profileAvatarPreviewBox');
    const previewImg = document.getElementById('profileAvatarPreviewImg');
    const normalActions = document.getElementById('avatarNormalActions');

    if (previewImg) previewImg.src = compressed;
    if (box) box.style.display = 'block';
    if (normalActions) normalActions.style.display = 'none';
  } catch (err) {
    console.error('Lỗi khi tạo ảnh xem trước:', err);
    if (window.showToast) window.showToast('Không thể đọc file ảnh: ' + err.message, 'danger');
  }
}

async function handleConfirmUploadAvatar() {
  if (!pendingAvatarDataUrl) return;

  const btn = document.getElementById('btnConfirmUploadAvatar');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Đang lưu...';
  }

  try {
    const targetTraineeId = canManage('trainees:manage') ? state.profileTargetId : null;
    const res = await API.uploadAvatar(pendingAvatarDataUrl, targetTraineeId);
    if (res && res.success) {
      if (state.currentUser && !targetTraineeId) {
        state.currentUser.avatar = res.avatarUrl || pendingAvatarDataUrl;
      }
      const cachedTrainee = state.trainees.find(item => item.traineeId === (targetTraineeId || state.currentUser?.traineeId));
      if (cachedTrainee) cachedTrainee.avatar = res.avatarUrl;

      // Update current displayed avatar
      if (elements.profileAvatarImg) {
        elements.profileAvatarImg.src = res.avatarUrl || pendingAvatarDataUrl;
        elements.profileAvatarImg.style.display = 'block';
        if (elements.profileAvatarInitials) elements.profileAvatarInitials.style.display = 'none';
      }

      resetAvatarPreview();
      if (window.renderAuthState) renderAuthState();
      if (window.showToast) window.showToast('Cập nhật ảnh đại diện thành công!', 'success');
    } else {
      if (window.showToast) window.showToast(res?.message || 'Lỗi khi tải ảnh đại diện!', 'danger');
    }
  } catch (err) {
    console.error('Lỗi upload avatar:', err);
    if (window.showToast) window.showToast('Lỗi máy chủ: ' + err.message, 'danger');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Lưu ảnh này';
    }
  }
}

async function handleRemoveAvatar() {
  if (!confirm('Bạn có chắc chắn muốn gỡ ảnh đại diện tùy chỉnh và trở về avatar mặc định?')) return;

  const btn = elements.btnRemoveProfileAvatar;
  if (btn) btn.disabled = true;

  try {
    const targetTraineeId = canManage('trainees:manage') ? state.profileTargetId : null;
    const res = await API.deleteAvatar(targetTraineeId);
    if (res && res.success) {
      if (state.currentUser && !targetTraineeId) state.currentUser.avatar = res.avatarUrl || '';
      const cachedTrainee = state.trainees.find(item => item.traineeId === (targetTraineeId || state.currentUser?.traineeId));
      if (cachedTrainee) cachedTrainee.avatar = res.avatarUrl;

      if (elements.profileAvatarImg) {
        elements.profileAvatarImg.src = res.avatarUrl || getTraineeDicebearAvatar(targetTraineeId || state.currentUser);
        elements.profileAvatarImg.style.display = 'block';
      }
      if (elements.profileAvatarInitials) {
        elements.profileAvatarInitials.style.display = 'none';
      }

      resetAvatarPreview();
      if (window.renderAuthState) renderAuthState();
      if (window.showToast) window.showToast('Đã đặt lại ảnh đại diện về mặc định.', 'success');
    } else {
      if (window.showToast) window.showToast(res?.message || 'Lỗi khi gỡ ảnh đại diện!', 'danger');
    }
  } catch (err) {
    if (window.showToast) window.showToast('Lỗi máy chủ: ' + err.message, 'danger');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ==========================================
// PERSONAL INFO FORM SUBMIT
// ==========================================
async function handleProfileInfoSubmit(e) {
  e.preventDefault();
  const fullName = elements.profileInputFullName ? elements.profileInputFullName.value.trim() : '';
  const email = elements.profileInputEmail ? elements.profileInputEmail.value.trim() : '';
  const phone = elements.profileInputPhone ? elements.profileInputPhone.value.trim() : '';
  const dateOfBirth = elements.profileInputDob ? elements.profileInputDob.value : '';
  const gender = elements.profileSelectGender ? elements.profileSelectGender.value : '';
  const address = elements.profileInputAddress ? elements.profileInputAddress.value.trim() : '';
  const facebookUrl = elements.profileInputFacebook ? elements.profileInputFacebook.value.trim() : '';
  const linkedinUrl = elements.profileInputLinkedin ? elements.profileInputLinkedin.value.trim() : '';
  const bio = elements.profileTextareaBio ? elements.profileTextareaBio.value.trim() : '';

  if (!fullName) {
    if (window.showToast) window.showToast('Họ và tên không được để trống!', 'warning');
    return;
  }
  if (!email || !email.includes('@')) {
    if (window.showToast) window.showToast('Vui lòng nhập địa chỉ email hợp lệ!', 'warning');
    return;
  }

  const notificationPreferences = {
    scheduleNotify: elements.profilePrefSchedule ? elements.profilePrefSchedule.checked : true,
    assignmentNotify: elements.profilePrefAssignments ? elements.profilePrefAssignments.checked : true,
    questionNotify: elements.profilePrefQuestions ? elements.profilePrefQuestions.checked : true
  };

  const payload = {
    fullName,
    email,
    phone,
    dateOfBirth,
    gender,
    address,
    facebookUrl,
    linkedinUrl,
    bio,
    notificationPreferences
  };

  if (canManage('trainees:manage')) {
    const inputMentorName = document.getElementById('profileInputMentorName');
    const inputMentorEmail = document.getElementById('profileInputMentorEmail');
    if (inputMentorName) {
      const mName = inputMentorName.value.trim();
      const mEmail = inputMentorEmail ? inputMentorEmail.value.trim() : '';
      payload.mentor = mName ? {
        name: mName,
        email: mEmail,
        role: 'Mentor Trainee Program',
        phone: '',
        avatarInitial: getInitials(mName)
      } : null;
    }
  }

  const btn = elements.btnSaveProfileInfo;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Đang lưu...';
  }

  try {
    const targetTraineeId = canManage('trainees:manage') ? state.profileTargetId : null;
    const res = await API.updateProfile(payload, targetTraineeId);
    if (res && res.success) {
      if (state.currentUser && !targetTraineeId) {
        state.currentUser.fullName = fullName;
        state.currentUser.email = email;
      }
      if (targetTraineeId) {
        await loadTrainees();
        await renderProfileView();
      }
      if (window.renderAuthState) renderAuthState();
      if (window.showToast) window.showToast('Đã Lưu thay đổi cá nhân thành công!', 'success');
    } else {
      if (window.showToast) window.showToast(res?.message || 'Không thể lưu thông tin hồ sơ!', 'danger');
    }
  } catch (err) {
    if (window.showToast) window.showToast('Lỗi máy chủ: ' + err.message, 'danger');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Lưu thay đổi';
    }
  }
}

// ==========================================
// PASSWORD CHANGE FORM SUBMIT
// ==========================================
async function handleProfilePasswordSubmit(e) {
  e.preventDefault();
  const currentPassword = elements.profileOldPass ? elements.profileOldPass.value : '';
  const newPassword = elements.profileNewPass ? elements.profileNewPass.value : '';
  const confirmPassword = elements.profileConfirmPass ? elements.profileConfirmPass.value : '';

  if (!currentPassword || !newPassword) {
    if (window.showToast) window.showToast('Vui lòng điền mật khẩu hiện tại và mật khẩu mới!', 'warning');
    return;
  }
  if (newPassword.length < 6) {
    if (window.showToast) window.showToast('Mật khẩu mới phải có tối thiểu 6 ký tự!', 'warning');
    return;
  }
  if (newPassword !== confirmPassword) {
    if (window.showToast) window.showToast('Xác nhận mật khẩu mới không khớp!', 'danger');
    return;
  }

  const btn = elements.btnSaveNewPassword;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Đang cập nhật...';
  }

  try {
    const targetId = state.currentUser?.traineeId || state.currentUser?.username;
    const res = await API.changePassword(targetId, currentPassword, newPassword);
    if (res && res.success) {
      if (elements.profileSecurityForm) elements.profileSecurityForm.reset();
      if (elements.profileAccountLastPassChange) elements.profileAccountLastPassChange.textContent = formatDateTimeVN(new Date());
      if (window.showToast) window.showToast('Đổi mật khẩu thành công! Mật khẩu mới đã được lưu an toàn.', 'success');
      setTimeout(() => { window.location.href = '/login'; }, 700);
    } else {
      if (window.showToast) window.showToast(res?.message || 'Không thể đổi mật khẩu, vui lòng kiểm tra lại mật khẩu hiện tại!', 'danger');
    }
  } catch (err) {
    if (window.showToast) window.showToast('Lỗi hệ thống: ' + err.message, 'danger');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Cập nhật mật khẩu';
    }
  }
}

// ==========================================
// RECENT ACTIVITIES TIMELINE
// ==========================================
async function loadProfileActivities(targetTraineeId) {
  const container = document.getElementById('profileActivitiesContainer');
  if (!container) return;

  container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 18px;">Đang tải lịch sử hoạt động...</div>';

  try {
    const res = await API.getProfileActivities(targetTraineeId);
    if (!res || !res.success || !Array.isArray(res.data) || res.data.length === 0) {
      container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 18px; font-size: 0.88rem;">Chưa có hoạt động nào được ghi nhận.</div>';
      return;
    }

    const typeMeta = {
      login: {
        color: 'var(--primary-blue, #2563eb)',
        bg: 'rgba(37, 99, 235, 0.1)',
        svg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>'
      },
      assignment_submission: {
        color: '#10b981',
        bg: 'rgba(16, 185, 129, 0.1)',
        svg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/></svg>'
      },
      assignment_grade: {
        color: '#059669',
        bg: 'rgba(5, 150, 105, 0.1)',
        svg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>'
      },
      leave_request: {
        color: '#8b5cf6',
        bg: 'rgba(139, 92, 246, 0.1)',
        svg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>'
      },
      leave: {
        color: '#8b5cf6',
        bg: 'rgba(139, 92, 246, 0.1)',
        svg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>'
      },
      question: {
        color: '#0284c7',
        bg: 'rgba(2, 132, 199, 0.1)',
        svg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>'
      },
      star_award: {
        color: '#d97706',
        bg: 'rgba(217, 119, 6, 0.1)',
        svg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>'
      },
      session: {
        color: '#d97706',
        bg: 'rgba(217, 119, 6, 0.1)',
        svg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/></svg>'
      }
    };

    const defaultMeta = {
      color: 'var(--text-secondary)',
      bg: 'var(--bg-card-subtle)',
      svg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>'
    };

    const statusBadgeClass = {
      'Thành công': 'badge-success',
      'Đã duyệt': 'badge-success',
      'Đã trả lời': 'badge-success',
      'Hoàn thành': 'badge-success',
      'Chờ xử lý': 'badge-primary',
      'Từ chối': 'badge-danger',
      'Bị khóa': 'badge-danger'
    };

    container.innerHTML = res.data.map(item => {
      const meta = typeMeta[item.type] || defaultMeta;
      const statusText = item.statusLabel || item.status || '';
      const badgeCls = statusBadgeClass[statusText] || 'badge-primary';

      return `
        <div style="display: flex; align-items: flex-start; gap: 12px; padding: 12px; background: var(--bg-card-subtle); border-radius: 8px; border: 1px solid var(--border-color);">
          <div style="width: 36px; height: 36px; border-radius: 8px; background: ${meta.bg}; color: ${meta.color}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            ${meta.svg}
          </div>
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 3px;">
              <strong style="font-size: 0.9rem; color: var(--text-main);">${escapeHtml(item.title)}</strong>
              ${statusText ? `<span class="badge ${badgeCls}" style="font-size: 0.72rem; padding: 2px 7px;">${escapeHtml(statusText)}</span>` : ''}
            </div>
            <div style="font-size: 0.82rem; color: var(--text-secondary); line-height: 1.4;">${escapeHtml(item.description)}</div>
            <div style="font-size: 0.74rem; color: var(--text-muted); margin-top: 4px;">${formatDateTimeVN(item.timestamp)}</div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Lỗi khi nạp lịch sử hoạt động:', err);
    container.innerHTML = '<div style="text-align: center; color: #ef4444; padding: 16px; font-size: 0.88rem;">Không thể tải lịch sử hoạt động.</div>';
  }
}

// ==========================================
// FORGOT PASSWORD MODAL (ADMIN SUPPORT)
// ==========================================
function openProfileForgotModal() {
  const u = state.currentUser;
  if (elements.profileForgotIdentifier) {
    elements.profileForgotIdentifier.value = u ? (u.traineeId || u.username) : '';
  }
  if (elements.profileForgotEmail) {
    elements.profileForgotEmail.value = u ? (u.email || '') : '';
  }
  if (elements.profileForgotPhone) {
    elements.profileForgotPhone.value = u ? (u.phone || '') : '';
  }
  if (elements.profileForgotNote) {
    elements.profileForgotNote.value = 'Em quên mật khẩu đăng nhập, nhờ Quản trị viên reset mật khẩu về mặc định giúp em.';
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
    if (window.showToast) {
      window.showToast('Đã gửi yêu cầu tới Admin! Quản trị viên sẽ kiểm tra và reset mật khẩu cho bạn.', 'success');
    }
  } catch (err) {
    if (window.showToast) window.showToast('Lỗi gửi yêu cầu: ' + err.message, 'danger');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

// ==========================================
// INITIALIZE PROFILE EVENT LISTENERS
// ==========================================
function initProfileEvents() {
  // 1. Avatar Actions
  const btnUpload = document.getElementById('btnUploadProfileAvatar');
  const fileInput = document.getElementById('profileAvatarFileInput');
  const btnConfirmAvatar = document.getElementById('btnConfirmUploadAvatar');
  const btnCancelAvatar = document.getElementById('btnCancelAvatarPreview');
  const btnRemove = document.getElementById('btnRemoveProfileAvatar');

  if (btnUpload && fileInput && !btnUpload.dataset.bound) {
    btnUpload.dataset.bound = 'true';
    btnUpload.addEventListener('click', () => fileInput.click());
  }

  if (fileInput && !fileInput.dataset.bound) {
    fileInput.dataset.bound = 'true';
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) handleAvatarFileSelect(file);
    });
  }

  if (btnConfirmAvatar && !btnConfirmAvatar.dataset.bound) {
    btnConfirmAvatar.dataset.bound = 'true';
    btnConfirmAvatar.addEventListener('click', handleConfirmUploadAvatar);
  }

  if (btnCancelAvatar && !btnCancelAvatar.dataset.bound) {
    btnCancelAvatar.dataset.bound = 'true';
    btnCancelAvatar.addEventListener('click', resetAvatarPreview);
  }

  if (btnRemove && !btnRemove.dataset.bound) {
    btnRemove.dataset.bound = 'true';
    btnRemove.addEventListener('click', handleRemoveAvatar);
  }

  // 2. Profile Info Form
  const infoForm = document.getElementById('profileInfoForm');
  if (infoForm && !infoForm.dataset.bound) {
    infoForm.dataset.bound = 'true';
    infoForm.addEventListener('submit', handleProfileInfoSubmit);
  }

  // 3. Password Form
  const passForm = document.getElementById('profileSecurityForm');
  if (passForm && !passForm.dataset.bound) {
    passForm.dataset.bound = 'true';
    passForm.addEventListener('submit', handleProfilePasswordSubmit);
  }

  // 4. Forgot password button & modal
  const btnForgot = document.getElementById('btnProfileSendForgotReq');
  if (btnForgot && !btnForgot.dataset.bound) {
    btnForgot.dataset.bound = 'true';
    btnForgot.addEventListener('click', openProfileForgotModal);
  }

  const btnRefreshAct = document.getElementById('btnRefreshActivities');
  if (btnRefreshAct && !btnRefreshAct.dataset.bound) {
    btnRefreshAct.dataset.bound = 'true';
    btnRefreshAct.addEventListener('click', () => {
      loadProfileActivities(canManage('trainees:manage') ? state.profileTargetId : undefined);
      if (window.showToast) window.showToast('Đã làm mới lịch sử hoạt động!', 'info');
    });
  }
}

// Run init events when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initProfileEvents);
} else {
  initProfileEvents();
}

// Expose globally
window.renderProfileView = renderProfileView;
window.loadProfileActivities = loadProfileActivities;
window.initProfileEvents = initProfileEvents;