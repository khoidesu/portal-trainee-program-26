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

  // Đồng bộ lịch từ Backend API (MongoDB Atlas)
  async fetchSchedules(month = this.selectedMonth, year = this.selectedYear) {
    const requestId = ++this.requestId;
    this.loadState = 'loading';
    try {
      const response = await fetch(`/api/schedules?month=${month}&year=${year}`);
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
    }
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
    if (session.isTentative) {
      window.showToast?.('Buổi này đang dự kiến; Ban Tổ chức sẽ chốt ngày, giờ và địa điểm sau.', 'info');
      return;
    }
    if (session.type === 'Offline') {
      window.showToast?.(session.room || 'Ban Tổ chức chưa cập nhật địa điểm.', 'info');
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

    const rows = items.map((item, idx) => [
      idx + 1,
      `"${item.code || ''}"`,
      `"${(item.title || '').replace(/"/g, '""')}"`,
      `"${this.formatDateStr(item.date)}"`,
      `"${item.dayOfWeekText || ''}"`,
      `"${item.startTime} - ${item.endTime}"`,
      `"${item.type || 'Online'}"`,
      `"${(item.instructor || '').replace(/"/g, '""')}"`,
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
      icsData.push(`SUMMARY:${item.title}`);
      icsData.push(`LOCATION:${item.teamsUrl ? item.teamsUrl : item.room || 'Chưa có địa điểm'}`);
      icsData.push(`DESCRIPTION:Trainer: ${item.instructor}\\nLink MS Teams: ${item.teamsUrl || 'Chưa gán link'}\\nGhi chú: ${item.note || ''}`);
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
  printSchedule() {
    window.print();
  },

  // ==========================================
  // RENDER GIAO DIỆN LỊCH HỌC CHUNG THEO THÁNG
  // ==========================================

  // 1. Chế độ Danh sách tháng ("để hết trong 1 lần" theo yêu cầu)
  renderMonthlyAgenda(container, options = {}) {
    if (!container) return;
    const { isAdmin = false, onEdit, onDelete, onAddNew, onReset } = options;
    const items = this.cachedSchedules.map(item => getScheduleTiming(item, Date.now() + this.clockOffset)).sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    container.innerHTML = '';

    // Khung tổng quan tháng
    const summaryCard = document.createElement('div');
    summaryCard.className = 'monthly-summary-banner';
    summaryCard.innerHTML = `
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
          <span class="stat-number">${items.filter(i => i.teamsUrl).length}/${items.length}</span>
          <span class="stat-text">Đã có link Teams</span>
        </div>
      </div>
    `;
    container.appendChild(summaryCard);

    // Thanh công cụ Action: Tải xuống cho mọi user & Thêm/Reset cho Admin
    const actionToolbar = document.createElement('div');
    actionToolbar.className = 'schedule-month-toolbar';
    actionToolbar.innerHTML = `
      <div class="toolbar-left">
        <div class="month-pill-badge">
           <strong>Tháng ${this.selectedMonth}/${this.selectedYear}</strong> · ${items.length} buổi học
        </div>
        <div class="schedule-user-permission-note">
          ${isAdmin
            ? '<span class="badge-role-admin"> Quản trị viên: Có toàn quyền thêm, sửa và gán link MS Teams</span>'
            : '<span class="badge-role-user"> Được xem lịch và tải xuống dữ liệu</span>'
          }
        </div>
      </div>

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
      const documentUrl = /^https?:\/\//i.test(item.documentUrl || '') ? sanitizeUrlSchedule(item.documentUrl) : '';

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
            <span class="badge-tag session-online-badge">

              ${escapeHtmlSchedule(item.type || 'Học Trực Tuyến')}
            </span>
            ${item.status === 'tentative'
              ? '<span class="badge-tag upcoming-badge">Lịch dự kiến</span>'
              : item.status === 'live'
              ? '<span class="badge-tag live-pulsing-badge"> ĐANG DIỄN RA</span>'
              : item.status === 'completed'
              ? '<span class="badge-tag completed-badge"> Đã diễn ra</span>'
              : '<span class="badge-tag upcoming-badge"> Sắp diễn ra</span>'
            }
          </div>

          <h4 class="session-title">${escapeHtmlSchedule(item.title)}</h4>
          ${documentUrl ? `<a class="teams-link-ready session-document-link" href="${escapeHtmlSchedule(documentUrl)}" target="_blank" rel="noopener noreferrer">Tài liệu buổi học</a>` : ''}

          <div class="session-details-row">
            <span class="detail-item">

              <strong>${escapeHtmlSchedule(item.startTime)} – ${escapeHtmlSchedule(item.endTime)}</strong> (${escapeHtmlSchedule(item.periods || 'Tiết 1 - 4')})
            </span>

            <span class="detail-item">

              Trainer: <strong>${escapeHtmlSchedule(item.instructor || 'Trainer')}</strong>
            </span>

            <span class="detail-item">

              ${escapeHtmlSchedule(item.room || 'MS Teams Trực Tuyến')}
            </span>
          </div>

          ${item.note ? `
            <div class="session-note-row">
              <span class="note-label"> Ghi chú:</span>
              <span class="note-content">${escapeHtmlSchedule(item.note)}</span>
            </div>
          ` : ''}

          <div class="session-teams-status-row">
            ${hasTeamsLink
              ? `<span class="teams-link-ready">

                  Đã gán link MS Teams: <span class="teams-link-text">${escapeHtmlSchedule(item.teamsUrl)}</span>
                 </span>`
              : `<span class="teams-link-missing">

                  Chưa gán link MS Teams (Quản trị viên có thể gán sau)
                 </span>`
            }
          </div>
        </div>

        <div class="session-card-actions">
          <!-- NÚT VÀO HỌC (MICROSOFT TEAMS) -->
          <button type="button" class="btn-join-class ${hasTeamsLink ? 'btn-teams-ready' : 'btn-teams-waiting'}" data-id="${item._id || item.id}">

            <span>${item.isTentative ? 'Chờ chốt lịch' : item.type === 'Offline' ? 'Xem địa điểm' : 'Vào học'}</span>
          </button>

          <!-- NÚT ADMIN: SỬA & XÓA (CHỈ HIỂN THỊ KHI LÀ ADMIN) -->
          ${isAdmin ? `
            <div class="session-admin-controls">
              <button type="button" class="btn-action-icon btn-edit-session" data-id="${item._id || item.id}" title="Sửa thông tin & Gán link MS Teams">

                <span>Sửa / Gán link</span>
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
          this.handleJoinClass(item, isAdmin, onEdit);
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
        <div class="month-cal-cell ${isToday ? 'is-today' : ''} ${daySessions.length > 0 ? 'has-sessions' : ''}" data-date="${dateKey}">
          <div class="cal-cell-header">
            <span class="cal-day-num ${isToday ? 'today-pill' : ''}">${day}</span>
            ${daySessions.length > 0 ? `<span class="session-count-dot">${daySessions.length} buổi</span>` : ''}
          </div>
          <div class="cal-cell-events">
            ${daySessions.map(s => `
              <div class="cal-event-chip ${s.status === 'live' ? 'event-live' : ''}" data-id="${s._id || s.id}" title="${escapeHtmlSchedule(s.title)}">
                <div class="cal-chip-time">${escapeHtmlSchedule(s.startTime)}</div>
                <div class="cal-chip-title">${escapeHtmlSchedule(s.title)}</div>
                <div class="cal-chip-status">${s.isTentative ? 'Lịch dự kiến' : s.type === 'Offline' ? 'Trực tiếp' : s.teamsUrl ? 'MS Teams' : 'Chưa có link'}</div>
                ${/^https?:\/\//i.test(s.documentUrl || '') ? `<a class="teams-link-ready session-document-link" href="${escapeHtmlSchedule(sanitizeUrlSchedule(s.documentUrl))}" target="_blank" rel="noopener noreferrer">Tài liệu buổi học</a>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    gridHtml += `</div>`;
    calCard.innerHTML = gridHtml;

    // Click vào chip event để xem hoặc vào học
    calCard.querySelectorAll('.cal-event-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.target.closest?.('.session-document-link')) return;
        const id = chip.getAttribute('data-id');
        const session = items.find(s => (s._id || s.id) === id);
        if (session) {
          this.handleJoinClass(session, isAdmin, onEdit);
        }
      });
    });

    container.appendChild(calCard);
  }
};

window.ScheduleManager = ScheduleManager;
