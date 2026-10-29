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
    status: 'completed',
    score: 100,
    xp: 50,
    gems: 10,
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
    status: 'completed',
    score: 95,
    xp: 60,
    gems: 15,
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
    status: 'completed',
    score: 98,
    xp: 70,
    gems: 20,
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
    status: 'completed',
    score: 92,
    xp: 75,
    gems: 20,
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
    status: 'completed',
    score: 96,
    xp: 80,
    gems: 25,
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
    isCurrent: true,
    score: 0,
    xp: 85,
    gems: 25,
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
    score: 0,
    xp: 90,
    gems: 30,
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
    score: 0,
    xp: 90,
    gems: 30,
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
    score: 0,
    xp: 95,
    gems: 35,
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
    score: 0,
    xp: 100,
    gems: 40,
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
    score: 0,
    xp: 150,
    gems: 50,
    link: '#',
    deadline: null,
    offset: 'offset-right-2'
  }
];

// SVG Icons
const DUO_ICONS = {
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
  star: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  chest: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12V8H4v4"/><rect x="2" y="8" width="20" height="12" rx="2"/><path d="M10 12h4"/></svg>`
};

class DuolingoManager {
  constructor() {
    this.assignments = this.loadCachedAssignments();
    this.selectedAssignment = null;
    this.timerInterval = null;
    this.init();
    // Tải dữ liệu 11 bài tập mới nhất từ MongoDB Atlas
    this.fetchAssignmentsFromAPI();
  }

  loadCachedAssignments() {
    try {
      const saved = localStorage.getItem('uit_duo_assignments_v11') || localStorage.getItem('uit_duo_assignments');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === DEFAULT_DUOLINGO_ASSIGNMENTS.length) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Lỗi đọc assignments từ localStorage:', e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_DUOLINGO_ASSIGNMENTS));
  }

  async fetchAssignmentsFromAPI() {
    try {
      if (window.API && typeof window.API.getAssignments === 'function') {
        const list = await window.API.getAssignments();
        if (Array.isArray(list) && list.length > 0) {
          this.assignments = list;
          this.saveAssignments();
          this.renderPath();
          // Cập nhật modal nếu đang mở
          if (this.selectedAssignment) {
            const curId = this.selectedAssignment.assignmentId || this.selectedAssignment.id;
            const updated = this.assignments.find(a => (a.assignmentId || a.id) === curId);
            if (updated) this.openAssignmentModal(updated);
          }
        }
      }
    } catch (err) {
      console.warn('Không thể tải assignments từ API, sử dụng cache cục bộ:', err);
    }
  }

  saveAssignments() {
    try {
      localStorage.setItem('uit_duo_assignments_v11', JSON.stringify(this.assignments));
      localStorage.setItem('uit_duo_assignments', JSON.stringify(this.assignments));
    } catch (e) {
      console.error('Lỗi lưu assignments vào localStorage:', e);
    }
  }

  init() {
    this.renderPath();
    this.renderChart();
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

    const dObj = new Date(target);
    const dd = String(dObj.getDate()).padStart(2, '0');
    const mm = String(dObj.getMonth() + 1).padStart(2, '0');
    const yyyy = dObj.getFullYear();
    const hh = String(dObj.getHours()).padStart(2, '0');
    const min = String(dObj.getMinutes()).padStart(2, '0');
    const formattedDeadline = `${hh}:${min} · ${dd}/${mm}/${yyyy}`;

    if (diff <= 0) {
      return {
        hasDeadline: true,
        isExpired: true,
        text: '🚨 ĐÃ HẾT HẠN',
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
      text: `⏰ ${shortText}`,
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
          el.innerHTML = `<span>⏰</span> <span>${cd.shortText}</span>`;
        }
      });

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
    if (!container) return;

    container.innerHTML = '';

