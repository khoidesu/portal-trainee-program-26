/**
 * Trainee Portal Security & Authentication Utilities
 * Built with native Node.js 'crypto' module for maximum reliability and zero external bloat.
 */

const crypto = require('crypto');

// Secret key for JWT signing (falls back to persistent env or auto-generated strong key)
const JWT_SECRET = process.env.JWT_SECRET || 'uit_portal_trainee_default_jwt_secret_2026_xyz';

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
function signToken(payload, expiresInSeconds = 86400) {
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
  if (!token || typeof token !== 'string') return null;

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
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
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
    if (parts.length !== 3) return false;
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
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.query && req.query.token) {
    token = String(req.query.token).trim();
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Vui lòng đăng nhập để thực hiện thao tác này! (Token không tồn tại)'
    });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({
      success: false,
      message: 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ! Vui lòng đăng nhập lại.'
    });
  }

  req.user = payload;
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

  // Periodic cleanup
  setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of ipAttempts.entries()) {
      if (now - data.firstAttempt > windowMs) {
        ipAttempts.delete(ip);
      }
    }
  }, windowMs);

  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown-ip';
    const now = Date.now();
    const data = ipAttempts.get(ip);

    if (!data) {
      ipAttempts.set(ip, { count: 1, firstAttempt: now });
      return next();
    }

    if (now - data.firstAttempt > windowMs) {
      ipAttempts.set(ip, { count: 1, firstAttempt: now });
      return next();
    }

    data.count += 1;
    if (data.count > maxRequests) {
      const waitSeconds = Math.ceil((windowMs - (now - data.firstAttempt)) / 1000);
      return res.status(429).json({
        success: false,
        message: `Quá nhiều lượt thử! Vui lòng chờ ${waitSeconds} giây trước khi thử lại.`
      });
    }

    next();
  };
}

module.exports = {
  signToken,
  verifyToken,
  hashPassword,
  verifyPassword,
  escapeRegex,
  sanitizeUrl,
  requireAuth,
  requireAdmin,
  createRateLimiter
};

