/**
 * ==============================================================================
 * COMPONENT: Notifications Module (Chuông Thông Báo Trong Portal)
 * CHỨC NĂNG CHÍNH: Hiển thị thông báo lịch học, nhắc hạn bài tập và phản hồi Q&A
 *                  cho Trainee đã đăng nhập ngay trên thanh điều hướng.
 * LIÊN KẾT & PHỤ THUỘC: public/js/api.js, public/js/modules/auth.js (updateAuthUI),
 *                       public/js/modules/navigation.js (switchTab)
 * ==============================================================================
 */

const NOTIFICATION_POLL_MS = 5 * 60 * 1000;
const NOTIFICATION_STALE_MS = 60 * 1000;
const NOTIFICATION_TABS = ['schedule', 'assignments', 'questions'];
const NOTIFICATION_TYPE_LABELS = { schedule: 'Lịch học', assignment: 'Bài tập', question: 'Q&A' };

const notificationState = {
  items: [],
  unread: 0,
  loadState: 'idle',
  loadError: '',
  requestId: 0,
  loadedAt: 0,
  traineeId: '',
  timer: null,
  bound: false
};

function formatNotificationCountdown(dueAt) {
  const diff = new Date(dueAt).getTime() - Date.now();
  if (!Number.isFinite(diff) || diff <= 0) return 'Đã hết hạn nộp';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff / 3600000) % 24);
  const minutes = Math.floor((diff / 60000) % 60);
  return days >= 1 ? `${days} ngày ${hours} h còn lại` : `${hours} h ${minutes} phút còn lại`;
}

