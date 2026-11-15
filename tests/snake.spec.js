const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");

const ARTIFACT_DIR = "/opt/cursor/artifacts";
const QA_DIR = path.join(process.cwd(), "qa-artifacts/snake");

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
  expect(ok).toBeTruthy();
}

function trackConsoleErrors(page) {
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

async function startSnake(page, isTouch) {
  await page.goto("/games/snake/index.html");
  await expect(page.getByTestId("start-overlay")).toBeVisible();
  await activate(page, page.locator("#startButton"), isTouch);
  await expect(page.getByTestId("start-overlay")).toBeHidden();
  await expect.poll(async () => page.evaluate(() => window.__snakeTestApi.getPhase())).toBe("running");
}

/** Tap/click canvas at a world offset from the snake head (dominant-axis turn). */
async function pointerToward(page, direction, isTouch) {
  const point = await page.evaluate((dir) => {
    const api = window.__snakeTestApi;
    const canvas = document.getElementById("gameCanvas");
    const head = api.getHead();
    const CELL = 30;
    const WORLD_W = 24 * CELL;
    const WORLD_H = 16 * CELL;
    const hx = head.x * CELL + CELL / 2;
    const hy = head.y * CELL + CELL / 2;
    let tx = hx;
    let ty = hy;
    if (dir === "right") tx += CELL * 5;
    if (dir === "left") tx -= CELL * 5;
    if (dir === "down") ty += CELL * 5;
    if (dir === "up") ty -= CELL * 5;
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.left + (tx / WORLD_W) * rect.width,
      y: rect.top + (ty / WORLD_H) * rect.height,
    };
  }, direction);

  if (isTouch) {
    await page.touchscreen.tap(point.x, point.y);
  } else {
    await page.mouse.click(point.x, point.y);
  }
}

async function swipeOnStage(page, direction, isTouch) {
  const box = await page.getByTestId("snake-stage").boundingBox();
  expect(box).toBeTruthy();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const delta = 80;
  let ex = cx;
  let ey = cy;
  if (direction === "right") ex += delta;
  if (direction === "left") ex -= delta;
  if (direction === "down") ey += delta;
  if (direction === "up") ey -= delta;

  if (isTouch) {
    await page.evaluate(
      async ({ cx, cy, ex, ey }) => {
        const stage = document.getElementById("stage");
        const down = new PointerEvent("pointerdown", {
          clientX: cx,
          clientY: cy,
          bubbles: true,
          pointerId: 1,
          pointerType: "touch",
        });
        stage.dispatchEvent(down);
        const up = new PointerEvent("pointerup", {
          clientX: ex,
          clientY: ey,
          bubbles: true,
          pointerId: 1,
          pointerType: "touch",
        });
        stage.dispatchEvent(up);
      },
      { cx, cy, ex, ey }
    );
  } else {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(ex, ey);
    await page.mouse.up();
  }
}

test.describe("Snake", () => {
  test("responsive board, controls, food, game over", async ({ page }, testInfo) => {
    const isTouch = !!testInfo.project.use.hasTouch;
    const projectName = testInfo.project.name;
    const consoleErrors = trackConsoleErrors(page);
    const viewport = page.viewportSize();

    await startSnake(page, isTouch);
    await saveShot(page, "snake-playing", projectName);

    const stageMetrics = await page.evaluate(() => {
      const stage = document.getElementById("stage");
      const r = stage.getBoundingClientRect();
      return {
        width: r.width,
        height: r.height,
        vh: window.innerHeight,
        vw: window.innerWidth,
      };
    });

    const minWidthFrac = projectName.includes("iPhone") ? 0.84 : 0.52;
    const minHeightFrac =
      projectName === "Tesla Touchscreen" ? 0.4 : projectName.includes("iPhone") ? 0.24 : 0.32;

    expect(stageMetrics.width).toBeGreaterThan(stageMetrics.vw * minWidthFrac);
    expect(stageMetrics.height).toBeGreaterThan(stageMetrics.vh * minHeightFrac);

    await activate(page, page.locator('.dpad__btn--left[data-dir="left"]'), isTouch);
    await expect
      .poll(async () => page.evaluate(() => window.__snakeTestApi.getTurnQueue()))
      .toContain("left");

    await page.evaluate(() => {
      window.__snakeTestApi.stepOnce();
      window.__snakeTestApi.stepOnce();
    });

    await pointerToward(page, "up", isTouch);
    await expect
      .poll(async () => page.evaluate(() => window.__snakeTestApi.getTurnQueue()))
      .toContain("up");

    await page.evaluate(() => window.__snakeTestApi.stepOnce());

    await swipeOnStage(page, "down", isTouch);
    await expect
      .poll(async () => page.evaluate(() => window.__snakeTestApi.getTurnQueue()))
      .toContain("down");

    if (!isTouch) {
      await page.evaluate(() => {
        window.__snakeTestApi.stepOnce();
        window.__snakeTestApi.stepOnce();
      });
      await page.keyboard.press("ArrowDown");
      await expect
        .poll(async () => page.evaluate(() => window.__snakeTestApi.getTurnQueue()))
        .toContain("down");
    }

    const beforeScore = await page.evaluate(() => window.__snakeTestApi.getScore());
    const beforeLen = await page.evaluate(() => window.__snakeTestApi.getLength());

    await page.evaluate(() => {
      const api = window.__snakeTestApi;
      const head = api.getHead();
      const dir = api.getDir();
      api.setFood(head.x + dir.x, head.y + dir.y);
    });
    await page.evaluate(() => window.__snakeTestApi.stepOnce());

    await expect.poll(async () => page.evaluate(() => window.__snakeTestApi.getScore())).toBeGreaterThan(beforeScore);
    await expect.poll(async () => page.evaluate(() => window.__snakeTestApi.getLength())).toBeGreaterThan(beforeLen);

    await page.evaluate(() => window.__snakeTestApi.forceGameOver());
    await expect(page.getByTestId("game-over-overlay")).toBeVisible({ timeout: 3000 });
    await saveShot(page, "snake-game-over", projectName);

    await assertNoHorizontalScroll(page);
    const bad = consoleErrors.filter((e) => !/favicon|Failed to load resource/i.test(e));
    expect(bad).toEqual([]);
  });
});