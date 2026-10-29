/**
 * ==============================================================================
 * COMPONENT: Leave Request Module (Đơn Xin Nghỉ Học Trực Tuyến)
 * CHỨC NĂNG CHÍNH: Cho phép sinh viên đăng ký xin nghỉ học trực tuyến kèm lý do,
 *                  minh chứng và quản lý lịch sử đơn từ.
 * LIÊN KẾT & PHỤ THUỘC: public/js/modules/core.js, localStorage
 * NHIỆM VỤ CHI TIẾT:
 *   - initLeaveModule: Gắn sự kiện submit form xin nghỉ học
 *   - getSavedLeaveHistory & saveLeaveHistory: Lưu trữ lịch sử đơn
 *   - renderLeaveHistoryTable: Hiển thị danh sách các đơn đã nộp kèm trạng thái duyệt
 * ==============================================================================
 */

// ==========================================
// ĐƠN XIN NGHỈ HỌC TRỰC TUYẾN (LEAVE REQUEST MODULE)
// ==========================================

function getSavedLeaveHistory() {
  try {
    const raw = localStorage.getItem('uit_trainee_leave_history');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn('Lỗi đọc lịch sử xin nghỉ:', e);
  }
  return [
    {
      id: 'leave_init_01',
      mssv: '25520918',
      fullName: 'Khôi Trương Trần Anh',
      scheduleCode: 'TP-M10.02',
      scheduleTitle: 'Buổi 2: Thiết kế Cơ sở dữ liệu MongoDB Atlas & Mongoose Modeling',
      date: '2026-10-13',
      time: '19:30 - 21:30',
      reason: 'Trùng lịch thi giữa kỳ môn Cơ sở dữ liệu tại trường UIT.',
      submittedAt: '2026-10-12T14:20:00.000Z',
      status: 'Đã duyệt (Có phép)'
    }
  ];
}

function saveLeaveHistory(list) {
  try {
    localStorage.setItem('uit_trainee_leave_history', JSON.stringify(list));
  } catch (e) {
    console.error('Lỗi lưu lịch sử xin nghỉ:', e);
  }
}

async function renderLeaveView() {
  const mssvInput = document.getElementById('leaveInputMssv');
  const nameInput = document.getElementById('leaveInputFullName');
  const selectSchedule = document.getElementById('leaveSelectSchedule');

  // 1. Tự động điền thông tin sinh viên hiện tại
  const currentId = state.currentTrainee ? state.currentTrainee.traineeId : (state.currentUser ? state.currentUser.traineeId : '25520918');
  const currentName = state.currentTrainee ? state.currentTrainee.fullName : (state.currentUser ? state.currentUser.fullName : 'Khôi Trương Trần Anh');

  if (mssvInput && !mssvInput.value) {
    mssvInput.value = currentId;
  }
  if (nameInput && !nameInput.value) {
    nameInput.value = currentName;
  }

  // 2. Nạp danh sách buổi học từ Database lịch học
  if (selectSchedule) {
    let schedules = [];
    if (window.ScheduleManager && window.ScheduleManager.cachedSchedules && window.ScheduleManager.cachedSchedules.length > 0) {
      schedules = window.ScheduleManager.cachedSchedules;
    } else if (state.schedules && state.schedules.length > 0) {
      schedules = state.schedules;
    } else if (typeof DEFAULT_MONTHLY_SCHEDULES !== 'undefined' && Array.isArray(DEFAULT_MONTHLY_SCHEDULES)) {
      schedules = DEFAULT_MONTHLY_SCHEDULES;
    }

    if (schedules.length === 0) {
      try {
        const res = await (API.getSchedules ? API.getSchedules(10, 2026) : fetch('/api/schedules?month=10&year=2026').then(r => r.json()));
        schedules = res.data || [];
        state.schedules = schedules;
      } catch (e) {
        if (typeof DEFAULT_MONTHLY_SCHEDULES !== 'undefined') schedules = DEFAULT_MONTHLY_SCHEDULES;
      }
    }

    const currentSelected = selectSchedule.value;
    selectSchedule.innerHTML = '<option value="">-- Vui lòng chọn buổi học bạn muốn xin nghỉ --</option>' +
      schedules.map(s => {
        const dateStr = s.dayOfWeekText ? `${s.dayOfWeekText}, ${formatDateVN(s.date)}` : formatDateVN(s.date);
        return `<option value="${escapeHtml(s.code)}" 
                  data-code="${escapeHtml(s.code)}" 
                  data-title="${escapeHtml(s.title)}" 
                  data-date="${escapeHtml(s.date)}" 
                  data-time="${escapeHtml(s.startTime || '19:30')} - ${escapeHtml(s.endTime || '21:30')}" 
                  data-instructor="${escapeHtml(s.instructor || 'Giảng viên UIT')}">
                  [${escapeHtml(s.code)}] ${escapeHtml(s.title)} (${dateStr} · ${escapeHtml(s.startTime || '19:30')} - ${escapeHtml(s.endTime || '21:30')})
                </option>`;
      }).join('');

    if (currentSelected) {
      selectSchedule.value = currentSelected;
    }

    // Update session preview
    updateLeaveSchedulePreview();
  }

  // 3. Render danh sách lịch sử đơn đã gửi
  renderLeaveHistoryTable();
}

