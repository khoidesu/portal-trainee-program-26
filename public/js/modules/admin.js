/**
 * ==============================================================================
 * COMPONENT: Admin Module (Trung Tâm Quản Trị Hệ Thống Toàn Diện)
 * CHỨC NĂNG CHÍNH: Quản trị danh sách thực tập sinh (CRUD), cộng sao theo buổi học,
 *                  quản lý 11 bài tập rèn luyện (deadline & link), xử lý hỗ trợ.
 * LIÊN KẾT & PHỤ THUỘC: public/js/modules/core.js, public/js/api.js, public/js/duolingo.js
 * NHIỆM VỤ CHI TIẾT:
 *   - renderAdminView: Vẽ bảng điều khiển tổng quan quản trị
 *   - Quản lý Sinh viên: Modal tạo mới, sửa chỉ số KPI, xóa sinh viên
 *   - setupAdminAwardStarsSection: Giao diện cộng sao hàng loạt theo danh sách buổi học
 *   - Quản lý 11 bài tập: renderAdminAssignmentsTable, sửa deadline countdown, lưu link
 *   - renderAdminSupportRequests: Duyệt và giải quyết yêu cầu quên mật khẩu
 * ==============================================================================
 */

// ==========================================
// ADMIN DASHBOARD & USER MANAGEMENT
// ==========================================

function renderAdminView() {
  if (!state.currentUser || state.currentUser.role !== 'admin') return;

  const trainees = state.trainees || [];
  const totalUsers = trainees.length;
  const totalStars = trainees.reduce((sum, t) => sum + (Number(t.accumulatedStars) || 0), 0);
  const avgAttRate = totalUsers > 0 
    ? (trainees.reduce((sum, t) => sum + (Number(t.attendanceRate) || 0), 0) / totalUsers).toFixed(1)
    : 0;
  const avgScore = totalUsers > 0 
    ? (trainees.reduce((sum, t) => sum + (Number(t.assignmentScore) || 0), 0) / totalUsers).toFixed(2)
    : 0;

  if (elements.adminMetricTotalUsers) elements.adminMetricTotalUsers.textContent = totalUsers;
  if (elements.adminMetricTotalStars) elements.adminMetricTotalStars.textContent = totalStars;
  if (elements.adminMetricAvgAttendance) elements.adminMetricAvgAttendance.textContent = `${avgAttRate}%`;
  if (elements.adminMetricAvgScore) elements.adminMetricAvgScore.textContent = avgScore;
  if (elements.adminTableCountBadge) elements.adminTableCountBadge.textContent = `${totalUsers} sinh viên`;

  renderAdminTable();
  renderAdminScheduleTable();
  renderAdminSupportRequests();
  setupAdminAwardStarsSection();
  renderAdminAssignmentsTable();
}

