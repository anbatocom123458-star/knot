import { describe, expect, it } from "vitest";
import { activateEquipment, createEquipments, pickupEquipment } from "./equipment";

describe("equipment pickups", () => {
  it("creates and collects bomb equipment without an unsupported-kind failure", () => {
    const equipment = createEquipments([{
      instanceId: "bomb-cache",
      assetId: "EQP_BOMB",
      kind: "bomb",
      x: 32,
      y: 64,
      width: 32,
      height: 32,
      hitbox: { offsetX: 4, offsetY: 4, width: 24, height: 24 },
    }]);

    expect(equipment).toHaveLength(1);
    expect(pickupEquipment(equipment, { x: 36, y: 68, width: 24, height: 24 })).toBe(equipment[0]);
    expect(() => activateEquipment(equipment[0])).not.toThrow();
  });
});