function updateLeaveSchedulePreview() {
  const selectSchedule = document.getElementById('leaveSelectSchedule');
  const previewBox = document.getElementById('leaveSchedulePreview');
  if (!selectSchedule || !previewBox) return;

  const selectedOpt = selectSchedule.options[selectSchedule.selectedIndex];
  if (!selectedOpt || !selectedOpt.value) {
    previewBox.style.display = 'none';
    return;
  }

  const code = selectedOpt.getAttribute('data-code') || selectedOpt.value;
  const title = selectedOpt.getAttribute('data-title') || '';
  const date = selectedOpt.getAttribute('data-date') || '';
  const time = selectedOpt.getAttribute('data-time') || '';
  const instructor = selectedOpt.getAttribute('data-instructor') || 'Giảng viên UIT';

  const previewCode = document.getElementById('previewSessionCode');
  const previewTitle = document.getElementById('previewSessionTitle');
  const previewTime = document.getElementById('previewSessionTime');
  const previewInstructor = document.getElementById('previewSessionInstructor');

  if (previewCode) previewCode.textContent = code;
  if (previewTitle) previewTitle.textContent = title;
  if (previewTime) previewTime.textContent = `${formatDateVN(date)} · ${time}`;
  if (previewInstructor) previewInstructor.textContent = instructor;

  previewBox.style.display = 'flex';
}

function renderLeaveHistoryTable() {
  const tbody = document.getElementById('leaveHistoryTableBody');
  const badge = document.getElementById('leaveHistoryCountBadge');
  if (!tbody) return;

  const list = getSavedLeaveHistory();
  if (badge) badge.textContent = `${list.length} đơn`;

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 24px; color: var(--text-muted);">
          Bạn chưa gửi đơn xin nghỉ nào. Điền form bên trên để gửi đơn xin phép khi cần.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = list.map((item, idx) => {
    let dateSubmittedStr = '';
    try {
      const d = new Date(item.submittedAt);
      dateSubmittedStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} · ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    } catch (e) {
      dateSubmittedStr = item.submittedAt || '';
    }

    return `
      <tr>
        <td style="font-weight: 700; color: var(--text-muted); text-align: center;">${idx + 1}</td>
        <td><strong>${escapeHtml(item.mssv)}</strong></td>
        <td>${escapeHtml(item.fullName)}</td>
        <td>
          <span class="preview-badge" style="display: inline-block; margin-bottom: 2px;">${escapeHtml(item.scheduleCode)}</span>
          <div style="font-size: 0.82rem; font-weight: 600; color: var(--text-main);">${escapeHtml(item.scheduleTitle)}</div>
        </td>
        <td style="max-width: 280px; font-size: 0.8rem; color: var(--text-secondary); line-height: 1.4;">
          ${escapeHtml(item.reason)}
        </td>
        <td style="font-size: 0.78rem; color: var(--text-muted); white-space: nowrap;">
          ${escapeHtml(dateSubmittedStr)}
        </td>
        <td>
          <span class="leave-status-badge approved">
            <span>✓</span> ${escapeHtml(item.status || 'Đã duyệt (Có phép)')}
          </span>
        </td>
      </tr>
    `;
  }).join('');
}

