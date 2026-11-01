'use strict';
/**
 * Пароли и сессии.
 * Пароль хранится только как хеш scrypt со случайной солью: прочитать или выгрузить его нельзя, только сбросить.
 * Сессия — случайный токен в httpOnly-cookie; в базе лежит лишь SHA-256 от токена.
 */
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const SESSION_DAYS = 30;
const COOKIE = 'omni_sid';

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(String(password), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(String(password), Buffer.from(saltB64, 'base64'), expected.length, { N: +N, r: +r, p: +p, maxmem: 64 * 1024 * 1024 });
  return crypto.timingSafeEqual(key, expected);
}

// Хеш-заглушка: при неизвестном логине всё равно считаем scrypt, чтобы время ответа не выдавало, есть ли такой пользователь.
let dummyHash = null;
async function dummyVerify(password) {
  if (!dummyHash) dummyHash = await hashPassword('dummy-password-for-timing');
  await verifyPassword(password, dummyHash);
  return false;
}

function checkPasswordPolicy(pw) {
  pw = String(pw || '');
  if (pw.length < 8) return 'Пароль — не короче 8 символов';
  if (pw.length > 200) return 'Пароль слишком длинный';
  if (!/[A-Za-zА-Яа-яЁё]/.test(pw) || !/\d/.test(pw)) return 'Пароль должен содержать буквы и цифры';
  return null;
}

/** Временный пароль для нового сотрудника или сброса: 12 символов без похожих букв. */
function tempPassword() {
  const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const dig = '23456789';
  const all = abc + dig;
  const bytes = crypto.randomBytes(12);
  let s = '';
  for (let i = 0; i < 12; i++) s += all[bytes[i] % all.length];
  return s.slice(0, 10) + dig[bytes[0] % dig.length] + abc[bytes[1] % abc.length];
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function createSession(db, userId, meta) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at,ip,ua) VALUES(?,?,?,?,?,?)')
    .run(sha256(token), userId, now + SESSION_DAYS * 864e5, now, meta.ip || null, String(meta.ua || '').slice(0, 300));
  return token;
}

function sessionUser(db, token) {
  if (!token) return null;
  const row = db.prepare(`SELECT u.*, s.token_hash, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`).get(sha256(token));
  if (!row) return null;
  if (row.expires_at < Date.now() || !row.active) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(row.token_hash);
    return null;
  }
  return row;
}

function destroySession(db, token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

function cookieHeader(token, secure, maxAgeDays = SESSION_DAYS) {
  const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${token ? maxAgeDays * 86400 : 0}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/** Ограничение подбора: не больше 5 неудачных попыток на логин+IP за 15 минут. */
function createLimiter(max = 5, windowMs = 15 * 60e3) {
  const hits = new Map();
  return {
    blocked(key) {
      const h = hits.get(key);
      if (!h) return false;
      if (Date.now() - h.first > windowMs) { hits.delete(key); return false; }
      return h.count >= max;
    },
    fail(key) {
      const h = hits.get(key);
      if (!h || Date.now() - h.first > windowMs) hits.set(key, { count: 1, first: Date.now() });
      else h.count++;
    },
    reset(key) { hits.delete(key); }
  };
}

module.exports = { hashPassword, verifyPassword, dummyVerify, checkPasswordPolicy, tempPassword, createSession, sessionUser, destroySession, cookieHeader, createLimiter, COOKIE };
