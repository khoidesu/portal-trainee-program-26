/**
 * ==============================================================================
 * COMPONENT: Dashboard View Module (Trang Tổng Quan Trainee)
 * CHỨC NĂNG CHÍNH: Hiển thị thông số tổng hợp KPI, thẻ Trainee, lịch học hôm nay,
 *                  biểu đồ diễn biến sao tích lũy và bảng tin thông báo.
 * LIÊN KẾT & PHỤ THUỘC: public/js/modules/core.js, public/js/chart.js
 * NHIỆM VỤ CHI TIẾT:
 *   - renderDashboard: Vẽ thẻ profile Trainee, 4 KPI cards
 *   - renderTodaySchedule: Danh sách buổi học trong ngày kèm nút vào học MS Teams
 *   - renderPendingServices: Danh sách yêu cầu đang xử lý
 *   - renderAnnouncements: Bản tin thông báo học vụ mới nhất
 * ==============================================================================
 */

// ==========================================
// RENDER FUNCTIONS - DASHBOARD
// ==========================================
function renderDashboard(t) {
  // Student Card Banner
  elements.studentName.textContent = t.fullName;
  elements.studentId.textContent = t.traineeId;
  elements.studentBatch.textContent = t.batch;
  elements.studentTrack.textContent = t.track;
  elements.studentEmail.textContent = t.email;
  elements.studentEmail.href = `mailto:${t.email}`;
  elements.studentStatusBadge.textContent = t.status || 'Đang học';
  elements.studentCohortBadge.textContent = t.cohortYear || '2025';
  elements.studentAcademicYear.textContent = t.academicYear || '2026-2027';

  // Greeting Tag based on authentication role
  if (elements.studentGreetingTag) {
    if (state.currentUser && state.currentUser.role === 'admin') {
      elements.studentGreetingTag.textContent = 'ĐANG XEM HỒ SƠ Trainee (ADMIN PREVIEW):';
    } else if (state.currentUser) {
      elements.studentGreetingTag.textContent = 'XIN CHÀO,';
    } else {
      elements.studentGreetingTag.textContent = 'HỒ SƠ MẪU (CHƯA ĐĂNG NHẬP):';
    }
  }

  // Avatar handling with Dicebear avatar độc nhất cho từng Trainee
  const avatarUrl = getTraineeDicebearAvatar(t);
  if (elements.studentAvatar) {
    elements.studentAvatar.src = avatarUrl;
    elements.studentAvatar.style.display = 'block';
  }
  if (elements.studentAvatarFallback) {
    elements.studentAvatarFallback.style.display = 'none';
  }

  // Keep Header Account Pill in sync with actual authentication state
  renderAuthState();

  // ========================================================
  // 4 KPI METRICS TRANG CHỦ (LINK SYNC VỚI ADMIN & DATABASE)
  // ========================================================

  // 1. SAO TÍCH LŨY (Hiện số lượng sao nhận được)
  const stars = t.accumulatedStars !== undefined
    ? t.accumulatedStars
    : (t.cumulativeGpa ? Math.round(t.cumulativeGpa * 3.5) : 28);
  const starClass = t.starClassification || (stars >= 40 ? 'Hạng Kim Cương ' : stars >= 30 ? 'Hạng Vàng ' : 'Hạng Bạc ');
  const starTrend = t.starTrend || '+4 sao tuần này';
  const starTrendIsPos = t.starTrendIsPositive !== undefined ? t.starTrendIsPositive : true;

  if (elements.metricStars) {
    elements.metricStars.textContent = `${stars} sao`;
  }
  if (elements.metricStarClass) {
    elements.metricStarClass.textContent = starClass;
  }
  if (elements.metricStarTrendText) {
    elements.metricStarTrendText.textContent = starTrend;
  }
  if (elements.metricStarTrend) {
    elements.metricStarTrend.className = `trend-badge ${starTrendIsPos ? 'positive' : 'negative'}`;
    const arrow = elements.metricStarTrend.querySelector('.trend-arrow');
    if (arrow) arrow.textContent = starTrendIsPos ? 'Tăng' : 'Giảm';
  }

  // 2. SỐ BUỔI HỌC ĐÃ THAM GIA
  const attended = t.attendedSessions !== undefined ? t.attendedSessions : (t.actualCredits || 42);
  const total = t.totalSessions || 45;
  const attRate = t.attendanceRate !== undefined ? t.attendanceRate : (Math.round((attended / total) * 1000) / 10);
  const attDetail = t.attendanceNote || `Đã tham gia: <span>${attended}</span> buổi · Vắng: <span>${Math.max(total - attended, 0)}</span> buổi`;

  if (elements.metricAttendedSessions) {
    elements.metricAttendedSessions.textContent = `${attended} / ${total}`;
  }
  if (elements.metricAttendanceRate) {
    elements.metricAttendanceRate.textContent = `${attRate}%`;
  }
  if (elements.metricAttendanceDetail) {
    elements.metricAttendanceDetail.textContent = `Đã tham gia: ${Number(attended) || 0} buổi · Vắng: ${Math.max(Number(total) - Number(attended), 0)} buổi`;
  }
  if (elements.metricAttendanceBar) {
    elements.metricAttendanceBar.style.width = `${Math.min(attRate, 100)}%`;
  }

  // 4. THỨ HẠNG XẾP LOẠI
  const rank = t.currentRank !== undefined ? t.currentRank : (t.rank || 1);
  const totalRank = t.totalStudentsInRank || 12;
  const rankClass = t.rankClassification || (rank === 1 ? ' Quán quân Trainee' : rank === 2 ? ' Á quân Trainee' : rank === 3 ? ' Hạng 3 Trainee' : `Top ${rank}`);
  const rankNote = t.rankNote || `Hạng ${rank} / ${totalRank} Trainee · Dẫn đầu toàn khóa`;

  if (elements.metricRank) {
    elements.metricRank.textContent = `#${rank}`;
  }
  if (elements.metricRankClass) {
    elements.metricRankClass.textContent = rankClass;
  }
  if (elements.metricRankNote) {
    elements.metricRankNote.textContent = rankNote;
  }

  // Schedule Today - Đồng bộ thời khóa biểu trực tuyến (MS Teams)
  renderSchedule();

  // Pending Requests
  renderPendingRequests(t.pendingRequests);

  // Trainer Info
  renderMentor(t.mentor);

  // Star Progression Chart (sử dụng dữ liệu thật từ số sao tích lũy & lịch sử)
  if (window.renderStarChart) {
    window.renderStarChart(t.starHistory, t.accumulatedStars);
  } else if (window.renderGpaChart) {
    window.renderGpaChart(t.starHistory, t.accumulatedStars);
  }
}

