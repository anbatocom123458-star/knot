// KNOT — thrown bomb module: fuse, ballistic flight, landing, explosion.

import { overlap } from "./collision";
import type { Rect } from "./types";

export const BOMB_SIZE = 24;
export const BOMB_FUSE_SECONDS = 1.0;
export const BOMB_EXPLOSION_RADIUS = 64;
export const BOMB_THROW_SPEED_X = 240;
export const BOMB_THROW_SPEED_Y = -200;
export const BOMB_GRAVITY = 1450;
export const BOMB_MAX_FALL_SPEED = 780;

export interface ThrownBomb {
  x: number;
  y: number;
  width: number;
  height: number;
  velocityX: number;
  velocityY: number;
  fuse: number;
  resting: boolean;
}

export interface Explosion {
  x: number;
  y: number;
  radius: number;
}

export function createBomb(x: number, y: number, facing: number): ThrownBomb {
  const direction = facing < 0 ? -1 : 1;
  return {
    x,
    y,
    width: BOMB_SIZE,
    height: BOMB_SIZE,
    velocityX: direction * BOMB_THROW_SPEED_X,
    velocityY: BOMB_THROW_SPEED_Y,
    fuse: BOMB_FUSE_SECONDS,
    resting: false
  };
}

/**
 * Advance bombs: gravity, landing on solids, horizontal bump stops, fuse.
 * Returns the bombs still in flight and the explosions that happened this
 * step. Mutates the bomb objects' fuse/position in place.
 */
export function updateBombs(
  bombs: ThrownBomb[],
  solids: Rect[],
  delta: number
): { bombs: ThrownBomb[]; explosions: Explosion[] } {
  const remaining: ThrownBomb[] = [];
  const explosions: Explosion[] = [];
  for (const bomb of bombs) {
    bomb.fuse -= delta;

    if (!bomb.resting) {
      bomb.velocityY = Math.min(bomb.velocityY + BOMB_GRAVITY * delta, BOMB_MAX_FALL_SPEED);

      const previousBottom = bomb.y + bomb.height;
      bomb.y += bomb.velocityY * delta;
      if (bomb.velocityY >= 0) {
        let landingY = Infinity;
        for (const solid of solids) {
          const horizontalOverlap = bomb.x < solid.x + solid.width &&
            bomb.x + bomb.width > solid.x;
          const crossedTop = previousBottom <= solid.y + 2 &&
            bomb.y + bomb.height >= solid.y;
          if (horizontalOverlap && crossedTop && solid.y < landingY) landingY = solid.y;
        }
        if (landingY !== Infinity) {
          bomb.y = landingY - bomb.height;
          bomb.velocityY = 0;
          bomb.velocityX = 0;
          bomb.resting = true;
        }
      }

      if (!bomb.resting) {
        const previousX = bomb.x;
        bomb.x += bomb.velocityX * delta;
        const movingRect = { x: bomb.x, y: bomb.y, width: bomb.width, height: bomb.height };
        for (const solid of solids) {
          if (!overlap(movingRect, solid)) continue;
          if (bomb.velocityX > 0 && previousX + bomb.width <= solid.x + 1) {
            bomb.x = solid.x - bomb.width;
          } else if (bomb.velocityX < 0 && previousX >= solid.x + solid.width - 1) {
            bomb.x = solid.x + solid.width;
          }
          bomb.velocityX = 0;
          bomb.resting = true;
        }
      }
    }

    if (bomb.fuse <= 0) {
      explosions.push({
        x: bomb.x + bomb.width / 2,
        y: bomb.y + bomb.height / 2,
        radius: BOMB_EXPLOSION_RADIUS
      });
    } else {
      remaining.push(bomb);
    }
  }
  return { bombs: remaining, explosions };
}

/** Center-distance check: does an explosion reach the given rectangle? */
export function explosionHitsRect(explosion: Explosion, rect: Rect): boolean {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const dx = centerX - explosion.x;
  const dy = centerY - explosion.y;
  return dx * dx + dy * dy <= explosion.radius * explosion.radius;
}
