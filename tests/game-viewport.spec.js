const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");

const QA_AFTER = path.join(process.cwd(), "qa-artifacts/tesla-audit/after");

const GAMES = [
  {
    id: "dino-runner",
    path: "/games/dino-runner/index.html",
    start: "#startButton",
    stage: "#stage",
    teslaMinWidthFrac: 0.62,
    play: async (page, isTouch) => {
      const jump = page.locator("#jumpButton");
      if (isTouch) await jump.tap();
      else await jump.click();
    },
  },
  {
    id: "fruit-catcher",
    path: "/games/fruit-catcher/index.html",
    start: "#startButton",
    stage: "#stage",
    teslaMinWidthFrac: 0.55,
    play: async (page, isTouch) => {
      const mover = page.locator(".mover__btn").first();
      if (isTouch) await mover.tap();
      else await mover.click();
    },
  },
  {
    id: "bubble-pop",
    path: "/games/bubble-pop/index.html",
    start: "#startButton",
    stage: "#stage",
    teslaMinWidthFrac: 0.6,
    play: async (page, isTouch) => {
      const box = await page.locator("#stage").boundingBox();
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      if (isTouch) await page.touchscreen.tap(x, y);
      else await page.mouse.click(x, y);
    },
  },
  {
    id: "whack-a-mole",
    path: "/games/whack-a-mole/index.html",
    start: "#startButton",
    stage: "#stage",
    teslaMinWidthFrac: 0.38,
    play: async (page, isTouch) => {
      const hole = page.locator(".hole").first();
      if (isTouch) await hole.tap();
      else await hole.click();
    },
  },
  {
    id: "memory-match",
    path: "/games/memory-match/index.html",
    start: '[data-testid="difficulty-easy"]',
    stage: '[data-testid="stage"]',
    teslaMinWidthFrac: 0.42,
    play: async (page, isTouch) => {
      const card = page.getByTestId("memory-card").first();
      if (isTouch) await card.tap();
      else await card.click();
    },
  },
  {
    id: "target-archery",
    path: "/games/target-archery/index.html",
    start: "#startButton",
    stage: "#stage",
    teslaMinWidthFrac: 0.28,
    play: async (page, isTouch) => {
      await page.waitForFunction(() => window.__getArcheryState !== undefined);
      await page.evaluate(() => {
        window.__setTestMode(true);
        window.__freezeTarget();
      });
      const box = await page.locator("#gameCanvas").boundingBox();
      if (box) {
        const x = box.x + box.width / 2;
        const y = box.y + box.height * 0.65;
        if (isTouch) await page.touchscreen.tap(x, y);
        else await page.mouse.click(x, y);
      }
    },
  },
];

async function assertNoHorizontalScroll(page) {
  const ok = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
  expect(ok).toBeTruthy();
}

function trackConsoleErrors(page) {
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

for (const game of GAMES) {
  test.describe(`Viewport + touch: ${game.id}`, () => {
    test("play area and interaction", async ({ page }, testInfo) => {
      const isTouch = !!testInfo.project.use.hasTouch;
      const projectName = testInfo.project.name;
      const consoleErrors = trackConsoleErrors(page);

      await page.goto(game.path);
      if (game.id === "memory-match") {
        await expect(page.getByTestId("start-overlay")).toBeVisible();
        await (isTouch
          ? page.getByTestId("difficulty-easy").tap()
          : page.getByTestId("difficulty-easy").click());
      } else {
        await activate(page, page.locator(game.start), isTouch);
      }

      const metrics = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        const r = el ? el.getBoundingClientRect() : { width: 0, height: 0 };
        return { width: r.width, height: r.height, vw: window.innerWidth, vh: window.innerHeight };
      }, game.stage);

      if (projectName === "Tesla Touchscreen") {
        expect(metrics.width).toBeGreaterThan(metrics.vw * game.teslaMinWidthFrac);
        fs.mkdirSync(QA_AFTER, { recursive: true });
        await page.screenshot({
          path: path.join(QA_AFTER, `${game.id}-Tesla.png`),
          fullPage: true,
        });
      }

      if (projectName.includes("iPhone")) {
        expect(metrics.width).toBeGreaterThan(metrics.vw * 0.84);
      }

      await game.play(page, isTouch);
      await assertNoHorizontalScroll(page);

      const bad = consoleErrors.filter((e) => !/favicon|Failed to load resource/i.test(e));
      expect(bad).toEqual([]);
    });
  });
}

test("hub — no scavenger hunt link", async ({ page }, testInfo) => {
  const consoleErrors = trackConsoleErrors(page);
  await page.goto("/index.html");
  await expect(page.locator('a[href="games/scavenger-hunt/index.html"]')).toHaveCount(0);
  const links = await page.locator('a.tile--playable[href^="games/"]').count();
  expect(links).toBeGreaterThanOrEqual(8);
  await assertNoHorizontalScroll(page);
  if (testInfo.project.name === "Tesla Touchscreen") {
    fs.mkdirSync(QA_AFTER, { recursive: true });
    await page.screenshot({ path: path.join(QA_AFTER, "hub-Tesla.png"), fullPage: true });
  }
  const bad = consoleErrors.filter((e) => !/favicon|Failed to load resource/i.test(e));
  expect(bad).toEqual([]);
});

async function activate(page, locator, isTouch) {
  await expect(locator).toBeVisible();
  if (isTouch) await locator.tap();
  else await locator.click();
}