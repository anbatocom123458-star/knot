// KNOT — player damage rules: health, i-frames, knockback, death flag.

export const MAX_HP = 3;
export const INVULNERABLE_DURATION = 1.2;
export const KNOCKBACK_VELOCITY_X = 260;
export const KNOCKBACK_VELOCITY_Y = -320;

export interface DamageResult {
  applied: boolean;
  hp: number;
  invulnerable: number;
  velocityX?: number;
  velocityY?: number;
  died: boolean;
}

/**
 * Apply one hit. While `invulnerable > 0` the hit is ignored, which is what
 * prevents several damage applications during the same contact or across
 * consecutive frames of the same overlap.
 */
export function applyDamage(
  hp: number,
  invulnerable: number,
  playerCenterX: number,
  sourceCenterX: number,
  facing: number
): DamageResult {
  if (invulnerable > 0) {
    return { applied: false, hp, invulnerable, died: false };
  }
  const nextHp = hp - 1;
  let direction = Math.sign(playerCenterX - sourceCenterX);
  if (direction === 0) direction = facing !== 0 ? -facing : 1;
  return {
    applied: true,
    hp: nextHp,
    invulnerable: INVULNERABLE_DURATION,
    velocityX: direction * KNOCKBACK_VELOCITY_X,
    velocityY: KNOCKBACK_VELOCITY_Y,
    died: nextHp <= 0
  };
}

export function tickInvulnerable(invulnerable: number, delta: number): number {
  return Math.max(0, invulnerable - delta);
}

/** Blink rendering helper: hide the player during short slices of i-frames. */
export function isPlayerVisible(invulnerable: number): boolean {
  if (invulnerable <= 0) return true;
  return Math.floor(invulnerable / 0.08) % 2 === 0;
}