async function renderSchedule(fallbackScheduleList) {
  const container = elements.scheduleListContainer;
  if (!container) return;
  container.innerHTML = '';

  const isAdmin = state.currentUser && state.currentUser.role === 'admin';

  const today = getVietnamDateParts(Date.now() + (window.ScheduleManager?.clockOffset || 0));
  const todayStr = `${today.year}-${String(today.month).padStart(2, '0')}-${String(today.day).padStart(2, '0')}`;
  container.textContent = 'Đang tải lịch hôm nay…';
  let allSchedules;
  try {
    allSchedules = await window.API.getSchedules({ month: today.month, year: today.year });
  } catch (err) {
    container.textContent = 'Không tải được lịch hôm nay. Vui lòng xem mục Lịch học hoặc tải lại trang.';
    return;
  }
  const todaySessions = allSchedules.filter(item => item.date === todayStr).map(item => getScheduleTiming(item, Date.now() + (window.ScheduleManager?.clockOffset || 0)));
  container.innerHTML = '';
  if (!todaySessions.length) {
    elements.scheduleCountBadge.textContent = '0 buổi';
    container.innerHTML = '<p class="duo-sidebar-note">Hôm nay không có buổi học.</p><button type="button" class="btn btn-outline" id="btnGoToScheduleTab">Xem lịch Trainee Program</button>';
    document.getElementById('btnGoToScheduleTab')?.addEventListener('click', () => switchTab('schedule'));
    return;
  }

  // Cập nhật số buổi
  elements.scheduleCountBadge.textContent = `${todaySessions.length} buổi`;

  // Render từng buổi học hôm nay đã đồng bộ
  todaySessions.forEach(item => {
    const el = document.createElement('div');
    el.className = 'schedule-item';

    const isLive = item.status === 'live';
    const isCompleted = item.status === 'completed';
    const statusBadge = isLive
      ? `<span class="session-badge status-live" style="margin-left: auto; font-size:0.72rem; padding: 2px 8px; border-radius: 999px; background: rgba(34,197,94,0.15); color: #22c55e; font-weight:700; display:inline-flex; align-items:center; gap:4px;"><span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#22c55e;"></span> Trực tiếp</span>`
      : isCompleted
      ? `<span class="session-badge status-completed" style="margin-left: auto; font-size:0.72rem; padding: 2px 8px; border-radius: 999px; background: rgba(148,163,184,0.15); color: #94a3b8; font-weight:600;">Đã diễn ra</span>`
      : `<span class="session-badge status-upcoming" style="margin-left: auto; font-size:0.72rem; padding: 2px 8px; border-radius: 999px; background: rgba(59,130,246,0.15); color: #3b82f6; font-weight:600;">Sắp diễn ra</span>`;

    const timeRange = (item.startTime && item.endTime) ? `${item.startTime} – ${item.endTime}` : (item.time || '19:30 – 21:30');
    const periodText = item.periods || item.period || 'Tiết 1 - 4 (Tối)';
    const codeText = item.code || item.courseCode || '';
    const roomText = item.room || 'MS Teams Trực Tuyến';
    const instructorText = item.instructor || 'Trainer UIT';

    el.innerHTML = `
      <div class="schedule-top-row" style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
        <span class="schedule-time-pill" style="font-weight: 700; color: var(--text-main); display: inline-flex; align-items: center; gap: 6px;">

          ${escapeHtml(timeRange)}
        </span>
        <span class="schedule-period" style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(periodText)}</span>
        <span class="schedule-title" style="font-size: 0.92rem; font-weight: 700; color: var(--text-main);">
          ${escapeHtml(item.title)} ${codeText ? `<span class="schedule-code" style="color: var(--text-muted); font-weight: 500;">(${escapeHtml(codeText)})</span>` : ''}
        </span>
        ${statusBadge}
      </div>

      <div class="schedule-tags-row" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-top: 6px;">
        <div style="display: flex; align-items: center; gap: 12px; font-size: 0.75rem; color: var(--text-muted); flex-wrap: wrap;">
          <span class="schedule-tag" style="background: rgba(59,130,246,0.12); color: #3b82f6; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 0.68rem;">
            ${escapeHtml(item.type || 'Online')}
          </span>
          <span class="schedule-room" style="display: inline-flex; align-items: center; gap: 4px;">
             ${escapeHtml(roomText)}
          </span>
          <span class="schedule-instructor" style="display: inline-flex; align-items: center; gap: 4px;">
             ${escapeHtml(instructorText)}
          </span>
        </div>

        <button type="button" class="btn-join-class" data-session-id="${item._id || item.id}" style="padding: 5px 14px; font-size: 0.8rem; font-weight: 600; background: linear-gradient(135deg, #4f46e5, #4338ca); color: #ffffff; border: none; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(79,70,229,0.25); transition: all 0.15s ease;">

          Vào học
        </button>
      </div>
    `;

    // Gắn sự kiện "Vào học" (Microsoft Teams)
    const joinBtn = el.querySelector('.btn-join-class');
    if (joinBtn) {
      joinBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.ScheduleManager) {
          window.ScheduleManager.handleJoinClass(item, isAdmin, (sessionToEdit) => {
            openScheduleModal(sessionToEdit);
          });
        }
      });
    }

    container.appendChild(el);
  });
}

