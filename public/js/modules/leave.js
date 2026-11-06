let leaveChallengeWidget;
let leaveChallengeToken = '';
let leaveConfigPromise;

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
  const user = window.state?.currentUser;
  if (!user) {
    if (typeof openLoginModal === 'function') openLoginModal('leave');
    return;
  }
  const isTrainee = user.role === 'trainee' && user.traineeId;
  const formCard = document.getElementById('leaveFormCard');
  if (formCard) formCard.style.display = isTrainee ? '' : 'none';
  const identityMssv = document.getElementById('leaveIdentityMssv');
  const identityFullName = document.getElementById('leaveIdentityFullName');
  if (identityMssv) identityMssv.textContent = user.traineeId || '—';
  if (identityFullName) identityFullName.textContent = user.fullName || user.username || '';
  if (!isTrainee) {
    renderLeaveHistoryTable();
    return;
  }
  submit.disabled = true;
  leaveFeedback('Đang tải lịch học…');
  try {
    let response = await fetch('/api/schedules?all=true');
    let result = await response.json();
    if (!response.ok || !result.success || !result.data?.length) {
      const month = window.ScheduleManager?.selectedMonth || new Date().getMonth() + 1;
      const year = window.ScheduleManager?.selectedYear || new Date().getFullYear();
      response = await fetch(`/api/schedules?month=${month}&year=${year}`);
      result = await response.json();
    }
    if (!response.ok || !result.success) throw new Error('Không tải được lịch học. Vui lòng thử lại.');
    const now = Date.now();
    const allSessions = (result.data || []).sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    // Chỉ lấy các buổi học sắp diễn ra (chưa kết thúc), loại bỏ các buổi đã diễn ra
    const isSessionEnded = item => {
      if (item.status === 'completed') return true;
      const endTime = item.endTime || '21:30';
      const endsAt = Date.parse(`${item.date}T${endTime}:00+07:00`);
      return Number.isFinite(endsAt) && endsAt <= now;
    };

    const upcomingSessions = allSessions.filter(s => !isSessionEnded(s));

    const selected = select.value;
    let optionsHtml = '<option value="">-- Chọn buổi học bạn muốn xin nghỉ --</option>';

    if (upcomingSessions.length > 0) {
      optionsHtml += upcomingSessions.map(item =>
        `<option value="${escapeHtml(item.code)}" data-title="${escapeHtml(item.title)}" data-date="${escapeHtml(item.date)}" data-time="${escapeHtml(item.startTime)} - ${escapeHtml(item.endTime)}" data-instructor="${escapeHtml(item.instructor)}">[${escapeHtml(item.code)}] ${escapeHtml(item.title)} (${escapeHtml(item.date)})</option>`
      ).join('');
    } else {
      optionsHtml += '<option value="" disabled>-- Hiện không có buổi học sắp diễn ra nào --</option>';
    }

    select.innerHTML = optionsHtml;
    select.value = selected;
    await loadLeaveChallenge();
    leaveFeedback(upcomingSessions.length ? 'Mỗi Trainee chỉ gửi một đơn cho mỗi buổi học. Đơn sẽ chờ Admin xem xét.' : (allSessions.length ? 'Các buổi học đã kết thúc, hiện chưa có buổi học sắp diễn ra để xin nghỉ.' : 'Chưa có lịch học.'));
    submit.disabled = upcomingSessions.length === 0;
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
    previewSessionInstructor: state.currentUser ? selected.dataset.instructor : 'Đăng nhập để xem'
  };
  Object.entries(values).forEach(([id, value]) => { const element = document.getElementById(id); if (element) element.textContent = value || ''; });
  box.style.display = 'flex';
}

