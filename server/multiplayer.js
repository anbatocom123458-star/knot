// KNOT — Multiplayer server (server-authoritative, WebSocket).
// Chay cung cua HTTP server (server/index.js) qua upgrade WebSocket.

import fs from "node:fs";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import crypto from "node:crypto";

const MAX_PLAYERS_PER_ROOM = 4;
const MSG_RATE_LIMIT = 60;
const MSG_RATE_WINDOW_MS = 1000;
const MAX_PAYLOAD_BYTES = 1024;
const HEARTBEAT_INTERVAL_MS = 30000;
const PHYSICS_TICK_MS = 50;

const ROOT_DIR = process.cwd();

const rooms = new Map();
const sockets = new Map();

function nowMs() {
  return Date.now();
}

function makeRoomId() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

function makeClientId() {
  return crypto.randomBytes(8).toString("hex");
}

function sanitizeName(value) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 24);
}

function defaultPlayerState(clientId, username, displayName) {
  return {
    id: clientId,
    username,
    displayName,
    x: 64,
    y: 416,
    vx: 0,
    vy: 0,
    facing: 1,
    grounded: false,
    hp: 3,
    invulnerable: 0,
    bombs: 0,
    coins: 0,
    gems: 0,
    status: "playing",
    lastInputSeq: -1,
    finishedAt: null,
    input: { left: false, right: false, jump: false, bomb: false },
  };
}

class Room {
  constructor(id, ownerSocket, username, displayName) {
    this.id = id;
    this.createdAt = nowMs();
    this.mapId = "MAP000001";
    this.mapRevision = 0;
    this.players = new Map();
    this.sockets = new Map();
    this.owner = null;
    this.status = "waiting";
    this.addPlayer(ownerSocket, username, displayName, true);
  }

  addPlayer(socket, username, displayName, isOwner = false) {
    if (this.players.size >= MAX_PLAYERS_PER_ROOM) {
      return { ok: false, code: "room_full" };
    }
    const clientId = makeClientId();
    const safeName = sanitizeName(username) || `player_${clientId.slice(0, 4)}`;
    const safeDisplay = sanitizeName(displayName) || safeName;
    const ps = defaultPlayerState(clientId, safeName, safeDisplay);
    this.players.set(clientId, ps);
    this.sockets.set(clientId, socket);
    if (isOwner) this.owner = clientId;
    sockets.set(socket, { roomId: this.id, clientId, lastMsgTimes: [] });
    return { ok: true, clientId, player: ps };
  }

  removePlayer(clientId) {
    if (!this.players.has(clientId)) return;
    this.players.delete(clientId);
    this.sockets.delete(clientId);
    if (this.owner === clientId) {
      const first = this.players.keys().next().value;
      this.owner = first !== undefined ? first : null;
    }
  }

  getPlayer(socket) {
    const info = sockets.get(socket);
    return info ? this.players.get(info.clientId) : null;
  }

  broadcast(type, payload) {
    const msg = JSON.stringify({ type, payload, t: nowMs(), rev: this.mapRevision });
    for (const [clientId, socket] of this.sockets) {
      if (socket.readyState === WebSocket.OPEN) socket.send(msg);
    }
  }

  broadcastExcept(excludeClientId, type, payload) {
    const msg = JSON.stringify({ type, payload, t: nowMs(), rev: this.mapRevision });
    for (const [clientId, socket] of this.sockets) {
      if (clientId === excludeClientId) continue;
      if (socket.readyState === WebSocket.OPEN) socket.send(msg);
    }
  }

