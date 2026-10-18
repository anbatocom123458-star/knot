// KNOT — MAP000001 gameplay (Stage 6). Vite + TypeScript migration kept the
// original canvas 960x540, physics, camera and BG01 parallax unchanged.
// Stage 6 adds: wall slide + wall jump, patrol enemies with stomp and
// i-frame damage, collectible items and thrown bombs. Pure logic lives in
// src/collision.ts, src/player-logic.ts, src/enemy.ts, src/item.ts,
// src/bomb.ts and src/combat.ts (unit-tested with vitest).

import { blockRect, detectWall, hitboxRect, overlap } from "./collision";
import { applyDamage, isPlayerVisible, MAX_HP, tickInvulnerable } from "./combat";
import {
  createEnemies,
  ENEMY_DEATH_DURATION,
  enemyRect,
  isStomp,
  killEnemy,
  STOMP_BOUNCE_VELOCITY,
  updateEnemies,
  type EnemyState
} from "./enemy";
import { collectItems, createItems, type ItemState } from "./item";
import {
  BOMB_SIZE,
  createBomb,
  explosionHitsRect,
  updateBombs,
  type ThrownBomb
} from "./bomb";
import { clampWallSlide, resolveJump } from "./player-logic";
import { initJoystick, getJoystickAxis, isJoystickActive, resetJoystick } from "./joystick";
import { MultiplayerClient, type RemotePlayer } from "./multiplayer-client";
import {
  probeEnvironment,
  applyWaterPhysics,
  applyLavaDamage,
  drawEnvironment,
  type EnvState,
} from "./environment";
import {
  createEquipments,
  pickupEquipment,
  activateEquipment,
  updateEquipments,
  isEquipmentActive,
  magnetPull,
  drawEquipments,
  resetEquipments,
  type EquipmentState,
} from "./equipment";
import {
  createWeather,
  updateWeather,
  drawWeather,
  windForce,
  type WeatherState,
} from "./weather";
import {
  initUI,
  renderLevelList,
  renderVictory,
  setErrorMessage,
  setLoadingMessage,
  showScreen,
  type ScreenName
} from "./ui";
import {
  initAudio,
  playSfx,
  setMusicEnabled,
  setSfxEnabled,
} from "./audio";
import type { MapManifest } from "./types";
import type {
  AssetRegistry,
  ControlName,
  Inventory,
  MapData,
  Player,
  Puff,
  Rect
} from "./types";

function requireElement<T>(value: T | null, message: string): T {
  if (value === null) throw new Error(message);
  return value;
}

const canvas = requireElement(document.querySelector<HTMLCanvasElement>("#game"), "Khong tim thay the canvas #game.");
const context = requireElement(canvas.getContext("2d", { alpha: false }), "Khong tao duoc bo ve 2d.");
const statusLabel = requireElement(document.querySelector("#status"), "Khong tim thay #status.");
const orientationOverlay = document.querySelector<HTMLElement>("#orientation-overlay");
const tileSize = 32;
const viewport = { width: canvas.width, height: canvas.height };
const EXPLOSION_PUFF_SCALE = 2.2;

const input = { left: false, right: false, jumpPressed: false, bombPressed: false };
const activeControlPointers = new Map<HTMLButtonElement, Set<number>>();
const keyControls = new Map<string, ControlName>([
  ["ArrowLeft", "left"],
  ["KeyA", "left"],
  ["ArrowRight", "right"],
  ["KeyD", "right"]
]);

let mapData!: MapData;
let manifest: MapManifest | null = null;
let currentMapId = "MAP000001";
let registry!: AssetRegistry;
let assets = new Map<string, HTMLImageElement>();
/** Solid tile rects; blocks never change at runtime, built once after load. */
let solids: Rect[] = [];
let cameraX = 0;
let cameraY = 0;
let previousTime = 0;
let gameTime = 0;
let won = false;
let player!: Player;
let puffs: Puff[] = [];
let enemies: EnemyState[] = [];
let items: ItemState[] = [];
let activeBombs: ThrownBomb[] = [];
let inventory: Inventory = { coins: 0, gems: 0, bombs: 0 };
let envState: EnvState = {
  inWater: false,
  water: null,
  inLava: false,
  lava: null,
  lavaDamageAccum: 0,
};
let weatherState: WeatherState = createWeather();
let equipments: EquipmentState[] = [];

/** Multiplayer client (tùy chọn, bật khi người chơi vào phòng đồng nghiệp). */
let mpClient: MultiplayerClient | null = null;
let mpEnabled = false;
let mpPlayers: RemotePlayer[] = [];
let mpSeq = 0;
let mpRoomId: string | null = null;
let mpIsHost = false;

/** Auth state (client-side). Token is held in memory + sessionStorage; the
 *  backend issues an HttpOnly session cookie, so API calls use credentials. */
let authUser: { id: string; username: string; displayName: string } | null = null;
const API_BASE = (import.meta.env.VITE_API_BASE ?? "/api").replace(/\/+$/, "");

async function apiRequest(path: string, method = "GET", body?: unknown): Promise<Response> {
  const headers: Record<string, string> = {};
  let initBody: string | undefined;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    initBody = JSON.stringify(body);
  }
  return fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: initBody,
    credentials: "include",
  });
}

async function loadSession(): Promise<boolean> {
  const res = await apiRequest("/auth/session");
  if (!res.ok) return false;
  const data = await res.json();
  if (data.ok && data.user) {
    authUser = data.user;
    return true;
  }
  return false;
}

async function doLogin(username: string, password: string): Promise<{ ok: boolean; error?: string; user?: typeof authUser }> {
  const res = await apiRequest("/auth/login", "POST", { username, password });
  const data = await res.json();
  if (data.ok && data.user) {
    authUser = data.user;
    try { sessionStorage.setItem("knot_user", JSON.stringify(authUser)); } catch { /* ignore */ }
    return { ok: true, user: authUser };
  }
  return { ok: false, error: data.error ?? "Đăng nhập thất bại." };
}

async function doRegister(username: string, password: string, displayName?: string): Promise<{ ok: boolean; error?: string }> {
  const res = await apiRequest("/auth/register", "POST", { username, password, displayName });
  const data = await res.json();
  return { ok: data.ok, error: data.error };
}

async function doLogout(): Promise<void> {
  try { await apiRequest("/auth/logout", "POST"); } catch { /* ignore */ }
  authUser = null;
  try { sessionStorage.removeItem("knot_user"); } catch { /* ignore */ }
}

