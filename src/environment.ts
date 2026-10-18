// KNOT — Môi trường: vùng nước và dung nham (PHẦN 4-5).
// Xử lý va chạm người chơi với các zona môi trường và áp dụng vật lý tương ứng.
// Không cần asset ảnh mới; vẽ bằng hình chữ nhật màu (fallback) nếu asset thiếu.

import { overlap } from "./collision";
import type { MapWaterZone, MapLavaZone, Rect } from "./types";

/** Trạng thái môi trường hiện tại của người chơi. */
export interface EnvState {
  inWater: boolean;
  water: MapWaterZone | null;
  inLava: boolean;
  lava: MapLavaZone | null;
  /** Lời accumulated chưa áp dụng sát thương lava (giây). */
  lavaDamageAccum: number;
}

/** Kiểm tra va chạm người chơi với các zona nước và dung nham. */
export function probeEnvironment(
  player: Rect,
  waterZones: MapWaterZone[],
  lavaZones: MapLavaZone[],
  state: EnvState
): EnvState {
  const next: EnvState = {
    inWater: false,
    water: null,
    inLava: false,
    lava: null,
    lavaDamageAccum: state.lavaDamageAccum,
  };

  for (const zone of waterZones) {
    const rect: Rect = { x: zone.x, y: zone.y, width: zone.width, height: zone.height };
    if (overlap(player, rect)) {
      next.inWater = true;
      next.water = zone;
      break;
    }
  }

  for (const zone of lavaZones) {
    const rect: Rect = { x: zone.x, y: zone.y, width: zone.width, height: zone.height };
    if (overlap(player, rect)) {
      next.inLava = true;
      next.lava = zone;
      break;
    }
  }

  return next;
}

/** Áp dụng vật lý nước vào vận tốc và trọng lực của người chơi. */
export function applyWaterPhysics(
  velocityY: number,
  env: EnvState,
  delta: number
): { velocityY: number; gravityFactor: number; moveFactor: number } {
  if (!env.inWater || !env.water) {
    return { velocityY, gravityFactor: 1, moveFactor: 1 };
  }
  const zone = env.water;
  // Trong nước: trọng lực giảm, cho phép nổi bão/lửng.
  const gravityFactor = zone.gravityFactor;
  // Vận tốc rơi được hạn chế.
  const maxRise = 120;
  let vy = velocityY;
  if (env.water.sink) {
    // Nếu chìm, lực plov lên giúp lên bề mặt.
    vy = Math.min(vy + 1450 * delta * gravityFactor, maxRise);
  } else {
    vy = Math.min(vy + 1450 * delta * gravityFactor, maxRise);
  }
  return { velocityY: vy, gravityFactor, moveFactor: zone.moveFactor };
}

/** Tính sát thương dung nham tích lũy trong khoảng delta. Trả về số lần áp dụng sát thương (mỗi lần = 1 HP). */
export function applyLavaDamage(
  env: EnvState,
  delta: number,
  damagePerSecond: number
): { hits: number; nextAccum: number } {
  if (!env.inLava || !env.lava) {
    return { hits: 0, nextAccum: 0 };
  }
  const dps = env.lava.damagePerSecond ?? damagePerSecond;
  const accum = env.lavaDamageAccum + delta;
  const hits = Math.floor(accum * dps);
  const nextAccum = hits > 0 ? accum - hits / dps : accum;
  return { hits, nextAccum };
}

/** Vẽ vùng môi trường lên canvas (fallback màu nếu thiếu asset). */
export function drawEnvironment(
  context: CanvasRenderingContext2D,
  cameraX: number,
  cameraY: number,
  waterZones: MapWaterZone[],
  lavaZones: MapLavaZone[]
): void {
  for (const zone of waterZones) {
    context.save();
    context.fillStyle = "rgba(60, 140, 200, 0.35)";
    context.fillRect(zone.x - cameraX, zone.y - cameraY, zone.width, zone.height);
    context.strokeStyle = "rgba(80, 160, 220, 0.7)";
    context.lineWidth = 2;
    context.strokeRect(zone.x - cameraX, zone.y - cameraY, zone.width, zone.height);
    context.restore();
  }
  for (const zone of lavaZones) {
    context.save();
    const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 200);
    context.fillStyle = `rgba(220, 60, 0, ${0.5 + 0.2 * pulse})`;
    context.fillRect(zone.x - cameraX, zone.y - cameraY, zone.width, zone.height);
    context.strokeStyle = `rgba(255, 100, 0, ${0.7 + 0.2 * pulse})`;
    context.lineWidth = 2;
    context.strokeRect(zone.x - cameraX, zone.y - cameraY, zone.width, zone.height);
    context.restore();
  }
}
