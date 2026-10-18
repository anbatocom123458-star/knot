// KNOT — patrol enemy module: movement, ledge/wall turning, stomp detection.

import { overlap, pointInSolid, hitboxRect } from "./collision";
import type { MapEnemySpec, Rect } from "./types";

export const ENEMY_GRAVITY = 1450;
export const ENEMY_MAX_FALL_SPEED = 780;
export const ENEMY_DEATH_DURATION = 0.9;
/** Fall speed granted to the player when an enemy is stomped. */
export const STOMP_BOUNCE_VELOCITY = -380;
/**
 * How far below the enemy hitbox top the player's bottom may still count as
 * a stomp. Must stay under the hitbox height (18) so running into an enemy
 * from the side is never mistaken for a stomp.
 */
export const STOMP_DEPTH = 10;

export interface EnemyState {
  instanceId: string;
  assetId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hitbox: MapEnemySpec["hitbox"];
  patrolMinX: number;
  patrolMaxX: number;
  speed: number;
  direction: 1 | -1;
  velocityY: number;
  grounded: boolean;
  alive: boolean;
  deathElapsed: number;
  walkTime: number;
}

export const ENEMY_SLOT_SIZE = 32;

export function createEnemies(specs: MapEnemySpec[] | undefined): EnemyState[] {
  return (specs ?? []).map((spec) => ({
    instanceId: spec.instanceId,
    assetId: spec.assetId,
    x: spec.x,
    y: spec.y,
    width: ENEMY_SLOT_SIZE,
    height: ENEMY_SLOT_SIZE,
    hitbox: spec.hitbox,
    patrolMinX: spec.patrol.minX,
    patrolMaxX: spec.patrol.maxX,
    speed: spec.speed,
    direction: 1 as const,
    velocityY: 0,
    grounded: false,
    alive: true,
    deathElapsed: 0,
    walkTime: 0
  }));
}

export function enemyRect(enemy: EnemyState): Rect {
  return hitboxRect(enemy.x, enemy.y, enemy.hitbox);
}

export function killEnemy(enemy: EnemyState): void {
  if (!enemy.alive) return;
  enemy.alive = false;
  enemy.deathElapsed = 0;
}

/**
 * True when a falling player lands on the enemy hitbox from above.
 * `previousBottom` is the player's bottom edge before its last vertical move.
 */
export function isStomp(
  previousBottom: number,
  currentBottom: number,
  enemy: Rect,
  velocityY: number
): boolean {
  if (velocityY <= 0) return false;
  if (previousBottom > enemy.y + STOMP_DEPTH) return false;
  return currentBottom >= enemy.y;
}

/**
 * Advance every enemy: patrol bounds, wall/ledge turning, gravity and landing.
 * Mutates the states in place (they are per-level runtime objects).
 */
export function updateEnemies(enemies: EnemyState[], solids: Rect[], delta: number): void {
  for (const enemy of enemies) {
    if (!enemy.alive) {
      enemy.deathElapsed += delta;
      continue;
    }

    // Horizontal patrol with wall and ledge detection.
    const minLeft = enemy.patrolMinX;
    const maxLeft = Math.max(enemy.patrolMinX, enemy.patrolMaxX - enemy.width);
    let nextX = enemy.x + enemy.direction * enemy.speed * delta;
    let turned = false;
    let moved = false;
    if (nextX < minLeft) {
      nextX = minLeft;
      turned = true;
      moved = true;
    } else if (nextX > maxLeft) {
      nextX = maxLeft;
      turned = true;
      moved = true;
    } else {
      const movingRect = hitboxRect(nextX, enemy.y, enemy.hitbox);
      const hitsWall = solids.some((solid) => overlap(movingRect, solid));
      if (hitsWall) {
        turned = true;
      } else if (enemy.grounded) {
        const frontX = enemy.direction > 0
          ? movingRect.x + movingRect.width + 1
          : movingRect.x - 1;
        const probeY = movingRect.y + movingRect.height + 2;
        if (!pointInSolid(frontX, probeY, solids)) {
          turned = true; // ledge ahead: turn instead of walking into the pit
        }
      }
      if (!turned) moved = true;
    }

    if (turned) {
      enemy.direction = enemy.direction > 0 ? -1 : 1;
    }
    if (moved) {
      enemy.x = nextX;
      enemy.walkTime += delta;
    }

    // Vertical movement (enemies start resting on their platform).
    enemy.velocityY = Math.min(enemy.velocityY + ENEMY_GRAVITY * delta, ENEMY_MAX_FALL_SPEED);
    const slotRect = { x: enemy.x, y: enemy.y, width: enemy.width, height: enemy.height };
    const previousBottom = slotRect.y + slotRect.height;
    enemy.y += enemy.velocityY * delta;
    enemy.grounded = false;
    if (enemy.velocityY >= 0) {
      let landingY = Infinity;
      for (const solid of solids) {
        const horizontalOverlap = slotRect.x < solid.x + solid.width &&
          slotRect.x + slotRect.width > solid.x;
        const crossedTop = previousBottom <= solid.y + 2 &&
          enemy.y + enemy.height >= solid.y;
        if (horizontalOverlap && crossedTop && solid.y < landingY) landingY = solid.y;
      }
      if (landingY !== Infinity) {
        enemy.y = landingY - enemy.height;
        enemy.velocityY = 0;
        enemy.grounded = true;
      }
    }
  }
}