  sendTo(clientId, type, payload) {
    const socket = this.sockets.get(clientId);
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type, payload, t: nowMs(), rev: this.mapRevision }));
    }
  }

  setMap(mapId) {
    this.mapId = mapId;
    this.mapRevision += 1;
    this.status = "playing";
    for (const ps of this.players.values()) {
      ps.status = "playing";
      ps.finishedAt = null;
      ps.x = 64;
      ps.y = 416;
      ps.vx = 0;
      ps.vy = 0;
      ps.grounded = false;
      ps.input = { left: false, right: false, jump: false, bomb: false };
    }
    this.broadcast("map_changed", { mapId, revision: this.mapRevision });
  }

  startGame(hostClientId, mapId) {
    if (hostClientId !== this.owner) {
      return { ok: false, code: "not_host" };
    }
    if (this.status === "starting" || this.status === "playing") {
      return { ok: false, code: "already_started" };
    }
    if (typeof mapId !== "string" || !/^[A-Z0-9]{3,12}$/.test(mapId)) {
      return { ok: false, code: "invalid_map" };
    }
    const p = path.join(ROOT_DIR, "maps", mapId, "map.json");
    if (!fs.existsSync(p)) {
      return { ok: false, code: "map_not_found" };
    }
    this.status = "starting";
    this.mapId = mapId;
    this.mapRevision += 1;
    for (const ps of this.players.values()) {
      ps.status = "playing";
      ps.finishedAt = null;
      ps.x = 64;
      ps.y = 416;
      ps.vx = 0;
      ps.vy = 0;
      ps.grounded = false;
      ps.input = { left: false, right: false, jump: false, bomb: false };
    }
    this.status = "playing";
    this.broadcast("game_started", { mapId, revision: this.mapRevision });
    return { ok: true, mapId };
  }

  allFinished() {
    const psList = [...this.players.values()];
    if (psList.length === 0) return false;
    return psList.every((p) => p.status === "finished" || p.status === "disconnected");
  }

  serializeState() {
    return {
      mapId: this.mapId,
      revision: this.mapRevision,
      status: this.status,
      owner: this.owner,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        username: p.username,
        displayName: p.displayName,
        x: p.x,
        y: p.y,
        vx: p.vx,
        vy: p.vy,
        facing: p.facing,
        grounded: p.grounded,
        hp: p.hp,
        bombs: p.bombs,
        coins: p.coins,
        gems: p.gems,
        status: p.status,
      })),
    };
  }
}

function rateLimited(info) {
  if (!info || !Array.isArray(info.lastMsgTimes)) return false;
  const t = nowMs();
  info.lastMsgTimes = info.lastMsgTimes.filter((ts) => t - ts < MSG_RATE_WINDOW_MS);
  if (info.lastMsgTimes.length >= MSG_RATE_LIMIT) return true;
  info.lastMsgTimes.push(t);
  return false;
}

function validateInput(msg) {
  if (!msg || typeof msg !== "object") return false;
  if (typeof msg.seq !== "number" || !Number.isFinite(msg.seq) || msg.seq < 0 || msg.seq > 1e9) return false;
  if (typeof msg.left !== "boolean" || typeof msg.right !== "boolean") return false;
  if (typeof msg.jump !== "boolean" || typeof msg.bomb !== "boolean") return false;
  return true;
}

function uniqueRoomId() {
  let id = makeRoomId();
  while (rooms.has(id)) id = makeRoomId();
  return id;
}

function getSolids(mapId) {
  if (typeof mapId !== "string" || !/^[A-Z0-9]{3,12}$/.test(mapId)) return [];
  const cacheKey = mapId;
  if (mapSolidsCache.has(cacheKey)) return mapSolidsCache.get(cacheKey);
  const p = path.join(ROOT_DIR, "maps", mapId, "map.json");
  let solids = [];
  try {
    const data = JSON.parse(fs.readFileSync(p, "utf-8"));
    const tile = data.tileSize || 32;
    for (const b of data.blocks || []) {
      solids.push({ x: b.x, y: b.y, w: tile, h: tile });
    }
  } catch {
    solids = [];
  }
  mapSolidsCache.set(cacheKey, solids);
  return solids;
}

const mapSolidsCache = new Map();

function applyPlayerPhysics(player, solids, delta, input) {
  const axis = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const maxSpeed = 220;
  const acc = player.grounded ? 1500 : 900;
  const friction = player.grounded ? 1700 : 240;
  if (axis !== 0) {
    player.vx += axis * acc * delta;
    player.vx = Math.max(-maxSpeed, Math.min(maxSpeed, player.vx));
    player.facing = axis;
  } else {
    const amount = friction * delta;
    player.vx = Math.abs(player.vx) <= amount ? 0 : player.vx - Math.sign(player.vx) * amount;
  }
  // jump edge
  if (input.jump && player.grounded) {
    player.vy = -520;
    player.grounded = false;
  }
  input.jump = false;

  player.x += player.vx * delta;
  for (const s of solids) {
    if (player.x < s.x + s.w && player.x + 24 > s.x && player.y < s.y + s.h && player.y + 32 > s.y) {
      if (player.vx > 0) player.x = s.x - 24;
      else if (player.vx < 0) player.x = s.x + s.w;
      player.vx = 0;
    }
  }
  const maxX = solids.reduce((m, s) => Math.max(m, s.x + s.w), 960);
  player.x = Math.max(0, Math.min(maxX - 24, player.x));

  player.vy = Math.min(player.vy + 1450 * delta, 780);
  player.y += player.vy * delta;
  let grounded = false;
  for (const s of solids) {
    if (player.x < s.x + s.w && player.x + 24 > s.x && player.y + 32 >= s.y && player.y + 32 <= s.y + 8) {
      player.y = s.y - 32;
      player.vy = 0;
      grounded = true;
    }
  }
  player.grounded = grounded;
  if (player.y > 600) {
    player.status = "dead";
    player.hp = 0;
  }
}

