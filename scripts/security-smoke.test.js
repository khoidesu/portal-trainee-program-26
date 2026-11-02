const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

Object.assign(process.env, {
  NODE_ENV: 'test', VERCEL: '', MONGODB_URI: '', APP_ORIGIN: '', TRUST_PROXY: '0',
  ADMIN_USERNAME: 'coordinator', ADMIN_PASSWORD: crypto.randomBytes(24).toString('base64url'),
  JWT_SECRET: crypto.randomBytes(32).toString('hex'), RESEND_API_KEY: '', EMAIL_FROM: '',
  LEAVE_NOTIFY_EMAIL: '', TURNSTILE_SITE_KEY: '', TURNSTILE_SECRET_KEY: ''
});

const fixtureTrainees = [
  { traineeId: '25520918', fullName: 'Khôi Trương Trần Anh', email: 'fixture-one@example.invalid', accumulatedStars: 0, attendedSessions: 0, totalSessions: 0, absentExcused: 0, absentUnexcused: 0, sessionStars: [], status: 'Đang học', track: 'Test', department: 'Test' },
  { traineeId: '25520104', fullName: 'Lê Hoàng Minh Quân', email: 'fixture-two@example.invalid', accumulatedStars: 0, attendedSessions: 0, totalSessions: 0, absentExcused: 0, absentUnexcused: 0, sessionStars: [], status: 'Đang học', track: 'Test', department: 'Test' }
];
require.cache[require.resolve('../data/mockData')] = { exports: { mockTrainees: fixtureTrainees, mockAnnouncements: [], schedules: [
  { _id: 'fixture-session-1', code: 'TP-M10.01', date: '2026-10-06', month: 10, year: 2026, title: 'Fixture session 1', startTime: '19:30', endTime: '21:30' },
  { _id: 'fixture-session-2', code: 'TP-M10.02', date: '2026-10-13', month: 10, year: 2026, title: 'Fixture session 2', startTime: '19:30', endTime: '21:30' }
] } };

const app = require('../server');
const security = require('../utils/security');
const database = require('../config/db');
const server = app.listen(0, '127.0.0.1');
const ready = new Promise(resolve => server.on('listening', resolve));
const nativeFetch = global.fetch;
let cookie;

after(async () => {
  global.fetch = nativeFetch;
  await new Promise(resolve => server.close(resolve));
});

