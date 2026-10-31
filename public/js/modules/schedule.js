/**
 * ==============================================================================
 * COMPONENT: Schedule Module (Thời Khóa Biểu & Lịch Học Trực Tuyến MS Teams)
 * CHỨC NĂNG CHÍNH: Quản lý xem lịch học theo tháng, chuyển đổi chế độ xem, tải file
 *                  thời khóa biểu và công cụ thêm/sửa/xóa lịch học cho Admin.
 * LIÊN KẾT & PHỤ THUỘC: public/js/modules/core.js, public/js/scheduleData.js
 * NHIỆM VỤ CHI TIẾT:
 *   - initScheduleModule: Khởi động bộ quản lý lịch học ScheduleManager
 *   - Bộ lọc tháng, năm học và chế độ hiển thị (Lịch tháng / Danh sách)
 *   - Tải file Excel thời khóa biểu và đề cương bài học
 *   - Modal thêm / chỉnh sửa thông tin buổi học & link MS Teams (Admin)
 * ==============================================================================
 */

// ==========================================
// ==========================================
// THỜI KHÓA BIỂU & LỊCH HỌC TRỰC TUYẾN THEO THÁNG (MS TEAMS)
// ==========================================

function initScheduleModule() {
  const manager = window.ScheduleManager;
  const monthInput = elements.filterScheduleMonth;
  const syncControls = () => {
    monthInput.value = `${manager.selectedYear}-${String(manager.selectedMonth).padStart(2, '0')}`;
    elements.btnModeAgenda?.setAttribute('aria-pressed', String(manager.viewMode === 'agenda'));
    elements.btnModeCalendar?.setAttribute('aria-pressed', String(manager.viewMode === 'calendar'));
    elements.btnModeAgenda?.classList.toggle('active', manager.viewMode === 'agenda');
    elements.btnModeCalendar?.classList.toggle('active', manager.viewMode === 'calendar');
  };
  try {
    const saved = localStorage.getItem('trainee_schedule_view');
    if (['agenda', 'calendar'].includes(saved)) manager.viewMode = saved;
  } catch (err) {}
  const changeMonth = (month, year) => {
    if (year < 2000 || year > 2100) return;
    manager.selectedMonth = month;
    manager.selectedYear = year;
    syncControls();
    renderScheduleView();
  };
  monthInput?.addEventListener('change', () => {
    if (!monthInput.validity.valid || !/^\d{4}-\d{2}$/.test(monthInput.value)) return;
    const [year, month] = monthInput.value.split('-').map(Number);
    changeMonth(month, year);
  });
  document.getElementById('btnSchedulePrevious')?.addEventListener('click', () => {
    changeMonth(manager.selectedMonth === 1 ? 12 : manager.selectedMonth - 1, manager.selectedYear - (manager.selectedMonth === 1 ? 1 : 0));
  });
  document.getElementById('btnScheduleNext')?.addEventListener('click', () => {
    changeMonth(manager.selectedMonth === 12 ? 1 : manager.selectedMonth + 1, manager.selectedYear + (manager.selectedMonth === 12 ? 1 : 0));
  });
  document.getElementById('btnScheduleToday')?.addEventListener('click', () => {
    const today = getVietnamDateParts(Date.now() + manager.clockOffset);
    changeMonth(today.month, today.year);
  });
  [['agenda', elements.btnModeAgenda], ['calendar', elements.btnModeCalendar]].forEach(([mode, button]) => {
    button?.addEventListener('click', () => {
      manager.viewMode = mode;
      try { localStorage.setItem('trainee_schedule_view', mode); } catch (err) {}
      syncControls();
      renderScheduleView(false);
    });
  });
  elements.scheduleFilterForm?.addEventListener('submit', event => event.preventDefault());
  syncControls();
  setInterval(() => {
    if (!document.hidden && document.getElementById('viewSchedule')?.classList.contains('active')) renderScheduleView(false);
  }, 30000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) renderScheduleView();
  });

  // 3. Nút Download (Dành cho TẤT CẢ người dùng: Trainee, Khách, Admin)
  if (elements.btnDownloadScheduleExcel) {
    elements.btnDownloadScheduleExcel.addEventListener('click', () => {
      if (window.ScheduleManager) window.ScheduleManager.exportToExcel();
    });
  }

  if (elements.btnGoogleCalendar) {
    elements.btnGoogleCalendar.addEventListener('click', () => {
      if (window.ScheduleManager) window.ScheduleManager.exportToIcal();
    });
  }

  if (elements.btnDownloadSyllabus) {
    elements.btnDownloadSyllabus.addEventListener('click', () => {
      if (window.showToast) {
        window.showToast('Đang tổng hợp và tải đề cương chuyên đề đào tạo Trainee Program...', 'success');
      }
    });
  }

  // 4. Mở modal chỉnh sửa / thêm mới buổi học (Chỉ Admin)
  if (elements.btnOpenScheduleEditor) {
    elements.btnOpenScheduleEditor.addEventListener('click', () => {
      const isAdmin = canManage('schedules:manage');
      if (!isAdmin) {
        if (window.showToast) window.showToast('Chỉ Quản trị viên (Admin) mới có quyền tạo buổi học mới!', 'danger');
        return;
      }
      openScheduleModal(null);
    });
  }

  // 5. Admin Schedule Table Buttons inside Admin Dashboard
  if (elements.btnAdminAddSchedule) {
    elements.btnAdminAddSchedule.addEventListener('click', () => {
      openScheduleModal(null);
    });
  }

  if (elements.btnAdminGoSchedule) {
    elements.btnAdminGoSchedule.addEventListener('click', () => {
      switchTab('schedule');
    });
  }

  if (elements.btnAdminResetSchedule) {
    elements.btnAdminResetSchedule.addEventListener('click', handleResetDefaultSchedule);
  }

  // 6. Đóng modal lịch học
  if (elements.closeScheduleModalBtn) {
    elements.closeScheduleModalBtn.addEventListener('click', closeScheduleModal);
  }
  if (elements.cancelScheduleBtn) {
    elements.cancelScheduleBtn.addEventListener('click', closeScheduleModal);
  }
  if (elements.scheduleModal) {
    elements.scheduleModal.addEventListener('click', (e) => {
      if (e.target === elements.scheduleModal) closeScheduleModal();
    });
  }

  // 7. Xử lý lưu buổi học (và lưu link MS Teams)
  if (elements.scheduleCourseForm) {
    elements.scheduleCourseForm.addEventListener('submit', handleSaveCourse);
  }

  // 8. Xóa buổi học
  if (elements.btnDeleteCourse) {
    elements.btnDeleteCourse.addEventListener('click', handleDeleteCourse);
  }

  // 9. Khôi phục / Đặt lại lịch tháng
  if (elements.btnResetDefaultSchedule) {
    elements.btnResetDefaultSchedule.addEventListener('click', handleResetDefaultSchedule);
  }

  // Khởi tạo tải dữ liệu và render view
  renderScheduleView();
}

