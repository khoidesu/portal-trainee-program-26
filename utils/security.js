/**
 * Trainee Portal Security & Authentication Utilities
 * Built with native Node.js 'crypto' module for maximum reliability and zero external bloat.
 */

const crypto = require('crypto');

// Secret key for JWT signing (falls back to persistent env or auto-generated strong key)
const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
if (isProduction && (
  !process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 ||
  /change|example|default|super_secret/i.test(process.env.JWT_SECRET) ||
  !process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12 ||
  /^(1234|admin@UIT2026!|your[-_])/i.test(process.env.ADMIN_PASSWORD)
)) {
  throw new Error('Cần JWT_SECRET ngẫu nhiên tối thiểu 32 ký tự và ADMIN_PASSWORD riêng tối thiểu 12 ký tự.');
}
const JWT_SECRET = crypto.createHash('sha256')
  .update(process.env.JWT_SECRET || crypto.randomBytes(32))
  .update(process.env.ADMIN_PASSWORD || '')
  .digest();
const sessionCookie = isProduction ? '__Host-trainee_session' : 'trainee_session';
const cookieOptions = { httpOnly: true, secure: isProduction, sameSite: 'strict', path: '/' };

/**
 * Base64 URL encode
 */
function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Base64 URL decode
 */
function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Generate a signed JWT token
 * @param {Object} payload - Data to embed in token
 * @param {number} expiresInSeconds - Lifetime in seconds (default: 24h = 86400s)
 */
