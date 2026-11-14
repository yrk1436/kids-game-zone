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
  if (isTouch) {
    await locator.tap();
  } else {
    await locator.click();
  }
}

async function dismissIntroIfAny(page, isTouch) {
  const intro = page.getByTestId("new-item-overlay");
  if (await intro.isVisible()) {
    await activate(page, page.locator("#dismissIntroButton"), isTouch);
    await expect(intro).toBeHidden({ timeout: 5000 });
  }
}

async function assertNoHorizontalScroll(page) {
  const ok = await page.evaluate(() => {
    const slack = 2;
    return document.documentElement.scrollWidth <= window.innerWidth + slack;
  });
  expect(ok, "page should not scroll horizontally").toBeTruthy();
}

function trackConsoleErrors(page) {
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

test.describe("Scavenger Hunt", () => {
  test("dashboard link and 1-player round complete", async ({ page }, testInfo) => {
    const isTouch = !!testInfo.project.use.hasTouch;
    const consoleErrors = trackConsoleErrors(page);
    const projectName = testInfo.project.name;

    await page.goto("/index.html");
    await assertNoHorizontalScroll(page);
    const tile = page.locator('a[href="games/scavenger-hunt/index.html"]');
    await expect(tile).toBeVisible();
    await activate(page, tile, isTouch);

    await expect(page.getByTestId("start-overlay")).toBeVisible();
    await saveShot(page, "scavenger-start", projectName);

    await activate(page, page.locator("#start1P"), isTouch);
    await expect(page.getByTestId("start-overlay")).toBeHidden();

    const cells = page.getByTestId("hunt-cell");
    await expect(cells).toHaveCount(12);

    const count = await cells.count();
    for (let i = 0; i < count; i++) {
      await dismissIntroIfAny(page, isTouch);
      await activate(page, cells.nth(i), isTouch);
    }

    await expect(page.getByTestId("round-complete-overlay")).toBeVisible({ timeout: 10000 });
    await saveShot(page, "scavenger-round-complete-1p", projectName);
    await assertNoHorizontalScroll(page);

    const bad = consoleErrors.filter((e) => !/favicon|Failed to load resource/i.test(e));
    expect(bad).toEqual([]);
  });

  test("2-player scoreboard and winner", async ({ page }, testInfo) => {
    const isTouch = !!testInfo.project.use.hasTouch;
    const projectName = testInfo.project.name;

    await page.goto("/games/scavenger-hunt/index.html");
    await activate(page, page.locator("#start2P"), isTouch);
    await expect(page.getByTestId("player-bar")).toBeVisible();

    const cells = page.getByTestId("hunt-cell");
    const n = await cells.count();
    for (let i = 0; i < n; i++) {
      await dismissIntroIfAny(page, isTouch);
      if (i % 3 === 1) {
        await activate(page, page.getByTestId("player-toggle"), isTouch);
      }
      await activate(page, cells.nth(i), isTouch);
    }

    await expect(page.getByTestId("round-complete-overlay")).toBeVisible();
    await expect(page.getByTestId("winner-text")).toBeVisible();
    await saveShot(page, "scavenger-2p-winner", projectName);
  });
});

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
      await dismissIntroIfAny(page, isTouch);
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

test("hub tiles for new games", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.locator('a[href="games/scavenger-hunt/index.html"]')).toBeVisible();
  await expect(page.locator('a[href="games/license-plate-bingo/index.html"]')).toBeVisible();
});