function setupLeaveFormEvents() {
  const form = document.getElementById('leaveApplicationForm');
  const selectSchedule = document.getElementById('leaveSelectSchedule');
  const reasonInput = document.getElementById('leaveInputReason');
  const resetBtn = document.getElementById('btnResetLeaveForm');
  const dismissBtn = document.getElementById('btnDismissLeaveSuccess');
  const successAlert = document.getElementById('leaveSuccessAlert');

  // 1. Khi chọn buổi học -> hiện preview
  if (selectSchedule) {
    selectSchedule.addEventListener('change', updateLeaveSchedulePreview);
  }

  // 2. Bấm các gợi ý lý do nhanh (chips)
  document.querySelectorAll('.leave-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.getAttribute('data-reason');
      if (reasonInput && text) {
        if (reasonInput.value.trim()) {
          reasonInput.value += `\n- ${text}`;
        } else {
          reasonInput.value = text;
        }
        reasonInput.focus();
      }
    });
  });

  // 3. Nút nhập lại (Reset form)
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (form) form.reset();
      const previewBox = document.getElementById('leaveSchedulePreview');
      if (previewBox) previewBox.style.display = 'none';
      if (successAlert) successAlert.style.display = 'none';

      // Giữ lại MSSV và họ tên mặc định
      const mssvInput = document.getElementById('leaveInputMssv');
      const nameInput = document.getElementById('leaveInputFullName');
      const currentId = state.currentTrainee ? state.currentTrainee.traineeId : (state.currentUser ? state.currentUser.traineeId : '25520918');
      const currentName = state.currentTrainee ? state.currentTrainee.fullName : (state.currentUser ? state.currentUser.fullName : 'Khôi Trương Trần Anh');
      if (mssvInput) mssvInput.value = currentId;
      if (nameInput) nameInput.value = currentName;
    });
  }

  // 4. Đóng thông báo thành công
  if (dismissBtn && successAlert) {
    dismissBtn.addEventListener('click', () => {
      successAlert.style.display = 'none';
    });
  }

  // 5. Gửi đơn xin nghỉ (Submit Form)
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const mssv = (document.getElementById('leaveInputMssv')?.value || '').trim();
      const fullName = (document.getElementById('leaveInputFullName')?.value || '').trim();
      const scheduleCode = selectSchedule ? selectSchedule.value : '';
      const selectedOpt = selectSchedule ? selectSchedule.options[selectSchedule.selectedIndex] : null;
      const scheduleTitle = selectedOpt ? (selectedOpt.getAttribute('data-title') || selectedOpt.text) : '';
      const reason = (reasonInput?.value || '').trim();
      const commitChecked = document.getElementById('leaveCheckCommit')?.checked;

      // Validation
      if (!mssv) {
        if (window.showToast) window.showToast('Vui lòng nhập Mã số sinh viên (MSSV)!', 'warning');
        document.getElementById('leaveInputMssv')?.focus();
        return;
      }
      if (!fullName) {
        if (window.showToast) window.showToast('Vui lòng nhập Họ và tên sinh viên!', 'warning');
        document.getElementById('leaveInputFullName')?.focus();
        return;
      }
      if (!scheduleCode) {
        if (window.showToast) window.showToast('Vui lòng chọn Buổi học bạn cần xin nghỉ!', 'warning');
        selectSchedule?.focus();
        return;
      }
      if (!reason || reason.length < 10) {
        if (window.showToast) window.showToast('Vui lòng nhập chi tiết lý do xin nghỉ (ít nhất 10 ký tự)!', 'warning');
        reasonInput?.focus();
        return;
      }
      if (!commitChecked) {
        if (window.showToast) window.showToast('Vui lòng tích xác nhận cam kết tự giác xem lại bài học!', 'warning');
        return;
      }

      // Tạo đối tượng đơn xin nghỉ mới
      const newLeaveRecord = {
        id: `leave_${Date.now()}`,
        mssv,
        fullName,
        scheduleCode,
        scheduleTitle,
        reason,
        submittedAt: new Date().toISOString(),
        status: 'Đã duyệt (Có phép)'
      };

      // Lưu vào danh sách lịch sử
      const list = getSavedLeaveHistory();
      list.unshift(newLeaveRecord);
      saveLeaveHistory(list);

      // Cập nhật banner thành công
      if (successAlert) {
        const metaEl = document.getElementById('leaveSuccessMeta');
        if (metaEl) {
          metaEl.innerHTML = `
            <span>Sinh viên: <strong>${escapeHtml(fullName)} (${escapeHtml(mssv)})</strong></span>
            <span>Buổi nghỉ: <strong>${escapeHtml(scheduleCode)} - ${escapeHtml(scheduleTitle)}</strong></span>
            <span>Thời gian nộp: <strong>Vừa xong (${new Date().toLocaleTimeString('vi-VN')} · ${new Date().toLocaleDateString('vi-VN')})</strong></span>
            <span>Trạng thái: <strong style="color: #059669;">Đã tiếp nhận có phép</strong></span>
          `;
        }
        successAlert.style.display = 'flex';
        successAlert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      // Render lại lịch sử
      renderLeaveHistoryTable();

      // Thông báo toast
      if (window.showToast) {
        window.showToast(`Đã gửi đơn xin nghỉ thành công cho buổi [${scheduleCode}]!`, 'success');
      }

      // Xóa ô lý do để tránh gửi trùng
      if (reasonInput) reasonInput.value = '';
    });
  }
}


function initLeaveModule() {
  setupLeaveFormEvents();
}

// Expose to global window
window.initLeaveModule = initLeaveModule;
window.renderLeaveView = renderLeaveView;
window.getSavedLeaveHistory = getSavedLeaveHistory;
window.saveLeaveHistory = saveLeaveHistory;
