// KNOT — Hệ thống trang bị/vật phẩm nâng cao (PHẦN 8).
// Các loại: Flying Boots, High-Jump Boots, Shield, Magnet, Healing Item.
// Asset ID dùng placeholder (chưa có file thật); game vẽ fallback màu nếu thiếu asset.
// Xem ASSET_GAP.md để bổ sung file asset từ nguồn chính thức.

import { overlap } from "./collision";
import type { Rect } from "./types";

export type EquipmentKind =
  | "flying_boots"
  | "high_jump_boots"
  | "shield"
  | "magnet"
  | "healing"
  | "bomb";

export interface MapEquipmentSpec {
  instanceId: string;
  assetId: string;
  kind: EquipmentKind;
  x: number;
  y: number;
  width: number;
  height: number;
  hitbox: { offsetX: number; offsetY: number; width: number; height: number };
}

export interface EquipmentState {
  instanceId: string;
  assetId: string;
  kind: EquipmentKind;
  x: number;
  y: number;
  width: number;
  height: number;
  hitbox: { offsetX: number; offsetY: number; width: number; height: number };
  collected: boolean;
  /** Thời gian còn lại của hiệu ứng (giây), 0 nếu chưa kích hoạt. */
  activeTime: number;
  /** Cooldown còn lại (giây). */
  cooldown: number;
  /** Số lần còn lại (dùng cho Shield: 1 lần). */
  charges: number;
}

export const EQUIPMENT_SLOT_SIZE = 32;

export const EQUIPMENT_CONFIG: Record<EquipmentKind, {
  duration: number; // giây hiệu ứng (0 = dùng ngay/xử lý riêng)
  cooldown: number; // giây chờ giữa các lần dùng
  maxCharges: number;
}> = {
  flying_boots: { duration: 5, cooldown: 10, maxCharges: 1 },
  high_jump_boots: { duration: 8, cooldown: 8, maxCharges: 1 },
  shield: { duration: 0, cooldown: 0, maxCharges: 1 },
  magnet: { duration: 8, cooldown: 10, maxCharges: 1 },
  healing: { duration: 0, cooldown: 0, maxCharges: 1 },
  bomb: { duration: 0, cooldown: 0, maxCharges: 1 },
};

export function createEquipments(specs: MapEquipmentSpec[] | undefined): EquipmentState[] {
  return (specs ?? []).map((spec) => ({
    instanceId: spec.instanceId,
    assetId: spec.assetId,
    kind: spec.kind,
    x: spec.x,
    y: spec.y,
    width: spec.width,
    height: spec.height,
    hitbox: spec.hitbox,
    collected: false,
    activeTime: 0,
    cooldown: 0,
    charges: EQUIPMENT_CONFIG[spec.kind].maxCharges,
  }));
}

export function equipmentRect(eq: EquipmentState): Rect {
  return {
    x: eq.x + eq.hitbox.offsetX,
    y: eq.y + eq.hitbox.offsetY,
    width: eq.hitbox.width,
    height: eq.hitbox.height,
  };
}

/** Nhặt trang bị nếu player overlap và chưa được thu thập. Trả về trang bị vừa nhặt. */
export function pickupEquipment(
  equipments: EquipmentState[],
  collector: Rect
): EquipmentState | null {
  for (const eq of equipments) {
    if (eq.collected) continue;
    if (!overlap(collector, equipmentRect(eq))) continue;
    eq.collected = true;
    return eq;
  }
  return null;
}

/** Kích hoạt hiệu ứng trang bị (gọi ngay sau khi nhặt). */
export function activateEquipment(eq: EquipmentState): void {
  const cfg = EQUIPMENT_CONFIG[eq.kind];
  eq.activeTime = cfg.duration;
  eq.cooldown = cfg.cooldown;
  if (cfg.maxCharges === 1 && eq.kind !== "shield" && eq.kind !== "healing") {
    eq.charges = 0; // hết lượt sau khi kích hoạt (trừ shield/healing dùng ngay)
  }
}

