/**
 * ==============================================================================
 * COMPONENT: Grades Module (Bảng Điểm Sao Rèn Luyện Theo Buổi Học)
 * CHỨC NĂNG CHÍNH: Hiển thị chi tiết bảng điểm sao rèn luyện của Trainee qua từng
 *                  buổi đào tạo (sao tham gia, sao trả lời, sao bài tập, điểm cộng).
 * LIÊN KẾT & PHỤ THUỘC: public/js/modules/core.js, public/js/api.js
 * NHIỆM VỤ CHI TIẾT:
 *   - gradesState & initGradesModule: Khởi tạo dữ liệu bảng điểm sao
 *   - renderGradesView: Hiển thị 3 chỉ số KPI tổng sao, số buổi, chuyên cần
 *   - Bộ lọc giai đoạn: Tất cả, Phase 1, Phase 2, Chuyên sâu
 *   - openStarDetailModal: Xem minh chứng đánh giá chi tiết cho từng buổi học
 * ==============================================================================
 */

// ==========================================
// BẢNG ĐIỂM (STAR TRANSCRIPT & CHI TIẾT SAO)
// ==========================================

// ==========================================
// BẢNG ĐIỂM SAO BUỔI HỌC (STAR TRANSCRIPT PER SESSION)
// ==========================================

const gradesState = {
  viewMode: 'boxes', // 'boxes' or 'matrix'
  sessionFilter: 'all', // 'all' or specific sessionCode
  searchFilter: '',
  trackFilter: 'all',
  uniqueSessions: [],
  traineesList: []
};

// Trích xuất danh sách tất cả các buổi học duy nhất trên toàn bộ Trainee
function extractUniqueSessions(trainees) {
  const map = new Map();
  trainees.forEach(t => {
    (t.sessionStars || []).forEach(s => {
      const code = s.sessionCode || s.sessionTitle;
      if (!map.has(code)) {
        map.set(code, {
          sessionCode: s.sessionCode || 'TP-M10.0X',
          sessionTitle: s.sessionTitle || 'Buổi học',
          sessionDate: s.sessionDate || '',
          trainerName: s.trainerName || '',
          stage: s.stage || 'Giai đoạn 1',
          stageName: s.stageName || 'Training'
        });
      }
    });
  });

  const list = Array.from(map.values());
  // Sắp xếp các buổi học theo ngày tăng dần
  list.sort((a, b) => {
    if (a.sessionDate && b.sessionDate) {
      return new Date(a.sessionDate) - new Date(b.sessionDate);
    }
    return (a.sessionCode || '').localeCompare(b.sessionCode || '');
  });
  return list;
}

