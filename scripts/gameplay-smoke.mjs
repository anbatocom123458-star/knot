// Dev-only headless smoke test (Playwright): boots the production build,
// checks assets load, the game loop runs, keyboard + touch input respond,
// and no console/page errors occur. Not part of the runtime bundle.
import { chromium } from "playwright";

const BASE = process.env.KNOT_BASE_URL ?? "http://localhost:4173/";
const errors = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

await page.goto(BASE, { waitUntil: "networkidle" });

// 1. Boot: the status label must reach the ready state (assets + map loaded).
await page.waitForFunction(
  () => document.querySelector("#status")?.textContent === "Sẵn sàng",
  { timeout: 10000 }
);
console.log("OK boot: status = Sẵn sàng");

// 2. Canvas actually draws (non-trivial pixel data).
const canvasDataLength = await page.evaluate(() => {
  const canvas = document.querySelector("#game");
  return canvas ? canvas.toDataURL("image/png").length : 0;
});
if (canvasDataLength < 10000) throw new Error(`canvas looks empty (${canvasDataLength})`);
console.log(`OK render: canvas payload ${canvasDataLength} bytes`);

// 3. Keyboard: B triggers the bomb action edge (no bombs in inventory yet).
await page.keyboard.press("KeyB");
await page.waitForFunction(
  () => document.querySelector("#status")?.textContent?.includes("Chưa có bom"),
  { timeout: 3000 }
);
console.log("OK input: KeyB handled by the game loop");

// 4. Keyboard movement + jumps for ~1.5s (exercises physics, camera, enemies).
await page.keyboard.down("ArrowRight");
for (let i = 0; i < 6; i++) {
  await page.keyboard.press("Space");
  await page.waitForTimeout(250);
}
await page.keyboard.up("ArrowRight");
console.log("OK input: movement + jump sequence ran");

// 5. Touch-style pointer button: clicking BOMB must hit the same handler.
await page.click('[data-control="bomb"]');
await page.waitForFunction(
  () => document.querySelector("#status")?.textContent?.includes("Chưa có bom"),
  { timeout: 3000 }
);
console.log("OK touch: bomb button wired");

// 6. Reset button responds.
await page.click("#reset");
await page.waitForFunction(
  () => document.querySelector("#status")?.textContent === "Sẵn sàng",
  { timeout: 3000 }
);
console.log("OK ui: reset button restarts");

// 7. Combat/death pipeline: run right without jumping. Within a few seconds
// the player must either collide with the patrolling slime or fall into the
// pit — both paths prove runtime contact/death handling fires.
const combatStatuses = new Set(["Bị trúng đòn!", "Thử lại nào", "Bạn đã ngã! Chơi lại nào", "Trúng đích!"]);
const seen = new Set();
const deadline = Date.now() + 6000;
await page.keyboard.down("ArrowRight");
while (Date.now() < deadline && seen.size === 0) {
  const status = await page.evaluate(() => document.querySelector("#status")?.textContent ?? "");
  if (combatStatuses.has(status)) seen.add(status);
  await page.waitForTimeout(100);
}
await page.keyboard.up("ArrowRight");
if (seen.size === 0) throw new Error("no combat/death status observed while running right");
console.log(`OK combat/death: ${[...seen].join(", ")}`);

await page.screenshot({ path: "/tmp/knot-stage6-smoke.png" });
await browser.close();

if (errors.length > 0) {
  console.error("FAIL runtime errors:");
  for (const error of errors) console.error("  " + error);
  process.exit(1);
}
console.log("PASS: no console/page errors");