/** Cập nhật tất cả trạng thái trang bị đang active (giảm activeTime, cooldown). */
export function updateEquipments(equipments: EquipmentState[], delta: number): void {
  for (const eq of equipments) {
    if (eq.activeTime > 0) {
      eq.activeTime = Math.max(0, eq.activeTime - delta);
    }
    if (eq.cooldown > 0) {
      eq.cooldown = Math.max(0, eq.cooldown - delta);
    }
    // Hồi charge sau cooldown xong (đồng nhất với maxCharges).
    if (eq.cooldown === 0 && eq.activeTime === 0 && eq.charges < EQUIPMENT_CONFIG[eq.kind].maxCharges) {
      eq.charges = EQUIPMENT_CONFIG[eq.kind].maxCharges;
    }
  }
}

/** Kiểm tra xem loại trang bị đang active hay không. */
export function isEquipmentActive(equipments: EquipmentState[], kind: EquipmentKind): boolean {
  return equipments.some((eq) => eq.kind === kind && eq.activeTime > 0);
}

/** Số charge hiện tại của loại trang bị. */
export function equipmentCharges(equipments: EquipmentState[], kind: EquipmentKind): number {
  const eq = equipments.find((e) => e.kind === kind);
  return eq ? eq.charges : 0;
}

/** Reset toàn bộ trang bị về trạng thái ban đầu (dùng khi restart/chuyển map). */
export function resetEquipments(equipments: EquipmentState[]): void {
  for (const eq of equipments) {
    eq.collected = false;
    eq.activeTime = 0;
    eq.cooldown = 0;
    eq.charges = EQUIPMENT_CONFIG[eq.kind].maxCharges;
  }
}

/** Hiệu ứng Magnet: hút coin trong bán kính gần equipment active. */
export function magnetPull(
  equipments: EquipmentState[],
  items: { x: number; y: number; collected: boolean }[],
  player: { x: number; y: number; width: number; height: number },
  delta: number
): void {
  const magnet = equipments.find((e) => e.kind === "magnet" && e.activeTime > 0);
  if (!magnet) return;
  const radius = 110;
  const speed = 140;
  const mx = magnet.x + magnet.width / 2;
  const my = magnet.y + magnet.height / 2;
  const px = player.x + player.width / 2;
  const py = player.y + player.height / 2;
  for (const item of items) {
    if (item.collected) continue;
    const ix = item.x + 16;
    const iy = item.y + 16;
    const dx = ix - mx;
    const dy = iy - my;
    const dist = Math.hypot(dx, dy);
    if (dist > radius || dist === 0) continue;
    // Hút về phía người chơi (trung bình giữa magnet và player).
    const tx = px - ix;
    const ty = py - iy;
    const tdist = Math.hypot(tx, ty) || 1;
    item.x += (tx / tdist) * speed * delta;
    item.y += (ty / tdist) * speed * delta;
  }
}

/** Vẽ trang bị (fallback màu nếu thiếu asset). */
export function drawEquipments(
  context: CanvasRenderingContext2D,
  cameraX: number,
  equipments: EquipmentState[]
): void {
  const colorByKind: Record<EquipmentKind, string> = {
    flying_boots: "#e7a14b",
    high_jump_boots: "#42a979",
    shield: "#df6349",
    magnet: "#aab8ae",
    healing: "#c94e37",
    bomb: "#2f534b",
  };
  for (const eq of equipments) {
    if (eq.collected) continue;
    context.save();
    context.fillStyle = colorByKind[eq.kind];
    context.globalAlpha = 0.85;
    context.fillRect(eq.x - cameraX, eq.y, eq.width, eq.height);
    context.strokeStyle = "#203b36";
    context.lineWidth = 2;
    context.strokeRect(eq.x - cameraX, eq.y, eq.width, eq.height);
    context.restore();
  }
}
