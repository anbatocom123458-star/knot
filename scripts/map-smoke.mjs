import { chromium } from "playwright";

const BASE = process.env.KNOT_BASE_URL ?? "http://localhost:3001/";
const MAP_IDS = [
  "MAP000001",
  "MAP000016",
  "MAP000026",
  "MAP000041",
  "MAP000056",
  "MAP000071",
  "MAP000081",
  "MAP000091",
  "MAP000092",
  "MAP000100",
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

try {
  for (const mapId of MAP_IDS) {
    await page.goto(`${BASE}?map=${mapId}`, { waitUntil: "networkidle" });
    await page.waitForFunction(
      (expectedId) => document.querySelector("#status")?.textContent === `Sẵn sàng · ${expectedId}`,
      mapId,
      { timeout: 5000 },
    );
    const result = await page.evaluate(() => ({
      running: document.querySelector("#screen-layer")?.hidden === true,
      canvasBytes: document.querySelector("#game")?.toDataURL("image/png").length ?? 0,
    }));
    if (!result.running || result.canvasBytes < 10000) {
      throw new Error(`${mapId}: game did not reach gameplay/render state (${JSON.stringify(result)}).`);
    }
    console.log(`OK ${mapId}: gameplay started, canvas ${result.canvasBytes} bytes`);
  }
} finally {
  await browser.close();
}

if (pageErrors.length > 0) {
  throw new Error(`Browser runtime errors: ${pageErrors.join("; ")}`);
}
