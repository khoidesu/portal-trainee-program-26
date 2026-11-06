/**
 * ==============================================================================
 * COMPONENT: Admin Module (Trung Tâm Quản Trị Hệ Thống Toàn Diện)
 * CHỨC NĂNG CHÍNH: Quản trị danh sách Trainee (CRUD), cộng sao theo buổi học,
 *                  quản lý 11 bài tập rèn luyện (deadline & link), xử lý hỗ trợ.
 * LIÊN KẾT & PHỤ THUỘC: public/js/modules/core.js, public/js/api.js, public/js/duolingo.js
 * NHIỆM VỤ CHI TIẾT:
 *   - renderAdminView: Vẽ bảng điều khiển tổng quan quản trị
 *   - Quản lý Trainee: Modal tạo mới, sửa chỉ số KPI, xóa Trainee
 *   - setupAdminAwardStarsSection: Giao diện cộng sao hàng loạt theo danh sách buổi học
 *   - Quản lý 11 bài tập: renderAdminAssignmentsTable, sửa deadline countdown, lưu link
 *   - renderAdminSupportRequests: Duyệt và giải quyết yêu cầu quên mật khẩu
 * ==============================================================================
 */

// ==========================================
// ADMIN DASHBOARD & USER MANAGEMENT
// ==========================================

const permissionLabels = {
  'trainees:manage': 'Hồ sơ Trainee', 'schedules:manage': 'Lịch giảng dạy',
  'attendance:manage': 'Điểm danh và điểm sao', 'assignments:manage': 'Bài tập và bài nộp',
  'questions:manage': 'Q&A', 'leave:manage': 'Duyệt xin nghỉ'
};
let managedAccounts = [];

function formatAccountDate(value) {
  if (!value) return 'Chưa có';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('vi-VN') : 'Chưa có';
}

async function renderAdminView() {
  if (!canManage('accounts:manage')) return;
  const form = document.getElementById('accountEditorForm');
  const body = document.getElementById('accountsTableBody');
  if (!form || !body) return;
  if (!form.dataset.bound) {
    form.dataset.bound = 'true';
    document.getElementById('accountPermissions').innerHTML = '<legend>Quyền chỉnh sửa</legend>' +
      Object.entries(permissionLabels).map(([value, label]) => `<label><input type="checkbox" name="accountPermission" value="${value}"> ${label}</label>`).join('');
    document.getElementById('btnResetAccountForm').addEventListener('click', resetAccountEditor);
    document.getElementById('btnReloadAccounts').addEventListener('click', renderAdminView);
    document.getElementById('btnAdminRefreshSupport')?.addEventListener('click', renderAdminSupportRequests);
    document.getElementById('accountRole').addEventListener('change', updateAccountPermissionInputs);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = document.getElementById('btnSaveAccount');
      button.disabled = true;
      try {
        const id = document.getElementById('accountEditId').value;
        const activeValue = id ? (document.getElementById('accountActive')?.checked ?? true) : true;
        await API.saveAccount(id, {
          username: document.getElementById('accountUsername').value.trim(),
          fullName: document.getElementById('accountFullName').value.trim(),
          password: document.getElementById('accountPassword').value,
          role: document.getElementById('accountRole').value,
          active: activeValue,
          permissions: [...form.querySelectorAll('[name="accountPermission"]:checked')].map(input => input.value)
        });
        resetAccountEditor();
        document.getElementById('accountFeedback').textContent = 'Đã lưu tài khoản. Quyền mới có hiệu lực khi đăng nhập lại; các phiên cũ đã được thu hồi.';
        await renderAdminView();
      } catch (error) { document.getElementById('accountFeedback').textContent = error.message; }
      finally { button.disabled = false; }
    });
    resetAccountEditor();
  }
  body.innerHTML = '<tr><td colspan="5">Đang tải tài khoản…</td></tr>';
  try {
    managedAccounts = await API.getAccounts();
    body.innerHTML = managedAccounts.map(account => `<tr>
      <td><strong>${escapeHtml(account.username)}</strong><br>${escapeHtml(account.fullName)}${account.isOwner ? '' : `<br><small>Tạo: ${escapeHtml(formatAccountDate(account.createdAt))}<br>Đăng nhập: ${escapeHtml(formatAccountDate(account.lastLoginAt))}<br>Đổi mật khẩu: ${escapeHtml(formatAccountDate(account.lastPasswordChangeAt))}</small>${account.loginHistory?.length ? `<details><summary>${account.loginHistory.length} lần đăng nhập gần đây</summary>${account.loginHistory.map(log => `<div><small>${escapeHtml(formatAccountDate(log.timestamp))} · ${escapeHtml(log.ip || 'Không rõ IP')}</small></div>`).join('')}</details>` : ''}`}</td>
      <td class="text-center">${account.isOwner ? 'Quản trị gốc' : account.role === 'admin' ? 'Quản trị nội dung' : account.role === 'trainee' ? 'Trainee' : 'Trainer'}</td>
      <td class="text-center">${account.isOwner ? 'Toàn bộ, bao gồm quản lý tài khoản' : account.permissions.map(permission => permissionLabels[permission]).filter(Boolean).map(escapeHtml).join(', ') || 'Chỉ xem'}</td>
      <td class="text-center">${account.active ? (account.mustChangePassword ? 'Cần đổi mật khẩu' : 'Đang hoạt động') : 'Đã khóa'}</td>
      <td>${account.isOwner ? '<span class="badge badge-primary">Tài khoản Quản trị gốc</span>' : `<div class="context-actions">${account.role === 'trainee' ? `<button type="button" class="btn btn-outline btn-xs account-profile" data-trainee-id="${escapeHtml(account.traineeId || account.username)}">Hồ sơ</button>` : `<button type="button" class="btn btn-outline btn-xs account-edit" data-id="${escapeHtml(account.id)}">Sửa quyền</button>`}<button type="button" class="btn btn-outline btn-xs account-reset-password" data-id="${escapeHtml(account.id)}">Reset mật khẩu</button><button type="button" class="btn btn-outline btn-xs account-require-password" data-id="${escapeHtml(account.id)}">Yêu cầu đổi mật khẩu</button><button type="button" class="btn btn-outline btn-xs account-toggle" data-id="${escapeHtml(account.id)}">${account.active ? 'Khóa' : 'Mở khóa'}</button>${account.role === 'trainee' ? '' : `<button type="button" class="btn btn-danger btn-xs account-delete" data-id="${escapeHtml(account.id)}" data-username="${escapeHtml(account.username)}"><i class="fas fa-trash"></i> Xóa</button>`}</div>`}</td>
    </tr>`).join('');
    body.querySelectorAll('.account-profile').forEach(button => button.addEventListener('click', () => {
      state.profileTargetId = button.dataset.traineeId;
      switchTab('profile');
    }));
    body.querySelectorAll('.account-edit').forEach(button => button.addEventListener('click', () => {
      const account = managedAccounts.find(item => item.id === button.dataset.id);
      document.getElementById('accountEditId').value = account.id;
      document.getElementById('accountUsername').value = account.username;
      document.getElementById('accountUsername').disabled = true;
      document.getElementById('accountFullName').value = account.fullName;
      document.getElementById('accountRole').value = account.role;
      document.getElementById('accountPassword').value = '';
      document.getElementById('accountPassword').required = false;
      if (document.getElementById('accountActive')) document.getElementById('accountActive').checked = account.active;
      const activeLabel = document.getElementById('accountActiveLabel');
      if (activeLabel) activeLabel.style.display = 'none';
      form.querySelectorAll('[name="accountPermission"]').forEach(input => { input.checked = account.permissions.includes(input.value); });
      document.getElementById('accountEditorTitle').textContent = 'Sửa tài khoản ' + account.username;
      updateAccountPermissionInputs();
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    body.querySelectorAll('.account-toggle').forEach(button => button.addEventListener('click', async () => {
      const account = managedAccounts.find(item => item.id === button.dataset.id);
      button.disabled = true;
      try {
        await API.adminToggleAccountActive(account.id, !account.active);
        await renderAdminView();
      } catch (error) { document.getElementById('accountFeedback').textContent = error.message; button.disabled = false; }
    }));
    body.querySelectorAll('.account-reset-password').forEach(button => button.addEventListener('click', async () => {
      if (!confirm('Đặt lại mật khẩu của tài khoản này về mật khẩu mặc định và thu hồi các phiên đăng nhập cũ?')) return;
      button.disabled = true;
      const result = await API.adminResetPassword(button.dataset.id);
      document.getElementById('accountFeedback').textContent = result.message || 'Đã đặt lại mật khẩu.';
      button.disabled = false;
      await renderAdminView();
    }));
    body.querySelectorAll('.account-require-password').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      const result = await API.adminRequirePasswordChange(button.dataset.id);
      document.getElementById('accountFeedback').textContent = result.message || 'Đã yêu cầu đổi mật khẩu.';
      button.disabled = false;
      await renderAdminView();
    }));
    body.querySelectorAll('.account-delete').forEach(button => button.addEventListener('click', async () => {
      const id = button.dataset.id;
      const username = button.dataset.username;
      if (!confirm(`Xác nhận xóa vĩnh viễn tài khoản "${username}"?\nHành động này không thể hoàn tác.`)) return;
      button.disabled = true;
      try {
        const res = await API.deleteAccount(id);
        if (window.showToast) window.showToast(res.message || `Đã xóa tài khoản ${username} thành công!`, 'success');
        document.getElementById('accountFeedback').textContent = res.message || `Đã xóa tài khoản ${username}.`;
        await renderAdminView();
      } catch (error) {
        if (window.showToast) window.showToast(error.message || 'Lỗi khi xóa tài khoản', 'danger');
        document.getElementById('accountFeedback').textContent = error.message;
        button.disabled = false;
      }
    }));
  } catch (error) {
    body.innerHTML = '<tr><td colspan="5">Không tải được tài khoản. Bấm "Làm mới" để thử.</td></tr>';
    document.getElementById('accountFeedback').textContent = error.message;
  }
  await renderAdminSupportRequests();
}

function updateAccountPermissionInputs() {
  document.querySelectorAll('[name="accountPermission"]').forEach(input => {
    input.disabled = false;
  });
}

function resetAccountEditor() {
  document.getElementById('accountEditorForm').reset();
  document.getElementById('accountEditId').value = '';
  document.getElementById('accountUsername').disabled = false;
  document.getElementById('accountPassword').required = true;
  document.getElementById('accountEditorTitle').textContent = 'Tạo tài khoản';
  const activeInput = document.getElementById('accountActive');
  if (activeInput) activeInput.checked = true;
  const activeLabel = document.getElementById('accountActiveLabel');
  if (activeLabel) activeLabel.style.display = 'none';
  updateAccountPermissionInputs();
}

