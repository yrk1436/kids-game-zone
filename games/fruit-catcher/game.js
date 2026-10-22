/* ==========================================================================
   FRUIT CATCHER  🍎
   Slide a basket along the bottom and catch the fruit tumbling from the sky.
   Made gentle and colourful for a 7-year-old.

   Rules
   -----
   - Move the basket left/right with the arrow keys, by dragging, or the
     on-screen buttons.
   - Catch a piece of fruit: +10 points (a golden star is worth +30).
   - Drop a piece of fruit: you lose one of your three baskets (lives).
   - Lose all three baskets and the game ends.
   - Every level the fruit falls a little faster and a little more often. The
     level goes up after you catch a growing number of fruit (5, 8, 10, 13...).

   How it fits together
   --------------------
   1. CONFIG          - every tunable number (sizes, speed, scoring).
   2. Canvas setup    - a fixed 3:2 "world" scaled to the stage.
   3. State           - one `game` object holding everything that changes.
   4. Input           - arrows / A,D / drag / on-screen buttons -> basket move.
   5. update()        - moves the basket & fruit, handles catches and misses.
   6. draw()          - paints sky, fruit, basket, lives and effects.
   7. Overlays, score, sound helpers.

   Built to match games/dino-runner and games/snake - same shared chrome.
   ========================================================================== */