function signToken(payload, expiresInSeconds = 28800) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(dataToSign)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${dataToSign}.${signature}`;
}

/**
 * Verify and decode a JWT token
 * @param {string} token
 * @returns {Object|null} Payload if valid, null otherwise
 */
function verifyToken(token) {
  if (!token || typeof token !== 'string' || token.length > 4096) return null;

  const parts = token.trim().split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const expectedSignature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(dataToSign)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  // Constant-time comparison to prevent timing attacks
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const header = JSON.parse(base64UrlDecode(encodedHeader));
    if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isInteger(payload.exp) || payload.exp <= now || !Number.isInteger(payload.iat) || payload.iat > now + 30) {
      return null; // Expired
    }
    return payload;
  } catch (err) {
    return null;
  }
}

/**
 * Hash a password using scrypt with random salt
 * @param {string} password
 * @returns {string} Formatted hash string `scrypt$salt$derivedKey`
 */
function hashPassword(password) {
  if (!password) return '';
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(String(password), salt, 64);
  return `scrypt$${salt}$${derivedKey.toString('hex')}`;
}

/**
 * Verify a password against a hash or legacy plaintext
 * @param {string} password - Raw password entered by user
 * @param {string} storedHash - Stored hash or legacy plaintext from DB
 * @returns {boolean} True if matched
 */
function verifyPassword(password, storedHash) {
  if (!password || !storedHash) return false;

  const rawPassword = String(password).trim();
  const rawStored = String(storedHash).trim();

  // If hash is in scrypt format: `scrypt$salt$hash`
  if (rawStored.startsWith('scrypt$')) {
    const parts = rawStored.split('$');
    if (parts.length !== 3 || !/^[a-f0-9]{32}$/i.test(parts[1]) || !/^[a-f0-9]{128}$/i.test(parts[2])) return false;
    const salt = parts[1];
    const originalHash = parts[2];
    const derivedKey = crypto.scryptSync(rawPassword, salt, 64).toString('hex');

    const origBuffer = Buffer.from(originalHash, 'hex');
    const derivedBuffer = Buffer.from(derivedKey, 'hex');
    if (origBuffer.length !== derivedBuffer.length) return false;
    return crypto.timingSafeEqual(origBuffer, derivedBuffer);
  }

  // Backward compatibility: match legacy plaintext (e.g. initial '1234')
  const passBuf = Buffer.from(rawPassword);
  const storedBuf = Buffer.from(rawStored);
  if (passBuf.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(passBuf, storedBuf);
}

/**
 * Escape regular expression special characters to prevent ReDoS / Regex Injection
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
  return String(str || '').replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

/**
 * Sanitize URL to protect against XSS (prevent javascript: etc.)
 * @param {string} url
 * @returns {string} Safe URL or empty string
 */
function sanitizeUrl(url) {
  if (!url) return '';
  const trimmed = String(url).trim();
  // Allow safe protocols only: http, https, mailto, tel, or fragment (#)
  if (/^(https?:\/\/|mailto:|tel:|#)/i.test(trimmed)) {
    return trimmed;
  }
  // If user pasted a domain without protocol (e.g. github.com/...), prepend https://
  if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\/.*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return '';
}

/**
 * Express Middleware: Require valid JWT token
 */
async function requireAuth(req, res, next) {
  if (!req.authChecked) await optionalAuth(req, res, () => {});
  if (!req.user) return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập lại để tiếp tục.' });
  next();
}

/**
 * Express Middleware: Require Admin role
 */
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Từ chối truy cập! Thao tác này chỉ dành riêng cho Quản trị viên (Admin).'
      });
    }
    next();
  });
}

/**
 * In-memory sliding-window rate limiter for brute-force protection
 * @param {number} maxRequests - Max allowed attempts
 * @param {number} windowMs - Time window in milliseconds
 */
function createRateLimiter(maxRequests = 10, windowMs = 60000) {
  const ipAttempts = new Map();
  const scope = `${maxRequests}:${windowMs}`;
  let indexesReady;

  return async (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown-ip';
    const now = Date.now();
    const bucket = Math.floor(now / windowMs);
    let count;
    try {
      if (isProduction) {
        const collection = require('mongoose').connection.collection('security_rate_limits');
        if (!indexesReady) indexesReady = collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(err => { indexesReady = null; throw err; });
        await indexesReady;
        const key = crypto.createHmac('sha256', JWT_SECRET).update(`${scope}:${req.baseUrl}:${req.path}:${ip}:${bucket}`).digest('hex');
        const record = await collection.findOneAndUpdate(
          { _id: key },
          { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((bucket + 2) * windowMs) } },
          { upsert: true, returnDocument: 'after', includeResultMetadata: false }
        );
        count = record.count;
      } else {
        for (const [key, value] of ipAttempts) if (value.bucket !== bucket) ipAttempts.delete(key);
        const data = ipAttempts.get(ip) || { count: 0, bucket };
        count = ++data.count;
        ipAttempts.set(ip, data);
      }
      if (count > maxRequests) {
        const waitSeconds = Math.ceil(((bucket + 1) * windowMs - now) / 1000);
        res.setHeader('Retry-After', String(waitSeconds));
        return res.status(429).json({ success: false, message: `Quá nhiều yêu cầu. Vui lòng thử lại sau ${waitSeconds} giây.` });
      }
      next();
    } catch (err) {
      res.status(503).json({ success: false, message: 'Tạm thời không thể tiếp nhận yêu cầu. Vui lòng thử lại sau.' });
    }
  };
}

function readSession(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookie = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${sessionCookie}=`));
  if (!cookie) return null;
  let raw = cookie.slice(sessionCookie.length + 1).trim();
  try { raw = decodeURIComponent(raw); } catch {}
  return raw.replace(/^["']|["']$/g, '');
}

async function optionalAuth(req, res, next) {
  req.authChecked = true;
  const payload = verifyToken(readSession(req));
  req.user = null;
  if (payload) {
    try {
      req.user = await require('../config/db').resolveAccountSession(payload);
    } catch {
      return res.status(503).json({ success: false, message: 'Không kiểm tra được phiên đăng nhập. Vui lòng thử lại.' });
    }
  }
  next();
}

const CONTENT_PERMISSIONS = ['trainees:manage', 'schedules:manage', 'attendance:manage', 'assignments:manage', 'questions:manage', 'leave:manage'];

function hasPermission(user, permission) {
  return Boolean(user && (user.isOwner || (Array.isArray(user.permissions) && user.permissions.includes(permission))));
}

function canViewMssv(user) {
  if (!user) return false;
  if (user.isOwner) return true;
  if (Array.isArray(user.permissions) && user.permissions.some(p =>
    ['trainees:manage', 'leave:manage', 'questions:manage', 'attendance:manage', 'accounts:manage'].includes(p)
  )) {
    return true;
  }
  return false;
}

function requirePermission(permission) {
  return async (req, res, next) => {
    await requireAuth(req, res, () => {
      if (!hasPermission(req.user, permission)) return res.status(403).json({ success: false, message: 'Tài khoản chưa được cấp quyền thực hiện thao tác này.' });
      next();
    });
  };
}

function setSession(res, user) {
  res.cookie(sessionCookie, signToken(user), { ...cookieOptions, maxAge: 28800000 });
}

function clearSession(res) {
  res.clearCookie(sessionCookie, cookieOptions);
}

function validateInput(req, res, next) {
  function valid(value, depth = 0) {
    if (depth > 12) return false;
    if (typeof value === 'string') return value.length <= 5000000 && !value.includes('\u0000');
    if (typeof value === 'number') return Number.isFinite(value);
    if (Array.isArray(value)) return value.length <= 500 && value.every(item => valid(item, depth + 1));
    if (value && typeof value === 'object') return Object.entries(value).every(([key, item]) => !/[.$]/.test(key) && !['__proto__', 'prototype', 'constructor'].includes(key) && valid(item, depth + 1));
    return value === null || typeof value === 'boolean' || value === undefined;
  }
  if (!valid(req.body) || !valid(req.query) || Object.values(req.query).some(value => typeof value !== 'string' || value.length > 200)) {
    return res.status(400).json({ success: false, message: 'Dữ liệu gửi lên không hợp lệ.' });
  }
  next();
}

module.exports = {
  CONTENT_PERMISSIONS,
  hasPermission,
  canViewMssv,
  requirePermission,
  signToken,
  verifyToken,
  hashPassword,
  verifyPassword,
  escapeRegex,
  sanitizeUrl,
  requireAuth,
  requireAdmin,
  createRateLimiter,
  optionalAuth,
  setSession,
  clearSession,
  validateInput,
  isProduction
};

