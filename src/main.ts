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
const tileSize = 32;
const viewport = { width: canvas.width, height: canvas.height };
const EXPLOSION_PUFF_SCALE = 2.2;

const input = { left: false, right: false, jumpPressed: false, bombPressed: false };
const keyControls = new Map<string, ControlName>([
  ["ArrowLeft", "left"],
  ["KeyA", "left"],
  ["ArrowRight", "right"],
  ["KeyD", "right"]
]);

let mapData!: MapData;
let registry!: AssetRegistry;
let assets = new Map<string, HTMLImageElement>();
/** Solid tile rects; blocks never change at runtime, built once after load. */
let solids: Rect[] = [];
let cameraX = 0;
let previousTime = 0;
let gameTime = 0;
let won = false;
let player!: Player;
let puffs: Puff[] = [];
let enemies: EnemyState[] = [];
let items: ItemState[] = [];
let activeBombs: ThrownBomb[] = [];
let inventory: Inventory = { coins: 0, gems: 0, bombs: 0 };

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
    paths.add(entry.path);
    for (const framePath of entry.frameFiles ?? []) paths.add(framePath);
  }
  const loaded = await Promise.all([...paths].map(async (path) => [path, await loadImage(path)] as const));
  assets = new Map(loaded);
}

function imageFor(assetId: string) {
  const image = assets.get(assetPath(assetId));
  if (!image) throw new Error(`Asset chua duoc tai: ${assetId}`);
  return image;
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
  // Clear pending edge presses so a reset cannot fire a jump/bomb mid-hold.
  input.jumpPressed = false;
  input.bombPressed = false;
  statusLabel.textContent = message;
}

function respawn(message = "Thử lại nào") {
  resetWorld(message);
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
      if (outcome.velocityX !== undefined) player.velocityX = outcome.velocityX;
      player.jumpsUsed = outcome.jumpsUsed;
      player.doubleJumping = outcome.doubleJumping;
      if (outcome.wallJumpLock !== undefined) {
        player.wallJumpLock = outcome.wallJumpLock;
        spawnPuff(); // wall-jump feedback reuses the landing puff
      }
      if (outcome.puff) spawnPuff();
      player.grounded = false;
    }
  }

  const axis = Number(input.right) - Number(input.left);
  const maximumSpeed = 220;
  const acceleration = player.grounded ? 1500 : 900;
  const friction = player.grounded ? 1700 : 240;

  if (axis !== 0) {
    player.velocityX += axis * acceleration * delta;
    player.velocityX = Math.max(-maximumSpeed, Math.min(maximumSpeed, player.velocityX));
    player.facing = axis;
    player.walkTime += delta;
  } else {
    const amount = friction * delta;
    player.velocityX = Math.abs(player.velocityX) <= amount ? 0 : player.velocityX - Math.sign(player.velocityX) * amount;
  }

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
  player.velocityY = Math.min(player.velocityY + 1450 * delta, 780);
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
    player.hp = hit.hp;
    player.invulnerable = hit.invulnerable;
    if (hit.velocityX !== undefined) player.velocityX = hit.velocityX;
    if (hit.velocityY !== undefined) player.velocityY = hit.velocityY;
    if (hit.died) {
      respawn("Bạn đã ngã! Chơi lại nào");
      return;
    }
    statusLabel.textContent = "Bị trúng đòn!";
    break;
  }

  // Item pickups.
  for (const item of collectItems(items, player)) {
    if (item.kind === "coin") {
      inventory.coins += 1;
      statusLabel.textContent = `Đồng xu ×${inventory.coins}`;
    } else if (item.kind === "gem") {
      inventory.gems += 1;
      spawnPuff();
      statusLabel.textContent = `Ngọc ×${inventory.gems}`;
    } else {
      inventory.bombs += 1;
      spawnPuff();
      statusLabel.textContent = `Có ${inventory.bombs} bom — bấm B / nút BOMB`;
    }
  }

  if (overlap(player, hitboxRect(mapData.exit.x, mapData.exit.y, mapData.exit.hitbox))) {
    won = true;
    input.left = false;
    input.right = false;
    statusLabel.textContent = "Đã đến cổng!";
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
  throwBombIfRequested();
  updatePlayer(delta);
  updateEnemies(enemies, solids, delta);
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
  context.fillStyle = "#fff";
  context.fillRect(0, 0, viewport.width, viewport.height);
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
    context.drawImage(imageFor(block.assetId), Math.round(block.x - cameraX), block.y, tileSize, tileSize);
  }

  for (const hazard of mapData.hazards) {
    context.drawImage(imageFor(hazard.assetId), Math.round(hazard.x - cameraX), hazard.y, tileSize, tileSize);
  }

  context.drawImage(imageFor(mapData.exit.assetId), Math.round(mapData.exit.x - cameraX), mapData.exit.y, tileSize, tileSize);
}