function sfxFor(kind: "jump" | "coin" | "gem" | "bomb" | "stomp" | "hurt" | "die" | "victory") {
  const assetIdMap: Record<string, string> = {
    jump: "AUD_JUMP",
    coin: "AUD_COIN",
    gem: "AUD_GEM",
    bomb: "AUD_THROW",
    stomp: "AUD_DISAPPEAR",
    hurt: "AUD_HURT",
    die: "AUD_DISAPPEAR",
    victory: "AUD_MAGIC",
  };
  const aid = assetIdMap[kind];
  const entry = registry.assets.find((a) => a.id === aid);
  if (entry) playSfx(entry.path);
}

/**
 * Stage 7 screen/game mode. `update()` only ever runs in "playing" — pause,
 * menus, victory and game over freeze gameplay state completely (bombs, enemy
 * patrols, player physics), not just the visuals.
 */
type GameMode = "menu" | "levelselect" | "loading" | "error" | "playing" | "paused" | "victory" | "gameover" | "settings" | "account" | "login" | "register" | "multiplayer";
let mode: GameMode = "menu";

context.imageSmoothingEnabled = false;

function assetPath(assetId: string) {
  const asset = registry.assets.find((entry) => entry.id === assetId);
  if (!asset) throw new Error(`Asset ID khong ton tai: ${assetId}`);
  return asset.path;
}

