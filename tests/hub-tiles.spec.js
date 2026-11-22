const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");

const QA_DIR = path.join(process.cwd(), "qa-artifacts/hub-tiles");
const TARGET_PROJECTS = new Set(["Desktop Chrome", "iPhone 17 Pro Safari", "Tesla Touchscreen"]);

test.describe("Hub tile sizing", () => {
  test("all tiles share footprint", async ({ page }, testInfo) => {
    if (!TARGET_PROJECTS.has(testInfo.project.name)) {
      test.skip();
      return;
    }

    const slug = testInfo.project.name.replace(/\s+/g, "-");
    await page.goto("/index.html");
    await expect(page.locator(".tile--playable").first()).toBeVisible();

    const sizes = await page.evaluate(() => {
      const tiles = [...document.querySelectorAll(".tile-grid .tile")];
      return tiles.map((t) => {
        const r = t.getBoundingClientRect();
        return { w: r.width, h: r.height, id: t.querySelector(".tile__name")?.textContent || "" };
      });
    });

    const widths = sizes.map((s) => s.w);
    const heights = sizes.map((s) => s.h);
      expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(2);
      expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(2);

    const bingo = sizes.find((s) => s.id.includes("License Plate"));
    const medianH = heights.slice().sort((a, b) => a - b)[Math.floor(heights.length / 2)];
    expect(Math.abs(bingo.h - medianH)).toBeLessThanOrEqual(2);

    fs.mkdirSync(QA_DIR, { recursive: true });
    await page.screenshot({
      path: path.join(QA_DIR, `hub-${slug}.png`),
      fullPage: true,
    });
  });
});