async function renderScheduleView(fetchData = true) {
  if (!window.ScheduleManager || !elements.scheduleMonthContainer) return;

  const isAdmin = canManage('schedules:manage');

  // Cập nhật hiển thị nút thêm buổi học trên trang lịch
  if (elements.btnOpenScheduleEditor) {
    elements.btnOpenScheduleEditor.style.display = isAdmin ? 'inline-flex' : 'none';
  }

  // Tải dữ liệu lịch học mới nhất (từ MongoDB Atlas hoặc Cache)
  if (fetchData) {
    elements.scheduleMonthContainer.textContent = 'Đang tải lịch học…';
    try {
      const items = await window.ScheduleManager.fetchSchedules(window.ScheduleManager.selectedMonth, window.ScheduleManager.selectedYear);
      if (!items) return;
      renderAdminScheduleTable();
    } catch (err) {
      elements.scheduleMonthContainer.innerHTML = '<div class="schedule-empty-state"><p>Không tải được lịch học. Kiểm tra kết nối và thử lại.</p><button type="button" class="btn btn-outline" id="btnRetrySchedule">Thử lại</button></div>';
      document.getElementById('btnRetrySchedule')?.addEventListener('click', () => renderScheduleView());
      return;
    }
  }

  if (window.ScheduleManager.loadState !== 'ready') return;
  const container = elements.scheduleMonthContainer;
  const viewMode = window.ScheduleManager.viewMode || 'agenda';

  if (viewMode === 'agenda') {
    // Hiển thị toàn bộ các buổi học trong tháng ("để hết trong 1 lần" theo yêu cầu người dùng)
    window.ScheduleManager.renderMonthlyAgenda(container, {
      isAdmin,
      onEdit: (course) => openScheduleModal(course),
      onDelete: (course) => handleDeleteCourse(course),
      onAddNew: () => openScheduleModal(null),
      onReset: () => handleResetDefaultSchedule()
    });
  } else {
    // Hiển thị dạng lưới lịch tháng 31 ngày trực quan
    window.ScheduleManager.renderMonthlyCalendarGrid(container, {
      isAdmin,
      onEdit: (course) => openScheduleModal(course)
    });
  }
}

