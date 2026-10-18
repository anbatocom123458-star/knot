// KNOT — MAP000001 demo. Converted1:1 from src/game.js (Vite + TypeScript migration);
// gameplay values (canvas 960x540, physics, collision, BG01 parallax, input) are unchanged.

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Hitbox {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

interface MapBlock {
  instanceId: string;
  assetId: string;
  x: number;
  y: number;
}

interface MapHazard {
  instanceId: string;
  assetId: string;
  x: number;
  y: number;
  hitbox: Hitbox;
}

interface MapExit {
  instanceId: string;
  assetId: string;
  x: number;
  y: number;
  hitbox: Hitbox;
}

interface MapData {
  id: string;
  name: string;
  version: number;
  tileSize: number;
  dimensions: { width: number; height: number };
  backgroundAssetId: string;
  spawn: { x: number; y: number };
  blocks: MapBlock[];
  hazards: MapHazard[];
  exit: MapExit;
}

interface AssetEntry {
  id: string;
  path: string;
  frameFiles?: string[];
}

interface AssetRegistry {
  schemaVersion: number;
  project: string;
  sources: Record<string, { name: string; url: string; license: string }>;
  assets: AssetEntry[];
}

interface Player {
  x: number;
  y: number;
  width: number;
  height: number;
  velocityX: number;
  velocityY: number;
  grounded: boolean;
  jumpsUsed: number;
  facing: number;
  walkTime: number;
  doubleJumping: boolean;
}

interface Puff {
  x: number;
  y: number;
  elapsed: number;
}

type ControlName = "left" | "right" | "jump";

function requireElement<T>(value: T | null, message: string): T {
  if (value === null) throw new Error(message);
  return value;
}

const canvas = requireElement(document.querySelector<HTMLCanvasElement>("#game"), "Khong tim thay the canvas #game.");
const context = requireElement(canvas.getContext("2d", { alpha: false }), "Khong tao duoc bo ve 2d.");
const statusLabel = requireElement(document.querySelector("#status"), "Khong tim thay #status.");
const tileSize = 32;
const viewport = { width: canvas.width, height: canvas.height };
const input = { left: false, right: false, jumpPressed: false };
const keyControls = new Map<string, ControlName>([
  ["ArrowLeft", "left"],
  ["KeyA", "left"],
  ["ArrowRight", "right"],
  ["KeyD", "right"]
]);

let mapData!: MapData;
let registry!: AssetRegistry;
let assets = new Map<string, HTMLImageElement>();
let cameraX = 0;
let previousTime = 0;
let won = false;
let player!: Player;
let puffs: Puff[] = [];

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

function resetPlayer() {
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
    doubleJumping: false
  };
  won = false;
  puffs = [];
  statusLabel.textContent = "Sẵn sàng";
}

function overlap(first: Rect, second: Rect) {
  return first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y;
}

function blockRect(block: MapBlock): Rect {
  return { x: block.x, y: block.y, width: tileSize, height: tileSize };
}

function obstacleRect(obstacle: MapHazard): Rect {
  return {
    x: obstacle.x + obstacle.hitbox.offsetX,
    y: obstacle.y + obstacle.hitbox.offsetY,
    width: obstacle.hitbox.width,
    height: obstacle.hitbox.height
  };
}

function triggerRect(trigger: MapExit): Rect {
  return {
    x: trigger.x + trigger.hitbox.offsetX,
    y: trigger.y + trigger.hitbox.offsetY,
    width: trigger.hitbox.width,
    height: trigger.hitbox.height
  };
}

function spawnPuff() {
  puffs.push({ x: player.x + player.width / 2 - 20, y: player.y + player.height - 24, elapsed: 0 });
}

function consumeJump() {
  if (!input.jumpPressed || won) return;
  input.jumpPressed = false;

  if (player.grounded) {
    player.velocityY = -520;
    player.grounded = false;
    player.jumpsUsed = 1;
    player.doubleJumping = false;
    return;
  }

  if (player.jumpsUsed === 1) {
    player.velocityY = -470;
    player.jumpsUsed = 2;
    player.doubleJumping = true;
    spawnPuff();
  }
}

function respawn() {
  resetPlayer();
  statusLabel.textContent = "Thử lại nào";
}

function updatePlayer(delta: number) {
  consumeJump();

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

  const solids = mapData.blocks.map(blockRect);
  const previousX = player.x;
  player.x += player.velocityX * delta;
  for (const solid of solids) {
    if (!overlap(player, solid)) continue;
    if (player.velocityX > 0 && previousX + player.width <= solid.x + 1) player.x = solid.x - player.width;
    else if (player.velocityX < 0 && previousX >= solid.x + solid.width - 1) player.x = solid.x + solid.width;
    player.velocityX = 0;
  }
  player.x = Math.max(0, Math.min(mapData.dimensions.width - player.width, player.x));

  const previousY = player.y;
  const previousBottom = previousY + player.height;
  player.velocityY = Math.min(player.velocityY + 1450 * delta, 780);
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

  if (mapData.hazards.some((hazard) => overlap(player, obstacleRect(hazard)))) {
    respawn();
    return;
  }

  if (overlap(player, triggerRect(mapData.exit))) {
    won = true;
    input.left = false;
    input.right = false;
    statusLabel.textContent = "Đã đến cổng!";
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

function currentCharacterFrame() {
  if (!player.grounded) return assets.get(assetPath("AN03"));
  if (Math.abs(player.velocityX) < 8) return assets.get(assetPath("AN01"));
  const walk = registry.assets.find((entry) => entry.id === "AN02");
  if (!walk?.frameFiles) throw new Error("Asset ID khong ton tai: AN02");
  const index = Math.floor(player.walkTime / 0.16) % walk.frameFiles.length;
  return assets.get(walk.frameFiles[index]);
}

function drawPlayer() {
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
    context.drawImage(image, Math.round(puff.x - cameraX), Math.round(puff.y), 40, 36);
  }
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
  drawEffects(delta);
  drawPlayer();
  drawOverlay();
}

function frame(time: number) {
  const delta = Math.min((time - previousTime) / 1000 || 0, 1 / 30);
  previousTime = time;
  if (!won) updatePlayer(delta);
  render(delta);
  requestAnimationFrame(frame);
}

function setControl(control: ControlName, pressed: boolean) {
  if (control === "jump") {
    if (pressed) input.jumpPressed = true;
  } else {
    input[control] = pressed;
  }
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
    if (control !== "jump") setControl(control, false);
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

document.querySelector("#reset")?.addEventListener("click", resetPlayer);

async function start() {
  try {
    const [registryResponse, mapResponse] = await Promise.all([
      fetch("data/asset-registry.json"),
      fetch("maps/MAP000001/map.json")
    ]);
    if (!registryResponse.ok || !mapResponse.ok) throw new Error("Khong doc duoc Registry hoac map.");
    [registry, mapData] = await Promise.all([registryResponse.json(), mapResponse.json()]);
    await loadAssets();
    resetPlayer();
    requestAnimationFrame(frame);
  } catch (error) {
    statusLabel.textContent = "Không tải được asset";
    console.error(error);
  }
}

start();




