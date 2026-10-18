// KNOT — shared gameplay types (Stage 6: wall mechanics, enemies, items, bombs).

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Hitbox {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

export interface MapBlock {
  instanceId: string;
  assetId: string;
  x: number;
  y: number;
}

export interface MapHazard {
  instanceId: string;
  assetId: string;
  x: number;
  y: number;
  hitbox: Hitbox;
}

export interface MapExit {
  instanceId: string;
  assetId: string;
  x: number;
  y: number;
  hitbox: Hitbox;
}

export interface MapEnemySpec {
  instanceId: string;
  assetId: string;
  x: number;
  y: number;
  hitbox: Hitbox;
  /** Horizontal span (world px) the 32px enemy slot may occupy. */
  patrol: { minX: number; maxX: number };
  speed: number;
}

export type ItemKind = "coin" | "gem" | "bomb";

export interface MapItemSpec {
  instanceId: string;
  assetId: string;
  kind: ItemKind;
  x: number;
  y: number;
  hitbox: Hitbox;
}

export interface MapData {
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
  enemies?: MapEnemySpec[];
  items?: MapItemSpec[];
}

export interface AssetEntry {
  id: string;
  path: string;
  frameFiles?: string[];
}

export interface AssetRegistry {
  schemaVersion: number;
  project: string;
  sources: Record<string, { name: string; url: string; license: string }>;
  assets: AssetEntry[];
}

export interface Player {
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
  /** Wall found by the last probe: -1 wall on the left, 1 wall on the right, 0 none. */
  wallDir: -1 | 0 | 1;
  /** Seconds left during which a fresh wall jump may not re-grab the wall. */
  wallJumpLock: number;
  hp: number;
  /** Seconds of invulnerability left after taking a hit (prevents repeat damage). */
  invulnerable: number;
}

export interface Inventory {
  coins: number;
  gems: number;
  bombs: number;
}

export interface Puff {
  x: number;
  y: number;
  elapsed: number;
  /** Visual scale multiplier (1 = the original 40x36 landing puff). */
  size: number;
}

export type ControlName = "left" | "right" | "jump" | "bomb";
