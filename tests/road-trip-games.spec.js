const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");

const ARTIFACT_DIR = "/opt/cursor/artifacts";
const QA_DIR = path.join(process.cwd(), "qa-artifacts/road-trip");

const SNAPSHOT_PROJECTS = new Set(["Desktop Chrome", "iPhone 17 Pro Safari", "Tesla Touchscreen"]);

function ensureDirs() {
  fs.mkdirSync(path.join(ARTIFACT_DIR, "screenshots"), { recursive: true });
  fs.mkdirSync(QA_DIR, { recursive: true });
}

async function saveShot(page, name, projectName) {
  if (!SNAPSHOT_PROJECTS.has(projectName)) return;
  ensureDirs();
  const safe = projectName.replace(/\s+/g, "-");
  const file = `${name}-${safe}.png`;
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "screenshots", file), fullPage: true });
  await page.screenshot({ path: path.join(QA_DIR, file), fullPage: true });
}

async function activate(page, locator, isTouch) {
  await expect(locator).toBeVisible();
  if (isTouch) await locator.tap();
  else await locator.click();
}

async function assertNoHorizontalScroll(page) {
  const ok = await page.evaluate(() => {
    const slack = 2;
    return document.documentElement.scrollWidth <= window.innerWidth + slack;
  });
  expect(ok, "page should not scroll horizontally").toBeTruthy();
}

test.describe("License Plate Bingo", () => {
  test("1-player bingo line and trip localStorage", async ({ page }, testInfo) => {
    const isTouch = !!testInfo.project.use.hasTouch;
    const projectName = testInfo.project.name;

    await page.goto("/games/license-plate-bingo/index.html");
    await page.evaluate(() => localStorage.removeItem("badri.platebingo.tripstates"));

    await activate(page, page.locator("#start1P"), isTouch);
    await saveShot(page, "bingo-playing", projectName);

    const gridData = await page.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('[data-testid="bingo-cell"]'));
      return cells.map((el, index) => ({
        index,
        free: el.classList.contains("is-free"),
        r: Math.floor(index / 5),
      }));
    });

    const row0 = gridData.filter((c) => c.r === 0 && !c.free);
    for (const cell of row0) {
      const loc = page.getByTestId("bingo-cell").nth(cell.index);
      await activate(page, loc, isTouch);
    }

    await expect(page.getByTestId("bingo-overlay")).toBeVisible({ timeout: 8000 });
    await activate(page, page.locator("#keepPlayingButton"), isTouch);
    await expect(page.getByTestId("bingo-overlay")).toBeHidden();

    const tripLen = await page.evaluate(() => {
      const raw = localStorage.getItem("badri.platebingo.tripstates");
      return raw ? JSON.parse(raw).length : 0;
    });
    expect(tripLen).toBeGreaterThan(0);

    await page.reload();
    const tripAfter = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("badri.platebingo.tripstates") || "[]")
    );
    expect(tripAfter.length).toBe(tripLen);

    await saveShot(page, "bingo-after-line", projectName);
    await assertNoHorizontalScroll(page);
  });

  test("2-player marks and blackout screen", async ({ page }, testInfo) => {
    const isTouch = !!testInfo.project.use.hasTouch;
    const projectName = testInfo.project.name;

    await page.goto("/games/license-plate-bingo/index.html");
    await activate(page, page.locator("#start2P"), isTouch);
    await expect(page.getByTestId("player-bar")).toBeVisible();

    const cells = page.getByTestId("bingo-cell");
    const total = await cells.count();
    for (let i = 0; i < total; i++) {
      const bingo = page.getByTestId("bingo-overlay");
      if (await bingo.isVisible()) {
        await activate(page, page.locator("#keepPlayingButton"), isTouch);
      }
      const cell = cells.nth(i);
      const cls = (await cell.getAttribute("class")) || "";
      if (cls.includes("is-free") || cls.includes("is-marked")) continue;
      if (i % 4 === 2) {
        await activate(page, page.getByTestId("player-toggle"), isTouch);
      }
      await activate(page, cell, isTouch);
    }

    await expect(page.getByTestId("blackout-overlay")).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("blackout-winner-text")).toBeVisible();
    await saveShot(page, "bingo-blackout-2p", projectName);
  });
});

test("hub has license plate bingo and no scavenger hunt", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.locator('a[href="games/license-plate-bingo/index.html"]')).toBeVisible();
  await expect(page.locator('a[href="games/scavenger-hunt/index.html"]')).toHaveCount(0);
});