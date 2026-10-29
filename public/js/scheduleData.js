/**
 * UIT Trainee Portal - Monthly Online Schedule Module (MS Teams)
 * Quản lý lịch học trực tuyến theo tháng cho chương trình Trainee Program UIT.
 * Hỗ trợ gán link Microsoft Teams, xuất dữ liệu Excel/CSV, PDF, Google Calendar (.ics).
 * Phân quyền: Chỉ Admin mới có quyền thêm/sửa/xóa lịch. Sinh viên & khách chỉ xem và download.
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

const DEFAULT_MONTHLY_SCHEDULES = [
  {
    id: 'tp_m10_01',
    title: 'Buổi 1: Khởi động Trainee Program & Tổng quan Hệ thống',
    code: 'TP-M10.01',
    month: 10,
    year: 2026,
    date: '2026-10-06',
    dayOfWeekText: 'Thứ 3',
    startTime: '19:30',
    endTime: '21:30',
    periods: 'Tiết 1 - 4 (Tối)',
    type: 'Online',
    instructor: 'TS. Dương Việt Hằng',
    room: 'MS Teams Trực Tuyến',
    teamsUrl: '', // Chưa gán - để gán sau
    note: 'Cài đặt môi trường Node.js & Git repository. Giới thiệu tổng quan cấu trúc chương trình đào tạo.',
    status: 'completed',
    credits: 3
  },
  {
    id: 'tp_m10_02',
    title: 'Buổi 2: Thiết kế Cơ sở dữ liệu MongoDB Atlas & Mongoose Modeling',
    code: 'TP-M10.02',
    month: 10,
    year: 2026,
    date: '2026-10-13',
    dayOfWeekText: 'Thứ 3',
    startTime: '19:30',
    endTime: '21:30',
    periods: 'Tiết 1 - 4 (Tối)',
    type: 'Online',
    instructor: 'ThS. Dương Phi Long',
    room: 'MS Teams Trực Tuyến',
    teamsUrl: '',
    note: 'Kết nối MongoDB cluster, schema validation và tối ưu chỉ mục index.',
    status: 'completed',
    credits: 3
  },
  {
    id: 'tp_m10_03',
    title: 'Buổi 3: Xây dựng RESTful API, Middleware & Cơ chế Phân quyền',
    code: 'TP-M10.03',
    month: 10,
    year: 2026,
    date: '2026-10-20',
    dayOfWeekText: 'Thứ 3',
    startTime: '19:30',
    endTime: '21:30',
    periods: 'Tiết 1 - 4 (Tối)',
    type: 'Online',
    instructor: 'ThS. Phạm Minh Quân',
    room: 'MS Teams Trực Tuyến',
    teamsUrl: '',
    note: 'Thực hành viết API xác thực, phân quyền Admin & Student.',
    status: 'completed',
    credits: 3
  },
  {
    id: 'tp_m10_04',
    title: 'Buổi 4: Hoàn thiện Giao diện Portal, Tích hợp Thời khóa biểu Trực tuyến',
    code: 'TP-M10.04',
    month: 10,
    year: 2026,
    date: '2026-10-27',
    dayOfWeekText: 'Thứ 3',
    startTime: '19:30',
    endTime: '21:30',
    periods: 'Tiết 1 - 4 (Tối)',
    type: 'Online',
    instructor: 'ThS. Trần Thị Dung',
    room: 'MS Teams Trực Tuyến',
    teamsUrl: '',
    note: 'Đánh giá tiến độ giữa kỳ và kiểm tra tích hợp link MS Teams vào học trực tuyến.',
    status: 'live',
    credits: 3
  },
  {
    id: 'tp_m10_05',
    title: 'Buổi 5: Tối ưu Trải nghiệm, Tải dữ liệu Báo cáo & Đồ án Khóa học',
    code: 'TP-M10.05',
    month: 10,
    year: 2026,
    date: '2026-10-29',
    dayOfWeekText: 'Thứ 5',
    startTime: '19:30',
    endTime: '21:30',
    periods: 'Tiết 1 - 4 (Tối)',
    type: 'Online',
    instructor: 'TS. Dương Việt Hằng',
    room: 'MS Teams Trực Tuyến',
    teamsUrl: '',
    note: 'Hướng dẫn xuất báo cáo Excel, PDF, lịch iCal và nộp đồ án Trainee.',
    status: 'upcoming',
    credits: 3
  }
];

const ScheduleManager = {
  storageKey: 'uit_portal_monthly_schedules_v2',
  selectedMonth: 10,
  selectedYear: 2026,
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
    this.cleanupOldLegacyData();
    this.selectedMonth = Number(month) || 10;
    this.selectedYear = Number(year) || 2026;

    try {
      const response = await fetch(`/api/schedules?month=${this.selectedMonth}&year=${this.selectedYear}`);
      if (response.ok) {
        const result = await response.json();
        if (result.success && Array.isArray(result.data)) {
          this.cachedSchedules = result.data;
          this.saveLocalSchedules(result.data);
          return result.data;
        }
      }
    } catch (err) {
      console.warn('Không thể kết nối API /api/schedules, chuyển sang dùng dữ liệu cục bộ:', err.message);
    }

    // Fallback: dùng localStorage hoặc dữ liệu mặc định
    const local = this.getLocalSchedules(this.selectedMonth, this.selectedYear);
    this.cachedSchedules = local;
    return local;
  },

  getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    try {
      const token = localStorage.getItem('uit_trainee_auth_token');
      if (token) headers['Authorization'] = `Bearer ${token.trim()}`;
    } catch (e) {}
    return headers;
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
      // Fallback cục bộ
      if (id) {
        const idx = this.cachedSchedules.findIndex(s => (s._id || s.id) === id);
        if (idx !== -1) {
          this.cachedSchedules[idx] = { ...this.cachedSchedules[idx], ...itemData };
          resultItem = this.cachedSchedules[idx];
        } else {
          resultItem = { ...itemData, id: id || `tp_${Date.now()}` };
          this.cachedSchedules.push(resultItem);
        }
      } else {
        resultItem = { ...itemData, id: `tp_${Date.now()}` };
        this.cachedSchedules.push(resultItem);
      }
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
      await fetch(`/api/schedules/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders()
      });
    } catch (e) {
      console.warn('Lỗi API khi xóa buổi học:', e.message);
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
      if (res.ok) {
        return await this.fetchSchedules(month, year);
      }
    } catch (e) {
      console.warn('Lỗi API khi reset lịch:', e.message);
    }

    // Fallback cục bộ
    localStorage.removeItem(this.storageKey);
    localStorage.removeItem('uit_portal_schedule_courses_v1');
    this.cachedSchedules = reseed && Number(month) === 10 ? [...DEFAULT_MONTHLY_SCHEDULES] : [];
    this.saveLocalSchedules(this.cachedSchedules);
    return this.cachedSchedules;
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
            `Buổi học này chưa được mở hoặc chưa gán link MS Teams. Quản trị viên / Giảng viên sẽ cập nhật trước giờ học!`,
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
    const items = this.cachedSchedules.filter(s => Number(s.month) === Number(month) && Number(s.year) === Number(year));
    if (items.length === 0) {
      if (window.showToast) window.showToast('Không có buổi học nào trong tháng này để xuất file!', 'info');
      return;
    }

    // Tiêu đề cột
    const headers = ['STT', 'Mã Buổi Học', 'Tên Buổi Học / Chuyên Đề', 'Ngày Học', 'Thứ', 'Giờ Học', 'Hình Thức', 'Giảng Viên / Mentor', 'Link MS Teams', 'Trạng Thái', 'Ghi Chú'];
    
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
      `"${item.status === 'live' ? 'Đang diễn ra' : item.status === 'completed' ? 'Đã hoàn thành' : 'Sắp diễn ra'}"`,
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
    const items = this.cachedSchedules.filter(s => Number(s.month) === Number(month) && Number(s.year) === Number(year));
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
      const cleanDate = (item.date || '').replace(/-/g, '');
      const startH = (item.startTime || '19:30').replace(':', '') + '00';
      const endH = (item.endTime || '21:30').replace(':', '') + '00';
      const dtStart = `${cleanDate}T${startH}`;
      const dtEnd = `${cleanDate}T${endH}`;

      icsData.push('BEGIN:VEVENT');
      icsData.push(`UID:trainee-${item._id || item.id || idx}@uit.edu.vn`);
      icsData.push(`DTSTAMP:${cleanDate}T000000Z`);
      icsData.push(`DTSTART:${dtStart}`);
      icsData.push(`DTEND:${dtEnd}`);
      icsData.push(`SUMMARY:${item.title}`);
      icsData.push(`LOCATION:${item.teamsUrl ? item.teamsUrl : 'MS Teams Trực Tuyến'}`);
      icsData.push(`DESCRIPTION:Giảng viên: ${item.instructor}\\nLink MS Teams: ${item.teamsUrl || 'Chưa gán link'}\\nGhi chú: ${item.note || ''}`);
      icsData.push('STATUS:CONFIRMED');
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
    const items = [...this.cachedSchedules].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

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
          Học viên nhấn nút <strong>"Vào học"</strong> để tham gia phòng học trực tuyến Microsoft Teams.
        </p>
      </div>

      <div class="summary-banner-stats">
        <div class="summary-stat-box">
          <span class="stat-number">${items.length}</span>
          <span class="stat-text">Tổng số buổi</span>
        </div>
        <div class="summary-stat-box highlight-online">
          <span class="stat-number">100%</span>
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
          📅 <strong>Tháng ${this.selectedMonth}/${this.selectedYear}</strong> · ${items.length} buổi học
        </div>
        <div class="schedule-user-permission-note">
          ${isAdmin 
            ? '<span class="badge-role-admin">🛡️ Quản trị viên: Có toàn quyền thêm, sửa và gán link MS Teams</span>' 
            : '<span class="badge-role-user">👁️ Sinh viên / Khách: Được xem lịch và tải xuống dữ liệu</span>'
          }
        </div>
      </div>

      <div class="toolbar-right">
        <!-- Nút Download dành cho tất cả người dùng -->
        <button type="button" class="btn btn-outline btn-sm btn-download-excel" id="btnExportExcel" title="Tải toàn bộ lịch học tháng dạng file Excel/CSV">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          <span>Tải Excel</span>
        </button>

        <button type="button" class="btn btn-outline btn-sm btn-download-ical" id="btnExportIcal" title="Tải file lịch .ics để thêm vào Google Calendar / Outlook">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <span>Google Calendar</span>
        </button>

        <button type="button" class="btn btn-outline btn-sm btn-download-pdf" id="btnPrintSchedule" title="In hoặc lưu file PDF lịch học">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 6 2 18 2 18 9"/>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
            <rect width="12" height="8" x="6" y="14"/>
          </svg>
          <span>In / PDF</span>
        </button>

        <!-- Nút Quản trị CHỈ HIỂN THỊ KHI LÀ ADMIN -->
        ${isAdmin ? `
          <button type="button" class="btn btn-primary btn-sm btn-admin-add-session" id="btnAddSessionBtn">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <span>+ Tạo buổi học mới</span>
          </button>
          <button type="button" class="btn btn-danger-soft btn-sm btn-admin-reset-schedule" id="btnResetMonthSchedule" title="Xóa toàn bộ hoặc làm mới lịch tháng">
            <span>↺ Đặt lại lịch</span>
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
        <div class="empty-icon">📅</div>
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
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
              ${escapeHtmlSchedule(item.type || 'Học Trực Tuyến')}
            </span>
            ${item.status === 'live' 
              ? '<span class="badge-tag live-pulsing-badge">🔴 ĐANG DIỄN RA</span>' 
              : item.status === 'completed'
              ? '<span class="badge-tag completed-badge">✓ Đã hoàn thành</span>'
              : '<span class="badge-tag upcoming-badge">⏳ Sắp diễn ra</span>'
            }
          </div>

          <h4 class="session-title">${escapeHtmlSchedule(item.title)}</h4>

          <div class="session-details-row">
            <span class="detail-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              <strong>${escapeHtmlSchedule(item.startTime)} – ${escapeHtmlSchedule(item.endTime)}</strong> (${escapeHtmlSchedule(item.periods || 'Tiết 1 - 4')})
            </span>

            <span class="detail-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              Giảng viên / Mentor: <strong>${escapeHtmlSchedule(item.instructor || 'UIT Mentor')}</strong>
            </span>

            <span class="detail-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              </svg>
              ${escapeHtmlSchedule(item.room || 'MS Teams Trực Tuyến')}
            </span>
          </div>

          ${item.note ? `
            <div class="session-note-row">
              <span class="note-label">📝 Ghi chú:</span>
              <span class="note-content">${escapeHtmlSchedule(item.note)}</span>
            </div>
          ` : ''}

          <div class="session-teams-status-row">
            ${hasTeamsLink 
              ? `<span class="teams-link-ready">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  Đã gán link MS Teams: <span class="teams-link-text">${escapeHtmlSchedule(item.teamsUrl)}</span>
                 </span>`
              : `<span class="teams-link-missing">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  Chưa gán link MS Teams (Quản trị viên có thể gán sau)
                 </span>`
            }
          </div>
        </div>

        <div class="session-card-actions">
          <!-- NÚT VÀO HỌC (MICROSOFT TEAMS) -->
          <button type="button" class="btn-join-class ${hasTeamsLink ? 'btn-teams-ready' : 'btn-teams-waiting'}" data-id="${item._id || item.id}">
            <svg class="teams-btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="23 7 16 12 23 17 23 7"/>
              <rect width="14" height="14" x="1" y="5" rx="2" ry="2"/>
            </svg>
            <span>Vào học</span>
          </button>

          <!-- NÚT ADMIN: SỬA & XÓA (CHỈ HIỂN THỊ KHI LÀ ADMIN) -->
          ${isAdmin ? `
            <div class="session-admin-controls">
              <button type="button" class="btn-action-icon btn-edit-session" data-id="${item._id || item.id}" title="Sửa thông tin & Gán link MS Teams">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                <span>Sửa / Gán link</span>
              </button>

              <button type="button" class="btn-action-icon text-danger btn-delete-session" data-id="${item._id || item.id}" title="Xóa buổi học này">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
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
    const items = this.cachedSchedules;
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
    const curDate = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const daySessions = items.filter(s => s.date === dateKey);
      const isToday = (day === curDate.getDate() && month === (curDate.getMonth() + 1) && year === curDate.getFullYear());

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
                <div class="cal-chip-status">${s.teamsUrl ? '🎥 MS Teams' : '⏳ Chưa có link'}</div>
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