// Render bảng quản lý lịch học trong trang Quản trị Admin
function renderAdminScheduleTable() {
  if (!elements.adminScheduleTableBody || !window.ScheduleManager) return;
  const items = (window.ScheduleManager.cachedSchedules || []).map(item => getScheduleTiming(item, Date.now() + window.ScheduleManager.clockOffset));

  if (items.length === 0) {
    elements.adminScheduleTableBody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 24px; color: var(--text-muted);">
          Chưa có buổi học nào trong Tháng ${window.ScheduleManager.selectedMonth}/${window.ScheduleManager.selectedYear}. Bấm <strong>"+ Tạo buổi học mới"</strong> để thêm!
        </td>
      </tr>
    `;
    return;
  }

  elements.adminScheduleTableBody.innerHTML = items.map((item, idx) => {
    const hasTeams = Boolean(item.teamsUrl && item.teamsUrl.trim());
    const formattedDate = window.ScheduleManager.formatDateStr(item.date);
    return `
      <tr>
        <td style="text-align: center; font-weight: 700;">${idx + 1}</td>
        <td><strong class="session-code-tag">${escapeHtmlSchedule(item.code || `TP-M${window.ScheduleManager.selectedMonth}.${idx+1}`)}</strong></td>
        <td>
          <div style="font-weight: 700; color: var(--text-main);">${escapeHtmlSchedule(item.title)}</div>
          <div style="font-size: 0.74rem; color: var(--text-muted);">${escapeHtmlSchedule(item.note || 'Chưa có ghi chú')}</div>
        </td>
        <td style="text-align: center;">
          <div style="font-weight: 600;">${formattedDate}</div>
          <div style="font-size: 0.72rem; color: var(--primary-blue);">${escapeHtmlSchedule(item.dayOfWeekText || '')}</div>
        </td>
        <td style="text-align: center; font-size: 0.82rem; font-weight: 600;">
          ${escapeHtmlSchedule(item.startTime)} – ${escapeHtmlSchedule(item.endTime)}
        </td>
        <td>${escapeHtmlSchedule(item.instructor || 'Trainer')}</td>
        <td style="text-align: center;">
          ${hasTeams
            ? `<a href="${escapeHtmlSchedule(sanitizeUrlSchedule(item.teamsUrl))}" target="_blank" class="teams-link-ready" title="${escapeHtmlSchedule(sanitizeUrlSchedule(item.teamsUrl))}"> Đã có link</a>`
            : `<span class="teams-link-missing" title="Chưa có link, bấm Sửa để gán sau"> Chưa gán</span>`
          }
        </td>
        <td style="text-align: center;">
          ${item.status === 'tentative'
            ? '<span class="badge-tag upcoming-badge">Lịch dự kiến</span>'
            : item.status === 'live'
            ? '<span class="badge-tag live-pulsing-badge"> Trực tiếp</span>'
            : item.status === 'completed'
            ? '<span class="badge-tag completed-badge"> Đã diễn ra</span>'
            : '<span class="badge-tag upcoming-badge"> Sắp tới</span>'
          }
        </td>
        <td style="text-align: center;">
          <div class="admin-actions-cell" style="justify-content: center;">
            <button type="button" class="btn-admin-action edit-schedule-btn" data-id="${item._id || item.id}" title="Chỉnh sửa & Gán link MS Teams">
               Sửa
            </button>
            <button type="button" class="btn-admin-action delete-btn delete-schedule-btn" data-id="${item._id || item.id}" title="Xóa buổi học">
               Xóa
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Gắn sự kiện các nút trong bảng Admin
  elements.adminScheduleTableBody.querySelectorAll('.edit-schedule-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      const item = items.find(s => (s._id || s.id) === id);
      if (item) openScheduleModal(item);
    });
  });

  elements.adminScheduleTableBody.querySelectorAll('.delete-schedule-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      handleDeleteCourse(id);
    });
  });
}

