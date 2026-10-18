import { describe, expect, it } from "vitest";
import { blockRect, detectWall, hitboxRect, overlap, pointInSolid } from "./collision";

describe("overlap", () => {
  it("detects intersecting rects", () => {
    expect(
      overlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 })
    ).toBe(true);
  });

  it("treats edge-only contact as no overlap", () => {
    expect(
      overlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 })
    ).toBe(false);
    expect(
      overlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 0, y: 10, width: 10, height: 10 })
    ).toBe(false);
  });

  it("ignores separated rects", () => {
    expect(
      overlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 40, y: 40, width: 5, height: 5 })
    ).toBe(false);
  });
});

describe("hitboxRect", () => {
  it("applies offsets to the slot origin", () => {
    expect(hitboxRect(100, 200, { offsetX: 4, offsetY: 14, width: 24, height: 18 })).toEqual({
      x: 104,
      y: 214,
      width: 24,
      height: 18
    });
  });
});

describe("blockRect", () => {
  it("builds a tile-sized rect", () => {
    expect(blockRect({ x: 64, y: 96 }, 32)).toEqual({ x: 64, y: 96, width: 32, height: 32 });
  });
});

describe("detectWall", () => {
  const wall = { x: 100, y: 0, width: 32, height: 100 };

  it("finds a flush wall on the right", () => {
    // body right edge lands exactly on the wall's left face
    expect(detectWall(60, 10, 40, 30, [wall])).toBe(1);
  });

  it("finds a wall on the left within tolerance", () => {
    // body left edge 2px past the wall's right face (inside tolerance)
    expect(detectWall(134, 10, 40, 30, [wall])).toBe(-1);
  });

  it("ignores walls further than the tolerance", () => {
    expect(detectWall(0, 10, 40, 30, [wall])).toBe(0);
  });

  it("ignores walls without vertical overlap", () => {
    expect(detectWall(60, 200, 40, 30, [wall])).toBe(0);
  });

  it("returns 0 with no solids", () => {
    expect(detectWall(10, 10, 24, 32, [])).toBe(0);
  });
});

describe("pointInSolid", () => {
  const solid = { x: 0, y: 100, width: 64, height: 32 };

  it("accepts points inside", () => {
    expect(pointInSolid(32, 116, [solid])).toBe(true);
  });

  it("rejects points past the right edge", () => {
    expect(pointInSolid(64, 116, [solid])).toBe(false);
  });
});
