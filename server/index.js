// KNOT — Production HTTP server (Node.js, no external framework).
// Serves: /api/auth/* (JSON), /health, and static SPA files from dist/.
// Secrets are read only from environment variables; nothing is embedded here.

import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createAuthStore } from "./auth.js";
import { setupWss } from "./multiplayer.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? "0.0.0.0";
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "knot_session";
const ADMIN_SECRET = process.env.KNOT_ADMIN_SECRET; // optional, not embedded

// In-memory user store (no database required at this stage).
const users = new Map();
const auth = createAuthStore(users);

setInterval(() => auth.cleanup(), 5 * 60 * 1000); // session GC every 5 min

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function getCookie(req, name) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? match[1] : null;
}

function setSessionCookie(res, token) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
  );
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method;
  const ip = req.socket.remoteAddress ?? "unknown";

  if (pathname === "/api/auth/register" && method === "POST") {
    const raw = await readBody(req).catch(() => null);
    let data;
    try { data = JSON.parse(raw || "{}"); } catch { return sendJson(res, 400, { ok: false, error: "Yêu cầu JSON không hợp lệ." }); }
    const result = auth.register(data.username, data.password, data.displayName);
    return sendJson(res, result.ok ? 201 : 400, result);
  }

  if (pathname === "/api/auth/login" && method === "POST") {
    const raw = await readBody(req).catch(() => null);
    let data;
    try { data = JSON.parse(raw || "{}"); } catch { return sendJson(res, 400, { ok: false, error: "Yêu cầu JSON không hợp lệ." }); }
    const result = auth.authenticate(data.username, data.password, ip);
    if (!result.ok) return sendJson(res, 401, result);
    setSessionCookie(res, result.token);
    return sendJson(res, 200, { ok: true, user: result.user, expiresAt: result.expiresAt });
  }

  if (pathname === "/api/auth/logout" && method === "POST") {
    const token = getCookie(req, SESSION_COOKIE_NAME);
    auth.logout(token);
    clearSessionCookie(res);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === "/api/auth/me" && method === "GET") {
    const token = getCookie(req, SESSION_COOKIE_NAME);
    const session = auth.session(token);
    if (!session) return sendJson(res, 401, { ok: false, error: "Chưa đăng nhập hoặc phiên đã hết hạn." });
    return sendJson(res, 200, { ok: true, user: session });
  }

  if (pathname === "/api/auth/session" && method === "GET") {
    const token = getCookie(req, SESSION_COOKIE_NAME);
    const session = auth.session(token);
    return sendJson(res, 200, { ok: !!session, user: session ?? null });
  }

  return sendJson(res, 404, { ok: false, error: "API endpoint không tồn tại." });
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);
  let filePath = join(process.cwd(), "dist", pathname === "/" ? "index.html" : pathname.slice(1));
  const ext = extname(filePath);

  const mime = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".webp": "image/webp",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".ttf": "font/ttf",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
  };

  const stream = createReadStream(filePath);
  stream.on("open", () => {
    if (res.writableEnded) return;
    res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream", "Cache-Control": "public, max-age=31536000" });
  });
  stream.on("error", (err) => {
    if (res.writableEnded) return;
    // SPA fallback: any unknown route -> index.html
    if (pathname.startsWith("/api/")) {
      return sendJson(res, 404, { ok: false, error: "Không tìm thấy." });
    }
    const indexStream = createReadStream(join(process.cwd(), "dist", "index.html"));
    indexStream.on("open", () => {
      if (res.writableEnded) return;
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    });
    indexStream.on("error", () => sendJson(res, 500, { ok: false, error: "Không phục vụ được ứng dụng." }));
    indexStream.pipe(res);
  });
  stream.pipe(res);
}

const server = createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) {
      await handleApi(req, res);
      return;
    }
    if (req.url === "/health") {
      return sendJson(res, 200, { ok: true, service: "knot", time: new Date().toISOString() });
    }
    serveStatic(req, res);
  } catch (error) {
    console.error("unhandled", error);
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: "Lỗi máy chủ nội bộ." });
  }
});

// Nang cap HTTP server ho tro WebSocket (multiplayer) cung cong PORT.
const wss = setupWss(server, auth);
server.on("upgrade", (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`KNOT server listening on http://${HOST}:${PORT}`);
  console.log(`WebSocket multiplayer enabled on ws://${HOST}:${PORT}`);
  if (ADMIN_SECRET) console.log("Admin secret configured.");
  else console.log("Warning: KNOT_ADMIN_SECRET not set (admin endpoints disabled).");
});

export default server;