function renderAdminTable() {
  if (!elements.adminTraineesTableBody) return;

  if (canManage('accounts:manage') && managedAccounts.length === 0) {
    API.getAccounts().then(accounts => { managedAccounts = accounts; renderAdminTable(); }).catch(() => {});
  }

  let list = [...(state.trainees || [])];
  const accountMap = new Map(managedAccounts.filter(account => account.role === 'trainee').map(account => [String(account.traineeId || account.username).toLowerCase(), account]));
  const duplicateProfileCounts = (state.trainees || []).reduce((counts, trainee) => {
    const key = `${String(trainee.fullName || '').trim().toLocaleLowerCase('vi')}|${String(trainee.batch || '').trim().toLocaleLowerCase('vi')}`;
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map());

  // Filter by track
  if (state.adminSelectedTrack && state.adminSelectedTrack !== 'all') {
    list = list.filter(t => (t.track || '').includes(state.adminSelectedTrack) || (t.department || '').includes(state.adminSelectedTrack));
  }

  // Filter by status
  if (state.adminSelectedStatus && state.adminSelectedStatus !== 'all') {
    list = list.filter(t => {
      const s = (t.status || 'active').toLowerCase();
      const account = accountMap.get(String(t.traineeId).toLowerCase());
      if (state.adminSelectedStatus === 'active') return account?.active !== false && (s === 'active' || s === 'đang học');
      if (state.adminSelectedStatus === 'completed') return s === 'completed' || s === 'hoàn thành';
      if (state.adminSelectedStatus === 'inactive') return account?.active === false || s === 'inactive' || s === 'ngừng học' || s === 'đã khóa';
      return true;
    });
  }

  // Filter by search
  if (state.adminSearchQuery) {
    const q = state.adminSearchQuery.toLowerCase();
    list = list.filter(t =>
      (t.fullName || '').toLowerCase().includes(q) ||
      (t.traineeId || '').toLowerCase().includes(q) ||
      (t.email || '').toLowerCase().includes(q) ||
      (t.track || '').toLowerCase().includes(q) ||
      (t.department || '').toLowerCase().includes(q) ||
      (t.batch || '').toLowerCase().includes(q)
    );
  }

  if (list.length === 0) {
    elements.adminTraineesTableBody.innerHTML = '';
    if (elements.adminEmptyState) elements.adminEmptyState.style.display = 'block';
    return;
  }

  if (elements.adminEmptyState) elements.adminEmptyState.style.display = 'none';

  elements.adminTraineesTableBody.innerHTML = list.map(t => {
    const initials = getInitials(t.fullName);
    const attended = formatTraineeMetric(t.attendedSessions);
    const total = formatTraineeMetric(t.totalSessions);
    const attRate = Number.isFinite(t.attendanceRate) ? t.attendanceRate : null;
    const stars = formatTraineeMetric(t.accumulatedStars);
    const excused = formatTraineeMetric(t.absentExcused);
    const unexcused = formatTraineeMetric(t.absentUnexcused);
    const assignScore = Number.isFinite(t.assignmentScore) ? t.assignmentScore.toFixed(1) : '—';
    const rank = Number.isFinite(t.accumulatedStars) ? t.currentRank || t.rank || '—' : '—';
    const account = accountMap.get(String(t.traineeId).toLowerCase());
    const duplicateKey = `${String(t.fullName || '').trim().toLocaleLowerCase('vi')}|${String(t.batch || '').trim().toLocaleLowerCase('vi')}`;
    const hasDuplicateProfile = (duplicateProfileCounts.get(duplicateKey) || 0) > 1;

    return `
      <tr data-trainee-id="${t.traineeId}">
        <td>
          <div class="admin-user-cell">
            <div class="admin-user-avatar" style="padding: 0; overflow: hidden; background: transparent;">
              <img src="${getTraineeDicebearAvatar(t)}" alt="${escapeHtml(t.fullName)}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">
            </div>
            <div class="admin-user-info">
              <div class="admin-user-name-wrap">
                <span class="admin-user-name">${escapeHtml(t.fullName)}</span>${hasDuplicateProfile ? '<span class="badge-tag status-stopped duplicate-tag" title="Có nhiều hồ sơ trùng họ tên và lớp. Hãy đối chiếu MSSV trước khi thao tác.">Trùng tên · kiểm tra MSSV</span>' : ''}
              </div>
              <span class="admin-user-meta">MSSV: <strong>${escapeHtml(t.traineeId)}</strong> · ${escapeHtml(t.email)}</span>
            </div>
          </div>
        </td>
        <td>
          <div style="font-weight: 600;">${escapeHtml(t.batch || 'KHMT2026.2')}</div>
          <div style="font-size: 0.78rem; color: var(--text-muted);">${escapeHtml(t.track || 'Khoa KHMT')}</div>
          <div style="font-size: 0.74rem; margin-top: 3px; color: ${t.mentor?.name ? 'var(--primary-blue)' : 'var(--text-muted)'};">
            <i class="fas fa-user-tie" style="font-size: 0.7rem; margin-right: 3px;"></i>
            <span>${t.mentor?.name ? `Mentor: <strong>${escapeHtml(t.mentor.name)}</strong>` : '<em>Chưa công bố</em>'}</span>
          </div>
        </td>
        <td>
          <div class="star-chip">
             <span>${stars}</span> sao
          </div>
          <div style="font-size: 0.74rem; color: var(--text-muted); margin-top: 2px;">
            ${escapeHtml(t.starClassification || 'Chưa có dữ liệu')}
          </div>
        </td>
        <td>
          <div class="admin-att-wrap">
            <div class="admin-att-text">${attended}/${total} (${formatTraineeMetric(attRate, '%')})</div>
            <div class="admin-att-bar">
              <div class="admin-att-fill" style="width: ${Math.min(attRate || 0, 100)}%;"></div>
            </div>
          </div>
        </td>
        <td>
          <span class="excused-chip">${excused} buổi</span>
        </td>
        <td>
          <span class="unexcused-chip">${unexcused} buổi</span>
        </td>
        <td>
          <div style="font-weight: 700; color: var(--text-main); font-size: 0.95rem;">
            ${assignScore} <span style="font-size: 0.76rem; color: var(--text-muted); font-weight: normal;">/ 10</span>
          </div>
        </td>
        <td>
          <div style="font-weight: 700; font-size: 0.92rem;">
            ${rank === 1 ? ' Top 1' : rank === 2 ? ' Top 2' : rank === 3 ? ' Top 3' : `Hạng ${rank}`}
          </div>
        </td>
        <td>
          <div class="admin-actions-cell" style="display: flex; gap: 4px; justify-content: center; flex-wrap: wrap;">
            <button type="button" class="btn-admin-action view-btn" data-action="view-profile" data-id="${t.traineeId}" title="Xem hồ sơ cá nhân" style="background: rgba(37,99,235,0.1); color: var(--primary-blue); border-color: rgba(37,99,235,0.25);">
               Hồ sơ
            </button>
            <button type="button" class="btn-admin-action edit-btn" data-action="edit" data-id="${t.traineeId}" title="Sửa chỉ số và thông tin">
               Sửa
            </button>
            <button type="button" class="btn-admin-action reset-btn" data-action="reset-pass" data-id="${t.traineeId}" title="Reset về mật khẩu mặc định" style="background: rgba(245,158,11,0.1); color: #d97706; border-color: rgba(245,158,11,0.25);">
               Reset mật khẩu
            </button>
            <button type="button" class="btn-admin-action delete-btn" data-action="delete" data-id="${t.traineeId}" title="Xóa người dùng">
               Xóa
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Attach button events
  elements.adminTraineesTableBody.querySelectorAll('.btn-admin-action').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = btn.getAttribute('data-action');
      const id = btn.getAttribute('data-id');
      if (action === 'view-profile') {
        state.profileTargetId = id;
        switchTab('profile');
      } else if (action === 'edit') {
        openEditTraineeModal(id);
      } else if (action === 'reset-pass') {
        if (!confirm(`Xác nhận đặt lại mật khẩu mặc định cho Trainee (MSSV: ${id}) và thu hồi các phiên đăng nhập cũ?`)) return;
        btn.disabled = true;
        try {
          const res = await API.adminResetPassword(id);
          if (res && res.success) {
            if (window.showToast) window.showToast(res.message || 'Đã đặt lại mật khẩu về mặc định thành công!', 'success');
          } else {
            if (window.showToast) window.showToast(res?.message || 'Không thể đặt lại mật khẩu!', 'danger');
          }
        } catch (err) {
          if (window.showToast) window.showToast('Lỗi: ' + err.message, 'danger');
        } finally {
          btn.disabled = false;
        }
      } else if (action === 'delete') {
        openDeleteModal(id);
      }
    });
  });
}

function openCreateTraineeModal() {
  if (!elements.createTraineeModal) return;
  elements.createTraineeForm.reset();
  if (elements.createTrack) elements.createTrack.value = 'Khoa Khoa học Máy tính';
  if (elements.createBatch) elements.createBatch.value = 'KHMT2026.2';
  if (elements.createStars) elements.createStars.value = '25';
  if (elements.createAttended) elements.createAttended.value = '40';
  if (elements.createTotalSessions) elements.createTotalSessions.value = '0';
  if (elements.createExcused) elements.createExcused.value = '0';
  if (elements.createUnexcused) elements.createUnexcused.value = '0';
  if (elements.createAssignmentScore) elements.createAssignmentScore.value = '';

  elements.createTraineeModal.classList.add('open', 'show');
  if (elements.createTraineeId) elements.createTraineeId.focus();
}

function closeCreateTraineeModal() {
  if (elements.createTraineeModal) {
    elements.createTraineeModal.classList.remove('open', 'show');
  }
}

async function handleCreateTraineeSubmit(e) {
  e.preventDefault();
  const data = {
    traineeId: elements.createTraineeId.value.trim(),
    fullName: elements.createFullName.value.trim(),
    email: elements.createEmail.value.trim(),
    track: elements.createTrack.value,
    department: elements.createTrack.value.replace('Khoa ', ''),
    batch: elements.createBatch.value.trim(),
    accumulatedStars: Number(elements.createStars.value) || 0,
    attendedSessions: Number(elements.createAttended.value) || 0,
    totalSessions: Number(elements.createTotalSessions.value) || 0,
    absentExcused: Number(elements.createExcused.value) || 0,
    absentUnexcused: Number(elements.createUnexcused.value) || 0,
    assignmentScore: elements.createAssignmentScore.value === '' ? null : Number(elements.createAssignmentScore.value),
    completedAssignments: 0,
    totalAssignments: 11,
    role: 'student'
  };

  const res = await window.API.createTrainee(data);
  if (res && res.success) {
    closeCreateTraineeModal();
    if (window.showToast) {
      window.showToast(`Đã tạo mới Trainee ${data.fullName}!`, 'success');
    }
    await refreshPortalData();
  } else {
    alert(res?.message || 'Lỗi khi tạo Trainee');
  }
}

function openEditTraineeModal(traineeId) {
  const t = (state.trainees || []).find(item => item.traineeId === traineeId);
  if (!t || !elements.editTraineeModal) return;

  elements.editTraineeIdHidden.value = t.traineeId;
  elements.editTraineeId.value = t.traineeId;
  elements.editFullName.value = t.fullName || '';
  elements.editEmail.value = t.email || '';
  elements.editTrack.value = t.track || '';
  elements.editBatch.value = t.batch || '';
  if (elements.editProgramStatus) elements.editProgramStatus.value = ({ Active: 'Đang học', Completed: 'Hoàn thành', Inactive: 'Ngừng học' })[t.status] || t.status || 'Đang học';
  if (elements.editMentorName) elements.editMentorName.value = t.mentor?.name || '';
  if (elements.editMentorEmail) elements.editMentorEmail.value = t.mentor?.email || '';
  if (elements.editMentorRole) elements.editMentorRole.value = t.mentor?.role || '';
  if (elements.editMentorPhone) elements.editMentorPhone.value = t.mentor?.phone || '';

  elements.editAttendedSessions.value = t.attendedSessions !== undefined ? t.attendedSessions : 40;
  elements.editTotalSessions.value = t.totalSessions ?? '';
  elements.editAbsentExcused.value = t.absentExcused !== undefined ? t.absentExcused : 0;
  elements.editAbsentUnexcused.value = t.absentUnexcused !== undefined ? t.absentUnexcused : 0;
  elements.editAssignmentScore.value = t.assignmentScore ?? '';

  // RÀNG BUỘC CẬP NHẬT SAO THEO TỪNG BUỔI HỌC CỦA Trainee
  renderEditTraineeSessionStars(t);

  if (elements.btnDeleteFromEditModal) {
    elements.btnDeleteFromEditModal.onclick = () => {
      openDeleteModal(traineeId);
    };
  }

  // Nút thêm buổi học mới cho Trainee này
  if (elements.btnAddSessionToStudentBtn) {
    elements.btnAddSessionToStudentBtn.onclick = () => {
      addNewSessionRowToStudentModal();
    };
  }

  elements.editTraineeModal.classList.add('open', 'show');
  if (elements.editFullName) elements.editFullName.focus();
}

function renderEditTraineeSessionStars(t) {
  const container = elements.editTraineeSessionsContainer;
  if (!container) return;

  let sessionList = (t.sessionStars && t.sessionStars.length > 0) ? t.sessionStars : [];

  if (sessionList.length === 0) {
    container.textContent = 'Chưa có dữ liệu sao từng buổi. Thêm buổi học để ghi nhận thực tế.';
    return;
  }

  container.innerHTML = sessionList.map((s, idx) => `
    <div class="edit-session-card" data-code="${escapeHtml(s.sessionCode || `TP-M10.0${idx + 1}`)}"
         data-title="${escapeHtml(s.sessionTitle || `Buổi ${idx + 1}`)}"
         data-date="${escapeHtml(s.sessionDate || '2026-10-06')}"
         data-trainer="${escapeHtml(s.trainerName || 'Võ Thị Xuân Quỳnh')}"
         data-stage="${escapeHtml(s.stage || 'Giai đoạn 1')}"
         data-stagename="${escapeHtml(s.stageName || 'Training')}">
      <div class="edit-session-badge">Buổi ${idx + 1}</div>
      <div class="edit-session-info">
        <div class="edit-session-title" title="${escapeHtml(s.sessionTitle)}">
          [${escapeHtml(s.sessionCode || `TP-M10.0${idx + 1}`)}] ${escapeHtml(s.sessionTitle)}
        </div>
        <div class="edit-session-date">
           ${s.sessionDate ? formatDateVN(s.sessionDate) : '2026-10-06'} · Trainer: <strong>${escapeHtml(s.trainerName || 'Võ Thị Xuân Quỳnh')}</strong>
        </div>
      </div>
      <div class="edit-session-inputs">
        <span style="font-size: 0.76rem; font-weight: 700; color: #d97706;">+</span>
        <input type="number" class="session-star-num-input" min="-20" max="100" value="${s.starsAwarded !== undefined ? s.starsAwarded : 0}" title="Số sao cộng buổi này">
        <input type="text" class="session-note-txt-input" placeholder="Nhận xét / lý do cộng sao" value="${escapeHtml(s.note || '')}" title="Nhận xét của trainer trong buổi học">
      </div>
    </div>
  `).join('');

  // Lắng nghe sự kiện thay đổi số sao từng buổi để tự động cộng dồn lên editStars
  const recalculateTotalStars = () => {
    let sum = 0;
    container.querySelectorAll('.session-star-num-input').forEach(inp => {
      sum += Number(inp.value) || 0;
    });
    if (elements.editStars) {
      elements.editStars.value = sum;
    }
  };

  container.querySelectorAll('.session-star-num-input').forEach(inp => {
    inp.addEventListener('input', recalculateTotalStars);
  });

  recalculateTotalStars();
}

function addNewSessionRowToStudentModal() {
  const container = elements.editTraineeSessionsContainer;
  if (!container) return;

  const currentCount = container.querySelectorAll('.edit-session-card').length;
  const nextNum = currentCount + 1;
  const nextCode = `TP-M10.0${nextNum}`;
  const todayStr = new Date().toISOString().slice(0, 10);

  const newCard = document.createElement('div');
  newCard.className = 'edit-session-card';
  newCard.setAttribute('data-code', nextCode);
  newCard.setAttribute('data-title', `Buổi ${nextNum}: Chuyên đề Thực hành Nâng cao & Đồ án`);
  newCard.setAttribute('data-date', todayStr);
  newCard.setAttribute('data-trainer', 'Võ Thị Xuân Quỳnh');
  newCard.setAttribute('data-stage', 'Giai đoạn 1');
  newCard.setAttribute('data-stagename', 'Training');

  newCard.innerHTML = `
    <div class="edit-session-badge">Buổi ${nextNum}</div>
    <div class="edit-session-info">
      <div class="edit-session-title">
        [${nextCode}] Buổi ${nextNum}: Chuyên đề Thực hành Nâng cao & Đồ án
      </div>
      <div class="edit-session-date">
         ${formatDateVN(todayStr)} · Trainer: <strong>Võ Thị Xuân Quỳnh</strong>
      </div>
    </div>
    <div class="edit-session-inputs">
      <span style="font-size: 0.76rem; font-weight: 700; color: #d97706;">+</span>
      <input type="number" class="session-star-num-input" min="0" max="100" value="5" title="Số sao cộng buổi này">
      <input type="text" class="session-note-txt-input" placeholder="Nhận xét / lý do cộng sao" value="Tham gia tích cực buổi đào tạo" title="Nhận xét của trainer">
    </div>
  `;

  container.appendChild(newCard);

  const recalculateTotalStars = () => {
    let sum = 0;
    container.querySelectorAll('.session-star-num-input').forEach(inp => {
      sum += Math.max(0, Number(inp.value) || 0);
    });
    if (elements.editStars) {
      elements.editStars.value = sum;
    }
  };

  newCard.querySelector('.session-star-num-input').addEventListener('input', recalculateTotalStars);
  recalculateTotalStars();
}

function closeEditTraineeModal() {
  if (elements.editTraineeModal) {
    elements.editTraineeModal.classList.remove('open', 'show');
  }
}

async function handleEditTraineeSubmit(e) {
  e.preventDefault();
  const id = elements.editTraineeIdHidden.value;
  if (!id) return;

  // Thu thập danh sách buổi học & số sao từng buổi (Ràng buộc theo buổi)
  const sessionCards = document.querySelectorAll('#editTraineeSessionsContainer .edit-session-card');
  const sessionStars = [];
  let calculatedTotalStars = 0;

  sessionCards.forEach((card, idx) => {
    const starInp = card.querySelector('.session-star-num-input');
    const noteInp = card.querySelector('.session-note-txt-input');
    const code = card.getAttribute('data-code') || `TP-M10.0${idx + 1}`;
    const title = card.getAttribute('data-title') || `Buổi ${idx + 1}`;
    const date = card.getAttribute('data-date') || '2026-10-06';
    const stage = card.getAttribute('data-stage') || 'Giai đoạn 1';
    const stageName = card.getAttribute('data-stagename') || 'Training';
    const trainerName = card.getAttribute('data-trainer') || 'Võ Thị Xuân Quỳnh';
    const starsAwarded = Number(starInp ? starInp.value : 0) || 0;
    const note = (noteInp && noteInp.value ? noteInp.value.trim() : '') || 'Hoàn thành buổi học';

    calculatedTotalStars += starsAwarded;
    const previousLog = state.currentEditTrainee?.sessionStars?.find(log => log.sessionCode === code)
      || state.trainees.find(trainee => trainee.traineeId === elements.editTraineeId.value)?.sessionStars?.find(log => log.sessionCode === code);
    sessionStars.push({
      ...previousLog,
      sessionCode: code,
      sessionTitle: title,
      sessionDate: date,
      stage,
      stageName,
      trainerName,
      starsAwarded,
      note
    });
  });

  const mentorName = elements.editMentorName ? elements.editMentorName.value.trim() : '';
  const mentorEmail = elements.editMentorEmail ? elements.editMentorEmail.value.trim() : '';
  const mentorRole = elements.editMentorRole ? elements.editMentorRole.value.trim() : '';
  const mentorPhone = elements.editMentorPhone ? elements.editMentorPhone.value.trim() : '';

  let mentor = null;
  if (mentorName) {
    mentor = {
      name: mentorName,
      email: mentorEmail,
      role: mentorRole || 'Mentor Trainee Program',
      phone: mentorPhone,
      avatarInitial: getInitials(mentorName)
    };
  }

  const updateData = {
    fullName: elements.editFullName.value.trim(),
    email: elements.editEmail.value.trim(),
    track: elements.editTrack.value.trim(),
    batch: elements.editBatch.value.trim(),
    status: elements.editProgramStatus?.value || 'Đang học',
    mentor,
    accumulatedStars: calculatedTotalStars,
    sessionStars: sessionStars, // Cập nhật sessionStars đồng bộ MongoDB
    attendedSessions: Number(elements.editAttendedSessions.value),
    totalSessions: Number(elements.editTotalSessions.value) || 0,
    absentExcused: Number(elements.editAbsentExcused.value),
    absentUnexcused: Number(elements.editAbsentUnexcused.value),
    assignmentScore: elements.editAssignmentScore.value === '' ? null : Number(elements.editAssignmentScore.value)
  };

  const btnSubmit = document.getElementById('btnSubmitEditTrainee');
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = ' Đang lưu...';
  }

  try {
    const res = await window.API.updateTrainee(id, updateData);
    if (res && res.success) {
      closeEditTraineeModal();
      const updatedTrainee = res.data;
      if (updatedTrainee) {
        const idx = (state.trainees || []).findIndex(trainee => trainee.traineeId === id);
        if (idx !== -1) {
          state.trainees[idx] = { ...state.trainees[idx], ...updatedTrainee, mentor: updatedTrainee.mentor || mentor };
        }
      }
      if (window.showToast) {
        window.showToast(`Đã lưu thay đổi cho Trainee ${updateData.fullName}! (Tổng: ${calculatedTotalStars} ⭐)`, 'success');
      }
      await refreshPortalData();
      if (state.currentTraineeId === id) {
        await loadCurrentTrainee(id);
      }
      if (typeof renderAdminTraineesTable === 'function') {
        renderAdminTraineesTable();
      }
      if (state.currentTab === 'profile' && state.profileTargetId === id && typeof renderProfileView === 'function') {
        renderProfileView();
      }
    } else {
      alert(res?.message || 'Lỗi khi cập nhật Trainee');
    }
  } catch (err) {
    alert('Lỗi kết nối máy chủ: ' + err.message);
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = ' Lưu thay đổi';
    }
  }
}

// ==========================================
// CUSTOM DELETE CONFIRMATION MODAL & ACTIONS
// ==========================================
function openDeleteModal(traineeId) {
  const t = (state.trainees || []).find(item => item.traineeId === traineeId);
  const name = t ? t.fullName : traineeId;
  if (elements.deleteTargetTraineeId) elements.deleteTargetTraineeId.value = traineeId;
  if (elements.deleteConfirmMessage) {
    elements.deleteConfirmMessage.innerHTML = `Bạn có chắc chắn muốn XÓA Trainee <strong>${escapeHtml(name)}</strong> (MSSV: <code>${escapeHtml(traineeId)}</code>) khỏi hệ thống?`;
  }
  if (elements.deleteTraineeConfirmModal) {
    elements.deleteTraineeConfirmModal.classList.add('open', 'show');
  }
}

function closeDeleteModal() {
  if (elements.deleteTraineeConfirmModal) {
    elements.deleteTraineeConfirmModal.classList.remove('open', 'show');
  }
}

async function confirmDeleteTrainee() {
  const traineeId = elements.deleteTargetTraineeId ? elements.deleteTargetTraineeId.value : null;
  if (!traineeId) return;

  if (elements.confirmDeleteTraineeBtn) {
    elements.confirmDeleteTraineeBtn.disabled = true;
    elements.confirmDeleteTraineeBtn.textContent = 'Đang xóa...';
  }

  try {
    const res = await window.API.deleteTrainee(traineeId);
    if (res && res.success) {
      closeDeleteModal();
      closeEditTraineeModal();
      if (window.showToast) {
        window.showToast(res.message || `Đã xóa Trainee thành công!`, 'info');
      }
      await refreshPortalData();
      if (state.currentTraineeId === traineeId && state.trainees.length > 0) {
        state.currentTraineeId = state.trainees[0].traineeId;
        await loadCurrentTrainee(state.currentTraineeId);
      }
    } else {
      alert(res?.message || 'Lỗi khi xóa tài khoản Trainee');
    }
  } catch (err) {
    console.error('Lỗi khi xóa người dùng:', err);
    alert('Lỗi kết nối khi xóa tài khoản: ' + err.message);
  } finally {
    if (elements.confirmDeleteTraineeBtn) {
      elements.confirmDeleteTraineeBtn.disabled = false;
      elements.confirmDeleteTraineeBtn.textContent = ' Đồng ý xóa vĩnh viễn';
    }
  }
}

function handleDeleteTrainee(traineeId) {
  openDeleteModal(traineeId);
}


// ==========================================
// ADMIN SUPPORT REQUESTS MANAGEMENT
// ==========================================

async function renderAdminSupportRequests() {
  const body = elements.adminSupportTableBody;
  if (!body) return;
  body.innerHTML = '<tr><td colspan="9" class="text-center" style="padding: 24px; color: var(--text-muted);">Đang tải yêu cầu…</td></tr>';
  if (elements.adminSupportEmptyState) elements.adminSupportEmptyState.style.display = 'none';
  try {
    const requests = await API.getSupportRequests();
    const pending = requests.filter(item => item.status === 'pending').length;
    if (elements.adminSupportPendingBadge) elements.adminSupportPendingBadge.textContent = `${pending} chờ xử lý`;
    if (!requests.length) {
      body.innerHTML = '<tr><td colspan="9" class="text-center" style="padding: 36px 16px; color: var(--text-muted); font-size: 0.9rem;"><i class="fas fa-inbox" style="font-size: 24px; display: block; margin-bottom: 8px; opacity: 0.5;"></i>Hiện chưa có yêu cầu hỗ trợ tài khoản nào.</td></tr>';
      if (elements.adminSupportEmptyState) elements.adminSupportEmptyState.style.display = 'none';
      return;
    }
    body.innerHTML = requests.map((item, index) => {
      const leave = item.type === 'leave';
      const type = leave ? 'Xin nghỉ' : item.type === 'forgot_password' ? 'Quên mật khẩu' : 'Hỗ trợ';
      const status = item.status === 'pending' ? 'Chờ xử lý' : item.status === 'rejected' ? 'Từ chối' : leave ? 'Đã duyệt' : 'Đã xử lý';
      const statusBadgeClass = item.status === 'pending' ? 'badge-warning' : item.status === 'rejected' ? 'badge-danger' : 'badge-success';
      const button = (action, label, btnClass = 'btn-secondary') => `<button type="button" class="btn btn-xs ${btnClass}" data-support-action="${action}" data-support-id="${escapeHtml(item._id)}">${label}</button>`;
      let actions = '';
      if (leave) {
        if (item.status === 'pending') actions += `<div class="context-actions justify-content-center" style="gap: 6px;">${button('approve', 'Duyệt', 'btn-primary')}${button('reject', 'Từ chối', 'btn-danger')}</div>`;
      } else {
        actions = `<div class="context-actions justify-content-center" style="gap: 6px;">`;
        if (item.type === 'forgot_password') actions += button('password', 'Đặt lại MK', 'btn-primary');
        actions += button('delete', 'Xóa', 'btn-outline');
        actions += `</div>`;
      }
      return `<tr>
        <td class="text-center">${index + 1}</td>
        <td class="text-center"><span class="badge ${leave ? 'badge-primary' : 'badge-secondary'}">${type}</span></td>
        <td class="text-center"><strong>${escapeHtml(item.traineeId)}</strong></td>
        <td><strong>${escapeHtml(item.fullName)}</strong></td>
        <td>${escapeHtml(item.email || '--')}${item.phone ? '<br><small style="color: var(--text-muted);">' + escapeHtml(item.phone) + '</small>' : ''}</td>
        <td style="max-width: 260px; word-break: break-word;">${leave ? `<strong>${escapeHtml(item.scheduleCode)} · ${escapeHtml(item.scheduleDate)}</strong><br>` : ''}${escapeHtml(item.message || '--')}</td>
        <td class="text-center"><small>${escapeHtml(new Date(item.createdAt).toLocaleString('vi-VN'))}</small></td>
        <td class="text-center"><span class="badge ${statusBadgeClass}">${status}</span></td>
        <td class="text-center">${actions}</td>
      </tr>`;
    }).join('');
    body.onclick = async event => {
      const button = event.target.closest('[data-support-action]');
      if (!button || !body.contains(button)) return;
      const { supportAction: action, supportId: id } = button.dataset;
      if (action === 'password') return window.handleResolveSupport(id);
      if (action === 'delete') return window.handleDeleteSupport(id);
      if (!confirm('Xác nhận xử lý đơn? Chuyên cần được cập nhật riêng trong bảng Trainee.')) return;
      button.disabled = true;
      try {
        const result = await API.updateLeave(id, action === 'approve' ? 'resolved' : 'rejected');
        window.showToast?.(result.message || 'Đã xử lý.', result.success ? 'success' : 'danger');
        await renderAdminSupportRequests();
      } catch {
        window.showToast?.('Không kết nối được máy chủ. Vui lòng thử lại.', 'danger');
        button.disabled = false;
      }
    };
  } catch {
    body.innerHTML = '<tr><td colspan="9">Không tải được yêu cầu. Vui lòng đăng nhập lại hoặc bấm làm mới.</td></tr>';
  }
}

window.handleResolveSupport = async function(id) {
  if (!confirm('Đặt lại tài khoản về mật khẩu mặc định, thu hồi phiên cũ và yêu cầu Trainee đổi mật khẩu?')) return;
  const result = await API.resolveSupportRequest(id);
  window.showToast?.(result.success ? 'Đã đặt lại mật khẩu.' : result.message || 'Không thể đặt lại mật khẩu.', result.success ? 'success' : 'danger');
  await renderAdminSupportRequests();
};

window.handleDeleteSupport = async function(id) {
  if (!confirm('Bạn có chắc muốn xóa yêu cầu này?')) return;
  const result = await API.deleteSupportRequest(id);
  window.showToast?.(result.success ? 'Đã xóa yêu cầu.' : result.message || 'Không thể xóa yêu cầu.', result.success ? 'success' : 'danger');
  await renderAdminSupportRequests();
};


// ==========================================
// ADMIN TỔNG HỢP & CỘNG SAO THEO BUỔI HỌC
// ==========================================

async function setupAdminAwardStarsSection() {
  const form = document.getElementById('adminAwardStarsForm');
  const selectSchedule = document.getElementById('awardSelectSchedule');
  const selectTrainee = document.getElementById('awardSelectTrainee');
  const selectStage = document.getElementById('awardSelectStage');
  const inputStars = document.getElementById('awardInputStars');
  const inputNote = document.getElementById('awardInputNote');
  const inputTrainer = document.getElementById('awardInputTrainer');

  // Nút cộng sao nhanh (+1, +2, +5, +10, +15)
  document.querySelectorAll('.btn-quick-star').forEach(btn => {
    btn.onclick = () => {
      const val = btn.getAttribute('data-val');
      if (inputStars && val) inputStars.value = val;
    };
  });

  // Nạp danh sách buổi học từ Lịch đào tạo
  if (selectSchedule) {
    let schedules = state.schedules || [];
    if (schedules.length === 0) {
      try {
        const month = window.ScheduleManager.selectedMonth;
        const year = window.ScheduleManager.selectedYear;
        schedules = await API.getSchedules({ month, year });
        state.schedules = schedules;
      } catch (e) {
        console.warn('Lỗi tải schedules cho award form:', e);
      }
    }

    if (schedules.length > 0) {
      selectSchedule.innerHTML = schedules.map(s =>
        `<option value="${escapeHtml(s.code)}" data-title="${escapeHtml(s.title)}" data-date="${escapeHtml(s.date)}">[${escapeHtml(s.code)}] ${escapeHtml(s.title)} (${formatDateVN(s.date)})</option>`
      ).join('');
    } else {
      selectSchedule.innerHTML = '<option value="">Chưa có lịch học cho tháng đang chọn</option>';
    }
  }

  // Nạp danh sách Trainee
  if (selectTrainee) {
    const trainees = state.trainees || [];
    selectTrainee.innerHTML = `
      <option value="all"> Tất cả Trainee (Cộng đồng loạt ${trainees.length} Trainee)</option>
      ${trainees.map(t => `<option value="${escapeHtml(t.traineeId)}">${escapeHtml(t.traineeId)} - ${escapeHtml(t.fullName)} (${t.accumulatedStars || 0} )</option>`).join('')}
    `;
  }

  // Render bảng lịch sử cộng sao gần nhất
  renderAdminRecentAwardsTable();

  // Khởi tạo Bảng Chấm Điểm & Cập Nhật Sao Theo Buổi (Cho Toàn Bộ Trainee)
  if (selectSchedule) {
    selectSchedule.addEventListener('change', () => {
      renderAdminSessionGradingRoster(selectSchedule.value);
    });
    // Gọi khởi tạo ngay
    renderAdminSessionGradingRoster(selectSchedule.value);
  }

  // Nút gán sao nhanh cho tất cả Trainee trong bảng chấm điểm buổi
  const btnQuick5 = document.getElementById('btnQuickSetAllStars');
  const btnQuick10 = document.getElementById('btnQuickSetAllStars10');
  if (btnQuick5 && !btnQuick5.dataset.bound) {
    btnQuick5.dataset.bound = 'true';
    btnQuick5.onclick = () => {
      document.querySelectorAll('#adminSessionGradingTableBody .grading-star-input').forEach(inp => inp.value = 5);
      if (window.showToast) window.showToast('Đã đặt +5  cho tất cả Trainee buổi này!', 'info');
    };
  }
  if (btnQuick10 && !btnQuick10.dataset.bound) {
    btnQuick10.dataset.bound = 'true';
    btnQuick10.onclick = () => {
      document.querySelectorAll('#adminSessionGradingTableBody .grading-star-input').forEach(inp => inp.value = 10);
      if (window.showToast) window.showToast('Đã đặt +10  cho tất cả Trainee buổi này!', 'info');
    };
  }

  // Nút lưu toàn bộ điểm sao buổi học vào MongoDB
  const btnSaveBatch = document.getElementById('btnSaveBatchSessionStars');
  if (btnSaveBatch && !btnSaveBatch.dataset.bound) {
    btnSaveBatch.dataset.bound = 'true';
    btnSaveBatch.onclick = async () => {
      const selectedOption = selectSchedule ? selectSchedule.options[selectSchedule.selectedIndex] : null;
      const sessionCode = selectSchedule ? selectSchedule.value : 'TP-M10.01';
      const sessionTitle = selectedOption ? selectedOption.getAttribute('data-title') : 'Buổi đào tạo';
      const sessionDate = selectedOption ? selectedOption.getAttribute('data-date') : '2026-10-06';
      const stageOption = selectStage ? selectStage.options[selectStage.selectedIndex] : null;
      const stage = selectStage ? selectStage.value : 'Giai đoạn 1';
      const stageName = stageOption ? stageOption.getAttribute('data-stagename') : 'Training';
      const trainerName = (inputTrainer && inputTrainer.value ? inputTrainer.value.trim() : '') || 'Võ Thị Xuân Quỳnh';

      // Thu thập điểm của từng Trainee
      const rows = document.querySelectorAll('#adminSessionGradingTableBody tr');
      const studentRatings = [];

      rows.forEach(tr => {
        const traineeId = tr.getAttribute('data-trainee-id');
        const starInp = tr.querySelector('.grading-star-input');
        const noteInp = tr.querySelector('.grading-note-input');
        if (traineeId && starInp && !starInp.disabled && starInp.value !== '') {
          studentRatings.push({
            traineeId,
            starsAwarded: Number(starInp.value) || 0,
            note: noteInp ? noteInp.value.trim() : 'Hoàn thành bài tập & tham gia tích cực'
          });
        }
      });

      if (studentRatings.length === 0) {
        if (window.showToast) window.showToast('Không có dữ liệu Trainee để lưu!', 'warning');
        return;
      }

      btnSaveBatch.disabled = true;
      btnSaveBatch.innerHTML = `<span> Đang lưu...</span>`;

      try {
        const res = await API.batchUpdateSessionStars({
          sessionCode,
          sessionTitle,
          sessionDate,
          trainerName,
          stage,
          stageName,
          studentRatings
        });

        if (res && res.success) {
          if (window.showToast) {
            window.showToast(res.message || `Đã cập nhật bảng điểm ${sessionCode} cho toàn bộ Trainee thành công!`, 'success');
          }

          await loadTrainees();
          if (state.currentTrainee) {
            await loadCurrentTrainee(state.currentTrainee.traineeId);
          }

          renderAdminRecentAwardsTable();
          renderAdminTable();
          renderLeaderboard();
          renderGradesView();
          renderAdminSessionGradingRoster(sessionCode);

          if (state.currentTrainee && window.renderStarChart) {
            window.renderStarChart(state.currentTrainee.starHistory, state.currentTrainee.accumulatedStars);
          }
        } else {
          if (window.showToast) window.showToast((res && res.message) || 'Lỗi khi cập nhật bảng điểm buổi học!', 'danger');
        }
      } catch (err) {
        if (window.showToast) window.showToast('Lỗi kết nối máy chủ: ' + err.message, 'danger');
      } finally {
        btnSaveBatch.disabled = false;
        btnSaveBatch.innerHTML = `

          <span> Lưu điểm buổi học này</span>
        `;
      }
    };
  }

  // Xử lý gửi form cộng sao đơn lẻ / nhanh
  if (form && !form.dataset.bound) {
    form.dataset.bound = 'true';
    form.onsubmit = async (e) => {
      e.preventDefault();
      const selectedOption = selectSchedule ? selectSchedule.options[selectSchedule.selectedIndex] : null;
      const scheduleCode = selectSchedule ? selectSchedule.value : 'TP-M10.0X';
      const scheduleTitle = selectedOption ? selectedOption.getAttribute('data-title') : '';
      const sessionDate = selectedOption ? selectedOption.getAttribute('data-date') : '';
      const traineeId = selectTrainee ? selectTrainee.value : 'all';
      const stageOption = selectStage ? selectStage.options[selectStage.selectedIndex] : null;
      const stage = selectStage ? selectStage.value : 'Giai đoạn 1';
      const stageName = stageOption ? stageOption.getAttribute('data-stagename') : 'Training';
      const starsAwarded = Number(inputStars ? inputStars.value : 0) || 0;
      const note = (inputNote && inputNote.value ? inputNote.value.trim() : '') || 'Hoàn thành bài tập & tham gia tích cực buổi học';
      const trainerName = (inputTrainer && inputTrainer.value ? inputTrainer.value.trim() : '') || 'Võ Thị Xuân Quỳnh';

      if (starsAwarded <= 0) {
        if (window.showToast) window.showToast('Số sao được cộng phải lớn hơn 0!', 'warning');
        return;
      }

      const btnSubmit = document.getElementById('btnSubmitAwardStars');
      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = `<span> Đang lưu...</span>`;
      }

      try {
        const res = await API.awardSessionStars({
          traineeId,
          scheduleCode,
          scheduleTitle,
          sessionDate,
          stage,
          stageName,
          starsAwarded,
          note,
          trainerName
        });

        if (res && res.success) {
          if (window.showToast) window.showToast(res.message || 'Cộng sao thành công!', 'success');

          // Tải lại danh sách Trainee & Trainee hiện tại
          await loadTrainees();
          if (state.currentTrainee) {
            await loadCurrentTrainee(state.currentTrainee.traineeId);
          }

          // Cập nhật lại các bảng hiển thị
          renderAdminRecentAwardsTable();
          renderAdminTable();
          renderLeaderboard();
          renderGradesView();
          renderAdminSessionGradingRoster(scheduleCode);

          // Cập nhật biểu đồ Diễn biến sao ở trang chủ nếu đang mở
          if (state.currentTrainee && window.renderStarChart) {
            window.renderStarChart(state.currentTrainee.starHistory, state.currentTrainee.accumulatedStars);
          }
        } else {
          if (window.showToast) window.showToast((res && res.message) || 'Lỗi khi cộng sao!', 'danger');
        }
      } catch (err) {
        if (window.showToast) window.showToast('Lỗi kết nối máy chủ: ' + err.message, 'danger');
      } finally {
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.innerHTML = `

            <span> Xác Nhận Cộng Sao &amp; Đồng Bộ</span>
          `;
        }
      }
    };
  }
}

function renderAdminSessionGradingRoster(sessionCode) {
  const tbody = document.getElementById('adminSessionGradingTableBody');
  if (!tbody) return;

  const trainees = state.trainees || [];
  if (trainees.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: var(--text-muted);">Đang tải danh sách Trainee...</td></tr>`;
    return;
  }

  tbody.innerHTML = trainees.map((t, idx) => {
    const existingLog = (t.sessionStars || []).find(s => s.sessionCode === sessionCode);
    const stars = existingLog !== undefined ? existingLog.starsAwarded : '';
    const note = existingLog ? existingLog.note : '';
    const cumulative = existingLog ? existingLog.cumulativeStars : (t.accumulatedStars || 0);
    const avatarUrl = getTraineeDicebearAvatar(t);

    return `
      <tr data-trainee-id="${escapeHtml(t.traineeId)}">
        <td style="text-align: center; font-weight: 700; color: var(--text-muted);">${idx + 1}</td>
        <td>
          <div class="admin-user-cell">
            <div class="admin-user-avatar" style="padding: 0; overflow: hidden; background: transparent; width: 32px; height: 32px;">
              <img src="${avatarUrl}" alt="${escapeHtml(t.fullName)}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">
            </div>
            <div class="admin-user-info">
              <span class="admin-user-name" style="font-weight: 700;">${escapeHtml(t.fullName)}</span>
              <span class="admin-user-meta">MSSV: <strong>${escapeHtml(t.traineeId)}</strong></span>
            </div>
          </div>
        </td>
        <td>
          <div style="font-weight: 600; font-size: 0.82rem;">${escapeHtml(t.batch || 'KHMT2026.2')}</div>
          <div style="font-size: 0.72rem; color: var(--text-muted);">${escapeHtml(t.track || 'Khoa KHMT')}</div>
        </td>
        <td style="text-align: center;">
          <input type="number" class="grading-star-input" min="-20" max="100" value="${stars}" ${!existingLog && t.status === 'Ngừng học' ? 'disabled' : ''} placeholder="Chưa ghi nhận" title="Số sao cộng cho Trainee trong buổi này">
        </td>
        <td>
          <input type="text" class="grading-note-input" value="${escapeHtml(note)}" placeholder="Nhận xét / lý do cộng sao">
        </td>
        <td style="text-align: center; font-weight: 700; color: #d97706;">
          ${cumulative}
        </td>
      </tr>
    `;
  }).join('');
}

async function renderAdminRecentAwardsTable() {
  const tbody = document.getElementById('adminRecentAwardTableBody');
  if (!tbody) return;

  const targetId = state.currentTrainee ? state.currentTrainee.traineeId : '25520918';
  const data = await API.getSessionStars(targetId);
  const sessionStars = data && data.sessionStars ? [...data.sessionStars].reverse() : [];

  if (sessionStars.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: var(--text-muted);">Chưa có bản ghi cộng sao nào.</td></tr>`;
    return;
  }

  tbody.innerHTML = sessionStars.map(s => `
    <tr>
      <td><span class="grades-code-pill">${escapeHtml(s.sessionCode || '')}</span></td>
      <td><strong>${escapeHtml(s.sessionTitle || '')}</strong></td>
      <td style="text-align: center;">${formatDateVN(s.sessionDate)}</td>
      <td style="text-align: center;"><span class="grades-badge-awarded">${formatStarDelta(s.starsAwarded)} </span></td>
      <td style="font-size: 0.82rem; color: var(--text-secondary);">${escapeHtml(s.note || '')}</td>
      <td style="text-align: center;">
        <button type="button" class="btn btn-outline btn-xs btn-delete-award" data-trainee="${targetId}" data-id="${s._id}" style="color: var(--accent-red); border-color: rgba(239, 68, 68, 0.3);">
           Xóa
        </button>
      </td>
    </tr>
  `).join('');

  // Lắng nghe sự kiện xóa bản ghi cộng sao
  tbody.querySelectorAll('.btn-delete-award').forEach(btn => {
    btn.onclick = async () => {
      const traineeId = btn.getAttribute('data-trainee');
      const starLogId = btn.getAttribute('data-id');
      if (!confirm('Bạn có chắc chắn muốn xóa bản ghi cộng sao này? Số sao tích lũy và biểu đồ sẽ tự động trừ lại.')) return;

      try {
        const res = await API.deleteSessionStar(traineeId, starLogId);
        if (res && res.success) {
          if (window.showToast) window.showToast('Đã xóa bản ghi cộng sao thành công!', 'success');
          await loadTrainees();
          if (state.currentTrainee) await loadCurrentTrainee(state.currentTrainee.traineeId);
          renderAdminRecentAwardsTable();
          renderAdminTable();
          renderLeaderboard();
          if (state.currentTrainee && window.renderStarChart) {
            window.renderStarChart(state.currentTrainee.starHistory, state.currentTrainee.accumulatedStars);
          }
        } else {
          if (window.showToast) window.showToast((res && res.message) || 'Lỗi khi xóa bản ghi!', 'danger');
        }
      } catch (e) {
        if (window.showToast) window.showToast('Lỗi kết nối: ' + e.message, 'danger');
      }
    };
  });
}

// ==========================================
// 17. QUẢN LÝ 11 BÀI TẬP RÈN LUYỆN & GÁN LINK (CHỈ ADMIN)
// ==========================================

let adminAssignmentsList = [];
let assignmentReviewRequest = 0;

let assignmentReviewRecords = [];

const REVIEW_STATUSES = { not_submitted: 'Chưa ghi nhận', submitted: 'Đã nộp', needs_revision: 'Cần bổ sung', completed: 'Hoàn thành' };

function reviewDirtyRows() {
  return [...(document.getElementById('adminAssignmentSubmissionsBody')?.querySelectorAll('tr.is-dirty') || [])];
}

function readReviewRow(row) {
  return {
    status: row.querySelector('.review-status').value,
    responseId: row.querySelector('.review-response').value.trim(),
    note: row.querySelector('.review-note').value.trim()
  };
}

function refreshReviewToolbar() {
  const dirty = reviewDirtyRows().length;
  const saveAll = document.getElementById('btnAssignmentReviewSaveAll');
  if (saveAll) {
    saveAll.disabled = dirty === 0;
    saveAll.textContent = dirty ? `Lưu thay đổi (${dirty})` : 'Lưu thay đổi';
  }
  const summary = document.getElementById('assignmentReviewSummary');
  if (summary) {
    const count = status => assignmentReviewRecords.filter(item => item.status === status).length;
    summary.innerHTML = assignmentReviewRecords.length
      ? [`<span class="review-chip">${assignmentReviewRecords.length} Trainee</span>`,
        `<span class="review-chip is-done">${count('completed')} Hoàn thành</span>`,
        `<span class="review-chip is-info">${count('submitted')} Đã nộp</span>`,
        `<span class="review-chip is-warn">${count('needs_revision')} Cần bổ sung</span>`,
        `<span class="review-chip">${count('not_submitted')} Chưa ghi nhận</span>`].join('')
      : '';
  }
}

function applyReviewFilter() {
  const body = document.getElementById('adminAssignmentSubmissionsBody');
  if (!body) return;
  const keyword = (document.getElementById('assignmentReviewSearch')?.value || '').trim().toLowerCase();
  const status = document.getElementById('assignmentReviewFilter')?.value || '';
  let visible = 0;
  body.querySelectorAll('tr[data-trainee-id]').forEach(row => {
    const show = (!keyword || row.dataset.search.includes(keyword)) && (!status || row.querySelector('.review-status').value === status);
    row.hidden = !show;
    if (show) visible += 1;
  });
  const empty = body.querySelector('.review-empty');
  if (empty) empty.hidden = visible > 0;
}

function markReviewRowDirty(row) {
  if (!row) return;
  const dirty = JSON.stringify(readReviewRow(row)) !== row.dataset.original;
  row.classList.toggle('is-dirty', dirty);
  const button = row.querySelector('.review-save');
  if (button) button.disabled = !dirty;
  refreshReviewToolbar();
}

async function saveReviewRow(row, assignmentId) {
  const payload = readReviewRow(row);
  const saved = await window.API.updateAssignmentSubmission(assignmentId, row.dataset.traineeId, payload);
  const record = assignmentReviewRecords.find(item => item.traineeId === row.dataset.traineeId);
  if (record) record.status = payload.status;
  row.dataset.original = JSON.stringify(payload);
  row.classList.remove('is-dirty');
  const audit = row.querySelector('.review-audit');
  if (audit) {
    audit.textContent = saved.reviewedAt
      ? 'Cập nhật ' + new Date(saved.reviewedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) + (saved.reviewedBy ? ' · ' + saved.reviewedBy : '')
      : '';
  }
  const button = row.querySelector('.review-save');
  if (button) button.disabled = true;
  refreshReviewToolbar();
}

function setupAssignmentSubmissions() {
  const select = document.getElementById('adminReviewAssignment');
  if (!select) return;
  const previous = select.value;
  select.innerHTML = adminAssignmentsList.map(item => `<option value="${Number(item.assignmentId)}">${escapeHtml(item.title)}</option>`).join('');
  if (adminAssignmentsList.some(item => String(item.assignmentId) === previous)) select.value = previous;
  if (!select.dataset.bound) {
    select.addEventListener('change', () => {
      if (select.dataset.reverting) {
        delete select.dataset.reverting;
        return;
      }
      if (select.value !== select.dataset.current && reviewDirtyRows().length && !confirm('Có thay đổi chưa lưu. Bỏ thay đổi và chuyển bài tập?')) {
        select.dataset.reverting = 'true';
        select.value = select.dataset.current;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
      renderAssignmentSubmissions();
    });
    document.getElementById('btnRefreshAssignmentSubmissions')?.addEventListener('click', () => {
      if (reviewDirtyRows().length && !confirm('Có thay đổi chưa lưu. Bỏ thay đổi và tải lại?')) return;
      renderAssignmentSubmissions();
    });
    document.getElementById('assignmentReviewSearch')?.addEventListener('input', applyReviewFilter);
    document.getElementById('assignmentReviewFilter')?.addEventListener('change', applyReviewFilter);
    document.getElementById('btnAssignmentReviewSaveAll')?.addEventListener('click', saveAllReviewRows);
    document.getElementById('btnAssignmentReviewBulk')?.addEventListener('click', applyBulkSubmitted);
    select.dataset.bound = 'true';
  }
  renderAssignmentSubmissions();
}

async function saveAllReviewRows() {
  const feedback = document.getElementById('assignmentReviewFeedback');
  const button = document.getElementById('btnAssignmentReviewSaveAll');
  const id = document.getElementById('adminReviewAssignment')?.value;
  const rows = reviewDirtyRows();
  if (!rows.length) return;
  button.disabled = true;
  const results = await Promise.allSettled(rows.map(row => saveReviewRow(row, id)));
  const failed = results.map((result, index) => result.status === 'rejected' ? `${rows[index].dataset.traineeId} (${result.reason.message})` : null).filter(Boolean);
  feedback.textContent = failed.length
    ? `Đã lưu ${rows.length - failed.length}/${rows.length}. Chưa lưu được: ${failed.join('; ')}`
    : `Đã lưu ${rows.length} thay đổi.`;
  refreshReviewToolbar();
}

function applyBulkSubmitted() {
  const feedback = document.getElementById('assignmentReviewFeedback');
  const input = document.getElementById('assignmentReviewBulkInput');
  const ids = [...new Set((input.value.match(/[A-Za-z0-9]+/g) || []).map(value => value.toUpperCase()))];
  if (!ids.length) {
    feedback.textContent = 'Chưa có MSSV nào để đối chiếu.';
    return;
  }
  const rows = new Map([...document.querySelectorAll('#adminAssignmentSubmissionsBody tr[data-trainee-id]')].map(row => [row.dataset.traineeId.toUpperCase(), row]));
  let marked = 0;
  let skipped = 0;
  const unknown = [];
  ids.forEach(id => {
    const row = rows.get(id);
    if (!row) return unknown.push(id);
    const status = row.querySelector('.review-status');
    if (status.value !== 'not_submitted') return skipped++;
    status.value = 'submitted';
    status.dispatchEvent(new Event('change', { bubbles: true }));
    marked++;
  });
  feedback.textContent = `Đánh dấu “Đã nộp” cho ${marked} Trainee` + (skipped ? `, bỏ qua ${skipped} người đã có trạng thái` : '') + (unknown.length ? `. Không có trong danh sách: ${unknown.join(', ')}` : '') + (marked ? '. Bấm “Lưu thay đổi” để ghi nhận.' : '.');
  if (!unknown.length) input.value = '';
}

async function renderAssignmentSubmissions() {
  const tbody = document.getElementById('adminAssignmentSubmissionsBody');
  const feedback = document.getElementById('assignmentReviewFeedback');
  const select = document.getElementById('adminReviewAssignment');
  const id = select?.value;
  if (!tbody) return;
  const request = ++assignmentReviewRequest;
  feedback.textContent = '';
  select.dataset.current = id || '';
  assignmentReviewRecords = [];
  refreshReviewToolbar();
  const formLink = document.getElementById('adminReviewFormLink');
  const link = adminAssignmentsList.find(item => String(item.assignmentId) === id)?.link || '';
  formLink.hidden = !/^https:\/\//i.test(link);
  formLink.href = formLink.hidden ? '#' : link;
  if (!id) {
    tbody.innerHTML = '<tr><td colspan="5">Chưa có bài tập để đối chiếu.</td></tr>';
    return;
  }
  tbody.innerHTML = '<tr><td colspan="5">Đang tải xác nhận…</td></tr>';
  try {
    const records = await window.API.getAssignmentSubmissions(id);
    if (request !== assignmentReviewRequest) return;
    assignmentReviewRecords = records;
    tbody.innerHTML = records.length ? records.map(record => {
      const original = JSON.stringify({ status: record.status, responseId: (record.responseId || '').trim(), note: (record.note || '').trim() });
      const audit = record.reviewedAt
        ? 'Cập nhật ' + new Date(record.reviewedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) + (record.reviewedBy ? ' · ' + record.reviewedBy : '')
        : '';
      return `<tr data-trainee-id="${escapeHtml(record.traineeId)}" data-search="${escapeHtml((record.fullName + ' ' + record.traineeId).toLowerCase())}" data-original="${escapeHtml(original)}">
        <td><strong>${escapeHtml(record.fullName)}</strong><br>${escapeHtml(record.traineeId)}</td>
        <td><select class="form-input review-status" aria-label="Trạng thái của ${escapeHtml(record.fullName)}">${Object.entries(REVIEW_STATUSES).map(([value, label]) => `<option value="${value}" ${record.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></td>
        <td><input class="form-input review-response" maxlength="120" value="${escapeHtml(record.responseId || '')}" aria-label="Mã phản hồi Forms của ${escapeHtml(record.fullName)}"></td>
        <td><textarea class="form-input review-note" rows="2" maxlength="2000" aria-label="Ghi chú riêng cho ${escapeHtml(record.fullName)}">${escapeHtml(record.note || '')}</textarea></td>
        <td><button type="button" class="btn btn-primary btn-sm review-save" disabled>Lưu</button><small class="review-audit">${escapeHtml(audit)}</small></td>
      </tr>`;
    }).join('') + '<tr class="review-empty" hidden><td colspan="5">Không có Trainee phù hợp bộ lọc.</td></tr>' : '<tr><td colspan="5">Chưa có Trainee trong danh sách.</td></tr>';
    tbody.oninput = tbody.onchange = event => markReviewRowDirty(event.target.closest('tr[data-trainee-id]'));
    tbody.querySelectorAll('.review-save').forEach(button => button.addEventListener('click', async () => {
      const row = button.closest('tr');
      button.disabled = true;
      try {
        await saveReviewRow(row, id);
        feedback.textContent = 'Đã lưu xác nhận cho ' + row.dataset.traineeId + '.';
      } catch (err) {
        button.disabled = false;
        feedback.textContent = err.message;
      }
    }));
    refreshReviewToolbar();
    applyReviewFilter();
  } catch (err) {
    if (request !== assignmentReviewRequest) return;
    tbody.innerHTML = '<tr><td colspan="5">Không tải được dữ liệu. Bấm "Tải lại" để thử lại.</td></tr>';
    feedback.textContent = err.message;
  }
}

function combineDeadlineParts(dateInput, timeInput, fallbackInput) {
  if (!dateInput) return fallbackInput?.value || '';
  if (!dateInput.value) return '';
  return `${dateInput.value}T${timeInput?.value || '23:59'}`;
}

function setDeadlineParts(value, dateInput, timeInput, fallbackInput) {
  const [datePart = '', timePart = ''] = String(value || '').split('T');
  if (fallbackInput) fallbackInput.value = value || '';
  if (dateInput) dateInput.value = datePart;
  if (timeInput) timeInput.value = datePart ? (timePart.slice(0, 5) || '23:59') : '23:59';
}

function deadlineValueToIso(value) {
  return value ? new Date(`${value}:00+07:00`).toISOString() : null;
}

async function renderAdminAssignmentsTable() {
  const tbody = document.getElementById('adminAssignmentsTableBody');
  if (!tbody) return;

  setupAdminAssignmentsEvents();
  tbody.innerHTML = '<tr><td colspan="6">Đang tải bài tập…</td></tr>';

  try {
    const list = await window.API.getAssignments();
    if (Array.isArray(list)) {
      adminAssignmentsList = list;
      setupAssignmentSubmissions();
    }
  } catch (err) {
    console.warn('Lỗi lấy assignments cho Admin:', err);
    tbody.innerHTML = '<tr><td colspan="6">Không tải được danh sách bài tập. Vui lòng thử lại.</td></tr>';
    return;
  }

  if (adminAssignmentsList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 24px; color: var(--text-muted);">Chưa có bài tập nào được công bố.</td></tr>`;
    return;
  }

  // Helper tính nhãn đếm ngược nhanh trong bảng Admin
  const formatAdminDeadlineBadge = (deadline) => {
    if (!deadline) return `<span class="badge" style="background: rgba(148,163,184,0.15); color: #64748b; font-size: 0.72rem;">Không giới hạn</span>`;
    const target = new Date(deadline).getTime();
    if (isNaN(target)) return `<span class="badge" style="background: rgba(148,163,184,0.15); color: #64748b; font-size: 0.72rem;">Không giới hạn</span>`;
    const diff = target - Date.now();
    if (diff <= 0) return `<span class="badge badge-danger" style="font-size: 0.72rem;"> Đã hết hạn nộp</span>`;
    const d = Math.floor(diff / (1000 * 60 * 60 * 24));
    const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const m = Math.floor((diff / (1000 * 60)) % 60);
    if (d >= 1) {
      return `<span class="badge ${d > 2 ? 'badge-success' : 'badge-warning'}" style="font-size: 0.72rem;"> ${d} ngày ${h}h còn lại</span>`;
    }
    return `<span class="badge badge-danger" style="font-size: 0.72rem;"> ${h}h ${m} phút còn lại</span>`;
  };

  const toInputDateTime = (isoStr) => {
    if (!isoStr) return '';
    try {
      const d = new Date(new Date(isoStr).getTime() + 7 * 3600000);
      if (isNaN(d.getTime())) return '';
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      const h = String(d.getUTCHours()).padStart(2, '0');
      const min = String(d.getUTCMinutes()).padStart(2, '0');
      return `${y}-${m}-${day}T${h}:${min}`;
    } catch (e) {
      return '';
    }
  };

  tbody.innerHTML = adminAssignmentsList.map((a, idx) => {
    const id = a.assignmentId || a.id || (idx + 1);
    const hasLink = a.link && a.link.trim() !== '#' && a.link.trim() !== '';
    const statusClass = a.status === 'closed' ? 'closed' : (a.status === 'active' ? 'active' : 'locked');
    const deadlineVal = toInputDateTime(a.deadline);
    const [deadlineDate = '', deadlineTime = '23:59'] = deadlineVal.split('T');
    const countdownBadge = formatAdminDeadlineBadge(a.deadline);

    return `
      <tr data-assignment-id="${id}">
        <td style="text-align: center; font-weight: 800; color: var(--primary-blue);">
          #${id}
        </td>
        <td>
          <div style="font-weight: 700; font-size: 0.88rem; color: var(--text-main); margin-bottom: 2px;">
            ${escapeHtml(a.title)}
          </div>
          <div style="font-size: 0.76rem; color: var(--text-muted); line-height: 1.35; max-width: 300px;">
            ${escapeHtml(a.desc || '')}
          </div>
        </td>
        <td style="text-align: center;">
          <select class="admin-assignment-status-select ${statusClass}" data-id="${id}" style="font-size: 0.78rem;">
            <option value="closed" ${a.status === 'closed' ? 'selected' : ''}> Đã đóng</option>
            <option value="active" ${a.status === 'active' ? 'selected' : ''}> Đang mở</option>
            <option value="locked" ${a.status === 'locked' ? 'selected' : ''}> Khóa</option>
          </select>
        </td>
        <td>
          <div style="display: flex; gap: 6px; align-items: center;">
            <input type="url" class="admin-assignment-link-input" data-id="${id}"
                   value="${escapeHtml(a.link || '')}"
                   placeholder="Dán link Microsoft Forms: https://forms.office.com/...">
          </div>
        </td>
        <td style="text-align: center;">
          <div class="admin-assignment-deadline-editor">
            <div class="admin-assignment-deadline-fields">
              <input type="date" class="admin-assignment-deadline-date" data-id="${id}"
                     value="${deadlineDate}" aria-label="Ngày hết hạn bài tập ${id}">
              <input type="time" class="admin-assignment-deadline-time" data-id="${id}"
                     value="${deadlineTime}" aria-label="Giờ hết hạn bài tập ${id}">
              <input type="hidden" class="admin-assignment-deadline-input" data-id="${id}" value="${deadlineVal}">
            </div>
            <div class="admin-countdown-badge-wrap" data-id="${id}">
              ${countdownBadge}
            </div>
          </div>
        </td>
        <td style="text-align: center;">
          <div style="display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            <a href="${hasLink ? escapeHtml(a.link) : 'javascript:void(0)'}"
               target="${hasLink ? '_blank' : '_self'}"
               class="btn btn-outline btn-xs btn-open-assigned-link ${!hasLink ? 'disabled' : ''}"
               data-id="${id}"
               title="Mở kiểm tra đường link này"
               style="${!hasLink ? 'opacity: 0.5; pointer-events: none;' : ''}">
              <span> Mở</span>
            </a>
            <button type="button" class="btn btn-outline btn-xs btn-edit-assignment-detail" data-id="${id}" title="Chỉnh sửa chi tiết bài tập & deadline">Sửa</button>
            <button type="button" class="btn btn-primary btn-xs btn-save-single-assignment" data-id="${id}" title="Lưu nhanh bài tập này">Lưu</button>
            <button type="button" class="btn btn-outline btn-xs btn-delete-assignment" data-id="${id}">Xóa</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  window.initCustomDatePickers?.(tbody);
  window.initCustomTimePickers?.(tbody);

  tbody.querySelectorAll('tr[data-assignment-id]').forEach(row => {
    const dateInput = row.querySelector('.admin-assignment-deadline-date');
    const timeInput = row.querySelector('.admin-assignment-deadline-time');
    const fallbackInput = row.querySelector('.admin-assignment-deadline-input');
    const syncDeadline = () => {
      if (fallbackInput) fallbackInput.value = combineDeadlineParts(dateInput, timeInput, fallbackInput);
    };
    dateInput?.addEventListener('change', syncDeadline);
    timeInput?.addEventListener('change', syncDeadline);
  });

  // Hook change event for select to update style
  tbody.querySelectorAll('.admin-assignment-status-select').forEach(sel => {
    sel.onchange = () => {
      sel.className = `admin-assignment-status-select ${sel.value}`;
    };
  });

  // Hook single save button
  tbody.querySelectorAll('.btn-save-single-assignment').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-id');
      const row = tbody.querySelector(`tr[data-assignment-id="${id}"]`);
      if (!row) return;

      const linkInput = row.querySelector('.admin-assignment-link-input');
      const statusSelect = row.querySelector('.admin-assignment-status-select');
      const deadlineInput = row.querySelector('.admin-assignment-deadline-input');
      const deadlineDateInput = row.querySelector('.admin-assignment-deadline-date');
      const deadlineTimeInput = row.querySelector('.admin-assignment-deadline-time');
      const newLink = linkInput ? linkInput.value.trim() : '';
      const newStatus = statusSelect ? statusSelect.value : 'active';
      const deadlineVal = deadlineValueToIso(combineDeadlineParts(deadlineDateInput, deadlineTimeInput, deadlineInput));

      btn.disabled = true;
      btn.textContent = '';

      try {
        const res = await window.API.updateAssignment(id, {
          link: newLink,
          status: newStatus,
          deadline: deadlineVal
        });
        if (res && res.success) {
          if (window.showToast) window.showToast(`Đã lưu bài tập #${id} thành công!`, 'success');
          const target = adminAssignmentsList.find(a => (a.assignmentId || a.id) == id);
          if (target) {
            target.link = newLink;
            target.status = newStatus;
            target.deadline = deadlineVal;
          }
          // Cập nhật badge đếm ngược
          const badgeWrap = row.querySelector(`.admin-countdown-badge-wrap[data-id="${id}"]`);
          if (badgeWrap) {
            badgeWrap.innerHTML = formatAdminDeadlineBadge(deadlineVal);
          }
          const openBtn = row.querySelector('.btn-open-assigned-link');
          if (openBtn) {
            const hasReal = newLink && newLink !== '#' && newLink !== '';
            openBtn.href = hasReal ? newLink : 'javascript:void(0)';
            openBtn.target = hasReal ? '_blank' : '_self';
            openBtn.style.opacity = hasReal ? '1' : '0.5';
            openBtn.style.pointerEvents = hasReal ? 'auto' : 'none';
          }
          if (window.duolingoManager) {
            window.duolingoManager.fetchAssignmentsFromAPI();
          }
        } else {
          if (window.showToast) window.showToast((res && res.message) || 'Lỗi khi lưu bài tập!', 'danger');
        }
      } catch (err) {
        if (window.showToast) window.showToast('Lỗi kết nối máy chủ: ' + err.message, 'danger');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Lưu';
      }
    };
  });

  // Hook edit detail button
  tbody.querySelectorAll('.btn-edit-assignment-detail').forEach(btn => {
    btn.onclick = () => {
      const id = btn.getAttribute('data-id');
      const item = adminAssignmentsList.find(a => (a.assignmentId || a.id) == id);
      if (item) openAdminEditAssignmentModal(item);
    };
  });

  tbody.querySelectorAll('.btn-delete-assignment').forEach(button => {
    button.onclick = async () => {
      if (!canManage('assignments:manage')) return;
      const id = button.dataset.id;
      const item = adminAssignmentsList.find(assignment => String(assignment.assignmentId) === id);
      if (!item || !confirm(`Xóa bài tập "${item.title}" khỏi lộ trình? Các xác nhận bài nộp đã có vẫn được lưu để đối chiếu.`)) return;
      const feedback = document.getElementById('assignmentManagementFeedback');
      button.disabled = true;
      feedback.textContent = 'Đang xóa bài tập…';
      try {
        await API.deleteAssignment(id);
        await renderAdminAssignmentsTable();
        await window.duolingoManager?.fetchAssignmentsFromAPI();
        feedback.textContent = 'Đã xóa bài tập khỏi lộ trình. Xác nhận bài nộp vẫn được lưu để đối chiếu.';
      } catch (error) { feedback.textContent = error.message; }
      finally { button.disabled = false; }
    };
  });
}

function setupAdminAssignmentsEvents() {
  const btnSaveAll = document.getElementById('btnAdminSaveAllAssignments');
  const btnReset = document.getElementById('btnAdminResetAssignments');
  const btnAdd = document.getElementById('btnAdminAddAssignment');
  if (btnAdd && !btnAdd.dataset.bound) {
    btnAdd.dataset.bound = 'true';
    btnAdd.onclick = () => openAdminEditAssignmentModal();
  }

  if (btnSaveAll && !btnSaveAll.dataset.bound) {
    btnSaveAll.dataset.bound = 'true';
    btnSaveAll.onclick = async () => {
      const rows = document.querySelectorAll('#adminAssignmentsTableBody tr');
      const payload = [];

      rows.forEach(tr => {
        const id = tr.getAttribute('data-assignment-id');
        const linkInp = tr.querySelector('.admin-assignment-link-input');
        const statusSel = tr.querySelector('.admin-assignment-status-select');
        const deadlineInp = tr.querySelector('.admin-assignment-deadline-input');
        const deadlineDateInp = tr.querySelector('.admin-assignment-deadline-date');
        const deadlineTimeInp = tr.querySelector('.admin-assignment-deadline-time');
        if (id) {
          payload.push({
            assignmentId: Number(id),
            link: linkInp ? linkInp.value.trim() : '',
            status: statusSel ? statusSel.value : 'active',
            deadline: deadlineValueToIso(combineDeadlineParts(deadlineDateInp, deadlineTimeInp, deadlineInp))
          });
        }
      });

      if (payload.length === 0) return;

      btnSaveAll.disabled = true;
      btnSaveAll.innerHTML = `<span> Đang lưu...</span>`;

      try {
        const res = await window.API.batchUpdateAssignments(payload);
        if (res && res.success) {
          if (window.showToast) {
            window.showToast(`Đã lưu ${payload.length} bài tập thành công!`, 'success');
          }
          await renderAdminAssignmentsTable();
          if (window.duolingoManager) {
            window.duolingoManager.fetchAssignmentsFromAPI();
          }
        } else {
          if (window.showToast) window.showToast((res && res.message) || 'Lỗi khi lưu bài tập!', 'danger');
        }
      } catch (err) {
        if (window.showToast) window.showToast('Lỗi kết nối máy chủ: ' + err.message, 'danger');
      } finally {
        btnSaveAll.disabled = false;
        btnSaveAll.innerHTML = `

          <span> Lưu toàn bộ link</span>
        `;
      }
    };
  }

  if (btnReset && !btnReset.dataset.bound) {
    btnReset.dataset.bound = 'true';
    btnReset.onclick = async () => {
      if (!confirm('Khôi phục danh mục bài tập mẫu? Các bài tự thêm và thay đổi hiện tại sẽ được thay thế.')) return;

      btnReset.disabled = true;
      btnReset.innerHTML = `<span> Đang reset...</span>`;

      try {
        const res = await window.API.resetAssignments();
        if (res && res.success) {
          if (window.showToast) window.showToast('Đã khôi phục danh mục bài tập mẫu!', 'success');
          await renderAdminAssignmentsTable();
          if (window.duolingoManager) {
            window.duolingoManager.fetchAssignmentsFromAPI();
          }
        } else {
          if (window.showToast) window.showToast((res && res.message) || 'Lỗi khi reset bài tập!', 'danger');
        }
      } catch (err) {
        if (window.showToast) window.showToast('Lỗi kết nối máy chủ: ' + err.message, 'danger');
      } finally {
        btnReset.disabled = false;
        btnReset.innerHTML = `

          <span>Khôi phục mặc định</span>
        `;
      }
    };
  }

  // Modal Sửa Chi Tiết Bài Tập
  const modal = document.getElementById('adminEditAssignmentModal');
  const btnClose = document.getElementById('closeAdminEditAssignmentModalBtn');
  const btnCancel = document.getElementById('cancelAdminEditAssignmentBtn');
  const btnClearDeadline = document.getElementById('btnClearEditDeadline');
  const form = document.getElementById('adminEditAssignmentForm');

  const closeModal = () => {
    if (modal) modal.classList.remove('open', 'show');
  };
  window.closeAdminEditAssignmentModal = closeModal;

  if (btnClose) btnClose.onclick = closeModal;
  if (btnCancel) btnCancel.onclick = closeModal;
  if (btnClearDeadline) {
    btnClearDeadline.onclick = () => {
      setDeadlineParts(
        '',
        document.getElementById('editAssignmentDeadlineDate'),
        document.getElementById('editAssignmentDeadlineTime'),
        document.getElementById('editAssignmentDeadline')
      );
    };
  }
  if (modal) {
    modal.onclick = (e) => {
      if (e.target === modal) closeModal();
    };
  }

  if (form && !form.dataset.bound) {
    form.dataset.bound = 'true';
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (!canManage('assignments:manage')) return;
      const id = document.getElementById('editAssignmentIdHidden').value;
      const title = document.getElementById('editAssignmentTitle').value.trim();
      const desc = document.getElementById('editAssignmentDesc').value.trim();
      const details = document.getElementById('editAssignmentDetails').value.trim();
      const link = document.getElementById('editAssignmentLink').value.trim();
      const status = document.getElementById('editAssignmentStatus').value;
      const deadlineInput = document.getElementById('editAssignmentDeadline');
      const deadlineVal = combineDeadlineParts(
        document.getElementById('editAssignmentDeadlineDate'),
        document.getElementById('editAssignmentDeadlineTime'),
        deadlineInput
      );
      const deadline = deadlineValueToIso(deadlineVal);

      const btnSubmit = document.getElementById('btnSubmitAdminEditAssignment');
      const feedback = document.getElementById('assignmentEditorFeedback');
      feedback.textContent = '';
      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.textContent = ' Đang lưu...';
      }

      try {
        const data = { title, desc, details, link, status, deadline };
        const res = id ? await window.API.updateAssignment(id, data) : { success: true, data: await API.createAssignment(data) };
        if (res && res.success) {
          closeModal();
          if (window.showToast) {
            window.showToast(`Đã ${id ? 'cập nhật' : 'thêm'} bài tập "${title}".`, 'success');
          }
          await renderAdminAssignmentsTable();
          if (window.duolingoManager) {
            await window.duolingoManager.fetchAssignmentsFromAPI();
          }
        } else {
          feedback.textContent = res?.message || 'Không lưu được bài tập.';
        }
      } catch (err) {
        feedback.textContent = err.message;
      } finally {
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.textContent = id ? 'Lưu thay đổi' : 'Thêm bài tập';
        }
      }
    };
  }
}