function handleAuth(ws, msg, auth) {
  const payload = msg.payload && typeof msg.payload === "object" ? msg.payload : {};
  const token = payload.token;

  let username = sanitizeName(payload.username);
  let displayName = sanitizeName(payload.displayName);

  if (token != null && token !== "") {
    if (typeof token !== "string") {
      ws.send(JSON.stringify({ type: "error", payload: { code: "invalid_token" } }));
      return;
    }
    if (auth && typeof auth.session === "function") {
      const session = auth.session(token);
      if (!session) {
        ws.send(JSON.stringify({ type: "error", payload: { code: "invalid_token" } }));
        return;
      }
      username = session.username || username;
      displayName = session.displayName || displayName;
    } else if (token.length < 16) {
      ws.send(JSON.stringify({ type: "error", payload: { code: "invalid_token" } }));
      return;
    }
  }

  if (!username) username = `guest_${crypto.randomBytes(3).toString("hex")}`;
  if (!displayName) displayName = username;

  if (msg.type === "auth_create") {
    const roomId = uniqueRoomId();
    const room = new Room(roomId, ws, username, displayName);
    rooms.set(roomId, room);
    const clientId = room.owner;
    const player = room.players.get(clientId);
    ws.send(JSON.stringify({
      type: "auth_ok",
      payload: { roomId, clientId, player, room: room.serializeState() },
    }));
    return;
  }

  if (msg.type === "auth_join") {
    const roomId = payload.roomId;
    if (typeof roomId !== "string" || !/^[A-Z0-9]{4,12}$/.test(roomId)) {
      ws.send(JSON.stringify({ type: "error", payload: { code: "invalid_room_id" } }));
      return;
    }
    const room = rooms.get(roomId);
    if (!room) {
      ws.send(JSON.stringify({ type: "error", payload: { code: "room_not_found" } }));
      return;
    }
    const res = room.addPlayer(ws, username, displayName, false);
    if (!res.ok) {
      ws.send(JSON.stringify({ type: "error", payload: { code: res.code || "room_full" } }));
      return;
    }
    ws.send(JSON.stringify({
      type: "auth_ok",
      payload: { roomId, clientId: res.clientId, player: res.player, room: room.serializeState() },
    }));
    room.broadcastExcept(res.clientId, "player_joined", { player: res.player, count: room.players.size });
    return;
  }

  ws.send(JSON.stringify({ type: "error", payload: { code: "unknown_type" } }));
}