function renderAdminTable() {
  if (!elements.adminTraineesTableBody) return;

  let list = [...(state.trainees || [])];

  // Filter by track
  if (state.adminSelectedTrack && state.adminSelectedTrack !== 'all') {
    list = list.filter(t => (t.track || '').includes(state.adminSelectedTrack) || (t.department || '').includes(state.adminSelectedTrack));
  }

  // Filter by search
  if (state.adminSearchQuery) {
    const q = state.adminSearchQuery.toLowerCase();
    list = list.filter(t => 
      (t.fullName || '').toLowerCase().includes(q) ||
      (t.traineeId || '').toLowerCase().includes(q) ||
      (t.email || '').toLowerCase().includes(q)
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
    const attended = t.attendedSessions !== undefined ? t.attendedSessions : 40;
    const total = t.totalSessions !== undefined ? t.totalSessions : 45;
    const attRate = t.attendanceRate || Math.round((attended / total) * 100);
    const stars = t.accumulatedStars !== undefined ? t.accumulatedStars : 28;
    const excused = t.absentExcused !== undefined ? t.absentExcused : 0;
    const unexcused = t.absentUnexcused !== undefined ? t.absentUnexcused : 0;
    const assignScore = (t.assignmentScore !== undefined) ? Number(t.assignmentScore).toFixed(1) : '9.0';
    const rank = t.currentRank || t.rank || 1;

    return `
      <tr data-trainee-id="${t.traineeId}">
        <td>
          <div class="admin-user-cell">
            <div class="admin-user-avatar" style="padding: 0; overflow: hidden; background: transparent;">
              <img src="${getTraineeDicebearAvatar(t)}" alt="${escapeHtml(t.fullName)}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">
            </div>
            <div class="admin-user-info">
              <span class="admin-user-name">${escapeHtml(t.fullName)}</span>
              <span class="admin-user-meta">MSSV: <strong>${escapeHtml(t.traineeId)}</strong> · ${escapeHtml(t.email)}</span>
            </div>
          </div>
        </td>
        <td>
          <div style="font-weight: 600;">${escapeHtml(t.batch || 'KHMT2026.2')}</div>
          <div style="font-size: 0.78rem; color: var(--text-muted);">${escapeHtml(t.track || 'Khoa KHMT')}</div>
        </td>
        <td>
          <div class="star-chip">
            ⭐ <span>${stars}</span> sao
          </div>
          <div style="font-size: 0.74rem; color: var(--text-muted); margin-top: 2px;">
            ${escapeHtml(t.starClassification || 'Hạng Vàng')}
          </div>
        </td>
        <td>
          <div class="admin-att-wrap">
            <div class="admin-att-text">${attended}/${total} (${attRate}%)</div>
            <div class="admin-att-bar">
              <div class="admin-att-fill" style="width: ${Math.min(attRate, 100)}%;"></div>
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
          <div style="font-size: 0.74rem; color: var(--text-muted);">
            Đạt ${t.completedAssignments || 14}/${t.totalAssignments || 15} bài
          </div>
        </td>
        <td>
          <div style="font-weight: 700; font-size: 0.92rem;">
            ${rank === 1 ? '🥇 Top 1' : rank === 2 ? '🥈 Top 2' : rank === 3 ? '🥉 Top 3' : `Hạng ${rank}`}
          </div>
        </td>
        <td>
          <div class="admin-actions-cell">
            <button type="button" class="btn-admin-action edit-btn" data-action="edit" data-id="${t.traineeId}" title="Sửa chỉ số và thông tin">
              ✏️ Sửa
            </button>
            <button type="button" class="btn-admin-action delete-btn" data-action="delete" data-id="${t.traineeId}" title="Xóa người dùng">
              🗑️ Xóa
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Attach button events
  elements.adminTraineesTableBody.querySelectorAll('.btn-admin-action').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.getAttribute('data-action');
      const id = btn.getAttribute('data-id');
      if (action === 'edit') {
        openEditTraineeModal(id);
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
  if (elements.createTotalSessions) elements.createTotalSessions.value = '45';
  if (elements.createExcused) elements.createExcused.value = '0';
  if (elements.createUnexcused) elements.createUnexcused.value = '0';
  if (elements.createAssignmentScore) elements.createAssignmentScore.value = '9.0';

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
    password: '1234',
    accumulatedStars: Number(elements.createStars.value) || 0,
    attendedSessions: Number(elements.createAttended.value) || 0,
    totalSessions: Number(elements.createTotalSessions.value) || 45,
    absentExcused: Number(elements.createExcused.value) || 0,
    absentUnexcused: Number(elements.createUnexcused.value) || 0,
    assignmentScore: Number(elements.createAssignmentScore.value) || 0,
    completedAssignments: 14,
    totalAssignments: 15,
    role: 'student'
  };

  const res = await window.API.createTrainee(data);
  if (res && res.success) {
    closeCreateTraineeModal();
    if (window.showToast) {
      window.showToast(`Đã tạo mới sinh viên ${data.fullName} vào MongoDB Atlas!`, 'success');
    }
    await loadTrainees();
    renderAdminView();
    renderLeaderboard();
  } else {
    alert(res?.message || 'Lỗi khi tạo sinh viên');
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

  elements.editAttendedSessions.value = t.attendedSessions !== undefined ? t.attendedSessions : 40;
  elements.editTotalSessions.value = t.totalSessions !== undefined ? t.totalSessions : 45;
  elements.editAbsentExcused.value = t.absentExcused !== undefined ? t.absentExcused : 0;
  elements.editAbsentUnexcused.value = t.absentUnexcused !== undefined ? t.absentUnexcused : 0;
  elements.editAssignmentScore.value = t.assignmentScore !== undefined ? t.assignmentScore : 9.0;
  elements.editCompletedAssignments.value = t.completedAssignments !== undefined ? t.completedAssignments : 14;

  // RÀNG BUỘC CẬP NHẬT SAO THEO TỪNG BUỔI HỌC CỦA SINH VIÊN
  renderEditTraineeSessionStars(t);

  if (elements.btnDeleteFromEditModal) {
    elements.btnDeleteFromEditModal.onclick = () => {
      openDeleteModal(traineeId);
    };
  }

  // Nút thêm buổi học mới cho sinh viên này
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

  // Nếu sinh viên chưa có sessionStars trong MongoDB, lấy danh sách buổi học chuẩn của chương trình
  if (sessionList.length === 0) {
    sessionList = [
      { sessionCode: 'TP-M10.01', sessionTitle: 'Buổi 1: Khai mạc, Quy chế & Thiết lập Môi trường Trainee', sessionDate: '2026-10-06', starsAwarded: 5, note: 'Điểm danh đúng giờ, hoàn thành cài đặt môi trường' },
      { sessionCode: 'TP-M10.02', sessionTitle: 'Buổi 2: Kiến trúc Hệ thống Frontend Tối ưu & Clean Code', sessionDate: '2026-10-13', starsAwarded: 6, note: 'Tích cực tương tác trong buổi học' },
      { sessionCode: 'TP-M10.03', sessionTitle: 'Buổi 3: Xây dựng RESTful API Backend & Kết nối MongoDB Atlas', sessionDate: '2026-10-20', starsAwarded: 8, note: 'Hoàn thành bài tập REST API sớm' },
      { sessionCode: 'TP-M10.04', sessionTitle: 'Buổi 4: Quản lý Trạng thái Thực tế, Animation & Trải nghiệm UX', sessionDate: '2026-10-27', starsAwarded: 9, note: 'Xây dựng giao diện mượt mà và tối ưu' }
    ];
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
          📅 ${s.sessionDate ? formatDateVN(s.sessionDate) : '2026-10-06'} · Trainer: <strong>${escapeHtml(s.trainerName || 'Võ Thị Xuân Quỳnh')}</strong>
        </div>
      </div>
      <div class="edit-session-inputs">
        <span style="font-size: 0.76rem; font-weight: 700; color: #d97706;">+⭐</span>
        <input type="number" class="session-star-num-input" min="0" max="100" value="${s.starsAwarded !== undefined ? s.starsAwarded : 0}" title="Số sao cộng buổi này">
        <input type="text" class="session-note-txt-input" placeholder="Nhận xét / lý do cộng sao" value="${escapeHtml(s.note || '')}" title="Nhận xét của trainer trong buổi học">
      </div>
    </div>
  `).join('');

  // Lắng nghe sự kiện thay đổi số sao từng buổi để tự động cộng dồn lên editStars
  const recalculateTotalStars = () => {
    let sum = 0;
    container.querySelectorAll('.session-star-num-input').forEach(inp => {
      sum += Math.max(0, Number(inp.value) || 0);
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
        📅 ${formatDateVN(todayStr)} · Trainer: <strong>Võ Thị Xuân Quỳnh</strong>
      </div>
    </div>
    <div class="edit-session-inputs">
      <span style="font-size: 0.76rem; font-weight: 700; color: #d97706;">+⭐</span>
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
    const starsAwarded = Math.max(0, Number(starInp ? starInp.value : 0) || 0);
    const note = (noteInp && noteInp.value ? noteInp.value.trim() : '') || 'Hoàn thành buổi học';

    calculatedTotalStars += starsAwarded;
    sessionStars.push({
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

  const updateData = {
    fullName: elements.editFullName.value.trim(),
    email: elements.editEmail.value.trim(),
    track: elements.editTrack.value.trim(),
    batch: elements.editBatch.value.trim(),
    accumulatedStars: calculatedTotalStars,
    sessionStars: sessionStars, // Cập nhật sessionStars đồng bộ MongoDB
    attendedSessions: Number(elements.editAttendedSessions.value),
    totalSessions: Number(elements.editTotalSessions.value) || 45,
    absentExcused: Number(elements.editAbsentExcused.value),
    absentUnexcused: Number(elements.editAbsentUnexcused.value),
    assignmentScore: Number(elements.editAssignmentScore.value),
    completedAssignments: Number(elements.editCompletedAssignments.value)
  };

  const btnSubmit = document.getElementById('btnSubmitEditTrainee');
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = '⏳ Đang lưu vào MongoDB...';
  }

  try {
    const res = await window.API.updateTrainee(id, updateData);
    if (res && res.success) {
      closeEditTraineeModal();
      if (window.showToast) {
        window.showToast(`Đã lưu thay đổi theo từng buổi học cho sinh viên ${updateData.fullName} vào MongoDB! (Tổng: ${calculatedTotalStars} ⭐)`, 'success');
      }
      await loadTrainees();
      if (state.currentTraineeId === id) {
        await loadCurrentTrainee(id);
      }
      renderAdminView();
      renderLeaderboard();
      renderGradesView();
    } else {
      alert(res?.message || 'Lỗi khi cập nhật sinh viên');
    }
  } catch (err) {
    alert('Lỗi kết nối máy chủ: ' + err.message);
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = '💾 Lưu Thay Đổi Vào MongoDB';
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
    elements.deleteConfirmMessage.innerHTML = `Bạn có chắc chắn muốn XÓA sinh viên <strong>${escapeHtml(name)}</strong> (MSSV: <code>${escapeHtml(traineeId)}</code>) khỏi cơ sở dữ liệu MongoDB Atlas?`;
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
        window.showToast(res.message || `Đã xóa sinh viên khỏi MongoDB Atlas thành công!`, 'info');
      }
      await loadTrainees();
      if (state.currentTraineeId === traineeId && state.trainees.length > 0) {
        state.currentTraineeId = state.trainees[0].traineeId;
        await loadCurrentTrainee(state.currentTraineeId);
      }
      renderAdminView();
      renderLeaderboard();
    } else {
      alert(res?.message || 'Lỗi khi xóa tài khoản sinh viên');
    }
  } catch (err) {
    console.error('Lỗi khi xóa người dùng:', err);
    alert('Lỗi kết nối khi xóa tài khoản: ' + err.message);
  } finally {
    if (elements.confirmDeleteTraineeBtn) {
      elements.confirmDeleteTraineeBtn.disabled = false;
      elements.confirmDeleteTraineeBtn.textContent = '🗑️ Đồng ý xóa vĩnh viễn';
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
  if (!elements.adminSupportTableBody) return;

  try {
    const requests = await API.getSupportRequests();
    const pendingCount = (requests || []).filter(r => r.status === 'pending').length;

    if (elements.adminSupportPendingBadge) {
      elements.adminSupportPendingBadge.textContent = `${pendingCount} chờ xử lý`;
      elements.adminSupportPendingBadge.className = pendingCount > 0 ? 'badge badge-warning' : 'badge badge-success';
    }

    if (!requests || requests.length === 0) {
      elements.adminSupportTableBody.innerHTML = '';
      if (elements.adminSupportEmptyState) elements.adminSupportEmptyState.style.display = 'block';
      return;
    }

    if (elements.adminSupportEmptyState) elements.adminSupportEmptyState.style.display = 'none';

    elements.adminSupportTableBody.innerHTML = requests.map((r, index) => {
      const isPending = r.status === 'pending';
      const createdDate = r.createdAt ? new Date(r.createdAt).toLocaleString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
      }) : '--';

      const typeBadge = r.type === 'forgot_password'
        ? `<span class="badge-request-forgot">🔑 Quên MK</span>`
        : `<span class="badge-request-feedback">💬 Phản hồi</span>`;

      const statusBadge = isPending
        ? `<span class="badge-status-pending">Chờ xử lý</span>`
        : `<span class="badge-status-resolved">✓ Đã cấp lại MK (${r.resolvedPassword || '1234'})</span>`;

      const resolveBtn = isPending
        ? `<button type="button" class="btn btn-sm btn-primary" onclick="window.handleResolveSupport('${r._id}', '${r.traineeId}')" title="Đặt lại mật khẩu về 1234">
             <span>🔑 Đặt lại MK (1234)</span>
           </button>`
        : `<button type="button" class="btn btn-sm btn-secondary" onclick="window.handleResolveSupport('${r._id}', '${r.traineeId}')" title="Đặt lại một lần nữa về 1234">
             <span>↺ Cấp lại 1234</span>
           </button>`;

      return `
        <tr>
          <td style="text-align: center; font-weight: 600; color: var(--text-muted);">${index + 1}</td>
          <td>${typeBadge}</td>
          <td><strong style="color: var(--primary-blue);">${escapeHtml(r.traineeId || '--')}</strong></td>
          <td><strong>${escapeHtml(r.fullName || '--')}</strong></td>
          <td>
            <div>${escapeHtml(r.email || '--')}</div>
            ${r.phone ? `<small style="color: var(--text-muted);">SĐT: ${escapeHtml(r.phone)}</small>` : ''}
          </td>
          <td style="max-width: 240px; font-size: 0.82rem; color: var(--text-secondary); line-height: 1.4;">
            ${escapeHtml(r.note || r.message || '--')}
          </td>
          <td style="text-align: center; font-size: 0.8rem; color: var(--text-muted);">${createdDate}</td>
          <td style="text-align: center;">${statusBadge}</td>
          <td style="text-align: center; white-space: nowrap;">
            <div style="display: inline-flex; align-items: center; gap: 6px;">
              ${resolveBtn}
              <button type="button" class="btn btn-sm btn-outline text-danger" onclick="window.handleDeleteSupport('${r._id}')" title="Xóa yêu cầu">
                <span>🗑️</span>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Lỗi khi render support requests:', err);
  }
}

window.handleResolveSupport = async function(id, traineeId) {
  if (!confirm(`Bạn có chắc muốn đặt lại mật khẩu của sinh viên (${traineeId}) về mặc định là 1234?`)) return;

  if (window.showToast) window.showToast('Đang cập nhật mật khẩu trên MongoDB Atlas...', 'info');

  const res = await API.resolveSupportRequest(id, '1234');
  if (res && res.success) {
    if (window.showToast) window.showToast(`Đã đặt lại mật khẩu của ${traineeId} về 1234 và lưu vào MongoDB Atlas!`, 'success');
    await loadTrainees();
    renderAdminTable();
    renderAdminSupportRequests();
  } else {
    if (window.showToast) window.showToast((res && res.message) || 'Lỗi khi đặt lại mật khẩu!', 'danger');
  }
};

window.handleDeleteSupport = async function(id) {
  if (!confirm('Bạn có chắc muốn xóa yêu cầu này?')) return;

  const res = await API.deleteSupportRequest(id);
  if (res && res.success) {
    if (window.showToast) window.showToast('Đã xóa yêu cầu hỗ trợ!', 'success');
    renderAdminSupportRequests();
  } else {
    if (window.showToast) window.showToast((res && res.message) || 'Lỗi khi xóa yêu cầu!', 'danger');
  }
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
        const res = await (API.getSchedules ? API.getSchedules(10, 2026) : fetch('/api/schedules?month=10&year=2026').then(r => r.json()));
        schedules = res.data || [];
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
      selectSchedule.innerHTML = `<option value="TP-M10.05" data-title="Buổi 5: Tối ưu Trải nghiệm, Tải dữ liệu Báo cáo & Đồ án Khóa học" data-date="2026-10-29">[TP-M10.05] Buổi 5: Tối ưu Trải nghiệm, Tải dữ liệu Báo cáo & Đồ án Khóa học (29/10/2026)</option>`;
    }
  }

  // Nạp danh sách sinh viên
  if (selectTrainee) {
    const trainees = state.trainees || [];
    selectTrainee.innerHTML = `
      <option value="all">⭐ Tất cả sinh viên (Cộng đồng loạt ${trainees.length} sinh viên)</option>
      ${trainees.map(t => `<option value="${escapeHtml(t.traineeId)}">${escapeHtml(t.traineeId)} - ${escapeHtml(t.fullName)} (${t.accumulatedStars || 0} ⭐)</option>`).join('')}
    `;
  }

  // Render bảng lịch sử cộng sao gần nhất
  renderAdminRecentAwardsTable();

  // Khởi tạo Bảng Chấm Điểm & Cập Nhật Sao Theo Buổi (Cho Toàn Bộ Sinh Viên)
  if (selectSchedule) {
    selectSchedule.addEventListener('change', () => {
      renderAdminSessionGradingRoster(selectSchedule.value);
    });
    // Gọi khởi tạo ngay
    renderAdminSessionGradingRoster(selectSchedule.value);
  }

  // Nút gán sao nhanh cho tất cả sinh viên trong bảng chấm điểm buổi
  const btnQuick5 = document.getElementById('btnQuickSetAllStars');
  const btnQuick10 = document.getElementById('btnQuickSetAllStars10');
  if (btnQuick5 && !btnQuick5.dataset.bound) {
    btnQuick5.dataset.bound = 'true';
    btnQuick5.onclick = () => {
      document.querySelectorAll('#adminSessionGradingTableBody .grading-star-input').forEach(inp => inp.value = 5);
      if (window.showToast) window.showToast('Đã đặt +5 ⭐ cho tất cả sinh viên buổi này!', 'info');
    };
  }
  if (btnQuick10 && !btnQuick10.dataset.bound) {
    btnQuick10.dataset.bound = 'true';
    btnQuick10.onclick = () => {
      document.querySelectorAll('#adminSessionGradingTableBody .grading-star-input').forEach(inp => inp.value = 10);
      if (window.showToast) window.showToast('Đã đặt +10 ⭐ cho tất cả sinh viên buổi này!', 'info');
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

      // Thu thập điểm của từng sinh viên
      const rows = document.querySelectorAll('#adminSessionGradingTableBody tr');
      const studentRatings = [];

      rows.forEach(tr => {
        const traineeId = tr.getAttribute('data-trainee-id');
        const starInp = tr.querySelector('.grading-star-input');
        const noteInp = tr.querySelector('.grading-note-input');
        if (traineeId && starInp) {
          studentRatings.push({
            traineeId,
            starsAwarded: Math.max(0, Number(starInp.value) || 0),
            note: noteInp ? noteInp.value.trim() : 'Hoàn thành bài tập & tham gia tích cực'
          });
        }
      });

      if (studentRatings.length === 0) {
        if (window.showToast) window.showToast('Không có dữ liệu sinh viên để lưu!', 'warning');
        return;
      }

      btnSaveBatch.disabled = true;
      btnSaveBatch.innerHTML = `<span>⏳ Đang lưu vào MongoDB...</span>`;

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
            window.showToast(res.message || `Đã cập nhật bảng điểm ${sessionCode} cho toàn bộ sinh viên thành công!`, 'success');
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
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
            <polyline points="17 21 17 13 7 13 7 21"></polyline>
            <polyline points="7 3 7 8 15 8"></polyline>
          </svg>
          <span>💾 Lưu Điểm Buổi Học Này Vào MongoDB</span>
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
        btnSubmit.innerHTML = `<span>⏳ Đang đồng bộ MongoDB...</span>`;
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

          // Tải lại danh sách sinh viên & sinh viên hiện tại
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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
            <span>⭐ Xác Nhận Cộng Sao &amp; Đồng Bộ</span>
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
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: var(--text-muted);">Đang tải danh sách sinh viên...</td></tr>`;
    return;
  }

  tbody.innerHTML = trainees.map((t, idx) => {
    const existingLog = (t.sessionStars || []).find(s => s.sessionCode === sessionCode);
    const stars = existingLog !== undefined ? existingLog.starsAwarded : 5;
    const note = existingLog ? existingLog.note : 'Tham gia đầy đủ và hoàn thành tốt bài tập buổi học';
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
          <input type="number" class="grading-star-input" min="0" max="100" value="${stars}" title="Số sao cộng cho sinh viên trong buổi này">
        </td>
        <td>
          <input type="text" class="grading-note-input" value="${escapeHtml(note)}" placeholder="Nhận xét / lý do cộng sao">
        </td>
        <td style="text-align: center; font-weight: 700; color: #d97706;">
          ${cumulative} ⭐
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
      <td style="text-align: center;"><span class="grades-badge-awarded">+${s.starsAwarded} ⭐</span></td>
      <td style="font-size: 0.82rem; color: var(--text-secondary);">${escapeHtml(s.note || '')}</td>
      <td style="text-align: center;">
        <button type="button" class="btn btn-outline btn-xs btn-delete-award" data-trainee="${targetId}" data-id="${s._id}" style="color: var(--accent-red); border-color: rgba(239, 68, 68, 0.3);">
          🗑️ Xóa
        </button>
      </td>
    </tr>
  `).join('');

  // Lắng nghe sự kiện xóa bản ghi cộng sao
  tbody.querySelectorAll('.btn-delete-award').forEach(btn => {
    btn.onclick = async () => {
      const traineeId = btn.getAttribute('data-trainee');
      const starLogId = btn.getAttribute('data-id');
      if (!confirm('Bạn có chắc chắn muốn xóa bản ghi cộng sao này? Số sao tích lũy và biểu đồ sẽ tự động trừ lại trên MongoDB Atlas.')) return;

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

async function renderAdminAssignmentsTable() {
  const tbody = document.getElementById('adminAssignmentsTableBody');
  if (!tbody) return;

  setupAdminAssignmentsEvents();

  try {
    const list = await window.API.getAssignments();
    if (Array.isArray(list) && list.length > 0) {
      adminAssignmentsList = list;
    }
  } catch (err) {
    console.warn('Lỗi lấy assignments cho Admin:', err);
  }

  if (adminAssignmentsList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--text-muted);">Đang tải danh sách 11 bài tập từ MongoDB Atlas...</td></tr>`;
    return;
  }

  // Helper tính nhãn đếm ngược nhanh trong bảng Admin
  const formatAdminDeadlineBadge = (deadline) => {
    if (!deadline) return `<span class="badge" style="background: rgba(148,163,184,0.15); color: #64748b; font-size: 0.72rem;">Không giới hạn</span>`;
    const target = new Date(deadline).getTime();
    if (isNaN(target)) return `<span class="badge" style="background: rgba(148,163,184,0.15); color: #64748b; font-size: 0.72rem;">Không giới hạn</span>`;
    const diff = target - Date.now();
    if (diff <= 0) return `<span class="badge badge-danger" style="font-size: 0.72rem;">🚨 Đã hết hạn nộp</span>`;
    const d = Math.floor(diff / (1000 * 60 * 60 * 24));
    const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const m = Math.floor((diff / (1000 * 60)) % 60);
    if (d >= 1) {
      return `<span class="badge ${d > 2 ? 'badge-success' : 'badge-warning'}" style="font-size: 0.72rem;">⏰ ${d} ngày ${h} h còn lại</span>`;
    }
    return `<span class="badge badge-danger" style="font-size: 0.72rem;">⏰ ${h} h ${m} phút còn lại</span>`;
  };

  const toInputDateTime = (isoStr) => {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return '';
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const h = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      return `${y}-${m}-${day}T${h}:${min}`;
    } catch (e) {
      return '';
    }
  };

  tbody.innerHTML = adminAssignmentsList.map((a, idx) => {
    const id = a.assignmentId || a.id || (idx + 1);
    const hasLink = a.link && a.link.trim() !== '#' && a.link.trim() !== '';
    const statusClass = a.status === 'completed' ? 'completed' : (a.status === 'active' ? 'active' : 'locked');
    const deadlineVal = toInputDateTime(a.deadline);
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
            <option value="completed" ${a.status === 'completed' ? 'selected' : ''}>✓ Đã hoàn thành</option>
            <option value="active" ${a.status === 'active' ? 'selected' : ''}>★ Đang mở</option>
            <option value="locked" ${a.status === 'locked' ? 'selected' : ''}>🔒 Khóa</option>
          </select>
        </td>
        <td>
          <div style="display: flex; gap: 6px; align-items: center;">
            <input type="url" class="admin-assignment-link-input" data-id="${id}" 
                   value="${escapeHtml(a.link || '')}" 
                   placeholder="Dán link bài tập: https://github.com/... hoặc https://colab...">
          </div>
        </td>
        <td style="text-align: center;">
          <div style="display: flex; flex-direction: column; gap: 4px; align-items: center;">
            <input type="datetime-local" class="admin-assignment-deadline-input" data-id="${id}"
                   value="${deadlineVal}" 
                   style="font-size: 0.75rem; padding: 3px 6px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-main); max-width: 175px;">
            <div class="admin-countdown-badge-wrap" data-id="${id}">
              ${countdownBadge}
            </div>
          </div>
        </td>
        <td style="text-align: center;">
          <div style="font-size: 0.78rem; font-weight: 700; color: #16a34a;">+${a.xp || 50} XP</div>
          <div style="font-size: 0.72rem; color: #3b82f6;">+${a.gems || 10} 💎</div>
        </td>
        <td style="text-align: center;">
          <div style="display: inline-flex; align-items: center; gap: 6px;">
            <a href="${hasLink ? escapeHtml(a.link) : 'javascript:void(0)'}" 
               target="${hasLink ? '_blank' : '_self'}" 
               class="btn btn-outline btn-xs btn-open-assigned-link ${!hasLink ? 'disabled' : ''}" 
               data-id="${id}"
               title="Mở kiểm tra đường link này" 
               style="${!hasLink ? 'opacity: 0.5; pointer-events: none;' : ''}">
              <span>🔗 Mở</span>
            </a>
            <button type="button" class="btn btn-outline btn-xs btn-edit-assignment-detail" data-id="${id}" title="Chỉnh sửa chi tiết bài tập & deadline">
              <span>✏️</span>
            </button>
            <button type="button" class="btn btn-primary btn-xs btn-save-single-assignment" data-id="${id}" title="Lưu nhanh bài tập này">
              <span>💾</span>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

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
      const newLink = linkInput ? linkInput.value.trim() : '';
      const newStatus = statusSelect ? statusSelect.value : 'active';
      const deadlineVal = deadlineInput && deadlineInput.value ? new Date(deadlineInput.value).toISOString() : null;

      btn.disabled = true;
      btn.textContent = '⏳';

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
        btn.innerHTML = '<span>💾</span>';
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
}

function setupAdminAssignmentsEvents() {
  const btnSaveAll = document.getElementById('btnAdminSaveAllAssignments');
  const btnReset = document.getElementById('btnAdminResetAssignments');

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
        if (id) {
          payload.push({
            assignmentId: Number(id),
            link: linkInp ? linkInp.value.trim() : '',
            status: statusSel ? statusSel.value : 'active',
            deadline: deadlineInp && deadlineInp.value ? new Date(deadlineInp.value).toISOString() : null
          });
        }
      });

      if (payload.length === 0) return;

      btnSaveAll.disabled = true;
      btnSaveAll.innerHTML = `<span>⏳ Đang lưu vào MongoDB...</span>`;

      try {
        const res = await window.API.batchUpdateAssignments(payload);
        if (res && res.success) {
          if (window.showToast) {
            window.showToast('Đã lưu toàn bộ 11 đường link bài tập vào MongoDB Atlas thành công!', 'success');
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
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
            <polyline points="17 21 17 13 7 13 7 21"></polyline>
            <polyline points="7 3 7 8 15 8"></polyline>
          </svg>
          <span>💾 Lưu Toàn Bộ Link Vào MongoDB</span>
        `;
      }
    };
  }

  if (btnReset && !btnReset.dataset.bound) {
    btnReset.dataset.bound = 'true';
    btnReset.onclick = async () => {
      if (!confirm('Bạn có chắc chắn muốn khôi phục 11 bài tập về liên kết và nội dung mặc định ban đầu?')) return;

      btnReset.disabled = true;
      btnReset.innerHTML = `<span>⏳ Đang reset...</span>`;

      try {
        const res = await window.API.resetAssignments();
        if (res && res.success) {
          if (window.showToast) window.showToast('Đã khôi phục 11 bài tập về mặc định ban đầu!', 'success');
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
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="1 4 1 10 7 10"></polyline>
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
          </svg>
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

  if (btnClose) btnClose.onclick = closeModal;
  if (btnCancel) btnCancel.onclick = closeModal;
  if (btnClearDeadline) {
    btnClearDeadline.onclick = () => {
      const input = document.getElementById('editAssignmentDeadline');
      if (input) input.value = '';
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
      const id = document.getElementById('editAssignmentIdHidden').value;
      const title = document.getElementById('editAssignmentTitle').value.trim();
      const desc = document.getElementById('editAssignmentDesc').value.trim();
      const link = document.getElementById('editAssignmentLink').value.trim();
      const status = document.getElementById('editAssignmentStatus').value;
      const xp = Number(document.getElementById('editAssignmentXp').value) || 50;
      const gems = Number(document.getElementById('editAssignmentGems').value) || 10;
      const deadlineInput = document.getElementById('editAssignmentDeadline');
      const deadlineVal = deadlineInput ? deadlineInput.value : '';
      const deadline = deadlineVal ? new Date(deadlineVal).toISOString() : null;

      const btnSubmit = document.getElementById('btnSubmitAdminEditAssignment');
      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.textContent = '⏳ Đang lưu...';
      }

      try {
        const res = await window.API.updateAssignment(id, { title, desc, link, status, xp, gems, deadline });
        if (res && res.success) {
          closeModal();
          if (window.showToast) {
            window.showToast(`Đã lưu thay đổi bài tập "${title}" vào MongoDB Atlas!`, 'success');
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
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.innerHTML = '<span>💾 Lưu Thay Đổi Vào MongoDB</span>';
        }
      }
    };
  }
}

function openAdminEditAssignmentModal(item) {
  const modal = document.getElementById('adminEditAssignmentModal');
  if (!modal) return;

  const id = item.assignmentId || item.id;
  const subTitle = document.getElementById('editAssignmentSubTitle');
  const inputId = document.getElementById('editAssignmentIdHidden');
  const inputTitle = document.getElementById('editAssignmentTitle');
  const inputDesc = document.getElementById('editAssignmentDesc');
  const inputLink = document.getElementById('editAssignmentLink');
  const selectStatus = document.getElementById('editAssignmentStatus');
  const inputXp = document.getElementById('editAssignmentXp');
  const inputGems = document.getElementById('editAssignmentGems');
  const inputDeadline = document.getElementById('editAssignmentDeadline');

  if (subTitle) subTitle.textContent = `Bài tập #${id} - Cập nhật tiêu đề, mô tả và đường link`;
  if (inputId) inputId.value = id;
  if (inputTitle) inputTitle.value = item.title || '';
  if (inputDesc) inputDesc.value = item.desc || '';
  if (inputLink) inputLink.value = item.link || '';
  if (selectStatus) selectStatus.value = item.status || 'locked';
  if (inputXp) inputXp.value = item.xp || 50;
  if (inputGems) inputGems.value = item.gems || 10;

  if (inputDeadline) {
    if (item.deadline) {
      const d = new Date(item.deadline);
      if (!isNaN(d.getTime())) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        inputDeadline.value = `${year}-${month}-${day}T${hours}:${mins}`;
      } else {
        inputDeadline.value = '';
      }
    } else {
      inputDeadline.value = '';
    }
  }

  modal.classList.add('open', 'show');
  if (inputTitle) inputTitle.focus();
}

window.renderAdminAssignmentsTable = renderAdminAssignmentsTable;


// Expose to global window
window.renderAdminView = renderAdminView;
window.renderAdminTraineesTable = renderAdminTraineesTable;
window.openDeleteModal = openDeleteModal;
window.renderAdminSupportRequests = renderAdminSupportRequests;
window.setupAdminAwardStarsSection = setupAdminAwardStarsSection;
window.renderAdminAssignmentsTable = renderAdminAssignmentsTable;
window.openAdminEditAssignmentModal = openAdminEditAssignmentModal;
