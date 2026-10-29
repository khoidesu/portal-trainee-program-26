/**
 * ==============================================================================
 * COMPONENT: Q&A Module (Diễn Đàn Hỏi Đáp & Giải Đáp Cộng Đồng)
 * CHỨC NĂNG CHÍNH: Nơi sinh viên đặt câu hỏi (hỗ trợ ẩn danh) và nhận câu trả lời
 *                  chính thức từ Giảng viên / Mentor.
 * LIÊN KẾT & PHỤ THUỘC: public/js/modules/core.js, public/js/api.js
 * NHIỆM VỤ CHI TIẾT:
 *   - initQaModule: Nạp danh sách câu hỏi từ API / MongoDB
 *   - Form đặt câu hỏi: Tùy chọn ẩn danh, chọn chủ đề, tiêu đề, nội dung chi tiết
 *   - renderQuestionsTable: Bảng danh sách câu hỏi, lọc theo chủ đề & tìm kiếm
 *   - openQaDetailModal: Modal xem chi tiết câu hỏi & form trả lời cho Giảng viên
 * ==============================================================================
 */

// ==========================================
// DIỄN ĐÀN HỎI ĐÁP & ĐẶT CÂU HỎI (Q&A MODULE)
// ==========================================

const DEFAULT_QUESTIONS = [
  {
    _id: 'q_init_01',
    code: 'Q-2026-001',
    mssv: '25520918',
    fullName: 'Khôi Trương Trần Anh',
    isAnonymous: false,
    category: 'Kỹ thuật & Code',
    title: 'Lỗi MongooseServerSelectionError khi kết nối MongoDB Atlas',
    content: 'Em chạy server node server.js thì báo lỗi MongooseServerSelectionError: Could not connect to any servers in your MongoDB Atlas cluster. Đã kiểm tra chuỗi kết nối URI và mật khẩu đúng.',
    status: 'answered',
    answer: 'Chào em, lỗi này thường do IP mạng Wifi em đang dùng chưa được thêm vào whitelist của MongoDB Atlas. Em đăng nhập vào trang chủ MongoDB Cloud -> vào mục Security -> Network Access -> bấm Add IP Address -> chọn "Allow Access From Anywhere (0.0.0.0/0)" hoặc IP hiện tại rồi đợi 1 phút và thử lại nhé!',
    answeredBy: 'TS. Dương Việt Hằng',
    answeredRole: 'Giảng viên Hướng dẫn UIT',
    answeredAt: '2026-10-27T14:30:00.000Z',
    likesCount: 15,
    likedBy: [],
    createdAt: '2026-10-27T10:15:00.000Z'
  },
  {
    _id: 'q_init_02',
    code: 'Q-2026-002',
    mssv: 'Ẩn danh',
    fullName: 'Sinh viên ẩn danh',
    isAnonymous: true,
    category: 'Bài tập & Đồ án',
    title: 'Hạn chót nộp bài tập Tuần 2 và cách gắn link GitHub',
    content: 'Thầy cô cho em hỏi hạn nộp bài tập Tuần 2 môn Phát triển ứng dụng Web là ngày nào ạ? Khi nộp có cần deploy lên Vercel không hay chỉ cần nộp link GitHub?',
    status: 'answered',
    answer: 'Chào bạn, deadline nộp bài tập Tuần 2 là 23h59 Chủ nhật tuần này. Về yêu cầu nộp: bạn chỉ cần commit code lên Github repository (chế độ Public) và gửi link repo. Khuyến khích (được cộng thêm sao) nếu bạn deploy bản demo qua Render hoặc Vercel nhé!',
    answeredBy: 'ThS. Nguyễn Văn A',
    answeredRole: 'Mentor Trainee Program',
    answeredAt: '2026-10-28T09:20:00.000Z',
    likesCount: 8,
    likedBy: [],
    createdAt: '2026-10-28T08:00:00.000Z'
  },
  {
    _id: 'q_init_03',
    code: 'Q-2026-003',
    mssv: '25520112',
    fullName: 'Nguyễn Minh Tuấn',
    isAnonymous: false,
    category: 'Lịch học & Điểm danh',
    title: 'Em có thể xem lại video ghi hình buổi học trực tuyến ở đâu?',
    content: 'Buổi học thứ 3 vừa rồi em có việc bận gia đình nên xin nghỉ có phép. Thầy cô cho em hỏi đường link video Recording của buổi đó được đăng tải ở đâu để em ôn lại bài ạ?',
    status: 'answered',
    answer: 'Chào Tuấn, tất cả video ghi hình buổi học được tự động lưu trong kênh Microsoft Teams của lớp -> Tab "Files" -> thư mục "Recordings". Ngoài ra Ban Điều phối cũng cập nhật link trực tiếp tại mục Lịch đào tạo trên Cổng thông tin này nhé.',
    answeredBy: 'Ban Điều phối UIT',
    answeredRole: 'Quản trị viên Đào tạo',
    answeredAt: '2026-10-28T16:00:00.000Z',
    likesCount: 11,
    likedBy: [],
    createdAt: '2026-10-28T15:10:00.000Z'
  },
  {
    _id: 'q_init_04',
    code: 'Q-2026-004',
    mssv: 'Ẩn danh',
    fullName: 'Sinh viên ẩn danh',
    isAnonymous: true,
    category: 'Chương trình Trainee',
    title: 'Quy chế xét tặng sao thưởng ⭐ trên Bảng xếp hạng Trainee',
    content: 'Cho em hỏi cơ chế cộng sao rèn luyện trên Bảng xếp hạng: nếu phát biểu xây dựng bài trong buổi học online hoặc hoàn thành bài tập sớm thì được cộng bao nhiêu sao ạ?',
    status: 'pending',
    answer: '',
    answeredBy: '',
    answeredRole: '',
    answeredAt: null,
    likesCount: 5,
    likedBy: [],
    createdAt: '2026-10-28T20:30:00.000Z'
  }
];