function handleClientMessage(ws, msg, auth) {
  const info = sockets.get(ws);
  if (!info) {
    ws.send(JSON.stringify({ type: "error", payload: { code: "not_authenticated" } }));
    return;
  }
  const room = rooms.get(info.roomId);
  if (!room) {
    ws.send(JSON.stringify({ type: "error", payload: { code: "room_not_found" } }));
    sockets.delete(ws);
    return;
  }
  const player = room.players.get(info.clientId);
  if (!player) return;

  switch (msg.type) {
    case "input": {
      const p = msg.payload && typeof msg.payload === "object" ? msg.payload : null;
      if (!validateInput(p)) {
        ws.send(JSON.stringify({ type: "error", payload: { code: "invalid_input" } }));
        return;
      }
      if (p.seq <= player.lastInputSeq) return;
      player.lastInputSeq = p.seq;
      player.input.left = p.left;
      player.input.right = p.right;
      if (p.jump) player.input.jump = true;
      player.input.bomb = p.bomb;
      player.facing = p.right ? 1 : p.left ? -1 : player.facing;
      room.sendTo(player.id, "input_ack", { seq: p.seq });
      break;
    }
    case "ready": {
      player.status = "ready";
      room.broadcast("player_state", { id: player.id, status: "ready" });
      break;
    }
    case "chat": {
      const text = typeof msg.payload?.text === "string" ? msg.payload.text.slice(0, 120) : "";
      room.broadcast("chat", { id: player.id, username: player.username, text });
      break;
    }
    case "finish": {
      player.status = "finished";
      player.finishedAt = nowMs();
      room.broadcast("player_state", { id: player.id, status: "finished" });
      break;
    }
    case "start_game": {
      if (info.clientId !== room.owner) {
        ws.send(JSON.stringify({ type: "error", payload: { code: "not_host" } }));
        return;
      }
      const startMapId = msg.payload?.mapId ?? room.mapId;
      const res = room.startGame(info.clientId, startMapId);
      if (!res.ok) {
        ws.send(JSON.stringify({ type: "error", payload: { code: res.code || "start_failed" } }));
        return;
      }
      return;
    }
    case "set_map": {
      if (info.clientId !== room.owner) {
        ws.send(JSON.stringify({ type: "error", payload: { code: "not_host" } }));
        return;
      }
      const mapId = msg.payload?.mapId;
      if (typeof mapId !== "string" || !/^[A-Z0-9]{3,12}$/.test(mapId)) {
        ws.send(JSON.stringify({ type: "error", payload: { code: "invalid_map" } }));
        return;
      }
      room.setMap(mapId);
      break;
    }
    default:
      ws.send(JSON.stringify({ type: "error", payload: { code: "unknown_type" } }));
  }
}

function handleDisconnect(ws) {
  const info = sockets.get(ws);
  if (info) {
    const room = rooms.get(info.roomId);
    if (room) {
      room.removePlayer(info.clientId);
      room.broadcast("player_left", { clientId: info.clientId, count: room.players.size });
      if (room.players.size === 0) {
        rooms.delete(room.id);
      }
    }
    sockets.delete(ws);
  }
}

function setupWss(server, auth) {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (ws) => {
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.on("message", (raw) => {
      try {
        if (raw.length > MAX_PAYLOAD_BYTES) {
          ws.send(JSON.stringify({ type: "error", payload: { code: "payload_too_large" } }));
          return;
        }
        const msg = JSON.parse(raw.toString("utf-8"));
        if (!msg || typeof msg !== "object" || typeof msg.type !== "string") {
          ws.send(JSON.stringify({ type: "error", payload: { code: "invalid_message" } }));
          return;
        }
        const info = sockets.get(ws);
        if (!info) {
          if (msg.type !== "auth_create" && msg.type !== "auth_join") {
            ws.send(JSON.stringify({ type: "error", payload: { code: "not_authenticated" } }));
            return;
          }
          const rateInfo = { lastMsgTimes: (ws._rateTimes = ws._rateTimes || []) };
          if (rateLimited(rateInfo)) {
            ws.send(JSON.stringify({ type: "error", payload: { code: "rate_limited" } }));
            return;
          }
          handleAuth(ws, msg, auth);
          return;
        }
        if (rateLimited(info)) {
          ws.send(JSON.stringify({ type: "error", payload: { code: "rate_limited" } }));
          return;
        }
        handleClientMessage(ws, msg, auth);
      } catch (e) {
        ws.send(JSON.stringify({ type: "error", payload: { code: "invalid_message" } }));
      }
    });

    ws.on("close", () => handleDisconnect(ws));
    ws.on("error", () => handleDisconnect(ws));
  });

  setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        handleDisconnect(ws);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, HEARTBEAT_INTERVAL_MS);

  // physics tick
  setInterval(() => {
    for (const room of rooms.values()) {
      if (room.status !== "playing") continue;
      const solids = getSolids(room.mapId);
      const delta = PHYSICS_TICK_MS / 1000;
      for (const [clientId, ps] of room.players) {
        if (ps.status !== "playing") continue;
        applyPlayerPhysics(ps, solids, delta, ps.input);
      }
      room.broadcast("state", room.serializeState());
      if (room.allFinished()) {
        room.status = "finished";
        room.broadcast("room_finished", { mapId: room.mapId });
      }
    }
  }, PHYSICS_TICK_MS);

  return wss;
}

export { setupWss, rooms, sockets };
