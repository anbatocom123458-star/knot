// KNOT — Backend authentication module (server-authoritative, no database).
// Sessions are kept in an in-memory Map keyed by session token.
// Suitable for single-instance deployment on a small host (cloud1ram, 1 GB RAM).
// If multi-instance or persistence is ever needed, replace this store with a
// database / Redis and document the operational requirement.

import crypto from "node:crypto";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const HASH_ITERATIONS = 100000;
const HASH_KEYLEN = 64;
const HASH_DIGEST = "sha512";



function now() {
  return Date.now();
}

function makeToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEYLEN, HASH_DIGEST);
  return `${HASH_ITERATIONS}:${salt}:${derived.toString("hex")}`;
}

function verifyPassword(password, stored) {
  const [iterations, salt, hash] = stored.split(":");
  if (!iterations || !salt || !hash) return false;
  const derived = crypto.pbkdf2Sync(password, salt, parseInt(iterations, 10), HASH_KEYLEN, HASH_DIGEST);
  return derived.toString("hex") === hash;
}

export function createAuthStore(users) {
  // users: Map<username, { id, username, passwordHash, displayName, createdAt }>
  const sessions = new Map(); // token -> { userId, username, displayName, expiresAt }
  const loginAttempts = new Map(); // identifier -> { count, lockedUntil }

  function checkRateLimit(ip) {
    const record = loginAttempts.get(ip) || { count: 0, lockedUntil: 0 };
    const t = now();
    if (record.lockedUntil && t < record.lockedUntil) {
      return { allowed: false, retryAfter: Math.ceil((record.lockedUntil - t) / 1000) };
    }
    return { allowed: true, record };
  }

  function recordFailure(ip) {
    const record = loginAttempts.get(ip) || { count: 0, lockedUntil: 0 };
    record.count += 1;
    if (record.count >= MAX_LOGIN_ATTEMPTS) {
      record.lockedUntil = now() + LOGIN_LOCKOUT_MS;
    }
    loginAttempts.set(ip, record);
  }

  function clearFailures(ip) {
    loginAttempts.delete(ip);
  }

  return {
    users,

    register(username, password, displayName) {
      if (!username || !password || username.length < 3 || password.length < 6) {
        return { ok: false, error: "Tên đăng nhập (tối thiểu 3 ký tự) và mật khẩu (tối thiểu 6 ký tự) bắt buộc." };
      }
      if (this.users.has(username)) {
        return { ok: false, error: "Tên đăng nhập đã tồn tại." };
      }
      const id = `user_${crypto.randomBytes(8).toString("hex")}`;
      this.users.set(username, {
        id,
        username,
        passwordHash: hashPassword(password),
        displayName: displayName || username,
        createdAt: now(),
      });
      return { ok: true, user: { id, username, displayName: this.users.get(username).displayName } };
    },

    authenticate(username, password, ip) {
      const limit = checkRateLimit(ip);
      if (!limit.allowed) {
        return { ok: false, error: `Quá nhiều lần đăng nhập sai. Thử lại sau ${limit.retryAfter} giây.` };
      }
      const user = this.users.get(username);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        recordFailure(ip);
        return { ok: false, error: "Tên đăng nhập hoặc mật khẩu không chính xác." };
      }
      clearFailures(ip);
      const token = makeToken();
      sessions.set(token, {
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        expiresAt: now() + SESSION_TTL_MS,
      });
      return {
        ok: true,
        token,
        user: { id: user.id, username: user.username, displayName: user.displayName },
        expiresAt: sessions.get(token).expiresAt,
      };
    },

    logout(token) {
      sessions.delete(token);
      return { ok: true };
    },

    session(token) {
      if (!token) return null;
      const s = sessions.get(token);
      if (!s || s.expiresAt < now()) {
        sessions.delete(token);
        return null;
      }
      return { userId: s.userId, username: s.username, displayName: s.displayName };
    },

    cleanup() {
      const t = now();
      for (const [token, s] of sessions) {
        if (s.expiresAt < t) sessions.delete(token);
      }
    },
  };
}
