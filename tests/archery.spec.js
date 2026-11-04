// @ts-check
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const GAME_URL = "/games/target-archery/index.html";
const ARTIFACT_DIR = path.join(__dirname, "..", "qa-artifacts", "target-archery");

function isIPhone(testInfo) {
  return testInfo.project.name.includes("iPhone");
}

async function waitForGame(page) {
  await page.goto(GAME_URL);
  await page.waitForFunction(() => window.__getArcheryState !== undefined);
  await page.waitForTimeout(300);
}

async function startReady(page) {
  await page.evaluate(() => window.__setTestMode(true));
  await page.click("#startButton");
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    window.__setTestMode(true);
    window.__freezeTarget();
  });
}

async function state(page) {
  return page.evaluate(() => window.__getArcheryState());
}

async function preview(page) {
  return page.evaluate(() => window.__getAimPreview());
}

async function canvasMap(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById("gameCanvas");
    const r = canvas.getBoundingClientRect();
    const s = window.__getArcheryState();
    return {
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      canvasW: s.canvasW,
      canvasH: s.canvasH,
    };
  });
}

function toViewport(map, x, y) {
  return {
    x: map.left + x * (map.width / map.canvasW),
    y: map.top + y * (map.height / map.canvasH),
  };
}

async function dispatchTouch(page, type, x, y, ended) {
  await page.evaluate(({ type, x, y, ended }) => {
    const canvas = document.getElementById("gameCanvas");
    const point = {
      identifier: 1,
      target: canvas,
      clientX: x,
      clientY: y,
      pageX: x,
      pageY: y,
      screenX: x,
      screenY: y,
      radiusX: 12,
      radiusY: 12,
      force: ended ? 0 : 0.6,
    };
    const event = new Event(type, { bubbles: true, cancelable: true, composed: true });
    Object.defineProperty(event, "touches", { value: ended ? [] : [point] });
    Object.defineProperty(event, "targetTouches", { value: ended ? [] : [point] });
    Object.defineProperty(event, "changedTouches", { value: [point] });
    canvas.dispatchEvent(event);
  }, { type, x, y, ended });
}

async function pointerDown(page, x, y, useTouch) {
  if (useTouch) {
    await dispatchTouch(page, "touchstart", x, y, false);
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
  }
}

async function pointerMove(page, x, y, useTouch) {
  if (useTouch) {
    await dispatchTouch(page, "touchmove", x, y, false);
  } else {
    await page.mouse.move(x, y);
  }
}

async function pointerUp(page, x, y, useTouch) {
  if (useTouch) {
    await dispatchTouch(page, "touchend", x, y, true);
  } else {
    await page.mouse.up();
  }
}

function ringAimPoint(target, ring) {
  const r = target.radius;
  switch (ring) {
    case "bullseye":
      return { x: target.x, y: target.y };
    case "red":
      return { x: target.x, y: target.y + r * 0.38 };
    case "blue":
      return { x: target.x, y: target.y + r * 0.62 };
    case "white":
      return { x: target.x, y: target.y + r * 0.86 };
    case "miss":
      return { x: target.x, y: target.y + r * 1.7 };
    default:
      return { x: target.x, y: target.y };
  }
}

async function aimByPreview(page, ring, useTouch) {
  const s = await state(page);
  const map = await canvasMap(page);
  const aim = ringAimPoint(s.target, ring);

  const startCanvas = {
    x: Math.min(s.canvasW * 0.46, s.bow.x + 90),
    y: s.canvasH * 0.58,
  };
  const start = toViewport(map, startCanvas.x, startCanvas.y);

  const baseAngle = Math.atan2(aim.y - s.bow.y, aim.x - s.bow.x);
  const angleTries = [0, -0.08, 0.08, -0.16, 0.16, -0.24, 0.24, -0.32, 0.32];

  let best = { ring: null, dist: Infinity, x: start.x, y: start.y, preview: null };

  await pointerDown(page, start.x, start.y, useTouch);
  await page.waitForTimeout(40);

  for (const offset of angleTries) {
    const dragAngle = baseAngle + Math.PI + offset;
    for (let dist = 36; dist <= 240; dist += 8) {
      const current = {
        x: start.x + Math.cos(dragAngle) * dist,
        y: start.y + Math.sin(dragAngle) * dist,
      };
      if (
        current.x < map.left + 8 ||
        current.y < map.top + 8 ||
        current.x > map.left + map.width - 8 ||
        current.y > map.top + map.height - 8
      ) {
        continue;
      }

      await pointerMove(page, current.x, current.y, useTouch);
      await page.waitForTimeout(18);

      const p = await preview(page);
      if (!p || !p.closestToTarget) continue;

      const hit = p.closestToTarget;
      if (hit.dist < best.dist) {
        best = { ring: hit.ring, dist: hit.dist, x: current.x, y: current.y, preview: p };
      }

      if (ring === "miss") {
        if (hit.ring === "miss" && dist > 70) {
          best = { ring: "miss", dist: hit.dist, x: current.x, y: current.y, preview: p };
          await pointerUp(page, current.x, current.y, useTouch);
          return best;
        }
      } else if (hit.ring === ring) {
        await pointerUp(page, current.x, current.y, useTouch);
        return { ring: hit.ring, dist: hit.dist, x: current.x, y: current.y, preview: p };
      }
    }
  }

  await pointerUp(page, best.x, best.y, useTouch);
  return best;
}

