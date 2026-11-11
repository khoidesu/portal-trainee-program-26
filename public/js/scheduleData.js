/**
 * UIT Trainee Portal - Monthly Online Schedule Module (MS Teams)
 * Quản lý lịch học trực tuyến theo tháng cho chương trình Trainee Program UIT.
 * Hỗ trợ gán link Microsoft Teams, xuất dữ liệu Excel/CSV, PDF, Google Calendar (.ics).
 * Phân quyền: Chỉ Admin mới có quyền thêm/sửa/xóa lịch. Trainee & khách chỉ xem và download.
 */

// Dữ liệu mẫu ban đầu cho Tháng 10/2026 (link MS Teams để trống để Admin gán sau)
function escapeHtmlSchedule(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sanitizeUrlSchedule(url) {
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

const DEFAULT_MONTHLY_SCHEDULES = [];

function getVietnamDateParts(now = Date.now()) {
  const date = new Date(now + 7 * 60 * 60 * 1000);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function getScheduleTiming(item, now = Date.now()) {
  const startsAt = Date.parse(`${item.date}T${item.startTime}:00+07:00`);
  const endsAt = Date.parse(`${item.date}T${item.endTime}:00+07:00`);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) return { ...item, status: 'unknown' };
  return { ...item, startsAt, endsAt, status: item.isTentative ? 'tentative' : now < startsAt ? 'upcoming' : now < endsAt ? 'live' : 'completed' };
}

function getScheduleDisplayTitle(item, index, isGuest) {
  if (!isGuest) return item.title || '';
  const match = (item.title || '').match(/^(buổi\s*\d+)/i);
  if (match) return match[1].charAt(0).toUpperCase() + match[1].slice(1);
  const codeMatch = (item.code || '').match(/\.(\d+)/);
  if (codeMatch) return `Buổi ${parseInt(codeMatch[1], 10)}`;
  return `Buổi ${index + 1}`;
}

function getScheduleDisplayTrainer(item, isGuest) {
  if (!isGuest) return item.instructor || 'Trainer';
  return 'Đăng nhập để xem';
}

const ScheduleManager = {
  storageKey: 'uit_portal_monthly_schedules_v2',
  selectedMonth: getVietnamDateParts().month,
  selectedYear: getVietnamDateParts().year,
  clockOffset: 0,
  requestId: 0,
  loadState: 'idle',
  viewMode: 'agenda', // 'agenda' (danh sách tháng - để hết trong 1 lần) | 'calendar' (lưới lịch tháng)
  cachedSchedules: [],

  // Dọn sạch dữ liệu cũ lịch tuần (CS115, IT004...) nếu còn sót lại
  cleanupOldLegacyData() {
    try {
      localStorage.removeItem('uit_portal_schedule_courses_v1');
    } catch (e) {}
  },

  // Lấy danh sách lịch học (từ cache local hoặc default)
  getLocalSchedules(month = this.selectedMonth, year = this.selectedYear) {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.filter(item => Number(item.month) === Number(month) && Number(item.year) === Number(year));
        }
      }
    } catch (e) {
      console.warn('Lỗi đọc lịch từ localStorage:', e);
    }
    return DEFAULT_MONTHLY_SCHEDULES.filter(item => Number(item.month) === Number(month) && Number(item.year) === Number(year));
  },

  // Lưu lịch vào localStorage
  saveLocalSchedules(items) {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(items));
      return true;
    } catch (e) {
      console.error('Lỗi lưu lịch vào localStorage:', e);
      return false;
    }
  },

  inFlightKey: '',
  inFlightPromise: null,

  // Đồng bộ lịch từ Backend API (MongoDB Atlas)
  async fetchSchedules(month = this.selectedMonth, year = this.selectedYear) {
    const key = `${month}-${year}`;
    if (this.inFlightPromise && this.inFlightKey === key) {
      return this.inFlightPromise;
    }
    const requestId = ++this.requestId;
    this.loadState = 'loading';
    this.inFlightKey = key;
    this.inFlightPromise = (async () => {
      try {
        const response = await fetch(`/api/schedules?month=${month}&year=${year}`, { credentials: 'same-origin' });
        const result = await response.json();
        if (requestId !== this.requestId) return null;
        if (!response.ok || !result.success || !Array.isArray(result.data)) throw new Error('Không tải được lịch học.');
        if (result.serverTime && Number.isFinite(Date.parse(result.serverTime))) this.clockOffset = Date.parse(result.serverTime) - Date.now();
        this.cachedSchedules = result.data.map(item => getScheduleTiming(item, Date.now() + this.clockOffset));
        this.loadState = 'ready';
        return this.cachedSchedules;
      } catch (err) {
        if (requestId !== this.requestId) return null;
        this.loadState = 'error';
        throw err;
      } finally {
        if (this.inFlightKey === key) {
          this.inFlightPromise = null;
          this.inFlightKey = '';
        }
      }
    })();
    return this.inFlightPromise;
  },

  getAuthHeaders() {
    return { 'Content-Type': 'application/json' };
  },

  // Thêm hoặc cập nhật một buổi học (Chỉ Admin)
  async saveSchedule(itemData) {
    const id = itemData._id || itemData.id;
    let resultItem = null;

    try {
      if (id && !String(id).startsWith('temp_')) {
        // Cập nhật lên MongoDB
        const res = await fetch(`/api/schedules/${encodeURIComponent(id)}`, {
          method: 'PUT',
          credentials: 'same-origin',
          headers: this.getAuthHeaders(),
          body: JSON.stringify(itemData)
        });
        const resJson = await res.json();
        if (resJson.success) {
          resultItem = resJson.data;
        }
      } else {
        // Tạo mới lên MongoDB
        const res = await fetch('/api/schedules', {
          method: 'POST',
          credentials: 'same-origin',
          headers: this.getAuthHeaders(),
          body: JSON.stringify(itemData)
        });
        const resJson = await res.json();
        if (resJson.success) {
          resultItem = resJson.data;
        }
      }
    } catch (err) {
      console.warn('Lỗi API khi lưu lịch học, chuyển sang lưu cục bộ:', err.message);
    }

    if (!resultItem) {
      window.showToast?.('Máy chủ chưa lưu lịch học. Kiểm tra kết nối và đăng nhập lại nếu phiên đã hết hạn.', 'danger');
      return null;
    } else {
      // Cập nhật lại cache
      const updatedId = resultItem._id || resultItem.id;
      const idx = this.cachedSchedules.findIndex(s => (s._id || s.id) === updatedId);
      if (idx !== -1) {
        this.cachedSchedules[idx] = resultItem;
      } else {
        this.cachedSchedules.push(resultItem);
      }
    }

    this.saveLocalSchedules(this.cachedSchedules);
    return resultItem;
  },

  // Xóa một buổi học (Chỉ Admin)
  async deleteSchedule(id) {
    try {
      const response = await fetch(`/api/schedules/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: this.getAuthHeaders()
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        window.showToast?.(result.message || 'Máy chủ chưa xóa lịch học.', 'danger');
        return false;
      }
    } catch (e) {
      console.warn('Lỗi API khi xóa buổi học:', e.message);
      window.showToast?.('Chưa kết nối được máy chủ để xóa lịch học.', 'danger');
      return false;
    }

    this.cachedSchedules = this.cachedSchedules.filter(s => (s._id || s.id) !== id);
    this.saveLocalSchedules(this.cachedSchedules);
    return this.cachedSchedules;
  },

  // Đặt lại / Khởi tạo lại lịch tháng (Chỉ Admin)
  async resetSchedules(month = this.selectedMonth, year = this.selectedYear, reseed = true) {
    try {
      const res = await fetch('/api/schedules/reset', {
        method: 'POST',
        credentials: 'same-origin',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ month, year, reseed })
      });
      const result = await res.json();
      if (res.ok && result.success) return await this.fetchSchedules(month, year);
      window.showToast?.(result.message || 'Chưa đặt lại được lịch học.', 'danger');
      return false;
    } catch (e) {
      console.warn('Lỗi API khi reset lịch:', e.message);
    }
    window.showToast?.('Máy chủ chưa đặt lại lịch học. Kiểm tra kết nối và quyền quản trị.', 'danger');
    return false;
  },

  // Format ngày dạng DD/MM/YYYY
  formatDateStr(dateStr) {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return dateStr;
    } catch (e) {
      return dateStr;
    }
  },

  // ==========================================
  // XỬ LÝ NÚT "VÀO HỌC" (MICROSOFT TEAMS)
  // ==========================================
  handleJoinClass(session, isAdmin = false, onEditCallback = null) {
    if (!session) return;
    if (!window.state || !window.state.currentUser) {
      if (window.showToast) {
        window.showToast('Vui lòng đăng nhập tài khoản để vào phòng học trực tuyến!', 'info');
      }
      if (typeof window.openLoginModal === 'function') {
        window.openLoginModal();
      }
      return;
    }
    if (session.status === 'completed') {
      if (session.type === 'Offline') {
        const room = session.room && session.room !== 'MS Teams Trực Tuyến' ? session.room : 'Phòng học trực tiếp';
        window.showToast?.(`Buổi học này đã kết thúc (Đã học trực tiếp tại: ${room}).`, 'info');
      } else {
        window.showToast?.('Buổi học trực tuyến này đã kết thúc!', 'info');
      }
      return;
    }
    if (session.isTentative) {
      window.showToast?.('Buổi này đang dự kiến; Ban Tổ chức sẽ chốt ngày, giờ và địa điểm sau.', 'info');
      return;
    }
    if (session.type === 'Offline') {
      const room = session.room && session.room !== 'MS Teams Trực Tuyến' ? session.room : 'Phòng học trực tiếp (Ban Tổ chức sẽ thông báo)';
      if (window.showToast) {
        window.showToast(`Địa điểm học trực tiếp: ${room}`, 'info');
      } else {
        alert(`Địa điểm học trực tiếp [${session.title}]:\n${room}`);
      }
      return;
    }
    const teamsUrl = (session.teamsUrl || '').trim();

    if (teamsUrl && (teamsUrl.startsWith('http://') || teamsUrl.startsWith('https://') || teamsUrl.startsWith('msteams:'))) {
      if (window.showToast) {
        window.showToast(`Đang mở phòng học trực tuyến MS Teams: ${session.title}...`, 'success');
      }
      window.open(teamsUrl, '_blank', 'noopener,noreferrer');
    } else {
      // Chưa gán link MS Teams
      if (isAdmin) {
        const confirmEdit = confirm(
          `[Dành cho Quản trị viên]\n\nBuổi học "${session.title}" (${session.dayOfWeekText}, ${this.formatDateStr(session.date)}) hiện CHƯA ĐƯỢC GÁN link MS Teams.\n\nBạn có muốn mở form để dán link MS Teams ngay bây giờ không?`
        );
        if (confirmEdit && typeof onEditCallback === 'function') {
          onEditCallback(session);
        }
      } else {
        if (window.showToast) {
          window.showToast(
            `Buổi học này chưa được mở hoặc chưa gán link MS Teams. Quản trị viên / Trainer sẽ cập nhật trước giờ học!`,
            'info'
          );
        } else {
          alert(`Buổi học "${session.title}" chưa được gán link MS Teams. Quản trị viên sẽ cung cấp link trước khi buổi học bắt đầu.`);
        }
      }
    }
  },

  // ==========================================
  // MODAL CHI TIẾT BUỔI HỌC, LINK HỌC & LINK RECORD
  // ==========================================
  closeSessionDetailModal() {
    const modal = document.getElementById('sessionDetailModal');
    if (modal) {
      modal.classList.remove('open', 'show', 'active');
    }
  },

  openSessionDetailModal(targetSession, options = {}) {
    const modal = document.getElementById('sessionDetailModal');
    const titleEl = document.getElementById('sessionDetailModalTitle');
    const subtitleEl = document.getElementById('sessionDetailModalSubtitle');
    const bodyEl = document.getElementById('sessionDetailModalBody');
    if (!modal || !bodyEl) return;

    const isAdmin = Boolean(options.isAdmin ?? (typeof canManage === 'function' && canManage('schedules:manage')));
    const onEdit = options.onEdit || ((course) => window.openScheduleModal?.(course));
    const isGuest = Boolean(window.state ? !window.state.currentUser : false);

    const dateKey = options.dateKey || (targetSession ? targetSession.date : '');
    const daySessions = Array.isArray(options.daySessions) && options.daySessions.length > 0
      ? options.daySessions
      : (targetSession ? [targetSession] : []);

    let activeIndex = 0;
    if (targetSession && daySessions.length > 0) {
      const foundIdx = daySessions.findIndex(s => (s._id || s.id) === (targetSession._id || targetSession.id));
      if (foundIdx !== -1) activeIndex = foundIdx;
    }

    const renderModalContent = (session, currentIdx) => {
      // Trường hợp ngày không có buổi học
      if (!session) {
        if (titleEl) titleEl.textContent = `Lịch Học Ngày ${this.formatDateStr(dateKey) || 'Đã Chọn'}`;
        if (subtitleEl) subtitleEl.textContent = 'Không có buổi học nào được lên lịch vào ngày này';
        bodyEl.innerHTML = `
          <div class="session-detail-empty-state">
            <div class="empty-icon"><i class="fas fa-calendar-xmark"></i></div>
            <h4>Không có buổi học nào</h4>
            <p>Hiện chưa có buổi đào tạo hoặc chuyên đề nào được lên lịch vào ngày <strong>${escapeHtmlSchedule(this.formatDateStr(dateKey))}</strong>.</p>
            ${isAdmin ? `
              <div class="empty-admin-actions">
                <button type="button" class="btn-primary-portal" id="btnDetailAddSessionToday">
                  <i class="fas fa-plus"></i> <span>Thêm buổi học vào ngày này</span>
                </button>
              </div>
            ` : ''}
          </div>
        `;
        if (isAdmin) {
          bodyEl.querySelector('#btnDetailAddSessionToday')?.addEventListener('click', () => {
            this.closeSessionDetailModal();
            if (typeof onEdit === 'function') {
              onEdit({ date: dateKey });
            } else if (typeof window.openScheduleModal === 'function') {
              window.openScheduleModal({ date: dateKey });
            }
          });
        }
        return;
      }

      const displayTitle = getScheduleDisplayTitle(session, currentIdx, isGuest);
      if (titleEl) titleEl.textContent = displayTitle;
      if (subtitleEl) {
        subtitleEl.textContent = `${session.dayOfWeekText || ''} - Ngày ${this.formatDateStr(session.date)} (${session.startTime} - ${session.endTime})`;
      }

      // Huy hiệu trạng thái
      const statusBadge = session.status === 'live'
        ? `<span class="session-badge status-live"><i class="fas fa-satellite-dish"></i> Đang diễn ra</span>`
        : session.status === 'completed'
          ? `<span class="session-badge status-completed"><i class="fas fa-circle-check"></i> Đã diễn ra</span>`
          : `<span class="session-badge status-upcoming"><i class="fas fa-clock"></i> Sắp diễn ra</span>`;

      const typeBadge = session.type === 'Offline'
        ? `<span class="session-badge badge-offline"><i class="fas fa-location-dot"></i> Trực tiếp (Offline)</span>`
        : `<span class="session-badge badge-online"><i class="fas fa-video"></i> Trực tuyến (MS Teams)</span>`;

      const codeBadge = session.code
        ? `<span class="session-badge badge-code"><i class="fas fa-hashtag"></i> ${escapeHtmlSchedule(session.code)}</span>`
        : '';

      const deptBadge = session.department
        ? `<span class="session-badge badge-dept">${escapeHtmlSchedule(session.department)}</span>`
        : '';

      // Tabs nếu ngày đó có nhiều buổi học
      let tabsHtml = '';
      if (daySessions.length > 1) {
        tabsHtml = `
          <div class="session-detail-tabs">
            ${daySessions.map((s, idx) => `
              <button type="button" class="session-tab-btn ${idx === currentIdx ? 'active' : ''}" data-idx="${idx}">
                <i class="fas fa-chalkboard-user"></i> Buổi ${idx + 1} (${escapeHtmlSchedule(s.startTime)})
              </button>
            `).join('')}
          </div>
        `;
      }

      // Danh sách tài liệu
      let docs = Array.isArray(session.documents) && session.documents.length > 0
        ? session.documents
        : (session.documentUrl ? [{ title: 'Tài liệu buổi học', url: session.documentUrl }] : []);
      docs = docs.filter(d => d && d.url && /^https?:\/\//i.test(String(d.url).trim()));

      const hasTeams = Boolean(session.teamsUrl && String(session.teamsUrl).trim());
      const hasRecord = Boolean(session.recordUrl && String(session.recordUrl).trim());
      const cleanTeamsUrl = hasTeams ? String(session.teamsUrl).trim() : '';
      const cleanRecordUrl = hasRecord ? String(session.recordUrl).trim() : '';

      bodyEl.innerHTML = `
        ${tabsHtml}
        
        <div class="session-detail-meta-card">
          <div class="session-detail-badges-row">
            ${codeBadge}
            ${deptBadge}
            ${typeBadge}
            ${statusBadge}
          </div>
          <h3 class="session-detail-heading">${escapeHtmlSchedule(displayTitle)}</h3>
          
          <div class="session-detail-grid">
            <div class="meta-item">
              <span class="meta-label"><i class="fas fa-calendar-day"></i> Thời gian:</span>
              <span class="meta-val"><strong>${escapeHtmlSchedule(session.startTime)} – ${escapeHtmlSchedule(session.endTime)}</strong> (${escapeHtmlSchedule(session.periods || 'Tiết 1 - 4')})</span>
            </div>
            <div class="meta-item">
              <span class="meta-label"><i class="fas fa-user-tie"></i> Giảng viên / Mentor:</span>
              <span class="meta-val">${isGuest ? '<span class="text-muted">Đăng nhập để xem</span>' : `<strong>${escapeHtmlSchedule(session.instructor || 'TS. Dương Việt Hằng')}</strong>`}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label"><i class="fas fa-location-dot"></i> Hình thức / Phòng:</span>
              <span class="meta-val">${session.type === 'Offline' ? `<strong class="text-warning">${escapeHtmlSchedule(session.room && session.room !== 'MS Teams Trực Tuyến' ? session.room : 'Phòng học trực tiếp')}</strong>` : 'MS Teams Trực Tuyến'}</span>
            </div>
            ${session.note ? `
              <div class="meta-item meta-full-width">
                <span class="meta-label"><i class="fas fa-circle-info"></i> Ghi chú:</span>
                <span class="meta-val note-text">${escapeHtmlSchedule(session.note)}</span>
              </div>
            ` : ''}
          </div>

          ${docs.length > 0 ? `
            <div class="session-detail-docs-block">
              <span class="meta-label"><i class="fas fa-folder-open"></i> Tài liệu đính kèm:</span>
              <div class="detail-docs-list">
                ${docs.map(d => `
                  <a href="${escapeHtmlSchedule(sanitizeUrlSchedule(d.url))}" target="_blank" rel="noopener noreferrer" class="detail-doc-chip" title="${escapeHtmlSchedule(d.title)}">
                    <i class="fas fa-file-arrow-down"></i> <span>${escapeHtmlSchedule(d.title || 'Tài liệu')}</span>
                  </a>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>

        <!-- LINK VÀO HỌC (MS TEAMS) -->
        <div class="session-link-card teams-link-box ${hasTeams ? 'is-ready' : 'is-empty'}">
          <div class="session-link-header">
            <div class="link-header-left">
              <div class="link-icon-badge teams-badge-icon">
                <i class="fas fa-video"></i>
              </div>
              <div>
                <h4 class="link-card-title">Đường Dẫn Vào Phòng Học (MS Teams)</h4>
                <p class="link-card-sub">${hasTeams ? 'Phòng học trực tuyến chính thức qua Microsoft Teams' : 'Chưa được gán đường link phòng học'}</p>
              </div>
            </div>
            ${hasTeams ? `
              <div class="link-header-actions">
                <a href="${escapeHtmlSchedule(sanitizeUrlSchedule(cleanTeamsUrl))}" target="_blank" rel="noopener noreferrer" class="btn-quick-access btn-join-teams" title="Mở phòng học trong tab mới">
                  <i class="fas fa-arrow-up-right-from-square"></i> <span>Vào học ngay</span>
                </a>
                <button type="button" class="btn-copy-url" data-url="${escapeHtmlSchedule(cleanTeamsUrl)}" data-label="link vào học MS Teams" title="Sao chép liên kết vào bộ nhớ tạm">
                  <i class="fas fa-copy"></i>
                </button>
              </div>
            ` : ''}
          </div>
          ${hasTeams ? `
            <div class="session-url-container">
              <span class="url-label">URL:</span>
              <a href="${escapeHtmlSchedule(sanitizeUrlSchedule(cleanTeamsUrl))}" target="_blank" rel="noopener noreferrer" class="session-url-text">${escapeHtmlSchedule(cleanTeamsUrl)}</a>
            </div>
          ` : `
            <div class="session-empty-link-notice">
              <i class="fas fa-clock-rotate-left"></i>
              <span>Quản trị viên / Trainer sẽ cập nhật đường link phòng học MS Teams trước giờ diễn ra buổi học.</span>
            </div>
          `}
        </div>

        <!-- LINK RECORD BUỔI HỌC (VIDEO GHI HÌNH) -->
        <div class="session-link-card record-link-box ${hasRecord ? 'is-ready' : 'is-empty'}">
          <div class="session-link-header">
            <div class="link-header-left">
              <div class="link-icon-badge record-badge-icon">
                <i class="fas fa-circle-play"></i>
              </div>
              <div>
                <h4 class="link-card-title">Video Record Buổi Học (Ghi Hình)</h4>
                <p class="link-card-sub">${hasRecord ? 'Xem lại toàn bộ video bài giảng và nội dung thảo luận' : 'Chưa có video record cho buổi học này'}</p>
              </div>
            </div>
            ${hasRecord ? `
              <div class="link-header-actions">
                <a href="${escapeHtmlSchedule(sanitizeUrlSchedule(cleanRecordUrl))}" target="_blank" rel="noopener noreferrer" class="btn-quick-access btn-watch-record" title="Xem video ghi hình trong tab mới">
                  <i class="fas fa-play"></i> <span>Xem Record</span>
                </a>
                <button type="button" class="btn-copy-url" data-url="${escapeHtmlSchedule(cleanRecordUrl)}" data-label="link video record" title="Sao chép liên kết vào bộ nhớ tạm">
                  <i class="fas fa-copy"></i>
                </button>
              </div>
            ` : ''}
          </div>
          ${hasRecord ? `
            <div class="session-url-container">
              <span class="url-label">URL:</span>
              <a href="${escapeHtmlSchedule(sanitizeUrlSchedule(cleanRecordUrl))}" target="_blank" rel="noopener noreferrer" class="session-url-text">${escapeHtmlSchedule(cleanRecordUrl)}</a>
            </div>
          ` : `
            <div class="session-empty-link-notice">
              <i class="fas fa-film"></i>
              <span>Video record bài giảng sẽ được cập nhật tại đây sau khi buổi học kết thúc để Trainee tiện ôn tập hoặc học bù.</span>
            </div>
          `}
        </div>

        <!-- DÀNH CHO ADMIN: CHỈNH SỬA NHANH ĐƯỜNG DẪN -->
        ${isAdmin ? `
          <div class="session-admin-quick-edit">
            <div class="admin-quick-edit-top">
              <div class="admin-quick-title-wrap">
                <span class="admin-pill-badge"><i class="fas fa-shield-halved"></i> Quản trị viên</span>
                <h4 class="admin-quick-heading">Chỉnh sửa liên kết buổi học</h4>
              </div>
              <button type="button" class="btn-text-action btn-full-edit-open" title="Mở form chỉnh sửa đầy đủ thông tin">
                <i class="fas fa-pen-to-square"></i> <span>Sửa đầy đủ</span>
              </button>
            </div>
            
            <form class="admin-quick-links-form" id="adminQuickLinksForm">
              <div class="admin-input-group">
                <label for="quickInputTeamsUrl" class="admin-input-label">
                  <i class="fas fa-video text-primary"></i> <span>Đường dẫn MS Teams (Link vào học)</span>
                </label>
                <div class="admin-input-with-icon">
                  <input type="url" id="quickInputTeamsUrl" class="form-input" value="${escapeHtmlSchedule(session.teamsUrl || '')}" placeholder="https://teams.microsoft.com/...">
                </div>
              </div>

              <div class="admin-input-group">
                <label for="quickInputRecordUrl" class="admin-input-label">
                  <i class="fas fa-circle-play text-danger"></i> <span>Đường dẫn Video Record (Ghi hình)</span>
                </label>
                <div class="admin-input-with-icon">
                  <input type="url" id="quickInputRecordUrl" class="form-input" value="${escapeHtmlSchedule(session.recordUrl || '')}" placeholder="https://drive.google.com/... hoặc link Stream, YouTube...">
                </div>
              </div>

              <div class="admin-quick-footer">
                <button type="submit" class="btn-primary-portal btn-save-quick-links" id="btnSaveQuickLinks">
                  <i class="fas fa-floppy-disk"></i> <span>Lưu thay đổi liên kết</span>
                </button>
              </div>
            </form>
          </div>
        ` : ''}
      `;

      // 1. Gắn sự kiện chuyển tab
      bodyEl.querySelectorAll('.session-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.getAttribute('data-idx'), 10);
          if (!isNaN(idx) && daySessions[idx]) {
            renderModalContent(daySessions[idx], idx);
          }
        });
      });

      // 2. Gắn sự kiện sao chép liên kết
      bodyEl.querySelectorAll('.btn-copy-url').forEach(btn => {
        btn.addEventListener('click', async () => {
          const url = btn.getAttribute('data-url');
          const label = btn.getAttribute('data-label') || 'liên kết';
          if (!url) return;
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(url);
            } else {
              const ta = document.createElement('textarea');
              ta.value = url;
              document.body.appendChild(ta);
              ta.select();
              document.execCommand('copy');
              ta.remove();
            }
            window.showToast?.(`Đã sao chép ${label}!`, 'success');
          } catch (e) {
            window.showToast?.('Không thể tự động sao chép liên kết.', 'danger');
          }
        });
      });

      // 3. Xử lý Admin lưu link nhanh và sửa đầy đủ
      if (isAdmin) {
        const quickForm = bodyEl.querySelector('#adminQuickLinksForm');
        const fullEditBtn = bodyEl.querySelector('.btn-full-edit-open');

        if (fullEditBtn) {
          fullEditBtn.addEventListener('click', () => {
            this.closeSessionDetailModal();
            if (typeof onEdit === 'function') {
              onEdit(session);
            } else if (typeof window.openScheduleModal === 'function') {
              window.openScheduleModal(session);
            }
          });
        }

        if (quickForm) {
          quickForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btnSave = quickForm.querySelector('#btnSaveQuickLinks');
            const teamsInp = quickForm.querySelector('#quickInputTeamsUrl');
            const recordInp = quickForm.querySelector('#quickInputRecordUrl');

            const newTeamsUrl = (teamsInp?.value || '').trim();
            const newRecordUrl = (recordInp?.value || '').trim();

            if (btnSave) {
              btnSave.disabled = true;
              btnSave.innerHTML = `<i class="fas fa-spinner fa-spin"></i> <span>Đang lưu...</span>`;
            }

            try {
              const updatedData = {
                ...session,
                teamsUrl: newTeamsUrl,
                recordUrl: newRecordUrl
              };
              const saved = await this.saveSchedule(updatedData);
              if (saved) {
                session.teamsUrl = saved.teamsUrl ?? newTeamsUrl;
                session.recordUrl = saved.recordUrl ?? newRecordUrl;
                daySessions[currentIdx] = session;

                window.showToast?.('Đã cập nhật link vào học và link record thành công!', 'success');
                renderModalContent(session, currentIdx);

                if (typeof window.renderScheduleView === 'function') window.renderScheduleView(false);
                if (typeof window.renderSchedule === 'function') window.renderSchedule();
                if (typeof window.renderAdminScheduleTable === 'function') window.renderAdminScheduleTable();
              }
            } catch (err) {
              console.error('Lỗi khi lưu link nhanh:', err);
              window.showToast?.('Có lỗi xảy ra khi lưu liên kết.', 'danger');
              if (btnSave) {
                btnSave.disabled = false;
                btnSave.innerHTML = `<i class="fas fa-floppy-disk"></i> <span>Lưu thay đổi liên kết</span>`;
              }
            }
          });
        }
      }
    };

    renderModalContent(daySessions[activeIndex] || null, activeIndex);
    modal.classList.add('open', 'show', 'active');
  },

  // ==========================================
  // XUẤT DỮ LIỆU: EXCEL / CSV, PDF, ICAL
  // ==========================================

  // Xuất file Excel / CSV đầy đủ lịch tháng
  exportToExcel(month = this.selectedMonth, year = this.selectedYear) {
    const items = this.cachedSchedules.map(item => getScheduleTiming(item, Date.now() + this.clockOffset)).filter(s => Number(s.month) === Number(month) && Number(s.year) === Number(year));
    if (items.length === 0) {
      if (window.showToast) window.showToast('Không có buổi học nào trong tháng này để xuất file!', 'info');
      return;
    }

    // Tiêu đề cột
    const headers = ['STT', 'Mã Buổi Học', 'Tên Buổi Học / Chuyên Đề', 'Ngày Học', 'Thứ', 'Giờ Học', 'Hình Thức', 'Trainer', 'Link MS Teams', 'Trạng Thái', 'Ghi Chú'];
    const isGuest = Boolean(window.state ? !window.state.currentUser : false);

    const rows = items.map((item, idx) => [
      idx + 1,
      `"${item.code || ''}"`,
      `"${(getScheduleDisplayTitle(item, idx, isGuest) || '').replace(/"/g, '""')}"`,
      `"${this.formatDateStr(item.date)}"`,
      `"${item.dayOfWeekText || ''}"`,
      `"${item.startTime} - ${item.endTime}"`,
      `"${item.type || 'Online'}"`,
      `"${(getScheduleDisplayTrainer(item, isGuest) || '').replace(/"/g, '""')}"`,
      `"${(item.teamsUrl || 'Chưa gán link').replace(/"/g, '""')}"`,
      `"${item.status === 'live' ? 'Đang diễn ra' : item.status === 'completed' ? 'Đã diễn ra' : 'Sắp diễn ra'}"`,
      `"${(item.note || '').replace(/"/g, '""')}"`
    ]);

    // Thêm BOM \uFEFF để Excel mở đúng tiếng Việt có dấu
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Lich_Hoc_Trainee_Program_Thang_${month}_${year}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    if (window.showToast) {
      window.showToast(`Đã tải xuống danh sách lịch học Tháng ${month}/${year} dạng Excel/CSV thành công!`, 'success');
    }
  },

  // Xuất file lịch chuẩn iCal (.ics) để thêm vào Google Calendar / Apple Calendar / Outlook
  exportToIcal(month = this.selectedMonth, year = this.selectedYear) {
    const items = this.cachedSchedules.map(item => getScheduleTiming(item, Date.now() + this.clockOffset)).filter(s => Number(s.month) === Number(month) && Number(s.year) === Number(year));
    if (items.length === 0) {
      if (window.showToast) window.showToast('Không có buổi học nào để xuất file lịch!', 'info');
      return;
    }

    let icsData = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//UIT Trainee Program//Monthly Schedule//VI',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Lịch Học Trainee Program UIT'
    ];

    const isGuest = Boolean(window.state ? !window.state.currentUser : false);

    items.forEach((item, idx) => {
      if (item.status === 'unknown') return;
      const cleanDate = (item.date || '').replace(/-/g, '');
      const startH = (item.startTime || '19:30').replace(':', '') + '00';
      const endH = (item.endTime || '21:30').replace(':', '') + '00';
      const dtStart = new Date(`${item.date}T${item.startTime}:00+07:00`).toISOString().replace(/[-:]/g, '').replace('.000', '');
      const dtEnd = new Date(`${item.date}T${item.endTime}:00+07:00`).toISOString().replace(/[-:]/g, '').replace('.000', '');

      icsData.push('BEGIN:VEVENT');
      icsData.push(`UID:trainee-${item._id || item.id || idx}@uit.edu.vn`);
      icsData.push(`DTSTAMP:${cleanDate}T000000Z`);
      icsData.push(`DTSTART:${dtStart}`);
      icsData.push(`DTEND:${dtEnd}`);
      icsData.push(`SUMMARY:${getScheduleDisplayTitle(item, idx, isGuest)}`);
      icsData.push(`LOCATION:${item.teamsUrl ? item.teamsUrl : item.room || 'Chưa có địa điểm'}`);
      icsData.push(`DESCRIPTION:Trainer: ${getScheduleDisplayTrainer(item, isGuest)}\\nLink MS Teams: ${item.teamsUrl || 'Chưa gán link'}\\nGhi chú: ${item.note || ''}`);
      icsData.push(item.isTentative ? 'STATUS:TENTATIVE' : 'STATUS:CONFIRMED');
      icsData.push('END:VEVENT');
    });

    icsData.push('END:VCALENDAR');

    const blob = new Blob([icsData.join('\r\n')], { type: 'text/calendar;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Lich_Hoc_Thang_${month}_${year}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    if (window.showToast) {
      window.showToast(`Đã xuất file lịch iCal (.ics)! Bạn có thể mở file này để thêm tự động vào Google Calendar hoặc Outlook.`, 'success');
    }
  },

  // In / Xuất PDF lịch học
  printSchedule(month = this.selectedMonth, year = this.selectedYear) {
    const items = this.cachedSchedules
      .map(item => getScheduleTiming(item, Date.now() + this.clockOffset))
      .filter(s => Number(s.month) === Number(month) && Number(s.year) === Number(year))
      .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
    if (items.length === 0) {
      if (window.showToast) window.showToast('Không có buổi học nào trong tháng này để in!', 'info');
      return;
    }
    const isGuest = Boolean(window.state ? !window.state.currentUser : false);
    const statusLabel = status => status === 'live' ? 'Đang diễn ra' : status === 'completed' ? 'Đã diễn ra' : 'Sắp diễn ra';
    window.printTable({
      title: `Thời khóa biểu tháng ${month}/${year}`,
      subtitle: 'Lịch học Trainee Program',
      meta: [`Tổng số buổi: ${items.length}`, `Học online: ${items.filter(item => item.type !== 'Offline').length}`, 'Giờ học theo múi giờ Việt Nam (UTC+7)'],
      landscape: true,
      columns: [
        { label: 'STT', align: 'center' }, { label: 'Mã buổi' }, { label: 'Ngày', align: 'center' }, { label: 'Thứ', align: 'center' },
        { label: 'Giờ học', align: 'center' }, { label: 'Chuyên đề' }, { label: 'Trainer' },
        { label: 'Hình thức', align: 'center' }, { label: 'Trạng thái', align: 'center' }, { label: 'Ghi chú' }
      ],
      rows: items.map((item, idx) => [
        idx + 1, item.code || '', this.formatDateStr(item.date), item.dayOfWeekText || '',
        `${item.startTime} - ${item.endTime}`, getScheduleDisplayTitle(item, idx, isGuest) || '',
        isGuest ? '—' : getScheduleDisplayTrainer(item, isGuest), item.type || 'Online', statusLabel(item.status), item.note || ''
      ])
    });
  },

  // ==========================================
  // RENDER GIAO DIỆN LỊCH HỌC CHUNG THEO THÁNG
  // ==========================================

  renderMonthlySummary(items) {
    const summaryTarget = document.getElementById('scheduleMonthSummary');
    if (!summaryTarget) return;

    summaryTarget.innerHTML = `
      <div class="monthly-summary-banner">
        <div class="summary-banner-info">
          <div class="summary-banner-badge">
            <span class="pulse-dot"></span>
            <span>LỊCH HỌC TRỰC TUYẾN CHUNG TOÀN THÁNG</span>
          </div>
          <h3 class="summary-banner-title">Thời Khóa Biểu Tháng ${this.selectedMonth} Năm ${this.selectedYear}</h3>
          <p class="summary-banner-desc">
            Toàn bộ các buổi học lý thuyết, thực hành và chuyên đề đào tạo trong Tháng ${this.selectedMonth} được tổng hợp trong danh sách dưới đây.
            Trainee nhấn nút <strong>"Vào học"</strong> để tham gia phòng học trực tuyến Microsoft Teams.
          </p>
          <p class="summary-banner-desc summary-banner-desc-mobile">
            Xem các buổi học trong tháng và tham gia phòng học Microsoft Teams.
          </p>
        </div>

        <div class="summary-banner-stats">
          <div class="summary-stat-box">
            <span class="stat-number">${items.length}</span>
            <span class="stat-text">Tổng số buổi</span>
          </div>
          <div class="summary-stat-box highlight-online">
            <span class="stat-number">${items.length ? Math.round(items.filter(item => item.type !== 'Offline').length / items.length * 100) : 0}%</span>
            <span class="stat-text">Học Online</span>
          </div>
          <div class="summary-stat-box">
            <span class="stat-number">${items.filter(item => item.teamsUrl).length}/${items.length}</span>
            <span class="stat-text">Đã có link Teams</span>
          </div>
        </div>
      </div>
    `;
  },

  // 1. Chế độ Danh sách tháng ("để hết trong 1 lần" theo yêu cầu)
  renderMonthlyAgenda(container, options = {}) {
    if (!container) return;
    const { isAdmin = false, onEdit, onDelete, onAddNew, onReset } = options;
    const items = this.cachedSchedules.map(item => getScheduleTiming(item, Date.now() + this.clockOffset)).sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    container.innerHTML = '';
    this.renderMonthlySummary(items);

    // Thanh công cụ Action: Tải xuống cho mọi user & Thêm/Reset cho Admin
    const actionToolbar = document.createElement('div');
    actionToolbar.className = 'schedule-month-toolbar';
    actionToolbar.innerHTML = `
      <div class="toolbar-right">
        <!-- Nút Download dành cho tất cả người dùng -->
        <button type="button" class="btn btn-outline btn-sm btn-download-excel" id="btnExportExcel" title="Tải toàn bộ lịch học tháng dạng file Excel/CSV">

          <span>Tải Excel</span>
        </button>

        <button type="button" class="btn btn-outline btn-sm btn-download-ical" id="btnExportIcal" title="Tải file lịch .ics để thêm vào Google Calendar / Outlook">

          <span>Google Calendar</span>
        </button>

        <button type="button" class="btn btn-outline btn-sm btn-download-pdf" id="btnPrintSchedule" title="In hoặc lưu file PDF lịch học">

          <span>In / PDF</span>
        </button>

        <!-- Nút Quản trị CHỈ HIỂN THỊ KHI LÀ ADMIN -->
        ${isAdmin ? `
          <button type="button" class="btn btn-primary btn-sm btn-admin-add-session" id="btnAddSessionBtn">

            <span>+ Tạo buổi học mới</span>
          </button>
          <button type="button" class="btn btn-danger-soft btn-sm btn-admin-reset-schedule" id="btnResetMonthSchedule" title="Xóa toàn bộ hoặc làm mới lịch tháng">
            <span>Đặt lại lịch</span>
          </button>
        ` : ''}
      </div>
    `;

    // Gắn sự kiện các nút download
    actionToolbar.querySelector('#btnExportExcel').addEventListener('click', () => this.exportToExcel());
    actionToolbar.querySelector('#btnExportIcal').addEventListener('click', () => this.exportToIcal());
    actionToolbar.querySelector('#btnPrintSchedule').addEventListener('click', () => this.printSchedule());

    if (isAdmin) {
      const addBtn = actionToolbar.querySelector('#btnAddSessionBtn');
      if (addBtn && typeof onAddNew === 'function') {
        addBtn.addEventListener('click', onAddNew);
      }
      const resetBtn = actionToolbar.querySelector('#btnResetMonthSchedule');
      if (resetBtn && typeof onReset === 'function') {
        resetBtn.addEventListener('click', onReset);
      }
    }

    container.appendChild(actionToolbar);

    // Danh sách các buổi học
    if (items.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'schedule-empty-state';
      emptyDiv.innerHTML = `

        <h3>Chưa có buổi học nào trong Tháng ${this.selectedMonth}/${this.selectedYear}</h3>
        <p>Lịch học hiện đang được cập nhật. Vui lòng quay lại sau!</p>
        ${isAdmin ? `<button type="button" class="btn btn-primary" id="btnEmptyAdd">Tạo buổi học đầu tiên</button>` : ''}
      `;
      if (isAdmin && typeof onAddNew === 'function') {
        const btnEmptyAdd = emptyDiv.querySelector('#btnEmptyAdd');
        if (btnEmptyAdd) btnEmptyAdd.addEventListener('click', onAddNew);
      }
      container.appendChild(emptyDiv);
      return;
    }

    const listContainer = document.createElement('div');
    listContainer.className = 'monthly-sessions-list';

    items.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = `month-session-card ${item.status === 'live' ? 'status-live' : ''}`;

      const parts = (item.date || '2026-10-01').split('-');
      const dayNum = parts[2] || '01';
      const monthNum = parts[1] || '10';

      const hasTeamsLink = Boolean(item.teamsUrl && item.teamsUrl.trim());
      
      // Xử lý danh sách tài liệu buổi học
      let docs = Array.isArray(item.documents) && item.documents.length > 0
        ? item.documents
        : (/^https?:\/\//i.test(item.documentUrl || '') ? [{ title: 'Tài liệu buổi học', url: item.documentUrl }] : []);
      docs = docs.filter(d => d && d.url && /^https?:\/\//i.test(String(d.url).trim()));

      let docsHtml = '';
      if (docs.length > 0) {
        docsHtml = `
          <div class="session-documents-group">
            ${docs.map(doc => `
              <a class="session-document-link" href="${escapeHtmlSchedule(sanitizeUrlSchedule(doc.url))}" target="_blank" rel="noopener noreferrer" title="Mở tài liệu: ${escapeHtmlSchedule(doc.title || 'Tài liệu')}">
                <i class="fas fa-file-lines"></i>
                <span>${escapeHtmlSchedule(doc.title || 'Tài liệu')}</span>
              </a>
            `).join('')}
          </div>
        `;
      }

      // Xác định Ban tổ chức buổi học (ưu tiên trường department, fallback theo title / note)
      let dept = (item.department || '').trim();
      if (!dept) {
        const combined = `${item.title || ''} ${item.note || ''}`;
        if (/hệ\s*thống/i.test(combined)) dept = 'Hệ thống';
        else if (/truyền\s*thông|sự\s*kiện|canva/i.test(combined)) dept = 'Truyền thông - Sự kiện';
      }

      // Làm sạch ghi chú: chỉ giữ lại nội dung nhắc nhở cần chuẩn bị, bỏ tiền tố Ban
      let cleanedNote = (item.note || '')
        .replace(/^(\s*\[?\s*BAN\s*HỆ\s*THỐNG\s*\]?\s*[:\-–—]?\s*)/i, '')
        .replace(/^(\s*\[?\s*HỆ\s*THỐNG\s*\]?\s*[:\-–—]?\s*)/i, '')
        .replace(/^(\s*\[?\s*BAN\s*TRUYỀN\s*THÔNG\s*(-|–|—)?\s*(SỰ\s*KIỆN)?\s*\]?\s*[:\-–—]?\s*)/i, '')
        .replace(/^(\s*\[?\s*TRUYỀN\s*THÔNG\s*(-|–|—)?\s*(SỰ\s*KIỆN)?\s*\]?\s*[:\-–—]?\s*)/i, '')
        .trim();

      // Tag Ban phụ trách
      let deptTagHtml = '';
      if (dept === 'Hệ thống') {
        deptTagHtml = '<span class="badge-tag badge-ban-hethong"><i class="fas fa-server"></i> Ban Hệ thống</span>';
      } else if (dept === 'Truyền thông - Sự kiện') {
        deptTagHtml = '<span class="badge-tag badge-ban-ttsk"><i class="fas fa-bullhorn"></i> Ban TT - Sự kiện</span>';
      } else if (dept) {
        deptTagHtml = `<span class="badge-tag badge-ban-hethong">${escapeHtmlSchedule(dept)}</span>`;
      }

      // Tag hình thức học
      const isOffline = item.type === 'Offline';
      const modeTagHtml = `<span class="badge-tag ${isOffline ? 'chip-offline' : 'chip-online'}">${isOffline ? 'Học trực tiếp' : 'Học trực tuyến'}</span>`;

      // Tag link MS Teams (chỉ hiển thị khi đã có link)
      const teamsTagHtml = hasTeamsLink
        ? '<span class="badge-tag chip-teams-link"><i class="fas fa-video"></i> Đã có link Teams</span>'
        : '';

      // Tag trạng thái buổi học (khớp 100% chú thích)
      const isCompleted = item.status === 'completed';
      const statusTagHtml = item.status === 'tentative'
        ? '<span class="badge-tag chip-upcoming">Lịch dự kiến</span>'
        : item.status === 'live'
        ? '<span class="badge-tag chip-live live-pulsing-badge"><i class="fas fa-circle-dot"></i> ĐANG DIỄN RA</span>'
        : isCompleted
        ? '<span class="badge-tag chip-completed">Đã diễn ra</span>'
        : '<span class="badge-tag chip-upcoming">Sắp diễn ra</span>';

      // Trạng thái nút Vào học (Vô hiệu hóa khi buổi học đã diễn ra)
      let joinBtnText = 'Vào học';
      let joinBtnClass = hasTeamsLink ? 'btn-teams-ready' : 'btn-teams-waiting';
      let joinBtnDisabled = '';

      if (isCompleted) {
        joinBtnText = 'Đã kết thúc';
        joinBtnClass = 'btn-teams-completed';
        joinBtnDisabled = 'disabled aria-disabled="true"';
      } else if (item.isTentative) {
        joinBtnText = 'Chờ chốt lịch';
        joinBtnClass = 'btn-teams-waiting';
      } else if (item.type === 'Offline') {
        joinBtnText = 'Xem địa điểm';
        joinBtnClass = 'btn-teams-ready';
      }

      const isGuest = Boolean(window.state ? !window.state.currentUser : false);
      const sessionTitle = getScheduleDisplayTitle(item, index, isGuest);

      card.innerHTML = `
        <div class="session-card-left">
          <div class="session-date-box ${item.status === 'live' ? 'is-live-date' : ''}">
            <span class="date-day">${dayNum}</span>
            <span class="date-month">Tháng ${monthNum}</span>
            <span class="date-dow">${item.dayOfWeekText || 'Thứ 3'}</span>
          </div>
        </div>

        <div class="session-card-body">
          <div class="session-badges-row">
            <span class="session-code-tag">${escapeHtmlSchedule(item.code || `TP-M10.${String(index + 1).padStart(2, '0')}`)}</span>
            ${deptTagHtml}
            ${modeTagHtml}
            ${teamsTagHtml}
            ${statusTagHtml}
          </div>

          <h4 class="session-title">${escapeHtmlSchedule(sessionTitle)}</h4>
          ${docsHtml}

          <div class="session-details-row">
            <span class="detail-item">
              <strong>${escapeHtmlSchedule(item.startTime)} – ${escapeHtmlSchedule(item.endTime)}</strong> (${escapeHtmlSchedule(item.periods || 'Tiết 1 - 4')})
            </span>

            <span class="detail-item">
              Trainer: ${isGuest
                ? `<span style="color: var(--text-muted); font-style: italic;">Đăng nhập để xem</span>`
                : `<strong>${escapeHtmlSchedule(item.instructor || 'Trainer')}</strong>`
              }
            </span>

            <span class="detail-item">
              ${isOffline ? `<i class="fas fa-location-dot" style="color: #ef4444; margin-right: 4px;"></i><span style="color: #ef4444; font-weight: 600;">Địa điểm: <strong style="color: #ef4444;">${escapeHtmlSchedule(item.room && item.room !== 'MS Teams Trực Tuyến' ? item.room : 'Phòng học trực tiếp')}</strong></span>` : escapeHtmlSchedule(item.room || 'MS Teams Trực Tuyến')}
            </span>
          </div>

          ${cleanedNote ? `
            <div class="session-note-row">
              <span class="note-label"><i class="fas fa-info-circle"></i></span>
              <span class="note-content">${escapeHtmlSchedule(cleanedNote)}</span>
            </div>
          ` : ''}

          ${!isOffline ? `
            <div class="session-teams-status-row">
              ${hasTeamsLink
                ? `<span class="teams-link-ready">
                    Đã gán link MS Teams: <span class="teams-link-text">${escapeHtmlSchedule(item.teamsUrl)}</span>
                   </span>`
                : `<span class="teams-link-missing">
                    Chưa gán link MS Teams
                   </span>`
              }
            </div>
          ` : ''}
        </div>

        <div class="session-card-actions">
          <!-- NÚT VÀO HỌC (MICROSOFT TEAMS) -->
          <button type="button" class="btn-join-class ${joinBtnClass}" data-id="${item._id || item.id}" ${joinBtnDisabled}>
            <span>${joinBtnText}</span>
          </button>

          <!-- NÚT XEM CHI TIẾT & RECORD -->
          <button type="button" class="btn-session-detail" data-id="${item._id || item.id}" title="Xem link học, video record và thông tin buổi học">
            <i class="fas fa-circle-play"></i> <span>Chi tiết & Record</span>
          </button>

          <!-- NÚT ADMIN: SỬA & XÓA (CHỈ HIỂN THỊ KHI LÀ ADMIN) -->
          ${isAdmin ? `
            <div class="session-admin-controls">
              <button type="button" class="btn-action-icon btn-edit-session" data-id="${item._id || item.id}" title="Sửa thông tin">
                <span>Sửa</span>
              </button>

              <button type="button" class="btn-action-icon text-danger btn-delete-session" data-id="${item._id || item.id}" title="Xóa buổi học này">
                <span>Xóa</span>
              </button>
            </div>
          ` : ''}
        </div>
      `;

      // Gắn sự kiện nút "Vào học"
      const joinBtn = card.querySelector('.btn-join-class');
      if (joinBtn) {
        joinBtn.addEventListener('click', () => {
          if (isCompleted) {
            this.openSessionDetailModal(item, { daySessions: [item], dateKey: item.date, isAdmin, onEdit });
            return;
          }
          this.handleJoinClass(item, isAdmin, onEdit);
        });
      }

      // Gắn sự kiện nút "Chi tiết & Record"
      const detailBtn = card.querySelector('.btn-session-detail');
      if (detailBtn) {
        detailBtn.addEventListener('click', () => {
          this.openSessionDetailModal(item, { daySessions: [item], dateKey: item.date, isAdmin, onEdit });
        });
      }

      // Bấm vào date box để xem chi tiết
      const dateBox = card.querySelector('.session-date-box');
      if (dateBox) {
        dateBox.style.cursor = 'pointer';
        dateBox.title = 'Bấm để xem chi tiết, link học và video record';
        dateBox.addEventListener('click', () => {
          this.openSessionDetailModal(item, { daySessions: [item], dateKey: item.date, isAdmin, onEdit });
        });
      }

      // Gắn sự kiện Admin: Sửa & Xóa
      if (isAdmin) {
        const editBtn = card.querySelector('.btn-edit-session');
        if (editBtn && typeof onEdit === 'function') {
          editBtn.addEventListener('click', () => onEdit(item));
        }

        const deleteBtn = card.querySelector('.btn-delete-session');
        if (deleteBtn && typeof onDelete === 'function') {
          deleteBtn.addEventListener('click', () => onDelete(item));
        }
      }

      listContainer.appendChild(card);
    });

    container.appendChild(listContainer);
  },

  // 2. Chế độ Lưới lịch tháng (Calendar Grid 31 ngày)
  renderMonthlyCalendarGrid(container, options = {}) {
    if (!container) return;
    const { isAdmin = false, onEdit } = options;
    const items = this.cachedSchedules.map(item => getScheduleTiming(item, Date.now() + this.clockOffset));
    const year = this.selectedYear;
    const month = this.selectedMonth;

    container.innerHTML = '';
    this.renderMonthlySummary(items);

    const calCard = document.createElement('div');
    calCard.className = 'month-calendar-card';

    // Số ngày trong tháng
    const daysInMonth = new Date(year, month, 0).getDate();
    // Ngày 1 của tháng là thứ mấy (0: CN, 1: T2, ...)
    const firstDayIndex = new Date(year, month - 1, 1).getDay();
    // Chuyển thứ 2 làm ngày đầu tuần (0: T2 ... 6: CN)
    const startCol = (firstDayIndex === 0) ? 6 : (firstDayIndex - 1);

    const dowHeaders = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

    let gridHtml = `
      <div class="month-cal-header-row">
        ${dowHeaders.map(d => `<div class="month-cal-header-cell">${d}</div>`).join('')}
      </div>
      <div class="month-cal-cells-grid">
    `;

    // Ô trống đầu tháng
    for (let i = 0; i < startCol; i++) {
      gridHtml += `<div class="month-cal-cell is-empty"></div>`;
    }

    // Các ngày trong tháng
    const curDate = getVietnamDateParts(Date.now() + this.clockOffset);
    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const daySessions = items.filter(s => s.date === dateKey);
      const isToday = (day === curDate.day && month === curDate.month && year === curDate.year);

      gridHtml += `
        <div class="month-cal-cell ${isToday ? 'is-today' : ''} ${daySessions.length > 0 ? 'has-sessions' : ''}" data-date="${dateKey}" title="${daySessions.length > 0 ? `Bấm để xem ${daySessions.length} buổi học & link record` : 'Bấm để xem lịch ngày này'}">
          <div class="cal-cell-header">
            <span class="cal-day-num ${isToday ? 'today-pill' : ''}">${day}</span>
            ${daySessions.length > 0 ? `<span class="session-count-dot">${daySessions.length} buổi</span>` : ''}
          </div>
          <div class="cal-cell-events">
            ${daySessions.map((s, sIdx) => {
              const isGuest = Boolean(window.state ? !window.state.currentUser : false);
              const chipTitle = getScheduleDisplayTitle(s, sIdx, isGuest);
              return `
              <div class="cal-event-chip ${s.status === 'live' ? 'event-live' : ''}" data-id="${s._id || s.id}" title="${escapeHtmlSchedule(chipTitle)} - Bấm xem link vào học & video record">
                <div class="cal-chip-time">${escapeHtmlSchedule(s.startTime)}</div>
                <div class="cal-chip-title">${escapeHtmlSchedule(chipTitle)}</div>
                <div class="cal-chip-status">${s.isTentative ? 'Lịch dự kiến' : s.type === 'Offline' ? 'Trực tiếp' : s.teamsUrl ? 'MS Teams' : 'Chưa có link'}</div>
                ${(() => {
                  let calDocs = Array.isArray(s.documents) && s.documents.length > 0 ? s.documents : (s.documentUrl ? [{ title: 'Tài liệu', url: s.documentUrl }] : []);
                  calDocs = calDocs.filter(d => d && d.url && /^https?:\/\//i.test(String(d.url).trim()));
                  if (calDocs.length === 0) return '';
                  return `<div class="cal-chip-docs" style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px;">` +
                    calDocs.map(d => `<a class="session-document-link" style="padding: 2px 6px; font-size: 0.7rem;" href="${escapeHtmlSchedule(sanitizeUrlSchedule(d.url))}" target="_blank" rel="noopener noreferrer" title="${escapeHtmlSchedule(d.title || 'Tài liệu')}"><i class="fas fa-file-lines"></i> ${escapeHtmlSchedule(d.title || 'Tài liệu')}</a>`).join('') +
                    `</div>`;
                })()}
              </div>
            `;}).join('')}
          </div>
        </div>
      `;
    }

    gridHtml += `</div>`;
    calCard.innerHTML = gridHtml;

    // Click vào ô ngày để mở popup chi tiết buổi học & link record
    calCard.querySelectorAll('.month-cal-cell:not(.is-empty)').forEach(cell => {
      cell.addEventListener('click', (e) => {
        if (e.target.closest?.('.session-document-link')) return;
        const dateKey = cell.getAttribute('data-date');
        const daySessions = items.filter(s => s.date === dateKey);
        this.openSessionDetailModal(daySessions.length > 0 ? daySessions[0] : null, {
          daySessions,
          dateKey,
          isAdmin,
          onEdit
        });
      });
    });

    // Click vào chip event để xem chi tiết buổi học cụ thể
    calCard.querySelectorAll('.cal-event-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.target.closest?.('.session-document-link')) return;
        const id = chip.getAttribute('data-id');
        const session = items.find(s => (s._id || s.id) === id);
        if (session) {
          const daySessions = items.filter(s => s.date === session.date);
          this.openSessionDetailModal(session, {
            daySessions,
            dateKey: session.date,
            isAdmin,
            onEdit
          });
        }
      });
    });

    container.appendChild(calCard);
  }
};

window.ScheduleManager = ScheduleManager;