let leaveBoardRequest = 0;
async function renderLeaveHistoryTable() {
  const body = document.getElementById('leaveHistoryTableBody');
  const badge = document.getElementById('leaveHistoryCountBadge');
  if (!body) return;
  const canReview = Boolean(typeof canManage === 'function' ? canManage('leave:manage') : false) || window.state?.currentUser?.role === 'admin' || Boolean(window.state?.currentUser?.isOwner);
  const showMssv = Boolean(typeof canViewMssv === 'function' ? canViewMssv() : canReview);
  const title = document.getElementById('leaveHistoryTitle');
  if (title) title.textContent = canReview ? 'Tất cả đơn xin nghỉ' : 'Đơn xin nghỉ của bạn';
  const colMssv = document.getElementById('leaveColMssv');
  if (colMssv) colMssv.style.display = showMssv ? '' : 'none';
  const colSpan = showMssv ? 7 : 6;

  const request = ++leaveBoardRequest;
  body.innerHTML = `<tr><td colspan="${colSpan}">Đang tải bảng xin nghỉ…</td></tr>`;
  try {
    const list = await API.getLeaveRequests();
    if (request !== leaveBoardRequest) return;
    if (badge) badge.textContent = list.length + ' đơn';
    if (!list.length) { body.innerHTML = `<tr><td colspan="${colSpan}">${canReview ? 'Chưa có đơn xin nghỉ.' : 'Bạn chưa gửi đơn xin nghỉ nào.'}</td></tr>`; return; }
    body.innerHTML = list.map((item, index) => `<tr>
      <td>${index + 1}</td>${showMssv ? `<td>${escapeHtml(item.traineeId || '')}</td>` : ''}<td>${escapeHtml(item.fullName)}</td>
      <td><strong>${escapeHtml(item.scheduleTitle)}</strong><br>${escapeHtml(item.scheduleDate)} · ${escapeHtml(item.scheduleTime)}</td>
      <td class="leave-public-reason">${escapeHtml(item.reason)}</td>
      <td><time datetime="${escapeHtml(item.submittedAt)}">${escapeHtml(new Date(item.submittedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }))}</time></td>
      <td><span>${({ pending: 'Chờ xem xét', resolved: 'Đã duyệt', rejected: 'Từ chối' })[item.status] || 'Chờ xem xét'}</span>
      ${canReview && item.status === 'pending' ? `<div class="context-actions"><button type="button" class="btn btn-primary btn-xs leave-review" data-id="${escapeHtml(item.id)}" data-status="resolved">Duyệt</button><button type="button" class="btn btn-outline btn-xs leave-review" data-id="${escapeHtml(item.id)}" data-status="rejected">Từ chối</button></div>` : ''}</td>
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
    body.innerHTML = `<tr><td colspan="${colSpan}">Không tải được bảng xin nghỉ. Bấm "Làm mới" để thử.</td></tr>`;
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
  document.querySelectorAll('.leave-chip').forEach(button => {
    if (button.dataset.bound) return;
    button.dataset.bound = 'true';
    button.addEventListener('click', () => {
      const template = (button.dataset.reason || '').trim();
      if (!template) return;
      const currentVal = reasonInput.value.trim();
      if (!currentVal) {
        reasonInput.value = template;
      } else if (!currentVal.includes(template)) {
        reasonInput.value = currentVal + '\n' + template;
      }
      reasonInput.focus();
    });
  });
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
    const user = window.state?.currentUser;
    if (user?.role !== 'trainee' || !user.traineeId) {
      leaveFeedback('Vui lòng đăng nhập bằng tài khoản Trainee.', true);
      return;
    }
    const selected = select.selectedOptions[0];
    const reason = reasonInput.value.trim();
    if (!selected?.value || reason.length < 10 || reason.length > 3000 || !document.getElementById('leaveCheckCommit').checked) {
      leaveFeedback('Vui lòng chọn buổi học, nhập lý do (10–3000 ký tự) và xác nhận cam kết.', true);
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
        scheduleCode: selected.value, scheduleDate: selected.dataset.date,
        reason, commit: true, turnstileToken: leaveChallengeToken
      });
      const receipt = {
        id: result.data.id, mssv: user.traineeId, fullName: user.fullName, scheduleCode: selected.value, scheduleTitle: selected.dataset.title,
        submittedAt: result.data.submittedAt,
        status: result.data.status === 'resolved' ? 'Đã duyệt' : result.data.status === 'rejected' ? 'Từ chối' : 'Chờ xem xét khi gửi'
      };
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