async function waitForLanding(page) {
  const started = Date.now();
  while (Date.now() - started < 6000) {
    const s = await state(page);
    if (s.lastLanding && !s.arrowFlying) {
      await page.waitForTimeout(350);
      return s;
    }
    await page.waitForTimeout(50);
  }
  return state(page);
}

async function saveShot(page, testInfo, name) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const file = path.join(
    ARTIFACT_DIR,
    `${name}-${testInfo.project.name.replace(/\s+/g, "-")}.png`
  );
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

test.describe("Target Archery human-like ring hits", () => {
  test("hits 100, 50, 25, 10 and a miss from several bow positions", async ({ page }, testInfo) => {
    const useTouch = isIPhone(testInfo);
    await waitForGame(page);
    await startReady(page);

    const shots = [
      { ring: "bullseye", points: 100, bow: "center", name: "hit-100-bullseye" },
      { ring: "red", points: 50, bow: "left", name: "hit-50-red" },
      { ring: "blue", points: 25, bow: "right", name: "hit-25-blue" },
      { ring: "white", points: 10, bow: "center", name: "hit-10-white" },
      { ring: "miss", points: 0, bow: "left", name: "miss" },
    ];

    const results = [];

    for (const shot of shots) {
      await page.evaluate(() => window.__resetForTest());
      await page.evaluate(() => window.__freezeTarget());
      await page.evaluate((pos) => window.__moveBow(pos), shot.bow);
      await page.waitForTimeout(200);

      const before = await state(page);
      const aimed = await aimByPreview(page, shot.ring, useTouch);
      const after = await waitForLanding(page);
      const file = await saveShot(page, testInfo, shot.name);

      const landing = after.lastLanding;
      results.push({
        requested: shot.ring,
        bow: shot.bow,
        previewRing: aimed.ring,
        landing,
        score: after.score - before.score,
        screenshot: file,
      });

      console.log(
        `${testInfo.project.name} ${shot.ring} from ${shot.bow}: preview=${aimed.ring} landing=${landing && landing.ring} points=${landing && landing.points} file=${file}`
      );

      expect(landing, `expected a landing for ${shot.ring}`).toBeTruthy();
      expect(landing.ring).toBe(shot.ring);
      expect(landing.points).toBe(shot.points);
      expect(after.score - before.score).toBe(shot.points);
    }

    expect(results).toHaveLength(5);
  });
});

test.describe("Target Archery preview accuracy", () => {
  test("preview landing matches actual tip landing across 20 random shots", async ({ page }, testInfo) => {
    const useTouch = isIPhone(testInfo);
    await waitForGame(page);
    await startReady(page);

    const errors = [];
    const bows = ["left", "center", "right"];

    for (let i = 0; i < 20; i++) {
      await page.evaluate(() => window.__resetForTest());
      await page.evaluate(() => window.__freezeTarget());
      await page.evaluate((pos) => window.__moveBow(pos), bows[i % 3]);
      await page.waitForTimeout(120);

      const s = await state(page);
      const map = await canvasMap(page);
      const startCanvas = { x: s.canvasW * 0.44, y: s.canvasH * 0.6 };
      const start = toViewport(map, startCanvas.x, startCanvas.y);
      const angle = Math.atan2(s.target.y - s.bow.y, s.target.x - s.bow.x) + Math.PI + (Math.random() - 0.5) * 0.5;
      const dist = 70 + Math.random() * 110;
      const end = {
        x: start.x + Math.cos(angle) * dist,
        y: start.y + Math.sin(angle) * dist,
      };

      await pointerDown(page, start.x, start.y, useTouch);
      const steps = 8;
      for (let step = 1; step <= steps; step++) {
        const t = step / steps;
        await pointerMove(
          page,
          start.x + (end.x - start.x) * t,
          start.y + (end.y - start.y) * t,
          useTouch
        );
        await page.waitForTimeout(16);
      }

      const aimed = await preview(page);
      await pointerUp(page, end.x, end.y, useTouch);
      const after = await waitForLanding(page);

      if (!aimed || !after.lastLanding) {
        errors.push(999);
        continue;
      }

      const actual = after.lastLanding;
      const predicted = actual.ring === "miss"
        ? aimed.endpoint
        : (aimed.closestToTarget || aimed.endpoint);
      const err = Math.hypot(predicted.x - actual.x, predicted.y - actual.y);
      errors.push(err);
      console.log(`Shot ${i + 1} (${bows[i % 3]}): preview-actual error ${err.toFixed(1)}px`);
    }

    const avg = errors.reduce((a, b) => a + b, 0) / errors.length;
    const max = Math.max(...errors);
    console.log(`Average preview error: ${avg.toFixed(1)}px, max ${max.toFixed(1)}px`);
    await saveShot(page, testInfo, "preview-accuracy");

    expect(avg).toBeLessThan(8);
    expect(max).toBeLessThan(20);
  });
});