async function request(path, { method = 'GET', body, session, origin } = {}) {
  await ready;
  const base = `http://127.0.0.1:${server.address().port}`;
  return nativeFetch(base + path, {
    method, headers: {
      Connection: 'close',
      ...(method !== 'GET' ? { 'Content-Type': 'application/json', Origin: origin || base } : {}),
      ...(session ? { Cookie: session } : {})
    }, ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
}

const leave = {
  traineeId: '25520918', fullName: 'Khôi Trương Trần Anh', scheduleCode: 'TP-M10.02',
  scheduleDate: '2026-10-13', reason: 'Có lịch thi tại trường nên xin nghỉ buổi học.', commit: true
};

test('JWT: rejects tampering, expired tokens and missing expiry', () => {
  const token = security.signToken({ role: 'admin' });
  assert.equal(security.verifyToken(token).role, 'admin');
  assert.equal(security.verifyToken(token + 'x'), null);
  assert.equal(security.verifyToken(security.signToken({ role: 'admin' }, -1)), null);
  assert.equal(security.verifyToken('eyJhbGciOiJub25lIn0.e30.'), null);
  const hashed = security.hashPassword('A test password with enough length');
  assert.equal(security.verifyPassword('A test password with enough length', hashed), true);
  assert.equal(security.verifyPassword('wrong', hashed), false);
  assert.equal(security.verifyPassword('anything', 'scrypt$invalid$hash'), false);
});

test('verified roster import rejects duplicates, wrong stopped statuses and fabricated attendance', () => {
  const { validateDataset } = require('./seed');
  const stopped = ['26521358', '26521694', '26521910'];
  const trainees = Array.from({ length: 30 }, (_, index) => ({
    traineeId: stopped[index] || String(70000000 + index),
    fullName: 'Fixture ' + index, email: 'fixture' + index + '@example.invalid',
    role: 'student', status: index < 3 ? 'Ngừng học' : 'Đang học',
    accumulatedStars: null, attendedSessions: null, totalSessions: null,
    absentExcused: null, absentUnexcused: null, attendanceRate: null, sessionStars: []
  }));
  const dataset = { profilesVerified: true, attendanceVerified: false, trainees };
  assert.equal(validateDataset(dataset).length, 30);
  const clone = () => JSON.parse(JSON.stringify(dataset));
  const duplicate = clone();
  duplicate.trainees[4].traineeId = duplicate.trainees[3].traineeId;
  assert.throws(() => validateDataset(duplicate), /trùng/);
  const wrongStatus = clone();
  wrongStatus.trainees[0].status = 'Đang học';
  assert.throws(() => validateDataset(wrongStatus), /Ngừng học/);
  const invented = clone();
  invented.trainees[0].attendedSessions = 42;
  assert.throws(() => validateDataset(invented), /để trống/);
  const admin = clone();
  admin.trainees[0].role = 'admin';
  assert.throws(() => validateDataset(admin), /role/);
});

test('missing session data stays missing and model defaults do not invent results', async () => {
  const Trainee = require('../models/Trainee');
  const trainee = new Trainee({ traineeId: '70000000', fullName: 'Fixture', email: 'fixture@example.invalid' });
  for (const field of ['accumulatedStars', 'attendedSessions', 'totalSessions', 'attendanceRate', 'assignmentScore', 'currentRank']) assert.equal(trainee[field], null);
  assert.equal(trainee.mentor, null);
  const result = await database.getTraineeById('25520918');
  assert.deepEqual(result.sessionStars, []);
  assert.deepEqual(result.starHistory, []);
  assert.equal(result.accumulatedStars, 0);
});

test('attendance import preserves penalties, recorded zeros and missing rows for stopped trainees', () => {
  const { validateDataset } = require('./seed');
  const stopped = ['26521358', '26521694', '26521910'];
  const schedules = Array.from({ length: 12 }, (_, index) => ({
    code: 'TEST-' + index, title: 'Fixture lesson ' + index, date: '2026-10-' + String(index + 1).padStart(2, '0'),
    month: 10, year: 2026, startTime: '20:00', endTime: '22:30', instructor: 'Trainer fixture'
  }));
  const trainees = Array.from({ length: 30 }, (_, index) => {
    const logs = schedules.slice(0, index < 3 ? 1 : 2).map((schedule, sessionIndex) => ({
      sessionCode: schedule.code, sessionTitle: schedule.title, sessionDate: schedule.date,
      trainerName: schedule.instructor, attendanceStatus: sessionIndex ? 'absent_excused' : 'present',
      starsAwarded: sessionIndex ? -1 : 0
    }));
    return {
      traineeId: stopped[index] || String(70000000 + index), fullName: 'Fixture ' + index,
      email: 'fixture' + index + '@example.invalid', role: 'student', status: index < 3 ? 'Ngừng học' : 'Đang học',
      sessionStars: logs, accumulatedStars: index < 3 ? 0 : -1,
      attendedSessions: 1, absentExcused: index < 3 ? 0 : 1, absentUnexcused: 0, totalSessions: logs.length
    };
  });
  const dataset = { profilesVerified: true, attendanceVerified: true, schedulesVerified: true, schedules, trainees };
  assert.equal(validateDataset(dataset).reduce((sum, trainee) => sum + trainee.sessionStars.length, 0), 57);
  assert.equal(dataset.trainees[3].accumulatedStars, -1);
  const mismatch = JSON.parse(JSON.stringify(dataset));
  mismatch.trainees[3].sessionStars[0].trainerName = 'Wrong Trainer';
  assert.throws(() => validateDataset(mismatch), /Trainer/);
  const missing = JSON.parse(JSON.stringify(dataset));
  missing.trainees[3].sessionStars.pop();
  assert.throws(() => validateDataset(missing), /đủ hai buổi/);
});

test('grade matrix displays negative and zero points, keeps zero cumulative totals and does not reuse another session', () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const nodes = Object.fromEntries(['gradesMatrixThead', 'gradesMatrixTbody', 'gradesMatrixTfoot', 'gradesCountBadge'].map(id => [id, { innerHTML: '', querySelectorAll: () => [] }]));
  const context = vm.createContext({
    window: {}, document: { getElementById: id => nodes[id] || null, querySelectorAll: () => [], querySelector: () => null },
    console
  });
  for (const name of ['core', 'profile', 'grades']) vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../public/js/modules/' + name + '.js'), 'utf8'), context);
  const first = { sessionCode: 'ONE', sessionTitle: 'First', sessionDate: '2026-10-28' };
  const second = { sessionCode: 'TWO', sessionTitle: 'Second', sessionDate: '2026-10-30' };
  context.window.gradesState.uniqueSessions = [first, second];
  context.window.gradesState.traineesList = [{
    traineeId: '70000000', fullName: 'Fixture', accumulatedStars: -1,
    sessionStars: [{ ...first, starsAwarded: -1, cumulativeStars: 0 }],
    track: 'Fixture', batch: 'Fixture'
  }, {
    traineeId: '70000001', fullName: 'Zero fixture', accumulatedStars: 0,
    sessionStars: [{ ...first, starsAwarded: 0, cumulativeStars: 0 }], track: 'Fixture', batch: 'Fixture'
  }];
  context.renderGradesMatrixTable();
  const html = nodes.gradesMatrixTbody.innerHTML;
  assert.match(html, /Điểm sao: -1/);
  assert.doesNotMatch(html, /\+\-1|data-session-code="TWO"/);
  assert.match(html, /Lũy kế: 0/);
  assert.equal((html.match(/data-session-code="ONE"/g) || []).length, 2);
  assert.equal((html.match(/Chưa có dữ liệu buổi học này/g) || []).length, 2);
});

test('public APIs do not reveal private contact details, scores or connection strings', async () => {
  const response = await request('/api/trainees');
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.ok(result.data.length);
  for (const trainee of result.data) {
    for (const field of ['password', 'email', 'assignmentScore', 'mentor', 'pendingRequests']) assert.equal(trainee[field], undefined);
    assert.equal(trainee.assignmentClassification, undefined);
    assert.equal(trainee.completedAssignments, undefined);
  }
  const stars = await (await request('/api/trainees/25520918/session-stars')).json();
  assert.equal(stars.data.trainee.email, undefined);
  const status = await (await request('/api/status')).json();
  assert.equal(status.data.uri, undefined);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('requires server-authenticated session; blocks query tokens, foreign origins and query operators', async () => {
  assert.equal((await request('/api/requests')).status, 401);
  const token = security.signToken({ role: 'admin' });
  assert.equal((await request('/api/requests?token=' + token)).status, 401);
  assert.equal((await request('/api/trainees', { method: 'POST', body: {} })).status, 401);
  assert.equal((await request('/api/auth/login', { method: 'POST', origin: 'https://attacker.invalid', body: {} })).status, 403);
  assert.equal((await request('/api/trainees?search%5B%24ne%5D=x')).status, 400);
  assert.equal((await request('/api/auth/login', { method: 'POST', body: { username: { $ne: null }, password: 'bad' } })).status, 400);
});

test('login uses HttpOnly session cookie, supports configured username, and logout clears session', async () => {
  const response = await request('/api/auth/login', { method: 'POST', body: { username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).token, undefined);
  const header = response.headers.get('set-cookie');
  assert.match(header, /HttpOnly/i);
  assert.match(header, /SameSite=Strict/i);
  cookie = header.split(';')[0];
  const me = await (await request('/api/auth/me', { session: cookie })).json();
  assert.equal(me.user.username, 'coordinator');
  const privateList = await (await request('/api/trainees', { session: cookie })).json();
  assert.ok(privateList.data[0].email);
  assert.equal(privateList.data[0].password, undefined);
  assert.equal((await request('/api/config/mongodb', { method: 'POST', session: cookie, body: { uri: 'mongodb://example.invalid/test\nADMIN_PASSWORD=injected' } })).status, 410);
  const logout = await request('/api/auth/logout', { method: 'POST', body: {} });
  assert.match(logout.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/i);
});

test('leave request validates roster and session, records server time and publishes only safe fields', async () => {
  const previousAbsences = (await database.getTraineeById(leave.traineeId)).absentExcused;
  const invalid = await request('/api/requests/leave', { method: 'POST', body: { ...leave, fullName: 'Wrong student' } });
  assert.equal(invalid.status, 400);
  const first = await (await request('/api/requests/leave', { method: 'POST', body: leave })).json();
  assert.equal(first.success, true);
  assert.equal(first.data.status, 'pending');
  assert.equal(first.data.emailStatus, undefined);
  assert.equal(first.data.publicVisible, true);
  assert.ok(Number.isFinite(Date.parse(first.data.submittedAt)));
  const duplicate = await (await request('/api/requests/leave', { method: 'POST', body: leave })).json();
  assert.equal(duplicate.data.id, first.data.id);
  const list = await (await request('/api/requests', { session: cookie })).json();
  assert.equal(list.data.filter(item => item.type === 'leave').length, 1);
  assert.equal(list.data[0].message, leave.reason);
  const approved = await request('/api/requests/' + first.data.id, { method: 'PUT', session: cookie, body: { status: 'resolved' } });
  assert.equal((await approved.json()).data.status, 'resolved');
  const student = await database.getTraineeById(leave.traineeId);
  assert.equal(student.absentExcused, previousAbsences);
  assert.equal((await request('/api/requests/' + first.data.id, { method: 'DELETE', session: cookie })).status, 400);
});

test('admin star updates target the requested trainee and reject invalid mass-update payloads', async () => {
  const body = { traineeId: '25520918', scheduleCode: 'TP-SECURITY-TEST', scheduleTitle: 'Test session', sessionDate: '2026-10-20', starsAwarded: 4 };
  assert.equal((await request('/api/admin/award-session-stars', { method: 'POST', body })).status, 401);
  assert.equal((await request('/api/admin/award-session-stars', { method: 'POST', session: cookie, body: { ...body, starsAwarded: -100 } })).status, 400);
  const result = await request('/api/admin/award-session-stars', { method: 'POST', session: cookie, body });
  assert.equal(result.status, 200);
  const target = await database.getTraineeById(body.traineeId);
  const other = await database.getTraineeById('25520104');
  assert.equal(target.sessionStars.find(item => item.sessionCode === body.scheduleCode).starsAwarded, 4);
  assert.equal(other.sessionStars.some(item => item.sessionCode === body.scheduleCode), false);
});

test('leave board is public, keeps original timestamp and never sends email even with legacy email settings', async () => {
  Object.assign(process.env, { RESEND_API_KEY: 'test-key', EMAIL_FROM: 'test@example.invalid', LEAVE_NOTIFY_EMAIL: 'test@example.invalid' });
  let externalCalls = 0;
  global.fetch = async () => { externalCalls++; throw new Error('No external email call allowed'); };
  try {
    const result = await (await request('/api/requests/leave', { method: 'POST', body: {
      ...leave, traineeId: '25520104', fullName: 'Lê Hoàng Minh Quân',
      email: 'must-not-be-public@example.invalid', submittedAt: '2000-01-01T00:00:00Z'
    } })).json();
    assert.equal(result.success, true);
    assert.equal(externalCalls, 0);
    const list = await (await request('/api/requests/leave')).json();
    const entry = list.data.find(item => item.id === result.data.id);
    assert.equal(entry.fullName, 'Lê Hoàng Minh Quân');
    assert.equal(entry.reason, leave.reason);
    assert.equal(entry.submittedAt, result.data.submittedAt);
    assert.notEqual(entry.submittedAt, '2000-01-01T00:00:00Z');
    for (const field of ['email', 'phone', 'submissionKey', 'resolvedPassword', 'emailStatus']) assert.equal(entry[field], undefined);
    const duplicate = await (await request('/api/requests/leave', { method: 'POST', body: { ...leave, traineeId: '25520104', fullName: 'Lê Hoàng Minh Quân' } })).json();
    assert.equal(duplicate.data.submittedAt, result.data.submittedAt);
    assert.equal((await request('/api/requests/' + result.data.id + '/retry-email', { method: 'POST', session: cookie, body: {} })).status, 404);
  } finally { global.fetch = nativeFetch; }
});

test('login limiter stops the sixth request in a minute', async () => {
  for (let attempt = 0; attempt < 4; attempt++) {
    assert.equal((await request('/api/auth/login', { method: 'POST', body: { username: 'coordinator', password: 'wrong' } })).status, 401);
  }
  const limited = await request('/api/auth/login', { method: 'POST', body: { username: 'coordinator', password: 'wrong' } });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
});

test('production fails closed without MongoDB, and refuses default secrets', () => {
  const probe = `const app = require('./server'); const server = app.listen(0, '127.0.0.1', async () => {
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/trainees');
    if (response.status !== 503) process.exitCode = 1;
    server.close();
  });`;
  const env = { ...process.env, NODE_ENV: 'production', VERCEL: '1', MONGODB_URI: 'mongodb://127.0.0.1:1/test', APP_ORIGIN: 'https://portal.example.com' };
  const result = spawnSync(process.execPath, ['-e', probe], { cwd: require('node:path').resolve(__dirname, '..'), env, timeout: 15000, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const unsafe = spawnSync(process.execPath, ['-e', "require('./utils/security')"], { cwd: require('node:path').resolve(__dirname, '..'), env: { ...env, JWT_SECRET: '', ADMIN_PASSWORD: '1234' }, encoding: 'utf8' });
  assert.notEqual(unsafe.status, 0);
});

test('Turnstile validates success, hostname and action and rejects replayed/invalid tokens', async () => {
  const router = require('../routes/supportRoutes');
  const verify = router.stack.find(layer => layer.route?.path === '/leave' && layer.route?.methods.post).route.stack.find(layer => layer.handle.name === 'verifyLeaveChallenge').handle;
  process.env.TURNSTILE_SITE_KEY = 'test-site-key';
  process.env.TURNSTILE_SECRET_KEY = 'test-secret';
  process.env.APP_ORIGIN = 'https://portal.example.com';
  try {
    for (const [result, expected] of [
      [{ success: true, hostname: 'attacker.invalid', action: 'leave' }, 400],
      [{ success: true, hostname: 'portal.example.com', action: 'other' }, 400],
      [{ success: false, 'error-codes': ['timeout-or-duplicate'] }, 400],
      [{ success: true, hostname: 'portal.example.com', action: 'leave' }, 200]
    ]) {
      global.fetch = async (url, options) => {
        assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
        assert.equal(JSON.parse(options.body).response, 'test-token');
        return new Response(JSON.stringify(result));
      };
      let actual;
      const response = { status(code) { actual = code; return this; }, json() {} };
      await verify({ body: { turnstileToken: 'test-token' } }, response, () => { actual = 200; });
      assert.equal(actual, expected);
    }
  } finally {
    process.env.TURNSTILE_SITE_KEY = '';
    process.env.TURNSTILE_SECRET_KEY = '';
    process.env.APP_ORIGIN = '';
    global.fetch = nativeFetch;
  }
});

test('production rate limit persists across independent limiter instances (mocked MongoDB)', () => {
  const probe = `
    const assert = require('node:assert/strict');
    const buckets = new Map();
    require('mongoose').connection.collection = () => ({
      createIndex: async () => {},
      findOneAndUpdate: async filter => { const count = (buckets.get(filter._id) || 0) + 1; buckets.set(filter._id, count); return { count }; }
    });
    const { createRateLimiter, setSession } = require('./utils/security');
    setSession({ cookie(name, token, options) {
      assert.equal(name, '__Host-trainee_session');
      assert.equal(options.secure, true);
      assert.equal(options.httpOnly, true);
      assert.equal(options.sameSite, 'strict');
    } }, { username: 'admin', role: 'admin' });
    (async () => {
      const first = createRateLimiter(2, 60000), second = createRateLimiter(2, 60000);
      const req = { ip: '127.0.0.1', baseUrl: '/api/auth', path: '/login' };
      let status = 200;
      const res = { setHeader() {}, status(code) { status = code; return this; }, json() {} };
      await first(req, res, () => {}); await second(req, res, () => {}); await second(req, res, () => {});
      assert.equal(status, 429);
    })().catch(error => { console.error(error); process.exitCode = 1; });`;
  const result = spawnSync(process.execPath, ['-e', probe], {
    cwd: require('node:path').resolve(__dirname, '..'), env: { ...process.env, NODE_ENV: 'production', VERCEL: '1' }, encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
});

test('leave form saves receipts only after API success and shows API failure without false approval', async () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const elements = new Map();
  const listeners = {};
  for (const id of ['leaveApplicationForm', 'leaveSelectSchedule', 'leaveInputReason', 'leaveSuccessAlert', 'btnDismissLeaveSuccess', 'btnResetLeaveForm', 'btnSubmitLeave', 'leaveInputMssv', 'leaveInputFullName', 'leaveCheckCommit', 'leaveFeedback', 'leaveSuccessDesc', 'leaveSuccessMeta', 'leaveHistoryTableBody', 'leaveHistoryCountBadge']) {
    elements.set(id, { dataset: {}, style: {}, addEventListener(type, callback) { listeners[id + ':' + type] = callback; }, setAttribute() {}, removeAttribute() {}, scrollIntoView() {} });
  }
  elements.get('leaveSelectSchedule').selectedOptions = [{ value: leave.scheduleCode, dataset: { date: leave.scheduleDate, title: 'Training' } }];
  elements.get('leaveInputMssv').value = leave.traineeId;
  elements.get('leaveInputFullName').value = leave.fullName;
  elements.get('leaveInputReason').value = leave.reason;
  elements.get('leaveCheckCommit').checked = true;
  const storage = new Map();
  let fail = true;
  const context = vm.createContext({
    window: {}, document: { getElementById: id => elements.get(id), querySelectorAll: () => [] },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    escapeHtml: value => String(value || '').replace(/</g, '&lt;'),
    API: { async submitLeave(body) {
      assert.equal(body.traineeId, leave.traineeId);
      if (fail) throw new Error('Máy chủ chưa tiếp nhận đơn.');
      return { success: true, message: 'Đang chờ xem xét.', data: { id: 'receipt-test', submittedAt: new Date().toISOString(), status: 'pending', emailStatus: 'sent' } };
    } }
  });
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../public/js/modules/leave.js'), 'utf8'), context);
  context.window.initLeaveModule();
  await listeners['leaveApplicationForm:submit']({ preventDefault() {} });
  assert.equal(storage.size, 0);
  assert.match(elements.get('leaveFeedback').textContent, /chưa tiếp nhận/);
  assert.equal(elements.get('btnSubmitLeave').disabled, false);
  fail = false;
  await listeners['leaveApplicationForm:submit']({ preventDefault() {} });
  const receipt = JSON.parse(storage.get('uit_trainee_leave_receipts_v2'))[0];
  assert.equal(receipt.status, 'Chờ xem xét khi gửi');
  assert.equal(receipt.reason, undefined);
  assert.equal(elements.get('leaveSuccessAlert').style.display, 'flex');
});

test('schedule edits do not report local success or change cache when server denies access', async () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  let localWrites = 0;
  const context = vm.createContext({
    window: {}, console,
    localStorage: { getItem: () => null, setItem: () => { localWrites++; }, removeItem() {} },
    fetch: async () => ({ ok: false, json: async () => ({ success: false, message: 'Phiên đã hết hạn.' }) })
  });
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../public/js/scheduleData.js'), 'utf8'), context);
  const manager = context.window.ScheduleManager;
  manager.cachedSchedules = [{ _id: 'schedule-test', title: 'Original' }];
  assert.equal(await manager.saveSchedule({ _id: 'schedule-test', title: 'Edited' }), null);
  assert.equal(await manager.deleteSchedule('schedule-test'), false);
  assert.equal(await manager.resetSchedules(10, 2026, true), false);
  assert.equal(manager.cachedSchedules[0].title, 'Original');
  assert.equal(localWrites, 0);
});

test('assignment sidebar uses real catalog counts and sorted deadlines without rendering XP or Gems', () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const elements = {
    duoAssignmentSummary: { innerHTML: '' },
    duoUpcomingDeadlines: { innerHTML: '', querySelectorAll: () => [] }
  };
  const context = vm.createContext({ window: {}, document: { getElementById: id => elements[id] } });
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../public/js/duolingo.js'), 'utf8'), context);
  const manager = vm.runInContext('Object.create(DuolingoManager.prototype)', context);
  const now = Date.now();
  manager.loadState = 'ready';
  manager.assignments = [
    { id: 1, title: 'Bài đã đóng', status: 'closed', deadline: new Date(now - 10000).toISOString() },
    { id: 2, title: '<img src=x onerror=alert(1)>', status: 'active', deadline: new Date(now + 7200000).toISOString() },
    { id: 3, title: 'Bài gần nhất', status: 'active', deadline: new Date(now + 3600000).toISOString() },
    { id: 4, title: 'Bài quá hạn', status: 'active', deadline: new Date(now - 10000).toISOString() },
    { id: 5, title: 'Chưa đặt hạn', status: 'locked', deadline: 'invalid-date' }
  ];
  manager.renderSidebar();
  const summary = elements.duoAssignmentSummary.innerHTML;
  const upcoming = elements.duoUpcomingDeadlines.innerHTML;
  assert.match(summary, /value="3" max="5"/);
  assert.match(summary, /Đang mở<\/dt><dd>3<\/dd>/);
  assert.match(summary, /Chưa mở<\/dt><dd>1<\/dd>/);
  assert.match(summary, /1 bài đang mở đã qua hạn/);
  assert.ok(upcoming.indexOf('Bài gần nhất') < upcoming.indexOf('&lt;img'));
  assert.doesNotMatch(upcoming, /<img|Bài quá hạn|Bài đã đóng/);
  assert.doesNotMatch(summary + upcoming, /\bXP\b|Gems/);
});

test('start badge follows the first open assignment instead of a stale current flag', () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const children = [];
  const container = { set innerHTML(value) { children.length = 0; }, appendChild(step) { children.push(step); } };
  const context = vm.createContext({
    window: {}, document: {
      getElementById: id => id === 'duoPathContainer' ? container : null,
      createElement: () => ({ classList: { add() {} }, style: {}, addEventListener() {} })
    }
  });
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../public/js/duolingo.js'), 'utf8'), context);
  const manager = vm.runInContext('Object.create(DuolingoManager.prototype)', context);
  manager.loadState = 'ready';
  manager.assignments = [
    { id: 1, title: 'Đã đóng', status: 'closed', isCurrent: true },
    { id: 2, title: 'Quá hạn', status: 'active', deadline: new Date(Date.now() - 60000).toISOString() },
    { id: 3, title: 'Đang mở', status: 'active' },
    { id: 4, title: 'Cũng đang mở', status: 'active' },
    { id: 6, title: 'Bài mẫu chưa mở', status: 'locked', isCurrent: true }
  ];
  const badgeIds = () => children.filter(step => step.innerHTML.includes('duo-start-bubble')).map(step => Number(step.innerHTML.match(/duo-start-bubble" data-id="(\d+)"/)[1]));
  manager.renderPath();
  assert.deepEqual(badgeIds(), [3]);
  manager.assignments[2].status = 'closed';
  manager.renderPath();
  assert.deepEqual(badgeIds(), [4]);
  manager.assignments[3].status = 'locked';
  manager.renderPath();
  assert.deepEqual(badgeIds(), []);
});

test('assignment loading handles an empty catalog and errors without displaying cached sample progress', async () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const elements = {
    duoAssignmentSummary: { innerHTML: '' },
    duoUpcomingDeadlines: { innerHTML: '', querySelectorAll: () => [] },
    duoPathContainer: { innerHTML: '' }
  };
  const context = vm.createContext({
    window: { API: { getAssignments: async () => [] } }, console: { warn() {} },
    document: { getElementById: id => elements[id] }
  });
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../public/js/duolingo.js'), 'utf8'), context);
  const manager = vm.runInContext('Object.create(DuolingoManager.prototype)', context);
  manager.assignments = [{ id: 1, title: 'Old sample', status: 'completed' }];
  manager.saveAssignments = () => {};
  await manager.fetchAssignmentsFromAPI();
  assert.equal(manager.assignments.length, 0);
  assert.equal(manager.loadState, 'ready');
  assert.match(elements.duoPathContainer.innerHTML, /Chưa có bài tập/);
  assert.match(elements.duoAssignmentSummary.innerHTML, /value="0" max="1"/);
  context.window.API.getAssignments = async () => { throw new Error('offline'); };
  await manager.fetchAssignmentsFromAPI();
  assert.equal(manager.loadState, 'error');
  assert.match(elements.duoPathContainer.innerHTML, /Không tải được/);
  assert.match(elements.duoAssignmentSummary.innerHTML, /Thử lại/);
});

test('schedule states use Vietnam time at exact boundaries and disregard stored demo states', async () => {
  const Schedule = require('../models/Schedule');
  const vm = require('node:vm');
  const context = vm.createContext({ window: {} });
  vm.runInContext(require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/js/scheduleData.js'), 'utf8'), context);
  const item = { date: '2026-10-27', startTime: '19:30', endTime: '21:30', status: 'live' };
  const start = Date.parse('2026-10-27T12:30:00Z');
  const end = Date.parse('2026-10-27T14:30:00Z');
  for (const [time, status] of [[start - 1, 'upcoming'], [start, 'live'], [end - 1, 'live'], [end, 'completed'], [Date.parse('2026-10-31T00:00:00+07:00'), 'completed']]) {
    assert.equal(Schedule.getTiming(item, time).status, status);
    assert.equal(context.getScheduleTiming(item, time).status, status);
  }
  const vietnam = context.getVietnamDateParts(Date.parse('2026-12-31T17:01:00Z'));
  assert.equal(vietnam.year, 2027);
  assert.equal(vietnam.month, 1);
  assert.equal(vietnam.day, 1);
  assert.throws(() => Schedule.validateTiming({ ...item, date: '2026-02-30' }));
  assert.throws(() => Schedule.validateTiming({ ...item, endTime: '18:00' }));
  const result = await (await request('/api/schedules?month=10&year=2026')).json();
  assert.ok(Number.isFinite(Date.parse(result.serverTime)));
  for (const session of result.data) assert.equal(session.status, Schedule.getTiming(session, Date.parse(result.serverTime)).status);
});

test('rapid month changes ignore late responses and failures without using demo schedules', async () => {
  const vm = require('node:vm');
  const requests = [];
  const context = vm.createContext({ window: {}, fetch: () => new Promise((resolve, reject) => requests.push({ resolve, reject })) });
  vm.runInContext(require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/js/scheduleData.js'), 'utf8'), context);
  const manager = context.window.ScheduleManager;
  const first = manager.fetchSchedules(10, 2026);
  const second = manager.fetchSchedules(11, 2026);
  requests[1].resolve({ ok: true, json: async () => ({ success: true, data: [{ title: 'November', date: '2026-11-01', startTime: '19:30', endTime: '21:30' }] }) });
  await second;
  requests[0].reject(new Error('Late October failure'));
  assert.equal(await first, null);
  assert.equal(manager.cachedSchedules[0].title, 'November');
  assert.equal(manager.loadState, 'ready');
  const failed = manager.fetchSchedules(12, 2026);
  requests[2].reject(new Error('offline'));
  await assert.rejects(failed, /offline/);
  assert.equal(manager.loadState, 'error');
});

test('month controls cross year boundaries and view changes preserve the selected period', () => {
  const vm = require('node:vm');
  const listeners = {};
  const make = id => ({
    value: '', validity: { valid: true }, classList: { toggle() {} },
    setAttribute() {}, addEventListener: (event, callback) => { listeners[id + ':' + event] = callback; }
  });
  const nodes = Object.fromEntries(['filterScheduleMonth', 'btnModeAgenda', 'btnModeCalendar', 'scheduleFilterForm',
    'btnSchedulePrevious', 'btnScheduleNext', 'btnScheduleToday'].map(id => [id, make(id)]));
  const manager = { selectedMonth: 12, selectedYear: 2026, viewMode: 'agenda', clockOffset: 0 };
  const context = vm.createContext({
    window: { ScheduleManager: manager }, elements: nodes, state: {}, setInterval() {},
    localStorage: { getItem: () => null, setItem() {} },
    getVietnamDateParts: () => ({ month: 10, year: 2026 }),
    document: { getElementById: id => nodes[id], addEventListener() {} }
  });
  vm.runInContext(require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/js/modules/schedule.js'), 'utf8'), context);
  context.initScheduleModule();
  listeners['btnScheduleNext:click']();
  assert.equal(nodes.filterScheduleMonth.value, '2027-01');
  listeners['btnModeCalendar:click']();
  assert.equal(manager.viewMode, 'calendar');
  assert.equal(manager.selectedYear, 2027);
  listeners['btnSchedulePrevious:click']();
  assert.equal(nodes.filterScheduleMonth.value, '2026-12');
  nodes.filterScheduleMonth.value = '2028-02';
  listeners['filterScheduleMonth:change']();
  assert.equal(manager.selectedYear, 2028);
  assert.equal(manager.selectedMonth, 2);
  listeners['btnScheduleToday:click']();
  assert.equal(nodes.filterScheduleMonth.value, '2026-10');
});

test('assignment details are rendered as text without grade elements', () => {
  const vm = require('node:vm');
  const lookedUp = [];
  const nodes = { duoAssignmentModal: { classList: { add() {} } }, duoModalTitle: {}, duoModalDesc: {}, duoModalDetails: {} };
  const context = vm.createContext({ window: {}, document: { getElementById: id => { lookedUp.push(id); return nodes[id]; } } });
  vm.runInContext(require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/js/duolingo.js'), 'utf8'), context);
  const manager = vm.runInContext('Object.create(DuolingoManager.prototype)', context);
  manager.assignments = [{ assignmentId: 1, title: 'Test', desc: 'Summary', details: '<script>alert(1)</script>\nLine 2', status: 'active' }];
  manager.updateModalCountdown = () => {};
  manager.openAssignmentModal(manager.assignments[0]);
  assert.equal(nodes.duoModalDetails.textContent, manager.assignments[0].details);
  assert.equal(nodes.duoModalDetails.innerHTML, undefined);
  assert.equal(lookedUp.includes('duoModalScore'), false);
});

test('Microsoft Forms confirmations require admin, remain private and do not complete the shared catalog', async () => {
  assert.equal((await request('/api/assignments/1/submissions')).status, 401);
  assert.equal((await request('/api/assignments/1/submissions/' + leave.traineeId, { method: 'PUT', body: {} })).status, 401);
  const details = 'Requirements\nSubmit a repository link via Microsoft Forms.';
  assert.equal((await request('/api/assignments/1', { method: 'PUT', session: cookie, body: { details, status: 'active' } })).status, 200);
  const body = { status: 'submitted', responseId: 'Forms-response-42', submittedAt: '2026-10-30T21:30:00+07:00', note: 'Verified in exported responses' };
  const submit = await request('/api/assignments/1/submissions/' + leave.traineeId, { method: 'PUT', session: cookie, body });
  assert.equal(submit.status, 200);
  assert.equal((await submit.json()).data.reviewedBy, 'coordinator');
  const confirm = await request('/api/assignments/1/submissions/' + leave.traineeId, { method: 'PUT', session: cookie, body: { ...body, status: 'completed' } });
  assert.equal(confirm.status, 200);
  const list = await (await request('/api/assignments/1/submissions', { session: cookie })).json();
  const records = list.data.filter(item => item.traineeId === leave.traineeId);
  assert.equal(records.length, 1);
  assert.equal(records[0].status, 'completed');
  assert.equal(records[0].responseId, body.responseId);
  assert.equal(list.data.filter(item => item.status === 'completed').length, 1);
  const publicList = await (await request('/api/assignments')).json();
  assert.equal(publicList.data[0].details, details);
  assert.equal(publicList.data[0].status, 'active');
  for (const item of publicList.data) {
    for (const field of ['score', 'xp', 'gems', 'submissions', 'responseId', 'reviewedBy']) assert.equal(item[field], undefined);
  }
  assert.equal((await request('/api/assignments/1/submissions/' + leave.traineeId, { method: 'PUT', session: cookie, body: { ...body, status: 'invalid' } })).status, 400);
  assert.equal((await request('/api/assignments/1/submissions/unknown', { method: 'PUT', session: cookie, body })).status, 400);
  assert.equal((await request('/api/assignments/1/submissions/' + leave.traineeId, { method: 'PUT', session: cookie, body: { ...body, submittedAt: 'invalid' } })).status, 400);
  const reset = await (await request('/api/assignments/reset', { method: 'POST', session: cookie, body: {} })).json();
  assert.equal(reset.success, false);
});

test('admin confirmation UI escapes response data and saves Vietnam submission time only on explicit confirmation', async () => {
  const vm = require('node:vm');
  let saveHandler;
  let savedPayload;
  const audit = {};
  const inputs = {
    '.review-status': { value: 'completed' },
    '.review-response': { value: '42' },
    '.review-date': { value: '2026-10-31T21:30' },
    '.review-note': { value: 'Reviewed by Trainer' },
    '.review-audit': audit
  };
  const row = { dataset: { traineeId: leave.traineeId }, querySelector: selector => inputs[selector] };
  const button = { closest: () => row, addEventListener: (event, handler) => { saveHandler = handler; } };
  const nodes = {
    adminReviewAssignment: { value: '1' }, assignmentReviewFeedback: {}, adminReviewFormLink: {},
    adminAssignmentSubmissionsBody: { querySelectorAll: () => [button] }
  };
  const context = vm.createContext({
    window: { API: {
      getAssignmentSubmissions: async () => [{ traineeId: leave.traineeId, fullName: '<img src=x>', status: 'submitted', note: '</textarea><script>bad</script>', responseId: '42' }],
      updateAssignmentSubmission: async (id, traineeId, data) => {
        assert.equal(id, '1');
        assert.equal(traineeId, leave.traineeId);
        savedPayload = data;
        return { reviewedAt: new Date().toISOString() };
      }
    } },
    document: { getElementById: id => nodes[id] },
    escapeHtml: value => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  });
  vm.runInContext(require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/js/modules/admin.js'), 'utf8'), context);
  vm.runInContext("adminAssignmentsList = [{ assignmentId: 1, link: 'https://forms.office.com/example' }]", context);
  await context.renderAssignmentSubmissions();
  assert.equal(savedPayload, undefined);
  assert.doesNotMatch(nodes.adminAssignmentSubmissionsBody.innerHTML, /<img|<script/);
  assert.match(nodes.adminAssignmentSubmissionsBody.innerHTML, /&lt;img/);
  await saveHandler();
  assert.equal(savedPayload.submittedAt, '2026-10-31T14:30:00.000Z');
  assert.equal(savedPayload.status, 'completed');
  assert.equal(button.disabled, false);
  assert.ok(audit.textContent);
});

test('schedule edits derive month from date and sample reset cannot delete a different month', async () => {
  const created = await database.createSchedule({ title: 'January training', date: '2027-01-02', month: 10, year: 2026, startTime: '19:30', endTime: '21:30' });
  assert.equal(created.month, 1);
  assert.equal(created.year, 2027);
  const updated = await database.updateSchedule(created._id, { date: '2027-02-02', dayOfWeekText: 'Wrong day', month: 10, isTentative: true });
  assert.equal(updated.month, 2);
  assert.equal(updated.dayOfWeekText, 'Thứ 3');
  assert.equal(updated.isTentative, true);
  assert.equal(require('../models/Schedule').getTiming(updated).status, 'tentative');
  assert.equal((await database.updateSchedule(created._id, { isTentative: false })).isTentative, false);
  await assert.rejects(database.resetSchedules({ month: 2, year: 2027 }), /chưa có lịch mẫu/);
  assert.equal((await database.getAllSchedules({ month: 2, year: 2027 })).some(item => item._id === created._id), true);
  await database.deleteSchedule(created._id);
});

test('account scopes are enforced server-side and permission changes or locking revoke existing sessions', async () => {
  const payload = { username: 'fixture_trainer', fullName: 'Fixture Trainer', password: 'Fixture password with sufficient length', role: 'trainer', permissions: ['attendance:manage'], active: true };
  assert.equal((await request('/api/auth/accounts', { method: 'POST', body: payload })).status, 401);
  const created = await (await request('/api/auth/accounts', { method: 'POST', session: cookie, body: payload })).json();
  assert.equal(created.success, true);
  assert.equal(created.data.password, undefined);
  const id = created.data.id;
  const mint = user => 'trainee_session=' + security.signToken({ accountId: user.id, sessionVersion: user.sessionVersion, username: user.username, role: 'admin', permissions: ['accounts:manage'] });
  const account = await database.authenticateUser(payload.username, payload.password);
  assert.equal(account.success, true);
  const session = mint(account.user);
  const me = await (await request('/api/auth/me', { session })).json();
  assert.equal(me.user.role, 'trainer');
  assert.deepEqual(me.user.permissions, ['attendance:manage']);
  assert.equal((await request('/api/auth/accounts', { session })).status, 403);
  assert.equal((await request('/api/assignments/1', { method: 'PUT', session, body: { title: 'Denied' } })).status, 403);
  assert.equal((await request('/api/trainees/25520918', { method: 'PUT', session, body: { fullName: 'Denied' } })).status, 403);
  assert.equal((await request('/api/schedules/fixture-session-1', { method: 'PUT', session, body: { title: 'Denied' } })).status, 403);
  assert.equal((await request('/api/auth/accounts/' + id, { method: 'PUT', session, body: { ...payload, permissions: [] } })).status, 403);
  const edit = { sessionDate: '2026-10-06', attendanceStatus: 'present', starsAwarded: 5, note: 'Verified attendance' };
  const saved = await (await request('/api/admin/attendance/25520918/TP-M10.01', { method: 'PUT', session, body: edit })).json();
  assert.equal(saved.success, true);
  assert.equal(saved.data.attendedSessions, 1);
  assert.equal(saved.data.totalSessions, 1);
  assert.equal(saved.data.sessionStars.find(item => item.sessionCode === 'TP-M10.01').updatedBy, payload.username);
  const penalty = await (await request('/api/admin/attendance/25520918/TP-M10.01', { method: 'PUT', session, body: { ...edit, attendanceStatus: 'absent_excused', starsAwarded: -1 } })).json();
  assert.equal(penalty.success, true);
  assert.equal(penalty.data.attendedSessions, 0);
  assert.equal(penalty.data.absentExcused, 1);
  assert.equal(penalty.data.attendanceRate, 0);
  const list = await (await request('/api/trainees')).json();
  const publicTrainee = list.data.find(item => item.traineeId === '25520918');
  assert.equal(publicTrainee.accumulatedStars, penalty.data.sessionStars.reduce((sum, log) => sum + log.starsAwarded, 0));
  assert.equal(publicTrainee.absentExcused, 1);
  assert.equal(publicTrainee.email, undefined);
  const changed = await request('/api/auth/accounts/' + id, { method: 'PUT', session: cookie, body: { ...payload, password: '', permissions: ['assignments:manage'] } });
  assert.equal(changed.status, 200);
  assert.equal((await request('/api/admin/attendance/25520918/TP-M10.01', { method: 'PUT', session, body: edit })).status, 401);
  const renewed = mint((await database.authenticateUser(payload.username, payload.password)).user);
  assert.equal((await request('/api/assignments/1/submissions', { session: renewed })).status, 200);
  assert.equal((await request('/api/admin/attendance/25520918/TP-M10.01', { method: 'PUT', session: renewed, body: edit })).status, 403);
  assert.equal((await request('/api/auth/accounts', { method: 'POST', session: cookie, body: { ...payload, username: 'bad_scope', permissions: ['accounts:manage'] } })).status, 400);
  assert.equal((await request('/api/auth/accounts', { method: 'POST', session: cookie, body: { ...payload, username: process.env.ADMIN_USERNAME } })).status, 400);
  await request('/api/auth/accounts/' + id, { method: 'PUT', session: cookie, body: { ...payload, active: false, password: '' } });
  assert.equal((await database.authenticateUser(payload.username, payload.password)).success, false);
  assert.equal((await request('/api/assignments/1/submissions', { session: renewed })).status, 401);
  const accounts = await (await request('/api/auth/accounts', { session: cookie })).json();
  assert.ok(accounts.data.some(item => item.isOwner));
  assert.ok(accounts.data.every(item => item.password === undefined));
});

test('trainee accounts use MSSV, keep their session and can change their own password', async () => {
  const traineeId = '29990001';
  const created = await database.createTrainee({ traineeId, fullName: 'Trainee Account Fixture', email: 'trainee.account@example.invalid' });
  assert.ok(created.accountRef);
  const authenticated = await database.authenticateUser(traineeId, 'traineeprogram');
  assert.equal(authenticated.success, true);
  assert.equal(authenticated.user.role, 'trainee');
  const session = await database.resolveAccountSession({ accountId: authenticated.user.id, username: traineeId, sessionVersion: authenticated.user.sessionVersion });
  assert.equal(session.traineeId, traineeId);
  await database.changeAccountPassword(authenticated.user, 'traineeprogram', 'Trainee fixture password 2026');
  assert.equal((await database.authenticateUser(traineeId, 'traineeprogram')).success, false);
  assert.equal((await database.authenticateUser(traineeId, 'Trainee fixture password 2026')).success, true);
});

test('concurrent attendance edits reject stale writes instead of losing another session change', async () => {
  const results = await Promise.allSettled([
    database.saveAttendanceEntry('25520918', 'TP-M10.01', { sessionDate: '2026-10-06', attendanceStatus: 'present', starsAwarded: 3, note: 'First edit' }, 'trainer-one'),
    database.saveAttendanceEntry('25520918', 'TP-M10.02', { sessionDate: '2026-10-13', attendanceStatus: 'present', starsAwarded: 4, note: 'Second edit' }, 'trainer-two')
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const rejected = results.find(result => result.status === 'rejected');
  assert.equal(rejected.reason.code, 'EDIT_CONFLICT');
  const trainee = await database.getTraineeById('25520918');
  assert.equal(trainee.accumulatedStars, trainee.sessionStars.reduce((sum, log) => sum + log.starsAwarded, 0));
});

test('public leave board escapes posted content and renders the server submission time without local receipts', async () => {
  const vm = require('node:vm');
  const nodes = {
    leaveHistoryTableBody: { innerHTML: '', querySelectorAll: () => [] },
    leaveHistoryCountBadge: {}
  };
  const context = vm.createContext({
    window: { canManage: () => false },
    document: { getElementById: id => nodes[id] },
    API: { getPublicLeave: async () => [{ id: 'leave-one', traineeId: '70000000', fullName: 'Fixture', reason: '<img src=x onerror=bad()>', submittedAt: '2026-10-31T13:00:00Z', scheduleTitle: 'Fixture lesson', status: 'pending' }] },
    escapeHtml: value => String(value || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  });
  vm.runInContext(require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/js/modules/leave.js'), 'utf8'), context);
  await context.renderLeaveHistoryTable();
  assert.doesNotMatch(nodes.leaveHistoryTableBody.innerHTML, /<img|leave-review/);
  assert.match(nodes.leaveHistoryTableBody.innerHTML, /&lt;img/);
  assert.match(nodes.leaveHistoryTableBody.innerHTML, /datetime="2026-10-31T13:00:00Z"/);
  assert.equal(nodes.leaveHistoryCountBadge.textContent, '1 đơn');
});

test('MongoDB account revocation, attendance totals and public leave projection use persisted records (mocked driver)', async () => {
  const mongoose = require('mongoose');
  const Account = require('../models/Account');
  const Trainee = require('../models/Trainee');
  const Schedule = require('../models/Schedule');
  const Support = require('../models/SupportRequest');
  const original = { connect: mongoose.connect, init: Account.init, create: Account.create, byId: Account.findById, byName: Account.findOne, accountUpdate: Account.findByIdAndUpdate,
    traineeFind: Trainee.findOne, traineeUpdate: Trainee.findOneAndUpdate, traineeList: Trainee.find, scheduleFind: Schedule.find, supportFind: Support.find };
  let account;
  const trainee = { traineeId: '70000000', fullName: 'Fixture', email: 'private@example.invalid', sessionStars: [], accumulatedStars: 0 };
  const clone = value => JSON.parse(JSON.stringify(value));
  try {
    process.env.MONGODB_URI = 'mongodb://mock.invalid/unit-tests';
    mongoose.connect = async () => {};
    await database.connectDB(true);
    Account.init = async () => {};
    Account.create = async data => { account = { ...data, _id: new mongoose.Types.ObjectId().toString(), sessionVersion: 0 }; return { toObject: () => clone(account) }; };
    Account.findById = () => ({ select: () => ({ lean: async () => clone(account) }), lean: async () => clone(account) });
    Account.findOne = () => ({ select: () => ({ lean: async () => clone(account) }) });
    Account.findByIdAndUpdate = (id, update, options) => ({ lean: async () => {
      assert.equal(options.runValidators, true);
      assert.equal(update.$inc.sessionVersion, 1);
      Object.assign(account, update.$set);
      account.sessionVersion++;
      return clone(account);
    } });
    const data = { username: 'mongo_fixture', fullName: 'Mongo fixture', password: 'Fixture password with enough length', role: 'trainer', permissions: ['attendance:manage'], active: true };
    const saved = await database.saveAccount(null, data);
    assert.equal(saved.password, undefined);
    assert.match(account.password, /^scrypt\$/);
    const authenticated = await database.authenticateUser(data.username, data.password);
    const payload = { accountId: saved.id, sessionVersion: authenticated.user.sessionVersion };
    assert.equal((await database.resolveAccountSession(payload)).username, data.username);
    delete account.sessionVersion;
    assert.equal((await database.resolveAccountSession({ accountId: saved.id, sessionVersion: 0 })).username, data.username);
    account.sessionVersion = 0;
    await database.saveAccount(saved.id, { ...data, password: '', active: false });
    assert.equal(await database.resolveAccountSession(payload), null);
    Trainee.findOne = () => ({ select: () => ({ lean: async () => clone(trainee) }) });
    Trainee.find = () => ({ sort: () => ({ select: async () => [] }) });
    Trainee.findOneAndUpdate = (filter, update) => ({ select: () => ({ lean: async () => { Object.assign(trainee, update.$set); return clone(trainee); } }) });
    Schedule.find = () => ({ sort: () => ({ lean: async () => [{ code: 'MONGO-SESSION', title: 'Fixture lesson', date: '2026-10-06', instructor: 'Fixture Trainer' }] }) });
    const attendance = await database.saveAttendanceEntry('70000000', 'MONGO-SESSION', { sessionDate: '2026-10-06', attendanceStatus: 'absent_unexcused', starsAwarded: -4, note: 'Public note' }, 'fixture_admin');
    assert.equal(attendance.accumulatedStars, -4);
    assert.equal(attendance.absentUnexcused, 1);
    assert.equal(attendance.attendedSessions, 0);
    assert.equal(attendance.totalSessions, 1);
    assert.equal(attendance.attendanceRate, 0);
    assert.equal(attendance.email, undefined);
    assert.equal(trainee.sessionStars[0].updatedBy, 'fixture_admin');
    Support.find = filter => {
      assert.deepEqual(filter, { type: 'leave', publicVisible: true });
      return { sort: () => ({ limit: size => {
        assert.equal(size, 100);
        return { lean: async () => [{ _id: 'leave-fixture', traineeId: '70000000', fullName: 'Fixture', message: 'Public reason', createdAt: new Date(), email: 'private@example.invalid', phone: 'private', submissionKey: 'private', resolvedPassword: 'private' }] };
      } }) };
    };
    const publicList = await database.getPublicLeaveRequests();
    assert.equal(publicList[0].reason, 'Public reason');
    for (const key of ['email', 'phone', 'submissionKey', 'resolvedPassword']) assert.equal(publicList[0][key], undefined);
  } finally {
    mongoose.connect = original.connect; Account.init = original.init; Account.create = original.create; Account.findById = original.byId; Account.findOne = original.byName; Account.findByIdAndUpdate = original.accountUpdate;
    Trainee.findOne = original.traineeFind; Trainee.findOneAndUpdate = original.traineeUpdate; Trainee.find = original.traineeList; Schedule.find = original.scheduleFind; Support.find = original.supportFind;
    process.env.MONGODB_URI = '';
    mongoose.connection.emit('disconnected');
  }
});

test('assignment catalog supports adding and deleting beyond eleven with server-side permissions', async () => {
  const session = 'trainee_session=' + security.signToken({ root: true, username: process.env.ADMIN_USERNAME });
  const baseline = await database.getAllAssignments();
  const ids = [];
  const account = await database.saveAccount(null, { username: 'catalog_viewer_fixture', fullName: 'Viewer', password: 'A sufficiently long fixture password', role: 'trainer', permissions: [], active: true });
  const viewer = 'trainee_session=' + security.signToken({ accountId: account.id, sessionVersion: account.sessionVersion, username: account.username });
  try {
    for (const method of ['POST', 'DELETE']) {
      const path = '/api/assignments' + (method === 'DELETE' ? '/1' : '');
      assert.equal((await request(path, { method, body: {}, session: undefined })).status, 401);
      assert.equal((await request(path, { method, body: {}, session: viewer })).status, 403);
    }
    for (const body of [{ title: '' }, { title: 'Invalid link', link: 'javascript:alert(1)' }, { title: 'Invalid date', deadline: 'not-a-date' }]) {
      assert.equal((await request('/api/assignments', { method: 'POST', session, body })).status, 400);
    }
    const responses = await Promise.all(['First new assignment', 'Second new assignment'].map(title => request('/api/assignments', { method: 'POST', session, body: { assignmentId: 1, title, details: 'Private scores stay out of public APIs', status: 'locked' } })));
    for (const response of responses) {
      assert.equal(response.status, 201);
      const result = await response.json();
      assert.ok(result.data.assignmentId > 11);
      ids.push(result.data.assignmentId);
      for (const key of ['score', 'xp', 'gems', 'deletedAt']) assert.equal(result.data[key], undefined);
    }
    assert.equal(new Set(ids).size, 2);
    const saved = await (await request('/api/assignments/' + ids[0], { method: 'PUT', session, body: { title: 'Edited new assignment', status: 'active' } })).json();
    assert.equal(saved.success, true);
    assert.equal(saved.data.title, 'Edited new assignment');
    assert.equal((await request('/api/assignments/1.5', { method: 'DELETE', session })).status, 400);
    assert.equal((await request('/api/assignments/' + ids[0], { method: 'DELETE', session })).status, 200);
    assert.equal((await request('/api/assignments/' + ids[0], { method: 'DELETE', session })).status, 404);
    assert.equal((await request('/api/assignments/' + ids[0], { method: 'PUT', session, body: { title: 'Stale edit' } })).status, 400);
    assert.equal((await request('/api/assignments/' + ids[0] + '/submissions', { session })).status, 400);
    const next = await database.createAssignment({ title: 'Later new assignment' });
    ids.push(next.assignmentId);
    assert.ok(next.assignmentId > Math.max(...ids.slice(0, -1)));
    const list = (await (await request('/api/assignments')).json()).data;
    assert.equal(list.length, baseline.length + 2);
    assert.ok(!list.some(item => item.assignmentId === ids[0]));
  } finally {
    for (const id of ids) await database.deleteAssignment(id);
  }
  assert.deepEqual(await database.getAllAssignments(), baseline);
});

test('MongoDB catalog preserves deleted IDs and submissions, retries collisions and stays empty after deleting all (mocked driver)', async () => {
  const mongoose = require('mongoose');
  const Assignment = require('../models/Assignment');
  const Submission = require('../models/AssignmentSubmission');
  const original = { connect: mongoose.connect, init: Assignment.init, find: Assignment.find, last: Assignment.findOne, create: Assignment.create, update: Assignment.findOneAndUpdate, deleteSubmissions: Submission.deleteMany };
  const rows = [{ assignmentId: 11, title: 'Archived original', deletedAt: new Date() }];
  const asDocument = row => ({ toObject: () => ({ ...row }) });
  let collision = true;
  try {
    process.env.MONGODB_URI = 'mongodb://mock.invalid/unit-tests';
    mongoose.connect = async () => {};
    await database.connectDB(true);
    Assignment.init = async () => {};
    Assignment.findOne = () => ({ sort: () => ({ select: () => ({ lean: async () => rows.reduce((last, row) => row.assignmentId > (last?.assignmentId || 0) ? row : last, null) }) }) });
    Assignment.find = filter => ({ sort: async () => {
      assert.deepEqual(filter, { deletedAt: null });
      return rows.filter(row => !row.deletedAt).map(asDocument);
    } });
    Assignment.create = async data => {
      assert.equal(new Assignment(data).validateSync(), undefined);
      rows.push({ ...data });
      if (collision) { collision = false; throw Object.assign(new Error('Concurrent insert'), { code: 11000 }); }
      return asDocument(data);
    };
    Assignment.findOneAndUpdate = async (filter, update, options) => {
      assert.equal(filter.deletedAt, null);
      assert.equal(options.upsert, undefined);
      assert.equal(options.runValidators, true);
      const row = rows.find(item => item.assignmentId === filter.assignmentId && !item.deletedAt);
      if (!row) return null;
      Object.assign(row, update.$set);
      return asDocument(row);
    };
    Submission.deleteMany = () => assert.fail('Deleting a catalog entry must preserve submissions');
    assert.deepEqual(await database.getAllAssignments(), []);
    const added = await database.createAssignment({ title: 'Added after archived data' });
    assert.equal(added.assignmentId, 13);
    assert.equal((await database.updateAssignment(13, { title: 'Updated' })).title, 'Updated');
    assert.equal(await database.deleteAssignment(12), true);
    assert.equal(await database.deleteAssignment(13), true);
    assert.deepEqual(await database.getAllAssignments(), []);
    assert.deepEqual(await database.getAllAssignments(), []);
    await assert.rejects(database.updateAssignment(13, { title: 'Stale edit' }), /Không tìm thấy/);
    const later = await database.createAssignment({ title: 'After empty catalog' });
    assert.equal(later.assignmentId, 14);
    assert.equal(rows.length, 4);
    Assignment.find = () => ({ sort: async () => { throw new Error('Database unavailable'); } });
    await assert.rejects(database.getAllAssignments(), /Database unavailable/);
  } finally {
    mongoose.connect = original.connect; Assignment.init = original.init; Assignment.find = original.find; Assignment.findOne = original.last; Assignment.create = original.create; Assignment.findOneAndUpdate = original.update; Submission.deleteMany = original.deleteSubmissions;
    process.env.MONGODB_URI = '';
    mongoose.connection.emit('disconnected');
  }
});

test('assignment page creates, edits and deletes in place, keeping the modal open on a failed create', async () => {
  const vm = require('node:vm');
  const nodes = {};
  const classes = new Set();
  for (const id of ['adminEditAssignmentForm', 'editAssignmentIdHidden', 'editAssignmentTitle', 'editAssignmentDesc', 'editAssignmentDetails', 'editAssignmentLink', 'editAssignmentStatus', 'editAssignmentDeadline', 'editAssignmentSubTitle', 'editAssignmentModalTitle', 'assignmentEditorFeedback', 'btnSubmitAdminEditAssignment', 'assignmentManagementFeedback']) nodes[id] = { value: '', dataset: {}, focus() {} };
  nodes.adminEditAssignmentModal = { classList: { add: (...values) => values.forEach(value => classes.add(value)), remove: (...values) => values.forEach(value => classes.delete(value)) } };
  const deleteButton = { dataset: { id: '12' } };
  nodes.adminAssignmentsTableBody = { querySelectorAll: selector => selector === '.btn-delete-assignment' ? [deleteButton] : [] };
  let catalog = [];
  let creates = 0;
  let edits = 0;
  let deletes = 0;
  let refreshes = 0;
  let failCreate = true;
  let confirmed = false;
  const api = {
    getAssignments: async () => catalog,
    createAssignment: async data => {
      if (failCreate) throw new Error('Không kết nối được');
      creates++;
      assert.equal(data.deadline, '2026-11-10T15:30:00.000Z');
      catalog = [{ ...data, assignmentId: 12 }];
      return catalog[0];
    },
    updateAssignment: async (id, data) => { assert.equal(id, 12); edits++; catalog[0] = { ...catalog[0], ...data }; return { success: true }; },
    deleteAssignment: async id => { assert.equal(id, '12'); deletes++; catalog = []; }
  };
  const context = vm.createContext({
    API: api, window: { API: api, duolingoManager: { fetchAssignmentsFromAPI: async () => { refreshes++; } } },
    canManage: () => true, confirm: () => confirmed, console,
    document: { getElementById: id => nodes[id] }, escapeHtml: value => String(value || '').replace(/</g, '&lt;')
  });
  vm.runInContext(require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/js/modules/admin.js'), 'utf8'), context);
  context.openAdminEditAssignmentModal();
  assert.equal(nodes.editAssignmentIdHidden.value, '');
  assert.equal(nodes.editAssignmentModalTitle.textContent, 'Thêm bài tập');
  nodes.editAssignmentTitle.value = 'New assignment';
  nodes.editAssignmentDeadline.value = '2026-11-10T22:30';
  await nodes.adminEditAssignmentForm.onsubmit({ preventDefault() {} });
  assert.ok(classes.has('open'));
  assert.match(nodes.assignmentEditorFeedback.textContent, /Không kết nối/);
  assert.equal(nodes.btnSubmitAdminEditAssignment.disabled, false);
  failCreate = false;
  await nodes.adminEditAssignmentForm.onsubmit({ preventDefault() {} });
  assert.equal(creates, 1);
  assert.equal(edits, 0);
  assert.ok(!classes.has('open'));
  context.openAdminEditAssignmentModal(catalog[0]);
  nodes.editAssignmentTitle.value = 'Edited assignment';
  await nodes.adminEditAssignmentForm.onsubmit({ preventDefault() {} });
  assert.equal(edits, 1);
  await deleteButton.onclick();
  assert.equal(deletes, 0);
  confirmed = true;
  await deleteButton.onclick();
  assert.equal(deletes, 1);
  assert.equal(refreshes, 3);
  assert.match(nodes.adminAssignmentsTableBody.innerHTML, /Chưa có bài tập/);
});

test('locked assignment content is hidden from public APIs while editors retain access', async () => {
  const session = 'trainee_session=' + security.signToken({ root: true, username: process.env.ADMIN_USERNAME });
  const item = await database.createAssignment({ title: 'Locked fixture', desc: 'Hidden summary', details: 'Hidden requirements', link: 'https://forms.office.com/secret-fixture', status: 'locked' });
  try {
    const publicItem = (await (await request('/api/assignments')).json()).data.find(row => row.assignmentId === item.assignmentId);
    assert.equal(publicItem.status, 'locked');
    for (const field of ['desc', 'details', 'link']) assert.equal(publicItem[field], undefined);
    const editorItem = (await (await request('/api/assignments', { session })).json()).data.find(row => row.assignmentId === item.assignmentId);
    assert.equal(editorItem.details, item.details);
    assert.equal(editorItem.link, item.link);
    const viewer = await database.saveAccount(null, { username: 'locked_content_viewer', fullName: 'Viewer', password: 'Fixture password long enough', role: 'trainer', permissions: [], active: true });
    const viewerSession = 'trainee_session=' + security.signToken({ accountId: viewer.id, sessionVersion: viewer.sessionVersion, username: viewer.username });
    const viewerItem = (await (await request('/api/assignments', { session: viewerSession })).json()).data.find(row => row.assignmentId === item.assignmentId);
    for (const field of ['desc', 'details', 'link']) assert.equal(viewerItem[field], undefined);
    await database.updateAssignment(item.assignmentId, { status: 'active' });
    const opened = (await (await request('/api/assignments')).json()).data.find(row => row.assignmentId === item.assignmentId);
    assert.equal(opened.details, item.details);
  } finally { await database.deleteAssignment(item.assignmentId); }
});

test('locked assignment nodes and direct modal calls deny guests, allow editors and avoid caching hidden content', () => {
  const vm = require('node:vm');
  const children = [];
  const cache = new Map();
  const classes = new Set();
  let editing = false;
  const nodes = {
    duoPathContainer: { set innerHTML(value) { children.length = 0; }, appendChild(child) { children.push(child); } },
    duoAssignmentModal: { classList: { add: value => classes.add(value), remove: value => classes.delete(value) } },
    duoModalTitle: {}, duoModalDesc: {}, duoModalDetails: {}
  };
  const context = vm.createContext({
    window: { canManage: () => editing },
    localStorage: { setItem: (key, value) => cache.set(key, value) },
    document: { getElementById: id => nodes[id], createElement: () => ({ style: {}, classList: { add() {} }, addEventListener(event, handler) { this.onclick = handler; } }) }
  });
  vm.runInContext(require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/js/duolingo.js'), 'utf8'), context);
  const manager = vm.runInContext('Object.create(DuolingoManager.prototype)', context);
  manager.loadState = 'ready';
  manager.updateModalCountdown = () => {};
  manager.assignments = [{ assignmentId: 1, title: 'Locked', status: 'locked', details: 'Secret requirements', desc: 'Secret summary', link: 'https://example.invalid/secret' }];
  manager.renderPath();
  assert.match(children[0].innerHTML, /<button[^>]*disabled/);
  children[0].onclick();
  assert.ok(!classes.has('active'));
  manager.openAssignmentModal(manager.assignments[0]);
  assert.equal(manager.selectedAssignment, null);
  editing = true;
  manager.renderPath();
  assert.doesNotMatch(children[0].innerHTML, /<button[^>]*disabled/);
  children[0].onclick();
  assert.ok(classes.has('active'));
  assert.equal(nodes.duoModalDetails.textContent, 'Secret requirements');
  manager.saveAssignments();
  for (const value of cache.values()) assert.doesNotMatch(value, /Secret|example.invalid/);
  editing = false;
  manager.openAssignmentModal(manager.assignments[0]);
  assert.ok(!classes.has('active'));
});

test('optional schedule documents are validated, saved, published and cleared in fallback mode', async () => {
  const session = 'trainee_session=' + security.signToken({ root: true, username: process.env.ADMIN_USERNAME });
  const body = { title: 'Document fixture', code: 'DOCUMENT-FIXTURE', date: '2027-02-10', startTime: '20:00', endTime: '22:30', documentUrl: ' https://example.invalid/training-document?part=1&lang=vi ' };
  assert.equal((await request('/api/schedules', { method: 'POST', body })).status, 401);
  for (const documentUrl of ['javascript:alert(1)', 'data:text/html,test', 'not-a-url', 'https://example.invalid/' + 'a'.repeat(2048)]) {
    assert.equal((await request('/api/schedules', { method: 'POST', session, body: { ...body, documentUrl } })).status, 400);
  }
  const response = await request('/api/schedules', { method: 'POST', session, body });
  assert.equal(response.status, 201);
  const item = (await response.json()).data;
  try {
    assert.equal(item.documentUrl, body.documentUrl.trim());
    await database.updateSchedule(item._id, { title: 'Updated title' });
    const list = (await (await request('/api/schedules?month=2&year=2027')).json()).data;
    assert.equal(list.find(row => row._id === item._id).documentUrl, body.documentUrl.trim());
    await assert.rejects(database.updateSchedule(item._id, { documentUrl: 'javascript:alert(1)' }), /Link tài liệu/);
    assert.equal((await database.updateSchedule(item._id, { documentUrl: '' })).documentUrl, '');
  } finally { await database.deleteSchedule(item._id); }
});

test('MongoDB schedules preserve optional document links on unrelated edits and allow clearing them (mocked driver)', async () => {
  const mongoose = require('mongoose');
  const Schedule = require('../models/Schedule');
  const Trainee = require('../models/Trainee');
  const original = { connect: mongoose.connect, create: Schedule.create, find: Schedule.findById, update: Schedule.findByIdAndUpdate, traineeFind: Trainee.find };
  let stored;
  try {
    process.env.MONGODB_URI = 'mongodb://mock.invalid/unit-tests';
    mongoose.connect = async () => {};
    await database.connectDB(true);
    Schedule.create = async data => {
      const doc = new Schedule(data);
      assert.equal(doc.validateSync(), undefined);
      stored = doc.toObject();
      return doc;
    };
    Schedule.findById = () => ({ lean: async () => ({ ...stored }) });
    Schedule.findByIdAndUpdate = (id, update) => ({ lean: async () => { Object.assign(stored, update.$set); return { ...stored }; } });
    Trainee.find = () => ({ select: () => ({ lean: async () => [] }) });
    const item = await database.createSchedule({ title: 'Document Mongo fixture', date: '2027-02-10', startTime: '20:00', endTime: '22:30', documentUrl: 'https://example.invalid/document' });
    assert.equal(item.documentUrl, 'https://example.invalid/document');
    const updated = await database.updateSchedule(String(item._id), { title: 'Updated' });
    assert.equal(updated.documentUrl, item.documentUrl);
    assert.equal((await database.updateSchedule(String(item._id), { documentUrl: '' })).documentUrl, '');
    await assert.rejects(database.updateSchedule(String(item._id), { documentUrl: 'javascript:test' }), /Link tài liệu/);
  } finally {
    mongoose.connect = original.connect; Schedule.create = original.create; Schedule.findById = original.find; Schedule.findByIdAndUpdate = original.update; Trainee.find = original.traineeFind;
    process.env.MONGODB_URI = '';
    mongoose.connection.emit('disconnected');
  }
});

test('schedule agenda and calendar show document links only when valid, and document clicks do not join class', () => {
  const vm = require('node:vm');
  let chipClick;
  let joins = 0;
  const chip = { getAttribute: () => 'doc-session', addEventListener: (event, handler) => { chipClick = handler; } };
  const makeElement = () => ({
    children: [], appendChild(child) { this.children.push(child); },
    querySelector: () => ({ addEventListener() {} }),
    querySelectorAll: selector => selector === '.cal-event-chip' ? [chip] : []
  });
  const context = vm.createContext({ window: {}, document: { createElement: makeElement } });
  vm.runInContext(require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/js/scheduleData.js'), 'utf8'), context);
  const manager = context.window.ScheduleManager;
  manager.selectedMonth = 2; manager.selectedYear = 2027;
  manager.cachedSchedules = [
    { _id: 'doc-session', title: 'With document', date: '2027-02-10', startTime: '20:00', endTime: '22:30', documentUrl: 'https://example.invalid/doc?a=1&b=2' },
    { _id: 'empty-session', title: 'No document', date: '2027-02-11', startTime: '20:00', endTime: '22:30', documentUrl: '' },
    { _id: 'unsafe-session', title: 'Unsafe old document', date: '2027-02-12', startTime: '20:00', endTime: '22:30', documentUrl: 'javascript:alert(1)' }
  ];
  const agenda = makeElement();
  manager.renderMonthlyAgenda(agenda);
  const cards = agenda.children.at(-1).children;
  assert.match(cards[0].innerHTML, /session-document-link/);
  assert.match(cards[0].innerHTML, /a=1&amp;b=2/);
  for (const card of cards.slice(1)) assert.doesNotMatch(card.innerHTML, /session-document-link/);
  const calendar = makeElement();
  manager.renderMonthlyCalendarGrid(calendar);
  const html = calendar.children[0].innerHTML;
  assert.equal((html.match(/session-document-link/g) || []).length, 1);
  assert.doesNotMatch(html, /javascript:/);
  manager.handleJoinClass = () => { joins++; };
  chipClick({ stopPropagation() {}, target: { closest: () => ({}) } });
  assert.equal(joins, 0);
  chipClick({ stopPropagation() {}, target: { closest: () => null } });
  assert.equal(joins, 1);
});

test('trainee animal avatars are local, stable and consistent between API and UI', async () => {
  const vm = require('node:vm');
  const context = vm.createContext({ window: {}, document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] } });
  vm.runInContext(require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/js/modules/core.js'), 'utf8'), context);
  const list = (await (await request('/api/trainees')).json()).data;
  for (const trainee of list) {
    assert.match(trainee.avatar, /^\/assets\/whale_[1-4]\.png$/);
    assert.equal(context.getTraineeDicebearAvatar({ ...trainee, avatar: 'https://api.dicebear.com/9.x/avataaars/svg?seed=old' }), trainee.avatar);
    assert.equal(context.getTraineeDicebearAvatar(trainee.traineeId), trainee.avatar);
    assert.ok(require('node:fs').existsSync(require('node:path').join(__dirname, '../public', trainee.avatar)));
  }
});

test('Q&A answers require scoped access, use the authenticated Trainer and persist in fallback mode', async () => {
  const question = await database.createQuestion({ isAnonymous: true, title: 'Question fixture', content: 'Question fixture content for answering.' });
  const account = await database.saveAccount(null, { username: 'qa_answer_fixture', fullName: 'Fixture Trainer', password: 'Long fixture password for QA', role: 'trainer', permissions: [], active: true });
  const mint = user => 'trainee_session=' + security.signToken({ accountId: user.id, username: user.username, sessionVersion: user.sessionVersion });
  const path = '/api/questions/' + question.code + '/answer';
  const body = { answer: 'Verified answer', answeredBy: 'Spoofed Trainer' };
  assert.equal((await request(path, { method: 'PUT', body })).status, 401);
  assert.equal((await request(path, { method: 'PUT', session: mint(account), body })).status, 403);
  const permitted = await database.saveAccount(account.id, { ...account, password: '', permissions: ['questions:manage'] });
  const response = await request(path, { method: 'PUT', session: mint(permitted), body });
  assert.equal(response.status, 200);
  const saved = (await response.json()).data;
  assert.equal(saved.answer, body.answer);
  assert.equal(saved.answeredBy, 'Fixture Trainer');
  assert.equal(saved.mssv, 'Ẩn danh');
  assert.equal(saved.realMssv, undefined);
  assert.ok(saved.answeredAt);
  const publicList = (await (await request('/api/questions')).json()).data;
  assert.equal(publicList.find(item => item.code === question.code).answer, body.answer);
  assert.equal((await request(path, { method: 'PUT', session: mint(permitted), body: { answer: '   ' } })).status, 400);
  assert.equal((await request('/api/questions/' + question.code, { method: 'DELETE', session: mint(permitted) })).status, 200);
  assert.ok(!(await database.getAllQuestions()).some(item => item.code === question.code));
});

test('Q&A details open with the shared modal classes and answers update only after API success', async () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const classes = new Set();
  const events = {};
  let bindings = 0;
  let editing = false;
  let finish;
  let reply = async () => ({ success: false, message: 'Không lưu được phản hồi' });
  const fixture = { _id: 'question-fixture', code: 'Q-FIXTURE', title: 'Fixture question', content: '<script>Question content</script>', status: 'pending', mssv: 'Fixture', category: 'Kỹ thuật', createdAt: '2026-10-31T12:00:00Z' };
  const button = { addEventListener: (event, handler) => { events.view = handler; } };
  const row = { dataset: { id: fixture._id }, querySelector: () => button };
  const nodes = {
    viewQuestions: { dataset: {} }, questionTableBody: { querySelectorAll: () => [row] },
    questionDetailModal: { classList: { add: (...values) => values.forEach(value => classes.add(value)), remove: (...values) => values.forEach(value => classes.delete(value)) }, addEventListener() {} },
    qModalText: {}, qModalAnswerBody: {}, qModalAnswerBox: { style: {} }, qModalReplyBox: { style: {} }, qReplyInput: { value: '' }, qReplyFeedback: {},
    btnSubmitQReply: { addEventListener: (event, handler) => { events.reply = handler; bindings++; } },
    closeQuestionDetailModalBtn: { addEventListener: (event, handler) => { events.close = handler; } }
  };
  const api = { answerQuestion: (...args) => reply(...args) };
  const context = vm.createContext({
    fixture, API: api, window: { API: api }, state: { currentUser: { fullName: 'Trainer' } }, canManage: () => editing,
    document: { getElementById: id => nodes[id], querySelectorAll: () => [] },
    escapeHtml: value => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  });
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../public/js/modules/qa.js'), 'utf8'), context);
  vm.runInContext('questionsState.questions = [fixture]; questionsState.loadState = "ready";', context);
  context.setupQuestionEvents();
  context.setupQuestionEvents();
  assert.equal(bindings, 1);
  context.renderQuestionBoard();
  events.view();
  assert.ok(classes.has('open') && classes.has('show'));
  assert.equal(nodes.qModalText.textContent, fixture.content);
  assert.equal(nodes.qModalReplyBox.style.display, 'none');
  editing = true;
  context.openQuestionModal(fixture._id);
  assert.equal(nodes.qModalReplyBox.style.display, 'block');
  nodes.qReplyInput.value = 'Draft answer';
  await events.reply();
  assert.equal(fixture.status, 'pending');
  assert.equal(nodes.qReplyInput.value, 'Draft answer');
  assert.match(nodes.qReplyFeedback.textContent, /Không lưu/);
  reply = () => new Promise(resolve => { finish = resolve; });
  const pending = events.reply();
  assert.equal(nodes.btnSubmitQReply.disabled, true);
  assert.equal(fixture.status, 'pending');
  finish({ success: true, data: { ...fixture, status: 'answered', answer: '<script>Safe text answer</script>', answeredBy: 'Actual Trainer', answeredAt: '2026-10-31T13:00:00Z' } });
  await pending;
  assert.equal(fixture.status, 'answered');
  assert.equal(nodes.qModalAnswerBody.textContent, fixture.answer);
  assert.equal(nodes.qModalAnswerBody.innerHTML, undefined);
  assert.equal(nodes.btnSubmitQReply.disabled, false);
  assert.match(nodes.questionTableBody.innerHTML, /&lt;script&gt;Safe text answer/);
  events.close();
  assert.ok(!classes.has('open') && !classes.has('show'));
});

test('Q&A empty lists and failures never revive deleted questions from browser cache', async () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const nodes = { questionTableBody: {}, questionBoardCountBadge: {} };
  const api = { getQuestions: async () => [] };
  const context = vm.createContext({
    API: api, window: { API: api }, state: {}, canManage: () => false,
    localStorage: { getItem: () => '[{"code":"Q-2026-004","title":"Deleted sample"}]' },
    document: { getElementById: id => nodes[id] }, escapeHtml: value => String(value || '').replace(/</g, '&lt;')
  });
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../public/js/modules/qa.js'), 'utf8'), context);
  await context.renderQuestionsView();
  assert.equal(nodes.questionBoardCountBadge.textContent, '0 câu hỏi');
  assert.doesNotMatch(nodes.questionTableBody.innerHTML, /Deleted sample|Q-2026-004/);
  api.getQuestions = async () => { throw new Error('Connection failed'); };
  await context.renderQuestionsView();
  assert.match(nodes.questionTableBody.innerHTML, /Connection failed/);
  assert.doesNotMatch(nodes.questionTableBody.innerHTML, /Deleted sample|Q-2026-004/);
});

test('MongoDB Q&A answers and deletions support stable codes without falling back after write failures (mocked driver)', async () => {
  const mongoose = require('mongoose');
  const Question = require('../models/Question');
  const original = { connect: mongoose.connect, update: Question.findOneAndUpdate, remove: Question.findOneAndDelete, find: Question.find };
  let stored = { code: 'Q-FIXTURE', title: 'Fixture', content: 'Fixture question content', status: 'pending' };
  try {
    process.env.MONGODB_URI = 'mongodb://mock.invalid/unit-tests';
    mongoose.connect = async () => {};
    await database.connectDB(true);
    Question.findOneAndUpdate = async (filter, update, options) => {
      assert.deepEqual(filter, { code: 'Q-FIXTURE' });
      assert.equal(options.upsert, undefined);
      assert.equal(options.runValidators, true);
      Object.assign(stored, update.$set);
      return { toObject: () => ({ ...stored }) };
    };
    Question.find = () => ({ sort: () => ({ lean: async () => stored ? [{ ...stored }] : [] }) });
    Question.findOneAndDelete = async filter => {
      assert.deepEqual(filter, { code: 'Q-FIXTURE' });
      const removed = stored; stored = null;
      return { toObject: () => removed };
    };
    const saved = await database.answerQuestion('Q-FIXTURE', 'Persisted answer', 'Actual Trainer');
    assert.equal(saved.answer, 'Persisted answer');
    assert.equal(saved.answeredBy, 'Actual Trainer');
    assert.ok(saved.answeredAt instanceof Date);
    Question.findOneAndUpdate = async () => { throw new Error('Write failed'); };
    await assert.rejects(database.answerQuestion('Q-2026-001', 'Must not become a local answer'), /Write failed/);
    assert.equal((await database.deleteQuestion('Q-FIXTURE')).code, 'Q-FIXTURE');
    assert.deepEqual(await database.getAllQuestions(), []);
    Question.find = () => ({ sort: () => ({ lean: async () => { throw new Error('Read failed'); } }) });
    await assert.rejects(database.getAllQuestions(), /Read failed/);
  } finally {
    mongoose.connect = original.connect; Question.findOneAndUpdate = original.update; Question.findOneAndDelete = original.remove; Question.find = original.find;
    process.env.MONGODB_URI = '';
    mongoose.connection.emit('disconnected');
  }
});

test('MongoDB assignment confirmations upsert one record per trainee and preserve review metadata (mocked driver)', async () => {
  const mongoose = require('mongoose');
  const Assignment = require('../models/Assignment');
  const Submission = require('../models/AssignmentSubmission');
  const Trainee = require('../models/Trainee');
  const originals = { connect: mongoose.connect, count: Assignment.countDocuments, find: Assignment.find, trainee: Trainee.findOne, upsert: Submission.findOneAndUpdate };
  let record;
  try {
    process.env.MONGODB_URI = 'mongodb://mock.invalid/unit-tests';
    mongoose.connect = async () => {};
    await database.connectDB(true);
    Assignment.countDocuments = async () => 1;
    Assignment.find = () => ({ sort: async () => [{ toObject: () => ({ assignmentId: 1, title: 'Test' }) }] });
    Trainee.findOne = () => ({ select: () => ({ lean: async () => ({ traineeId: leave.traineeId, fullName: leave.fullName }) }) });
    Submission.findOneAndUpdate = (filter, update, options) => ({ lean: async () => {
      assert.deepEqual(filter, { assignmentId: 1, traineeId: leave.traineeId });
      assert.equal(options.upsert, true);
      assert.equal(options.runValidators, true);
      record = { ...update.$set };
      return record;
    } });
    await database.updateAssignmentSubmission(1, leave.traineeId, { status: 'submitted', responseId: '42', submittedAt: null, note: '' }, 'trainer');
    await database.updateAssignmentSubmission(1, leave.traineeId, { status: 'completed', responseId: '42', submittedAt: null, note: '' }, 'trainer');
    assert.equal(record.status, 'completed');
    assert.equal(record.reviewedBy, 'trainer');
    assert.ok(record.reviewedAt instanceof Date);
    assert.equal(new Submission(record).validateSync(), undefined);
  } finally {
    mongoose.connect = originals.connect;
    Assignment.countDocuments = originals.count;
    Assignment.find = originals.find;
    Trainee.findOne = originals.trainee;
    Submission.findOneAndUpdate = originals.upsert;
    process.env.MONGODB_URI = '';
    mongoose.connection.emit('disconnected');
  }
});

test('MongoDB persistence branch uses atomic upsert, schema validation and atomic mail claim (mocked driver)', async () => {
  const mongoose = require('mongoose');
  const Trainee = require('../models/Trainee');
  const Schedule = require('../models/Schedule');
  const Support = require('../models/SupportRequest');
  const original = { connect: mongoose.connect, traineeFind: Trainee.findOne, scheduleFind: Schedule.find, init: Support.init, upsert: Support.findOneAndUpdate };
  let record;
  try {
    mongoose.connect = async () => {};
    assert.equal(await database.connectDB(true), false);
    process.env.MONGODB_URI = 'mongodb://mock.invalid/unit-tests';
    assert.equal(await database.connectDB(true), true);
    Trainee.findOne = () => ({ select: () => ({ lean: async () => ({ traineeId: leave.traineeId, fullName: leave.fullName, email: 'student@example.invalid' }) }) });
    Schedule.find = () => ({ sort: () => ({ lean: async () => [{ code: leave.scheduleCode, title: 'Training session', date: leave.scheduleDate, startTime: '19:30', endTime: '21:30' }] }) });
    Support.init = async () => {};
    Support.findOneAndUpdate = (filter, update, options) => ({ lean: async () => {
      if (update.$setOnInsert) {
        assert.equal(options.upsert, true);
        assert.equal(options.runValidators, true);
        assert.equal(filter.submissionKey.length, 64);
        if (!record) record = { ...update.$setOnInsert, _id: new mongoose.Types.ObjectId().toString() };
      } else {
        assert.ok(filter.$or);
        Object.assign(record, update.$set);
      }
      return { ...record };
    } });
    const first = await database.createLeaveRequest(leave);
    const again = await database.createLeaveRequest(leave);
    assert.equal(first._id, again._id);
    assert.equal(first.status, 'pending');
    assert.equal((await database.updateLeaveRequest(first._id, { emailStatus: 'sending' }, true)).emailStatus, 'sending');
    assert.equal(new Support(first).validateSync(), undefined);
    assert.ok(new Support({ type: 'leave', traineeId: '123456', emailStatus: 'invalid' }).validateSync());
  } finally {
    mongoose.connect = original.connect;
    Trainee.findOne = original.traineeFind;
    Schedule.find = original.scheduleFind;
    Support.init = original.init;
    Support.findOneAndUpdate = original.upsert;
    process.env.MONGODB_URI = '';
    mongoose.connection.emit('disconnected');
  }
});

test('notifications: schedule, Q&A and assignment events reach only opted-in trainees in fallback mode', async () => {
  const mint = user => 'trainee_session=' + security.signToken({ accountId: user.id, username: user.username, sessionVersion: user.sessionVersion });
  const login = async traineeId => {
    const auth = await database.authenticateUser(traineeId, 'traineeprogram');
    assert.equal(auth.success, true);
    return mint(auth.user);
  };
  const list = async session => (await (await request('/api/notifications', { session })).json()).data;
  const asker = '29990101', muted = '29990102', other = '29990103';
  for (const traineeId of [asker, muted, other]) await database.createTrainee({ traineeId, fullName: 'Notify ' + traineeId, email: `notify${traineeId}@example.invalid` });
  await database.updateTraineeProfile(muted, { notificationPreferences: { scheduleNotify: false, assignmentNotify: false, questionNotify: false } });
  const profile = await database.getTraineeProfile(muted);
  assert.deepEqual(profile.notificationPreferences, { assignmentNotify: false, scheduleNotify: false, questionNotify: false });
  const [askerSession, mutedSession, otherSession] = [await login(asker), await login(muted), await login(other)];

  assert.equal((await request('/api/notifications')).status, 401);
  const editorAccount = await database.saveAccount(null, { username: 'notify_editor_fixture', fullName: 'Notify Editor', password: 'Long fixture password for notifications', role: 'trainer', permissions: ['schedules:manage', 'questions:manage'], active: true });
  const editor = mint(editorAccount);
  assert.equal((await request('/api/notifications', { session: editor })).status, 403);
  assert.equal((await list(askerSession)).items.some(item => item.type !== 'assignment'), false);

  const created = await (await request('/api/schedules', { method: 'POST', session: editor, body: { title: 'Notify session', date: '2030-03-12', startTime: '19:30', endTime: '21:30' } })).json();
  assert.equal(created.success, true);
  let own = await list(askerSession);
  assert.equal(own.items.filter(item => item.type === 'schedule').length, 1);
  assert.match(own.items.find(item => item.type === 'schedule').title, /^Lịch học mới: Notify session/);
  assert.equal(own.items.find(item => item.type === 'schedule').link, 'schedule');
  assert.equal((await list(mutedSession)).items.some(item => item.type === 'schedule'), false);

  const sessionPath = '/api/schedules/' + created.data._id;
  await request(sessionPath, { method: 'PUT', session: editor, body: { title: 'Renamed only' } });
  assert.equal((await list(askerSession)).items.filter(item => item.type === 'schedule').length, 1);
  await request(sessionPath, { method: 'PUT', session: editor, body: { startTime: '20:00' } });
  own = await list(askerSession);
  assert.equal(own.items.filter(item => item.type === 'schedule').length, 2);
  assert.match(own.items[0].title, /^Lịch học thay đổi: Renamed only/);
  assert.match(own.items[0].body, /20:00 - 21:30/);
  const pastSession = await database.createSchedule({ title: 'Past session', date: '2020-01-07', startTime: '19:30', endTime: '21:30' });
  assert.ok(pastSession._id);
  assert.equal((await list(askerSession)).items.filter(item => item.type === 'schedule').length, 2);

  const question = await (await request('/api/questions', { method: 'POST', session: askerSession, body: { title: 'Notify question', content: 'Question content for notifications.', isAnonymous: true, mssv: other, traineeId: other } })).json();
  assert.equal(question.success, true);
  assert.equal(question.data.traineeId, undefined);
  const guestQuestion = await database.createQuestion({ title: 'Guest question', content: 'Guest content for notifications.', isAnonymous: true });
  const mutedQuestion = await database.createQuestion({ title: 'Muted question', content: 'Muted content for notifications.', isAnonymous: true, traineeId: muted });
  for (const code of [question.data.code, guestQuestion.code, mutedQuestion.code]) {
    assert.equal((await request(`/api/questions/${code}/answer`, { method: 'PUT', session: editor, body: { answer: 'Notification answer' } })).status, 200);
  }
  own = await list(askerSession);
  assert.equal(own.items.filter(item => item.type === 'question').length, 1);
  assert.equal(own.items[0].type, 'question');
  assert.equal(own.items[0].title, 'Câu hỏi của bạn đã được phản hồi');
  assert.equal(own.items[0].body, 'Notify question');
  assert.equal(own.items[0].link, 'questions');
  assert.equal((await list(otherSession)).items.some(item => item.type === 'question'), false);
  assert.equal((await list(mutedSession)).items.some(item => item.type === 'question'), false);
  for (const item of (await (await request('/api/questions')).json()).data) assert.equal(item.traineeId, undefined);

  const soon = new Date(Date.now() + 5 * 3600000).toISOString();
  const dueSoon = await database.createAssignment({ title: 'Due soon fixture', status: 'active', deadline: soon });
  await database.createAssignment({ title: 'Due later fixture', status: 'active', deadline: new Date(Date.now() + 48 * 3600000).toISOString() });
  await database.createAssignment({ title: 'Due closed fixture', status: 'closed', deadline: soon });
  await database.createAssignment({ title: 'Already expired fixture', status: 'active', deadline: new Date(Date.now() - 3600000).toISOString() });
  await database.updateAssignmentSubmission(dueSoon.assignmentId, other, { status: 'submitted', responseId: '', note: '' }, 'tester');
  own = await list(askerSession);
  const reminders = own.items.filter(item => item.title.includes('fixture'));
  assert.deepEqual(reminders.map(item => item.title), ['Sắp đến hạn nộp: Due soon fixture']);
  assert.equal(new Date(reminders[0].dueAt).toISOString(), soon);
  assert.equal(reminders[0].link, 'assignments');
  assert.equal((await list(askerSession)).items.filter(item => item.title.includes('Due soon fixture')).length, 1);
  assert.equal((await list(otherSession)).items.some(item => item.title.includes('Due soon fixture')), false);
  assert.equal((await list(mutedSession)).items.some(item => item.type === 'assignment'), false);

  const before = await list(askerSession);
  const target = before.items.find(item => !item.read);
  assert.equal((await request(`/api/notifications/${target.id}/read`, { method: 'PUT', session: otherSession, body: {} })).status, 200);
  assert.equal((await list(askerSession)).unread, before.unread);
  const read = await (await request(`/api/notifications/${target.id}/read`, { method: 'PUT', session: askerSession, body: {} })).json();
  assert.equal(read.data.unread, before.unread - 1);
  assert.equal(read.data.items.find(item => item.id === target.id).read, true);
  assert.equal((await (await request('/api/notifications/read-all', { method: 'PUT', session: askerSession, body: {} })).json()).data.unread, 0);
});

test('notifications: Mongo branch filters recipients by preference, upserts once per event and scopes reads to the owner (mocked driver)', async () => {
  const mongoose = require('mongoose');
  const Notification = require('../models/Notification');
  const Trainee = require('../models/Trainee');
  const Schedule = require('../models/Schedule');
  const Assignment = require('../models/Assignment');
  const original = { connect: mongoose.connect, create: Schedule.create, traineeFind: Trainee.find, assignmentFind: Assignment.find, bulkWrite: Notification.bulkWrite, find: Notification.find, count: Notification.countDocuments, updateMany: Notification.updateMany };
  const calls = { traineeQueries: [], writes: [], filters: [], updates: [] };
  try {
    process.env.MONGODB_URI = 'mongodb://mock.invalid/unit-tests';
    mongoose.connect = async () => {};
    await database.connectDB(true);
    Schedule.create = async data => new Schedule(data);
    Trainee.find = query => { calls.traineeQueries.push(query); return { select: () => ({ lean: async () => [{ traineeId: 'T1' }, { traineeId: 'T2' }] }) }; };
    Assignment.find = () => ({ sort: async () => [] });
    Notification.bulkWrite = async (operations, options) => { calls.writes.push({ operations, options }); };
    Notification.find = filter => { calls.filters.push(filter); return { sort: () => ({ limit: () => ({ lean: async () => [{ _id: 'n1', traineeId: 'T1', type: 'schedule', title: 'Stored', readAt: null, createdAt: new Date() }] }) }) }; };
    Notification.countDocuments = async () => 1;
    Notification.updateMany = async (filter, update) => { calls.updates.push({ filter, update }); return { modifiedCount: 1 }; };

    await database.createSchedule({ title: 'Mongo notify fixture', date: '2030-05-08', startTime: '19:30', endTime: '21:30' });
    assert.deepEqual(calls.traineeQueries[0], { status: { $in: ['Đang học', 'Active'] }, 'notificationPreferences.scheduleNotify': { $ne: false } });
    const [{ operations, options }] = calls.writes;
    assert.equal(options.ordered, false);
    assert.deepEqual(operations.map(item => item.updateOne.filter.traineeId), ['T1', 'T2']);
    assert.equal(new Set(operations.map(item => item.updateOne.filter.refKey)).size, 1);
    for (const { updateOne } of operations) {
      assert.equal(updateOne.upsert, true);
      assert.equal(updateOne.update.$setOnInsert.type, 'schedule');
      assert.equal(updateOne.update.$setOnInsert.readAt, null);
    }

    const listed = await database.getNotifications('T1');
    assert.equal(calls.filters.at(-1).traineeId, 'T1');
    assert.deepEqual(listed, { items: [{ id: 'n1', type: 'schedule', title: 'Stored', body: '', link: '', dueAt: null, read: false, createdAt: listed.items[0].createdAt }], unread: 1 });
    assert.equal(await database.markNotificationsRead('T1', '507f1f77bcf86cd799439011'), 1);
    assert.deepEqual(calls.updates[0].filter, { traineeId: 'T1', readAt: null, _id: '507f1f77bcf86cd799439011' });
    assert.equal(await database.markNotificationsRead('T1', 'not-an-id'), 0);
    assert.equal(calls.updates.length, 1);
  } finally {
    mongoose.connect = original.connect; Schedule.create = original.create; Trainee.find = original.traineeFind; Assignment.find = original.assignmentFind;
    Notification.bulkWrite = original.bulkWrite; Notification.find = original.find; Notification.countDocuments = original.count; Notification.updateMany = original.updateMany;
    process.env.MONGODB_URI = '';
    mongoose.connection.emit('disconnected');
  }
});

test('notification bell renders server text safely, shows the assignment countdown rule and marks items read', async () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const nodes = new Map();
  const makeNode = () => ({
    children: [], style: {}, dataset: {}, listeners: {}, className: '', textContent: '', hidden: false,
    classList: { values: new Set(), toggle(name, on) { on ? this.values.add(name) : this.values.delete(name); }, contains(name) { return this.values.has(name); } },
    addEventListener(type, callback) { this.listeners[type] = callback; }, setAttribute() {}, contains: () => false,
    append(...items) { this.children.push(...items); }, replaceChildren() { this.children = []; }
  });
  for (const id of ['notificationWrapper', 'notificationBtn', 'notificationBadge', 'notificationDropdown', 'notificationList', 'notificationReadAll']) nodes.set(id, makeNode());
  const payload = {
    items: [
      { id: 'a', type: 'assignment', title: '<img src=x onerror=alert(1)>', body: 'Hạn nộp: 10:00', link: 'assignments', dueAt: new Date(Date.now() + 5 * 3600000 + 1800000).toISOString(), read: false, createdAt: new Date().toISOString() },
      { id: 'b', type: 'question', title: 'Q&A', body: '', link: 'questions', dueAt: null, read: true, createdAt: new Date().toISOString() }
    ], unread: 1
  };
  const switched = [];
  const marked = [];
  const context = vm.createContext({
    window: {}, console, state: { currentUser: { role: 'trainee', traineeId: '29990101' } },
    document: { getElementById: id => nodes.get(id), addEventListener() {}, createElement: () => makeNode(), visibilityState: 'visible' },
    setInterval: () => 1, clearInterval() {}, switchTab: tab => switched.push(tab),
    API: { getNotifications: async () => payload, markNotificationRead: async id => { marked.push(id); return { items: payload.items.map(item => ({ ...item, read: true })), unread: 0 }; }, markAllNotificationsRead: async () => payload }
  });
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../public/js/modules/notifications.js'), 'utf8'), context);
  context.window.syncNotificationBell();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(nodes.get('notificationWrapper').style.display, 'inline-flex');
  assert.equal(nodes.get('notificationBadge').hidden, false);
  assert.equal(nodes.get('notificationBadge').textContent, '1');
  const rows = nodes.get('notificationList').children;
  assert.equal(rows.length, 2);
  const titles = rows[0].children.filter(child => child.className === 'notification-title');
  assert.equal(titles[0].textContent, '<img src=x onerror=alert(1)>');
  assert.equal(rows.some(row => row.innerHTML !== undefined), false);
  const countdown = rows[0].children.find(child => child.className === 'notification-countdown');
  assert.match(countdown.textContent, /^5 h \d+ phút còn lại$/);
  assert.match(rows[0].className, /unread/);
  await rows[0].listeners.click();
  assert.deepEqual(switched, ['assignments']);
  assert.deepEqual(marked, ['a']);
  assert.equal(nodes.get('notificationBadge').hidden, true);
  context.state.currentUser = null;
  context.window.syncNotificationBell();
  assert.equal(nodes.get('notificationWrapper').style.display, 'none');
  assert.equal(nodes.get('notificationList').children[0].textContent, 'Đang tải thông báo...');
});