function loadImage(path: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Khong tai duoc asset: ${path}`));
    image.src = path;
  });
}

async function loadAssets() {
  const paths = new Set<string>();
  for (const entry of registry.assets) {
    // Âm thanh được tải lazy trong playSfx; không load làm hình ảnh.
    if (entry.category === "audio") continue;
    paths.add(entry.path);
    for (const framePath of entry.frameFiles ?? []) paths.add(framePath);
  }
  const loaded: [string, HTMLImageElement][] = [];
  for (const path of paths) {
    try {
      loaded.push([path, await loadImage(path)]);
    } catch {
      // Bỏ qua asset không tải được (ví dụ equipment placeholder chưa có file thật);
      // các module vẽ sẽ dùng fallback màu thay vì ảnh.
    }
  }
  assets = new Map(loaded);
}

function imageFor(assetId: string) {
  const image = assets.get(assetPath(assetId));
  if (!image) throw new Error(`Asset chua duoc tai: ${assetId}`);
  return image;
}

function resetWorldShell() {
  mapData = {
    id: "BOOT",
    name: "Khởi động",
    version: 1,
    tileSize: 32,
    dimensions: { width: 960, height: 576 },
    backgroundAssetId: "BG01",
    spawn: { x: 64, y: 416 },
    blocks: [],
    hazards: [],
    exit: { instanceId: "boot_exit", assetId: "IT01", x: -1000, y: -1000, hitbox: { offsetX: 0, offsetY: 0, width: 1, height: 1 } }
  };
  solids = [];
  resetWorld("Đang khởi động…");
}

function resetWorld(message = "Sẵn sàng") {
  player = {
    x: mapData.spawn.x,
    y: mapData.spawn.y,
    width: 24,
    height: 32,
    velocityX: 0,
    velocityY: 0,
    grounded: false,
    jumpsUsed: 0,
    facing: 1,
    walkTime: 0,
    doubleJumping: false,
    wallDir: 0,
    wallJumpLock: 0,
    hp: MAX_HP,
    invulnerable: 0
  };
  enemies = createEnemies(mapData.enemies);
  items = createItems(mapData.items);
  activeBombs = [];
  inventory = { coins: 0, gems: 0, bombs: 0 };
  puffs = [];
  won = false;
  envState = {
    inWater: false,
    water: null,
    inLava: false,
    lava: null,
    lavaDamageAccum: 0,
  };
  resetEquipments(equipments);
  // Clear pending edge presses so a reset cannot fire a jump/bomb mid-hold.
  input.jumpPressed = false;
  input.bombPressed = false;
  statusLabel.textContent = message;
}

function respawn(message = "Thử lại nào") {
  resetWorld(message);
}

/** Drop every held/edge input so menus never leak presses into gameplay. */
function clearInput() {
  input.left = false;
  input.right = false;
  input.jumpPressed = false;
  input.bombPressed = false;
  resetJoystick();
  for (const [button, pointerIds] of activeControlPointers) {
    for (const pointerId of pointerIds) {
      try {
        if (button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
      } catch {
        // The browser may already have released this pointer.
      }
    }
    pointerIds.clear();
    button.classList.remove("is-pressed");
  }
}

/** Hiển thị/ẩn overlay "xoay màn hình" khi thiết bị di động nằm dọc. */
function updateOrientationOverlay(): void {
  const portraitMobile =
    window.matchMedia("(max-width: 760px) and (orientation: portrait)").matches;
  const shouldShow = portraitMobile && mode !== "menu";
  const isVisible = orientationOverlay?.classList.contains("visible") ?? false;
  if (shouldShow && !isVisible && orientationOverlay) {
    orientationOverlay.classList.add("visible");
    orientationOverlay.setAttribute("aria-hidden", "false");
    clearInput();
  } else if (!shouldShow && isVisible && orientationOverlay) {
    orientationOverlay.classList.remove("visible");
    orientationOverlay.setAttribute("aria-hidden", "true");
    clearInput();
  }
}

/** Trong khi overlay dọc hiển thị, đóng băng gameplay (không update vật lý). */
function orientationBlocked(): boolean {
  // Không chặn gameplay chỉ vì portrait; overlay chỉ là gợi ý không cản trở.
  return false;
}

/** Single place that changes mode + visible screen and clears stale input. */
function setMode(next: GameMode, screen: ScreenName | null) {
  mode = next;
  clearInput();
  showScreen(screen);
}


let mapLoadToken = 0;

function refreshMultiplayerLobby(): void {
  const codeEl = document.querySelector("#mp-room-code");
  const membersEl = document.querySelector("#mp-members");
  const statusEl = document.querySelector("#mp-status");
  if (codeEl) codeEl.textContent = `Mã phòng: ${mpRoomId ?? "—"}`;
  if (membersEl) {
    membersEl.textContent = "";
    const selfName = "Người chơi (bạn)";
    const li = document.createElement("li");
    li.textContent = `• ${selfName}`;
    membersEl.appendChild(li);
    for (const p of mpPlayers) {
      const item = document.createElement("li");
      item.textContent = `• ${p.displayName} (${p.status})`;
      membersEl.appendChild(item);
    }
  }
  if (statusEl) {
    statusEl.textContent = mpEnabled
      ? `Đã kết nối · ${mpPlayers.length + 1} người · ${mpIsHost ? "Host" : "Khách"}`
      : "Chưa kết nối.";
  }
}

function startMultiplayer(roomId: string | null, create: boolean): void {
  mpClient = new MultiplayerClient("Người chơi");
  mpClient.onJoinedRoom((rid, cid) => {
    mpEnabled = true;
    mpRoomId = rid;
    mpIsHost = create;
    statusLabel.textContent = `Đồng nghiệp: ${rid} (bạn ${cid.slice(0, 6)})`;
    refreshMultiplayerLobby();
  });
  mpClient.onState((players) => {
    mpPlayers = players;
    refreshMultiplayerLobby();
  });
  mpClient.onMapChanged((mapId) => {
    if (mapId) void startMapRun(mapId);
  });
  mpClient.onGameStarted((mapId) => {
    if (mapId) void startMapRun(mapId);
  });
  mpClient.onErrorMessage((message) => {
    statusLabel.textContent = message;
    const statusEl = document.querySelector("#mp-status");
    if (statusEl) statusEl.textContent = message;
    setTimeout(() => {
      if (statusLabel.textContent === message) statusLabel.textContent = "Sẵn sàng";
    }, 3000);
  });
  mpClient.connect(roomId, create);
}

function stopMultiplayer(): void {
  if (mpClient) {
    mpClient.disconnect();
    mpClient = null;
  }
  mpEnabled = false;
  mpPlayers = [];
  mpRoomId = null;
  mpIsHost = false;
  statusLabel.textContent = "Sẵn sàng";
  refreshMultiplayerLobby();
}

function manifestEntry(mapId: string) {
  return manifest?.maps.find((entry) => entry.id === mapId);
}

function isMapPlayable(mapId: string): boolean {
  return manifestEntry(mapId)?.status === "available";
}

function playableMapIds(): Set<string> {
  return new Set((manifest?.maps ?? []).filter((entry) => entry.status === "available").map((entry) => entry.id));
}

function nextMapId(mapId: string): string | null {
  if (!manifest) return null;
  const index = manifest.maps.findIndex((entry) => entry.id === mapId);
  if (index < 0 || index + 1 >= manifest.maps.length) return null;
  return manifest.maps[index + 1].id;
}

function refreshLevelList() {
  if (!manifest) return;
  renderLevelList(manifest, playableMapIds());
}

function mapUrl(mapId: string): string {
  return `maps/${mapId}/map.json`;
}

/** Load + validate a map file by ID. Never invent a map: unknown IDs and
 * schema violations surface to the error screen instead of starting a run. */
async function loadMapById(mapId: string): Promise<MapData> {
  const response = await fetch(mapUrl(mapId), { cache: "no-store" });
  if (!response.ok) throw new Error(`Không tải được ${mapId} (HTTP ${response.status}).`);
  const data = (await response.json()) as MapData;
  validateMapData(mapId, data);
  return data;
}

function validateMapData(mapId: string, data: MapData): void {
  if (!data || typeof data !== "object") throw new Error(`Dữ liệu ${mapId} không phải JSON object.`);
  if (data.id !== mapId) throw new Error(`ID map không khớp: file ghi "${String(data.id)}", cần "${mapId}".`);
  if (typeof data.tileSize !== "number" || data.tileSize <= 0) throw new Error(`${mapId}: tileSize không hợp lệ.`);
  if (!data.dimensions || typeof data.dimensions.width !== "number" || typeof data.dimensions.height !== "number") {
    throw new Error(`${mapId}: dimensions không hợp lệ.`);
  }
  if (!data.spawn || typeof data.spawn.x !== "number" || typeof data.spawn.y !== "number") {
    throw new Error(`${mapId}: spawn không hợp lệ.`);
  }
  if (!Array.isArray(data.blocks) || data.blocks.length === 0) throw new Error(`${mapId}: không có blocks.`);
  if (!Array.isArray(data.hazards)) throw new Error(`${mapId}: hazards không hợp lệ.`);
  if (!data.exit || !data.exit.hitbox) throw new Error(`${mapId}: exit không hợp lệ.`);
  const registryIds = new Set(registry.assets.map((entry) => entry.id));
  const unknown = new Set<string>();
  const idOf = (value: unknown): string | null =>
    typeof value === "object" && value !== null && "assetId" in value && typeof (value as { assetId: unknown }).assetId === "string"
      ? ((value as { assetId: string }).assetId)
      : null;
  const collect = (list: unknown[]) => {
    for (const item of list) {
      const assetId = idOf(item);
      if (assetId && !registryIds.has(assetId)) unknown.add(assetId);
    }
  };
  collect(data.blocks);
  collect(data.hazards);
  collect([data.exit]);
  collect(data.enemies ?? []);
  collect(data.items ?? []);
  collect(data.equipment ?? []);
  // Vùng môi trường không tham chiếu asset, chỉ kiểm tra giá trị hợp lệ.
  for (const zone of data.waterZones ?? []) {
    if (typeof zone.x !== "number" || typeof zone.y !== "number" || typeof zone.width !== "number" || typeof zone.height !== "number") {
      throw new Error(`${mapId}: water zone không hợp lệ.`);
    }
    if (typeof zone.moveFactor !== "number" || zone.moveFactor <= 0) {
      throw new Error(`${mapId}: water zone moveFactor không hợp lệ.`);
    }
    if (typeof zone.gravityFactor !== "number" || zone.gravityFactor <= 0) {
      throw new Error(`${mapId}: water zone gravityFactor không hợp lệ.`);
    }
  }
  for (const zone of data.lavaZones ?? []) {
    if (typeof zone.x !== "number" || typeof zone.y !== "number" || typeof zone.width !== "number" || typeof zone.height !== "number") {
      throw new Error(`${mapId}: lava zone không hợp lệ.`);
    }
    if (typeof zone.damagePerSecond !== "number" || zone.damagePerSecond <= 0) {
      throw new Error(`${mapId}: lava zone damagePerSecond không hợp lệ.`);
    }
  }
  if (data.weather) {
    const w = data.weather;
    if (!["sunny", "rain", "wind", "storm"].includes(w.type)) {
      throw new Error(`${mapId}: weather type không hợp lệ: ${w.type}.`);
    }
    if (typeof w.windX !== "number" || w.windX < -1 || w.windX > 1) {
      throw new Error(`${mapId}: weather windX phải trong [-1, 1].`);
    }
    if (typeof w.particleDensity !== "number" || w.particleDensity < 0 || w.particleDensity > 1) {
      throw new Error(`${mapId}: weather particleDensity phải trong [0, 1].`);
    }
  }
  if (unknown.size > 0) throw new Error(`${mapId}: asset không có trong registry: ${[...unknown].join(", ")}.`);
}

/** Full run startup: loading screen → fetch + validate map → rebuild world. */
async function startMapRun(mapId: string): Promise<void> {
  const runToken = ++mapLoadToken;
  setMode("loading", "loading");
  setLoadingMessage(`Đang tải ${mapId}…`);
  statusLabel.textContent = `Đang tải ${mapId}…`;
  try {
    if (!isMapPlayable(mapId)) throw new Error(`${mapId} chưa được thiết kế thủ công — chưa thể chơi.`);
    const data = await loadMapById(mapId);
    if (runToken !== mapLoadToken) return; // a newer run already started
    currentMapId = data.id;
    mapData = data;
    solids = mapData.blocks.map((block) => blockRect(block, tileSize));
    weatherState = createWeather(data.weather);
    equipments = createEquipments(mapData.equipment);
    resetWorld(`Sẵn sàng · ${currentMapId}`);
    document.title = `KNOT | ${currentMapId}`;
    setMode("playing", null);
  } catch (error) {
    if (runToken !== mapLoadToken) return;
    const message = error instanceof Error ? error.message : "Lỗi không rõ khi tải map.";
    setErrorMessage(message);
    statusLabel.textContent = message;
    console.error(error);
    setMode("error", "error");
  }
}

function spawnPuff(
  x = player.x + player.width / 2 - 20,
  y = player.y + player.height - 24,
  size = 1
) {
  puffs.push({ x, y, elapsed: 0, size });
}

function updatePlayer(delta: number) {
  player.wallJumpLock = Math.max(0, player.wallJumpLock - delta);
  player.invulnerable = tickInvulnerable(player.invulnerable, delta);

  // Jump press: grounded jump > wall jump > remaining mid-air jump.
  // Wall contact comes from the previous frame's probe (set below).
  if (input.jumpPressed && !won) {
    input.jumpPressed = false;
    const outcome = resolveJump({
      jumpRequested: true,
      grounded: player.grounded,
      jumpsUsed: player.jumpsUsed,
      wallDir: player.wallDir,
      wallJumpLock: player.wallJumpLock
    });
    if (outcome) {
      player.velocityY = outcome.velocityY;
      if (isEquipmentActive(equipments, "high_jump_boots")) {
        player.velocityY *= 1.25; // nhảy cao hơn 25%
      }
      if (outcome.velocityX !== undefined) player.velocityX = outcome.velocityX;
      player.jumpsUsed = outcome.jumpsUsed;
      player.doubleJumping = outcome.doubleJumping;
      if (outcome.wallJumpLock !== undefined) {
        player.wallJumpLock = outcome.wallJumpLock;
        spawnPuff(); // wall-jump feedback reuses the landing puff
      }
      if (outcome.puff) spawnPuff();
      player.grounded = false;
      sfxFor("jump");
    }
  }

  const axis = isJoystickActive()
    ? getJoystickAxis()
    : Number(input.right) - Number(input.left);
  const maximumSpeed = 220;
  const acceleration = player.grounded ? 1500 : 900;
  const friction = player.grounded ? 1700 : 240;
  // Lực gió từ thời tiết (áp dụng lên trục ngang, px/s²).
  const windAccel = windForce(weatherState);

  if (axis !== 0) {
    player.velocityX += axis * acceleration * delta;
    player.facing = axis;
    player.walkTime += delta;
  } else {
    const amount = friction * delta;
    player.velocityX = Math.abs(player.velocityX) <= amount ? 0 : player.velocityX - Math.sign(player.velocityX) * amount;
  }
  // Áp dụng lực gió từ thời tiết.
  player.velocityX += windAccel * delta;
  player.velocityX = Math.max(-maximumSpeed, Math.min(maximumSpeed, player.velocityX));

  const previousX = player.x;
  player.x += player.velocityX * delta;
  for (const solid of solids) {
    if (!overlap(player, solid)) continue;
    if (player.velocityX > 0 && previousX + player.width <= solid.x + 1) player.x = solid.x - player.width;
    else if (player.velocityX < 0 && previousX >= solid.x + solid.width - 1) player.x = solid.x + solid.width;
    player.velocityX = 0;
  }
  player.x = Math.max(0, Math.min(mapData.dimensions.width - player.width, player.x));

  // Wall probe drives both the wall jump (next frame) and the slide clamp.
  player.wallDir = player.wallJumpLock > 0
    ? 0
    : detectWall(player.x, player.y, player.width, player.height, solids);

  const previousY = player.y;
  const previousBottom = previousY + player.height;
  let gravityScale = envState.inWater ? envState.water!.gravityFactor : 1;
  if (isEquipmentActive(equipments, "flying_boots")) {
    // Bay: trung lực gần như không, người chơi điều khiển trực tiếp qua joystick/nút.
    gravityScale = 0.05;
  }
  player.velocityY = Math.min(player.velocityY + 1450 * delta * gravityScale, 780);
  player.velocityY = clampWallSlide(player.velocityY, {
    grounded: player.grounded,
    wallDir: player.wallDir,
    axis,
    wallJumpLock: player.wallJumpLock
  });
  player.y += player.velocityY * delta;
  player.grounded = false;

  if (player.velocityY >= 0) {
    let landingY = Infinity;
    for (const solid of solids) {
      const horizontalOverlap = player.x < solid.x + solid.width && player.x + player.width > solid.x;
      const crossedTop = previousBottom <= solid.y + 2 && player.y + player.height >= solid.y;
      if (horizontalOverlap && crossedTop && solid.y < landingY) landingY = solid.y;
    }
    if (landingY !== Infinity) {
      player.y = landingY - player.height;
      player.velocityY = 0;
      player.grounded = true;
      player.jumpsUsed = 0;
      player.doubleJumping = false;
    }
  } else {
    for (const solid of solids) {
      const horizontalOverlap = player.x < solid.x + solid.width && player.x + player.width > solid.x;
      const underside = solid.y + solid.height;
      if (horizontalOverlap && previousY >= underside - 1 && player.y < underside) {
        player.y = underside;
        player.velocityY = 0;
      }
    }
  }

  if (player.y > mapData.dimensions.height + 40) {
    respawn();
    return;
  }

  if (mapData.hazards.some((hazard) => overlap(player, hitboxRect(hazard.x, hazard.y, hazard.hitbox)))) {
    respawn();
    return;
  }

  // Môi trường: va chạm với vùng nước và dung nham.
  envState = probeEnvironment(
    player,
    mapData.waterZones ?? [],
    mapData.lavaZones ?? [],
    envState
  );
  // Áp dụng vật lý nước vào vận tốc rơi.
  if (envState.inWater) {
    const waterPhys = applyWaterPhysics(player.velocityY, envState, delta);
    player.velocityY = waterPhys.velocityY;
  }
  // Sát thương dung nham (tích lũy theo thời gian, không spamming mỗi frame).
  if (envState.inLava) {
    const { hits, nextAccum } = applyLavaDamage(envState, delta, 1);
    envState.lavaDamageAccum = nextAccum;
    if (hits > 0 && player.invulnerable <= 0) {
      // Shield chặn sát thương dung nham.
      const shieldEq = equipments.find((e) => e.kind === "shield");
      if (shieldEq && shieldEq.charges > 0) {
        shieldEq.charges = 0;
        shieldEq.activeTime = 0;
        envState.lavaDamageAccum = 0;
      } else {
        const hit = applyDamage(
          player.hp,
          player.invulnerable,
          player.x + player.width / 2,
          player.x + player.width / 2,
          player.facing
        );
        if (hit.applied) {
          player.hp = hit.hp;
          player.invulnerable = hit.invulnerable;
          if (hit.velocityX !== undefined) player.velocityX = hit.velocityX;
          if (hit.velocityY !== undefined) player.velocityY = hit.velocityY;
          if (hit.died) {
            statusLabel.textContent = "Bạn đã ngã!";
            sfxFor("die");
            setMode("gameover", "gameover");
            return;
          }
          statusLabel.textContent = "Bị trúng đốt!";
          sfxFor("hurt");
        }
      }
    }
  }

  // Enemy contact: stomp first, otherwise one i-frame-protected hit.
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const enemyHitbox = enemyRect(enemy);
    if (!overlap(player, enemyHitbox)) continue;
    if (isStomp(previousBottom, player.y + player.height, enemyHitbox, player.velocityY)) {
      killEnemy(enemy);
      player.velocityY = STOMP_BOUNCE_VELOCITY;
      player.jumpsUsed = 1; // one air jump remains after the bounce
      player.doubleJumping = false;
      spawnPuff();
      statusLabel.textContent = "Trúng đích!";
      sfxFor("stomp");
      break;
    }
    const hit = applyDamage(
      player.hp,
      player.invulnerable,
      player.x + player.width / 2,
      enemyHitbox.x + enemyHitbox.width / 2,
      player.facing
    );
    if (!hit.applied) continue; // i-frames: another enemy could still be stomped
    // Shield chặn 1 lần sát thương.
    if (isEquipmentActive(equipments, "shield")) {
      const eq = equipments.find((e) => e.kind === "shield");
      if (eq && eq.charges > 0) {
        eq.charges = 0;
        eq.activeTime = 0;
        statusLabel.textContent = "Khiên chặn đòn!";
        sfxFor("stomp");
        continue; // bỏ qua sát thương này
      }
    }
    player.hp = hit.hp;
    player.invulnerable = hit.invulnerable;
    if (hit.velocityX !== undefined) player.velocityX = hit.velocityX;
    if (hit.velocityY !== undefined) player.velocityY = hit.velocityY;
    if (hit.died) {
      // Stage 7: death opens the Game Over screen instead of silent respawn.
      statusLabel.textContent = "Bạn đã ngã!";
      sfxFor("die");
      setMode("gameover", "gameover");
      return;
    }
    statusLabel.textContent = "Bị trúng đòn!";
    sfxFor("hurt");
    break;
  }

  // Item pickups.
  for (const item of collectItems(items, player)) {
    if (item.kind === "coin") {
      inventory.coins += 1;
      statusLabel.textContent = `Đồng xu ×${inventory.coins}`;
      sfxFor("coin");
    } else if (item.kind === "gem") {
      inventory.gems += 1;
      spawnPuff();
      statusLabel.textContent = `Ngọc ×${inventory.gems}`;
      sfxFor("gem");
    } else {
      inventory.bombs += 1;
      spawnPuff();
      statusLabel.textContent = `Có ${inventory.bombs} bom — bấm B / nút BOMB`;
      sfxFor("bomb");
    }
  }

  // Equipment pickups.
  const pickedEq = pickupEquipment(equipments, player);
  if (pickedEq) {
    activateEquipment(pickedEq);
    if (pickedEq.kind === "bomb") {
      inventory.bombs += 1;
      statusLabel.textContent = "Nhặt được bom!";
      sfxFor("bomb");
    } else if (pickedEq.kind === "healing") {
      player.hp = Math.min(MAX_HP, player.hp + 1);
      statusLabel.textContent = "Hồi máu!";
      sfxFor("gem");
    } else {
      statusLabel.textContent = `Nhặt ${pickedEq.kind.replace("_", " ")}`;
      sfxFor("gem");
    }
    spawnPuff();
  }

  if (overlap(player, hitboxRect(mapData.exit.x, mapData.exit.y, mapData.exit.hitbox))) {
    won = true;
    input.left = false;
    input.right = false;
    sfxFor("victory");
    const next = nextMapId(currentMapId);
    renderVictory(currentMapId, next, next !== null && isMapPlayable(next));
    statusLabel.textContent = `Đã đến cổng ${currentMapId}!`;
  }
}

function throwBombIfRequested() {
  if (!input.bombPressed) return;
  input.bombPressed = false;
  if (inventory.bombs <= 0) {
    statusLabel.textContent = "Chưa có bom — hãy nhặt bom trong map";
    return;
  }
  inventory.bombs -= 1;
  activeBombs.push(createBomb(player.x, player.y + player.height - BOMB_SIZE, player.facing));
  spawnPuff();
  statusLabel.textContent = `Còn ${inventory.bombs} bom`;
}

function update(delta: number) {
  // Gửi điều khiển lên server multiplayer trước khi tiêu thụ các edge input.
  if (mpClient && mpEnabled && mode === "playing") {
    mpSeq = (mpSeq + 1) % 100000;
    mpClient.sendInput(input.left, input.right, input.jumpPressed, input.bombPressed, mpSeq);
  }
  throwBombIfRequested();
  updatePlayer(delta);
  if (mode !== "playing") return; // pause/game over requested mid-update
  updateEnemies(enemies, solids, delta);
  updateEquipments(equipments, delta);
  // Magnet hút coin khi active.
  magnetPull(equipments, items, player, delta);
  const result = updateBombs(activeBombs, solids, delta);
  activeBombs = result.bombs;
  for (const explosion of result.explosions) {
    spawnPuff(
      explosion.x - 20 * EXPLOSION_PUFF_SCALE,
      explosion.y - 18 * EXPLOSION_PUFF_SCALE,
      EXPLOSION_PUFF_SCALE
    );
    let destroyed = 0;
    for (const enemy of enemies) {
      if (enemy.alive && explosionHitsRect(explosion, enemyRect(enemy))) {
        killEnemy(enemy);
        destroyed += 1;
      }
    }
    statusLabel.textContent = destroyed > 0
      ? `Bùm! Tiêu diệt ${destroyed} quái!`
      : "Bùm!";
  }

}

function drawBackground() {
  // Lớp trời cơ bản (không parallax) tạo nền einheit cho pixel-art.
  context.fillStyle = "#87ceeb";
  context.fillRect(0, 0, viewport.width, viewport.height);
  try {
    const sky = imageFor("BG02");
    const sHeight = viewport.height;
    const sWidth = (sky.width / sky.height) * sHeight;
    const skyX = -((cameraX * 0.05) % sWidth);
    for (let x = skyX - sWidth; x < viewport.width; x += sWidth) {
      context.drawImage(sky, Math.round(x), 0, Math.round(sWidth), sHeight);
    }
  } catch {
    // Nếu BG02 chưa tải, nền màu #87ceeb vẫn giữ được.
  }
  // Lớp đồi BG01 với parallax nhẹ.
  const image = imageFor(mapData.backgroundAssetId);
  const width = image.width * 2;
  const height = image.height * 2;
  const offset = -((cameraX * 0.18) % width);
  for (let x = offset - width; x < viewport.width; x += width) {
    context.drawImage(image, x, viewport.height - height, width, height);
  }
}

function drawMap() {
  for (const block of mapData.blocks) {
    context.drawImage(imageFor(block.assetId), Math.round(block.x - cameraX), Math.round(block.y - cameraY), tileSize, tileSize);
    // Viền viền nhẹ cho platform tạo cảm giác pixel-art chắc chắn.
    context.save();
    context.strokeStyle = "rgba(32 59 54 / 40%)";
    context.lineWidth = 2;
    context.strokeRect(Math.round(block.x - cameraX), Math.round(block.y - cameraY), tileSize, tileSize);
    context.restore();
  }

  for (const hazard of mapData.hazards) {
    context.drawImage(imageFor(hazard.assetId), Math.round(hazard.x - cameraX), Math.round(hazard.y - cameraY), tileSize, tileSize);
  }

  context.drawImage(imageFor(mapData.exit.assetId), Math.round(mapData.exit.x - cameraX), Math.round(mapData.exit.y - cameraY), tileSize, tileSize);
}

function drawItems() {
  for (const item of items) {
    if (item.collected) continue;
    const bob = Math.sin(gameTime * 3 + item.x * 0.05) * 3;
    context.drawImage(
      imageFor(item.assetId),
      Math.round(item.x - cameraX),
      Math.round(item.y + bob - cameraY),
      item.width,
      item.height
    );
  }
}

function drawEnemies() {
  for (const enemy of enemies) {
    const drawX = Math.round(enemy.x - cameraX);
    if (!enemy.alive) {
      if (enemy.deathElapsed >= ENEMY_DEATH_DURATION) continue;
      context.save();
      context.globalAlpha = Math.max(0, 1 - enemy.deathElapsed / ENEMY_DEATH_DURATION);
      context.drawImage(imageFor("EN03"), drawX, Math.round(enemy.y - cameraY), enemy.width, enemy.height);
      context.restore();
      continue;
    }
    const frameId = Math.floor(enemy.walkTime / 0.18) % 2 === 0 ? "EN01" : "EN02";
    const image = imageFor(frameId);
    if (enemy.direction < 0) {
      context.save();
      context.translate(drawX + enemy.width, 0);
      context.scale(-1, 1);
      context.drawImage(image, 0, Math.round(enemy.y - cameraY), enemy.width, enemy.height);
      context.restore();
    } else {
      context.drawImage(image, drawX, Math.round(enemy.y - cameraY), enemy.width, enemy.height);
    }
  }
}

function drawBombs() {
  for (const bomb of activeBombs) {
    context.drawImage(
      imageFor("IT05"),
      Math.round(bomb.x - cameraX),
      Math.round(bomb.y - cameraY),
      bomb.width,
      bomb.height
    );
  }
}

function currentCharacterFrame() {
  if (!player.grounded) return assets.get(assetPath("AN03"));
  if (Math.abs(player.velocityX) < 8) return assets.get(assetPath("AN01"));
  const walk = registry.assets.find((entry) => entry.id === "AN02");
  if (!walk?.frameFiles) throw new Error("Asset ID khong ton tai: AN02");
  const index = Math.floor(player.walkTime / 0.16) % walk.frameFiles.length;
  return assets.get(walk.frameFiles[index]);
}

function drawPlayer() {
  if (!isPlayerVisible(player.invulnerable)) return; // blink during i-frames
  const image = currentCharacterFrame();
  if (!image) throw new Error("Khong ve duoc nhan vat: frame khong ton tai.");
  const drawX = player.x + player.width / 2 - 32 - cameraX;
  const drawY = player.y + player.height - 64 - cameraY;
  context.save();
  if (player.facing < 0) {
    context.translate(Math.round(drawX + 64), 0);
    context.scale(-1, 1);
    context.drawImage(image, 0, Math.round(drawY), 64, 64);
  } else {
    context.drawImage(image, Math.round(drawX), Math.round(drawY), 64, 64);
  }
  context.restore();
}

function drawEffects(delta: number) {
  const effect = registry.assets.find((entry) => entry.id === "FX01");
  const frameDuration = 0.045;
  if (!effect?.frameFiles) return;
  const frames = effect.frameFiles;
  puffs = puffs.filter((puff) => puff.elapsed < frameDuration * frames.length);
  for (const puff of puffs) {
    puff.elapsed += delta;
    const frame = Math.min(frames.length - 1, Math.floor(puff.elapsed / frameDuration));
    const image = assets.get(frames[frame]);
    if (!image) continue;
    context.drawImage(
      image,
      Math.round(puff.x - cameraX),
      Math.round(puff.y - cameraY),
      Math.round(40 * puff.size),
      Math.round(36 * puff.size)
    );
  }
}

function drawHeart(x: number, y: number, size = 6, filled: boolean): void {
  // Pixel-heart mẫu 5x7, vẽ bằng các ô vuông nhỏ (không dùng emoji).
  const pattern = [
    "0110110",
    "1111111",
    "1111111",
    "0111110",
    "0011100",
    "0001000",
  ];
  context.save();
  context.fillStyle = filled ? "#df6349" : "rgb(32 59 54 / 30%)";
  for (let ry = 0; ry < pattern.length; ry++) {
    const row = pattern[ry];
    for (let cx = 0; cx < row.length; cx++) {
      if (row[cx] === "1") {
        context.fillRect(x + cx * size, y + ry * size, size - 1, size - 1);
      }
    }
  }
  context.restore();
}

function drawHud() {
  const y = 34;
  context.save();
  context.font = "700 15px Trebuchet MS, sans-serif";
  context.textBaseline = "alphabetic";
  context.lineWidth = 3;
  context.lineJoin = "round";
  context.strokeStyle = "rgb(250 252 247 / 85%)";

  context.textAlign = "left";
  context.strokeStyle = "rgb(250 252 247 / 85%)";
  context.fillText("HP", 14, y);
  context.strokeText("HP", 14, y);
  let heartX = 52;
  for (let i = 0; i < MAX_HP; i++) {
    const filled = i < player.hp;
    drawHeart(heartX, y - 16, 5, filled);
    heartX += 36;
  }

  // Số lượng bom nằm ngay dưới máu (bên trái trên cùng).
  const bombY = y + 22;
  context.fillStyle = "#203b36";
  const bombText = `BOM ×${inventory.bombs} [B]`;
  context.strokeText(bombText, 14, bombY);
  context.fillText(bombText, 14, bombY);

  context.textAlign = "right";
  const pickupText = `COIN ×${inventory.coins}   GEM ×${inventory.gems}`;
  context.strokeText(pickupText, viewport.width - 14, y);
  context.fillText(pickupText, viewport.width - 14, y);
  context.restore();
}

function drawRemotePlayers() {
  if (!mpEnabled) return;
  for (const p of mpPlayers) {
    if (p.status === "disconnected") continue;
    context.save();
    context.fillStyle = p.facing < 0 ? "#c94e37" : "#2f534b";
    context.fillRect(Math.round(p.x - cameraX), Math.round(p.y - cameraY), 24, 32);
    context.strokeStyle = "#ffffff";
    context.lineWidth = 2;
    context.strokeRect(Math.round(p.x - cameraX), Math.round(p.y - cameraY), 24, 32);
    context.fillStyle = "#000000";
    context.fillText(p.displayName, Math.round(p.x - cameraX + 2), Math.round(p.y - cameraY) - 5);
    context.restore();
  }
}

function render(delta: number) {
  const playerCenterX = player.x + player.width / 2;
  const playerCenterY = player.y + player.height / 2;
  if (mapData.dimensions.width >= viewport.width) {
    cameraX = Math.max(0, Math.min(mapData.dimensions.width - viewport.width, playerCenterX - viewport.width / 2));
  } else {
    cameraX = (mapData.dimensions.width - viewport.width) / 2;
  }
  if (mapData.dimensions.height >= viewport.height) {
    cameraY = Math.max(0, Math.min(mapData.dimensions.height - viewport.height, playerCenterY - viewport.height / 2));
  } else {
    cameraY = (mapData.dimensions.height - viewport.height) / 2;
  }
  drawBackground();
  drawMap();
  drawItems();
  drawEnemies();
  drawBombs();
  drawEffects(delta);
  drawEnvironment(context, cameraX, cameraY, mapData.waterZones ?? [], mapData.lavaZones ?? []);
  drawEquipments(context, cameraX, cameraY, equipments);
  drawPlayer();
  drawRemotePlayers();
  drawHud();
  drawWeather(context, weatherState, cameraX, viewport.width, viewport.height);
  // Victory text moved to the DOM screen layer (Stage 7); no canvas overlay.
}

function frame(time: number) {
  const delta = Math.min((time - previousTime) / 1000 || 0, 1 / 30);
  previousTime = time;
  updateOrientationOverlay();
  if (mode === "playing" && !orientationBlocked()) {
    gameTime += delta;
    update(delta);
    updateWeather(weatherState, delta, viewport.width, viewport.height);
    if (mode === "playing" && won) setMode("victory", "victory");
  }
  render(mode === "playing" ? delta : 0);
  requestAnimationFrame(frame);
}

function setControl(control: ControlName, pressed: boolean) {
  if (mode !== "playing") return; // menus/pause must never receive gameplay input
  if (control === "jump") {
    if (pressed) input.jumpPressed = true;
    return;
  }
  if (control === "bomb") {
    if (pressed) input.bombPressed = true;
    return;
  }
  input[control] = pressed;
}

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-control]")) {
  const control = button.dataset.control;
  if (control !== "left" && control !== "right" && control !== "jump" && control !== "bomb") continue;
  const pointerIds = new Set<number>();
  activeControlPointers.set(button, pointerIds);
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (pointerIds.has(event.pointerId)) return;
    pointerIds.add(event.pointerId);
    try {
      button.setPointerCapture(event.pointerId);
    } catch {
      // Một số trình duyệt đầu điều khiển không cho phép bắt pointer chưa qua over;
      // điều khiển vẫn được kích hoạt qua pressed state bên dưới.
    }
    button.classList.add("is-pressed");
    setControl(control, true);
  });
  const release = (event: PointerEvent) => {
    if (!pointerIds.delete(event.pointerId)) return;
    if (pointerIds.size === 0) {
      button.classList.remove("is-pressed");
      if (control === "left" || control === "right") setControl(control, false);
    }
  };
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
  window.addEventListener("pointerup", release, true);
  window.addEventListener("pointercancel", release, true);
}

// Joystick ảo cho di chuyển cảm ứng (phân tích trục ngang → trái/phải).
// Bàn phím giữ nguyên để điều khiển trên PC; joystick được ưu tiên khi đang active.
const joystickEl = document.querySelector<HTMLElement>("#joystick");
if (joystickEl) {
  initJoystick(joystickEl, {
    onAxisChange: (axis) => {
      input.left = axis < -0.15;
      input.right = axis > 0.15;
    }
  });
}

window.addEventListener("keydown", (event) => {
  const action = keyControls.get(event.code);
  if (action) {
    event.preventDefault();
    setControl(action, true);
  } else if (event.code === "Space") {
    event.preventDefault();
    if (!event.repeat) setControl("jump", true);
  } else if (event.code === "KeyB") {
    event.preventDefault();
    if (!event.repeat) setControl("bomb", true);
  }
});

window.addEventListener("keyup", (event) => {
  const control = keyControls.get(event.code);
  if (control) setControl(control, false);
});

window.addEventListener("blur", () => {
  clearInput();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") clearInput();
});
window.addEventListener("resize", () => {
  clearInput();
  updateOrientationOverlay();
});
window.addEventListener("orientationchange", () => {
  clearInput();
  updateOrientationOverlay();
});

document.querySelector("#reset")?.addEventListener("click", () => void startMapRun(currentMapId));
document.querySelector("#pause")?.addEventListener("click", () => {
  if (mode === "playing") setMode("paused", "pause");
});

// Stage 7 + Part 10 menu wiring: every button maps to a real transition.
// Auth/screens are gated behind real backend calls — no fake success.
initUI({
  play: () => void startMapRun(currentMapId),
  levelselect: () => setMode("levelselect", "level-select"),
  "back-main": () => {
    stopMultiplayer();
    setMode("menu", "main-menu");
  },
  pause: () => {
    if (mode === "playing") setMode("paused", "pause");
  },
  resume: () => {
    if (mode === "paused") setMode("playing", null);
  },
  restart: () => void startMapRun(currentMapId),
  mainmenu: () => {
    stopMultiplayer();
    setMode("menu", "main-menu");
  },
  retry: () => void startMapRun(currentMapId),
  "play-next": () => {
    const next = nextMapId(currentMapId);
    if (next) void startMapRun(next);
  },
  "select-map": (mapId) => {
    if (mapId) void startMapRun(mapId);
  },
  settings: () => setMode("settings", "settings"),
  account: () => {
    if (authUser) {
      const el = document.querySelector("#account-info");
      if (el) el.textContent = `Đăng nhập dưới tên ${authUser.displayName} (${authUser.username})`;
      setMode("account", "account");
    } else {
      setMode("login", "login");
    }
  },
  multiplayer: () => {
    refreshMultiplayerLobby();
    setMode("multiplayer", "multiplayer");
  },
  "mp-create": () => {
    if (mpEnabled) return;
    startMultiplayer(null, true);
  },
  "mp-join": () => {
    if (mpEnabled) return;
    const input = document.querySelector<HTMLInputElement>("#mp-room-input");
    const code = input?.value.trim() ?? "";
    if (!code) {
      const statusEl = document.querySelector("#mp-status");
      if (statusEl) statusEl.textContent = "Nhập mã phòng.";
      return;
    }
    startMultiplayer(code, false);
  },
  "mp-leave": () => {
    stopMultiplayer();
  },
  "mp-start": () => {
    if (!mpEnabled || !mpIsHost || !mpClient) return;
    mpClient.sendStartGame(currentMapId);
  },
  "auth-show-login": () => setMode("login", "login"),
  "auth-login": async () => {
    const el = document.querySelector<HTMLInputElement>("#login-username");
    const pw = document.querySelector<HTMLInputElement>("#login-password");
    const err = document.querySelector("#login-error");
    if (!el || !pw || !err) return;
    err.textContent = "";
    const result = await doLogin(el.value, pw.value);
    if (result.ok) {
      setMode("menu", "main-menu");
    } else {
      err.textContent = result.error ?? "Đăng nhập thất bại.";
      sfxFor("hurt");
    }
  },
  "auth-register": () => setMode("register", "register"),
  "auth-register-submit": async () => {
    const u = document.querySelector<HTMLInputElement>("#reg-username");
    const d = document.querySelector<HTMLInputElement>("#reg-display");
    const p = document.querySelector<HTMLInputElement>("#reg-password");
    const err = document.querySelector("#register-error");
    if (!u || !p || !err) return;
    err.textContent = "";
    const result = await doRegister(u.value, p.value, d?.value);
    if (result.ok) {
      setMode("login", "login");
    } else {
      err.textContent = result.error ?? "Đăng ký thất bại.";
      sfxFor("hurt");
    }
  },
  "auth-logout": async () => {
    await doLogout();
    setMode("menu", "main-menu");
  },
  "audio-toggle": () => {
    const on = !JSON.parse(sessionStorage.getItem("knot_audio_music") ?? "1");
    setMusicEnabled(on);
    setSfxEnabled(on);
    const btn = document.querySelector<HTMLButtonElement>("#audio-toggle");
    if (btn) btn.textContent = on ? "Tắt" : "Bật";
  },
  "controls-layout": () => {
    // Placeholder for future joystick layout customization.
    sfxFor("coin");
  },
});

async function start() {
  showScreen("loading");
  setLoadingMessage("Đang tải registry…");
  try {
    initAudio();
    const registryResponse = await fetch("data/asset-registry.json", { cache: "no-store" });
    if (!registryResponse.ok) throw new Error(`Registry HTTP ${registryResponse.status} (${registryResponse.url})`);
    registry = await registryResponse.json();
    const manifestResponse = await fetch("data/map-manifest.json", { cache: "no-store" });
    if (!manifestResponse.ok) throw new Error(`Manifest HTTP ${manifestResponse.status} (${manifestResponse.url})`);
    manifest = await manifestResponse.json();
    solids = [];
    await loadAssets();
    refreshLevelList();
    resetWorldShell();
    await loadSession(); // restore auth session if present
    const key = new URLSearchParams(window.location.search).get("map");
    const probe = key && /^[A-Z0-9]{3,12}$/.test(key) ? key : null;
    if (probe) {
      // Deep-link a map (used by smoke tests + share links); failures land on
      // the error screen, never on a fake run.
      requestAnimationFrame(frame);
      void startMapRun(probe);
      return;
    }
    setMode("menu", "main-menu"); // boot into the main menu; Play starts a run
    requestAnimationFrame(frame);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không tải được dữ liệu";
    setErrorMessage(message);
    statusLabel.textContent = "Không tải được asset";
    console.error(error);
    setMode("error", "error");
  }
}

start();
