'use strict';
/* Пароли (scrypt) и сессии (случайный токен в HttpOnly-cookie, в базе только его хэш) */
const crypto = require('node:crypto');

const SESSION_DAYS = 30;
const COOKIE = 'craftory_sid';

function hashPassword(pass) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pass), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}
function verifyPassword(pass, stored) {
  const [alg, saltB64, hashB64] = String(stored).split('$');
  if (alg !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(String(pass), Buffer.from(saltB64, 'base64'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, actual);
}
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const newId = (prefix) => `${prefix}${crypto.randomBytes(9).toString('base64url')}`;

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('='); if (i < 0) continue;
    const k = part.slice(0, i).trim(); const v = part.slice(i + 1).trim();
    try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
  }
  return out;
}
function sessionCookie(token, { secure, clear = false } = {}) {
  const parts = [`${COOKIE}=${clear ? '' : token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${clear ? 0 : SESSION_DAYS * 86400}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}
function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const t = Date.now();
  db.prepare('INSERT INTO sessions (token_hash, user_id, created, expires) VALUES (?, ?, ?, ?)').run(sha256(token), userId, t, t + SESSION_DAYS * 86400e3);
  return token;
}
function userFromRequest(db, req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return { user: null, tokenHash: null };
  const tokenHash = sha256(token);
  const row = db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires > ?').get(tokenHash, Date.now());
  return { user: row || null, tokenHash: row ? tokenHash : null };
}
function destroySession(db, tokenHash) { if (tokenHash) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash); }
function purgeExpiredSessions(db) { db.prepare('DELETE FROM sessions WHERE expires <= ?').run(Date.now()); }

/* Простое ограничение частоты: не больше limit попыток за windowMs с одного ключа */
function rateLimiter(limit, windowMs) {
  const hits = new Map();
  return (key) => {
    const t = Date.now(); const list = (hits.get(key) || []).filter((x) => t - x < windowMs);
    list.push(t); hits.set(key, list);
    if (hits.size > 10000) for (const [k, v] of hits) if (!v.some((x) => t - x < windowMs)) hits.delete(k);
    return list.length <= limit;
  };
}

module.exports = { hashPassword, verifyPassword, sha256, newId, parseCookies, sessionCookie, createSession, userFromRequest, destroySession, purgeExpiredSessions, rateLimiter, COOKIE };