function drawItems() {
  for (const item of items) {
    if (item.collected) continue;
    const bob = Math.sin(gameTime * 3 + item.x * 0.05) * 3;
    context.drawImage(
      imageFor(item.assetId),
      Math.round(item.x - cameraX),
      Math.round(item.y + bob),
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
      context.drawImage(imageFor("EN03"), drawX, enemy.y, enemy.width, enemy.height);
      context.restore();
      continue;
    }
    const frameId = Math.floor(enemy.walkTime / 0.18) % 2 === 0 ? "EN01" : "EN02";
    const image = imageFor(frameId);
    if (enemy.direction < 0) {
      context.save();
      context.translate(drawX + enemy.width, 0);
      context.scale(-1, 1);
      context.drawImage(image, 0, enemy.y, enemy.width, enemy.height);
      context.restore();
    } else {
      context.drawImage(image, drawX, enemy.y, enemy.width, enemy.height);
    }
  }
}

function drawBombs() {
  for (const bomb of activeBombs) {
    context.drawImage(
      imageFor("IT05"),
      Math.round(bomb.x - cameraX),
      Math.round(bomb.y),
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
  const drawY = player.y + player.height - 64;
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
      Math.round(puff.y),
      Math.round(40 * puff.size),
      Math.round(36 * puff.size)
    );
  }
}

function drawHud() {
  const y = viewport.height - 15;
  context.save();
  context.font = "700 15px Trebuchet MS, sans-serif";
  context.textBaseline = "alphabetic";
  context.lineWidth = 3;
  context.lineJoin = "round";
  context.strokeStyle = "rgb(250 252 247 / 85%)";

  context.textAlign = "left";
  let heartX = 16;
  for (let i = 0; i < MAX_HP; i++) {
    context.fillStyle = i < player.hp ? "#df6349" : "rgb(32 59 54 / 30%)";
    context.strokeText("♥", heartX, y);
    context.fillText("♥", heartX, y);
    heartX += 20;
  }
  context.fillStyle = "#203b36";
  const bombText = `BOM ×${inventory.bombs} [B]`;
  context.strokeText(bombText, heartX + 8, y);
  context.fillText(bombText, heartX + 8, y);

  context.textAlign = "right";
  const pickupText = `COIN ×${inventory.coins}   GEM ×${inventory.gems}`;
  context.strokeText(pickupText, viewport.width - 16, y);
  context.fillText(pickupText, viewport.width - 16, y);
  context.restore();
}

function drawOverlay() {
  if (!won) return;
  context.fillStyle = "rgb(27 54 48 / 28%)";
  context.fillRect(0, 0, viewport.width, viewport.height);
  context.fillStyle = "#203b36";
  context.fillRect(viewport.width / 2 - 150, viewport.height / 2 - 48, 300, 96);
  context.fillStyle = "#f8fbf4";
  context.font = "700 22px Trebuchet MS, sans-serif";
  context.textAlign = "center";
  context.fillText("CỔNG ĐÃ MỞ", viewport.width / 2, viewport.height / 2 - 5);
  context.font = "13px Trebuchet MS, sans-serif";
  context.fillText("MAP000001 · FIELD CLEAR", viewport.width / 2, viewport.height / 2 + 22);
}

function render(delta: number) {
  cameraX = Math.max(0, Math.min(mapData.dimensions.width - viewport.width, player.x + player.width / 2 - viewport.width / 2));
  drawBackground();
  drawMap();
  drawItems();
  drawEnemies();
  drawBombs();
  drawEffects(delta);
  drawPlayer();
  drawHud();
  drawOverlay();
}

function frame(time: number) {
  const delta = Math.min((time - previousTime) / 1000 || 0, 1 / 30);
  previousTime = time;
  gameTime += delta;
  if (!won) update(delta);
  render(delta);
  requestAnimationFrame(frame);
}

function setControl(control: ControlName, pressed: boolean) {
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
  const control = button.dataset.control as ControlName | undefined;
  if (!control) continue;
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    button.classList.add("is-pressed");
    setControl(control, true);
  });
  const release = () => {
    button.classList.remove("is-pressed");
    if (control !== "jump" && control !== "bomb") setControl(control, false);
  };
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
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
  input.left = false;
  input.right = false;
});

document.querySelector("#reset")?.addEventListener("click", () => resetWorld());

async function start() {
  try {
    const [registryResponse, mapResponse] = await Promise.all([
      fetch("data/asset-registry.json"),
      fetch("maps/MAP000001/map.json")
    ]);
    if (!registryResponse.ok || !mapResponse.ok) throw new Error("Khong doc duoc Registry hoac map.");
    [registry, mapData] = await Promise.all([registryResponse.json(), mapResponse.json()]);
    solids = mapData.blocks.map((block) => blockRect(block, tileSize));
    await loadAssets();
    resetWorld();
    requestAnimationFrame(frame);
  } catch (error) {
    statusLabel.textContent = "Không tải được asset";
    console.error(error);
  }
}

start();