    this.assignments.forEach((item, index) => {
      const stepEl = document.createElement('div');
      stepEl.className = `duo-path-step ${item.offset || 'offset-center'}`;
      const itemId = item.assignmentId || item.id || (index + 1);
      const safeTitle = escapeHtmlDuo(item.title);
      const countdown = this.getCountdownInfo(item.deadline);

      if (item.type === 'chest') {
        // Treasure Chest
        stepEl.innerHTML = `
          <div class="duo-chest-node" data-id="${itemId}" title="${safeTitle}">
            <div style="font-size: 26px;">🎁</div>
            <div class="duo-chest-lock"></div>
          </div>
          <!-- Đếm thời gian còn lại ở dưới bài tập -->
          <div class="duo-step-timer ${countdown.badgeClass}" data-id="${itemId}" title="Hạn nộp: ${countdown.formattedDeadline}">
            <span>⏰</span> <span>${countdown.shortText}</span>
          </div>
        `;
      } else {
        // Standard Circle Node
        let nodeColorClass = 'duo-node-grey';
        let iconHtml = DUO_ICONS.lock;

        if (item.status === 'completed') {
          nodeColorClass = 'duo-node-gold';
          iconHtml = DUO_ICONS[item.icon] || DUO_ICONS.check;
        } else if (item.status === 'active' || item.isCurrent) {
          nodeColorClass = 'duo-node-green';
          iconHtml = DUO_ICONS.star;
        }

        let startBubbleHtml = '';
        if (item.isCurrent) {
          stepEl.classList.add('has-current-bubble');
          startBubbleHtml = `<div class="duo-start-bubble" data-id="${itemId}">BẮT ĐẦU</div>`;
        }

        let pulseRingHtml = '';
        if (item.status === 'active' || item.isCurrent) {
          pulseRingHtml = `<div class="duo-node-active-ring"></div>`;
        }

        stepEl.innerHTML = `
          ${startBubbleHtml}
          <button type="button" class="duo-node-btn ${nodeColorClass}" data-id="${itemId}" title="${safeTitle}" aria-label="${safeTitle}">
            ${pulseRingHtml}
            <span class="duo-node-icon">${iconHtml}</span>
          </button>
          <!-- Đếm thời gian còn lại ở dưới mỗi bài tập trong 11 bài -->
          <div class="duo-step-timer ${countdown.badgeClass}" data-id="${itemId}" title="Hạn nộp: ${countdown.formattedDeadline}">
            <span>⏰</span> <span>${countdown.shortText}</span>
          </div>
        `;
      }

      // Click event for the step (button, chest, or bubble)
      stepEl.style.cursor = 'pointer';
      stepEl.addEventListener('click', () => {
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
    const currentItem = this.assignments.find(a => (a.assignmentId || a.id) === itemId) || item;
    this.selectedAssignment = currentItem;

    const modal = document.getElementById('duoAssignmentModal');
    if (!modal) return;

    const badgeEl = document.getElementById('duoModalBadge');
    const titleEl = document.getElementById('duoModalTitle');
    const descEl = document.getElementById('duoModalDesc');
    const scoreEl = document.getElementById('duoModalScore');
    const xpEl = document.getElementById('duoModalXp');
    const gemsEl = document.getElementById('duoModalGems');
    const launchBtn = document.getElementById('duoBtnLaunch');
    const displayInput = document.getElementById('duoDisplayLink');
    const linkInput = document.getElementById('duoLinkInput');
    const deadlineInput = document.getElementById('duoDeadlineInput');
    const officialBadge = document.getElementById('duoLinkOfficialBadge');
    const adminBox = document.getElementById('duoAdminQuickEditBox');

    if (badgeEl) {
      if (currentItem.status === 'completed') {
        badgeEl.className = 'duo-modal-badge gold';
        badgeEl.textContent = '✓ ĐÃ HOÀN THÀNH';
      } else if (currentItem.status === 'active' || currentItem.isCurrent) {
        badgeEl.className = 'duo-modal-badge green';
        badgeEl.textContent = '★ ĐANG MỞ - BÀI HỌC TIẾP THEO';
      } else {
        badgeEl.className = 'duo-modal-badge grey';
        badgeEl.textContent = '🔒 CHƯA MỞ KHÓA';
      }
    }

    if (titleEl) titleEl.textContent = currentItem.title;
    if (descEl) descEl.textContent = currentItem.desc;
    if (scoreEl) scoreEl.textContent = `${currentItem.score || 0}/100`;
    if (xpEl) xpEl.textContent = `+${currentItem.xp || 50} XP`;
    if (gemsEl) gemsEl.textContent = `+${currentItem.gems || 10} Gems`;

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
        launchBtn.innerHTML = `<span>🔒 Bài tập chưa mở khóa</span>`;
      } else if (!hasRealLink) {
        launchBtn.href = 'javascript:void(0)';
        launchBtn.target = '_self';
        launchBtn.className = 'duo-btn-launch disabled';
        launchBtn.innerHTML = `<span>⚠️ Chưa có link (Admin chưa gán)</span>`;
      } else if (currentItem.status === 'completed') {
        launchBtn.href = safeLink;
        launchBtn.target = '_blank';
        launchBtn.className = 'duo-btn-launch gold';
        launchBtn.innerHTML = `<span>📖 Xem Lại Bài Tập (Mở Link Đã Gán)</span>`;
      } else {
        launchBtn.href = safeLink;
        launchBtn.target = '_blank';
        launchBtn.className = 'duo-btn-launch green';
        launchBtn.innerHTML = `<span>🚀 TRUY CẬP ĐƯỜNG LINK BÀI TẬP (TAB MỚI)</span>`;
      }

      launchBtn.onclick = (e) => {
        if (currentItem.status === 'locked') {
          e.preventDefault();
          if (window.showToast) window.showToast('Vui lòng hoàn thành các bài tập trước để mở khóa bài này!', 'warning');
          return;
        }

        if (!hasRealLink) {
          e.preventDefault();
          if (window.showToast) window.showToast('Giảng viên / Admin chưa gán link cho bài tập này. Vui lòng quay lại sau!', 'info');
          return;
        }

        if (window.showToast) window.showToast(`Đang mở bài tập: ${currentItem.title}`, 'success');
      };
    }

    // Kiểm tra quyền Admin: Chỉ hiển thị khung chỉnh sửa nếu Admin đã đăng nhập
    const token = localStorage.getItem('uit_trainee_auth_token');
    const authUser = localStorage.getItem('uit_trainee_auth_user');
    let isAdmin = false;
    try {
      if (authUser) {
        const u = JSON.parse(authUser);
        if (u && (u.role === 'admin' || u.role === 'Admin')) isAdmin = true;
      }
      if (window.state && window.state.currentUser && (window.state.currentUser.role === 'admin' || window.state.currentUser.role === 'Admin')) {
        isAdmin = true;
      }
    } catch (e) {}

    if (adminBox) {
      if (isAdmin) {
        adminBox.style.display = 'block';
        if (linkInput) linkInput.value = hasRealLink ? safeLink : '';

        // Điền ngày giờ hạn nộp vào input datetime-local nếu có
        if (deadlineInput) {
          if (currentItem.deadline) {
            try {
              const d = new Date(currentItem.deadline);
              const y = d.getFullYear();
              const m = String(d.getMonth() + 1).padStart(2, '0');
              const day = String(d.getDate()).padStart(2, '0');
              const h = String(d.getHours()).padStart(2, '0');
              const min = String(d.getMinutes()).padStart(2, '0');
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
        saveLinkBtn.textContent = '⏳ Đang lưu...';

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
          saveLinkBtn.textContent = '💾 Lưu Link';
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

        const isoDeadline = new Date(val).toISOString();
        const itemId = this.selectedAssignment.assignmentId || this.selectedAssignment.id;

        saveDeadlineBtn.disabled = true;
        saveDeadlineBtn.textContent = '⏳ Đang lưu...';

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
          saveDeadlineBtn.textContent = '💾 Lưu Hạn';
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
          const targetDate = new Date(Date.now() + hours * 3600 * 1000);
          const y = targetDate.getFullYear();
          const m = String(targetDate.getMonth() + 1).padStart(2, '0');
          const day = String(targetDate.getDate()).padStart(2, '0');
          const h = String(targetDate.getHours()).padStart(2, '0');
          const min = String(targetDate.getMinutes()).padStart(2, '0');
          const deadlineInputEl = document.getElementById('duoDeadlineInput');
          if (deadlineInputEl) {
            deadlineInputEl.value = `${y}-${m}-${day}T${h}:${min}`;
            deadlineInputEl.focus();
            if (window.showToast) {
              window.showToast(`Đã chọn hạn chót: +${hours} giờ. Bấm "💾 Lưu Hạn" để áp dụng!`, 'info');
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

    // Practice button
    const btnPractice = document.getElementById('duoPracticeBtn');
    if (btnPractice) {
      btnPractice.addEventListener('click', () => {
        if (window.showToast) {
          window.showToast('Chế độ Luyện tập nhanh: Ôn lại câu hỏi ngẫu nhiên để nhận thêm XP!', 'info');
        }
      });
    }
  }

  openGuidebookModal() {
    alert(
      "📘 HƯỚNG DẪN BÀI TẬP TRAINEE PROGRAM (GUIDEBOOK)\n\n" +
      "1. Mỗi ô tròn trên con đường tượng trưng cho một bài tập thực hành hoặc chuyên đề.\n" +
      "2. Dưới mỗi bài tập có đồng hồ đếm ngược thời gian nộp bài do Admin thiết lập.\n" +
      "3. Bấm vào bất kỳ ô nào để mở chi tiết, thời hạn và đường link bài tập.\n" +
      "4. Hoàn thành bài tập đúng hạn để nhận XP và tích lũy điểm rèn luyện!"
    );
  }

  renderChart() {
    const svg = document.getElementById('duoChartSvg');
    if (!svg) return;

    const values = [960, 240, 20, 20, 30, 110, 80];
    const maxVal = 960;
    const width = 300;
    const height = 120;
    const paddingLeft = 32;
    const paddingBottom = 22;
    const chartW = width - paddingLeft;
    const chartH = height - paddingBottom;

    const points = values.map((val, i) => {
      const x = paddingLeft + (i / (values.length - 1)) * chartW;
      const y = chartH - (val / maxVal) * (chartH - 15);
      return { x, y, val };
    });

    const pathD = points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');
    const areaD = `${pathD} L ${points[points.length - 1].x} ${chartH} L ${points[0].x} ${chartH} Z`;

    const pathLine = svg.querySelector('.duo-chart-line');
    const pathArea = svg.querySelector('.duo-chart-area-fill');
    const pointsGroup = svg.querySelector('.duo-chart-points-group');

    if (pathLine) pathLine.setAttribute('d', pathD);
    if (pathArea) pathArea.setAttribute('d', areaD);

    if (pointsGroup) {
      pointsGroup.innerHTML = points.map(p => `
        <circle class="duo-chart-point" cx="${p.x}" cy="${p.y}" r="4.5">
          <title>${p.val} XP</title>
        </circle>
      `).join('');
    }
  }
}

// Global initialization helper
window.initDuolingoModule = function() {
  if (!window.duolingoManager) {
    window.duolingoManager = new DuolingoManager();
  } else {
    window.duolingoManager.renderPath();
    window.duolingoManager.renderChart();
  }
};