function renderPendingRequests(requests) {
  const container = elements.pendingRequestsContainer;
  container.innerHTML = '';

  if (!requests || requests.length === 0) {
    container.innerHTML = `
      <div class="empty-state-text">
        Bạn chưa có phiếu yêu cầu nào đang xử lý.
      </div>
    `;
    return;
  }

  requests.forEach(req => {
    const el = document.createElement('div');
    el.className = 'request-item';
    el.innerHTML = `
      <div class="request-info">
        <div class="request-title">${req.title}</div>
        <div class="request-date">Mã phiếu: <strong>${req.id}</strong> · Ngày gửi: ${req.date}</div>
      </div>
      <span class="request-status-badge ${req.statusType || 'pending'}">
        ${req.status}
      </span>
    `;
    container.appendChild(el);
  });
}

function renderMentor(mentor) {
  if (!mentor) return;
  elements.mentorName.textContent = mentor.name;
  elements.mentorEmail.textContent = mentor.email;
  elements.mentorEmail.href = `mailto:${mentor.email}`;
  elements.mentorPhone.textContent = mentor.phone;
  elements.mentorPhone.href = `tel:${mentor.phone}`;
  elements.mentorAvatar.textContent = mentor.avatarInitial || getInitials(mentor.name);
  const roleEl = document.getElementById('mentorRole');
  if (roleEl) {
    roleEl.textContent = 'Trainer Trainee Program';
  }
}

function renderAnnouncements(news) {
  const container = elements.newsListContainer;
  container.innerHTML = '';

  news.forEach(item => {
    const el = document.createElement('div');
    el.className = 'news-item';
    const safeLink = (item.link && (item.link.startsWith('http://') || item.link.startsWith('https://'))) ? escapeHtml(item.link) : '#';
    el.innerHTML = `
      <a href="${safeLink}" class="news-title">${escapeHtml(item.title)}</a>
      <div class="news-meta">
        <span class="badge-tag">${escapeHtml(item.category || 'Tin tức')}</span>
        <span>${escapeHtml(item.date || '')}</span>
      </div>
    `;
    container.appendChild(el);
  });
}


// Expose to global window
window.renderDashboard = renderDashboard;
