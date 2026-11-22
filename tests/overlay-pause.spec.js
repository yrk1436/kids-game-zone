const { test, expect } = require("@playwright/test");

const TARGET_PROJECTS = new Set(["Desktop Chrome", "iPhone 17 Pro Safari", "Tesla Touchscreen"]);

const OVERLAY_GAMES = [
  {
    id: "whack-a-mole",
    path: "/games/whack-a-mole/index.html?test=1",
    start: "#startButton",
    openOverlay: async (page, isTouch) => {
      const help = page.locator("#helpButton");
      if (isTouch) await help.tap();
      else await help.click();
      await expect(page.locator("#helpOverlay")).toBeVisible();
    },
    closeOverlay: async (page, isTouch) => {
      const close = page.locator("#closeHelpButton");
      if (isTouch) await close.tap();
      else await close.click();
      await expect(page.locator("#helpOverlay")).toBeHidden();
      if (await page.locator("#pauseOverlay").isVisible()) {
        const resume = page.locator("#resumeButton");
        if (isTouch) await resume.tap();
        else await resume.click();
      }
    },
    readState: async (page) => page.evaluate(() => window.__getWhackState()),
  },
  {
    id: "bubble-pop",
    path: "/games/bubble-pop/index.html",
    start: "#startButton",
    openOverlay: async (page, isTouch) => {
      const help = page.locator("#helpButton");
      if (isTouch) await help.tap();
      else await help.click();
      await expect(page.locator("#helpOverlay")).toBeVisible();
    },
    closeOverlay: async (page, isTouch) => {
      const close = page.locator("#closeHelpButton");
      if (isTouch) await close.tap();
      else await close.click();
    },
    readState: async (page) =>
      page.evaluate(() => ({
        lives: document.querySelectorAll("#livesBar .heart:not(.is-lost)").length,
        score: parseInt(document.getElementById("scoreValue").textContent, 10),
        level: parseInt(document.getElementById("levelValue").textContent, 10),
      })),
  },
  {
    id: "memory-match",
    path: "/games/memory-match/index.html",
    start: '[data-testid="difficulty-easy"]',
    openOverlay: async (page, isTouch) => {
      const help = page.locator("#helpButton");
      if (isTouch) await help.tap();
      else await help.click();
      await expect(page.getByTestId("help-overlay")).toBeVisible();
    },
    closeOverlay: async (page, isTouch) => {
      const close = page.locator("#closeHelpButton");
      if (isTouch) await close.tap();
      else await close.click();
      if (await page.locator("#pauseOverlay").isVisible()) {
        const resume = page.locator("#resumeButton");
        if (isTouch) await resume.tap();
        else await resume.click();
      }
    },
    readState: async (page) =>
      page.evaluate(() => ({
        moves: parseInt(document.getElementById("movesValue").textContent, 10),
        time: document.getElementById("timeValue").textContent,
        pairs: document.getElementById("pairsValue").textContent,
      })),
  },
];

async function startGame(page, game, isTouch) {
  await page.goto(game.path);
  const start = page.locator(game.start);
  await expect(start).toBeVisible();
  if (isTouch) await start.tap();
  else await start.click();
}

for (const game of OVERLAY_GAMES) {
  test.describe(`Overlay pause: ${game.id}`, () => {
    test("lives/score/timer unchanged while help is open 12s+", async ({ page }, testInfo) => {
      if (!TARGET_PROJECTS.has(testInfo.project.name)) {
        test.skip();
        return;
      }

      const isTouch = !!testInfo.project.use.hasTouch;
      await startGame(page, game, isTouch);
      await page.waitForTimeout(game.id === "whack-a-mole" ? 400 : 1500);
      const before = await game.readState(page);

      await game.openOverlay(page, isTouch);
      await page.waitForTimeout(12_000);
      const during = await game.readState(page);
      expect(during.lives).toBe(before.lives);
      expect(during.score).toBe(before.score);
      if (before.level !== undefined) expect(during.level).toBe(before.level);
      if (before.moves !== undefined) expect(during.moves).toBe(before.moves);
      if (before.time !== undefined) expect(during.time).toBe(before.time);

      await game.closeOverlay(page, isTouch);
      await expect(page.locator("#helpOverlay").or(page.getByTestId("help-overlay"))).toBeHidden();
    });
  });
}