function formatNotificationTime(value) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return '';
  const minutes = Math.floor((Date.now() - time) / 60000);
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} giờ trước`;
  return new Date(time).toLocaleDateString('vi-VN');
}

function applyNotificationData(data) {
  notificationState.items = Array.isArray(data?.items) ? data.items : [];
  notificationState.unread = Number(data?.unread) || 0;
  notificationState.loadState = 'ready';
  notificationState.loadError = '';
  notificationState.loadedAt = Date.now();
}

function createNotificationNode(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderNotifications() {
  const badge = document.getElementById('notificationBadge');
  const list = document.getElementById('notificationList');
  const readAll = document.getElementById('notificationReadAll');
  const button = document.getElementById('notificationBtn');
  if (!badge || !list) return;

  const unread = notificationState.unread;
  badge.hidden = unread <= 0;
  badge.textContent = unread > 99 ? '99+' : String(unread);
  if (button) button.setAttribute('aria-label', unread > 0 ? `Thông báo, ${unread} chưa đọc` : 'Thông báo');
  if (readAll) readAll.disabled = unread <= 0;

  list.replaceChildren();
  if (notificationState.loadState === 'loading' || notificationState.loadState === 'idle') {
    list.append(createNotificationNode('div', 'notification-empty', 'Đang tải thông báo...'));
    return;
  }
  if (notificationState.loadState === 'error') {
    const box = createNotificationNode('div', 'notification-empty');
    box.append(createNotificationNode('div', '', notificationState.loadError || 'Không tải được thông báo.'));
    const retry = createNotificationNode('button', 'notification-read-all', 'Thử lại');
    retry.type = 'button';
    retry.addEventListener('click', () => loadNotifications());
    box.append(retry);
    list.append(box);
    return;
  }
  if (!notificationState.items.length) {
    list.append(createNotificationNode('div', 'notification-empty', 'Chưa có thông báo nào.'));
    return;
  }

  for (const item of notificationState.items) {
    const row = createNotificationNode('button', 'notification-item' + (item.read ? '' : ' unread'));
    row.type = 'button';
    row.append(createNotificationNode('span', `notification-tag notification-tag-${item.type}`, NOTIFICATION_TYPE_LABELS[item.type] || 'Thông báo'));
    row.append(createNotificationNode('div', 'notification-title', item.title));
    if (item.body) row.append(createNotificationNode('div', 'notification-body', item.body));
    if (item.type === 'assignment' && item.dueAt) row.append(createNotificationNode('div', 'notification-countdown', formatNotificationCountdown(item.dueAt)));
    row.append(createNotificationNode('div', 'notification-time', formatNotificationTime(item.createdAt)));
    row.addEventListener('click', () => openNotification(item));
    list.append(row);
  }
}

async function loadNotifications({ silent = false } = {}) {
  const requestId = ++notificationState.requestId;
  if (!silent || notificationState.loadState !== 'ready') {
    notificationState.loadState = 'loading';
    renderNotifications();
  }
  try {
    const data = await API.getNotifications();
    if (requestId !== notificationState.requestId) return;
    applyNotificationData(data);
  } catch (err) {
    if (requestId !== notificationState.requestId) return;
    if (silent && notificationState.loadState === 'ready') return;
    notificationState.loadState = 'error';
    notificationState.loadError = err.message || 'Không tải được thông báo.';
  }
  renderNotifications();
}

function toggleNotificationDropdown(show) {
  const dropdown = document.getElementById('notificationDropdown');
  const button = document.getElementById('notificationBtn');
  if (!dropdown) return;
  const willShow = typeof show === 'boolean' ? show : !dropdown.classList.contains('show');
  dropdown.classList.toggle('show', willShow);
  if (button) button.setAttribute('aria-expanded', String(willShow));
  if (willShow) {
    toggleThemeDropdown(false);
    renderNotifications();
    loadNotifications({ silent: true });
  }
}

async function openNotification(item) {
  toggleNotificationDropdown(false);
  if (NOTIFICATION_TABS.includes(item.link)) switchTab(item.link);
  if (item.read) return;
  item.read = true;
  notificationState.unread = Math.max(0, notificationState.unread - 1);
  renderNotifications();
  try {
    applyNotificationData(await API.markNotificationRead(item.id));
    renderNotifications();
  } catch (err) {
    loadNotifications({ silent: true });
  }
}

async function markAllNotificationsRead() {
  const readAll = document.getElementById('notificationReadAll');
  if (readAll) readAll.disabled = true;
  try {
    applyNotificationData(await API.markAllNotificationsRead());
  } catch (err) {
    if (window.showToast) window.showToast(err.message || 'Không cập nhật được thông báo.', 'danger');
  }
  renderNotifications();
}

function bindNotificationEvents() {
  if (notificationState.bound) return;
  notificationState.bound = true;
  document.getElementById('notificationBtn')?.addEventListener('click', () => toggleNotificationDropdown());
  document.getElementById('notificationReadAll')?.addEventListener('click', markAllNotificationsRead);
  document.addEventListener('click', event => {
    const wrapper = document.getElementById('notificationWrapper');
    if (wrapper && !wrapper.contains(event.target)) toggleNotificationDropdown(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') toggleNotificationDropdown(false);
  });
  document.addEventListener('visibilitychange', () => {
    if (notificationState.traineeId && document.visibilityState === 'visible' && Date.now() - notificationState.loadedAt > NOTIFICATION_STALE_MS) {
      loadNotifications({ silent: true });
    }
  });
}

function syncNotificationBell() {
  const wrapper = document.getElementById('notificationWrapper');
  if (!wrapper) return;
  bindNotificationEvents();
  const user = state.currentUser;
  const traineeId = user?.role === 'trainee' && user.traineeId ? user.traineeId : '';
  wrapper.style.display = traineeId ? 'inline-flex' : 'none';
  if (traineeId === notificationState.traineeId) return;

  notificationState.traineeId = traineeId;
  notificationState.requestId++;
  notificationState.items = [];
  notificationState.unread = 0;
  notificationState.loadState = 'idle';
  notificationState.loadedAt = 0;
  clearInterval(notificationState.timer);
  notificationState.timer = null;
  toggleNotificationDropdown(false);
  renderNotifications();
  if (!traineeId) return;
  loadNotifications();
  notificationState.timer = setInterval(() => loadNotifications({ silent: true }), NOTIFICATION_POLL_MS);
}

window.syncNotificationBell = syncNotificationBell;
window.closeNotificationDropdown = () => toggleNotificationDropdown(false);
