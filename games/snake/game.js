/* ==========================================================================
   SNAKE  🐍
   The classic old-Nokia snake, made gentle and colourful for a 7-year-old.

   Rules
   -----
   - Steer the snake around a grid with the arrow keys, a swipe, or the D-pad.
   - Eat the blinking dot to grow one segment and score points.
   - The walls DON'T kill you: slide off one edge and you reappear on the
     opposite side (classic wrap-around).
   - Biting your own body ends the game.
   - The snake speeds up the longer you survive (and a touch faster as it grows).

   How it fits together
   --------------------
   1. CONFIG          - every tunable number (grid size, speed, scoring).
   2. Canvas setup    - fixed COLS*CELL x ROWS*CELL "world" scaled to the stage.
   3. State           - one `game` object holding everything that changes.
   4. Input           - arrows / WASD / swipe / D-pad all funnel into turn().
   5. step()          - advances the snake one grid cell (runs on a timer).
   6. draw()          - paints the board, food and snake every frame.
   7. Overlays, score, sound helpers.

   Built to match games/dino-runner - same shared chrome, same helper shapes.
   ========================================================================== */

(function () {
  "use strict";

  /* ======================================================================
     1. CONFIG — tweak these to make the game easier or harder
     ====================================================================== */
  const CONFIG = {
    // Grid. World size is COLS*CELL by ROWS*CELL (kept at a 3:2 shape).
    COLS: 24,
    ROWS: 16,
    CELL: 30,

    START_LENGTH: 3,

    // --- Levels & speed ---------------------------------------------------
    // A level is cleared by eating a set number of dots, and clearing a level
    // makes the snake one notch faster. The dots needed grow each level:
    //   Level 1: 5,  Level 2: 8,  Level 3: 10,  Level 4: 13,  Level 5: 15, ...
    // (see dotsToClearLevel() below). One "step" = the snake advances one cell;
    // a smaller step interval means a faster snake.
    LEVEL_BASE_DOTS: 5, // dots needed to clear level 1
    LEVEL_STEP_DOTS: 2.5, // added per level after that, rounded -> 5, 8, 10, 13...
    START_INTERVAL: 0.2, // seconds per step in level 1 (slow + forgiving)
    MIN_INTERVAL: 0.085, // fastest it will ever go, however high the level
    LEVEL_SPEEDUP: 0.9, // step interval is multiplied by this each level (~10% faster)
    BANNER_SECONDS: 1.8, // how long the "LEVEL UP!" banner stays on screen

    // --- Scoring ---
    POINTS_PER_FOOD: 10,

    STORAGE_BEST: "badri.snake.best",
    STORAGE_SOUND: "badri.snake.sound",
  };

  const DIRECTIONS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  /* --- Tiny maths helpers -------------------------------------------------- */
  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // Dots needed to advance FROM this level to the next: 5, 8, 10, 13, 15, 18...
  function dotsToClearLevel(level) {
    return Math.round(CONFIG.LEVEL_BASE_DOTS + CONFIG.LEVEL_STEP_DOTS * (level - 1));
  }

  // Step interval (seconds per move) for a given level — smaller = faster.
  // Each level shaves ~10% off, easing gently down to MIN_INTERVAL.
  function speedForLevel(level) {
    const interval = CONFIG.START_INTERVAL * Math.pow(CONFIG.LEVEL_SPEEDUP, level - 1);
    return Math.max(CONFIG.MIN_INTERVAL, interval);
  }

  /* ======================================================================
     2. CANVAS SETUP
     ====================================================================== */
  const WORLD_W = CONFIG.COLS * CONFIG.CELL;
  const WORLD_H = CONFIG.ROWS * CONFIG.CELL;

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const stage = document.getElementById("stage");
  const dpad = document.getElementById("dpad");

  /**
   * Match the canvas pixel buffer to its on-screen size (crisp on retina),
   * then scale the drawing context so all game code can keep using plain
   * world coordinates (0..WORLD_W, 0..WORLD_H).
   */
  function resizeCanvas() {
    const rect = stage.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(canvas.width / WORLD_W, 0, 0, canvas.height / WORLD_H, 0, 0);
    ctx.imageSmoothingEnabled = true;
  }

  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("orientationchange", resizeCanvas);
  if (window.ResizeObserver) new ResizeObserver(resizeCanvas).observe(stage);

  /* ======================================================================
     3. GAME STATE
     ====================================================================== */
  /** @type {"ready"|"running"|"paused"|"over"} */
  let phase = "ready";

  const game = {
    elapsed: 0, // seconds survived this run
    score: 0,
    best: loadBest(),
    level: 1,
    foodInLevel: 0, // dots eaten so far within the current level
    dotsToClear: dotsToClearLevel(1), // dots needed to reach the next level
    bannerTimer: 0, // counts down while the "LEVEL UP" banner shows
    bannerText: "",
    stepTimer: 0, // accumulates dt; when it passes the interval, we step
    stepInterval: speedForLevel(1),

    snake: [], // array of {x, y} grid cells; snake[0] is the head
    dir: DIRECTIONS.right, // current committed direction
    turnQueue: [], // buffered direction changes (max 2), applied one per step
    grow: 0, // segments still to add (so growth animates over a few steps)

    food: { x: 0, y: 0 },
    crashTimer: 0, // short pause between dying and the Game Over card
    eatFlash: 0, // brief flash timer when a dot is eaten
    particles: [], // celebration confetti on a new best
  };

  /* ======================================================================
     4. INPUT — arrows / WASD / swipe / D-pad all end up in turn()
     ====================================================================== */
  const KEY_DIRS = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    w: "up",
    W: "up",
    s: "down",
    S: "down",
    a: "left",
    A: "left",
    d: "right",
    D: "right",
  };

  document.addEventListener("keydown", function (event) {
    // If a button or link is focused, let the browser handle the key.
    const onButton =
      document.activeElement &&
      (document.activeElement.tagName === "BUTTON" || document.activeElement.tagName === "A");

    const dirName = KEY_DIRS[event.key];
    if (!dirName) return;
    if (onButton && (event.key === "Enter" || event.key === " ")) return;

    event.preventDefault(); // stop arrow keys scrolling the page
    handleDirectionInput(dirName);
  });

  // --- D-pad buttons -------------------------------------------------------
  dpad.addEventListener("pointerdown", function (event) {
    const button = event.target.closest("[data-dir]");
    if (!button) return;
    event.preventDefault();
    button.classList.add("is-active");
    handleDirectionInput(button.getAttribute("data-dir"));
  });
  dpad.addEventListener("pointerup", clearDpadActive);
  dpad.addEventListener("pointercancel", clearDpadActive);
  dpad.addEventListener("pointerleave", clearDpadActive);
  // Keep the keyboard on the game rather than trapping it on a D-pad button.
  dpad.addEventListener("click", function (event) {
    const button = event.target.closest("[data-dir]");
    if (button) button.blur();
  });

  function clearDpadActive() {
    for (const b of dpad.querySelectorAll(".dpad__btn")) b.classList.remove("is-active");
  }

  // --- Swipe on the board --------------------------------------------------
  let swipeStart = null;

  stage.addEventListener("pointerdown", function (event) {
    if (event.target.closest("button, a")) return; // let overlay buttons work
    swipeStart = { x: event.clientX, y: event.clientY };
  });

  stage.addEventListener("pointerup", function (event) {
    if (!swipeStart) return;
    const dx = event.clientX - swipeStart.x;
    const dy = event.clientY - swipeStart.y;
    swipeStart = null;

    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    // A tap (no real movement) just starts the game if we're on the menu.
    if (absX < 24 && absY < 24) {
      if (phase === "ready") startRun();
      return;
    }
    handleDirectionInput(absX > absY ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
  });

  /**
   * Turn the snake. The first input also kicks off the run. Turns are queued
   * (up to two) and validated at step time so you can't reverse into yourself
   * and a quick double-tap round a corner still registers.
   */
  function handleDirectionInput(dirName) {
    resumeAudio();

    if (phase === "ready") {
      startRun();
      queueTurn(dirName);
      return;
    }
    if (phase === "paused") {
      resumeRun();
      return;
    }
    if (phase !== "running") return;

    queueTurn(dirName);
  }

  function queueTurn(dirName) {
    if (game.turnQueue.length >= 2) return;
    game.turnQueue.push(dirName);
  }

  /* ======================================================================
     5. RUN LIFECYCLE
     ====================================================================== */
  function startRun() {
    game.elapsed = 0;
    game.score = 0;
    game.level = 1;
    game.foodInLevel = 0;
    game.dotsToClear = dotsToClearLevel(1);
    game.bannerTimer = 0;
    game.stepTimer = 0;
    game.stepInterval = speedForLevel(1);
    game.dir = DIRECTIONS.right;
    game.turnQueue.length = 0;
    game.grow = 0;
    game.crashTimer = 0;
    game.eatFlash = 0;
    game.particles.length = 0;

    // Start the snake in the middle, laid out horizontally, facing right.
    game.snake = [];
    const midY = Math.floor(CONFIG.ROWS / 2);
    const startX = Math.floor(CONFIG.COLS / 3);
    for (let i = 0; i < CONFIG.START_LENGTH; i++) {
      game.snake.push({ x: startX - i, y: midY });
    }

    placeFood();

    hideOverlay(startOverlay);
    hideOverlay(pauseOverlay);
    hideOverlay(gameOverOverlay);
    updateScoreDisplay();
    phase = "running";
  }

  function pauseRun() {
    if (phase !== "running") return;
    phase = "paused";
    showOverlay(pauseOverlay);
  }

  function resumeRun() {
    if (phase !== "paused") return;
    hideOverlay(pauseOverlay);
    phase = "running";
  }

  function endRun(won) {
    phase = "over";
    game.crashTimer = 0;
    playCrash();

    const finalScore = game.score;
    const isNewBest = finalScore > game.best;
    if (isNewBest) {
      game.best = finalScore;
      saveBest(finalScore);
      spawnConfetti();
      playFanfare();
    }

    finalScoreEl.textContent = finalScore;
    finalBestEl.textContent = game.best;
    finalLevelEl.textContent = game.level;
    finalLengthEl.textContent = game.snake.length;
    gameOverTitle.textContent = won ? "You filled the board!" : "Oops!";
    gameOverEmoji.textContent = won ? "🏆" : isNewBest ? "🏆" : "🐍";
    newBestBanner.classList.toggle("is-hidden", !isNewBest);
    updateScoreDisplay();

    // Let the crash register for a beat before covering the board.
    setTimeout(function () {
      if (phase === "over") showOverlay(gameOverOverlay);
    }, 480);
  }

  /* ======================================================================
     6. UPDATE — timers advance every frame; the snake moves on a step timer
     ====================================================================== */
  function update(dt) {
    updateParticles(dt);
    if (game.eatFlash > 0) game.eatFlash -= dt;
    if (game.bannerTimer > 0) game.bannerTimer -= dt;

    if (phase === "over") {
      game.crashTimer += dt;
      return;
    }
    if (phase !== "running") return;

    game.elapsed += dt;

    // Fixed-step movement: advance one cell each time the timer fills up.
    // Capped so a slow frame can't process a huge burst of steps at once.
    game.stepTimer += dt;
    let steps = 0;
    while (game.stepTimer >= game.stepInterval && steps < 4) {
      game.stepTimer -= game.stepInterval;
      step();
      steps++;
      if (phase !== "running") break; // died mid-step
    }
    updateScoreDisplay();
  }

  /** Clearing a level's dot quota bumps the level and speeds the snake up. */
  function levelUp() {
    game.level += 1;
    game.foodInLevel = 0;
    game.dotsToClear = dotsToClearLevel(game.level);
    game.stepInterval = speedForLevel(game.level);
    game.bannerTimer = CONFIG.BANNER_SECONDS;
    game.bannerText = "LEVEL " + game.level + "!";
    levelChip.classList.remove("is-levelling");
    void levelChip.offsetWidth; // restart the CSS pulse
    levelChip.classList.add("is-levelling");
    playLevelUp();
  }

  /** Advance the snake by exactly one cell. */
  function step() {
    // Apply the next buffered turn if it isn't a straight reversal.
    while (game.turnQueue.length) {
      const next = DIRECTIONS[game.turnQueue.shift()];
      if (next.x === -game.dir.x && next.y === -game.dir.y) continue; // no U-turns
      if (next.x === game.dir.x && next.y === game.dir.y) continue; // no-op
      game.dir = next;
      break;
    }

    // New head, wrapping around the edges (walls don't kill).
    const head = game.snake[0];
    const nx = (head.x + game.dir.x + CONFIG.COLS) % CONFIG.COLS;
    const ny = (head.y + game.dir.y + CONFIG.ROWS) % CONFIG.ROWS;

    const eating = nx === game.food.x && ny === game.food.y;

    // Self-collision. When not growing, the tail cell is about to move away,
    // so bumping the current tail is allowed - that's standard snake.
    const ignoreTail = !eating && game.grow === 0;
    const lastIndex = game.snake.length - 1;
    for (let i = 0; i < game.snake.length; i++) {
      if (ignoreTail && i === lastIndex) continue;
      if (game.snake[i].x === nx && game.snake[i].y === ny) {
        endRun(false);
        return;
      }
    }

    game.snake.unshift({ x: nx, y: ny });

    if (eating) {
      game.score += CONFIG.POINTS_PER_FOOD;
      game.grow += 1; // keep this new head; grow by one segment
      game.eatFlash = 0.25;
      game.foodInLevel += 1;
      if (game.foodInLevel >= game.dotsToClear) levelUp();
      playEat();
      if (!placeFood()) {
        endRun(true); // board is completely full - a win!
        return;
      }
    }

    if (game.grow > 0) {
      game.grow -= 1; // growing: don't drop the tail this step
    } else {
      game.snake.pop(); // normal move: tail follows the head
    }
  }

  /**
   * Drop the food on a random empty cell. Returns false if the board is full
   * (no empty cell left), which means the player has won.
   */
  function placeFood() {
    const occupied = new Set();
    for (const seg of game.snake) occupied.add(seg.x + "," + seg.y);
    if (occupied.size >= CONFIG.COLS * CONFIG.ROWS) return false;

    let x, y;
    do {
      x = Math.floor(Math.random() * CONFIG.COLS);
      y = Math.floor(Math.random() * CONFIG.ROWS);
    } while (occupied.has(x + "," + y));

    game.food.x = x;
    game.food.y = y;
    return true;
  }

  /* --- Effects ------------------------------------------------------------- */
  function spawnConfetti() {
    const colors = ["#ff4d4d", "#ffd60a", "#2ec46a", "#2d9cff", "#9b5de5", "#ff5ea8"];
    for (let i = 0; i < 90; i++) {
      game.particles.push({
        x: Math.random() * WORLD_W,
        y: -20 - Math.random() * 160,
        vx: -40 + Math.random() * 80,
        vy: 80 + Math.random() * 150,
        size: 6 + Math.random() * 8,
        life: 2.6,
        maxLife: 2.6,
        color: colors[i % colors.length],
        spin: -6 + Math.random() * 12,
        angle: Math.random() * Math.PI,
      });
    }
  }

  function updateParticles(dt) {
    for (let i = game.particles.length - 1; i >= 0; i--) {
      const p = game.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        game.particles.splice(i, 1);
        continue;
      }
      p.vy += 60 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt;
    }
  }

  /* ======================================================================
     7. DRAW
     ====================================================================== */
  function draw() {
    drawBoard();
    drawFood();
    drawSnake();
    drawParticles();
    drawLevelBanner();
  }

  /** Big friendly "LEVEL 2!" banner across the board on each level up. */
  function drawLevelBanner() {
    if (game.bannerTimer <= 0) return;
    const age = CONFIG.BANNER_SECONDS - game.bannerTimer;
    const pop = clamp(age / 0.2, 0, 1); // grow in
    const fade = clamp(game.bannerTimer / 0.4, 0, 1); // fade out

    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(WORLD_W / 2, WORLD_H * 0.4);
    ctx.scale(0.7 + pop * 0.3, 0.7 + pop * 0.3);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.font = '800 64px "Comic Sans MS", "Trebuchet MS", system-ui, sans-serif';
    ctx.lineWidth = 12;
    ctx.strokeStyle = "#ffffff";
    ctx.strokeText(game.bannerText, 0, 0);
    ctx.fillStyle = "#16c8c8";
    ctx.fillText(game.bannerText, 0, 0);
    ctx.restore();
  }

  /** Soft checkerboard so each grid cell is easy for young eyes to read. */
  function drawBoard() {
    ctx.fillStyle = "#bff0c9";
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    ctx.fillStyle = "#b2ecbf";
    for (let cy = 0; cy < CONFIG.ROWS; cy++) {
      for (let cx = 0; cx < CONFIG.COLS; cx++) {
        if ((cx + cy) % 2 === 0) {
          ctx.fillRect(cx * CONFIG.CELL, cy * CONFIG.CELL, CONFIG.CELL, CONFIG.CELL);
        }
      }
    }
  }

  /** The blinking dot the snake is chasing. */
  function drawFood() {
    const cell = CONFIG.CELL;
    const cx = game.food.x * cell + cell / 2;
    const cy = game.food.y * cell + cell / 2;

    // Blink: pulse size and brightness with a sine wave.
    const blink = 0.5 + 0.5 * Math.sin(performance.now() / 140);
    const radius = cell * 0.3 * (0.82 + blink * 0.18);

    ctx.save();
    // Glow halo.
    ctx.globalAlpha = 0.35 + blink * 0.35;
    ctx.fillStyle = "#ff6b6b";
    circle(cx, cy, radius * 1.7);

    // Main dot.
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ff3b3b";
    circle(cx, cy, radius);

    // Shine.
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    circle(cx - radius * 0.3, cy - radius * 0.32, radius * 0.34);
    ctx.restore();
  }

  function drawSnake() {
    const cell = CONFIG.CELL;
    const pad = 2;
    const size = cell - pad * 2;
    const radius = size * 0.34;
    const len = game.snake.length;

    // Draw tail-first so the head sits on top of its neighbour.
    for (let i = len - 1; i >= 0; i--) {
      const seg = game.snake[i];
      const x = seg.x * cell + pad;
      const y = seg.y * cell + pad;

      // Colour fades from a bright head green to a deeper tail green.
      const t = len > 1 ? i / (len - 1) : 0;
      ctx.fillStyle = i === 0 ? "#1f8f45" : mixGreen(t);
      roundRect(x, y, size, size, radius);
      ctx.fill();

      if (i === 0) drawHeadFace(x, y, size);
    }
  }

  /** Two eyes (and a happy blush) on the head, oriented to face the direction. */
  function drawHeadFace(x, y, size) {
    const dir = game.dir;
    const cx = x + size / 2;
    const cy = y + size / 2;
    const eyeOffset = size * 0.22;
    const eyeR = size * 0.14;
    const pupilR = eyeR * 0.55;

    // Perpendicular axis to place the two eyes side by side.
    const perpX = dir.y !== 0 ? 1 : 0;
    const perpY = dir.x !== 0 ? 1 : 0;
    // Push the eyes toward the front of the head.
    const fx = cx + dir.x * eyeOffset;
    const fy = cy + dir.y * eyeOffset;

    for (const s of [-1, 1]) {
      const ex = fx + perpX * s * eyeOffset;
      const ey = fy + perpY * s * eyeOffset;
      ctx.fillStyle = "#ffffff";
      circle(ex, ey, eyeR);
      ctx.fillStyle = "#1f2a44";
      circle(ex + dir.x * eyeR * 0.3, ey + dir.y * eyeR * 0.3, pupilR);
    }

    // A little tongue flick toward where it's heading, brighter while eating.
    ctx.strokeStyle = game.eatFlash > 0 ? "#ffd60a" : "#ff5ea8";
    ctx.lineWidth = size * 0.08;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx + dir.x * size * 0.35, cy + dir.y * size * 0.35);
    ctx.lineTo(cx + dir.x * size * 0.6, cy + dir.y * size * 0.6);
    ctx.stroke();
  }

  function mixGreen(t) {
    // t: 0 near head, 1 at tail.
    const r = Math.round(lerp(46, 24, t));
    const g = Math.round(lerp(196, 140, t));
    const b = Math.round(lerp(106, 74, t));
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function drawParticles() {
    for (const p of game.particles) {
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
  }

  /* --- Canvas shape helpers ------------------------------------------------ */
  function circle(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /* ======================================================================
     8. MAIN LOOP
     ====================================================================== */
  let lastTime = 0;

  function loop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    // Clamp dt so a slow frame (or a tab switch) can't fast-forward the snake.
    const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
    lastTime = timestamp;

    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  /* ======================================================================
     9. OVERLAYS + SCORE DISPLAY
     ====================================================================== */
  const startOverlay = document.getElementById("startOverlay");
  const pauseOverlay = document.getElementById("pauseOverlay");
  const gameOverOverlay = document.getElementById("gameOverOverlay");
  const scoreValueEl = document.getElementById("scoreValue");
  const bestValueEl = document.getElementById("bestValue");
  const levelValueEl = document.getElementById("levelValue");
  const levelChip = document.getElementById("levelChip");
  const finalScoreEl = document.getElementById("finalScore");
  const finalBestEl = document.getElementById("finalBest");
  const finalLevelEl = document.getElementById("finalLevel");
  const finalLengthEl = document.getElementById("finalLength");
  const newBestBanner = document.getElementById("newBestBanner");
  const gameOverEmoji = document.getElementById("gameOverEmoji");
  const gameOverTitle = document.getElementById("gameOverTitle");

  function showOverlay(el) {
    el.classList.remove("is-hidden");
  }
  function hideOverlay(el) {
    el.classList.add("is-hidden");
  }

  // Only touch the DOM when a number actually changes, not every frame.
  let shownScore = -1;
  let shownBest = -1;
  let shownLevel = -1;

  function updateScoreDisplay() {
    if (game.score !== shownScore) {
      shownScore = game.score;
      scoreValueEl.textContent = game.score;
    }
    if (game.best !== shownBest) {
      shownBest = game.best;
      bestValueEl.textContent = game.best;
    }
    if (game.level !== shownLevel) {
      shownLevel = game.level;
      levelValueEl.textContent = game.level;
    }
  }

  document.getElementById("startButton").addEventListener("click", function () {
    resumeAudio();
    startRun();
  });
  document.getElementById("playAgainButton").addEventListener("click", function () {
    resumeAudio();
    startRun();
  });
  document.getElementById("resumeButton").addEventListener("click", function () {
    resumeAudio();
    resumeRun();
  });

  // Auto-pause if the tab is hidden or the window loses focus.
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) pauseRun();
    lastTime = 0;
  });
  window.addEventListener("blur", pauseRun);

  /* --- Best score in localStorage ----------------------------------------- */
  function loadBest() {
    try {
      const saved = parseInt(window.localStorage.getItem(CONFIG.STORAGE_BEST), 10);
      return Number.isFinite(saved) && saved > 0 ? saved : 0;
    } catch (err) {
      return 0; // private mode / storage blocked - just play without a best
    }
  }

  function saveBest(value) {
    try {
      window.localStorage.setItem(CONFIG.STORAGE_BEST, String(value));
    } catch (err) {
      /* ignore - not being able to save isn't worth interrupting the game */
    }
  }

  /* ======================================================================
     10. SOUND — tiny beeps made with the Web Audio API (no audio files)
     ====================================================================== */
  const soundButton = document.getElementById("soundButton");
  let soundOn = loadSoundPref();
  let audioCtx = null;

  function loadSoundPref() {
    try {
      return window.localStorage.getItem(CONFIG.STORAGE_SOUND) !== "off";
    } catch (err) {
      return true;
    }
  }

  function renderSoundButton() {
    soundButton.textContent = soundOn ? "🔊" : "🔇";
    soundButton.setAttribute("aria-pressed", String(soundOn));
    soundButton.setAttribute("aria-label", soundOn ? "Sound is on" : "Sound is off");
  }

  soundButton.addEventListener("click", function () {
    soundButton.blur(); // hand the keyboard back to the game
    soundOn = !soundOn;
    try {
      window.localStorage.setItem(CONFIG.STORAGE_SOUND, soundOn ? "on" : "off");
    } catch (err) {
      /* ignore */
    }
    renderSoundButton();
    if (soundOn) {
      resumeAudio();
      playEat();
    }
  });

  /** Browsers only allow audio after a user gesture, so create it lazily. */
  function resumeAudio() {
    if (!soundOn) return;
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      if (!audioCtx) audioCtx = new AudioCtor();
      if (audioCtx.state === "suspended") audioCtx.resume();
    } catch (err) {
      audioCtx = null;
    }
  }

  function tone(startFreq, endFreq, duration, type, volume) {
    if (!soundOn || !audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), now + duration);
    gain.gain.setValueAtTime(volume || 0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function playEat() {
    tone(660, 990, 0.1, "square", 0.06);
  }
  function playLevelUp() {
    tone(660, 990, 0.12, "triangle", 0.07);
    setTimeout(function () {
      tone(880, 1180, 0.16, "triangle", 0.07);
    }, 110);
  }
  function playCrash() {
    tone(300, 70, 0.42, "sawtooth", 0.11);
  }
  function playFanfare() {
    if (!soundOn || !audioCtx) return;
    const notes = [523, 659, 784, 1047];
    notes.forEach(function (freq, i) {
      setTimeout(function () {
        tone(freq, freq * 1.02, 0.22, "triangle", 0.09);
      }, i * 130);
    });
  }

  /* ======================================================================
     11. BOOT
     ====================================================================== */
  resizeCanvas();
  renderSoundButton();
  updateScoreDisplay();
  // Draw one frame so the board is visible behind the Start card.
  startRun();
  phase = "ready";
  showOverlay(startOverlay);
  requestAnimationFrame(loop);
})();
