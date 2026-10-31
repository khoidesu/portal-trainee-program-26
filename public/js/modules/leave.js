let leaveChallengeWidget;
let leaveChallengeToken = '';
let leaveConfigPromise;

function getSavedLeaveHistory() {
  try {
    const list = JSON.parse(localStorage.getItem('uit_trainee_leave_receipts_v2') || '[]');
    return Array.isArray(list) ? list.slice(0, 20) : [];
  } catch {
    return [];
  }
}

function saveLeaveHistory(list) {
  try {
    localStorage.setItem('uit_trainee_leave_receipts_v2', JSON.stringify(list.slice(0, 20)));
  } catch {}
}

function leaveFeedback(message, isError = false) {
  const element = document.getElementById('leaveFeedback');
  if (element) {
    element.textContent = message;
    element.className = isError ? 'form-help-text text-danger' : 'form-help-text';
  }
}

async function loadLeaveChallenge() {
  if (!leaveConfigPromise) {
    leaveConfigPromise = fetch('/api/public-config').then(async response => {
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error('Không tải được cấu hình xin nghỉ.');
      return result.data;
    }).catch(error => { leaveConfigPromise = null; throw error; });
  }
  const config = await leaveConfigPromise;
  if (!config.turnstileSiteKey || leaveChallengeWidget !== undefined) return;
  if (!window.turnstile) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Không tải được xác minh chống spam. Vui lòng tải lại trang.'));
      document.head.appendChild(script);
    });
  }
  leaveChallengeWidget = window.turnstile.render('#leaveChallenge', {
    sitekey: config.turnstileSiteKey,
    action: 'leave',
    callback: token => { leaveChallengeToken = token; },
    'expired-callback': () => { leaveChallengeToken = ''; },
    'error-callback': () => { leaveChallengeToken = ''; leaveFeedback('Xác minh chống spam gặp lỗi. Vui lòng tải lại trang.', true); }
  });
}

async function renderLeaveView() {
  const select = document.getElementById('leaveSelectSchedule');
  const submit = document.getElementById('btnSubmitLeave');
  if (!select) return;
  submit.disabled = true;
  leaveFeedback('Đang tải lịch học…');
  try {
    const month = window.ScheduleManager?.selectedMonth || new Date().getMonth() + 1;
    const year = window.ScheduleManager?.selectedYear || new Date().getFullYear();
    const response = await fetch(`/api/schedules?month=${month}&year=${year}`);
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error('Không tải được lịch học. Vui lòng thử lại.');
    const selected = select.value;
    select.innerHTML = '<option value="">-- Chọn buổi học bạn muốn xin nghỉ --</option>' + result.data.map(item =>
      `<option value="${escapeHtml(item.code)}" data-title="${escapeHtml(item.title)}" data-date="${escapeHtml(item.date)}" data-time="${escapeHtml(item.startTime)} - ${escapeHtml(item.endTime)}" data-instructor="${escapeHtml(item.instructor)}">[${escapeHtml(item.code)}] ${escapeHtml(item.title)} (${escapeHtml(item.date)})</option>`
    ).join('');
    select.value = selected;
    await loadLeaveChallenge();
    leaveFeedback(result.data.length ? 'Mỗi Trainee chỉ gửi một đơn cho mỗi buổi học. Đơn mới được hiển thị công khai và chờ Ban Tổ chức xem xét.' : 'Tháng này chưa có lịch học. Hãy chọn tháng tại mục Thời khóa biểu rồi quay lại.');
    submit.disabled = result.data.length === 0;
  } catch (error) {
    leaveFeedback(error.message || 'Không tải được biểu mẫu. Vui lòng tải lại trang.', true);
  }
  updateLeaveSchedulePreview();
  renderLeaveHistoryTable();
}

function updateLeaveSchedulePreview() {
  const select = document.getElementById('leaveSelectSchedule');
  const box = document.getElementById('leaveSchedulePreview');
  const selected = select?.selectedOptions[0];
  if (!box || !selected?.value) {
    if (box) box.style.display = 'none';
    return;
  }
  const values = {
    previewSessionCode: selected.value, previewSessionTitle: selected.dataset.title,
    previewSessionTime: `${selected.dataset.date} · ${selected.dataset.time}`,
    previewSessionInstructor: selected.dataset.instructor
  };
  Object.entries(values).forEach(([id, value]) => { const element = document.getElementById(id); if (element) element.textContent = value || ''; });
  box.style.display = 'flex';
}