// Buổi đã/đang diễn ra có mặt trong bảng điểm và đồng bộ thông tin từ Thời khóa biểu
function mergeScheduleSessions(sessions, schedules) {
  const map = new Map();
  sessions.forEach(s => map.set(s.sessionCode, { ...s }));
  (schedules || []).forEach(sc => {
    if (!sc.code || !sc.date) return;
    if (sc.status !== 'completed' && sc.status !== 'live') return;
    if (map.has(sc.code)) {
      const existing = map.get(sc.code);
      if (sc.title) existing.sessionTitle = sc.title;
      if (sc.date) existing.sessionDate = sc.date;
      if (sc.instructor) existing.trainerName = sc.instructor;
    } else {
      map.set(sc.code, {
        sessionCode: sc.code,
        sessionTitle: sc.title || 'Buổi học',
        sessionDate: sc.date,
        trainerName: sc.instructor || '',
        stage: 'Giai đoạn 1',
        stageName: 'Vòng 1'
      });
    }
  });
  const merged = Array.from(map.values());
  merged.sort((a, b) => {
    if (a.sessionDate && b.sessionDate && a.sessionDate !== b.sessionDate) {
      return new Date(a.sessionDate) - new Date(b.sessionDate);
    }
    return (a.sessionCode || '').localeCompare(b.sessionCode || '');
  });
  return merged;
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}`;
  }
  return dateStr;
}

function formatDateVN(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

async function renderGradesView(reload = true) {
  // Đảm bảo dữ liệu Trainee luôn mới nhất từ MongoDB Atlas
  try {
    if (reload || !state.trainees || state.trainees.length === 0) {
      await loadTrainees();
    }
  } catch (err) {
    console.warn('Lỗi khi tải dữ liệu trainees cho bảng điểm:', err);
  }

  // Danh sách Trainee sắp xếp theo số sao giảm dần
  const trainees = (state.trainees || []).slice().sort((a, b) => (Number(b.accumulatedStars) || 0) - (Number(a.accumulatedStars) || 0));
  gradesState.traineesList = trainees;
  gradesState.uniqueSessions = extractUniqueSessions(trainees);
  try {
    const schedules = await API.getSchedules({ all: true });
    gradesState.uniqueSessions = mergeScheduleSessions(gradesState.uniqueSessions, schedules);
  } catch (err) {
    console.warn('Không tải được lịch học để đồng bộ buổi học:', err);
  }

  // Cập nhật các thẻ KPI tóm tắt ở đầu trang
  updateGradesKpis(trainees, gradesState.uniqueSessions);

  // Gắn sự kiện bộ lọc tìm kiếm & khoa & chuyển đổi chế độ xem
  setupGradesFilters();

  // Render các pill chọn buổi học nhanh
  renderSessionPills();

  // Render hiển thị chính: Từng buổi học trong 1 ô box riêng biệt
  renderSessionBoxesView();

  // Đồng thời cập nhật bảng ma trận (để sẵn sàng khi bấm chuyển chế độ)
  renderGradesMatrixTable();
  renderSessionReferenceSection();
  if (canManage('attendance:manage')) setupAttendanceControls();
  if (typeof window.initCustomSelects === 'function') setTimeout(window.initCustomSelects, 60);
}

function updateGradesKpis(trainees, sessions) {
  const elTotalTrainees = document.getElementById('kpiTotalTrainees');
  const elTotalSessions = document.getElementById('kpiTotalSessions');
  const elTotalStars = document.getElementById('kpiTotalStarsEarned');
  const elTopStudent = document.getElementById('kpiTopStudent');
  const elLatestDate = document.getElementById('kpiLatestSessionDate');

  if (elTotalTrainees) {
    elTotalTrainees.innerHTML = `<span class="kpi-val-num">${trainees.length}</span><span class="kpi-val-unit"> Trainee</span>`;
  }
  if (elTotalSessions) {
    elTotalSessions.innerHTML = sessions.length
      ? `<span class="kpi-val-num">${sessions.length}</span><span class="kpi-val-unit"> buổi</span>`
      : 'Chưa có dữ liệu';
  }

  // Tính tổng số sao toàn khóa
  let totalStars = 0;
  trainees.forEach(t => {
    totalStars += Number(t.accumulatedStars) || 0;
  });
  if (elTotalStars) {
    const hasStars = trainees.some(trainee => Number.isFinite(trainee.accumulatedStars));
    elTotalStars.innerHTML = hasStars
      ? `<span class="kpi-val-num">${totalStars}</span><span class="kpi-val-unit"> sao</span>`
      : '—';
  }

  // Buổi học gần nhất
  if (sessions.length > 0 && elLatestDate) {
    const latest = sessions[sessions.length - 1];
    elLatestDate.textContent = `Buổi gần nhất: ${formatDateVN(latest.sessionDate) || latest.sessionCode}`;
  }
}

function setupGradesFilters() {
  const searchInput = document.getElementById('inputSearchGradesTrainee');
  const trackSelect = document.getElementById('selectGradesTrack');
  const btnPrint = document.getElementById('btnPrintGrades');
  const btnModeBoxes = document.getElementById('btnModeSessionBoxes');
  const btnModeMatrix = document.getElementById('btnModeMatrix');
  const boxesView = document.getElementById('gradesSessionBoxesView');
  const matrixWrap = document.getElementById('gradesMatrixWrap');

  // Chuyển đổi giữa chế độ Ô Box từng buổi và Bảng Ma Trận
  if (btnModeBoxes && !btnModeBoxes.dataset.bound) {
    btnModeBoxes.dataset.bound = 'true';
    btnModeBoxes.onclick = () => {
      gradesState.viewMode = 'boxes';
      btnModeBoxes.classList.add('active');
      if (btnModeMatrix) btnModeMatrix.classList.remove('active');
      if (boxesView) boxesView.style.display = 'block';
      if (matrixWrap) matrixWrap.style.display = 'none';
      renderSessionBoxesView();
    };
  }

  if (btnModeMatrix && !btnModeMatrix.dataset.bound) {
    btnModeMatrix.dataset.bound = 'true';
    btnModeMatrix.onclick = () => {
      gradesState.viewMode = 'matrix';
      btnModeMatrix.classList.add('active');
      if (btnModeBoxes) btnModeBoxes.classList.remove('active');
      if (boxesView) boxesView.style.display = 'none';
      if (matrixWrap) matrixWrap.style.display = 'block';
      renderGradesMatrixTable();
    };
  }

  if (searchInput && !searchInput.dataset.bound) {
    searchInput.dataset.bound = 'true';
    searchInput.oninput = (e) => {
      gradesState.searchFilter = e.target.value.trim().toLowerCase();
      renderSessionBoxesView();
      renderGradesMatrixTable();
    };
  }

  if (trackSelect && !trackSelect.dataset.bound) {
    trackSelect.dataset.bound = 'true';
    trackSelect.onchange = (e) => {
      gradesState.trackFilter = e.target.value;
      renderSessionBoxesView();
      renderGradesMatrixTable();
    };
  }

  if (btnPrint && !btnPrint.dataset.bound) {
    btnPrint.dataset.bound = 'true';
    btnPrint.onclick = printGradesTable;
  }

  // Modal đóng chi tiết sao
  const btnCloseModal = document.getElementById('closeStarDetailModalBtn');
  const btnCloseModal2 = document.getElementById('btnCloseStarDetailModal');
  const modal = document.getElementById('sessionStarDetailModal');
  const closeModal = () => {
    if (modal) modal.classList.remove('open', 'show');
  };
  window.closeSessionStarDetailModal = closeModal;

  if (btnCloseModal) btnCloseModal.onclick = closeModal;
  if (btnCloseModal2) btnCloseModal2.onclick = closeModal;
  if (modal) {
    modal.onclick = (e) => {
      if (e.target === modal) closeModal();
    };
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.keyCode === 27) {
        e.preventDefault();
        e.stopPropagation();
        closeModal();
      }
    });
  }
}

function renderSessionPills() {
  const container = document.getElementById('gradesSessionPillsList');
  if (!container) return;

  const sessions = gradesState.uniqueSessions || [];
  let html = `
    <button type="button" class="session-pill-btn ${gradesState.sessionFilter === 'all' ? 'active' : ''}" data-session="all">
       Tất cả buổi học (${sessions.length})
    </button>
  `;

  sessions.forEach((s, idx) => {
    const isAct = gradesState.sessionFilter === s.sessionCode;
    const shortDate = s.sessionDate ? formatDateShort(s.sessionDate) : '';
    html += `
      <button type="button" class="session-pill-btn ${isAct ? 'active' : ''}" data-session="${escapeHtml(s.sessionCode)}">
        Buổi ${idx + 1} ${shortDate ? `(${shortDate})` : ''}
      </button>
    `;
  });

  container.innerHTML = html;

  container.querySelectorAll('.session-pill-btn').forEach(btn => {
    btn.onclick = () => {
      gradesState.sessionFilter = btn.getAttribute('data-session');
      container.querySelectorAll('.session-pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderSessionBoxesView();
    };
  });
}

function renderSessionBoxesView() {
  const container = document.getElementById('gradesSessionBoxesContainer');
  const countBadge = document.getElementById('gradesCountBadge');
  if (!container) return;

  const isAdmin = canManage('attendance:manage');
  const allSessions = gradesState.uniqueSessions || [];
  let sessionsToRender = allSessions;
  if (gradesState.sessionFilter && gradesState.sessionFilter !== 'all') {
    sessionsToRender = allSessions.filter(s => s.sessionCode === gradesState.sessionFilter);
  }

  let trainees = gradesState.traineesList || [];

  if (gradesState.searchFilter) {
    const q = gradesState.searchFilter;
    trainees = trainees.filter(t =>
      (t.fullName && t.fullName.toLowerCase().includes(q)) ||
      (t.traineeId && t.traineeId.toLowerCase().includes(q)) ||
      (t.email && t.email.toLowerCase().includes(q))
    );
  }

  if (gradesState.trackFilter && gradesState.trackFilter !== 'all') {
    const trk = gradesState.trackFilter.toLowerCase();
    trainees = trainees.filter(t =>
      (t.track && t.track.toLowerCase().includes(trk)) ||
      (t.department && t.department.toLowerCase().includes(trk))
    );
  }

  if (countBadge) {
    countBadge.textContent = `${trainees.length} Trainee · ${allSessions.length} buổi học`;
  }

  if (sessionsToRender.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 48px; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-color); color: var(--text-muted);">
         Chưa có dữ liệu buổi học nào phù hợp.
      </div>
    `;
    return;
  }

  container.innerHTML = sessionsToRender.map((s) => {
    const sessionIdx = allSessions.findIndex(item => item.sessionCode === s.sessionCode);
    const displayNum = sessionIdx >= 0 ? sessionIdx + 1 : 1;

    const studentRows = [];
    let sessionTotalStars = 0;
    const traineeIdsWithLog = new Set();

    trainees.forEach(t => {
      const studentSession = (t.sessionStars || []).find(log => (log.sessionCode && log.sessionCode === s.sessionCode));
      if (studentSession) {
        const stars = Number(studentSession.starsAwarded) || 0;
        sessionTotalStars += stars;
        traineeIdsWithLog.add(t.traineeId);
        studentRows.push({
          trainee: t,
          sessionLog: studentSession,
          starsAwarded: stars,
          cumulativeStars: studentSession.cumulativeStars ?? t.accumulatedStars ?? 0,
          note: studentSession.note || 'Hoàn thành bài tập & tham gia tích cực'
        });
      }
    });

    if (isAdmin) {
      trainees.forEach(t => {
        if (!traineeIdsWithLog.has(t.traineeId)) {
          studentRows.push({ trainee: t, sessionLog: null, starsAwarded: 0, cumulativeStars: t.accumulatedStars ?? 0, note: '' });
        }
      });
    }

    studentRows.sort((a, b) => {
      if (a.sessionLog && !b.sessionLog) return -1;
      if (!a.sessionLog && b.sessionLog) return 1;
      return b.starsAwarded - a.starsAwarded;
    });

    const attendedCount = studentRows.filter(item => item.sessionLog?.attendanceStatus === 'present').length;
    const recordedCount = studentRows.filter(item => item.sessionLog).length;
    const avgStars = recordedCount > 0 ? (sessionTotalStars / recordedCount).toFixed(1) : '0';

    let tbodyRowsHtml = '';
    if (studentRows.length === 0) {
      tbodyRowsHtml = `<tr><td colspan="${isAdmin ? 6 : 7}" style="text-align: center; padding: 28px; color: var(--text-muted);"> Không tìm thấy Trainee nào phù hợp bộ lọc trong buổi học này.</td></tr>`;
    } else {
      tbodyRowsHtml = studentRows.map((item, rIdx) => {
        const t = item.trainee;
        const avatarUrl = getTraineeDicebearAvatar(t);
        if (isAdmin) {
          const hasLog = !!item.sessionLog;
          const stars = hasLog ? item.starsAwarded : '';
          const status = item.sessionLog?.attendanceStatus || 'not_recorded';
          const note = hasLog ? (item.sessionLog.note || '') : '';
          return `<tr data-trainee-id="${escapeHtml(t.traineeId)}" data-session-code="${escapeHtml(s.sessionCode)}" class="${hasLog ? '' : 'inline-grade-new'}">
            <td><div class="admin-user-cell"><div class="admin-user-avatar" style="padding:0;overflow:hidden;background:transparent;width:34px;height:34px;"><img src="${avatarUrl}" alt="${escapeHtml(t.fullName)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;"></div><div class="admin-user-info"><span class="admin-user-name" style="font-weight:700;">${escapeHtml(t.fullName)}</span><span class="admin-user-meta">MSSV: <strong>${escapeHtml(t.traineeId)}</strong> · ${escapeHtml(t.track || 'Khoa KHMT')}</span></div></div></td>
            <td style="text-align:center;"><input type="number" class="inline-grade-star" min="-20" max="100" value="${stars}" data-initial="${stars}" placeholder="—"></td>
            <td><select class="inline-grade-status" data-initial="${status}"><option value="present"${status === 'present' ? ' selected' : ''}>Có mặt</option><option value="absent_excused"${status === 'absent_excused' ? ' selected' : ''}>Vắng CP</option><option value="absent_unexcused"${status === 'absent_unexcused' ? ' selected' : ''}>Vắng KP</option><option value="not_recorded"${status === 'not_recorded' ? ' selected' : ''}>Chưa ghi</option></select></td>
            <td><input type="text" class="inline-grade-note" value="${escapeHtml(note)}" data-initial="${escapeHtml(note)}" placeholder="Nhận xét ngắn…" maxlength="1000"></td>
            <td style="text-align:center;font-weight:700;color:var(--text-main);font-size:0.9rem;">${item.cumulativeStars}</td>
            <td style="text-align:center;"><button type="button" class="btn btn-outline btn-xs btn-open-session-detail" data-trainee-id="${escapeHtml(t.traineeId)}" data-session-code="${escapeHtml(s.sessionCode)}" title="Xem chi tiết"><span>Chi tiết</span></button></td></tr>`;
        }
        const rank = rIdx + 1;
        let rankBadge = `#${rank}`;
        if (rank === 1) rankBadge = ' #1';
        else if (rank === 2) rankBadge = ' #2';
        else if (rank === 3) rankBadge = ' #3';
        const showMssv = Boolean(window.canViewMssv && window.canViewMssv());
        return `<tr data-trainee-id="${escapeHtml(t.traineeId)}" data-session-code="${escapeHtml(s.sessionCode)}">
            <td style="text-align:center;font-weight:700;white-space:nowrap;color:${rank === 1 ? '#eab308' : rank === 2 ? '#94a3b8' : rank === 3 ? '#d97706' : 'var(--text-muted)'};">${rankBadge}</td>
            <td><div class="admin-user-cell"><div class="admin-user-avatar" style="padding:0;overflow:hidden;background:transparent;width:34px;height:34px;"><img src="${avatarUrl}" alt="${escapeHtml(t.fullName)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;"></div><div class="admin-user-info"><span class="admin-user-name" style="font-weight:700;">${escapeHtml(t.fullName)}</span>${showMssv ? `<span class="admin-user-meta">MSSV: <strong>${escapeHtml(t.traineeId)}</strong></span>` : ''}</div></div></td>
            <td><div style="font-weight:600;font-size:0.84rem;">${escapeHtml(t.batch || 'KHMT2026.2')}</div><div style="font-size:0.74rem;color:var(--text-muted);">${escapeHtml(t.track || 'Khoa KHMT')}</div></td>
            <td style="text-align:center;"><span class="session-star-badge-lg" title="Điểm sao buổi này">${formatStarDelta(item.starsAwarded)}</span><div class="session-attendance-label">${escapeHtml(attendanceLabel(item.sessionLog?.attendanceStatus))}</div></td>
            <td style="text-align:center;"><span style="font-weight:700;color:var(--text-main);font-size:0.9rem;">${item.cumulativeStars}</span></td>
            <td style="max-width:320px;"><div class="session-note-text">${escapeHtml(item.note)}</div></td>
            <td style="text-align:center;"><button type="button" class="btn btn-outline btn-xs btn-open-session-detail" data-trainee-id="${escapeHtml(t.traineeId)}" data-session-code="${escapeHtml(s.sessionCode)}" title="Xem chi tiết nhận xét & đánh giá"><span>Xem</span></button></td></tr>`;
      }).join('');
    }

    const adminToolbarHtml = isAdmin ? `
        <div class="inline-grade-toolbar">
          <div class="inline-grade-quick">
            <span>Gán nhanh:</span>
            <button type="button" class="btn btn-outline btn-xs btn-inline-quick" data-val="3" data-session="${escapeHtml(s.sessionCode)}">+3</button>
            <button type="button" class="btn btn-outline btn-xs btn-inline-quick" data-val="5" data-session="${escapeHtml(s.sessionCode)}">+5</button>
            <button type="button" class="btn btn-outline btn-xs btn-inline-quick" data-val="10" data-session="${escapeHtml(s.sessionCode)}">+10</button>
            <button type="button" class="btn btn-outline btn-xs btn-inline-quick-present" data-session="${escapeHtml(s.sessionCode)}">Tất cả → Có mặt</button>
          </div>
          <div class="inline-grade-actions">
            <span class="inline-grade-feedback" data-session="${escapeHtml(s.sessionCode)}"></span>
            <button type="button" class="btn btn-primary btn-sm btn-inline-save" data-session="${escapeHtml(s.sessionCode)}" data-date="${escapeHtml(s.sessionDate)}" data-title="${escapeHtml(s.sessionTitle)}" data-stage="${escapeHtml(s.stage || 'Giai đoạn 1')}" data-stagename="${escapeHtml(s.stageName || 'Vòng 1')}" data-trainer="${escapeHtml(s.trainerName || '')}">Lưu tất cả</button>
          </div>
        </div>` : '';

    const theadHtml = isAdmin
      ? `<th scope="col">Trainee</th><th scope="col" style="width:85px; text-align:center;">Sao</th><th scope="col" style="width:130px; text-align:center;">Điểm danh</th><th scope="col">Ghi chú</th><th scope="col" style="width:90px; text-align:center;">Lũy kế</th><th scope="col" style="width:110px; text-align:center; white-space:nowrap;">Chi tiết</th>`
      : `<th scope="col">Hạng</th><th scope="col">Trainee</th><th scope="col">Ban / Lớp</th><th scope="col">Điểm sao / Điểm danh</th><th scope="col">Lũy kế sau buổi</th><th scope="col">Ghi chú</th><th scope="col" style="width:110px; text-align:center; white-space:nowrap;">Thao tác</th>`;

    const colgroupHtml = isAdmin
      ? `<colgroup><col style="min-width:200px"><col style="width:85px"><col style="width:130px"><col style="min-width:140px"><col style="width:90px"><col style="width:110px"></colgroup>`
      : `<colgroup><col class="session-col-rank"><col class="session-col-trainee"><col class="session-col-group"><col class="session-col-points"><col class="session-col-total"><col class="session-col-note"><col class="session-col-actions"></colgroup>`;

    const isGuest = Boolean(window.state ? !window.state.currentUser : false);
    let sessionTitle = s.sessionTitle;
    if (isGuest) {
      const match = (s.sessionTitle || '').match(/^(buổi\s*\d+)/i);
      sessionTitle = match ? match[1].charAt(0).toUpperCase() + match[1].slice(1) : `Buổi ${displayNum}`;
    }

    return `
      <div class="session-box-card" id="session-box-${escapeHtml(s.sessionCode)}">
        <div class="session-box-header">
          <div class="session-box-left">
            <div class="session-box-icon-badge">
              <span>BUỔI</span>
              <span>${displayNum}</span>
            </div>
            <div class="session-box-title-wrap">
              <div class="session-box-badge-row">
                <span class="session-tag-code">${escapeHtml(s.sessionCode)}</span>
                <span class="session-tag-stage">${escapeHtml(s.stage || 'Giai đoạn 1')}</span>
                <span class="session-tag-date"> ${s.sessionDate ? formatDateVN(s.sessionDate) : 'Chưa xếp ngày'}</span>
                ${isAdmin && recordedCount === 0 ? '<span class="legend-chip chip-upcoming">Chưa chấm điểm</span>' : ''}
              </div>
              <h3 class="session-box-title">${escapeHtml(sessionTitle)}</h3>
              <div class="session-box-trainer">
                <span>Phụ trách: ${isGuest
                  ? '<strong style="color: var(--text-muted); font-style: italic;">Đăng nhập để xem</strong>'
                  : `<strong>${escapeHtml(s.trainerName || 'Chưa cập nhật')}</strong>`
                }</span>
              </div>
            </div>
          </div>
          <div class="session-box-stats">
            <div class="session-stat-chip">
              <span class="session-stat-chip-label">Có mặt</span>
              <span class="session-stat-chip-val">${attendedCount} Trainee</span>
            </div>
            <div class="session-stat-chip">
              <span class="session-stat-chip-label">Tổng điểm sao</span>
              <span class="session-stat-chip-val gold">${formatStarDelta(sessionTotalStars)} </span>
            </div>
            <div class="session-stat-chip">
              <span class="session-stat-chip-label">Trung bình</span>
              <span class="session-stat-chip-val">${formatStarDelta(avgStars)} /SV</span>
            </div>
          </div>
        </div>
${adminToolbarHtml}
        <div class="session-box-body">
          <p class="table-scroll-hint">Vuốt hoặc dùng phím mũi tên để xem các cột bên phải.</p>
          <div class="table-responsive" role="region" aria-label="Bảng điểm ${escapeHtml(isGuest ? `buổi ${displayNum}` : (s.sessionTitle || s.sessionCode))}" tabindex="0">
            <table class="session-box-table">${colgroupHtml}
              <thead>
                <tr>${theadHtml}</tr>
              </thead>
              <tbody>
                ${tbodyRowsHtml}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.btn-open-session-detail').forEach(btn => {
    btn.onclick = () => {
      const traineeId = btn.getAttribute('data-trainee-id');
      const sessionCode = btn.getAttribute('data-session-code');
      openSessionStarDetailModal(traineeId, sessionCode);
    };
  });

  if (isAdmin) {
    container.querySelectorAll('.btn-inline-quick').forEach(btn => {
      btn.onclick = () => {
        const val = btn.getAttribute('data-val');
        const session = btn.getAttribute('data-session');
        const box = document.getElementById('session-box-' + session);
        if (box) box.querySelectorAll('.inline-grade-star').forEach(inp => { inp.value = val; });
      };
    });
    container.querySelectorAll('.btn-inline-quick-present').forEach(btn => {
      btn.onclick = () => {
        const session = btn.getAttribute('data-session');
        const box = document.getElementById('session-box-' + session);
        if (box) box.querySelectorAll('.inline-grade-status').forEach(sel => {
          sel.value = 'present';
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        });
      };
    });
    container.querySelectorAll('.btn-inline-save').forEach(btn => {
      btn.onclick = () => saveInlineSessionGrades(btn);
    });
  }
}

async function saveInlineSessionGrades(btn) {
  const sessionCode = btn.getAttribute('data-session');
  const sessionDate = btn.getAttribute('data-date');
  const box = document.getElementById('session-box-' + sessionCode);
  if (!box) return;

  const feedback = box.querySelector(`.inline-grade-feedback[data-session="${sessionCode}"]`);
  const rows = box.querySelectorAll('tbody tr[data-trainee-id]');
  const entries = [];
  rows.forEach(tr => {
    const traineeId = tr.getAttribute('data-trainee-id');
    const starInput = tr.querySelector('.inline-grade-star');
    const statusSelect = tr.querySelector('.inline-grade-status');
    const noteInput = tr.querySelector('.inline-grade-note');
    if (!traineeId || !starInput) return;
    if (starInput.value === '' && statusSelect?.value === 'not_recorded') return;
    entries.push({
      traineeId,
      starsAwarded: Number(starInput.value) || 0,
      attendanceStatus: statusSelect?.value || 'present',
      note: noteInput?.value?.trim() || ''
    });
  });

  if (entries.length === 0) {
    if (feedback) feedback.textContent = 'Chưa có dữ liệu nào để lưu.';
    return;
  }

  btn.disabled = true;
  if (feedback) feedback.textContent = `Đang lưu ${entries.length} Trainee…`;

  let saved = 0;
  let errors = 0;
  for (const entry of entries) {
    try {
      await API.saveAttendance(entry.traineeId, sessionCode, {
        sessionDate,
        attendanceStatus: entry.attendanceStatus,
        starsAwarded: entry.starsAwarded,
        note: entry.note
      });
      saved++;
    } catch (err) {
      errors++;
      console.warn(`Lỗi lưu ${entry.traineeId}:`, err.message);
    }
  }

  btn.disabled = false;
  const msg = errors === 0
    ? `Đã lưu ${saved} Trainee thành công!`
    : `Đã lưu ${saved}, lỗi ${errors} Trainee.`;
  if (feedback) feedback.textContent = msg;
  if (window.showToast) window.showToast(msg, errors === 0 ? 'success' : 'warning');

  await refreshPortalData();
  renderGradesView(false);
}

function getFilteredGradesTrainees() {
  let trainees = gradesState.traineesList || [];

  if (gradesState.searchFilter) {
    const q = gradesState.searchFilter;
    trainees = trainees.filter(t =>
      (t.fullName && t.fullName.toLowerCase().includes(q)) ||
      (t.traineeId && t.traineeId.toLowerCase().includes(q)) ||
      (t.email && t.email.toLowerCase().includes(q))
    );
  }

  if (gradesState.trackFilter && gradesState.trackFilter !== 'all') {
    const trk = gradesState.trackFilter.toLowerCase();
    trainees = trainees.filter(t =>
      (t.track && t.track.toLowerCase().includes(trk)) ||
      (t.department && t.department.toLowerCase().includes(trk))
    );
  }
  return trainees;
}

function printGradesTable() {
  const sessions = gradesState.uniqueSessions || [];
  const trainees = getFilteredGradesTrainees();
  if (!trainees.length) {
    if (window.showToast) window.showToast('Không có Trainee nào để in theo bộ lọc hiện tại.', 'info');
    return;
  }
  const showMssv = Boolean(window.canViewMssv && window.canViewMssv());
  const starOf = (trainee, session) => {
    const log = (trainee.sessionStars || []).find(item => item.sessionCode && item.sessionCode === session.sessionCode);
    return log && Number.isFinite(log.starsAwarded) ? log.starsAwarded : null;
  };
  const columns = [
    { label: 'Hạng', align: 'center' }, { label: 'Trainee' },
    ...(showMssv ? [{ label: 'MSSV' }] : []),
    { label: 'Khoa / Lớp' },
    ...sessions.map((session, idx) => ({ label: `B${idx + 1}${session.sessionDate ? ' · ' + formatDateShort(session.sessionDate) : ''}`, align: 'center' })),
    { label: 'Tổng sao', align: 'center' }, { label: 'Xếp loại', align: 'center' }
  ];
  const rows = trainees.map((trainee, index) => [
    index + 1, trainee.fullName || '',
    ...(showMssv ? [trainee.traineeId || ''] : []),
    [trainee.batch || 'KHMT2026.2', trainee.track || 'Khoa KHMT'].join(' · '),
    ...sessions.map(session => { const stars = starOf(trainee, session); return stars === null ? '—' : formatStarDelta(stars); }),
    trainee.accumulatedStars || 0, trainee.starClassification || 'Hạng Vàng'
  ]);
  const leading = columns.length - sessions.length - 2;
  const footerRows = sessions.length ? [[
    'Tổng', ...Array(leading - 1).fill(''),
    ...sessions.map(session => formatStarDelta(trainees.reduce((sum, trainee) => sum + (starOf(trainee, session) || 0), 0))),
    trainees.reduce((sum, trainee) => sum + (Number(trainee.accumulatedStars) || 0), 0), ''
  ]] : [];
  const filters = [];
  if (gradesState.searchFilter) filters.push(`Từ khóa: ${gradesState.searchFilter}`);
  if (gradesState.trackFilter && gradesState.trackFilter !== 'all') filters.push(`Lớp/Khoa: ${gradesState.trackFilter}`);
  window.printTable({
    title: 'Bảng điểm sao theo từng buổi học',
    subtitle: 'Điểm sao cộng thêm sau mỗi buổi học của Trainee',
    meta: [`${trainees.length} Trainee`, `${sessions.length} buổi học`, ...filters],
    landscape: true,
    columns, rows, footerRows
  });
}

function renderGradesMatrixTable() {
  const thead = document.getElementById('gradesMatrixThead');
  const tbody = document.getElementById('gradesMatrixTbody');
  const tfoot = document.getElementById('gradesMatrixTfoot');
  const countBadge = document.getElementById('gradesCountBadge');
  if (!thead || !tbody) return;

  const sessions = gradesState.uniqueSessions || [];
  const trainees = getFilteredGradesTrainees();

  if (countBadge) {
    countBadge.textContent = `${trainees.length} Trainee · ${sessions.length} buổi học`;
  }

  // 1. Render THEAD
  let theadHtml = `
    <tr>
      <th style="width: 70px; text-align: center;">HẠNG</th>
      <th style="min-width: 220px;">Trainee / TRAINEE</th>
      <th style="min-width: 130px;">KHOA / LỚP</th>
  `;

  const isGuest = Boolean(window.state ? !window.state.currentUser : false);

  sessions.forEach((s, idx) => {
    const shortDate = s.sessionDate ? formatDateShort(s.sessionDate) : `B${idx + 1}`;
    const headerTitle = isGuest ? `Buổi ${idx + 1}` : (s.sessionTitle || `Buổi ${idx + 1}`);
    theadHtml += `
      <th class="col-session-header" title="${escapeHtml(headerTitle)}">
        <div class="session-header-code">Buổi ${idx + 1}</div>
        <div class="session-header-date">${escapeHtml(shortDate)}</div>
      </th>
    `;
  });

  theadHtml += `
      <th style="text-align: center; min-width: 120px;">TỔNG SAO </th>
      <th style="text-align: center; min-width: 140px;">XẾP LOẠI</th>
    </tr>
  `;
  thead.innerHTML = theadHtml;

  // 2. Render TBODY
  if (trainees.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="${sessions.length + 5}" style="text-align: center; padding: 36px; color: var(--text-muted);">
           Không tìm thấy Trainee nào phù hợp với bộ lọc tìm kiếm.
        </td>
      </tr>
    `;
    if (tfoot) tfoot.innerHTML = '';
    return;
  }

  tbody.innerHTML = trainees.map((t, rankIndex) => {
    const rank = rankIndex + 1;
    let rankBadge = `#${rank}`;
    if (rank === 1) rankBadge = ' Top 1';
    else if (rank === 2) rankBadge = ' Top 2';
    else if (rank === 3) rankBadge = ' Top 3';

    // Map các buổi học của Trainee
    const sessionColsHtml = sessions.map((s, sIdx) => {
      const studentSession = (t.sessionStars || []).find(log => (log.sessionCode && log.sessionCode === s.sessionCode));
      if (studentSession && Number.isFinite(studentSession.starsAwarded)) {
        const stars = studentSession.starsAwarded;
        const isHigh = stars >= 10;
        return `
          <td style="text-align: center;">
            <button type="button" class="session-star-pill ${isHigh ? 'high-star' : ''}"
              data-trainee-id="${escapeHtml(t.traineeId)}"
              data-session-code="${escapeHtml(s.sessionCode)}"
              aria-label="Xem chi tiết ${formatStarDelta(stars)} sao của ${escapeHtml(t.fullName)} ở buổi ${sIdx + 1}"
              title="${isGuest ? `Buổi ${sIdx + 1}` : `Buổi ${sIdx + 1}: ${escapeHtml(studentSession.sessionTitle || s.sessionTitle)}`}&#10;Điểm sao: ${formatStarDelta(stars)}  · Lũy kế: ${studentSession.cumulativeStars ?? t.accumulatedStars} &#10;Lý do: ${escapeHtml(studentSession.note || 'Hoàn thành buổi học')}">
              ${formatStarDelta(stars)}
            </button>
          </td>
        `;
      } else {
        return `
          <td style="text-align: center;">
            <span class="session-star-empty" title="Chưa có dữ liệu buổi học này">—</span>
          </td>
        `;
      }
    }).join('');

    const avatarUrl = getTraineeDicebearAvatar(t);

    return `
      <tr data-trainee-id="${escapeHtml(t.traineeId)}">
        <td style="text-align: center; font-weight: 700; white-space: nowrap;">
          <span style="font-size: 0.88rem; color: ${rank === 1 ? '#eab308' : rank === 2 ? '#94a3b8' : rank === 3 ? '#d97706' : 'var(--text-muted)'};">
            ${rankBadge}
          </span>
        </td>
        <td>
          <div class="admin-user-cell">
            <div class="admin-user-avatar" style="padding: 0; overflow: hidden; background: transparent; width: 34px; height: 34px;">
              <img src="${avatarUrl}" alt="${escapeHtml(t.fullName)}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">
            </div>
            <div class="admin-user-info">
              <span class="admin-user-name" style="font-weight: 700;">${escapeHtml(t.fullName)}</span>
              ${Boolean(window.canViewMssv && window.canViewMssv()) ? `<span class="admin-user-meta">MSSV: <strong>${escapeHtml(t.traineeId)}</strong></span>` : ''}
            </div>
          </div>
        </td>
        <td>
          <div style="font-weight: 600; font-size: 0.84rem;">${escapeHtml(t.batch || 'KHMT2026.2')}</div>
          <div style="font-size: 0.74rem; color: var(--text-muted);">${escapeHtml(t.track || 'Khoa KHMT')}</div>
        </td>
        ${sessionColsHtml}
        <td style="text-align: center;">
          <div class="matrix-total-stars">
             <strong>${t.accumulatedStars || 0}</strong>
          </div>
        </td>
        <td style="text-align: center;">
          <span class="badge ${Number(t.accumulatedStars) >= 40 ? 'badge-primary' : 'badge-warning'}" style="padding: 4px 10px; font-size: 0.76rem;">
            ${escapeHtml(t.starClassification || 'Hạng Vàng')}
          </span>
        </td>
      </tr>
    `;
  }).join('');

  // 3. Render TFOOT (Tổng kết & Trung bình toàn khóa)
  if (tfoot && sessions.length > 0) {
    let tfootColsHtml = sessions.map((s, sIdx) => {
      let sumStars = 0;
      let countAwarded = 0;
      trainees.forEach(t => {
        const studentSession = (t.sessionStars || []).find(log => (log.sessionCode && log.sessionCode === s.sessionCode));
        if (studentSession && Number.isFinite(studentSession.starsAwarded)) {
          sumStars += Number(studentSession.starsAwarded);
          countAwarded++;
        }
      });
      const avg = countAwarded > 0 ? (sumStars / countAwarded).toFixed(1) : '0';
      return `
        <td style="text-align: center;">
          <div style="font-size: 0.82rem; color: #10b981; font-weight: 800;">${formatStarDelta(sumStars)} </div>
          <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 500;">TB: ${formatStarDelta(avg)}</div>
        </td>
      `;
    }).join('');

    let grandTotalStars = 0;
    trainees.forEach(t => grandTotalStars += (Number(t.accumulatedStars) || 0));

    tfoot.innerHTML = `
      <tr>
        <td colspan="3" style="text-align: left; padding-left: 20px;">
          <span style="font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; font-size: 0.78rem;">
             Tổng cộng & Trung bình lớp (${trainees.length} SV)
          </span>
        </td>
        ${tfootColsHtml}
        <td style="text-align: center; color: #f59e0b; font-weight: 800; font-size: 0.95rem;">
           ${grandTotalStars}
        </td>
        <td style="text-align: center; font-size: 0.78rem; color: var(--text-muted);">
          Hoàn thành tốt
        </td>
      </tr>
    `;
  }

  // 4. Gắn sự kiện click mở modal chi tiết cho từng nút sao
  tbody.querySelectorAll('.session-star-pill').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const traineeId = btn.getAttribute('data-trainee-id');
      const sessionCode = btn.getAttribute('data-session-code');
      openSessionStarDetailModal(traineeId, sessionCode);
    });
  });
}

