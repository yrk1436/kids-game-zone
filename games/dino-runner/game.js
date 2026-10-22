/* ==========================================================================
   DINO RUNNER  🦖
   A gentle, one-button endless runner for a 7-year-old.

   How it fits together
   --------------------
   1. CONFIG          - every tunable number lives here (difficulty, sizes...)
   2. Canvas setup    - fixed 900x400 "world" scaled up to whatever size the
                        stage happens to be, so all game code uses simple
                        world coordinates and never worries about screen size.
   3. State           - one `game` object holding everything that changes.
   4. Input           - space bar / click / tap all funnel into onJumpInput().
   5. update(dt)      - moves the world forward by dt seconds.
   6. draw()          - paints the scene.
   7. Overlays, score, sound helpers.

   Use this file as the template for the next game in the hub.
   ========================================================================== */

(function () {
  "use strict";

  /* ======================================================================
     1. CONFIG — tweak these to make the game easier or harder
     ====================================================================== */
  const CONFIG = {
    // The world is always 900 x 400 units, whatever the screen size is.
    WORLD_W: 900,
    WORLD_H: 400,
    GROUND_Y: 334, // y of the ground surface the dino stands on

    // --- Dino ---
    DINO_X: 155, // far enough right to clear the on-screen DUCK pad
    DINO_SIZE: 58, // standing height
    DUCK_SIZE: 30, // crouched height - low enough to slip under the birds
    GRAVITY: 2150, // units per second, per second
    JUMP_VELOCITY: -760, // negative = upwards. Gives a ~134 unit high hop.
    JUMP_BUFFER: 0.14, // press this many seconds early and it still counts
    FAST_FALL: 2.4, // holding duck in mid-air drops you this much quicker

    // --- Speed ramp (starts slow, eases up: never suddenly hard) ---
    START_SPEED: 230,
    MAX_SPEED: 545,
    SPEED_EASE: 45, // bigger = slower ramp up

    // --- Levels ---
    LEVEL_POINTS: 250, // points needed per level (level 1 starts at 0)
    LEVELS_TO_HARDEST: 5, // levels it takes for gaps to tighten all the way
    BANNER_SECONDS: 2.2, // how long the "LEVEL UP!" banner stays on screen

    // --- Obstacle spacing, in SECONDS of travel time between obstacles ---
    GAP_EASY: [2.1, 3.0], // at level 1
    GAP_HARD: [1.15, 1.75], // at level 1 + LEVELS_TO_HARDEST and beyond

    // --- Scoring ---
    POINTS_PER_SECOND: 10,
    POINTS_PER_OBSTACLE: 25,

    // --- Forgiveness: shrink both hitboxes so near-misses don't kill ---
    DINO_PADDING: 12,
    DUCK_PADDING: 6,
    OBSTACLE_PADDING: 7,

    STORAGE_BEST: "badri.dino-runner.best",
    STORAGE_SOUND: "badri.dino-runner.sound",
  };

  /**
   * Obstacle shapes.
   *   minLevel : the level this shape starts appearing at
   *   hover    : units the bottom of the shape floats above the ground
   *              (0 = sitting on the ground, so it must be JUMPED)
   *   flock    : drawn as a stack of birds. Tall enough that jumping can't
   *              clear it, and high enough that ducking slides underneath,
   *              so this is the shape that must be DUCKED.
   *
   * The bird numbers are deliberately tied to the dino's sizes above:
   *   standing hitbox top = 334 - 58 + 12 = 288
   *   ducking  hitbox top = 334 - 30 +  6 = 310
   *   flock hitbox bottom = 306 - 7        = 299   <- sits neatly between them
   */
  const OBSTACLE_TYPES = [
    { id: "cactus", emoji: "🌵", w: 30, h: 50, minLevel: 1 },
    { id: "rock", emoji: "🪨", w: 44, h: 34, minLevel: 1 },
    { id: "cactus-tall", emoji: "🌵", w: 38, h: 66, minLevel: 2 },
    { id: "birds", emoji: "🦅", w: 56, h: 123, hover: 28, flock: true, minLevel: 3, gapBonus: 0.45 },
    { id: "cactus-double", emoji: "🌵", w: 62, h: 50, double: true, minLevel: 4 },
  ];

  // Shown on the level-up banner when a new shape is unlocked.
  const LEVEL_MESSAGES = {
    2: "Taller cactus ahead!",
    3: "Birds! Hold DUCK to slide under ⬇️",
    4: "Double cactus - big jumps!",
  };

  /* --- Tiny maths helpers -------------------------------------------------- */
  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /* ======================================================================
     2. CANVAS SETUP
     ====================================================================== */
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const stage = document.getElementById("stage");
  const jumpButton = document.getElementById("jumpButton");
  const duckButton = document.getElementById("duckButton");

  // Emoji font stack that works on Windows, macOS, Android and Linux.
  const EMOJI_FONT =
    '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif';
  const TEXT_FONT = '800 28px "Comic Sans MS", "Trebuchet MS", system-ui, sans-serif';

  /**
   * Match the canvas pixel buffer to its on-screen size (crisp on retina),
   * then scale the drawing context so all game code can keep using the
   * 900 x 400 world coordinates.
   */
  function resizeCanvas() {
    const rect = stage.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(canvas.width / CONFIG.WORLD_W, 0, 0, canvas.height / CONFIG.WORLD_H, 0, 0);
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
    speed: CONFIG.START_SPEED, // world units per second
    score: 0, // kept as a float, displayed rounded down
    best: loadBest(),
    level: 1,
    bannerTimer: 0, // counts down while the "LEVEL UP" banner shows
    bannerMessage: "",
    distanceToNextObstacle: 0,
    lastObstacleId: "", // stops the same shape appearing twice in a row
    crashTimer: 0, // short pause between crashing and the Game Over card
    jumpBufferedAt: -1,

    dino: {
      y: CONFIG.GROUND_Y, // y of the dino's FEET
      vy: 0,
      onGround: true,
      ducking: false,
      squash: 0, // 0..1, a little squash-and-stretch on take off / landing
    },

    obstacles: [],
    clouds: [],
    particles: [], // dust puffs + celebration confetti
    popups: [], // floating "+25" score texts
    distance: 0, // total units travelled - drives all the scrolling scenery
  };

  /* ======================================================================
     4. INPUT
     Two controls only:
       JUMP - space / up arrow / tap anywhere on the picture / JUMP button
       DUCK - down arrow / S / hold the DUCK button
     ====================================================================== */
  const JUMP_KEYS = [" ", "Spacebar", "ArrowUp", "Enter", "w", "W"];
  const DUCK_KEYS = ["ArrowDown", "s", "S"];

  document.addEventListener("keydown", function (event) {
    // If a button or link is focused, let the browser activate it normally
    // instead of treating the key press as a game control.
    const onButton =
      document.activeElement &&
      (document.activeElement.tagName === "BUTTON" || document.activeElement.tagName === "A");
    if (onButton) return;

    if (JUMP_KEYS.indexOf(event.key) !== -1) {
      event.preventDefault(); // stop the page scrolling on space
      onJumpInput();
    } else if (DUCK_KEYS.indexOf(event.key) !== -1) {
      event.preventDefault();
      setDucking(true);
    }
  });

  document.addEventListener("keyup", function (event) {
    if (DUCK_KEYS.indexOf(event.key) !== -1) setDucking(false);
  });

  // pointerdown covers mouse, touch and stylus in one event.
  stage.addEventListener("pointerdown", function (event) {
    // Let the overlay and control buttons handle their own taps.
    if (event.target.closest("button, a")) return;
    event.preventDefault();
    onJumpInput();
  });

  /** Wire a big on-screen control so the game is fully playable by touch. */
  function bindHoldButton(button, onPress, onRelease) {
    button.addEventListener("pointerdown", function (event) {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      onPress();
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (type) {
      button.addEventListener(type, function () {
        if (onRelease) onRelease();
      });
    });
    // Keep the keyboard on the game rather than on the button.
    button.addEventListener("click", function () {
      button.blur();
    });
  }

  bindHoldButton(jumpButton, onJumpInput);
  bindHoldButton(
    duckButton,
    function () {
      resumeAudio();
      setDucking(true);
    },
    function () {
      setDucking(false);
    }
  );

  function onJumpInput() {
    resumeAudio();

    if (phase === "ready") {
      startRun();
    } else if (phase === "running") {
      game.jumpBufferedAt = game.elapsed;
      tryJump();
    } else if (phase === "paused") {
      resumeRun();
    } else if (phase === "over") {
      // Short cooldown so the crash tap doesn't instantly restart the game.
      if (game.crashTimer > 0.9) startRun();
    }
  }

  function tryJump() {
    if (!game.dino.onGround) return;
    game.dino.vy = CONFIG.JUMP_VELOCITY;
    game.dino.onGround = false;
    game.dino.squash = 1;
    game.jumpBufferedAt = -1;
    spawnDust(6);
    playJump();
  }

  function setDucking(down) {
    if (game.dino.ducking === down) return;
    game.dino.ducking = down;
    duckButton.classList.toggle("is-active", down);
    if (down && phase === "running" && game.dino.onGround) spawnDust(3);
  }

  /* ======================================================================
     5. RUN LIFECYCLE
     ====================================================================== */
  function startRun() {
    game.elapsed = 0;
    game.speed = CONFIG.START_SPEED;
    game.score = 0;
    game.level = 1;
    game.bannerTimer = 0;
    game.lastObstacleId = "";
    game.crashTimer = 0;
    game.jumpBufferedAt = -1;
    game.obstacles.length = 0;
    game.particles.length = 0;
    game.popups.length = 0;
    game.dino.y = CONFIG.GROUND_Y;
    game.dino.vy = 0;
    game.dino.onGround = true;
    game.dino.squash = 0;
    setDucking(false);
    // A generous head start before the very first obstacle shows up.
    game.distanceToNextObstacle = CONFIG.START_SPEED * 2.6;

    hideOverlay(startOverlay);
    hideOverlay(pauseOverlay);
    hideOverlay(gameOverOverlay);
    updateScoreDisplay();
    phase = "running";
  }

  function pauseRun() {
    if (phase !== "running") return;
    phase = "paused";
    setDucking(false); // a held key won't send a keyup once we lose focus
    showOverlay(pauseOverlay);
  }

  function resumeRun() {
    if (phase !== "paused") return;
    hideOverlay(pauseOverlay);
    phase = "running";
  }

  function endRun() {
    phase = "over";
    game.crashTimer = 0;
    playCrash();
    spawnDust(14);

    const finalScore = Math.floor(game.score);
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
    gameOverEmoji.textContent = isNewBest ? "🏆" : "💥";
    newBestBanner.classList.toggle("is-hidden", !isNewBest);
    updateScoreDisplay();

    // Let the crash land for a beat before covering the screen with the card.
    setTimeout(function () {
      if (phase === "over") showOverlay(gameOverOverlay);
    }, 520);
  }

  /* ======================================================================
     6. UPDATE — move everything forward by dt seconds
     ====================================================================== */
  function update(dt) {
    updateClouds(dt);
    updateParticles(dt);
    updatePopups(dt);
    if (game.bannerTimer > 0) game.bannerTimer -= dt;

    if (phase === "over") {
      game.crashTimer += dt;
      return;
    }
    if (phase !== "running") return;

    game.elapsed += dt;

    // Speed eases from START_SPEED towards MAX_SPEED - fast at first, then
    // flattening out, so it never spikes into "unfair" territory.
    const ramp = 1 - Math.exp(-game.elapsed / CONFIG.SPEED_EASE);
    game.speed = CONFIG.START_SPEED + (CONFIG.MAX_SPEED - CONFIG.START_SPEED) * ramp;

    game.score += dt * CONFIG.POINTS_PER_SECOND;
    game.distance += game.speed * dt;

    updateDino(dt);
    updateObstacles(dt);
    checkLevelUp();
    updateScoreDisplay();
  }

  /** Levels are purely score based, so they climb at a steady, visible pace. */
  function checkLevelUp() {
    const next = 1 + Math.floor(game.score / CONFIG.LEVEL_POINTS);
    if (next <= game.level) return;

    game.level = next;
    game.bannerTimer = CONFIG.BANNER_SECONDS;
    game.bannerMessage = LEVEL_MESSAGES[next] || "Keep going, you're doing great!";
    levelChip.classList.remove("is-levelling");
    void levelChip.offsetWidth; // restart the CSS pulse animation
    levelChip.classList.add("is-levelling");
    spawnSparkles();
    playLevelUp();
  }

  function updateDino(dt) {
    const dino = game.dino;

    if (!dino.onGround) {
      // Holding duck in mid-air pulls the dino down quicker, which is the
      // escape hatch if he jumps just as a flock of birds arrives.
      const gravity = CONFIG.GRAVITY * (dino.ducking ? CONFIG.FAST_FALL : 1);
      dino.vy += gravity * dt;
      dino.y += dino.vy * dt;

      if (dino.y >= CONFIG.GROUND_Y) {
        dino.y = CONFIG.GROUND_Y;
        dino.vy = 0;
        dino.onGround = true;
        dino.squash = 1;
        spawnDust(4);

        // Jump buffering: a press made just before landing still fires.
        if (game.elapsed - game.jumpBufferedAt <= CONFIG.JUMP_BUFFER) tryJump();
      }
    }

    dino.squash = Math.max(0, dino.squash - dt * 5);
  }

  function updateObstacles(dt) {
    const move = game.speed * dt;

    // Spawn on distance travelled, not on a timer, so spacing stays fair as
    // the speed increases.
    game.distanceToNextObstacle -= move;
    if (game.distanceToNextObstacle <= 0) spawnObstacle();

    for (let i = game.obstacles.length - 1; i >= 0; i--) {
      const obs = game.obstacles[i];
      obs.x -= move;

      if (!obs.passed && obs.x + obs.w < CONFIG.DINO_X) {
        obs.passed = true;
        game.score += CONFIG.POINTS_PER_OBSTACLE;
        game.popups.push({ x: CONFIG.DINO_X + 20, y: CONFIG.GROUND_Y - 90, life: 1 });
        playPoint();
      }

      if (obs.x + obs.w < -80) {
        game.obstacles.splice(i, 1);
        continue;
      }

      if (hitsDino(obs)) {
        endRun();
        return;
      }
    }
  }

  function spawnObstacle() {
    // Only shapes unlocked by the current level, and never the same shape
    // twice in a row (two flocks back to back is brutal).
    let choices = OBSTACLE_TYPES.filter(function (t) {
      return t.minLevel <= game.level && t.id !== game.lastObstacleId;
    });
    if (choices.length === 0) choices = [OBSTACLE_TYPES[0]];

    const type = choices[Math.floor(Math.random() * choices.length)];
    game.lastObstacleId = type.id;

    game.obstacles.push({
      x: CONFIG.WORLD_W + 40,
      w: type.w,
      h: type.h,
      bottom: CONFIG.GROUND_Y - (type.hover || 0),
      emoji: type.emoji,
      double: !!type.double,
      flock: !!type.flock,
      passed: false,
    });

    // Pick the gap (in seconds of travel) before the NEXT obstacle. Gaps
    // tighten as the level climbs, and anything awkward gets a little extra.
    const t = clamp((game.level - 1) / CONFIG.LEVELS_TO_HARDEST, 0, 1);
    const min = lerp(CONFIG.GAP_EASY[0], CONFIG.GAP_HARD[0], t);
    const max = lerp(CONFIG.GAP_EASY[1], CONFIG.GAP_HARD[1], t);
    const gapSeconds = min + Math.random() * (max - min) + (type.gapBonus || 0);
    game.distanceToNextObstacle = game.speed * gapSeconds;
  }

  /**
   * Padded axis-aligned box overlap - deliberately generous to the player.
   * Crouching swaps in a much shorter box, which is what lets the dino pass
   * under a flock of birds while still clipping any cactus.
   */
  function hitsDino(obs) {
    const ducking = game.dino.ducking;
    const height = ducking ? CONFIG.DUCK_SIZE : CONFIG.DINO_SIZE;
    const padY = ducking ? CONFIG.DUCK_PADDING : CONFIG.DINO_PADDING;

    const half = CONFIG.DINO_SIZE / 2;
    const dLeft = CONFIG.DINO_X - half + CONFIG.DINO_PADDING;
    const dRight = CONFIG.DINO_X + half - CONFIG.DINO_PADDING;
    const dBottom = game.dino.y;
    const dTop = game.dino.y - height + padY;

    const oLeft = obs.x + CONFIG.OBSTACLE_PADDING;
    const oRight = obs.x + obs.w - CONFIG.OBSTACLE_PADDING;
    const oTop = obs.bottom - obs.h + CONFIG.OBSTACLE_PADDING;
    const oBottom = obs.bottom - CONFIG.OBSTACLE_PADDING;

    return dRight > oLeft && dLeft < oRight && dBottom > oTop && dTop < oBottom;
  }

  /* --- Scenery + effects --------------------------------------------------- */
  function initClouds() {
    for (let i = 0; i < 5; i++) {
      game.clouds.push({
        x: Math.random() * CONFIG.WORLD_W,
        y: 40 + Math.random() * 110,
        scale: 0.6 + Math.random() * 0.7,
        drift: 12 + Math.random() * 18,
      });
    }
  }

  function updateClouds(dt) {
    for (const cloud of game.clouds) {
      // Clouds drift on their own, and a little faster while running.
      const push = phase === "running" ? game.speed * 0.06 : 0;
      cloud.x -= (cloud.drift + push) * dt;
      if (cloud.x < -140) {
        cloud.x = CONFIG.WORLD_W + 90;
        cloud.y = 40 + Math.random() * 110;
        cloud.scale = 0.6 + Math.random() * 0.7;
      }
    }
  }

  function spawnDust(count) {
    for (let i = 0; i < count; i++) {
      game.particles.push({
        x: CONFIG.DINO_X - 12 + Math.random() * 20,
        y: CONFIG.GROUND_Y - 4,
        vx: -60 - Math.random() * 90,
        vy: -30 - Math.random() * 70,
        size: 4 + Math.random() * 6,
        life: 0.45,
        maxLife: 0.45,
        color: "#d8c9a8",
        gravity: 260,
      });
    }
  }

  function spawnConfetti() {
    const colors = ["#ff4d4d", "#ffd60a", "#2ec46a", "#2d9cff", "#9b5de5", "#ff5ea8"];
    for (let i = 0; i < 90; i++) {
      game.particles.push({
        x: Math.random() * CONFIG.WORLD_W,
        y: -20 - Math.random() * 200,
        vx: -40 + Math.random() * 80,
        vy: 90 + Math.random() * 170,
        size: 6 + Math.random() * 8,
        life: 2.6,
        maxLife: 2.6,
        color: colors[i % colors.length],
        gravity: 60,
        spin: -6 + Math.random() * 12,
        angle: Math.random() * Math.PI,
      });
    }
  }

  /** A quick burst of stars across the top when a new level starts. */
  function spawnSparkles() {
    const colors = ["#ffd60a", "#ff9f1c", "#2d9cff", "#ff5ea8"];
    for (let i = 0; i < 26; i++) {
      game.particles.push({
        x: CONFIG.WORLD_W / 2 + (Math.random() - 0.5) * 420,
        y: 90 + (Math.random() - 0.5) * 60,
        vx: (Math.random() - 0.5) * 220,
        vy: -60 - Math.random() * 90,
        size: 5 + Math.random() * 7,
        life: 1.1,
        maxLife: 1.1,
        color: colors[i % colors.length],
        gravity: 240,
        spin: -8 + Math.random() * 16,
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
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.spin) p.angle += p.spin * dt;
    }
  }

  function updatePopups(dt) {
    for (let i = game.popups.length - 1; i >= 0; i--) {
      const popup = game.popups[i];
      popup.life -= dt * 1.4;
      popup.y -= 45 * dt;
      if (popup.life <= 0) game.popups.splice(i, 1);
    }
  }

  /* ======================================================================
     7. DRAW
     ====================================================================== */
  function draw() {
    const W = CONFIG.WORLD_W;
    const H = CONFIG.WORLD_H;

    drawSky(W, H);
    drawSun();
    for (const cloud of game.clouds) drawCloud(cloud);
    drawHills(W);
    drawGround(W, H);
    for (const obs of game.obstacles) drawObstacle(obs);
    drawDino();
    drawParticles();
    drawPopups();
    drawLevelBanner();
  }

  function drawSky(W, H) {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#68d2ff");
    sky.addColorStop(0.6, "#b8ecff");
    sky.addColorStop(1, "#e8f9ff");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
  }

  function drawSun() {
    const x = 790;
    const y = 72;
    ctx.save();
    ctx.fillStyle = "rgba(255, 236, 130, 0.45)";
    ctx.beginPath();
    ctx.arc(x, y, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffd60a";
    ctx.beginPath();
    ctx.arc(x, y, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawCloud(cloud) {
    ctx.save();
    ctx.translate(cloud.x, cloud.y);
    ctx.scale(cloud.scale, cloud.scale);
    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    circle(0, 0, 26);
    circle(30, 8, 20);
    circle(-30, 8, 18);
    circle(8, -16, 20);
    ctx.restore();
  }

  function circle(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Two rolling hill layers, each scrolling slower than the ground.
   * Kept pale on purpose so the green dino stays easy to see against them.
   */
  function drawHills(W) {
    drawHillLayer(0.18, 104, "#d5f0d8", 246);
    drawHillLayer(0.34, 74, "#b7e6be", 280);

    function drawHillLayer(parallax, height, color, baseY) {
      const period = 300;
      const startX = -period - ((game.distance * parallax) % period);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(startX, baseY);
      for (let x = startX; x < W + period; x += period) {
        ctx.quadraticCurveTo(x + period / 2, baseY - height, x + period, baseY);
      }
      ctx.lineTo(W + period, CONFIG.GROUND_Y + 10);
      ctx.lineTo(startX, CONFIG.GROUND_Y + 10);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawGround(W, H) {
    const groundY = CONFIG.GROUND_Y;

    ctx.fillStyle = "#63c46f"; // grass
    ctx.fillRect(0, groundY, W, 18);
    ctx.fillStyle = "#c9a678"; // dirt
    ctx.fillRect(0, groundY + 18, W, H - groundY - 18);

    // Scrolling grass tufts + pebbles so the speed is easy to read.
    const tuftScroll = game.distance % 60;
    ctx.fillStyle = "#4aa957";
    for (let x = -60; x < W + 60; x += 60) {
      ctx.fillRect(x - tuftScroll, groundY + 4, 22, 5);
    }

    const pebbleScroll = (game.distance * 0.6) % 90;
    ctx.fillStyle = "rgba(120, 92, 58, 0.45)";
    for (let x = -90; x < W + 90; x += 90) {
      const px = x - pebbleScroll;
      circle(px + 34, groundY + 42, 5);
      circle(px + 8, groundY + 62, 3.5);
    }
  }

  function drawObstacle(obs) {
    // Soft shadow so ground obstacles feel planted. Birds don't get one.
    if (obs.bottom >= CONFIG.GROUND_Y) {
      ctx.fillStyle = "rgba(31, 42, 68, 0.16)";
      ctx.beginPath();
      ctx.ellipse(obs.x + obs.w / 2, CONFIG.GROUND_Y + 12, obs.w * 0.55, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (obs.flock) {
      drawFlock(obs);
    } else if (obs.double) {
      drawEmoji("🌵", obs.x + obs.w * 0.28, obs.bottom + 4, obs.h * 0.85);
      drawEmoji("🌵", obs.x + obs.w * 0.72, obs.bottom + 4, obs.h);
    } else {
      drawEmoji(obs.emoji, obs.x + obs.w / 2, obs.bottom + 4, obs.h);
    }
  }

  /**
   * Three birds stacked up the full height of the obstacle box. Drawing the
   * whole column matters: the hitbox reaches above the top of a jump, so the
   * picture has to show why jumping won't get you past it.
   */
  function drawFlock(obs) {
    const birdSize = 40;
    const centerX = obs.x + obs.w / 2;
    for (let i = 0; i < 3; i++) {
      const bob = Math.sin(game.elapsed * 9 + i * 1.7) * 4;
      const wobbleX = i % 2 === 0 ? 4 : -6;
      drawEmoji(obs.emoji, centerX + wobbleX, obs.bottom - i * 42 + bob, birdSize);
    }
  }

  function drawDino() {
    const dino = game.dino;
    const airborne = CONFIG.GROUND_Y - dino.y; // 0 on the ground

    // Shadow shrinks as he jumps higher.
    const shadowScale = clamp(1 - airborne / 220, 0.3, 1);
    ctx.fillStyle = "rgba(31, 42, 68, " + 0.2 * shadowScale + ")";
    ctx.beginPath();
    ctx.ellipse(CONFIG.DINO_X, CONFIG.GROUND_Y + 12, 26 * shadowScale, 7 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // A gentle bob while running, plus squash on take off / landing.
    const bob = dino.onGround && phase === "running" ? Math.sin(game.elapsed * 18) * 3 : 0;
    let squashX = 1 + dino.squash * 0.18;
    let squashY = 1 - dino.squash * 0.18;
    let tilt = clamp(-dino.vy / 2600, -0.22, 0.28);

    // Crouching: flatten and stretch the dino so he visibly ducks down to
    // roughly DUCK_SIZE tall, and lean him forward like he's sliding.
    if (dino.ducking) {
      squashX *= 1.4;
      squashY *= CONFIG.DUCK_SIZE / CONFIG.DINO_SIZE;
      tilt = 0.12;
    }

    ctx.save();
    ctx.translate(CONFIG.DINO_X, dino.y + bob);
    ctx.rotate(phase === "over" ? 0.5 : tilt);
    // The 🦖 glyph faces left in every emoji font, so mirror him to face right.
    ctx.scale(-squashX, squashY);
    drawEmoji(phase === "over" ? "😵" : "🦖", 0, 4, CONFIG.DINO_SIZE, true);
    ctx.restore();
  }

  /** Big friendly "LEVEL 3!" banner across the middle of the sky. */
  function drawLevelBanner() {
    if (game.bannerTimer <= 0) return;

    const age = CONFIG.BANNER_SECONDS - game.bannerTimer;
    const pop = clamp(age / 0.25, 0, 1); // grow in
    const fade = clamp(game.bannerTimer / 0.5, 0, 1); // fade out
    const centerX = CONFIG.WORLD_W / 2;

    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(centerX, 118);
    ctx.scale(0.7 + pop * 0.3, 0.7 + pop * 0.3);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.lineJoin = "round";
    ctx.font = '800 58px "Comic Sans MS", "Trebuchet MS", system-ui, sans-serif';
    ctx.lineWidth = 12;
    ctx.strokeStyle = "#ffffff";
    ctx.strokeText("LEVEL " + game.level + "!", 0, 0);
    ctx.fillStyle = "#ff9f1c";
    ctx.fillText("LEVEL " + game.level + "!", 0, 0);

    ctx.font = '800 25px "Comic Sans MS", "Trebuchet MS", system-ui, sans-serif';
    ctx.lineWidth = 8;
    ctx.strokeStyle = "#ffffff";
    ctx.strokeText(game.bannerMessage, 0, 44);
    ctx.fillStyle = "#2d9cff";
    ctx.fillText(game.bannerMessage, 0, 44);
    ctx.restore();
  }

  /**
   * Draw an emoji sized to `height`, horizontally centred on `x`, sitting on
   * `bottomY`. `preTransformed` skips the translate when the caller has
   * already positioned the context.
   */
  function drawEmoji(emoji, x, bottomY, height, preTransformed) {
    const fontSize = height * 1.18;
    // Browsers multiply colour-emoji glyphs by the current fill alpha, so reset
    // to a fully opaque fill after any translucent shadow drawing.
    ctx.fillStyle = "#000000";
    ctx.font = fontSize + "px " + EMOJI_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    if (preTransformed) {
      // Mirrored context: textAlign "center" keeps it centred either way.
      ctx.fillText(emoji, 0, bottomY);
    } else {
      ctx.fillText(emoji, x, bottomY);
    }
  }

  function drawParticles() {
    for (const p of game.particles) {
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      if (p.spin !== undefined) {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else {
        circle(p.x, p.y, p.size * alpha);
      }
      ctx.restore();
    }
  }

  function drawPopups() {
    for (const popup of game.popups) {
      ctx.save();
      ctx.globalAlpha = clamp(popup.life, 0, 1);
      ctx.font = TEXT_FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 6;
      ctx.strokeStyle = "#ffffff";
      ctx.strokeText("+" + CONFIG.POINTS_PER_OBSTACLE, popup.x, popup.y);
      ctx.fillStyle = "#ff9f1c";
      ctx.fillText("+" + CONFIG.POINTS_PER_OBSTACLE, popup.x, popup.y);
      ctx.restore();
    }
  }

  /* ======================================================================
     8. MAIN LOOP
     ====================================================================== */
  let lastTime = 0;

  function loop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    // Clamp dt so a slow frame (or a tab switch) can never teleport the dino
    // straight into a cactus.
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
    const score = Math.floor(game.score);
    if (score !== shownScore) {
      shownScore = score;
      scoreValueEl.textContent = score;
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

  // Auto-pause if the tab is hidden or the window loses focus, so the dino
  // isn't quietly crashing while nobody is watching.
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
      /* ignore - not being able to save is not worth interrupting the game */
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
    soundButton.blur(); // hand the space bar back to the game
    soundOn = !soundOn;
    try {
      window.localStorage.setItem(CONFIG.STORAGE_SOUND, soundOn ? "on" : "off");
    } catch (err) {
      /* ignore */
    }
    renderSoundButton();
    if (soundOn) {
      resumeAudio();
      playPoint();
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

  function playJump() {
    tone(420, 780, 0.16, "square", 0.07);
  }
  function playPoint() {
    tone(880, 1180, 0.11, "triangle", 0.07);
  }
  function playCrash() {
    tone(320, 70, 0.42, "sawtooth", 0.11);
  }
  function playFanfare() {
    playNotes([523, 659, 784, 1047], 130, 0.22, 0.09);
  }
  function playLevelUp() {
    playNotes([659, 880], 110, 0.18, 0.08);
  }

  function playNotes(notes, spacingMs, duration, volume) {
    if (!soundOn || !audioCtx) return;
    notes.forEach(function (freq, i) {
      setTimeout(function () {
        tone(freq, freq * 1.02, duration, "triangle", volume);
      }, i * spacingMs);
    });
  }

  /* ======================================================================
     11. BOOT
     ====================================================================== */
  initClouds();
  resizeCanvas();
  renderSoundButton();
  updateScoreDisplay();
  requestAnimationFrame(loop);
})();