let questionsState = {
  questions: [],
  currentFilter: 'all',
  searchQuery: '',
  selectedQuestion: null
};

function getSavedQuestions() {
  try {
    const raw = localStorage.getItem('uit_trainee_questions');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn('Lỗi đọc câu hỏi từ localStorage:', e);
  }
  return [...DEFAULT_QUESTIONS];
}

function saveQuestionsToStorage(list) {
  try {
    localStorage.setItem('uit_trainee_questions', JSON.stringify(list));
  } catch (e) {
    console.error('Lỗi lưu câu hỏi:', e);
  }
}

async function renderQuestionsView() {
  const mssvInput = document.getElementById('questionInputMssv');
  const currentId = state.currentTrainee ? state.currentTrainee.traineeId : (state.currentUser ? state.currentUser.traineeId : '25520918');

  if (mssvInput && !mssvInput.value) {
    mssvInput.value = currentId;
  }

  // Load questions
  try {
    let list = [];
    if (window.API && API.getQuestions) {
      list = await API.getQuestions();
    }
    if (!list || list.length === 0) {
      list = getSavedQuestions();
    }
    questionsState.questions = list;
    saveQuestionsToStorage(list);
  } catch (err) {
    questionsState.questions = getSavedQuestions();
  }

  renderQuestionBoard();
  updateQuestionStats();
}

function updateQuestionStats() {
  const list = questionsState.questions || [];
  const total = list.length;
  const answered = list.filter(q => q.status === 'answered').length;
  const rate = total > 0 ? Math.round((answered / total) * 100) : 100;

  const statRate = document.getElementById('statAnsweredRate');
  const statTotal = document.getElementById('statTotalQuestions');
  const badge = document.getElementById('questionBoardCountBadge');

  if (statRate) statRate.textContent = `${rate}%`;
  if (statTotal) statTotal.textContent = total;
  if (badge) badge.textContent = `${total} câu hỏi`;
}

