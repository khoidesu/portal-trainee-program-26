/**
 * ==============================================================================
 * COMPONENT: Leaderboard Module (Bảng Xếp Hạng & Bục Vinh Danh Podium)
 * CHỨC NĂNG CHÍNH: Tính toán xếp hạng, hiển thị bục vinh danh Top 3, bộ lọc tìm kiếm
 *                  theo chuyên ban và modal xem chi tiết hồ sơ Trainee.
 * LIÊN KẾT & PHỤ THUỘC: public/js/modules/core.js, public/js/api.js
 * NHIỆM VỤ CHI TIẾT:
 *   - renderLeaderboard: Sắp xếp danh sách Trainee theo sao và phân hạng
 *   - renderPodium: Hiển thị bục vinh danh Top 1, 2, 3 với hiệu ứng nổi bật
 *   - renderRankingTable: Bảng danh sách toàn bộ Trainee kèm tìm kiếm & lọc Track
 *   - openTraineeDetail: Mở modal xem hồ sơ chi tiết và lịch sử sao của từng SV
 * ==============================================================================
 */

// ==========================================
// RENDER FUNCTIONS - LEADERBOARD
// ==========================================
function renderLeaderboard() {
  renderPodium();
  renderLeaderboardTable();
  renderSummaryStats();
}

function renderSummaryStats() {
  const total = state.trainees.length;
  if (total === 0) { elements.leaderboardSummaryStats.textContent = 'Chưa có Trainee.'; return; }

  const totalStars = state.trainees.reduce((acc, t) => acc + (Number(t.accumulatedStars) || 0), 0);
  const verified = state.trainees.filter(trainee => Number.isFinite(trainee.accumulatedStars));
  const maxStars = verified.length ? Math.max(...verified.map(trainee => trainee.accumulatedStars)) : null;
  const avgStars = verified.length ? Math.round(totalStars / verified.length) : null;

  elements.leaderboardSummaryStats.innerHTML = `
    <div class="stat-pill-item">
      <span class="stat-pill-num">${total}</span>
      <span class="stat-pill-label">Tổng Trainee</span>
    </div>
    <div class="stat-pill-item">
      <span class="stat-pill-num">${formatTraineeMetric(maxStars)} </span>
      <span class="stat-pill-label">Sao cao nhất</span>
    </div>
    <div class="stat-pill-item">
      <span class="stat-pill-num">${formatTraineeMetric(avgStars)} </span>
      <span class="stat-pill-label">Số sao trung bình</span>
    </div>
  `;
}

function renderPodium() {
  // BẢNG XẾP HẠNG THUẦN TÚY DỰA TRÊN SỐ SAO TÍCH LŨY (KHÔNG LIÊN QUAN ĐẾN ĐIỂM KHÁC)
  const sorted = state.trainees.filter(trainee => Number.isFinite(trainee.accumulatedStars)).sort((a, b) => (Number(b.accumulatedStars) || 0) - (Number(a.accumulatedStars) || 0));

  const section = document.getElementById('podiumSection');
  if (section) section.style.display = sorted.length ? '' : 'none';
  [elements.podiumRank1, elements.podiumRank2, elements.podiumRank3].forEach((card, index) => { if (card) card.style.display = sorted[index] ? '' : 'none'; });

  // Top 1 (Số sao nhiều nhất)
  if (sorted[0]) {
    elements.podium1Name.textContent = sorted[0].fullName;
    elements.podium1Track.textContent = sorted[0].department || sorted[0].track;
    elements.podium1Score.textContent = `${sorted[0].accumulatedStars || 0} sao`;
    elements.podium1Avatar.src = getTraineeDicebearAvatar(sorted[0]);
    elements.podiumRank1.onclick = () => openTraineeDetail(sorted[0].traineeId);
  }

  // Top 2
  if (sorted[1]) {
    elements.podium2Name.textContent = sorted[1].fullName;
    elements.podium2Track.textContent = sorted[1].department || sorted[1].track;
    elements.podium2Score.textContent = `${sorted[1].accumulatedStars || 0} sao`;
    elements.podium2Avatar.src = getTraineeDicebearAvatar(sorted[1]);
    elements.podiumRank2.onclick = () => openTraineeDetail(sorted[1].traineeId);
  }

  // Top 3
  if (sorted[2]) {
    elements.podium3Name.textContent = sorted[2].fullName;
    elements.podium3Track.textContent = sorted[2].department || sorted[2].track;
    elements.podium3Score.textContent = `${sorted[2].accumulatedStars || 0} sao`;
    elements.podium3Avatar.src = getTraineeDicebearAvatar(sorted[2]);
    elements.podiumRank3.onclick = () => openTraineeDetail(sorted[2].traineeId);
  }
}