function openSessionStarDetailModal(traineeId, sessionCode) {
  const trainee = (gradesState.traineesList || []).find(t => t.traineeId === traineeId);
  if (!trainee) return;

  const sessionLog = (trainee.sessionStars || []).find(s => s.sessionCode === sessionCode);
  const schedule = (gradesState.editSchedules || []).find(item => item.code === sessionCode);
  const displayLog = sessionLog || (schedule ? { sessionTitle: schedule.title, sessionDate: schedule.date, trainerName: schedule.instructor, starsAwarded: null, cumulativeStars: null, note: 'Chưa có bản ghi.' } : null);
  if (!displayLog) return;
  const modal = document.getElementById('sessionStarDetailModal');
  if (!modal) return;

  const elName = document.getElementById('starDetailStudentName');
  const elMeta = document.getElementById('starDetailStudentMeta');
  const elAvatar = document.getElementById('starDetailStudentAvatar');
  const elAwarded = document.getElementById('starDetailAwardedStars');
  const elCumulative = document.getElementById('starDetailCumulativeStars');
  const elSessionName = document.getElementById('starDetailSessionName');
  const elSessionDate = document.getElementById('starDetailSessionDate');
  const elTrainer = document.getElementById('starDetailTrainer');
  const elNote = document.getElementById('starDetailNote');

  if (elName) elName.textContent = trainee.fullName;
  const showMssv = Boolean(window.canViewMssv && window.canViewMssv());
  if (elMeta) elMeta.textContent = showMssv ? `MSSV: ${trainee.traineeId} · ${trainee.track || 'Khoa KHMT'} (${trainee.batch || 'KHMT2026.2'})` : `${trainee.track || 'Khoa KHMT'} (${trainee.batch || 'KHMT2026.2'})`;
  if (elAvatar) {
    const avatarUrl = getTraineeDicebearAvatar(trainee);
    elAvatar.innerHTML = `<img src="${avatarUrl}" alt="${escapeHtml(trainee.fullName)}" style="width: 100%; height: 100%; object-fit: cover;">`;
  }

  if (displayLog) {
    const isGuest = Boolean(window.state ? !window.state.currentUser : false);
    if (elAwarded) elAwarded.textContent = `${formatStarDelta(displayLog.starsAwarded)} `;
    if (elCumulative) elCumulative.textContent = formatTraineeMetric(displayLog.cumulativeStars);
    if (elSessionName) {
      if (isGuest) {
        const match = (displayLog.sessionTitle || '').match(/^(buổi\s*\d+)/i);
        elSessionName.textContent = match ? match[1].charAt(0).toUpperCase() + match[1].slice(1) : `Buổi học (${displayLog.sessionDate ? formatDateVN(displayLog.sessionDate) : sessionCode})`;
      } else {
        elSessionName.textContent = displayLog.sessionTitle || sessionCode;
      }
    }
    if (elSessionDate) elSessionDate.textContent = displayLog.sessionDate ? formatDateVN(displayLog.sessionDate) : '—';
    if (elTrainer) elTrainer.textContent = isGuest ? 'Đăng nhập để xem' : (displayLog.trainerName || 'Chưa cập nhật');
    if (elNote) elNote.textContent = displayLog.note || 'Điểm danh đúng giờ, tham gia tích cực và hoàn thành xuất sắc yêu cầu buổi học.';
  }

  const form = document.getElementById('attendanceEditorForm');
  if (form) {
    form.hidden = !canManage('attendance:manage');
    form.dataset.traineeId = traineeId;
    form.dataset.sessionCode = sessionCode;
    form.dataset.sessionDate = displayLog.sessionDate;
    document.getElementById('attendanceEditStatus').value = sessionLog?.attendanceStatus || '';
    document.getElementById('attendanceEditStars').value = sessionLog?.starsAwarded ?? '';
    document.getElementById('attendanceEditNote').value = sessionLog?.note || '';
    document.getElementById('attendanceEditorFeedback').textContent = '';
  }

  modal.classList.add('open', 'show');
}

