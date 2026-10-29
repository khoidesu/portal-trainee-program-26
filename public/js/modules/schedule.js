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
  // 1. Chuyển chế độ xem: Danh sách Tháng ("để hết trong 1 lần") vs Lưới lịch 31 ngày
  if (elements.btnModeAgenda) {
    elements.btnModeAgenda.addEventListener('click', () => {
      if (window.ScheduleManager) window.ScheduleManager.viewMode = 'agenda';
      elements.btnModeAgenda.classList.add('active');
      if (elements.btnModeCalendar) elements.btnModeCalendar.classList.remove('active');
      renderScheduleView();
    });
  }

  if (elements.btnModeCalendar) {
    elements.btnModeCalendar.addEventListener('click', () => {
      if (window.ScheduleManager) window.ScheduleManager.viewMode = 'calendar';
      elements.btnModeCalendar.classList.add('active');
      if (elements.btnModeAgenda) elements.btnModeAgenda.classList.remove('active');
      renderScheduleView();
    });
  }

  // 2. Bộ lọc Tháng học (Tháng 9, 10, 11, 12...)
  if (elements.filterScheduleMonth) {
    elements.filterScheduleMonth.addEventListener('change', (e) => {
      const month = parseInt(e.target.value, 10) || 10;
      if (window.ScheduleManager) {
        window.ScheduleManager.selectedMonth = month;
      }
      renderScheduleView();
      renderAdminScheduleTable();
    });
  }

  if (elements.scheduleFilterForm) {
    elements.scheduleFilterForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const mSelect = elements.filterScheduleMonth;
      const month = mSelect ? parseInt(mSelect.value, 10) : 10;
      if (window.ScheduleManager) window.ScheduleManager.selectedMonth = month;
      if (window.showToast) {
        window.showToast(`Đã áp dụng bộ lọc: Tháng ${month}/2026`, 'success');
      }
      renderScheduleView();
      renderAdminScheduleTable();
    });
  }

  // 3. Nút Download (Dành cho TẤT CẢ người dùng: Sinh viên, Khách, Admin)
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
      const isAdmin = Boolean(state.currentUser && state.currentUser.role === 'admin');
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