function renderLeaderboardTable() {
  const tbody = elements.leaderboardTableBody;
  tbody.innerHTML = '';

  const isAdmin = state.currentUser && state.currentUser.role === 'admin';

  let filtered = [...state.trainees];

  // Lọc tìm kiếm
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    filtered = filtered.filter(t =>
      t.fullName.toLowerCase().includes(q) ||
      t.traineeId.toLowerCase().includes(q) ||
      (t.email || '').toLowerCase().includes(q)
    );
  }

  // Lọc theo khoa/chuyên ngành
  if (state.selectedTrack !== 'all') {
    filtered = filtered.filter(t =>
      t.track.toLowerCase().includes(state.selectedTrack.toLowerCase()) ||
      t.department.toLowerCase().includes(state.selectedTrack.toLowerCase())
    );
  }

  // Sắp xếp: Mặc định xếp hạng thuần túy theo số sao tích lũy (accumulatedStars)
  if (state.sortBy === 'stars_asc') {
    filtered.sort((a, b) => (Number(a.accumulatedStars) || 0) - (Number(b.accumulatedStars) || 0));
  } else if (state.sortBy === 'attended_desc') {
    filtered.sort((a, b) => (Number(b.attendedSessions) || 0) - (Number(a.attendedSessions) || 0));
  } else if (state.sortBy === 'name_asc') {
    filtered.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'vi'));
  } else {
    // Mặc định: Số sao nhiều nhất xếp trước
    filtered.sort((a, b) => (Number(b.accumulatedStars) || 0) - (Number(a.accumulatedStars) || 0));
  }

  // Bảng xếp hạng theo số sao trên toàn bộ cơ sở dữ liệu
  const starRankMap = new Map();
  const allByStars = state.trainees.filter(trainee => Number.isFinite(trainee.accumulatedStars)).sort((a, b) => (Number(b.accumulatedStars) || 0) - (Number(a.accumulatedStars) || 0));
  allByStars.forEach((t, i) => {
    starRankMap.set(t.traineeId, i + 1);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 32px; color: var(--text-muted);">
          Không tìm thấy Trainee nào phù hợp với bộ lọc.
        </td>
      </tr>
    `;
    return;
  }

  filtered.forEach((t, idx) => {
    const tr = document.createElement('tr');
    if (t.traineeId === state.currentTraineeId) {
      tr.classList.add('active-student-row');
    }

    // Thứ hạng dựa trên số sao tích lũy
    const rankNum = starRankMap.get(t.traineeId) || '—';
    let rankBadgeClass = 'rank-other';
    if (rankNum === 1) rankBadgeClass = 'rank-1';
    else if (rankNum === 2) rankBadgeClass = 'rank-2';
    else if (rankNum === 3) rankBadgeClass = 'rank-3';

    tr.innerHTML = `
      <td style="text-align: center;">
        <span class="rank-badge ${rankBadgeClass}">${rankNum}</span>
      </td>
      <td>
        <div class="table-student-cell">
          <img src="${getTraineeDicebearAvatar(t)}" alt="${escapeHtml(t.fullName)}" class="table-avatar-img" style="object-fit: cover;">
          <div>
            <span class="table-student-name">${escapeHtml(t.fullName)}</span>
            <span class="table-student-id">MSSV: ${escapeHtml(t.traineeId)}</span>
          </div>
        </div>
      </td>
      <td>
        <span style="font-weight: 500; color: var(--text-main);">${escapeHtml(t.track || t.department || '')}</span>
        <span style="display: block; font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(t.batch || '')}</span>
      </td>
      <td style="text-align: center;">
        <span class="star-badge-pill"> <strong>${formatTraineeMetric(t.accumulatedStars)}</strong> sao</span>
      </td>
      <td style="text-align: center;">
        <span style="font-weight: 600; color: var(--text-main);">${formatTraineeMetric(t.attendedSessions)}</span>
        <span style="color: var(--text-muted); font-size: 0.8rem;">/ ${formatTraineeMetric(t.totalSessions)} buổi</span>
      </td>
      <td style="text-align: center;">
        <span style="font-size: 0.82rem; color: var(--text-muted);">
          CP: <strong style="color: var(--accent-orange);">${formatTraineeMetric(t.absentExcused)}</strong> · KP: <strong style="color: ${(Number(t.absentUnexcused) || 0) > 0 ? 'var(--accent-red)' : 'var(--text-muted)'};">${formatTraineeMetric(t.absentUnexcused)}</strong>
        </span>
      </td>
      <td style="text-align: center;">
        <span class="badge-tag ${t.status === 'Ngừng học' ? 'status-stopped' : 'status-active'}" style="padding: 2px 8px; font-size: 0.72rem;">${escapeHtml(t.status || 'Đang học')}</span>
      </td>
      <td style="text-align: center;">
        <button class="table-action-btn" onclick="openTraineeDetail('${escapeHtml(t.traineeId)}')" title="Xem thông tin chi tiết Trainee">
          Chi tiết
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Function called from Table row action
window.selectAndGoToDashboard = function(traineeId) {
  state.currentTraineeId = traineeId;
  if (elements.traineeSelect) elements.traineeSelect.value = traineeId;
  loadCurrentTrainee(traineeId);
  window.openTraineeDetail(traineeId);
};

// ==========================================
// MODAL: TRAINEE DETAIL
// ==========================================
window.openTraineeDetail = async function(traineeId) {
  const trainee = await window.API.getTraineeById(traineeId);
  if (!trainee) return;

  // Xếp hạng dựa trên số sao tích lũy
  const starRank = [...state.trainees]
    .sort((a, b) => (Number(b.accumulatedStars) || 0) - (Number(a.accumulatedStars) || 0))
    .findIndex(t => t.traineeId === trainee.traineeId) + 1;

  const body = elements.traineeDetailModalBody;
  body.innerHTML = `
    <div style="display: flex; gap: 20px; align-items: center; margin-bottom: 20px;">
      <img src="${getTraineeDicebearAvatar(trainee)}" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 3px solid var(--primary-blue-border);">
      <div>
        <h3 style="font-size: 1.3rem; font-weight: 800; color: var(--text-main);">${escapeHtml(trainee.fullName)}</h3>
        <p style="font-size: 0.85rem; color: var(--text-muted);">MSSV: <strong>${escapeHtml(trainee.traineeId)}</strong> · Lớp: <strong>${escapeHtml(trainee.batch || '')}</strong></p>
        <p style="font-size: 0.82rem; color: var(--primary-blue); font-weight: 600;">${escapeHtml(trainee.email || '')}</p>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 20px;">
      <div style="background-color: var(--bg-card-subtle); padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); text-align: center;">
        <span style="font-size: 0.75rem; color: var(--text-muted); display: block;">HẠNG (THEO SAO)</span>
        <strong style="font-size: 1.25rem; color: var(--primary-blue);">#${Number.isFinite(trainee.accumulatedStars) ? starRank || '—' : '—'}</strong>
      </div>
      <div style="background-color: var(--bg-card-subtle); padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); text-align: center;">
        <span style="font-size: 0.75rem; color: var(--text-muted); display: block;">SAO TÍCH LŨY</span>
        <strong style="font-size: 1.25rem; color: #d97706;"> ${formatTraineeMetric(trainee.accumulatedStars)}</strong>
      </div>

    </div>

    <div style="background-color: var(--bg-card-subtle); padding: 14px; border-radius: 8px; border: 1px solid var(--border-color); margin-bottom: 16px;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 0.85rem;">
        <span style="color: var(--text-muted);">Chuyên cần & Buổi học:</span>
        <strong style="color: var(--text-main);">${formatTraineeMetric(trainee.attendedSessions)} / ${formatTraineeMetric(trainee.totalSessions)} buổi</strong>
      </div>
      <div style="font-size: 0.82rem; color: var(--text-muted);">
        Vắng có phép: <strong style="color: var(--accent-orange);">${formatTraineeMetric(trainee.absentExcused)}</strong> · Không phép: <strong style="color: ${(Number(trainee.absentUnexcused) || 0) > 0 ? 'var(--accent-red)' : 'var(--text-muted)'};">${formatTraineeMetric(trainee.absentUnexcused)}</strong>
      </div>
    </div>

    <div style="margin-bottom: 16px;">
      <h4 style="font-size: 0.88rem; font-weight: 700; margin-bottom: 6px; color: var(--text-main);">Giới thiệu & Đánh giá:</h4>
      <p style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.5; background: var(--bg-card-subtle); padding: 12px; border-radius: 8px; border: 1px solid var(--border-color);">
        ${escapeHtml(trainee.bio || 'Trainee tích cực tham gia đầy đủ các buổi đào tạo chuyên sâu và đồ án tốt nghiệp.')}
      </p>
    </div>

    <div style="margin-bottom: 20px;">
      <h4 style="font-size: 0.88rem; font-weight: 700; margin-bottom: 6px; color: var(--text-main);">Kỹ năng chuyên môn (Tech Stack):</h4>
      <div style="display: flex; flex-wrap: wrap; gap: 6px;">
        ${(Array.isArray(trainee.skills) ? trainee.skills : ['Node.js', 'React', 'MongoDB']).map(s => `<span class="badge-tag status-active">${escapeHtml(s)}</span>`).join('')}
      </div>
    </div>

    <div style="display: flex; justify-content: flex-end; gap: 10px;">
      <button class="btn btn-secondary" onclick="closeDetailModal()">Đóng</button>
      <button class="btn btn-primary" onclick="selectAndGoToDashboard('${escapeHtml(trainee.traineeId)}'); closeDetailModal();">
        Xem Trang Chủ Trainee Này
      </button>
    </div>
  `;

  elements.traineeDetailModal.classList.add('open');
};

function closeDetailModal() {
  elements.traineeDetailModal.classList.remove('open');
}


// Expose to global window
window.renderLeaderboard = renderLeaderboard;
window.renderPodium = renderPodium;
window.openTraineeDetail = openTraineeDetail;