function renderQuestionBoard() {
  const tbody = document.getElementById('questionTableBody');
  if (!tbody) return;

  const currentId = state.currentTrainee ? state.currentTrainee.traineeId : (state.currentUser ? state.currentUser.traineeId : '25520918');
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
          <div style="font-size: 2.2rem; margin-bottom: 8px;">🔍</div>
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
      const d = new Date(item.createdAt || item.submittedAt || Date.now());
      dateStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} · ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
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
    if (item.isAnonymous) {
      senderHtml = `<span class="badge-anon" title="Người gửi chọn ẩn danh">🎭 Ẩn danh</span>`;
    } else {
      senderHtml = `
        <div class="badge-mssv">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
          <span>${escapeHtml(item.mssv || '25520918')}</span>
        </div>
      `;
    }

    // Status
    const isAnswered = item.status === 'answered' && item.answer;
    const statusHtml = isAnswered 
      ? `<span class="q-status-badge answered"><span>✓</span> Đã giải đáp</span>`
      : `<span class="q-status-badge pending"><span>⏳</span> Chờ giải đáp</span>`;

    // Answer snippet
    let answerSnippetHtml = '';
    if (isAnswered) {
      answerSnippetHtml = `
        <div class="q-answer-quote">
          <strong>👨‍🏫 ${escapeHtml(item.answeredBy || 'Giảng viên UIT')}:</strong>
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
        <td class="q-title-cell" onclick="openQuestionModal('${escapeHtml(item._id || item.code)}')">
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
            <button type="button" class="q-like-btn ${isLiked ? 'liked' : ''}" onclick="toggleLikeQuestionItem('${escapeHtml(item._id || item.code)}', event)" title="Thích / Hữu ích">
              <span>👍</span>
              <span>${likes}</span>
            </button>
            <button type="button" class="q-view-btn" onclick="openQuestionModal('${escapeHtml(item._id || item.code)}')" title="Xem chi tiết câu hỏi">
              <span>💬</span>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openQuestionModal(id) {
  const item = questionsState.questions.find(q => q._id === id || q.code === id);
  if (!item) return;

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
    if (item.isAnonymous) {
      modalSender.innerHTML = `<span class="badge-anon">🎭 Sinh viên ẩn danh</span>`;
    } else {
      modalSender.innerHTML = `<strong>MSSV: ${escapeHtml(item.mssv)}</strong> (${escapeHtml(item.fullName || 'Sinh viên')})`;
    }
  }

  if (modalTime) {
    try {
      const d = new Date(item.createdAt || Date.now());
      modalTime.textContent = `${d.toLocaleTimeString('vi-VN')} · ${d.toLocaleDateString('vi-VN')}`;
    } catch (e) {
      modalTime.textContent = 'Gần đây';
    }
  }

  // Answer
  if (item.status === 'answered' && item.answer) {
    if (answerBox) answerBox.style.display = 'block';
    if (teacherEl) teacherEl.textContent = item.answeredBy || 'TS. Dương Việt Hằng';
    if (teacherRole) teacherRole.textContent = item.answeredRole || 'Giảng viên Hướng dẫn UIT';
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

  // Admin/Mentor can reply
  if (state.currentUser && state.currentUser.role === 'admin') {
    if (replyBox) replyBox.style.display = 'block';
  } else {
    if (replyBox) replyBox.style.display = 'none';
  }

  if (modal) modal.classList.add('active');
}

async function toggleLikeQuestionItem(id, event) {
  if (event) event.stopPropagation();
  const currentId = state.currentTrainee ? state.currentTrainee.traineeId : (state.currentUser ? state.currentUser.traineeId : '25520918');

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
    saveQuestionsToStorage(questionsState.questions);
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
  const form = document.getElementById('questionSubmitForm');
  const anonCheck = document.getElementById('questionCheckAnonymous');
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

  // 1. Toggle Ẩn danh
  function updateAnonUI(isAnon) {
    if (isAnon) {
      if (anonBox) anonBox.classList.add('active');
      if (anonIcon) anonIcon.textContent = '🎭';
      if (anonTitle) anonTitle.textContent = 'Gửi Ẩn Danh 🎭';
      if (anonDesc) anonDesc.textContent = 'Bảo mật danh tính: MSSV được ẩn hoàn toàn, chỉ hiển thị "Sinh viên ẩn danh" trên bảng.';
      if (mssvStar) mssvStar.style.display = 'none';
      if (mssvInput) {
        mssvInput.required = false;
        mssvInput.placeholder = '(Tùy chọn khi bật Ẩn danh)';
      }
      if (mssvHelp) mssvHelp.textContent = 'Chế độ ẩn danh đang BẬT: Bạn có thể nhập hoặc để trống MSSV.';
    } else {
      if (anonBox) anonBox.classList.remove('active');
      if (anonIcon) anonIcon.textContent = '🌐';
      if (anonTitle) anonTitle.textContent = 'Công khai MSSV';
      if (anonDesc) anonDesc.textContent = 'MSSV sẽ hiển thị cùng câu hỏi để Giảng viên dễ nhận diện và hỗ trợ.';
      if (mssvStar) mssvStar.style.display = 'inline';
      if (mssvInput) {
        mssvInput.required = true;
        mssvInput.placeholder = 'Ví dụ: 25520918';
      }
      if (mssvHelp) mssvHelp.textContent = 'Mã số sinh viên chính thức tại UIT của bạn.';
    }
  }

  if (anonCheck) {
    anonCheck.addEventListener('change', () => {
      updateAnonUI(anonCheck.checked);
    });
  }

  if (anonBox) {
    anonBox.addEventListener('click', (e) => {
      if (e.target.tagName !== 'INPUT') {
        if (anonCheck) {
          anonCheck.checked = !anonCheck.checked;
          updateAnonUI(anonCheck.checked);
        }
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
        contentInput.focus();
      }
    });
  });

  // 3. Reset form
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (form) form.reset();
      updateAnonUI(false);
      if (successAlert) successAlert.style.display = 'none';

      // Keep default MSSV
      const currentId = state.currentTrainee ? state.currentTrainee.traineeId : (state.currentUser ? state.currentUser.traineeId : '25520918');
      if (mssvInput) mssvInput.value = currentId;
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

      const isAnonymous = anonCheck ? anonCheck.checked : false;
      const mssv = (mssvInput?.value || '').trim();
      const category = document.getElementById('questionSelectCategory')?.value || 'Kỹ thuật & Code';
      const title = (document.getElementById('questionInputTitle')?.value || '').trim();
      const content = (document.getElementById('questionInputContent')?.value || '').trim();

      // Validation
      if (!isAnonymous && !mssv) {
        if (window.showToast) window.showToast('Vui lòng nhập Mã số sinh viên (MSSV) hoặc bật Chế độ ẩn danh 🎭!', 'warning');
        mssvInput?.focus();
        return;
      }
      if (!title) {
        if (window.showToast) window.showToast('Vui lòng nhập Tiêu đề câu hỏi tóm tắt!', 'warning');
        document.getElementById('questionInputTitle')?.focus();
        return;
      }
      if (!content || content.length < 10) {
        if (window.showToast) window.showToast('Vui lòng nhập chi tiết nội dung câu hỏi (ít nhất 10 ký tự)!', 'warning');
        document.getElementById('questionInputContent')?.focus();
        return;
      }

      const randomNum = Math.floor(100 + Math.random() * 900);
      const code = `Q-2026-${Date.now().toString().slice(-3)}${randomNum.toString().slice(-1)}`;

      const currentName = state.currentTrainee ? state.currentTrainee.fullName : (state.currentUser ? state.currentUser.fullName : 'Khôi Trương Trần Anh');

      const newQuestion = {
        _id: `q_${Date.now()}`,
        code,
        mssv: isAnonymous ? 'Ẩn danh' : (mssv || '25520918'),
        realMssv: mssv,
        fullName: isAnonymous ? 'Sinh viên ẩn danh' : currentName,
        isAnonymous,
        category,
        title,
        content,
        status: 'pending',
        answer: '',
        answeredBy: '',
        answeredRole: '',
        answeredAt: null,
        likesCount: 0,
        likedBy: [],
        createdAt: new Date().toISOString()
      };

      // Try API first
      try {
        if (window.API && API.createQuestion) {
          const apiRes = await API.createQuestion({
            mssv: isAnonymous ? 'Ẩn danh' : mssv,
            fullName: isAnonymous ? 'Sinh viên ẩn danh' : currentName,
            isAnonymous,
            category,
            title,
            content
          });
          if (apiRes && apiRes.data) {
            newQuestion._id = apiRes.data._id || newQuestion._id;
            newQuestion.code = apiRes.data.code || newQuestion.code;
          }
        }
      } catch (err) {
        console.warn('API error, saving locally:', err);
      }

      // Add to local list
      questionsState.questions.unshift(newQuestion);
      saveQuestionsToStorage(questionsState.questions);

      // Show success alert
      if (successAlert) {
        const codeEl = document.getElementById('successQuestionCode');
        const metaEl = document.getElementById('questionSuccessMeta');
        if (codeEl) codeEl.textContent = newQuestion.code;
        if (metaEl) {
          metaEl.innerHTML = `
            <span>Mã câu hỏi: <strong>${escapeHtml(newQuestion.code)}</strong></span>
            <span>Chế độ: <strong>${isAnonymous ? '🎭 Ẩn danh (Bảo mật MSSV)' : '🌐 Công khai MSSV (' + escapeHtml(mssv) + ')'}</strong></span>
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
    if (modal) modal.classList.remove('active');
  }
  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
  if (btnCloseQModal) btnCloseQModal.addEventListener('click', closeModal);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
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
      const text = document.getElementById('qReplyInput')?.value?.trim();
      if (!text) {
        if (window.showToast) window.showToast('Vui lòng nhập câu trả lời!', 'warning');
        return;
      }

      if (questionsState.selectedQuestion) {
        const q = questionsState.selectedQuestion;
        q.status = 'answered';
        q.answer = text;
        q.answeredBy = state.currentUser ? state.currentUser.fullName : 'TS. Dương Việt Hằng';
        q.answeredRole = 'Giảng viên Hướng dẫn UIT';
        q.answeredAt = new Date().toISOString();

        saveQuestionsToStorage(questionsState.questions);
        renderQuestionBoard();
        updateQuestionStats();
        openQuestionModal(q._id || q.code);

        if (window.API && API.answerQuestion) {
          API.answerQuestion(q._id, text, q.answeredBy, q.answeredRole).catch(() => {});
        }

        if (window.showToast) window.showToast('Đã gửi phản hồi thành công!', 'success');
        const replyInput = document.getElementById('qReplyInput');
        if (replyInput) replyInput.value = '';
      }
    });
  }
}





// Expose to global window
window.initQaModule = initQaModule;
window.openQaDetailModal = openQaDetailModal;
