/**
 * ==============================================================================
 * COMPONENT: Grades Module (Bảng Điểm Sao Rèn Luyện Theo Buổi Học)
 * CHỨC NĂNG CHÍNH: Hiển thị chi tiết bảng điểm sao rèn luyện của sinh viên qua từng
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

// Trích xuất danh sách tất cả các buổi học duy nhất trên toàn bộ sinh viên
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
          trainerName: s.trainerName || 'Võ Thị Xuân Quỳnh',
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

async function renderGradesView() {
  // Đảm bảo dữ liệu sinh viên luôn mới nhất từ MongoDB Atlas
  try {
    if (!state.trainees || state.trainees.length === 0) {
      await loadTrainees();
    }
  } catch (err) {
    console.warn('Lỗi khi tải dữ liệu trainees cho bảng điểm:', err);
  }

  // Danh sách sinh viên sắp xếp theo số sao giảm dần
  const trainees = (state.trainees || []).slice().sort((a, b) => (Number(b.accumulatedStars) || 0) - (Number(a.accumulatedStars) || 0));
  gradesState.traineesList = trainees;
  gradesState.uniqueSessions = extractUniqueSessions(trainees);

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
}

function updateGradesKpis(trainees, sessions) {
  const elTotalTrainees = document.getElementById('kpiTotalTrainees');
  const elTotalSessions = document.getElementById('kpiTotalSessions');
  const elTotalStars = document.getElementById('kpiTotalStarsEarned');
  const elTopStudent = document.getElementById('kpiTopStudent');
  const elLatestDate = document.getElementById('kpiLatestSessionDate');

  if (elTotalTrainees) elTotalTrainees.textContent = `${trainees.length} học viên`;
  if (elTotalSessions) elTotalSessions.textContent = `${sessions.length} buổi học`;

  // Tính tổng số sao toàn khóa
  let totalStars = 0;
  trainees.forEach(t => {
    totalStars += Number(t.accumulatedStars) || 0;
  });
  if (elTotalStars) elTotalStars.textContent = `${totalStars} ⭐`;

  // Học viên dẫn đầu (Top 1)
  if (trainees.length > 0 && elTopStudent) {
    const top = trainees[0];
    elTopStudent.textContent = `${top.fullName} (${top.accumulatedStars || 0} ⭐)`;
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
    btnPrint.onclick = () => {
      window.print();
    };
  }

  // Modal đóng chi tiết sao
  const btnCloseModal = document.getElementById('closeStarDetailModalBtn');
  const btnCloseModal2 = document.getElementById('btnCloseStarDetailModal');
  const modal = document.getElementById('sessionStarDetailModal');
  const closeModal = () => {
    if (modal) modal.classList.remove('open', 'show');
  };
  if (btnCloseModal) btnCloseModal.onclick = closeModal;
  if (btnCloseModal2) btnCloseModal2.onclick = closeModal;
  if (modal) {
    modal.onclick = (e) => {
      if (e.target === modal) closeModal();
    };
  }
}

function renderSessionPills() {
  const container = document.getElementById('gradesSessionPillsList');
  if (!container) return;

  const sessions = gradesState.uniqueSessions || [];
  let html = `
    <button type="button" class="session-pill-btn ${gradesState.sessionFilter === 'all' ? 'active' : ''}" data-session="all">
      ⭐ Tất cả buổi học (${sessions.length})
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

  const allSessions = gradesState.uniqueSessions || [];
  let sessionsToRender = allSessions;
  if (gradesState.sessionFilter && gradesState.sessionFilter !== 'all') {
    sessionsToRender = allSessions.filter(s => s.sessionCode === gradesState.sessionFilter);
  }

  let trainees = gradesState.traineesList || [];

  // Lọc theo searchFilter
  if (gradesState.searchFilter) {
    const q = gradesState.searchFilter;
    trainees = trainees.filter(t =>
      (t.fullName && t.fullName.toLowerCase().includes(q)) ||
      (t.traineeId && t.traineeId.toLowerCase().includes(q)) ||
      (t.email && t.email.toLowerCase().includes(q))
    );
  }

  // Lọc theo trackFilter
  if (gradesState.trackFilter && gradesState.trackFilter !== 'all') {
    const trk = gradesState.trackFilter.toLowerCase();
    trainees = trainees.filter(t =>
      (t.track && t.track.toLowerCase().includes(trk)) ||
      (t.department && t.department.toLowerCase().includes(trk))
    );
  }

  if (countBadge) {
    countBadge.textContent = `${trainees.length} học viên · ${allSessions.length} buổi học`;
  }

  if (sessionsToRender.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 48px; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-color); color: var(--text-muted);">
        📅 Chưa có dữ liệu buổi học nào phù hợp.
      </div>
    `;
    return;
  }

  container.innerHTML = sessionsToRender.map((s) => {
    const sessionIdx = allSessions.findIndex(item => item.sessionCode === s.sessionCode);
    const displayNum = sessionIdx >= 0 ? sessionIdx + 1 : 1;

    // Lọc danh sách học viên tham gia buổi học này
    const studentRows = [];
    let sessionTotalStars = 0;

    trainees.forEach(t => {
      const studentSession = (t.sessionStars || []).find(log => (log.sessionCode && log.sessionCode === s.sessionCode)) || (t.sessionStars && t.sessionStars[sessionIdx]);
      if (studentSession) {
        const stars = Number(studentSession.starsAwarded) || 0;
        sessionTotalStars += stars;
        studentRows.push({
          trainee: t,
          sessionLog: studentSession,
          starsAwarded: stars,
          cumulativeStars: studentSession.cumulativeStars || t.accumulatedStars || 0,
          note: studentSession.note || 'Hoàn thành bài tập & tham gia tích cực'
        });
      }
    });

    // Sắp xếp sinh viên theo số sao cộng của buổi này giảm dần
    studentRows.sort((a, b) => b.starsAwarded - a.starsAwarded);

    const attendedCount = studentRows.length;
    const avgStars = attendedCount > 0 ? (sessionTotalStars / attendedCount).toFixed(1) : '0';

    let tbodyRowsHtml = '';
    if (studentRows.length === 0) {
      tbodyRowsHtml = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 28px; color: var(--text-muted);">
            🔍 Không tìm thấy học viên nào phù hợp bộ lọc trong buổi học này.
          </td>
        </tr>
      `;
    } else {
      tbodyRowsHtml = studentRows.map((item, rIdx) => {
        const rank = rIdx + 1;
        let rankBadge = `#${rank}`;
        if (rank === 1) rankBadge = '🥇 #1';
        else if (rank === 2) rankBadge = '🥈 #2';
        else if (rank === 3) rankBadge = '🥉 #3';

        const t = item.trainee;
        const avatarUrl = getTraineeDicebearAvatar(t);

        return `
          <tr data-trainee-id="${escapeHtml(t.traineeId)}" data-session-code="${escapeHtml(s.sessionCode)}">
            <td style="text-align: center; font-weight: 700; white-space: nowrap; color: ${rank === 1 ? '#eab308' : rank === 2 ? '#94a3b8' : rank === 3 ? '#d97706' : 'var(--text-muted)'};">
              ${rankBadge}
            </td>
            <td>
              <div class="admin-user-cell">
                <div class="admin-user-avatar" style="padding: 0; overflow: hidden; background: transparent; width: 34px; height: 34px;">
                  <img src="${avatarUrl}" alt="${escapeHtml(t.fullName)}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">
                </div>
                <div class="admin-user-info">
                  <span class="admin-user-name" style="font-weight: 700;">${escapeHtml(t.fullName)}</span>
                  <span class="admin-user-meta">MSSV: <strong>${escapeHtml(t.traineeId)}</strong></span>
                </div>
              </div>
            </td>
            <td>
              <div style="font-weight: 600; font-size: 0.84rem;">${escapeHtml(t.batch || 'KHMT2026.2')}</div>
              <div style="font-size: 0.74rem; color: var(--text-muted);">${escapeHtml(t.track || 'Khoa KHMT')}</div>
            </td>
            <td style="text-align: center;">
              <span class="session-star-badge-lg" title="Cộng ${item.starsAwarded} ⭐ trong buổi này">
                +${item.starsAwarded} ⭐
              </span>
            </td>
            <td style="text-align: center;">
              <span style="font-weight: 700; color: var(--text-main); font-size: 0.9rem;">
                ${item.cumulativeStars} ⭐
              </span>
            </td>
            <td style="max-width: 320px;">
              <div style="font-size: 0.82rem; color: var(--text-secondary); line-height: 1.45; font-style: italic;">
                "${escapeHtml(item.note)}"
              </div>
            </td>
            <td style="text-align: center;">
              <button type="button" class="btn btn-outline btn-xs btn-open-session-detail" 
                      data-trainee-id="${escapeHtml(t.traineeId)}" 
                      data-session-code="${escapeHtml(s.sessionCode)}"
                      title="Xem chi tiết nhận xét & đánh giá">
                <span>🔍 Xem</span>
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }

    return `
      <div class="session-box-card" id="session-box-${escapeHtml(s.sessionCode)}">
        <!-- Header Box Buổi Học -->
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
                <span class="session-tag-date">📅 ${s.sessionDate ? formatDateVN(s.sessionDate) : 'Chưa xếp ngày'}</span>
              </div>
              <h3 class="session-box-title">${escapeHtml(s.sessionTitle)}</h3>
              <div class="session-box-trainer">
                <span>Trainer phụ trách: <strong>${escapeHtml(s.trainerName || 'Võ Thị Xuân Quỳnh')}</strong> (quynhvtx@uit.edu.vn)</span>
              </div>
            </div>
          </div>
          <div class="session-box-stats">
            <div class="session-stat-chip">
              <span class="session-stat-chip-label">Học viên</span>
              <span class="session-stat-chip-val">${attendedCount} SV</span>
            </div>
            <div class="session-stat-chip">
              <span class="session-stat-chip-label">Tổng sao cộng</span>
              <span class="session-stat-chip-val gold">+${sessionTotalStars} ⭐</span>
            </div>
            <div class="session-stat-chip">
              <span class="session-stat-chip-label">Trung bình</span>
              <span class="session-stat-chip-val">+${avgStars} ⭐/SV</span>
            </div>
          </div>
        </div>

        <!-- Bảng sinh viên tham gia & sao cộng trong buổi này -->
        <div class="session-box-body">
          <div class="table-responsive">
            <table class="session-box-table">
              <thead>
                <tr>
                  <th style="width: 70px; text-align: center;">HẠNG</th>
                  <th style="min-width: 220px;">HỌC VIÊN / TRAINEE</th>
                  <th style="min-width: 130px;">KHOA / LỚP</th>
                  <th style="width: 140px; text-align: center;">⭐ SAO CỘNG BUỔI NÀY</th>
                  <th style="width: 110px; text-align: center;">LŨY KẾ SAU BUỔI</th>
                  <th style="min-width: 260px;">📝 ĐÁNH GIÁ CỦA TRAINER BUỔI HỌC</th>
                  <th style="width: 90px; text-align: center;">CHI TIẾT</th>
                </tr>
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

  // Gắn sự kiện click mở modal chi tiết
  container.querySelectorAll('.btn-open-session-detail').forEach(btn => {
    btn.onclick = () => {
      const traineeId = btn.getAttribute('data-trainee-id');
      const sessionCode = btn.getAttribute('data-session-code');
      openSessionStarDetailModal(traineeId, sessionCode);
    };
  });
}

function renderGradesMatrixTable() {
  const thead = document.getElementById('gradesMatrixThead');
  const tbody = document.getElementById('gradesMatrixTbody');
  const tfoot = document.getElementById('gradesMatrixTfoot');
  const countBadge = document.getElementById('gradesCountBadge');
  if (!thead || !tbody) return;

  const sessions = gradesState.uniqueSessions || [];
  let trainees = gradesState.traineesList || [];

  // Lọc theo searchFilter
  if (gradesState.searchFilter) {
    const q = gradesState.searchFilter;
    trainees = trainees.filter(t =>
      (t.fullName && t.fullName.toLowerCase().includes(q)) ||
      (t.traineeId && t.traineeId.toLowerCase().includes(q)) ||
      (t.email && t.email.toLowerCase().includes(q))
    );
  }

  // Lọc theo trackFilter
  if (gradesState.trackFilter && gradesState.trackFilter !== 'all') {
    const trk = gradesState.trackFilter;
    trainees = trainees.filter(t =>
      (t.track && t.track.toLowerCase().includes(trk.toLowerCase())) ||
      (t.department && t.department.toLowerCase().includes(trk.toLowerCase()))
    );
  }

  if (countBadge) {
    countBadge.textContent = `${trainees.length} học viên · ${sessions.length} buổi học`;
  }

  // 1. Render THEAD
  let theadHtml = `
    <tr>
      <th style="width: 70px; text-align: center;">HẠNG</th>
      <th style="min-width: 220px;">HỌC VIÊN / TRAINEE</th>
      <th style="min-width: 130px;">KHOA / LỚP</th>
  `;

  sessions.forEach((s, idx) => {
    const shortDate = s.sessionDate ? formatDateShort(s.sessionDate) : `B${idx + 1}`;
    theadHtml += `
      <th class="col-session-header" title="${escapeHtml(s.sessionTitle)}">
        <div class="session-header-code">Buổi ${idx + 1}</div>
        <div class="session-header-date">${escapeHtml(shortDate)}</div>
      </th>
    `;
  });

  theadHtml += `
      <th style="text-align: center; min-width: 120px;">TỔNG SAO ⭐</th>
      <th style="text-align: center; min-width: 140px;">XẾP LOẠI</th>
    </tr>
  `;
  thead.innerHTML = theadHtml;

  // 2. Render TBODY
  if (trainees.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="${sessions.length + 5}" style="text-align: center; padding: 36px; color: var(--text-muted);">
          🔍 Không tìm thấy học viên nào phù hợp với bộ lọc tìm kiếm.
        </td>
      </tr>
    `;
    if (tfoot) tfoot.innerHTML = '';
    return;
  }

  tbody.innerHTML = trainees.map((t, rankIndex) => {
    const rank = rankIndex + 1;
    let rankBadge = `#${rank}`;
    if (rank === 1) rankBadge = '🥇 Top 1';
    else if (rank === 2) rankBadge = '🥈 Top 2';
    else if (rank === 3) rankBadge = '🥉 Top 3';

    // Map các buổi học của học viên
    const sessionColsHtml = sessions.map((s, sIdx) => {
      const studentSession = (t.sessionStars || []).find(log => (log.sessionCode && log.sessionCode === s.sessionCode)) || (t.sessionStars && t.sessionStars[sIdx]);
      if (studentSession && studentSession.starsAwarded > 0) {
        const stars = studentSession.starsAwarded;
        const isHigh = stars >= 10;
        return `
          <td style="text-align: center;">
            <button type="button" class="session-star-pill ${isHigh ? 'high-star' : ''}" 
              data-trainee-id="${escapeHtml(t.traineeId)}" 
              data-session-code="${escapeHtml(s.sessionCode)}"
              title="Buổi ${sIdx + 1}: ${escapeHtml(studentSession.sessionTitle || s.sessionTitle)}&#10;Cộng: +${stars} ⭐ · Lũy kế: ${studentSession.cumulativeStars || t.accumulatedStars} ⭐&#10;Lý do: ${escapeHtml(studentSession.note || 'Hoàn thành buổi học')}">
              +${stars} ⭐
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
              <span class="admin-user-meta">MSSV: <strong>${escapeHtml(t.traineeId)}</strong></span>
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
            ⭐ <strong>${t.accumulatedStars || 0}</strong>
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
        const studentSession = (t.sessionStars || []).find(log => (log.sessionCode && log.sessionCode === s.sessionCode)) || (t.sessionStars && t.sessionStars[sIdx]);
        if (studentSession && studentSession.starsAwarded > 0) {
          sumStars += Number(studentSession.starsAwarded);
          countAwarded++;
        }
      });
      const avg = trainees.length > 0 ? (sumStars / trainees.length).toFixed(1) : '0';
      return `
        <td style="text-align: center;">
          <div style="font-size: 0.82rem; color: #10b981; font-weight: 800;">+${sumStars} ⭐</div>
          <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 500;">TB: +${avg}</div>
        </td>
      `;
    }).join('');

    let grandTotalStars = 0;
    trainees.forEach(t => grandTotalStars += (Number(t.accumulatedStars) || 0));

    tfoot.innerHTML = `
      <tr>
        <td colspan="3" style="text-align: left; padding-left: 20px;">
          <span style="font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; font-size: 0.78rem;">
            📊 Tổng cộng & Trung bình lớp (${trainees.length} SV)
          </span>
        </td>
        ${tfootColsHtml}
        <td style="text-align: center; color: #f59e0b; font-weight: 800; font-size: 0.95rem;">
          ⭐ ${grandTotalStars}
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

  const sessionLog = (trainee.sessionStars || []).find(s => s.sessionCode === sessionCode) || (trainee.sessionStars && trainee.sessionStars[0]);
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
  if (elMeta) elMeta.textContent = `MSSV: ${trainee.traineeId} · ${trainee.track || 'Khoa KHMT'} (${trainee.batch || 'KHMT2026.2'})`;
  if (elAvatar) {
    const avatarUrl = getTraineeDicebearAvatar(trainee);
    elAvatar.innerHTML = `<img src="${avatarUrl}" alt="${escapeHtml(trainee.fullName)}" style="width: 100%; height: 100%; object-fit: cover;">`;
  }

  if (sessionLog) {
    if (elAwarded) elAwarded.textContent = `+${sessionLog.starsAwarded || 0} ⭐`;
    if (elCumulative) elCumulative.textContent = `${sessionLog.cumulativeStars || trainee.accumulatedStars || 0} ⭐`;
    if (elSessionName) elSessionName.textContent = sessionLog.sessionTitle || sessionCode;
    if (elSessionDate) elSessionDate.textContent = sessionLog.sessionDate ? formatDateVN(sessionLog.sessionDate) : '—';
    if (elTrainer) elTrainer.textContent = sessionLog.trainerName || 'Võ Thị Xuân Quỳnh';
    if (elNote) elNote.textContent = sessionLog.note || 'Điểm danh đúng giờ, tham gia tích cực và hoàn thành xuất sắc yêu cầu buổi học.';
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
      <div class="session-reference-item">
        <div class="session-ref-header">
          <span class="session-ref-code">${escapeHtml(s.sessionCode || `Buổi ${idx + 1}`)}</span>
          <span class="session-ref-date">📅 ${s.sessionDate ? formatDateVN(s.sessionDate) : 'Chưa xếp ngày'}</span>
        </div>
        <h5 class="session-ref-title">${escapeHtml(s.sessionTitle)}</h5>
        <div class="session-ref-stage">
          <span>${escapeHtml(s.stage || 'Giai đoạn 1')}</span> · 
          <span>Trainer: <strong>${escapeHtml(s.trainerName || 'Võ Thị Xuân Quỳnh')}</strong></span>
        </div>
      </div>
    `;
  }).join('');
}


function initGradesModule() {
  setupGradesFilters();
}

function openStarDetailModal(traineeId, sessionCode) {
  openSessionStarDetailModal(traineeId, sessionCode);
}

// Expose to global window
window.gradesState = gradesState;
window.initGradesModule = initGradesModule;
window.renderGradesView = renderGradesView;
window.openStarDetailModal = openStarDetailModal;