function openAdminEditAssignmentModal(item = {}) {
  if (!canManage('assignments:manage')) return;
  setupAdminAssignmentsEvents();
  const modal = document.getElementById('adminEditAssignmentModal');
  if (!modal) return;

  const id = item.assignmentId || item.id || '';
  const subTitle = document.getElementById('editAssignmentSubTitle');
  const inputId = document.getElementById('editAssignmentIdHidden');
  const inputTitle = document.getElementById('editAssignmentTitle');
  const inputDesc = document.getElementById('editAssignmentDesc');
  const inputLink = document.getElementById('editAssignmentLink');
  const selectStatus = document.getElementById('editAssignmentStatus');
  const inputDeadline = document.getElementById('editAssignmentDeadline');
  const inputDeadlineDate = document.getElementById('editAssignmentDeadlineDate');
  const inputDeadlineTime = document.getElementById('editAssignmentDeadlineTime');

  window.initCustomDatePickers?.(modal);
  window.initCustomTimePickers?.(modal);

  document.getElementById('editAssignmentModalTitle').textContent = id ? 'Chỉnh sửa chi tiết bài tập' : 'Thêm bài tập';
  document.getElementById('btnSubmitAdminEditAssignment').textContent = id ? 'Lưu thay đổi' : 'Thêm bài tập';
  document.getElementById('assignmentEditorFeedback').textContent = '';
  if (subTitle) subTitle.textContent = id ? `Bài tập #${id} - Cập nhật tiêu đề, mô tả và đường link` : 'Mã bài tập được cấp tự động. Có thể bổ sung link nộp bài sau.';
  if (inputId) inputId.value = id;
  if (inputTitle) inputTitle.value = item.title || '';
  if (inputDesc) inputDesc.value = item.desc || '';
  document.getElementById('editAssignmentDetails').value = item.details || '';
  if (inputLink) inputLink.value = item.link || '';
  if (selectStatus) selectStatus.value = item.status || 'locked';

  let deadlineValue = '';
  if (item.deadline) {
    const d = new Date(new Date(item.deadline).getTime() + 7 * 3600000);
    if (!isNaN(d.getTime())) {
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      const hours = String(d.getUTCHours()).padStart(2, '0');
      const mins = String(d.getUTCMinutes()).padStart(2, '0');
      deadlineValue = `${year}-${month}-${day}T${hours}:${mins}`;
    }
  }
  setDeadlineParts(deadlineValue, inputDeadlineDate, inputDeadlineTime, inputDeadline);

  modal.classList.add('open', 'show');
  if (inputTitle) inputTitle.focus();
}

window.renderAdminAssignmentsTable = renderAdminAssignmentsTable;


function renderAdminTraineesTable() {
  renderAdminTable();
}

// Expose to global window
window.renderAdminView = renderAdminView;
window.renderAdminTable = renderAdminTable;
window.renderAdminTraineesTable = renderAdminTraineesTable;
window.openDeleteModal = openDeleteModal;
window.renderAdminSupportRequests = renderAdminSupportRequests;
window.setupAdminAwardStarsSection = setupAdminAwardStarsSection;
window.renderAdminAssignmentsTable = renderAdminAssignmentsTable;
window.openAdminEditAssignmentModal = openAdminEditAssignmentModal;
window.closeCreateTraineeModal = closeCreateTraineeModal;
window.closeEditTraineeModal = closeEditTraineeModal;
window.closeDeleteModal = closeDeleteModal;