// Mở modal thêm mới hoặc chỉnh sửa buổi học
function openScheduleModal(course = null) {
  const isAdmin = canManage('schedules:manage');
  if (!isAdmin) {
    if (window.showToast) {
      window.showToast('Chỉ Quản trị viên (Admin) mới có quyền thêm hoặc chỉnh sửa lịch học!', 'danger');
    }
    return;
  }

  if (!elements.scheduleModal) return;

  document.getElementById('courseTentativeInput').checked = Boolean(course?.isTentative);
  if (course) {
    elements.scheduleModalTitle.textContent = `Chỉnh Sửa Buổi Học & Gán Link MS Teams`;
    elements.courseEditId.value = course._id || course.id;
    if (elements.courseTitleInput) elements.courseTitleInput.value = course.title || '';
    if (elements.courseCodeInput) elements.courseCodeInput.value = course.code || '';
    if (elements.courseDateInput) elements.courseDateInput.value = course.date || `${window.ScheduleManager.selectedYear}-${String(window.ScheduleManager.selectedMonth).padStart(2, '0')}-01`;
    if (elements.courseStartTime) elements.courseStartTime.value = course.startTime || '19:30';
    if (elements.courseEndTime) elements.courseEndTime.value = course.endTime || '21:30';
    if (elements.courseDaySelect) elements.courseDaySelect.value = course.dayOfWeekText || 'Thứ 3';
    if (elements.coursePeriods) elements.coursePeriods.value = course.periods || 'Tiết 1 - 4 (Tối)';
    if (elements.courseStatusSelect) elements.courseStatusSelect.value = course.status || 'upcoming';
    if (elements.courseTypeSelect) elements.courseTypeSelect.value = course.type || 'Online';
    if (elements.courseInstructorInput) elements.courseInstructorInput.value = course.instructor || '';
    if (elements.courseTeamsUrl) elements.courseTeamsUrl.value = course.teamsUrl || '';
    if (elements.courseDocumentUrl) elements.courseDocumentUrl.value = course.documentUrl || '';
    if (elements.courseNoteInput) elements.courseNoteInput.value = course.note || '';

    if (elements.btnDeleteCourse) elements.btnDeleteCourse.style.display = 'inline-block';
  } else {
    elements.scheduleModalTitle.textContent = 'Thêm Buổi Học Trực Tuyến Mới (MS Teams)';
    elements.scheduleCourseForm.reset();
    document.getElementById('courseTentativeInput').checked = false;
    elements.courseEditId.value = '';
    if (elements.courseDateInput) elements.courseDateInput.value = `${window.ScheduleManager.selectedYear}-${String(window.ScheduleManager.selectedMonth).padStart(2, '0')}-01`;
    if (elements.courseStartTime) elements.courseStartTime.value = '19:30';
    if (elements.courseEndTime) elements.courseEndTime.value = '21:30';
    if (elements.courseDaySelect) elements.courseDaySelect.value = 'Thứ 3';
    if (elements.coursePeriods) elements.coursePeriods.value = 'Tiết 1 - 4 (Tối)';
    if (elements.courseStatusSelect) elements.courseStatusSelect.value = 'upcoming';
    if (elements.courseTypeSelect) elements.courseTypeSelect.value = 'Online';
    if (elements.courseInstructorInput) elements.courseInstructorInput.value = 'TS. Dương Việt Hằng';
    if (elements.courseTeamsUrl) elements.courseTeamsUrl.value = '';
    if (elements.courseNoteInput) elements.courseNoteInput.value = '';

    if (elements.btnDeleteCourse) elements.btnDeleteCourse.style.display = 'none';
  }

  elements.scheduleModal.classList.add('open', 'show');

  // Tự động focus vào trường link MS Teams nếu sửa để tiện gán link
  setTimeout(() => {
    if (course && elements.courseTeamsUrl) {
      elements.courseTeamsUrl.focus();
    } else if (elements.courseTitleInput) {
      elements.courseTitleInput.focus();
    }
  }, 100);
}

function closeScheduleModal() {
  if (elements.scheduleModal) {
    elements.scheduleModal.classList.remove('open', 'show');
  }
}