async function renderScheduleView() {
  if (!window.ScheduleManager || !elements.scheduleMonthContainer) return;

  const isAdmin = Boolean(state.currentUser && state.currentUser.role === 'admin');

  // Cập nhật hiển thị nút thêm buổi học trên trang lịch
  if (elements.btnOpenScheduleEditor) {
    elements.btnOpenScheduleEditor.style.display = isAdmin ? 'inline-flex' : 'none';
  }

  // Tải dữ liệu lịch học mới nhất (từ MongoDB Atlas hoặc Cache)
  await window.ScheduleManager.fetchSchedules(window.ScheduleManager.selectedMonth, window.ScheduleManager.selectedYear);

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
  const items = window.ScheduleManager.cachedSchedules || [];

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
        <td><strong class="session-code-tag">${item.code || `TP-M10.${idx+1}`}</strong></td>
        <td>
          <div style="font-weight: 700; color: var(--text-main);">${item.title}</div>
          <div style="font-size: 0.74rem; color: var(--text-muted);">${item.note || 'Chưa có ghi chú'}</div>
        </td>
        <td style="text-align: center;">
          <div style="font-weight: 600;">${formattedDate}</div>
          <div style="font-size: 0.72rem; color: var(--primary-blue);">${item.dayOfWeekText || ''}</div>
        </td>
        <td style="text-align: center; font-size: 0.82rem; font-weight: 600;">
          ${item.startTime} – ${item.endTime}
        </td>
        <td>${item.instructor || 'UIT Mentor'}</td>
        <td style="text-align: center;">
          ${hasTeams 
            ? `<a href="${item.teamsUrl}" target="_blank" class="teams-link-ready" title="${item.teamsUrl}">🌐 Đã có link</a>`
            : `<span class="teams-link-missing" title="Chưa có link, bấm Sửa để gán sau">⏳ Chưa gán</span>`
          }
        </td>
        <td style="text-align: center;">
          ${item.status === 'live' 
            ? '<span class="badge-tag live-pulsing-badge">🔴 Trực tiếp</span>' 
            : item.status === 'completed'
            ? '<span class="badge-tag completed-badge">✓ Xong</span>'
            : '<span class="badge-tag upcoming-badge">⏳ Sắp tới</span>'
          }
        </td>
        <td style="text-align: center;">
          <div class="admin-actions-cell" style="justify-content: center;">
            <button type="button" class="btn-admin-action edit-schedule-btn" data-id="${item._id || item.id}" title="Chỉnh sửa & Gán link MS Teams">
              ✏️ Sửa
            </button>
            <button type="button" class="btn-admin-action delete-btn delete-schedule-btn" data-id="${item._id || item.id}" title="Xóa buổi học">
              🗑️ Xóa
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
  const isAdmin = Boolean(state.currentUser && state.currentUser.role === 'admin');
  if (!isAdmin) {
    if (window.showToast) {
      window.showToast('Chỉ Quản trị viên (Admin) mới có quyền thêm hoặc chỉnh sửa lịch học!', 'danger');
    }
    return;
  }

  if (!elements.scheduleModal) return;

  if (course) {
    elements.scheduleModalTitle.textContent = `Chỉnh Sửa Buổi Học & Gán Link MS Teams`;
    elements.courseEditId.value = course._id || course.id;
    if (elements.courseTitleInput) elements.courseTitleInput.value = course.title || '';
    if (elements.courseCodeInput) elements.courseCodeInput.value = course.code || '';
    if (elements.courseDateInput) elements.courseDateInput.value = course.date || '2026-10-27';
    if (elements.courseStartTime) elements.courseStartTime.value = course.startTime || '19:30';
    if (elements.courseEndTime) elements.courseEndTime.value = course.endTime || '21:30';
    if (elements.courseDaySelect) elements.courseDaySelect.value = course.dayOfWeekText || 'Thứ 3';
    if (elements.coursePeriods) elements.coursePeriods.value = course.periods || 'Tiết 1 - 4 (Tối)';
    if (elements.courseStatusSelect) elements.courseStatusSelect.value = course.status || 'upcoming';
    if (elements.courseTypeSelect) elements.courseTypeSelect.value = course.type || 'Online';
    if (elements.courseInstructorInput) elements.courseInstructorInput.value = course.instructor || '';
    if (elements.courseTeamsUrl) elements.courseTeamsUrl.value = course.teamsUrl || '';
    if (elements.courseNoteInput) elements.courseNoteInput.value = course.note || '';

    if (elements.btnDeleteCourse) elements.btnDeleteCourse.style.display = 'inline-block';
  } else {
    elements.scheduleModalTitle.textContent = 'Thêm Buổi Học Trực Tuyến Mới (MS Teams)';
    elements.scheduleCourseForm.reset();
    elements.courseEditId.value = '';
    if (elements.courseDateInput) elements.courseDateInput.value = '2026-10-27';
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

  const isAdmin = Boolean(state.currentUser && state.currentUser.role === 'admin');
  if (!isAdmin) {
    if (window.showToast) window.showToast('Bạn không có quyền chỉnh sửa lịch học!', 'danger');
    return;
  }

  const id = elements.courseEditId.value;
  const title = (elements.courseTitleInput ? elements.courseTitleInput.value : '').trim();
  const date = (elements.courseDateInput ? elements.courseDateInput.value : '2026-10-27').trim();

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
    status: elements.courseStatusSelect ? elements.courseStatusSelect.value : 'upcoming',
    instructor: (elements.courseInstructorInput ? elements.courseInstructorInput.value : '').trim() || 'UIT Mentor',
    room: 'MS Teams Trực Tuyến',
    teamsUrl: (elements.courseTeamsUrl ? elements.courseTeamsUrl.value : '').trim(),
    note: (elements.courseNoteInput ? elements.courseNoteInput.value : '').trim()
  };

  await window.ScheduleManager.saveSchedule(courseData);
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
  const isAdmin = Boolean(state.currentUser && state.currentUser.role === 'admin');
  if (!isAdmin) {
    if (window.showToast) window.showToast('Chỉ Quản trị viên mới có quyền xóa buổi học!', 'danger');
    return;
  }

  const id = (typeof itemOrId === 'object' && itemOrId !== null) ? (itemOrId._id || itemOrId.id) : (itemOrId || elements.courseEditId.value);
  if (!id || !window.ScheduleManager) return;

  if (confirm('Bạn có chắc chắn muốn xóa buổi học này khỏi lịch tháng?')) {
    await window.ScheduleManager.deleteSchedule(id);
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
  const isAdmin = Boolean(state.currentUser && state.currentUser.role === 'admin');
  if (!isAdmin) {
    if (window.showToast) window.showToast('Chỉ Quản trị viên mới có quyền đặt lại lịch học!', 'danger');
    return;
  }

  if (confirm('Khôi phục toàn bộ lịch học về danh sách mẫu Tháng 10 dành cho Trainee Program UIT?')) {
    const month = window.ScheduleManager ? window.ScheduleManager.selectedMonth : 10;
    await window.ScheduleManager.resetSchedules(month, 2026, true);
    closeScheduleModal();
    renderScheduleView();
    renderAdminScheduleTable();
    renderSchedule();
    if (window.showToast) {
      window.showToast(`Đã làm mới lại toàn bộ lịch học Tháng ${month}/2026!`, 'success');
    }
  }
}


// Expose to global window
window.initScheduleModule = initScheduleModule;
window.openScheduleModal = openScheduleModal;
