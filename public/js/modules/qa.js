/**
 * ==============================================================================
 * COMPONENT: Q&A Module (Diễn Đàn Hỏi Đáp & Giải Đáp Cộng Đồng)
 * CHỨC NĂNG CHÍNH: Nơi Trainee đặt câu hỏi (hỗ trợ ẩn danh) và nhận câu trả lời
 *                  chính thức từ Trainer.
 * LIÊN KẾT & PHỤ THUỘC: public/js/modules/core.js, public/js/api.js
 * NHIỆM VỤ CHI TIẾT:
 *   - initQaModule: Nạp danh sách câu hỏi từ API / MongoDB
 *   - Form đặt câu hỏi: Tùy chọn ẩn danh, chọn chủ đề, tiêu đề, nội dung chi tiết
 *   - renderQuestionsTable: Bảng danh sách câu hỏi, lọc theo chủ đề & tìm kiếm
 *   - openQaDetailModal: Modal xem chi tiết câu hỏi & form trả lời cho Trainer
 * ==============================================================================
 */

// ==========================================
// DIỄN ĐÀN HỎI ĐÁP & ĐẶT CÂU HỎI (Q&A MODULE)
// ==========================================


let questionsState = {
  questions: [],
  loadState: 'loading',
  loadError: '',
  requestId: 0,
  currentFilter: 'all',
  searchQuery: '',
  selectedQuestion: null
};

async function renderQuestionsView() {
  const mssvInput = document.getElementById('questionInputMssv');
  const loggedInId = (state.currentUser?.role === 'trainee' && state.currentUser?.traineeId) ? state.currentUser.traineeId : '';
  if (mssvInput && !mssvInput.value.trim() && loggedInId) {
    mssvInput.value = loggedInId;
  }

  const requestId = ++questionsState.requestId;
  questionsState.loadState = 'loading';
  renderQuestionBoard();
  try {
    const list = await API.getQuestions();
    if (requestId !== questionsState.requestId) return;
    questionsState.questions = list;
    questionsState.loadState = 'ready';
    questionsState.loadError = '';
  } catch (err) {
    if (requestId !== questionsState.requestId) return;
    questionsState.questions = [];
    questionsState.loadState = 'error';
    questionsState.loadError = err.message || 'Không tải được câu hỏi.';
  }

  renderQuestionBoard();
  updateQuestionStats();
}

function updateQuestionStats() {
  const list = questionsState.questions || [];
  const total = list.length;
  const badge = document.getElementById('questionBoardCountBadge');

  if (badge) badge.textContent = `${total} câu hỏi`;
}