// Lưu buổi học và link MS Teams
async function handleSaveCourse(e) {
  e.preventDefault();
  if (!window.ScheduleManager) return;

  const isAdmin = canManage('schedules:manage');
  if (!isAdmin) {
    if (window.showToast) window.showToast('Bạn không có quyền chỉnh sửa lịch học!', 'danger');
    return;
  }

  const id = elements.courseEditId.value;
  const title = (elements.courseTitleInput ? elements.courseTitleInput.value : '').trim();
  const date = (elements.courseDateInput ? elements.courseDateInput.value : `${window.ScheduleManager.selectedYear}-${String(window.ScheduleManager.selectedMonth).padStart(2, '0')}-01`).trim();

  if (!title) {
    alert('Vui lòng nhập tên buổi học / chuyên đề!');
    return;
  }

  // Tự động tính tháng & năm từ ngày học
  const parsedDate = new Date(date + 'T00:00:00');
  const month = parsedDate.getMonth() + 1;
  const year = parsedDate.getFullYear();

  const courseData = {
    _id: id || undefined,
    id: id || undefined,
    title,
    code: (elements.courseCodeInput ? elements.courseCodeInput.value : '').trim() || `TP-M${month}.${Date.now().toString().slice(-2)}`,
    date,
    month,
    year,
    dayOfWeekText: elements.courseDaySelect ? elements.courseDaySelect.value : 'Thứ 3',
    startTime: elements.courseStartTime ? elements.courseStartTime.value : '19:30',
    endTime: elements.courseEndTime ? elements.courseEndTime.value : '21:30',
    periods: elements.coursePeriods ? elements.coursePeriods.value.trim() : 'Tiết 1 - 4 (Tối)',
    type: elements.courseTypeSelect ? elements.courseTypeSelect.value : 'Online',
    isTentative: document.getElementById('courseTentativeInput').checked,
    status: elements.courseStatusSelect ? elements.courseStatusSelect.value : 'upcoming',
    instructor: (elements.courseInstructorInput ? elements.courseInstructorInput.value : '').trim() || 'Trainer',
    room: 'MS Teams Trực Tuyến',
    teamsUrl: (elements.courseTeamsUrl ? elements.courseTeamsUrl.value : '').trim(),
    documentUrl: (elements.courseDocumentUrl ? elements.courseDocumentUrl.value : '').trim(),
    note: (elements.courseNoteInput ? elements.courseNoteInput.value : '').trim()
  };

  const saved = await window.ScheduleManager.saveSchedule(courseData);
  if (!saved) return;
  closeScheduleModal();
  renderScheduleView();
  renderAdminScheduleTable();
  renderSchedule();

  if (window.showToast) {
    const teamsMsg = courseData.teamsUrl ? ' và đã gán link MS Teams' : '';
    window.showToast(id ? `Đã cập nhật buổi học "${courseData.title}"${teamsMsg}!` : `Đã tạo buổi học mới "${courseData.title}"!`, 'success');
  }
}

// Xóa buổi học
async function handleDeleteCourse(itemOrId) {
  const isAdmin = canManage('schedules:manage');
  if (!isAdmin) {
    if (window.showToast) window.showToast('Chỉ Quản trị viên mới có quyền xóa buổi học!', 'danger');
    return;
  }

  const id = (typeof itemOrId === 'object' && itemOrId !== null) ? (itemOrId._id || itemOrId.id) : (itemOrId || elements.courseEditId.value);
  if (!id || !window.ScheduleManager) return;

  if (confirm('Bạn có chắc chắn muốn xóa buổi học này khỏi lịch tháng?')) {
    if (await window.ScheduleManager.deleteSchedule(id) === false) return;
    closeScheduleModal();
    renderScheduleView();
    renderAdminScheduleTable();
    renderSchedule();
    if (window.showToast) {
      window.showToast('Đã xóa buổi học khỏi lịch thành công!', 'info');
    }
  }
}

// Khôi phục lại lịch mẫu Tháng 10
async function handleResetDefaultSchedule() {
  const isAdmin = canManage('schedules:manage');
  if (!isAdmin) {
    if (window.showToast) window.showToast('Chỉ Quản trị viên mới có quyền đặt lại lịch học!', 'danger');
    return;
  }

  if (confirm('Đặt lại lịch của tháng đang chọn theo dữ liệu đã nhập? Các chỉnh sửa tháng này sẽ bị thay thế.')) {
    const month = window.ScheduleManager ? window.ScheduleManager.selectedMonth : 10;
    if (await window.ScheduleManager.resetSchedules(month, window.ScheduleManager.selectedYear, true) === false) return;
    closeScheduleModal();
    renderScheduleView();
    renderAdminScheduleTable();
    renderSchedule();
    if (window.showToast) {
      window.showToast(`Đã làm mới lại toàn bộ lịch học Tháng ${month}/${window.ScheduleManager.selectedYear}!`, 'success');
    }
  }
}


// Expose to global window
window.initScheduleModule = initScheduleModule;
window.openScheduleModal = openScheduleModal;
