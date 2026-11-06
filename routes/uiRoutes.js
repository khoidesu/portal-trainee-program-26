const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { requireAuth, hasPermission } = require('../utils/security');

const privateDir = path.join(__dirname, '..', 'private');
const isTrainee = user => user.role === 'trainee';
const isStaff = user => !isTrainee(user);
const canOpenProfile = user => isTrainee(user) || hasPermission(user, 'trainees:manage');
const canOpenLeave = user => isTrainee(user) || user.role === 'admin' || hasPermission(user, 'leave:manage');
const needs = permission => user => hasPermission(user, permission);
const loggedIn = () => true;

// Mỗi slot là một khối HTML chỉ được gửi khi tài khoản đủ quyền; khách không nhận được nội dung này.
const SLOTS = {
  'view-profile': { allow: canOpenProfile },
  'view-admin': { allow: needs('accounts:manage') },
  'view-assignments': { allow: loggedIn },
  'view-leave': { allow: canOpenLeave },
  'assignments-manage': { allow: needs('assignments:manage'), nested: true },
  'grades-manage': { allow: needs('attendance:manage') },
  'leaderboard-manage': { allow: needs('trainees:manage') },
  'schedule-add-button': { allow: needs('schedules:manage') },
  'nav-profile-label': { allow: isTrainee },
  'nav-profile-list': { allow: isTrainee },
  'nav-admin-label': { allow: needs('accounts:manage') },
  'nav-admin-list': { allow: needs('accounts:manage') },
  'header-admin-badge': { allow: needs('accounts:manage') },
  'header-trainee-badge': { allow: isTrainee },
  'question-reply-box': { allow: needs('questions:manage') },
  'modal-schedule': { allow: needs('schedules:manage') },
  'modal-trainee-create': { allow: needs('trainees:manage') },
  'modal-trainee-edit': { allow: needs('trainees:manage') },
  'modal-trainee-delete': { allow: needs('trainees:manage') },
  'modal-change-password': { allow: loggedIn },
  'modal-profile-forgot': { allow: isTrainee },
  'modal-assignment': { allow: loggedIn },
  'modal-assignment-edit': { allow: needs('assignments:manage') },
  'duo-edit-button': { allow: needs('assignments:manage'), nested: true },
  'duo-quick-edit': { allow: needs('assignments:manage'), nested: true }
};

// Script chỉ chứa logic quản trị/hồ sơ, không nằm trong public/ nên khách không tải được.
const SCRIPTS = {
  'admin.js': isStaff,
  'profile.js': canOpenProfile
};

const cache = new Map();
function readPrivate(...parts) {
  const file = path.join(privateDir, ...parts);
  if (!cache.has(file)) cache.set(file, fs.readFileSync(file, 'utf8'));
  return cache.get(file);
}

function resolveSlot(name, user) {
  const slot = SLOTS[name];
  if (!slot || !slot.allow(user)) return '';
  const html = readPrivate('fragments', `${name}.html`).replace(/<!--[\s\S]*?-->/g, '');
  return html.replace(/<template data-private-slot="([a-z0-9-]+)"><\/template>/g, (match, inner) => resolveSlot(inner, user));
}

function mustChangePassword(user) {
  return Boolean(!user.isOwner && user.mustChangePassword);
}

router.get('/', requireAuth, (req, res) => {
  const user = req.user;
  const onlyPasswordChange = mustChangePassword(user);
  const slots = {};
  for (const [name, slot] of Object.entries(SLOTS)) {
    if (slot.nested || (onlyPasswordChange && name !== 'modal-change-password')) continue;
    const html = resolveSlot(name, user);
    if (html) slots[name] = html.trim();
  }
  const scripts = onlyPasswordChange ? [] : Object.keys(SCRIPTS).filter(name => SCRIPTS[name](user));
  res.json({ success: true, data: { slots, scripts: scripts.map(name => `/api/ui/script/${name}`) } });
});

router.get('/script/:name', requireAuth, (req, res) => {
  const check = Object.hasOwn(SCRIPTS, req.params.name) ? SCRIPTS[req.params.name] : null;
  if (!check || mustChangePassword(req.user) || !check(req.user)) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy tài nguyên.' });
  }
  res.type('application/javascript; charset=utf-8').send(readPrivate('js', req.params.name));
});

module.exports = router;