let leaveBoardRequest = 0;
async function renderLeaveHistoryTable() {
  const body = document.getElementById('leaveHistoryTableBody');
  const badge = document.getElementById('leaveHistoryCountBadge');
  if (!body) return;
  const request = ++leaveBoardRequest;
  body.innerHTML = '<tr><td colspan="7">Đang tải bảng xin nghỉ…</td></tr>';
  try {
    const list = await API.getPublicLeave();
    if (request !== leaveBoardRequest) return;
    if (badge) badge.textContent = list.length + ' đơn';
    if (!list.length) { body.innerHTML = '<tr><td colspan="7">Chưa có đơn xin nghỉ công khai.</td></tr>'; return; }
    body.innerHTML = list.map((item, index) => `<tr>
      <td>${index + 1}</td><td>${escapeHtml(item.traineeId)}</td><td>${escapeHtml(item.fullName)}</td>
      <td><strong>${escapeHtml(item.scheduleTitle)}</strong><br>${escapeHtml(item.scheduleDate)} · ${escapeHtml(item.scheduleTime)}</td>
      <td class="leave-public-reason">${escapeHtml(item.reason)}</td>
      <td><time datetime="${escapeHtml(item.submittedAt)}">${escapeHtml(new Date(item.submittedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }))}</time></td>
      <td><span>${({ pending: 'Chờ xem xét', resolved: 'Đã duyệt', rejected: 'Từ chối' })[item.status] || 'Chờ xem xét'}</span>
      ${window.canManage?.('leave:manage') && item.status === 'pending' ? `<div class="context-actions"><button type="button" class="btn btn-primary btn-xs leave-review" data-id="${escapeHtml(item.id)}" data-status="resolved">Duyệt</button><button type="button" class="btn btn-outline btn-xs leave-review" data-id="${escapeHtml(item.id)}" data-status="rejected">Từ chối</button></div>` : ''}</td>
    </tr>`).join('');
    body.querySelectorAll('.leave-review').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const result = await API.updateLeave(button.dataset.id, button.dataset.status);
        if (!result.success) throw new Error(result.message);
        await renderLeaveHistoryTable();
      } catch (error) { leaveFeedback(error.message, true); button.disabled = false; }
    }));
  } catch (error) {
    if (request !== leaveBoardRequest) return;
    body.innerHTML = '<tr><td colspan="7">Không tải được bảng xin nghỉ. Bấm Tải lại để thử.</td></tr>';
    if (badge) badge.textContent = '—';
  }
}

function setupLeaveFormEvents() {
  const reload = document.getElementById('btnRefreshLeaveBoard');
  if (reload && !reload.dataset.bound) { reload.dataset.bound = 'true'; reload.addEventListener('click', renderLeaveHistoryTable); }
  const form = document.getElementById('leaveApplicationForm');
  const select = document.getElementById('leaveSelectSchedule');
  const reasonInput = document.getElementById('leaveInputReason');
  const banner = document.getElementById('leaveSuccessAlert');
  select?.addEventListener('change', updateLeaveSchedulePreview);
  document.querySelectorAll('.leave-chip').forEach(button => button.addEventListener('click', () => {
    reasonInput.value = [reasonInput.value.trim(), button.dataset.reason].filter(Boolean).join('\n').slice(0, 3000);
    reasonInput.focus();
  }));
  document.getElementById('btnDismissLeaveSuccess')?.addEventListener('click', () => { banner.style.display = 'none'; });
  document.getElementById('btnResetLeaveForm')?.addEventListener('click', () => {
    form.reset();
    banner.style.display = 'none';
    updateLeaveSchedulePreview();
    leaveFeedback('');
  });
  if (!form || form.dataset.initialized) return;
  form.dataset.initialized = 'true';
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = document.getElementById('btnSubmitLeave');
    if (submit.disabled) return;
    banner.style.display = 'none';
    const mssv = document.getElementById('leaveInputMssv').value.trim();
    const fullName = document.getElementById('leaveInputFullName').value.trim();
    const selected = select.selectedOptions[0];
    const reason = reasonInput.value.trim();
    if (!/^\d{6,12}$/.test(mssv) || !fullName || !selected?.value || reason.length < 10 || reason.length > 3000 || !document.getElementById('leaveCheckCommit').checked) {
      leaveFeedback('Vui lòng nhập đầy đủ MSSV, họ tên, buổi học, lý do (10–3000 ký tự) và xác nhận cam kết.', true);
      return;
    }
    if (leaveChallengeWidget !== undefined && !leaveChallengeToken) {
      leaveFeedback('Vui lòng hoàn tất xác minh chống spam.', true);
      return;
    }
    submit.disabled = true;
    submit.setAttribute('aria-busy', 'true');
    leaveFeedback('Đang gửi đơn xin nghỉ…');
    try {
      const result = await API.submitLeave({
        traineeId: mssv, fullName, scheduleCode: selected.value, scheduleDate: selected.dataset.date,
        reason, commit: true, turnstileToken: leaveChallengeToken
      });
      const receipt = {
        id: result.data.id, mssv, fullName, scheduleCode: selected.value, scheduleTitle: selected.dataset.title,
        submittedAt: result.data.submittedAt,
        status: result.data.status === 'resolved' ? 'Đã duyệt' : result.data.status === 'rejected' ? 'Từ chối' : 'Chờ xem xét khi gửi'
      };
      saveLeaveHistory([receipt, ...getSavedLeaveHistory().filter(item => item.id !== receipt.id)]);
      document.getElementById('leaveSuccessDesc').textContent = result.message;
      document.getElementById('leaveSuccessMeta').textContent = `Mã đơn: ${receipt.id} · ${receipt.fullName} (${receipt.mssv}) · ${receipt.scheduleCode}`;
      banner.style.display = 'flex';
      banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      renderLeaveHistoryTable();
      leaveFeedback(result.message);
      window.showToast?.('Đã ghi nhận đơn xin nghỉ.', 'success');
    } catch (error) {
      leaveFeedback(error.message || 'Chưa gửi được đơn. Vui lòng thử lại.', true);
    } finally {
      submit.disabled = false;
      submit.removeAttribute('aria-busy');
      if (leaveChallengeWidget !== undefined) {
        leaveChallengeToken = '';
        window.turnstile.reset(leaveChallengeWidget);
      }
    }
  });
}

function initLeaveModule() { setupLeaveFormEvents(); }
window.initLeaveModule = initLeaveModule;
window.renderLeaveView = renderLeaveView;
window.getSavedLeaveHistory = getSavedLeaveHistory;
window.saveLeaveHistory = saveLeaveHistory;