function renderQuestionBoard() {
  const tbody = document.getElementById('questionTableBody');
  if (!tbody) return;
  if (questionsState.loadState !== 'ready') {
    tbody.innerHTML = `<tr><td colspan="7">${questionsState.loadState === 'loading' ? 'Đang tải câu hỏi…' : `${escapeHtml(questionsState.loadError)} Bấm Làm mới để thử lại.`}</td></tr>`;
    return;
  }

  const currentId = (state.currentUser?.role === 'trainee' && state.currentUser?.traineeId) ? state.currentUser.traineeId : (document.getElementById('questionInputMssv')?.value || '').trim();
  let list = [...questionsState.questions];

  // 1. Filter by category / status / anonymous / mine
  const filter = questionsState.currentFilter;
  if (filter === 'pending') {
    list = list.filter(q => q.status === 'pending');
  } else if (filter === 'answered') {
    list = list.filter(q => q.status === 'answered');
  } else if (filter === 'anonymous') {
    list = list.filter(q => q.isAnonymous);
  } else if (filter === 'mine') {
    list = list.filter(q => (!q.isAnonymous && q.mssv === currentId) || q.realMssv === currentId);
  }

  // 2. Search query
  if (questionsState.searchQuery) {
    const q = questionsState.searchQuery.toLowerCase().trim();
    list = list.filter(item =>
      (item.title && item.title.toLowerCase().includes(q)) ||
      (item.content && item.content.toLowerCase().includes(q)) ||
      (item.mssv && item.mssv.toLowerCase().includes(q)) ||
      (item.category && item.category.toLowerCase().includes(q)) ||
      (item.code && item.code.toLowerCase().includes(q))
    );
  }

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 36px 20px; color: var(--text-muted);">
          <div style="font-size: 2.2rem; margin-bottom: 8px;"></div>
          <div style="font-size: 1rem; font-weight: 700; color: var(--text-main); margin-bottom: 4px;">Không tìm thấy câu hỏi nào phù hợp</div>
          <p style="font-size: 0.85rem; margin: 0;">Hãy thử đổi từ khóa tìm kiếm hoặc bấm gửi câu hỏi mới ở form phía trên!</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = list.map((item, idx) => {
    let dateStr = '';
    try {
      const cTime = (item.createdAt || item.submittedAt) ? new Date(item.createdAt || item.submittedAt).getTime() : NaN;
      if (!Number.isFinite(cTime)) throw new Error('Thời gian không hợp lệ');
      const d = new Date(cTime);
      dateStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} · ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    } catch (e) {
      dateStr = 'Vừa xong';
    }

    // Category style
    let catClass = 'cat-other';
    const cat = item.category || '';
    if (cat.includes('Kỹ thuật')) catClass = 'cat-tech';
    else if (cat.includes('Bài tập')) catClass = 'cat-hw';
    else if (cat.includes('Lịch học')) catClass = 'cat-schedule';
    else if (cat.includes('Trainee')) catClass = 'cat-trainee';

    // Sender badge
    let senderHtml = '';
    if (item.isAnonymous || !item.mssv || item.mssv === 'Ẩn danh') {
      senderHtml = `<span class="badge-anon" title="Người gửi chọn ẩn danh"> Ẩn danh</span>`;
    } else {
      const mssvText = item.mssv || '';
      const nameText = item.fullName || '';
      if (mssvText && nameText && !nameText.includes(mssvText)) {
        senderHtml = `
          <div class="badge-mssv" title="${escapeHtml(nameText)} (${escapeHtml(mssvText)})">
            <span>${escapeHtml(mssvText)}</span>
            <small style="color: var(--text-muted); font-size: 0.72rem; font-weight: 500; display: block;">${escapeHtml(nameText)}</small>
          </div>
        `;
      } else if (mssvText) {
        senderHtml = `
          <div class="badge-mssv" title="MSSV: ${escapeHtml(mssvText)}">
            <span>${escapeHtml(mssvText)}</span>
          </div>
        `;
      } else {
        senderHtml = `
          <div class="badge-mssv" style="background: rgba(59, 130, 246, 0.1); color: var(--primary-blue);">
            <span>${escapeHtml(nameText || 'Trainee')}</span>
          </div>
        `;
      }
    }

    // Status
    const isAnswered = item.status === 'answered' && item.answer;
    const statusHtml = isAnswered
      ? `<span class="q-status-badge answered"> Đã giải đáp</span>`
      : `<span class="q-status-badge pending"> Chờ giải đáp</span>`;

    // Answer snippet
    let answerSnippetHtml = '';
    if (isAnswered) {
      answerSnippetHtml = `
        <div class="q-answer-quote">
          <strong> ${escapeHtml(item.answeredBy || 'Trainer')}:</strong>
          ${escapeHtml(item.answer.length > 90 ? item.answer.slice(0, 90) + '...' : item.answer)}
        </div>
      `;
    }

    const likes = item.likesCount || 0;
    const isLiked = item.likedBy && item.likedBy.includes(currentId);

    return `
      <tr class="question-row" data-id="${escapeHtml(item._id || item.code)}">
        <td style="font-weight: 700; color: var(--text-muted); text-align: center;">${idx + 1}</td>
        <td>${senderHtml}</td>
        <td>
          <span class="category-pill ${catClass}">${escapeHtml(item.category || 'Kỹ thuật')}</span>
        </td>
        <td class="q-title-cell">
          <span class="q-code-tag">${escapeHtml(item.code || '#Q')}</span>
          <div class="q-title-text">${escapeHtml(item.title)}</div>
          <div class="q-content-snippet">${escapeHtml(item.content)}</div>
          ${answerSnippetHtml}
        </td>
        <td style="font-size: 0.78rem; color: var(--text-muted); white-space: nowrap;">
          ${escapeHtml(dateStr)}
        </td>
        <td style="text-align: center;">
          ${statusHtml}
        </td>
        <td style="text-align: center;">
          <div class="q-action-cell">
            <button type="button" class="q-like-btn ${isLiked ? 'liked' : ''}" onclick="toggleLikeQuestionItem('${escapeHtml(item._id || item.code)}', event)" title="Thích / Hữu ích" aria-label="Đánh dấu câu hỏi hữu ích, hiện có ${likes} lượt thích">

              <span>${likes}</span>
            </button>
            <button type="button" class="q-view-btn" title="Xem chi tiết câu hỏi">${canManage('questions:manage') ? 'Giải đáp' : 'Xem chi tiết'}</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
  tbody.querySelectorAll('.question-row').forEach(row => {
    row.querySelector('.q-title-cell')?.addEventListener('click', (e) => openQuestionModal(row.dataset.id, e?.currentTarget));
    row.querySelector('.q-view-btn')?.addEventListener('click', (e) => openQuestionModal(row.dataset.id, e?.currentTarget));
  });
}

let lastFocusedElementBeforeQuestionModal = null;

function openQuestionModal(id, triggerEl = null) {
  const item = questionsState.questions.find(q => q._id === id || q.code === id);
  if (!item) return;

  lastFocusedElementBeforeQuestionModal = triggerEl || document.activeElement;
  questionsState.selectedQuestion = item;

  const modal = document.getElementById('questionDetailModal');
  const modalTitle = document.getElementById('qModalTitle');
  const modalSubtitle = document.getElementById('qModalSubtitle');
  const modalSender = document.getElementById('qModalSender');
  const modalCategory = document.getElementById('qModalCategory');
  const modalTime = document.getElementById('qModalTime');
  const modalHeading = document.getElementById('qModalHeading');
  const modalText = document.getElementById('qModalText');
  const answerBox = document.getElementById('qModalAnswerBox');
  const teacherEl = document.getElementById('qModalAnswerTeacher');
  const teacherRole = document.getElementById('qModalAnswerRole');
  const answerBody = document.getElementById('qModalAnswerBody');
  const answerTime = document.getElementById('qModalAnswerTime');
  const replyBox = document.getElementById('qModalReplyBox');
  const likeBadge = document.getElementById('modalLikeCount');

  if (modalTitle) modalTitle.textContent = item.title;
  if (modalSubtitle) modalSubtitle.textContent = `Mã câu hỏi: ${item.code || '#Q'}`;
  if (modalHeading) modalHeading.textContent = item.title;
  if (modalText) modalText.textContent = item.content;
  if (modalCategory) modalCategory.textContent = item.category || 'Kỹ thuật';
  if (likeBadge) likeBadge.textContent = item.likesCount || 0;

  if (modalSender) {
    if (item.isAnonymous || !item.mssv || item.mssv === 'Ẩn danh') {
      modalSender.innerHTML = `<span class="badge-anon"> Trainee ẩn danh</span>`;
    } else {
      const mssvText = item.mssv || '';
      const nameText = item.fullName || '';
      modalSender.innerHTML = mssvText
        ? `<strong>MSSV: ${escapeHtml(mssvText)}</strong>${nameText ? ` (${escapeHtml(nameText)})` : ''}`
        : `<strong>${escapeHtml(nameText || 'Trainee')}</strong>`;
    }
  }

  if (modalTime) {
    try {
      const cTime = item.createdAt ? new Date(item.createdAt).getTime() : NaN;
      if (!Number.isFinite(cTime)) throw new Error('Thời gian không hợp lệ');
      const d = new Date(cTime);
      modalTime.textContent = `${d.toLocaleTimeString('vi-VN')} · ${d.toLocaleDateString('vi-VN')}`;
    } catch (e) {
      modalTime.textContent = 'Gần đây';
    }
  }

  // Answer
  if (item.status === 'answered' && item.answer) {
    if (answerBox) answerBox.style.display = 'block';
    if (teacherEl) teacherEl.textContent = item.answeredBy || 'Trainer';
    if (teacherRole) teacherRole.textContent = 'Trainer';
    if (answerBody) answerBody.textContent = item.answer;
    if (answerTime) {
      try {
        const ad = new Date(item.answeredAt || item.createdAt);
        answerTime.textContent = `Đã giải đáp: ${ad.toLocaleTimeString('vi-VN')} · ${ad.toLocaleDateString('vi-VN')}`;
      } catch (e) {
        answerTime.textContent = 'Đã giải đáp';
      }
    }
  } else {
    if (answerBox) answerBox.style.display = 'none';
  }

  // Admin/Trainer can reply
  const replyInput = document.getElementById('qReplyInput');
  const replyButton = document.getElementById('btnSubmitQReply');
  const feedback = document.getElementById('qReplyFeedback');
  if (feedback) feedback.textContent = '';
  if (replyInput) replyInput.value = canManage('questions:manage') ? item.answer || '' : '';
  if (replyButton) replyButton.textContent = item.answer ? 'Cập nhật giải đáp' : 'Gửi giải đáp';
  if (canManage('questions:manage')) {
    if (replyBox) replyBox.style.display = 'block';
  } else {
    if (replyBox) replyBox.style.display = 'none';
  }

  if (modal) {
    modal.classList.add('open', 'show');
    const closeBtn = document.getElementById('closeQuestionDetailModalBtn') || modal.querySelector('.modal-card');
    if (closeBtn) {
      if (typeof setTimeout === 'function') {
        setTimeout(() => {
          try { closeBtn.focus(); } catch (e) {}
        }, 50);
      } else if (typeof closeBtn.focus === 'function') {
        try { closeBtn.focus(); } catch (e) {}
      }
    }
  }
}

async function toggleLikeQuestionItem(id, event) {
  if (event) event.stopPropagation();
  const currentId = (state.currentUser?.role === 'trainee' && state.currentUser?.traineeId) ? state.currentUser.traineeId : (document.getElementById('questionInputMssv')?.value || '').trim() || 'guest';

  // Optimistic update
  const item = questionsState.questions.find(q => q._id === id || q.code === id);
  if (item) {
    if (!item.likedBy) item.likedBy = [];
    const idx = item.likedBy.indexOf(currentId);
    if (idx !== -1) {
      item.likedBy.splice(idx, 1);
      item.likesCount = Math.max(0, (item.likesCount || 1) - 1);
    } else {
      item.likedBy.push(currentId);
      item.likesCount = (item.likesCount || 0) + 1;
    }
    renderQuestionBoard();

    // Call API if possible
    if (window.API && API.likeQuestion) {
      API.likeQuestion(item._id || id, currentId).catch(() => {});
    }
  }
}
window.toggleLikeQuestionItem = toggleLikeQuestionItem;
window.openQuestionModal = openQuestionModal;

function setupQuestionEvents() {
  const view = document.getElementById('viewQuestions');
  if (!view || view.dataset.eventsBound) return;
  view.dataset.eventsBound = 'true';
  const form = document.getElementById('questionSubmitForm');
  const publicCheck = document.getElementById('questionCheckPublic') || document.getElementById('questionCheckAnonymous');
  const anonBox = document.getElementById('anonToggleBox');
  const anonIcon = document.getElementById('anonToggleIcon');
  const anonTitle = document.getElementById('anonToggleTitle');
  const anonDesc = document.getElementById('anonToggleDesc');
  const mssvInput = document.getElementById('questionInputMssv');
  const mssvStar = document.getElementById('questionMssvRequiredStar');
  const mssvHelp = document.getElementById('questionMssvHelpText');
  const resetBtn = document.getElementById('btnResetQuestionForm');
  const dismissBtn = document.getElementById('btnDismissQuestionSuccess');
  const successAlert = document.getElementById('questionSuccessAlert');
  const searchInput = document.getElementById('questionSearchInput');
  const refreshBtn = document.getElementById('btnRefreshQuestions');
  const modalCloseBtn = document.getElementById('closeQuestionDetailModalBtn');
  const btnCloseQModal = document.getElementById('btnCloseQModal');
  const modal = document.getElementById('questionDetailModal');
  const btnModalLike = document.getElementById('btnModalLike');
  const btnSubmitQReply = document.getElementById('btnSubmitQReply');

  // Helper hiển thị thông báo lỗi ngay trên form
  function setFormFeedback(msg, isError = true) {
    const fb = document.getElementById('questionFormFeedback');
    if (!fb) return;
    if (!msg) {
      fb.style.display = 'none';
      fb.textContent = '';
      return;
    }
    fb.style.display = 'block';
    fb.style.background = isError ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)';
    fb.style.color = isError ? '#ef4444' : '#10b981';
    fb.style.border = isError ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)';
    fb.textContent = msg;
  }

  // Bộ đếm ký tự nội dung thời gian thực
  const contentInputEl = document.getElementById('questionInputContent');
  const countEl = document.getElementById('questionContentCharCount');
  function updateContentCharCount() {
    if (!contentInputEl || !countEl) return;
    const len = contentInputEl.value.trim().length;
    if (len === 0) {
      countEl.textContent = '0/10 ký tự tối thiểu';
      countEl.style.color = 'var(--text-muted)';
    } else if (len < 10) {
      countEl.textContent = `${len}/10 ký tự (còn thiếu ${10 - len} ký tự)`;
      countEl.style.color = '#f59e0b';
    } else {
      countEl.textContent = `${len} ký tự (✓ Đủ điều kiện gửi)`;
      countEl.style.color = '#10b981';
    }
  }
  if (contentInputEl) {
    contentInputEl.addEventListener('input', () => {
      updateContentCharCount();
      setFormFeedback('');
    });
    updateContentCharCount();
  }

  // 1. Toggle Hiển thị danh tính: Gạt tắt = Ẩn danh (mặc định), Gạt bật = Công khai MSSV
  function updateIdentityUI(isPublic) {
    if (isPublic) {
      if (anonBox) anonBox.classList.add('active');
      if (anonIcon) anonIcon.textContent = '';
      if (anonTitle) anonTitle.textContent = 'Công khai MSSV & Họ tên';
      if (mssvStar) mssvStar.style.display = 'inline';
      if (mssvInput) {
        mssvInput.required = true;
        mssvInput.placeholder = 'Ví dụ: 25520918';
      }
      if (mssvHelp) mssvHelp.textContent = 'Bắt buộc nhập MSSV (6–12 chữ số) khi công khai.';
    } else {
      if (anonBox) anonBox.classList.remove('active');
      if (anonIcon) anonIcon.textContent = '';
      if (anonTitle) anonTitle.textContent = 'Chế độ Ẩn danh';
      if (mssvStar) mssvStar.style.display = 'none';
      if (mssvInput) {
        mssvInput.required = false;
        mssvInput.placeholder = '(Tùy chọn khi gửi ẩn danh)';
      }
      if (mssvHelp) mssvHelp.textContent = 'Mặc định ẩn danh: không hiện MSSV ra ngoài diễn đàn.';
    }
  }

  if (publicCheck) {
    publicCheck.checked = false;
    publicCheck.addEventListener('change', () => {
      updateIdentityUI(publicCheck.checked);
    });
    updateIdentityUI(false);
  }

  if (anonBox) {
    anonBox.addEventListener('click', (e) => {
      // Nếu click vào chính label/switch/slider, để trình duyệt tự kích hoạt change event tự nhiên
      if (e.target.closest('.anon-switch')) return;
      if (publicCheck) {
        publicCheck.checked = !publicCheck.checked;
        publicCheck.dispatchEvent(new Event('change'));
      }
    });
  }

  // 2. Quick chips
  document.querySelectorAll('.question-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.getAttribute('data-category');
      const title = btn.getAttribute('data-title');
      const content = btn.getAttribute('data-content');

      const catSelect = document.getElementById('questionSelectCategory');
      const titleInput = document.getElementById('questionInputTitle');
      const contentInput = document.getElementById('questionInputContent');

      if (cat && catSelect) catSelect.value = cat;
      if (title && titleInput) titleInput.value = title;
      if (content && contentInput) {
        contentInput.value = content;
        updateContentCharCount();
        setFormFeedback('');
        contentInput.focus();
      }
    });
  });

  // 3. Reset form
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (form) form.reset();
      updateIdentityUI(false);
      updateContentCharCount();
      setFormFeedback('');
      if (successAlert) successAlert.style.display = 'none';

      // Giu lai MSSV neu da dang nhap
      const loggedInId = (state.currentUser?.role === 'trainee' && state.currentUser?.traineeId) ? state.currentUser.traineeId : '';
      if (mssvInput) mssvInput.value = loggedInId;
    });
  }

  // 4. Close success alert
  if (dismissBtn && successAlert) {
    dismissBtn.addEventListener('click', () => {
      successAlert.style.display = 'none';
    });
  }

  // 5. Submit form
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const isPublic = Boolean(publicCheck && publicCheck.checked);
      const isAnonymous = !isPublic;
      const mssv = (mssvInput?.value || '').trim();
      const category = document.getElementById('questionSelectCategory')?.value || 'Kỹ thuật & Code';
      const title = (document.getElementById('questionInputTitle')?.value || '').trim();
      const content = (document.getElementById('questionInputContent')?.value || '').trim();

      // Validation
      if (isPublic && !/^\d{6,12}$/.test(mssv)) {
        const msg = 'Vui lòng nhập MSSV hợp lệ (6–12 chữ số) khi bật Chế độ công khai.';
        setFormFeedback(msg);
        if (window.showToast) window.showToast(msg, 'warning');
        mssvInput?.focus();
        return;
      }
      if (!title) {
        const msg = 'Vui lòng nhập Tiêu đề câu hỏi!';
        setFormFeedback(msg);
        if (window.showToast) window.showToast(msg, 'warning');
        document.getElementById('questionInputTitle')?.focus();
        return;
      }
      if (!content || content.length < 10) {
        const msg = `Nội dung câu hỏi quá ngắn (hiện có ${content.length}/10 ký tự tối thiểu). Vui lòng nhập ít nhất 10 ký tự!`;
        setFormFeedback(msg);
        if (window.showToast) window.showToast(msg, 'warning');
        document.getElementById('questionInputContent')?.focus();
        return;
      }

      setFormFeedback('');
      const submitBtn = document.getElementById('btnSubmitQuestion');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Đang gửi...';
      }

      let currentName = (state.currentUser?.role === 'trainee' && state.currentUser?.fullName) ? state.currentUser.fullName : '';
      if (!currentName && mssv && state.trainees) {
        const found = state.trainees.find(t => t.traineeId === mssv);
        if (found) currentName = found.fullName;
      }
      let newQuestion;
      try {
        const result = await API.createQuestion({
          mssv: isAnonymous ? 'Ẩn danh' : mssv,
          fullName: isAnonymous ? 'Trainee ẩn danh' : currentName,
          isAnonymous, category, title, content
        });
        if (!result.success || !result.data) throw new Error(result.message || 'Không gửi được câu hỏi.');
        newQuestion = result.data;
      } catch (error) {
        setFormFeedback(error.message || 'Lỗi khi gửi câu hỏi.');
        window.showToast?.(error.message, 'danger');
        return;
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Gửi Câu Hỏi';
        }
      }
      questionsState.questions.unshift(newQuestion);
      questionsState.loadState = 'ready';

      // Show success alert
      if (successAlert) {
        const codeEl = document.getElementById('successQuestionCode');
        const metaEl = document.getElementById('questionSuccessMeta');
        if (codeEl) codeEl.textContent = newQuestion.code;
        if (metaEl) {
          metaEl.innerHTML = `
            <span>Mã câu hỏi: <strong>${escapeHtml(newQuestion.code)}</strong></span>
            <span>Chế độ: <strong>${isAnonymous ? ' Ẩn danh (Bảo mật MSSV)' : ' Công khai MSSV (' + escapeHtml(mssv) + ')'}</strong></span>
            <span>Chủ đề: <strong>${escapeHtml(category)}</strong></span>
            <span>Thời gian gửi: <strong>Vừa xong (${new Date().toLocaleTimeString('vi-VN')} · ${new Date().toLocaleDateString('vi-VN')})</strong></span>
          `;
        }
        successAlert.style.display = 'flex';
        successAlert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      // Refresh table
      renderQuestionBoard();
      updateQuestionStats();

      if (window.showToast) {
        window.showToast(`Đã gửi câu hỏi [${newQuestion.code}] thành công!`, 'success');
      }

      // Clear content input
      const contentEl = document.getElementById('questionInputContent');
      const titleEl = document.getElementById('questionInputTitle');
      if (contentEl) contentEl.value = '';
      if (titleEl) titleEl.value = '';
      updateContentCharCount();
    });
  }

  // 6. Filter pills
  document.querySelectorAll('#questionFilterPills .q-filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#questionFilterPills .q-filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      questionsState.currentFilter = pill.getAttribute('data-filter') || 'all';
      renderQuestionBoard();
    });
  });

  // 7. Search input
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      questionsState.searchQuery = e.target.value;
      renderQuestionBoard();
    });
  }

  // 8. Refresh button
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.classList.add('loading');
      await renderQuestionsView();
      setTimeout(() => refreshBtn.classList.remove('loading'), 400);
      if (window.showToast) window.showToast('Đã làm mới Bảng câu hỏi!', 'info');
    });
  }

  // 9. Close modal
  function closeModal() {
    if (modal) modal.classList.remove('open', 'show');
    questionsState.selectedQuestion = null;
    if (lastFocusedElementBeforeQuestionModal && typeof lastFocusedElementBeforeQuestionModal.focus === 'function') {
      try {
        lastFocusedElementBeforeQuestionModal.focus();
      } catch (e) {}
      lastFocusedElementBeforeQuestionModal = null;
    }
  }
  window.closeQuestionDetailModal = closeModal;

  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
  if (btnCloseQModal) btnCloseQModal.addEventListener('click', closeModal);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.keyCode === 27) {
        e.preventDefault();
        e.stopPropagation();
        closeModal();
        return;
      }
      if (e.key === 'Tab') {
        const focusable = modal.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
  }

  // 10. Modal Like button
  if (btnModalLike) {
    btnModalLike.addEventListener('click', () => {
      if (questionsState.selectedQuestion) {
        toggleLikeQuestionItem(questionsState.selectedQuestion._id || questionsState.selectedQuestion.code);
        const count = questionsState.selectedQuestion.likesCount || 0;
        const badge = document.getElementById('modalLikeCount');
        if (badge) badge.textContent = count;
      }
    });
  }

  // 11. Modal Reply from mentor/admin
  if (btnSubmitQReply) {
    btnSubmitQReply.addEventListener('click', async () => {
      if (!canManage('questions:manage') || btnSubmitQReply.disabled) return;
      const text = document.getElementById('qReplyInput')?.value?.trim();
      if (!text) {
        if (window.showToast) window.showToast('Vui lòng nhập câu trả lời!', 'warning');
        return;
      }

      if (questionsState.selectedQuestion) {
        const q = questionsState.selectedQuestion;
        const id = q._id || q.code;
        const feedback = document.getElementById('qReplyFeedback');
        btnSubmitQReply.disabled = true;
        if (feedback) feedback.textContent = 'Đang lưu giải đáp…';
        try {
          const result = await API.answerQuestion(id, text);
          if (!result.success || !result.data) throw new Error(result.message || 'Không lưu được giải đáp.');
          Object.assign(q, result.data);
          renderQuestionBoard();
          updateQuestionStats();
          if ((questionsState.selectedQuestion?._id || questionsState.selectedQuestion?.code) === id) {
            openQuestionModal(id);
            if (feedback) feedback.textContent = 'Đã lưu giải đáp.';
          }
          window.showToast?.('Đã lưu giải đáp.', 'success');
        } catch (error) {
          if ((questionsState.selectedQuestion?._id || questionsState.selectedQuestion?.code) === id && feedback) feedback.textContent = error.message;
        } finally {
          btnSubmitQReply.disabled = false;
        }
      }
    });
  }
}





function initQaModule() {
  setupQuestionEvents();
}

function openQaDetailModal(id) {
  openQuestionModal(id);
}

// Expose to global window
window.initQaModule = initQaModule;
window.renderQuestionsView = renderQuestionsView;
window.openQaDetailModal = openQaDetailModal;
