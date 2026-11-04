const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");

const ARTIFACT_DIR = "/opt/cursor/artifacts/screenshots";
const LOCAL_DIR = path.join(process.cwd(), "qa-screenshots");
const LEVELS = ["easy", "medium", "hard"];
const PAIR_COUNTS = { easy: 6, medium: 8, hard: 10 };

function shotDirs() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.mkdirSync(LOCAL_DIR, { recursive: true });
}

async function saveShot(page, name) {
  shotDirs();
  const file = `${name}.png`;
  await page.screenshot({ path: path.join(ARTIFACT_DIR, file) });
  await page.screenshot({ path: path.join(LOCAL_DIR, file) });
}

const FLIP_MS = 280;

async function activate(page, locator, isTouch) {
  await expect(locator).toBeVisible();
  if (isTouch) {
    await locator.tap();
    return;
  }
  const box = await locator.boundingBox();
  expect(box, "click target should have a box").toBeTruthy();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function assertFacesHidden(page) {
  const hidden = await page.evaluate(() => {
    const fronts = document.querySelectorAll(
      ".card:not(.is-flipped):not(.is-matched) .card__face--front"
    );
    return Array.from(fronts).every((el) => getComputedStyle(el).opacity === "0");
  });
  expect(hidden, "face-down cards must hide their emoji").toBeTruthy();
}

async function cardState(cards, index) {
  return cards.nth(index).getAttribute("data-state");
}

async function readSymbols(cards, count) {
  const symbols = [];
  for (let i = 0; i < count; i++) {
    symbols.push(await cards.nth(i).getAttribute("data-symbol"));
  }
  return symbols;
}

function findMismatchPair(symbols) {
  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      if (symbols[i] !== symbols[j]) return [i, j];
    }
  }
  throw new Error("Could not find a mismatch pair");
}

function findMatchPair(symbols, used) {
  const seen = new Map();
  for (let i = 0; i < symbols.length; i++) {
    if (used.has(i)) continue;
    const prev = seen.get(symbols[i]);
    if (prev !== undefined) return [prev, i];
    seen.set(symbols[i], i);
  }
  throw new Error("Could not find a match pair");
}

async function playLevel(page, { level, isTouch, shots }) {
  await page.goto("/games/memory-match/index.html");
  await expect(page.getByTestId("start-overlay")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Memory Match!" })).toBeVisible();

  if (shots && shots.start) {
    await saveShot(page, shots.start);
  }

  await activate(page, page.getByTestId("difficulty-" + level), isTouch);
  await expect(page.getByTestId("start-overlay")).toBeHidden();
  await expect(page.locator("#stage")).toHaveAttribute("data-phase", "playing");

  const cards = page.getByTestId("memory-card");
  const count = PAIR_COUNTS[level] * 2;
  await expect(cards).toHaveCount(count);

  const firstBox = await cards.nth(0).boundingBox();
  expect(firstBox.width).toBeGreaterThanOrEqual(48);
  expect(firstBox.height).toBeGreaterThanOrEqual(48);

  const noScroll = await page.evaluate(() => {
    const slack = 2;
    return (
      document.documentElement.scrollWidth <= window.innerWidth + slack &&
      document.documentElement.scrollHeight <= window.innerHeight + slack
    );
  });
  expect(noScroll, "board should fit the viewport without scrolling").toBeTruthy();
  await assertFacesHidden(page);

  if (shots && shots.iphone) {
    await saveShot(page, shots.iphone);
  }

  const symbols = await readSymbols(cards, count);
  const matched = new Set();

  const [missA, missB] = findMismatchPair(symbols);
  await activate(page, cards.nth(missA), isTouch);
  await expect(cards.nth(missA)).toHaveAttribute("data-state", "flipped");
  await page.waitForTimeout(FLIP_MS);
  await activate(page, cards.nth(missB), isTouch);
  await expect(cards.nth(missB)).toHaveAttribute("data-state", "mismatch");
  await expect(cards.nth(missA)).toHaveAttribute("data-state", "mismatch");
  await page.waitForTimeout(FLIP_MS);
  await expect(page.getByTestId("moves-value")).toHaveText("1");

  if (shots && shots.mismatch) {
    await saveShot(page, shots.mismatch);
  }

  await expect(cards.nth(missA)).toHaveAttribute("data-state", "back");
  await expect(cards.nth(missB)).toHaveAttribute("data-state", "back");

  let capturedMatch = false;
  let safety = 0;
  while (matched.size < count && safety < 80) {
    safety += 1;
        const [a, b] = findMatchPair(symbols, matched);
    await activate(page, cards.nth(a), isTouch);
    await expect(cards.nth(a)).toHaveAttribute("data-state", "flipped");
    await page.waitForTimeout(FLIP_MS);
    await activate(page, cards.nth(b), isTouch);
    await expect(cards.nth(a)).toHaveAttribute("data-state", "matched");
    await expect(cards.nth(b)).toHaveAttribute("data-state", "matched");
    await page.waitForTimeout(FLIP_MS);
    matched.add(a);
    matched.add(b);

    if (shots && shots.match && !capturedMatch) {
      await saveShot(page, shots.match);
      capturedMatch = true;
    }

    await expect.poll(async () => cardState(cards, a)).toBe("matched");
    await page.waitForTimeout(260);
  }

  expect(matched.size).toBe(count);
  await expect(page.getByTestId("win-overlay")).toBeVisible();
  await expect(page.getByRole("heading", { name: "You did it!" })).toBeVisible();
  await expect(page.getByTestId("final-moves")).not.toHaveText("0");
  await expect(page.locator("#stage")).toHaveAttribute("data-phase", "won");

  if (shots && shots.win) {
    await saveShot(page, shots.win);
  }
}

test.describe("Memory Match real play", () => {
  for (const level of LEVELS) {
    test(`plays ${level} to the win screen`, async ({ page }, testInfo) => {
      const isTouch = testInfo.project.name.includes("iPhone");
      const shots = {};
      if (testInfo.project.name === "Desktop Chrome" && level === "easy") {
        shots.start = "memory_match_start";
        shots.mismatch = "memory_match_mismatch";
        shots.match = "memory_match_match";
        shots.win = "memory_match_win";
      }
      if (isTouch && level === "easy") {
        shots.iphone = "memory_match_iphone";
      }
      await playLevel(page, { level, isTouch, shots });
    });
  }
});

test.describe("Hub card", () => {
  test("Memory Match tile on the hub is playable", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "Desktop Chrome", "hub check once on desktop");
    await page.goto("/index.html");
    const tile = page.getByRole("link", { name: /Play Memory Match/i });
    await expect(tile).toBeVisible();
    await expect(tile).toHaveAttribute("href", "games/memory-match/index.html");
    await tile.click();
    await expect(page.getByTestId("start-overlay")).toBeVisible();
    await expect(page.getByTestId("difficulty-easy")).toBeVisible();
  });
});
