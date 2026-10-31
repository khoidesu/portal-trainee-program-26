/**
 * Duolingo Learning Path Controller for Trainee Portal
 * Inspired by Duolingo's iconic snake progression tree, 3D buttons, and mascots.
 * Tích hợp bộ đếm ngược thời gian còn lại (Deadline Countdown) dưới mỗi bài tập
 * và hỗ trợ Admin cấu hình/set thời hạn nộp bài.
 */

// Helper escape HTML chống Stored XSS
function escapeHtmlDuo(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Helper kiểm tra URL an toàn (chống javascript:...)
function sanitizeUrlDuo(url) {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (/^(https?:\/\/|mailto:|tel:|#)/i.test(trimmed)) {
    return trimmed;
  }
  if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\/.*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return '';
}

// ============================================================================
// DANH SÁCH 11 BÀI TẬP TRAINEE PROGRAM (THIẾT KẾ ĐỦ 11 BÀI TẬP CHUẨN UIT)
// ============================================================================
const DEFAULT_DUOLINGO_ASSIGNMENTS = [
  {
    id: 1,
    title: 'Bài 1: Làm quen Git, GitHub & Quy chuẩn Code UIT',
    desc: 'Làm quen với các lệnh Git cơ bản: clone, checkout, commit, push và tạo Pull Request theo quy chuẩn Trainee Program UIT.',
    unit: 'Unit 10',
    type: 'lesson',
    icon: 'check',
    status: 'active',

    link: 'https://github.com',
    deadline: null,
    offset: 'offset-center'
  },
  {
    id: 2,
    title: 'Bài 2: JavaScript ES6+, DOM Scripting & Event Handling',
    desc: 'Thực hành Arrow functions, Destructuring, Spread operator, Promises và thao tác DOM động tương tác người dùng.',
    unit: 'Unit 10',
    type: 'lesson',
    icon: 'check',
    status: 'active',

    link: 'https://github.com',
    deadline: null,
    offset: 'offset-right-1'
  },
  {
    id: 3,
    title: 'Bài 3: Kiến trúc Web, RESTful API & Lập trình Bất đồng bộ',
    desc: 'Hiểu rõ mô hình Client-Server, HTTP Methods, Fetch API, Async/Await và bẫy lỗi xử lý dữ liệu JSON an toàn.',
    unit: 'Unit 10',
    type: 'lesson',
    icon: 'check',
    status: 'active',

    link: 'https://developer.mozilla.org',
    deadline: null,
    offset: 'offset-right-2'
  },
  {
    id: 4,
    title: 'Bài 4: Xây dựng REST API với Node.js & Express.js',
    desc: 'Thiết kế hệ thống Routing chuẩn RESTful, viết middleware xác thực, log request và xử lý lỗi tập trung.',
    unit: 'Unit 10',
    type: 'lesson',
    icon: 'check',
    status: 'active',

    link: 'https://expressjs.com',
    deadline: null,
    offset: 'offset-right-1'
  },
  {
    id: 5,
    title: 'Bài 5: Thiết kế Cơ sở Dữ liệu & Tương tác MongoDB Atlas',
    desc: 'Thiết kế Schema và Models với Mongoose ODM, thực hiện các thao tác CRUD và tối ưu Index dữ liệu.',
    unit: 'Unit 10',
    type: 'lesson',
    icon: 'check',
    status: 'active',

    link: 'https://mongodb.com',
    // Mẫu hạn nộp dưới 1 ngày (< 24h) để hiển thị "x h x phút còn lại"
    deadline: new Date(Date.now() + 18 * 3600 * 1000).toISOString(),
    offset: 'offset-center'
  },
  {
    id: 6,
    title: 'Bài 6: Xác thực Người dùng với JWT & Phân quyền RBAC',
    desc: 'Mã hóa mật khẩu an toàn với bcrypt, phát hành token JWT và phân quyền hạn Admin/Trainee chặt chẽ.',
    unit: 'Unit 10',
    type: 'lesson',
    icon: 'star',
    status: 'active', // Ô hiện tại đang học

    link: 'https://jwt.io',
    // Mẫu hạn nộp trên 1 ngày (> 24h) để hiển thị "x ngày x h còn lại"
    deadline: new Date(Date.now() + (3 * 24 + 4) * 3600 * 1000).toISOString(),
    offset: 'offset-left-1'
  },
  {
    id: 7,
    title: 'Bài 7: Xây dựng Giao diện React / Component Architecture',
    desc: 'Xây dựng giao diện Single Page Application hiện đại với React Component, Hooks (useState, useEffect) và Styling.',
    unit: 'Unit 10',
    type: 'lesson',
    icon: 'lock',
    status: 'locked',

    link: '#',
    deadline: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    offset: 'offset-left-2'
  },
  {
    id: 8,
    title: 'Bài 8: Quản lý Trạng thái State & Tích hợp Frontend - Backend',
    desc: 'Kết nối ứng dụng Frontend với hệ thống Backend API, quản lý State toàn cục và xử lý UI Loading/Error states.',
    unit: 'Unit 10',
    type: 'lesson',
    icon: 'lock',
    status: 'locked',

    link: '#',
    deadline: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
    offset: 'offset-left-1'
  },
  {
    id: 9,
    title: 'Bài 9: Kiểm thử Tự động (Unit Test & Integration Test)',
    desc: 'Viết bộ test tự động với Jest & Supertest kiểm thử logic nghiệp vụ và API endpoints, đạt độ phủ code chuẩn UIT.',
    unit: 'Unit 10',
    type: 'lesson',
    icon: 'lock',
    status: 'locked',

    link: '#',
    deadline: null,
    offset: 'offset-center'
  },
  {
    id: 10,
    title: 'Bài 10: Đóng gói Docker Container & CI/CD Pipeline',
    desc: 'Viết Dockerfile tối ưu đa tầng (Multi-stage build), docker-compose và thiết lập GitHub Actions tự động kiểm thử.',
    unit: 'Unit 10',
    type: 'lesson',
    icon: 'lock',
    status: 'locked',

    link: '#',
    deadline: null,
    offset: 'offset-right-1'
  },
  {
    id: 11,
    title: 'Bài 11: Đồ Án Tổng Hợp Capstone & Triển khai Cloud (Deploy)',
    desc: 'Hoàn thiện toàn diện đồ án sản phẩm thực tế Trainee, bảo mật và triển khai lên hạ tầng Cloud Production.',
    unit: 'Unit 10',
    type: 'lesson',
    icon: 'lock',
    status: 'locked',

    link: '#',
    deadline: null,
    offset: 'offset-right-2'
  }
];

class DuolingoManager {
  constructor() {
    this.assignments = this.loadCachedAssignments();
    this.selectedAssignment = null;
    this.timerInterval = null;
    this.loadState = 'loading';
    this.init();
    // Tải dữ liệu 11 bài tập mới nhất từ MongoDB Atlas
    this.fetchAssignmentsFromAPI();
  }

  loadCachedAssignments() {
    try {
      const saved = localStorage.getItem('uit_duo_assignments_v11') || localStorage.getItem('uit_duo_assignments');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Lỗi đọc assignments từ localStorage:', e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_DUOLINGO_ASSIGNMENTS));
  }

  async fetchAssignmentsFromAPI() {
    this.loadState = 'loading';
    this.renderPath();
    try {
      const list = await window.API.getAssignments();
      if (!Array.isArray(list)) throw new Error('Danh sách bài tập không hợp lệ.');
      this.assignments = list.map(item => ({ ...item, status: item.status === 'completed' ? 'active' : item.status }));
      this.loadState = 'ready';
      this.saveAssignments();
      this.renderPath();
      if (this.selectedAssignment) {
        const id = this.selectedAssignment.assignmentId || this.selectedAssignment.id;
        const updated = this.assignments.find(item => (item.assignmentId || item.id) === id);
        if (updated) this.openAssignmentModal(updated);
        else {
          this.selectedAssignment = null;
          document.getElementById('duoAssignmentModal')?.classList.remove('active');
        }
      }
    } catch (err) {
      this.loadState = 'error';
      this.renderPath();
      console.warn('Không tải được danh sách bài tập:', err);
    }
  }

  saveAssignments() {
    try {
      const cached = this.assignments.map(item => {
        if (item.status !== 'locked') return item;
        const { desc, details, link, ...preview } = item;
        return preview;
      });
      localStorage.setItem('uit_duo_assignments_v11', JSON.stringify(cached));
      localStorage.setItem('uit_duo_assignments', JSON.stringify(cached));
    } catch (e) {
      console.error('Lỗi lưu assignments vào localStorage:', e);
    }
  }

  init() {
    this.renderPath();
    this.setupModalEvents();
    this.startCountdownLoop();
  }

  // ==========================================
  // LOGIC ĐẾM NGƯỢC THỜI GIAN CÒN LẠI (DEADLINE)
  // ==========================================
  getCountdownInfo(deadline) {
    if (!deadline) {
      return {
        hasDeadline: false,
        isExpired: false,
        text: 'Hạn: Không giới hạn',
        shortText: 'Không giới hạn',
        badgeClass: 'timer-none',
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        formattedDeadline: 'Không có thời hạn'
      };
    }

    const target = new Date(deadline).getTime();
    if (isNaN(target)) {
      return {
        hasDeadline: false,
        isExpired: false,
        text: 'Hạn: Không giới hạn',
        shortText: 'Không giới hạn',
        badgeClass: 'timer-none',
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        formattedDeadline: 'Không có thời hạn'
      };
    }

    const now = Date.now();
    const diff = target - now;

    const dObj = new Date(target + 7 * 3600000);
    const dd = String(dObj.getUTCDate()).padStart(2, '0');
    const mm = String(dObj.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = dObj.getUTCFullYear();
    const hh = String(dObj.getUTCHours()).padStart(2, '0');
    const min = String(dObj.getUTCMinutes()).padStart(2, '0');
    const formattedDeadline = `${hh}:${min} · ${dd}/${mm}/${yyyy}`;

    if (diff <= 0) {
      return {
        hasDeadline: true,
        isExpired: true,
        text: ' ĐÃ HẾT HẠN',
        shortText: 'Đã hết hạn nộp',
        badgeClass: 'timer-expired',
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        formattedDeadline
      };
    }

    const seconds = Math.floor((diff / 1000) % 60);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    let shortText = '';
    let badgeClass = 'timer-green';

    // ĐIỀU KIỆN ĐẾM NGƯỢC:
    // - Nếu còn trên 1 ngày (days >= 1): hiện "x ngày x h còn lại"
    // - Còn dưới 1 ngày (days < 1): hiện "x h x phút còn lại"
    if (days >= 1) {
      shortText = `${days} ngày ${hours} h còn lại`;
      badgeClass = days > 2 ? 'timer-green' : 'timer-warning';
    } else {
      shortText = `${hours} h ${minutes} phút còn lại`;
      badgeClass = 'timer-urgent';
    }

    return {
      hasDeadline: true,
      isExpired: false,
      text: ` ${shortText}`,
      shortText,
      badgeClass,
      days,
      hours,
      minutes,
      seconds,
      formattedDeadline
    };
  }

  // Vòng lặp cập nhật đếm ngược mỗi giây
  startCountdownLoop() {
    if (this.timerInterval) clearInterval(this.timerInterval);

    this.timerInterval = setInterval(() => {
      // 1. Cập nhật nhãn đếm ngược dưới các node bài tập
      document.querySelectorAll('.duo-step-timer').forEach(el => {
        const id = Number(el.getAttribute('data-id'));
        const item = this.assignments.find(a => (a.assignmentId || a.id) === id);
        if (item) {
          const cd = this.getCountdownInfo(item.deadline);
          el.className = `duo-step-timer ${cd.badgeClass}`;
          el.textContent = cd.shortText;
        }
      });

      if (this.sidebarMinute !== Math.floor(Date.now() / 60000)) this.renderSidebar();

      // 2. Cập nhật đồng hồ đếm ngược trong Modal nếu đang mở
      if (this.selectedAssignment) {
        this.updateModalCountdown(this.selectedAssignment);
      }
    }, 1000);
  }

  updateModalCountdown(item) {
    const cdWrap = document.getElementById('duoDeadlineCountdown');
    const expiredWrap = document.getElementById('duoDeadlineExpired');
    const cdDeadlineText = document.getElementById('duoCountdownDeadlineText');
    const expiredText = document.getElementById('duoExpiredDeadlineText');
    const cdDays = document.getElementById('cdDays');
    const cdHours = document.getElementById('cdHours');
    const cdMinutes = document.getElementById('cdMinutes');
    const cdSeconds = document.getElementById('cdSeconds');
    const barFill = document.getElementById('duoCountdownBarFill');

    if (!cdWrap || !expiredWrap) return;

    const cd = this.getCountdownInfo(item.deadline);

    if (!cd.hasDeadline) {
      cdWrap.style.display = 'none';
      expiredWrap.style.display = 'none';
      return;
    }

    if (cd.isExpired) {
      cdWrap.style.display = 'none';
      expiredWrap.style.display = 'block';
      if (expiredText) {
        expiredText.textContent = `Hạn chót đã kết thúc vào lúc ${cd.formattedDeadline}`;
      }
    } else {
      expiredWrap.style.display = 'none';
      cdWrap.style.display = 'block';
      if (cdDeadlineText) cdDeadlineText.textContent = `Hạn chót: ${cd.formattedDeadline}`;
      if (cdDays) cdDays.textContent = String(cd.days).padStart(2, '0');
      if (cdHours) cdHours.textContent = String(cd.hours).padStart(2, '0');
      if (cdMinutes) cdMinutes.textContent = String(cd.minutes).padStart(2, '0');
      if (cdSeconds) cdSeconds.textContent = String(cd.seconds).padStart(2, '0');

      if (barFill) {
        // Tỷ lệ màu: còn nhiều xanh, sắp hết cam/đỏ
        if (cd.days > 2) {
          barFill.style.background = 'linear-gradient(90deg, #10b981 0%, #059669 100%)';
          barFill.style.width = '85%';
        } else if (cd.days > 0) {
          barFill.style.background = 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)';
          barFill.style.width = '50%';
        } else {
          barFill.style.background = 'linear-gradient(90deg, #ef4444 0%, #b91c1c 100%)';
          barFill.style.width = '20%';
        }
      }
    }
  }

  // ==========================================
  // RENDER PATH (11 BÀI TẬP VÀ ĐẾM THỜI GIAN)
  // ==========================================
  renderPath() {
    const container = document.getElementById('duoPathContainer');
    const heading = document.getElementById('duoPathHeading');
    if (heading) heading.textContent = this.loadState === 'ready' ? `Lộ trình ${this.assignments.length} bài tập thực hành` : 'Lộ trình bài tập thực hành';
    this.renderSidebar();
    if (!container) return;
    if (this.loadState !== 'ready' || !this.assignments.length) {
      container.innerHTML = `<p class="duo-path-message">${this.loadState === 'loading' ? 'Đang tải bài tập…' : this.loadState === 'error' ? 'Không tải được bài tập. Vui lòng thử lại.' : 'Chưa có bài tập nào được công bố.'}</p>`;
      return;
    }

    container.innerHTML = '';
    const startAssignment = this.assignments.find(item => item.status === 'active' && !this.getCountdownInfo(item.deadline).isExpired);

    this.assignments.forEach((item, index) => {
      const stepEl = document.createElement('div');
      stepEl.className = `duo-path-step ${item.offset || 'offset-center'}`;
      const itemId = item.assignmentId || item.id || (index + 1);
      const safeTitle = escapeHtmlDuo(item.title);
      const countdown = this.getCountdownInfo(item.deadline);
      const locked = item.status === 'locked' && !window.canManage?.('assignments:manage');

      if (item.type === 'chest') {
        // Treasure Chest
        stepEl.innerHTML = `
          <button type="button" class="duo-chest-node" data-id="${itemId}" title="${safeTitle}" aria-label="${safeTitle}" ${locked ? 'disabled' : ''}>
            <span class="duo-node-number">${itemId}</span>
          </button>
          <!-- Đếm thời gian còn lại ở dưới bài tập -->
          <div class="duo-step-timer ${countdown.badgeClass}" data-id="${itemId}" title="Hạn nộp: ${countdown.formattedDeadline}">
            <span>${countdown.shortText}</span>
          </div>
        `;
      } else {
        // Standard Circle Node
        let nodeColorClass = 'duo-node-grey';

        if (item.status === 'closed') {
          nodeColorClass = 'duo-node-gold';
        } else if (item.status === 'active') {
          nodeColorClass = 'duo-node-green';
        }

        let startBubbleHtml = '';
        if (item === startAssignment) {
          stepEl.classList.add('has-current-bubble');
          startBubbleHtml = `<div class="duo-start-bubble" data-id="${itemId}">BẮT ĐẦU</div>`;
        }

        let pulseRingHtml = '';
        if (item.status === 'active') {
          pulseRingHtml = `<div class="duo-node-active-ring"></div>`;
        }

        stepEl.innerHTML = `
          ${startBubbleHtml}
          <button type="button" class="duo-node-btn ${nodeColorClass}" data-id="${itemId}" title="${safeTitle}" aria-label="${safeTitle}" ${locked ? 'disabled' : ''}>
            ${pulseRingHtml}
            <span class="duo-node-number">${itemId}</span>
          </button>
          <span class="duo-step-status">${item.status === 'closed' ? 'Đã đóng' : item.status === 'active' ? 'Đang mở' : 'Chưa mở'}</span>
          <!-- Đếm thời gian còn lại ở dưới mỗi bài tập trong 11 bài -->
          <div class="duo-step-timer ${countdown.badgeClass}" data-id="${itemId}" title="Hạn nộp: ${countdown.formattedDeadline}">
            <span>${countdown.shortText}</span>
          </div>
        `;
      }

      // Click event for the step (button, chest, or bubble)
      stepEl.style.cursor = locked ? 'default' : 'pointer';
      stepEl.addEventListener('click', () => {
        if (locked) return;
        this.openAssignmentModal(item);
      });

      container.appendChild(stepEl);
    });
  }

  // ==========================================
  // MODAL CHI TIẾT BÀI TẬP & ADMIN SET THỜI GIAN
  // ==========================================
  openAssignmentModal(item) {
    const itemId = item.assignmentId || item.id;
    const currentItem = this.assignments.find(a => (a.assignmentId || a.id) === itemId);
    if (!currentItem || (currentItem.status === 'locked' && !window.canManage?.('assignments:manage'))) {
      this.selectedAssignment = null;
      document.getElementById('duoAssignmentModal')?.classList.remove('active');
      return;
    }
    this.selectedAssignment = currentItem;

    const modal = document.getElementById('duoAssignmentModal');
    if (!modal) return;

    const badgeEl = document.getElementById('duoModalBadge');
    const titleEl = document.getElementById('duoModalTitle');
    const descEl = document.getElementById('duoModalDesc');
    const detailsEl = document.getElementById('duoModalDetails');
    const launchBtn = document.getElementById('duoBtnLaunch');
    const displayInput = document.getElementById('duoDisplayLink');
    const linkInput = document.getElementById('duoLinkInput');
    const deadlineInput = document.getElementById('duoDeadlineInput');
    const officialBadge = document.getElementById('duoLinkOfficialBadge');
    const adminBox = document.getElementById('duoAdminQuickEditBox');

    if (badgeEl) {
      if (currentItem.status === 'closed') {
        badgeEl.className = 'duo-modal-badge gold';
        badgeEl.textContent = ' ĐÃ ĐÓNG';
      } else if (currentItem.status === 'active') {
        badgeEl.className = 'duo-modal-badge green';
        badgeEl.textContent = ' ĐANG MỞ';
      } else {
        badgeEl.className = 'duo-modal-badge grey';
        badgeEl.textContent = ' CHƯA MỞ KHÓA';
      }
    }

    if (titleEl) titleEl.textContent = currentItem.title;
    if (descEl) descEl.textContent = currentItem.desc;
    if (detailsEl) detailsEl.textContent = currentItem.details || 'Trainer chưa bổ sung yêu cầu chi tiết. Vui lòng xem hướng dẫn trong form nộp bài.';

    // Cập nhật đồng hồ đếm ngược thời gian còn lại
    this.updateModalCountdown(currentItem);

    // Hiển thị đường link do Admin đã gán (kiểm tra an toàn chống javascript:...)
    const safeLink = sanitizeUrlDuo(currentItem.link);
    const hasRealLink = Boolean(safeLink && safeLink !== '#');

    if (displayInput) {
      if (hasRealLink) {
        displayInput.value = safeLink;
        displayInput.style.color = 'var(--primary-blue)';
      } else {
        displayInput.value = 'Chưa có link bài tập (Admin chưa gán link)';
        displayInput.style.color = 'var(--text-muted)';
      }
    }

    if (officialBadge) {
      officialBadge.textContent = hasRealLink ? 'Link Chính Thức Từ Admin' : 'Chưa Gán Link';
      officialBadge.className = hasRealLink ? 'badge badge-success' : 'badge badge-warning';
    }

    // Cấu hình Nút Mở Link Bài Tập
    if (launchBtn) {
      if (currentItem.status === 'locked') {
        launchBtn.href = 'javascript:void(0)';
        launchBtn.target = '_self';
        launchBtn.className = 'duo-btn-launch disabled';
        launchBtn.innerHTML = `<span> Bài tập chưa mở khóa</span>`;
      } else if (!hasRealLink) {
        launchBtn.href = 'javascript:void(0)';
        launchBtn.target = '_self';
        launchBtn.className = 'duo-btn-launch disabled';
        launchBtn.innerHTML = `<span> Chưa có link (Admin chưa gán)</span>`;
      } else if (currentItem.status === 'closed') {
        launchBtn.href = safeLink;
        launchBtn.target = '_blank';
        launchBtn.className = 'duo-btn-launch gold';
        launchBtn.innerHTML = `<span> Xem hướng dẫn bài đã đóng</span>`;
      } else {
        launchBtn.href = safeLink;
        launchBtn.target = '_blank';
        launchBtn.className = 'duo-btn-launch green';
        launchBtn.innerHTML = `<span> Mở form nộp bài</span>`;
      }

      launchBtn.onclick = (e) => {
        if (currentItem.status === 'locked') {
          e.preventDefault();
          if (window.showToast) window.showToast('Bài tập này chưa được Ban Tổ chức mở.', 'warning');
          return;
        }

        if (!hasRealLink) {
          e.preventDefault();
          if (window.showToast) window.showToast('Trainer / Admin chưa gán link cho bài tập này. Vui lòng quay lại sau!', 'info');
          return;
        }

        if (window.showToast) window.showToast(`Đang mở bài tập: ${currentItem.title}`, 'success');
      };
    }

    // Kiểm tra quyền Admin: Chỉ hiển thị khung chỉnh sửa nếu Admin đã đăng nhập
    const isAdmin = window.canManage?.('assignments:manage') || false;

    if (adminBox) {
      if (isAdmin) {
        adminBox.style.display = 'block';
        if (linkInput) linkInput.value = hasRealLink ? safeLink : '';

        // Điền ngày giờ hạn nộp vào input datetime-local nếu có
        if (deadlineInput) {
          if (currentItem.deadline) {
            try {
              const d = new Date(new Date(currentItem.deadline).getTime() + 7 * 3600000);
              const y = d.getUTCFullYear();
              const m = String(d.getUTCMonth() + 1).padStart(2, '0');
              const day = String(d.getUTCDate()).padStart(2, '0');
              const h = String(d.getUTCHours()).padStart(2, '0');
              const min = String(d.getUTCMinutes()).padStart(2, '0');
              deadlineInput.value = `${y}-${m}-${day}T${h}:${min}`;
            } catch (err) {
              deadlineInput.value = '';
            }
          } else {
            deadlineInput.value = '';
          }
        }
      } else {
        adminBox.style.display = 'none';
      }
    }

    modal.classList.add('active');
  }

  setupModalEvents() {
    const modal = document.getElementById('duoAssignmentModal');
    const closeBtn = document.getElementById('duoModalCloseBtn');
    const editDetails = document.getElementById('duoBtnEditDetails');
    editDetails?.addEventListener('click', () => { if (this.selectedAssignment && window.canManage?.('assignments:manage')) { modal.classList.remove('active'); window.openAdminEditAssignmentModal?.(this.selectedAssignment); } });
    const saveLinkBtn = document.getElementById('duoBtnSaveLink');
    const saveDeadlineBtn = document.getElementById('duoBtnSaveDeadline');
    const clearDeadlineBtn = document.getElementById('duoBtnClearDeadline');
    const linkInput = document.getElementById('duoLinkInput');
    const deadlineInput = document.getElementById('duoDeadlineInput');
    const btnCopy = document.getElementById('btnCopyDuoLink');

    if (closeBtn && modal) {
      closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
      });
    }

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('active');
        }
      });
    }

    // Nút sao chép đường link
    if (btnCopy) {
      btnCopy.onclick = () => {
        if (!this.selectedAssignment) return;
        const link = this.selectedAssignment.link;
        if (!link || link === '#' || link.trim() === '') {
          if (window.showToast) window.showToast('Bài tập này chưa có đường link để sao chép!', 'warning');
          return;
        }
        navigator.clipboard.writeText(link).then(() => {
          if (window.showToast) window.showToast('Đã sao chép đường link bài tập!', 'success');
        }).catch(() => {
          if (window.showToast) window.showToast(`Link: ${link}`, 'info');
        });
      };
    }

    // Xử lý khi Admin lưu đường link mới
    if (saveLinkBtn && linkInput && !saveLinkBtn.dataset.bound) {
      saveLinkBtn.dataset.bound = 'true';
      saveLinkBtn.addEventListener('click', async () => {
        if (!this.selectedAssignment) return;
        const newLink = linkInput.value.trim();
        const itemId = this.selectedAssignment.assignmentId || this.selectedAssignment.id;

        saveLinkBtn.disabled = true;
        saveLinkBtn.textContent = ' Đang lưu...';

        try {
          if (window.API && typeof window.API.updateAssignment === 'function') {
            const res = await window.API.updateAssignment(itemId, { link: newLink });
            if (res && res.success) {
              this.selectedAssignment.link = newLink;
              const target = this.assignments.find(a => (a.assignmentId || a.id) === itemId);
              if (target) target.link = newLink;
              this.saveAssignments();
              this.renderPath();
              this.openAssignmentModal(this.selectedAssignment);

              if (window.showToast) {
                window.showToast(`Đã lưu link bài tập #${itemId} vào MongoDB Atlas!`, 'success');
              }
              if (window.renderAdminAssignmentsTable) {
                window.renderAdminAssignmentsTable();
              }
            } else {
              if (window.showToast) window.showToast((res && res.message) || 'Lỗi lưu link bài tập!', 'danger');
            }
          }
        } catch (err) {
          if (window.showToast) window.showToast('Lỗi kết nối máy chủ: ' + err.message, 'danger');
        } finally {
          saveLinkBtn.disabled = false;
          saveLinkBtn.textContent = ' Lưu Link';
        }
      });
    }

    // Xử lý khi Admin set/lưu Thời hạn nộp bài (Deadline)
    if (saveDeadlineBtn && deadlineInput && !saveDeadlineBtn.dataset.bound) {
      saveDeadlineBtn.dataset.bound = 'true';
      saveDeadlineBtn.addEventListener('click', async () => {
        if (!this.selectedAssignment) return;
        const val = deadlineInput.value;
        if (!val) {
          if (window.showToast) window.showToast('Vui lòng chọn ngày và giờ hạn nộp bài!', 'warning');
          return;
        }

        const isoDeadline = new Date(val + ':00+07:00').toISOString();
        const itemId = this.selectedAssignment.assignmentId || this.selectedAssignment.id;

        saveDeadlineBtn.disabled = true;
        saveDeadlineBtn.textContent = ' Đang lưu...';

        try {
          if (window.API && typeof window.API.updateAssignment === 'function') {
            const res = await window.API.updateAssignment(itemId, { deadline: isoDeadline });
            if (res && res.success) {
              this.selectedAssignment.deadline = isoDeadline;
              const target = this.assignments.find(a => (a.assignmentId || a.id) === itemId);
              if (target) target.deadline = isoDeadline;
              this.saveAssignments();
              this.renderPath();
              this.openAssignmentModal(this.selectedAssignment);

              if (window.showToast) {
                window.showToast(`Đã cài đặt hạn nộp bài #${itemId} thành công!`, 'success');
              }
              if (window.renderAdminAssignmentsTable) {
                window.renderAdminAssignmentsTable();
              }
            } else {
              if (window.showToast) window.showToast((res && res.message) || 'Lỗi cài đặt hạn nộp!', 'danger');
            }
          }
        } catch (err) {
          if (window.showToast) window.showToast('Lỗi máy chủ: ' + err.message, 'danger');
        } finally {
          saveDeadlineBtn.disabled = false;
          saveDeadlineBtn.textContent = ' Lưu Hạn';
        }
      });
    }

    // Xử lý khi Admin xóa hạn nộp bài (Không giới hạn)
    if (clearDeadlineBtn && !clearDeadlineBtn.dataset.bound) {
      clearDeadlineBtn.dataset.bound = 'true';
      clearDeadlineBtn.addEventListener('click', async () => {
        if (!this.selectedAssignment) return;
        const itemId = this.selectedAssignment.assignmentId || this.selectedAssignment.id;

        if (!confirm('Bạn có chắc muốn xóa hạn chót của bài tập này? (Bài tập sẽ không giới hạn thời gian)')) {
          return;
        }

        try {
          if (window.API && typeof window.API.updateAssignment === 'function') {
            const res = await window.API.updateAssignment(itemId, { deadline: null });
            if (res && res.success) {
              this.selectedAssignment.deadline = null;
              const target = this.assignments.find(a => (a.assignmentId || a.id) === itemId);
              if (target) target.deadline = null;
              this.saveAssignments();
              this.renderPath();
              this.openAssignmentModal(this.selectedAssignment);

              if (window.showToast) {
                window.showToast(`Đã gỡ bỏ hạn nộp bài #${itemId}!`, 'info');
              }
              if (window.renderAdminAssignmentsTable) {
                window.renderAdminAssignmentsTable();
              }
            }
          }
        } catch (err) {
          if (window.showToast) window.showToast('Lỗi: ' + err.message, 'danger');
        }
      });
    }

    // Gán sự kiện cho các nút gán nhanh deadline (+12h, +1d, +3d, +7d)
    document.querySelectorAll('.btn-quick-set-deadline').forEach(btn => {
      if (!btn.dataset.bound) {
        btn.dataset.bound = 'true';
        btn.addEventListener('click', () => {
          const hours = Number(btn.getAttribute('data-hours')) || 24;
          const targetDate = new Date(Date.now() + (hours + 7) * 3600 * 1000);
          const y = targetDate.getUTCFullYear();
          const m = String(targetDate.getUTCMonth() + 1).padStart(2, '0');
          const day = String(targetDate.getUTCDate()).padStart(2, '0');
          const h = String(targetDate.getUTCHours()).padStart(2, '0');
          const min = String(targetDate.getUTCMinutes()).padStart(2, '0');
          const deadlineInputEl = document.getElementById('duoDeadlineInput');
          if (deadlineInputEl) {
            deadlineInputEl.value = `${y}-${m}-${day}T${h}:${min}`;
            deadlineInputEl.focus();
            if (window.showToast) {
              window.showToast(`Đã chọn hạn chót: +${hours} giờ. Bấm " Lưu Hạn" để áp dụng!`, 'info');
            }
          }
        });
      }
    });

    // Guidebook button
    const btnGuidebook = document.getElementById('duoGuidebookBtn');
    if (btnGuidebook) {
      btnGuidebook.addEventListener('click', () => {
        this.openGuidebookModal();
      });
    }

  }

  openGuidebookModal() {
    alert(
      " HƯỚNG DẪN BÀI TẬP TRAINEE PROGRAM (GUIDEBOOK)\n\n" +
      "1. Mỗi ô tròn trên con đường tượng trưng cho một bài tập thực hành hoặc chuyên đề.\n" +
      "2. Dưới mỗi bài tập có đồng hồ đếm ngược thời gian nộp bài do Admin thiết lập.\n" +
      "3. Bấm vào bất kỳ ô nào để mở chi tiết, thời hạn và đường link bài tập.\n" +
      "4. Theo dõi hạn nộp và hoàn thành bài tập theo hướng dẫn của Ban Tổ chức Trainee Program."
    );
  }

  renderSidebar() {
    const summary = document.getElementById('duoAssignmentSummary');
    const upcoming = document.getElementById('duoUpcomingDeadlines');
    this.sidebarMinute = Math.floor(Date.now() / 60000);
    if (!summary || !upcoming) return;
    if (this.loadState === 'loading') {
      summary.innerHTML = '<p class="duo-sidebar-note">Đang tải dữ liệu bài tập…</p>';
      upcoming.innerHTML = '<p class="duo-sidebar-note">Đang tải hạn nộp…</p>';
      return;
    }
    if (this.loadState === 'error') {
      summary.innerHTML = '<p class="duo-sidebar-note">Không tải được dữ liệu bài tập.</p><button type="button" class="btn btn-secondary btn-sm" id="duoRetryAssignments">Thử lại</button>';
      upcoming.innerHTML = '<p class="duo-sidebar-note">Hạn nộp sẽ hiển thị khi tải được dữ liệu.</p>';
      document.getElementById('duoRetryAssignments')?.addEventListener('click', () => this.fetchAssignmentsFromAPI());
      return;
    }

    const total = this.assignments.length;
    const closed = this.assignments.filter(item => item.status === 'closed').length;
    const active = this.assignments.filter(item => item.status === 'active').length;
    const locked = total - closed - active;
    const now = Date.now();
    const pending = this.assignments.filter(item => item.status === 'active' && item.deadline && Number.isFinite(new Date(item.deadline).getTime()));
    const overdue = pending.filter(item => new Date(item.deadline).getTime() <= now).length;
    const next = pending.filter(item => new Date(item.deadline).getTime() > now)
      .sort((a, b) => new Date(a.deadline) - new Date(b.deadline)).slice(0, 3);

    summary.innerHTML = `
      <div class="duo-summary-total"><strong>${active}<span> / ${total}</span></strong><span>bài đang mở</span></div>
      <progress class="duo-summary-progress" value="${active}" max="${Math.max(total, 1)}" aria-label="Số bài tập đang mở">${active} / ${total}</progress>
      <dl class="duo-summary-list">
        <div><dt>Đang mở</dt><dd>${active}</dd></div>
        <div><dt>Chưa mở</dt><dd>${locked}</dd></div>
        <div><dt>Đã đóng</dt><dd>${closed}</dd></div>
      </dl>
      ${overdue ? `<p class="duo-overdue-note">${overdue} bài đang mở đã qua hạn nộp.</p>` : ''}
    `;

    if (!next.length) {
      upcoming.innerHTML = '<p class="duo-sidebar-note">Chưa có hạn nộp sắp tới.</p>';
      return;
    }
    upcoming.innerHTML = `<ol class="duo-deadline-list">${next.map(item => {
      const date = new Date(item.deadline);
      const formatted = date.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
      const countdown = this.getCountdownInfo(item.deadline);
      return `<li><button type="button" class="duo-deadline-link" data-assignment-id="${escapeHtmlDuo(item.assignmentId || item.id)}">${escapeHtmlDuo(item.title)}</button>
        <time datetime="${date.toISOString()}">${escapeHtmlDuo(formatted)}</time>
        <span class="duo-deadline-remaining">${escapeHtmlDuo(countdown.shortText)}</span></li>`;
    }).join('')}</ol>`;
    upcoming.querySelectorAll('[data-assignment-id]').forEach(button => {
      button.addEventListener('click', () => {
        const item = this.assignments.find(value => String(value.assignmentId || value.id) === button.dataset.assignmentId);
        if (item) this.openAssignmentModal(item);
      });
    });
  }
}

// Global initialization helper
window.initDuolingoModule = function() {
  if (!window.duolingoManager) {
    window.duolingoManager = new DuolingoManager();
  } else {
    window.duolingoManager.renderPath();
  }
};