(function () {
  "use strict";

  /* ======================================================================
     1. CONFIG — tweak these to make the game easier or harder
     ====================================================================== */
  const CONFIG = {
    // World size (a 3:2 box). All game maths uses these coordinates.
    WORLD_W: 720,
    WORLD_H: 480,

    // Basket -------------------------------------------------------------
    BASKET_W: 128, // catch width (a touch narrower than the drawn basket)
    BASKET_H: 78,
    BASKET_BOTTOM_GAP: 16, // gap between basket and the bottom edge
    // Keyboard / button steering uses a gentle velocity model so a quick tap
    // nudges a little and a longer hold ramps up - much easier to line up under
    // a falling fruit than snapping instantly to full speed.
    BASKET_MAX_SPEED: 680, // px/sec top speed when a key is held down
    BASKET_ACCEL: 2200, // px/sec^2 ramp-up while a key is held (~0.3s to top)
    BASKET_FRICTION: 3400, // px/sec^2 ease-to-stop when no key is held
    BASKET_TURN_BOOST: 2.4, // extra accel when reversing, so direction flips feel snappy

    LIVES: 3,

    // Fruit --------------------------------------------------------------
    FRUIT_SIZE: 52,
    START_FALL: 135, // px/sec fall speed in level 1 (slow + forgiving)
    FALL_MAX: 360, // fastest fall speed, however high the level
    FALL_GROWTH: 1.12, // fall speed is multiplied by this each level (~12% faster)
    START_SPAWN: 1.5, // seconds between drops in level 1
    SPAWN_MIN: 0.6, // shortest gap between drops, however high the level
    SPAWN_DECAY: 0.9, // spawn gap is multiplied by this each level (~10% quicker)
    STAR_CHANCE: 0.12, // chance a drop is a bonus golden star

    // Levels -------------------------------------------------------------
    //   Level 1: 5,  Level 2: 8,  Level 3: 10,  Level 4: 13, ...
    LEVEL_BASE_CATCHES: 5,
    LEVEL_STEP_CATCHES: 2.5, // rounded -> 5, 8, 10, 13, 15, 18...
    BANNER_SECONDS: 1.8,

    // Scoring ------------------------------------------------------------
    POINTS_PER_FRUIT: 10,
    POINTS_PER_STAR: 30,

    STORAGE_BEST: "badri.fruitcatcher.best",
    STORAGE_SOUND: "badri.fruitcatcher.sound",
  };

  // The fruit that can fall (plain emoji, no image files needed).
  const FRUITS = ["🍎", "🍊", "🍋", "🍇", "🍓", "🍌", "🍉", "🍑", "🥝", "🍒"];
  const STAR = "⭐";

  /* --- Tiny maths helpers -------------------------------------------------- */
  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  // Catches needed to advance FROM this level to the next: 5, 8, 10, 13...
  function catchesToClearLevel(level) {
    return Math.round(CONFIG.LEVEL_BASE_CATCHES + CONFIG.LEVEL_STEP_CATCHES * (level - 1));
  }

  function fallSpeedForLevel(level) {
    const speed = CONFIG.START_FALL * Math.pow(CONFIG.FALL_GROWTH, level - 1);
    return Math.min(CONFIG.FALL_MAX, speed);
  }

  function spawnGapForLevel(level) {
    const gap = CONFIG.START_SPAWN * Math.pow(CONFIG.SPAWN_DECAY, level - 1);
    return Math.max(CONFIG.SPAWN_MIN, gap);
  }

  /* ======================================================================
     2. CANVAS SETUP
     ====================================================================== */
  const WORLD_W = CONFIG.WORLD_W;
  const WORLD_H = CONFIG.WORLD_H;
  const GROUND_Y = WORLD_H - 46; // grass line the basket rests on
  const BASKET_TOP = WORLD_H - CONFIG.BASKET_BOTTOM_GAP - CONFIG.BASKET_H;

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const stage = document.getElementById("stage");
  const mover = document.getElementById("mover");

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
    score: 0,
    best: loadBest(),
    level: 1,
    lives: CONFIG.LIVES,
    catchesInLevel: 0, // fruit caught so far within the current level
    catchesToClear: catchesToClearLevel(1),

    bannerTimer: 0, // counts down while the "LEVEL UP" banner shows
    bannerText: "",

    basketX: WORLD_W / 2, // centre x of the basket
    basketVX: 0, // current basket velocity (px/sec) from keys / buttons
    moveDir: 0, // -1 left, 0 still, +1 right (from keys / buttons)
    dragging: false, // true while a finger / mouse is dragging the basket
    dragX: 0, // target x while dragging

    fallSpeed: fallSpeedForLevel(1),
    spawnGap: spawnGapForLevel(1),
    spawnTimer: 0.6, // time until the next drop
    fruits: [], // active falling items {x, y, emoji, isStar, rot, spin}

    shakeTimer: 0, // brief screen shake when a fruit is dropped
    particles: [], // catch sparkles + celebration confetti
    popups: [], // little floating "+10" score numbers
  };

  /* ======================================================================
     4. INPUT — keys / on-screen buttons / drag all steer the basket
     ====================================================================== */
  const leftKeys = { ArrowLeft: true, a: true, A: true };
  const rightKeys = { ArrowRight: true, d: true, D: true };
  let leftHeld = false;
  let rightHeld = false;

  function refreshMoveDir() {
    game.moveDir = (rightHeld ? 1 : 0) - (leftHeld ? 1 : 0);
  }

  document.addEventListener("keydown", function (event) {
    const onButton =
      document.activeElement &&
      (document.activeElement.tagName === "BUTTON" || document.activeElement.tagName === "A");

    // Space / Enter shouldn't be hijacked while a button is focused.
    if ((event.key === " " || event.key === "Enter") && onButton) return;

    if (leftKeys[event.key] || rightKeys[event.key]) {
      event.preventDefault();
      if (leftKeys[event.key]) leftHeld = true;
      if (rightKeys[event.key]) rightHeld = true;
      refreshMoveDir();
      game.dragging = false; // keys take over from a drag
      handleFirstInput();
    } else if (event.key === " " || event.key === "Enter") {
      // A tap of space/enter on the board (not a button) starts / resumes.
      if (phase === "ready") {
        event.preventDefault();
        startRun();
      } else if (phase === "paused") {
        event.preventDefault();
        resumeRun();
      }
    }
  });

  document.addEventListener("keyup", function (event) {
    if (leftKeys[event.key]) leftHeld = false;
    if (rightKeys[event.key]) rightHeld = false;
    refreshMoveDir();
  });

  // --- On-screen move buttons (hold to move) -------------------------------
  mover.addEventListener("pointerdown", function (event) {
    const button = event.target.closest("[data-dir]");
    if (!button) return;
    event.preventDefault();
    button.setPointerCapture && button.setPointerCapture(event.pointerId);
    button.classList.add("is-active");
    if (button.getAttribute("data-dir") === "left") leftHeld = true;
    else rightHeld = true;
    refreshMoveDir();
    game.dragging = false;
    handleFirstInput();
  });

  function releaseMover(event) {
    const button = event.target.closest("[data-dir]");
    if (!button) return;
    button.classList.remove("is-active");
    if (button.getAttribute("data-dir") === "left") leftHeld = false;
    else rightHeld = false;
    refreshMoveDir();
  }
  mover.addEventListener("pointerup", releaseMover);
  mover.addEventListener("pointercancel", releaseMover);
  mover.addEventListener("pointerleave", releaseMover);
  // Keep the keyboard focused on the game, not a mover button.
  mover.addEventListener("click", function (event) {
    const button = event.target.closest("[data-dir]");
    if (button) button.blur();
  });

  // --- Drag / tap on the board itself --------------------------------------
  function stageXToWorld(clientX) {
    const rect = stage.getBoundingClientRect();
    return clamp(((clientX - rect.left) / rect.width) * WORLD_W, 0, WORLD_W);
  }

  stage.addEventListener("pointerdown", function (event) {
    if (event.target.closest("button, a")) return; // let overlay buttons work
    handleFirstInput();
    if (phase !== "running") return;
    event.preventDefault();
    stage.setPointerCapture && stage.setPointerCapture(event.pointerId);
    game.dragging = true;
    game.dragX = stageXToWorld(event.clientX);
  });

  stage.addEventListener("pointermove", function (event) {
    if (!game.dragging || phase !== "running") return;
    game.dragX = stageXToWorld(event.clientX);
  });

  function endDrag() {
    game.dragging = false;
  }
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);

  /** The very first input on the menu kicks off the run. */
  function handleFirstInput() {
    resumeAudio();
    if (phase === "ready") startRun();
    else if (phase === "paused") resumeRun();
  }

  /* ======================================================================
     5. RUN LIFECYCLE
     ====================================================================== */
  function startRun() {
    game.score = 0;
    game.level = 1;
    game.lives = CONFIG.LIVES;
    game.catchesInLevel = 0;
    game.catchesToClear = catchesToClearLevel(1);
    game.bannerTimer = 0;
    game.basketX = WORLD_W / 2;
    game.basketVX = 0;
    game.moveDir = 0;
    game.dragging = false;
    game.fallSpeed = fallSpeedForLevel(1);
    game.spawnGap = spawnGapForLevel(1);
    game.spawnTimer = 0.6;
    game.fruits.length = 0;
    game.shakeTimer = 0;
    game.particles.length = 0;
    game.popups.length = 0;
    leftHeld = rightHeld = false;

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

  function endRun() {
    phase = "over";
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
    gameOverEmoji.textContent = isNewBest ? "🏆" : "🍂";
    newBestBanner.classList.toggle("is-hidden", !isNewBest);
    updateScoreDisplay();

    // Let the last drop register for a beat before covering the board.
    setTimeout(function () {
      if (phase === "over") showOverlay(gameOverOverlay);
    }, 480);
  }

  /** Catching enough fruit bumps the level and speeds the fruit up. */
  function levelUp() {
    game.level += 1;
    game.catchesInLevel = 0;
    game.catchesToClear = catchesToClearLevel(game.level);
    game.fallSpeed = fallSpeedForLevel(game.level);
    game.spawnGap = spawnGapForLevel(game.level);
    game.bannerTimer = CONFIG.BANNER_SECONDS;
    game.bannerText = "LEVEL " + game.level + "!";
    levelChip.classList.remove("is-levelling");
    void levelChip.offsetWidth; // restart the CSS pulse
    levelChip.classList.add("is-levelling");
    playLevelUp();
  }

  /* ======================================================================
     6. UPDATE
     ====================================================================== */
  function update(dt) {
    updateParticles(dt);
    updatePopups(dt);
    if (game.bannerTimer > 0) game.bannerTimer -= dt;
    if (game.shakeTimer > 0) game.shakeTimer -= dt;

    if (phase !== "running") return;

    moveBasket(dt);
    spawnFruit(dt);
    moveFruit(dt);
    updateScoreDisplay();
  }

  function moveBasket(dt) {
    const half = CONFIG.BASKET_W / 2;

    if (game.dragging) {
      // Dragging is already precise: follow the finger directly and don't let
      // any leftover key momentum fight it.
      game.basketX += (game.dragX - game.basketX) * Math.min(1, dt * 18);
      game.basketVX = 0;
    } else if (game.moveDir !== 0) {
      // Held key/button: accelerate toward top speed. A quick tap only builds a
      // little velocity (small nudge); holding ramps up smoothly. Reversing gets
      // an extra push so flipping direction still feels responsive.
      const reversing = game.basketVX !== 0 && Math.sign(game.basketVX) !== game.moveDir;
      const accel = CONFIG.BASKET_ACCEL * (reversing ? CONFIG.BASKET_TURN_BOOST : 1);
      game.basketVX += game.moveDir * accel * dt;
      game.basketVX = clamp(game.basketVX, -CONFIG.BASKET_MAX_SPEED, CONFIG.BASKET_MAX_SPEED);
      game.basketX += game.basketVX * dt;
    } else {
      // Nothing held: ease to a stop with friction (a short glide, no drift).
      const drop = CONFIG.BASKET_FRICTION * dt;
      if (game.basketVX > drop) game.basketVX -= drop;
      else if (game.basketVX < -drop) game.basketVX += drop;
      else game.basketVX = 0;
      game.basketX += game.basketVX * dt;
    }

    // Keep the basket on-screen, and stop dead at a wall (no invisible bounce).
    if (game.basketX < half) {
      game.basketX = half;
      game.basketVX = 0;
    } else if (game.basketX > WORLD_W - half) {
      game.basketX = WORLD_W - half;
      game.basketVX = 0;
    }
  }

  function spawnFruit(dt) {
    game.spawnTimer -= dt;
    if (game.spawnTimer > 0) return;
    game.spawnTimer += game.spawnGap;

    const isStar = Math.random() < CONFIG.STAR_CHANCE;
    const margin = CONFIG.FRUIT_SIZE;
    game.fruits.push({
      x: margin + Math.random() * (WORLD_W - margin * 2),
      y: -CONFIG.FRUIT_SIZE,
      emoji: isStar ? STAR : FRUITS[(Math.random() * FRUITS.length) | 0],
      isStar: isStar,
      rot: 0,
      spin: -1.4 + Math.random() * 2.8, // gentle tumble
    });
  }

  function moveFruit(dt) {
    const half = CONFIG.BASKET_W / 2;
    const r = CONFIG.FRUIT_SIZE / 2;

    for (let i = game.fruits.length - 1; i >= 0; i--) {
      const f = game.fruits[i];
      f.y += game.fallSpeed * dt;
      f.rot += f.spin * dt;

      // Caught? Overlap the fruit box with the basket's catch box.
      const overlapX = Math.abs(f.x - game.basketX) <= half + r * 0.5;
      const overlapY = f.y + r >= BASKET_TOP && f.y - r <= BASKET_TOP + CONFIG.BASKET_H * 0.7;
      if (overlapX && overlapY) {
        catchFruit(f);
        game.fruits.splice(i, 1);
        continue;
      }

      // Dropped? It fell below the ground without being caught.
      if (f.y - r > WORLD_H) {
        game.fruits.splice(i, 1);
        dropFruit(f);
        if (game.lives <= 0) {
          endRun();
          return;
        }
      }
    }
  }

  function catchFruit(f) {
    const points = f.isStar ? CONFIG.POINTS_PER_STAR : CONFIG.POINTS_PER_FRUIT;
    game.score += points;
    game.catchesInLevel += 1;
    spawnSparkles(f.x, BASKET_TOP, f.isStar);
    game.popups.push({
      x: game.basketX,
      y: BASKET_TOP - 6,
      text: "+" + points,
      life: 0.9,
      maxLife: 0.9,
      color: f.isStar ? "#f5a300" : "#2ec46a",
    });
    if (f.isStar) playStar();
    else playCatch();
    if (game.catchesInLevel >= game.catchesToClear) levelUp();
  }

  function dropFruit(f) {
    game.lives -= 1;
    game.shakeTimer = 0.35;
    playDrop();
  }

  /* --- Effects ------------------------------------------------------------- */
  function spawnSparkles(x, y, isStar) {
    const colors = isStar
      ? ["#ffd60a", "#ffe98a", "#fff3c0"]
      : ["#2ec46a", "#a8f0c0", "#ffffff"];
    const count = isStar ? 18 : 10;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 160;
      game.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        size: 4 + Math.random() * 6,
        life: 0.6 + Math.random() * 0.3,
        maxLife: 0.9,
        color: colors[i % colors.length],
        spin: -6 + Math.random() * 12,
        angle: Math.random() * Math.PI,
        gravity: 260,
      });
    }
  }

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
        gravity: 60,
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
      p.vy += (p.gravity || 200) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt;
    }
  }

  function updatePopups(dt) {
    for (let i = game.popups.length - 1; i >= 0; i--) {
      const p = game.popups[i];
      p.life -= dt;
      p.y -= 40 * dt; // float upward
      if (p.life <= 0) game.popups.splice(i, 1);
    }
  }

  /* ======================================================================
     7. DRAW
     ====================================================================== */
  function draw() {
    ctx.save();
    // Screen shake when a fruit is dropped.
    if (game.shakeTimer > 0) {
      const s = game.shakeTimer * 18;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }

    drawSky();
    drawFruits();
    drawGround();
    drawBasket();
    drawParticles();
    drawPopups();
    drawLives();
    drawLevelBanner();

    ctx.restore();
  }

  function drawSky() {
    const grad = ctx.createLinearGradient(0, 0, 0, WORLD_H);
    grad.addColorStop(0, "#8fe0ff");
    grad.addColorStop(0.6, "#cdf3ff");
    grad.addColorStop(1, "#eafcff");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    // Sun.
    ctx.fillStyle = "#ffe36a";
    circle(WORLD_W - 78, 74, 46);
    ctx.fillStyle = "rgba(255, 227, 106, 0.35)";
    circle(WORLD_W - 78, 74, 62);

    // A couple of slow clouds (fixed, calm background).
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    cloud(150, 90, 1);
    cloud(430, 60, 0.8);
  }

  function cloud(x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    circle(0, 0, 26);
    circle(30, 8, 32);
    circle(64, 0, 24);
    ctx.fillRect(0, 0, 64, 22);
    ctx.restore();
  }

  function drawGround() {
    // Grass strip along the bottom.
    ctx.fillStyle = "#8ede7a";
    ctx.fillRect(0, GROUND_Y, WORLD_W, WORLD_H - GROUND_Y);
    ctx.fillStyle = "#6fce5f";
    ctx.fillRect(0, GROUND_Y, WORLD_W, 8);
  }

  function drawBasket() {
    const cx = game.basketX;
    const bottom = WORLD_H - CONFIG.BASKET_BOTTOM_GAP;
    // Soft shadow on the grass.
    ctx.save();
    ctx.fillStyle = "rgba(31, 42, 68, 0.18)";
    ctx.beginPath();
    ctx.ellipse(cx, bottom - 2, CONFIG.BASKET_W * 0.5, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // The basket itself as a big emoji, sized to the catch width.
    drawEmoji("🧺", cx, bottom - CONFIG.BASKET_H * 0.5, CONFIG.BASKET_W * 1.06);
  }

  function drawFruits() {
    for (const f of game.fruits) {
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rot * 0.15); // very slight tilt so it reads as tumbling
      drawEmoji(f.emoji, 0, 0, CONFIG.FRUIT_SIZE);
      ctx.restore();
    }
  }

  /**
   * Draw a colour emoji centred at (x, y) with the given pixel height.
   * We reset fillStyle to fully opaque black first: Chrome multiplies the
   * current globalAlpha/fillStyle into colour emoji, which otherwise washes
   * them out.
   */
  function drawEmoji(emoji, x, y, size) {
    ctx.save();
    ctx.font =
      size + 'px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000000";
    ctx.fillText(emoji, x, y);
    ctx.restore();
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

  function drawPopups() {
    for (const p of game.popups) {
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.font = '800 30px "Comic Sans MS", "Trebuchet MS", system-ui, sans-serif';
      ctx.lineWidth = 6;
      ctx.strokeStyle = "#ffffff";
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
      ctx.restore();
    }
  }

  /** Three baskets (lives) up in the top-left; used ones show as faded. */
  function drawLives() {
    const size = 34;
    for (let i = 0; i < CONFIG.LIVES; i++) {
      const x = 26 + i * (size + 6);
      const y = 26;
      ctx.save();
      ctx.globalAlpha = i < game.lives ? 1 : 0.28;
      drawEmoji(i < game.lives ? "❤️" : "🤍", x, y, size);
      ctx.restore();
    }
  }

  /** Big friendly "LEVEL 2!" banner across the board on each level up. */
  function drawLevelBanner() {
    if (game.bannerTimer <= 0) return;
    const age = CONFIG.BANNER_SECONDS - game.bannerTimer;
    const pop = clamp(age / 0.2, 0, 1); // grow in
    const fade = clamp(game.bannerTimer / 0.4, 0, 1); // fade out

    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(WORLD_W / 2, WORLD_H * 0.38);
    ctx.scale(0.7 + pop * 0.3, 0.7 + pop * 0.3);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.font = '800 62px "Comic Sans MS", "Trebuchet MS", system-ui, sans-serif';
    ctx.lineWidth = 12;
    ctx.strokeStyle = "#ffffff";
    ctx.strokeText(game.bannerText, 0, 0);
    ctx.fillStyle = "#ff4d4d";
    ctx.fillText(game.bannerText, 0, 0);
    ctx.restore();
  }

  /* --- Canvas shape helpers ------------------------------------------------ */
  function circle(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ======================================================================
     8. MAIN LOOP
     ====================================================================== */
  let lastTime = 0;

  function loop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    // Clamp dt so a slow frame (or a tab switch) can't fast-forward the fruit.
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
  const newBestBanner = document.getElementById("newBestBanner");
  const gameOverEmoji = document.getElementById("gameOverEmoji");

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
      playCatch();
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

  function playCatch() {
    tone(560, 880, 0.09, "square", 0.05);
  }
  function playStar() {
    tone(880, 1320, 0.12, "triangle", 0.07);
    setTimeout(function () {
      tone(1320, 1760, 0.12, "triangle", 0.06);
    }, 90);
  }
  function playDrop() {
    tone(320, 120, 0.28, "sawtooth", 0.09);
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
  // Set up a fresh board so it's visible behind the Start card, then wait.
  startRun();
  phase = "ready";
  showOverlay(startOverlay);
  requestAnimationFrame(loop);
})();