function renderSessionReferenceSection() {
  const container = document.getElementById('sessionReferenceGrid');
  if (!container) return;

  const sessions = gradesState.uniqueSessions || [];
  if (sessions.length === 0) {
    container.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem;">Đang tải danh sách buổi học...</div>`;
    return;
  }

  container.innerHTML = sessions.map((s, idx) => {
    return `
      <div class="session-reference-item clickable-session-ref" role="button" tabindex="0" title="Nhấp để xem buổi học này trong Thời khóa biểu" data-date="${escapeHtml(s.sessionDate || '')}" data-code="${escapeHtml(s.sessionCode || '')}">
        <div class="session-ref-header">
          <span class="session-ref-code">${escapeHtml(s.sessionCode || `Buổi ${idx + 1}`)}</span>
          <span class="session-ref-date"> ${s.sessionDate ? formatDateVN(s.sessionDate) : 'Chưa xếp ngày'}</span>
        </div>
        <h5 class="session-ref-title">${escapeHtml(s.sessionTitle)}</h5>
        <div class="session-ref-stage">
          <span>${escapeHtml(s.stage || 'Giai đoạn 1')}</span> ·
          <span>Trainer: ${!state.currentUser ? '<strong style="font-style: italic;">Đăng nhập để xem</strong>' : `<strong>${escapeHtml(s.trainerName || 'Chưa cập nhật')}</strong>`}</span>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.clickable-session-ref').forEach(card => {
    const navigateToSchedule = () => {
      const dateStr = card.dataset.date;
      if (dateStr && /^\d{4}-\d{2}/.test(dateStr)) {
        const [y, m] = dateStr.split('-').map(Number);
        if (window.ScheduleManager) {
          window.ScheduleManager.selectedYear = y;
          window.ScheduleManager.selectedMonth = m;
          const monthInput = document.getElementById('filterScheduleMonth');
          if (monthInput) monthInput.value = `${y}-${String(m).padStart(2, '0')}`;
        }
      }
      if (typeof window.switchTab === 'function') {
        window.switchTab('schedule');
      }
    };

    card.addEventListener('click', navigateToSchedule);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        navigateToSchedule();
      }
    });
  });
}



async function setupAttendanceControls() {
  const month = document.getElementById('attendanceMonth');
  const traineeSelect = document.getElementById('attendanceTraineeSelect');
  if (!month || !traineeSelect) return;
  const previous = traineeSelect.value;
  traineeSelect.innerHTML = (state.trainees || []).map(trainee => `<option value="${escapeHtml(trainee.traineeId)}">${escapeHtml(trainee.fullName)} (${escapeHtml(trainee.traineeId)})</option>`).join('');
  if ((state.trainees || []).some(trainee => trainee.traineeId === previous)) traineeSelect.value = previous;
  if (!month.dataset.bound) {
    month.dataset.bound = 'true';
    month.value = `${window.ScheduleManager.selectedYear}-${String(window.ScheduleManager.selectedMonth).padStart(2, '0')}`;
    month.addEventListener('change', loadAttendanceSchedules);
    document.getElementById('btnOpenAttendanceEditor').addEventListener('click', () => {
      const code = document.getElementById('attendanceSessionSelect').value;
      if (code && traineeSelect.value) openSessionStarDetailModal(traineeSelect.value, code);
    });
    document.getElementById('attendanceEditorForm').addEventListener('submit', async event => {
      event.preventDefault();
      if (!canManage('attendance:manage')) return;
      const form = event.currentTarget;
      const button = document.getElementById('btnSaveAttendance');
      const feedback = document.getElementById('attendanceEditorFeedback');
      button.disabled = true;
      feedback.textContent = 'Đang lưu…';
      try {
        await API.saveAttendance(form.dataset.traineeId, form.dataset.sessionCode, {
          sessionDate: form.dataset.sessionDate, attendanceStatus: document.getElementById('attendanceEditStatus').value,
          starsAwarded: Number(document.getElementById('attendanceEditStars').value), note: document.getElementById('attendanceEditNote').value
        });
        await refreshPortalData();
        openSessionStarDetailModal(form.dataset.traineeId, form.dataset.sessionCode);
        feedback.textContent = 'Đã lưu. Tổng sao, chuyên cần và bảng xếp hạng đã cập nhật.';
      } catch (error) { feedback.textContent = error.message; }
      finally { button.disabled = false; }
    });
  }
  await loadAttendanceSchedules();
}

async function loadAttendanceSchedules() {
  const month = document.getElementById('attendanceMonth');
  const select = document.getElementById('attendanceSessionSelect');
  const button = document.getElementById('btnOpenAttendanceEditor');
  if (!month.value || !month.validity.valid) return;
  const previous = select.value;
  const [year, selectedMonth] = month.value.split('-').map(Number);
  const request = (gradesState.scheduleRequest || 0) + 1;
  gradesState.scheduleRequest = request;
  const feedback = document.getElementById('attendanceControlsFeedback');
  button.disabled = true;
  select.innerHTML = '<option value="">Đang tải lịch…</option>';
  try {
    const schedules = await API.getSchedules({ month: selectedMonth, year });
    if (request !== gradesState.scheduleRequest) return;
    gradesState.editSchedules = schedules;
    select.innerHTML = schedules.map(schedule => `<option value="${escapeHtml(schedule.code)}">${escapeHtml(schedule.title)} (${escapeHtml(schedule.date)})</option>`).join('') || '<option value="">Tháng này chưa có buổi học</option>';
    if (schedules.some(schedule => schedule.code === previous)) select.value = previous;
    feedback.textContent = 'Chọn buổi và Trainee để ghi nhận hoặc sửa trực tiếp.';
    button.disabled = !schedules.length;
  } catch (error) {
    if (request !== gradesState.scheduleRequest) return;
    select.innerHTML = '<option value="">Không tải được lịch</option>';
    feedback.textContent = error.message + ' Chọn lại tháng để thử lại.';
  }
}

function initGradesModule() {
  setupGradesFilters();
}

function openStarDetailModal(traineeId, sessionCode) {
  openSessionStarDetailModal(traineeId, sessionCode);
}

function hasUnsavedGradeChanges() {
  const container = document.getElementById('gradesSessionsList');
  if (!container) return false;
  const gradeInputs = container.querySelectorAll('.inline-grade-star, .inline-grade-status, .inline-grade-note');
  for (const el of gradeInputs) {
    const initial = el.getAttribute('data-initial') ?? '';
    const current = el.value ?? '';
    if (String(current).trim() !== String(initial).trim()) {
      return true;
    }
  }
  return false;
}

// Expose to global window
window.gradesState = gradesState;
window.initGradesModule = initGradesModule;
window.renderGradesView = renderGradesView;
window.openStarDetailModal = openStarDetailModal;
window.hasUnsavedGradeChanges = hasUnsavedGradeChanges;
