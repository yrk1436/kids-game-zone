/* ==========================================================================
   BUBBLE POP  🫧
   A gentle, tap-to-pop bubble game for a 7-year-old.

   Features:
   - Levels with goals and star ratings
   - Special bubbles introduced each level
   - Combo system for quick pops
   ========================================================================== */

(function () {
  "use strict";

  /* ======================================================================
     1. CONFIG
     ====================================================================== */
  const CONFIG = {
    WORLD_W: 800,
    WORLD_H: 600,

    MAX_LIVES: 5,

    BUBBLE_MIN_RADIUS: 30,
    BUBBLE_MAX_RADIUS: 50,
    BUBBLE_TAP_PADDING: 14,

    BUBBLE_BASE_SPEED: 45,
    BUBBLE_SPEED_VARIANCE: 25,

    POINTS_BASE: 10,
    POINTS_PER_SIZE: 0.25,

    GRACE_PERIOD: 4,

    POP_PARTICLE_COUNT: 12,
    POP_ANIMATION_DURATION: 0.35,

    COMBO_WINDOW: 0.8,
    COMBO_MAX: 5,

    SLOWMO_DURATION: 5,
    SLOWMO_FACTOR: 0.4,

    SPECIAL_CHANCE_BASE: 0.08,

    STORAGE_BEST: "badri.bubble-pop.best",
    STORAGE_BEST_LEVEL: "badri.bubble-pop.bestLevel",
    STORAGE_SOUND: "badri.bubble-pop.sound",
  };

  const LEVELS = [
    { goal: 10, spawnInterval: 2.0, speedMult: 0.7, specialChance: 0 },
    { goal: 12, spawnInterval: 1.8, speedMult: 0.75, specialChance: 0.06, unlock: "gold" },
    { goal: 15, spawnInterval: 1.5, speedMult: 0.85, specialChance: 0.07, unlock: "heart" },
    { goal: 18, spawnInterval: 1.3, speedMult: 0.95, specialChance: 0.08, unlock: "slowmo" },
    { goal: 20, spawnInterval: 1.1, speedMult: 1.0, specialChance: 0.09, unlock: "rainbow" },
    { goal: 22, spawnInterval: 1.0, speedMult: 1.1, specialChance: 0.10, unlock: "bomb" },
    { goal: 25, spawnInterval: 0.9, speedMult: 1.2, specialChance: 0.11 },
    { goal: 28, spawnInterval: 0.85, speedMult: 1.3, specialChance: 0.12 },
    { goal: 30, spawnInterval: 0.8, speedMult: 1.4, specialChance: 0.13 },
    { goal: 35, spawnInterval: 0.75, speedMult: 1.5, specialChance: 0.14 },
  ];

  const SPECIAL_TYPES = {
    gold: {
      name: "Gold Bubble",
      emoji: "⭐",
      desc: "Worth 5x points!",
      color: { fill: "rgba(255, 215, 0, 0.85)", stroke: "#ffc800", glow: "#ffd700" },
      minLevel: 2,
    },
    heart: {
      name: "Heart Bubble",
      emoji: "❤️",
      desc: "Gives you an extra life!",
      color: { fill: "rgba(255, 100, 120, 0.85)", stroke: "#ff4060", glow: "#ff6080" },
      minLevel: 3,
    },
    slowmo: {
      name: "Slow-Mo Bubble",
      emoji: "🐌",
      desc: "Slows everything for 5 seconds!",
      color: { fill: "rgba(180, 130, 255, 0.85)", stroke: "#9b5de5", glow: "#b080ff" },
      minLevel: 4,
    },
    rainbow: {
      name: "Rainbow Bubble",
      emoji: "🌈",
      desc: "Pops ALL bubbles on screen!",
      color: { fill: "rgba(255, 200, 255, 0.85)", stroke: "#ff80c0", glow: "#ffa0d0" },
      minLevel: 5,
      rainbow: true,
    },
    bomb: {
      name: "Spiky Bomb",
      emoji: "💣",
      desc: "Avoid this one! It costs a life!",
      color: { fill: "rgba(60, 60, 70, 0.9)", stroke: "#2a2a30", glow: "#505060" },
      minLevel: 6,
      isBomb: true,
    },
  };

  const BUBBLE_COLORS = [
    { fill: "rgba(255, 77, 77, 0.75)", stroke: "#ff4d4d", glow: "#ff4d4d" },
    { fill: "rgba(255, 159, 28, 0.75)", stroke: "#ff9f1c", glow: "#ff9f1c" },
    { fill: "rgba(255, 214, 10, 0.75)", stroke: "#ffd60a", glow: "#ffd60a" },
    { fill: "rgba(46, 196, 106, 0.75)", stroke: "#2ec46a", glow: "#2ec46a" },
    { fill: "rgba(22, 200, 200, 0.75)", stroke: "#16c8c8", glow: "#16c8c8" },
    { fill: "rgba(45, 156, 255, 0.75)", stroke: "#2d9cff", glow: "#2d9cff" },
    { fill: "rgba(155, 93, 229, 0.75)", stroke: "#9b5de5", glow: "#9b5de5" },
    { fill: "rgba(255, 94, 168, 0.75)", stroke: "#ff5ea8", glow: "#ff5ea8" },
  ];

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  /* ======================================================================
     2. CANVAS SETUP
     ====================================================================== */
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const stage = document.getElementById("stage");

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
  let phase = "ready";

  const game = {
    elapsed: 0,
    score: 0,
    best: loadBest(),
    bestLevel: loadBestLevel(),
    lives: CONFIG.MAX_LIVES,
    livesLostThisLevel: 0,
    spawnTimer: 0,
    gameOverTimer: 0,

    level: 1,
    poppedThisLevel: 0,
    shownUnlocks: {},

    combo: 0,
    lastPopTime: -10,

    slowmoTimer: 0,

    pendingUnlock: null,

    bubbles: [],
    particles: [],
    popEffects: [],
    floatingTexts: [],
  };

  /* ======================================================================
     4. INPUT
     ====================================================================== */
  function getPointerWorldPos(event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = CONFIG.WORLD_W / rect.width;
    const scaleY = CONFIG.WORLD_H / rect.height;
    const clientX = event.clientX !== undefined ? event.clientX : event.touches[0].clientX;
    const clientY = event.clientY !== undefined ? event.clientY : event.touches[0].clientY;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  function handlePointerDown(event) {
    event.preventDefault();
    resumeAudio();

    if (phase === "ready") {
      startRun();
      return;
    }

    if (phase === "paused") {
      resumeRun();
      return;
    }

    if (phase === "over") {
      if (game.gameOverTimer > 0.5) startRun();
      return;
    }

    if (phase !== "running") return;

    const pos = getPointerWorldPos(event);
    const hit = tryPopBubbleAt(pos.x, pos.y);
    
    if (!hit) {
      game.combo = 0;
    }
  }

  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("touchstart", function (e) {
    e.preventDefault();
  }, { passive: false });

  function tryPopBubbleAt(x, y) {
    for (let i = game.bubbles.length - 1; i >= 0; i--) {
      const bubble = game.bubbles[i];
      const dx = x - bubble.x;
      const dy = y - bubble.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const hitRadius = bubble.radius + CONFIG.BUBBLE_TAP_PADDING;

      if (dist <= hitRadius) {
        popBubble(bubble, i);
        return true;
      }
    }
    return false;
  }

  function popBubble(bubble, index) {
    game.bubbles.splice(index, 1);

    if (bubble.special === "bomb") {
      loseLife();
      spawnPopEffect(bubble);
      playBombHit();
      spawnFloatingText(bubble.x, bubble.y - bubble.radius, "OUCH!", "#ff4040");
      return;
    }

    const now = game.elapsed;
    if (now - game.lastPopTime <= CONFIG.COMBO_WINDOW) {
      game.combo = Math.min(game.combo + 1, CONFIG.COMBO_MAX);
    } else {
      game.combo = 1;
    }
    game.lastPopTime = now;

    const multiplier = game.combo;
    let basePoints = Math.round(CONFIG.POINTS_BASE + bubble.radius * CONFIG.POINTS_PER_SIZE);

    if (bubble.special === "gold") {
      basePoints *= 5;
    }

    const points = basePoints * multiplier;
    game.score += points;
    game.poppedThisLevel++;

    if (bubble.special === "heart") {
      if (game.lives < CONFIG.MAX_LIVES) {
        game.lives++;
        updateLivesDisplay();
        livesChip.classList.remove("is-healed");
        void livesChip.offsetWidth;
        livesChip.classList.add("is-healed");
        playHeal();
      }
      spawnFloatingText(bubble.x, bubble.y - bubble.radius, "+1 ❤️", "#ff4080");
    } else if (bubble.special === "slowmo") {
      game.slowmoTimer = CONFIG.SLOWMO_DURATION;
      slowmoTint.classList.remove("is-hidden");
      playSlowmo();
      spawnFloatingText(bubble.x, bubble.y - bubble.radius, "SLOW-MO!", "#9b5de5");
    } else if (bubble.special === "rainbow") {
      popAllBubbles(bubble);
      playRainbow();
      spawnFloatingText(bubble.x, bubble.y - bubble.radius, "RAINBOW!", "#ff80c0");
    } else {
      let text = "+" + points;
      if (multiplier > 1) {
        text += " x" + multiplier;
      }
      spawnFloatingText(bubble.x, bubble.y - bubble.radius, text, multiplier > 1 ? "#ff9f1c" : null);
    }

    spawnPopEffect(bubble);
    playPop(bubble.radius, multiplier);

    updateScoreDisplay();
    updateLevelProgress();

    if (game.poppedThisLevel >= getLevelConfig().goal) {
      completeLevel();
    }
  }

  function popAllBubbles(source) {
    const toRemove = [];
    for (let i = game.bubbles.length - 1; i >= 0; i--) {
      const b = game.bubbles[i];
      if (b !== source && b.special !== "bomb") {
        toRemove.push({ bubble: b, index: i });
      }
    }
    
    toRemove.forEach(function (item, delay) {
      setTimeout(function () {
        if (game.bubbles.indexOf(item.bubble) !== -1) {
          const idx = game.bubbles.indexOf(item.bubble);
          game.bubbles.splice(idx, 1);
          const pts = Math.round(CONFIG.POINTS_BASE + item.bubble.radius * CONFIG.POINTS_PER_SIZE);
          game.score += pts;
          game.poppedThisLevel++;
          spawnPopEffect(item.bubble);
          playPop(item.bubble.radius, 1);
          updateScoreDisplay();
          updateLevelProgress();
          if (game.poppedThisLevel >= getLevelConfig().goal && phase === "running") {
            completeLevel();
          }
        }
      }, delay * 60);
    });
  }

  /* ======================================================================
     5. LEVEL SYSTEM
     ====================================================================== */
  function getLevelConfig() {
    const idx = Math.min(game.level - 1, LEVELS.length - 1);
    return LEVELS[idx];
  }

  function completeLevel() {
    phase = "levelComplete";
    
    const livesLost = game.livesLostThisLevel;
    let stars = 3;
    if (livesLost === 1) stars = 2;
    else if (livesLost >= 2) stars = 1;

    const starText = "⭐".repeat(stars) + "☆".repeat(3 - stars);
    let message = "";
    if (stars === 3) message = "Perfect! No lives lost!";
    else if (stars === 2) message = "Great job!";
    else message = "Level complete!";

    levelCompleteTitleEl.textContent = "Level " + game.level + " Complete!";
    levelStarsEl.textContent = starText;
    levelMessageEl.textContent = message;

    if (game.level > game.bestLevel) {
      game.bestLevel = game.level;
      saveBestLevel(game.level);
    }

    playLevelComplete();
    spawnConfetti();

    setTimeout(function () {
      if (phase === "levelComplete") showOverlay(levelOverlay);
    }, 400);
  }

  function startNextLevel() {
    hideOverlay(levelOverlay);
    
    game.level++;
    game.poppedThisLevel = 0;
    game.livesLostThisLevel = 0;
    game.combo = 0;
    game.lastPopTime = -10;
    
    const cfg = getLevelConfig();
    if (cfg.unlock && !game.shownUnlocks[cfg.unlock]) {
      game.pendingUnlock = cfg.unlock;
      showNewBubbleIntro(cfg.unlock);
    } else {
      phase = "running";
    }
    
    updateLevelDisplay();
    updateLevelProgress();
  }

  function showNewBubbleIntro(type) {
    const spec = SPECIAL_TYPES[type];
    newBubbleEmojiEl.textContent = spec.emoji;
    newBubbleNameEl.textContent = spec.name;
    newBubbleDescEl.textContent = spec.desc;
    
    if (spec.isBomb) {
      newBubbleNameEl.style.color = "#ff4040";
    } else {
      newBubbleNameEl.style.color = "";
    }
    
    game.shownUnlocks[type] = true;
    phase = "newBubbleIntro";
    showOverlay(newBubbleOverlay);
  }

  function dismissNewBubbleIntro() {
    hideOverlay(newBubbleOverlay);
    game.pendingUnlock = null;
    phase = "running";
  }

  /* ======================================================================
     6. RUN LIFECYCLE
     ====================================================================== */
  function startRun() {
    game.elapsed = 0;
    game.score = 0;
    game.lives = CONFIG.MAX_LIVES;
    game.livesLostThisLevel = 0;
    game.spawnTimer = 0;
    game.gameOverTimer = 0;
    game.level = 1;
    game.poppedThisLevel = 0;
    game.combo = 0;
    game.lastPopTime = -10;
    game.slowmoTimer = 0;
    game.pendingUnlock = null;
    game.bubbles.length = 0;
    game.particles.length = 0;
    game.popEffects.length = 0;
    game.floatingTexts.length = 0;

    slowmoTint.classList.add("is-hidden");

    hideOverlay(startOverlay);
    hideOverlay(pauseOverlay);
    hideOverlay(gameOverOverlay);
    hideOverlay(levelOverlay);
    hideOverlay(newBubbleOverlay);
    
    updateScoreDisplay();
    updateLivesDisplay();
    updateLevelDisplay();
    updateLevelProgress();
    phase = "running";
  }

  function pauseRun() {
    if (phase !== "running") return;
    phase = "paused";
    game.combo = 0;
    showOverlay(pauseOverlay);
  }

  function resumeRun() {
    if (phase !== "paused") return;
    hideOverlay(pauseOverlay);
    phase = "running";
  }

  function endRun() {
    phase = "over";
    game.gameOverTimer = 0;
    game.slowmoTimer = 0;
    slowmoTint.classList.add("is-hidden");
    playGameOver();

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
    finalBestLevelEl.textContent = game.bestLevel;
    gameOverEmoji.textContent = isNewBest ? "🏆" : "😢";
    newBestBanner.classList.toggle("is-hidden", !isNewBest);
    updateScoreDisplay();

    setTimeout(function () {
      if (phase === "over") showOverlay(gameOverOverlay);
    }, 600);
  }

  /* ======================================================================
     7. UPDATE
     ====================================================================== */
  function update(dt) {
    updateParticles(dt);
    updatePopEffects(dt);
    updateFloatingTexts(dt);

    if (phase === "over") {
      game.gameOverTimer += dt;
      return;
    }
    if (phase !== "running") return;

    if (game.slowmoTimer > 0) {
      game.slowmoTimer -= dt;
      dt *= CONFIG.SLOWMO_FACTOR;
      if (game.slowmoTimer <= 0) {
        slowmoTint.classList.add("is-hidden");
      }
    }

    game.elapsed += dt;

    if (game.elapsed - game.lastPopTime > CONFIG.COMBO_WINDOW) {
      game.combo = 0;
    }

    updateBubbles(dt);
    updateSpawning(dt);
    updateScoreDisplay();
  }

  function updateBubbles(dt) {
    const cfg = getLevelConfig();
    const speedMult = cfg.speedMult;

    for (let i = game.bubbles.length - 1; i >= 0; i--) {
      const bubble = game.bubbles[i];

      bubble.wobblePhase += bubble.wobbleSpeed * dt;
      const wobble = Math.sin(bubble.wobblePhase) * bubble.wobbleAmount;
      bubble.x += wobble * dt * 30;

      bubble.y -= bubble.speed * speedMult * dt;

      bubble.shimmer = (bubble.shimmer + dt * 2) % (Math.PI * 2);
      
      if (bubble.special === "rainbow") {
        bubble.rainbowHue = (bubble.rainbowHue + dt * 120) % 360;
      }
      
      if (bubble.special === "bomb") {
        bubble.spikePulse = (bubble.spikePulse + dt * 8) % (Math.PI * 2);
      }

      if (bubble.y + bubble.radius < -20) {
        game.bubbles.splice(i, 1);

        if (bubble.special !== "bomb" && game.elapsed > CONFIG.GRACE_PERIOD) {
          loseLife();
        }
      }
    }
  }

  function loseLife() {
    game.lives--;
    game.livesLostThisLevel++;
    game.combo = 0;
    updateLivesDisplay();
    playMiss();

    livesChip.classList.remove("is-hurt");
    void livesChip.offsetWidth;
    livesChip.classList.add("is-hurt");

    if (game.lives <= 0) {
      endRun();
    }
  }

  function updateSpawning(dt) {
    game.spawnTimer -= dt;
    if (game.spawnTimer <= 0) {
      spawnBubble();
      const cfg = getLevelConfig();
      const variance = 0.7 + Math.random() * 0.6;
      game.spawnTimer = cfg.spawnInterval * variance;
    }
  }

  function spawnBubble() {
    const cfg = getLevelConfig();
    const radius = CONFIG.BUBBLE_MIN_RADIUS + Math.random() * (CONFIG.BUBBLE_MAX_RADIUS - CONFIG.BUBBLE_MIN_RADIUS);
    
    let special = null;
    let colorData;

    if (Math.random() < cfg.specialChance) {
      const available = [];
      for (const key in SPECIAL_TYPES) {
        if (SPECIAL_TYPES[key].minLevel <= game.level) {
          available.push(key);
        }
      }
      if (available.length > 0) {
        special = available[Math.floor(Math.random() * available.length)];
        colorData = SPECIAL_TYPES[special].color;
      }
    }

    if (!colorData) {
      colorData = BUBBLE_COLORS[Math.floor(Math.random() * BUBBLE_COLORS.length)];
    }

    game.bubbles.push({
      x: radius + Math.random() * (CONFIG.WORLD_W - radius * 2),
      y: CONFIG.WORLD_H + radius + Math.random() * 40,
      radius: radius,
      speed: CONFIG.BUBBLE_BASE_SPEED + Math.random() * CONFIG.BUBBLE_SPEED_VARIANCE,
      color: colorData,
      wobblePhase: Math.random() * Math.PI * 2,
      wobbleSpeed: 1.5 + Math.random() * 2,
      wobbleAmount: 0.3 + Math.random() * 0.5,
      shimmer: Math.random() * Math.PI * 2,
      special: special,
      rainbowHue: 0,
      spikePulse: 0,
    });
  }

  function spawnPopEffect(bubble) {
    game.popEffects.push({
      x: bubble.x,
      y: bubble.y,
      radius: bubble.radius,
      color: bubble.color,
      life: CONFIG.POP_ANIMATION_DURATION,
      maxLife: CONFIG.POP_ANIMATION_DURATION,
    });

    for (let i = 0; i < CONFIG.POP_PARTICLE_COUNT; i++) {
      const angle = (Math.PI * 2 / CONFIG.POP_PARTICLE_COUNT) * i + Math.random() * 0.5;
      const speed = 120 + Math.random() * 180;
      game.particles.push({
        x: bubble.x,
        y: bubble.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 4 + Math.random() * 6,
        life: 0.5 + Math.random() * 0.3,
        maxLife: 0.8,
        color: bubble.color.stroke,
        gravity: 180,
      });
    }
  }

  function spawnFloatingText(x, y, text, color) {
    game.floatingTexts.push({
      x: x,
      y: y,
      text: text,
      life: 1.2,
      maxLife: 1.2,
      color: color || "#ff9f1c",
      scale: text.includes("x") ? 1.3 : 1,
    });
  }

  function spawnConfetti() {
    const colors = ["#ff4d4d", "#ffd60a", "#2ec46a", "#2d9cff", "#9b5de5", "#ff5ea8"];
    for (let i = 0; i < 80; i++) {
      game.particles.push({
        x: Math.random() * CONFIG.WORLD_W,
        y: -20 - Math.random() * 150,
        vx: -40 + Math.random() * 80,
        vy: 100 + Math.random() * 180,
        size: 6 + Math.random() * 8,
        life: 2.5,
        maxLife: 2.5,
        color: colors[i % colors.length],
        gravity: 80,
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
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.spin !== undefined) p.angle += p.spin * dt;
    }
  }

  function updatePopEffects(dt) {
    for (let i = game.popEffects.length - 1; i >= 0; i--) {
      const effect = game.popEffects[i];
      effect.life -= dt;
      if (effect.life <= 0) {
        game.popEffects.splice(i, 1);
      }
    }
  }

  function updateFloatingTexts(dt) {
    for (let i = game.floatingTexts.length - 1; i >= 0; i--) {
      const ft = game.floatingTexts[i];
      ft.life -= dt * 1.1;
      ft.y -= 55 * dt;
      if (ft.life <= 0) {
        game.floatingTexts.splice(i, 1);
      }
    }
  }

  /* ======================================================================
     8. DRAW
     ====================================================================== */
  function draw() {
    const W = CONFIG.WORLD_W;
    const H = CONFIG.WORLD_H;

    drawBackground(W, H);
    drawBubbles();
    drawPopEffects();
    drawParticles();
    drawFloatingTexts();
    drawComboIndicator();
  }

  function drawBackground(W, H) {
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, "#c8f0ff");
    gradient.addColorStop(0.5, "#e8f8ff");
    gradient.addColorStop(1, "#fff0f8");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    const time = performance.now() / 1000;
    for (let i = 0; i < 8; i++) {
      const x = ((time * 15 + i * 120) % (W + 200)) - 100;
      const y = 80 + i * 70 + Math.sin(time + i) * 20;
      drawCloud(x, y, 0.5 + (i % 3) * 0.2);
    }
  }

  function drawCloud(x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, Math.PI * 2);
    ctx.arc(35, 5, 24, 0, Math.PI * 2);
    ctx.arc(-30, 5, 22, 0, Math.PI * 2);
    ctx.arc(12, -18, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawBubbles() {
    for (const bubble of game.bubbles) {
      if (bubble.special === "bomb") {
        drawBombBubble(bubble);
      } else if (bubble.special === "rainbow") {
        drawRainbowBubble(bubble);
      } else {
        drawBubble(bubble);
      }
    }
  }

  function drawBubble(bubble) {
    const { x, y, radius, color, shimmer, special } = bubble;

    ctx.save();

    ctx.shadowColor = color.glow;
    ctx.shadowBlur = special ? 20 : 15;

    const gradient = ctx.createRadialGradient(
      x - radius * 0.3, y - radius * 0.3, 0,
      x, y, radius
    );
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.9)");
    gradient.addColorStop(0.3, color.fill);
    gradient.addColorStop(1, color.stroke);

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.shadowBlur = 0;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = color.stroke;
    ctx.lineWidth = special ? 4 : 3;
    ctx.stroke();

    const highlightX = x - radius * 0.35;
    const highlightY = y - radius * 0.35;
    const highlightRadius = radius * 0.25;

    ctx.beginPath();
    ctx.arc(highlightX, highlightY, highlightRadius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, " + (0.6 + Math.sin(shimmer) * 0.2) + ")";
    ctx.fill();

    const highlight2X = x - radius * 0.15;
    const highlight2Y = y - radius * 0.55;
    ctx.beginPath();
    ctx.arc(highlight2X, highlight2Y, highlightRadius * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.fill();

    if (special && SPECIAL_TYPES[special]) {
      ctx.font = (radius * 0.7) + "px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(SPECIAL_TYPES[special].emoji, x, y);
    }

    ctx.restore();
  }

  function drawRainbowBubble(bubble) {
    const { x, y, radius, shimmer, rainbowHue } = bubble;

    ctx.save();

    const hue = rainbowHue;
    const color1 = "hsl(" + hue + ", 80%, 70%)";
    const color2 = "hsl(" + ((hue + 60) % 360) + ", 80%, 60%)";
    const color3 = "hsl(" + ((hue + 120) % 360) + ", 80%, 50%)";

    ctx.shadowColor = color1;
    ctx.shadowBlur = 25;

    const gradient = ctx.createRadialGradient(
      x - radius * 0.3, y - radius * 0.3, 0,
      x, y, radius
    );
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.9)");
    gradient.addColorStop(0.3, color1);
    gradient.addColorStop(0.6, color2);
    gradient.addColorStop(1, color3);

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = color3;
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x - radius * 0.35, y - radius * 0.35, radius * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, " + (0.6 + Math.sin(shimmer) * 0.2) + ")";
    ctx.fill();

    ctx.font = (radius * 0.7) + "px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🌈", x, y);

    ctx.restore();
  }

  function drawBombBubble(bubble) {
    const { x, y, radius, shimmer, spikePulse } = bubble;

    ctx.save();

    ctx.shadowColor = "#ff4040";
    ctx.shadowBlur = 15 + Math.sin(spikePulse) * 8;

    ctx.fillStyle = "#303038";
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#ff4040";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.shadowBlur = 0;

    const spikeCount = 8;
    const spikeLength = radius * (0.3 + Math.sin(spikePulse) * 0.1);
    ctx.strokeStyle = "#ff6060";
    ctx.lineWidth = 3;
    for (let i = 0; i < spikeCount; i++) {
      const angle = (Math.PI * 2 / spikeCount) * i + spikePulse * 0.2;
      const innerR = radius;
      const outerR = radius + spikeLength;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(angle) * innerR, y + Math.sin(angle) * innerR);
      ctx.lineTo(x + Math.cos(angle) * outerR, y + Math.sin(angle) * outerR);
      ctx.stroke();
    }

    ctx.fillStyle = "#606068";
    ctx.beginPath();
    ctx.arc(x - radius * 0.3, y - radius * 0.3, radius * 0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = (radius * 0.8) + "px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("💣", x, y + radius * 0.05);

    ctx.restore();
  }

  function drawPopEffects() {
    for (const effect of game.popEffects) {
      const progress = 1 - effect.life / effect.maxLife;
      const scale = 1 + progress * 0.8;
      const alpha = 1 - progress;

      ctx.save();
      ctx.globalAlpha = alpha * 0.6;
      ctx.translate(effect.x, effect.y);
      ctx.scale(scale, scale);

      ctx.beginPath();
      ctx.arc(0, 0, effect.radius, 0, Math.PI * 2);
      ctx.strokeStyle = effect.color.stroke;
      ctx.lineWidth = 4;
      ctx.stroke();

      const ringRadius = effect.radius * (1 + progress * 0.5);
      ctx.beginPath();
      ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
      ctx.strokeStyle = effect.color.glow;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.restore();
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
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawFloatingTexts() {
    for (const ft of game.floatingTexts) {
      const alpha = clamp(ft.life / ft.maxLife, 0, 1);
      const baseScale = ft.scale || 1;
      const scale = (0.8 + alpha * 0.4) * baseScale;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(ft.x, ft.y);
      ctx.scale(scale, scale);
      ctx.font = '800 32px "Comic Sans MS", "Trebuchet MS", system-ui, sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 6;
      ctx.strokeStyle = "#ffffff";
      ctx.strokeText(ft.text, 0, 0);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, 0, 0);
      ctx.restore();
    }
  }

  function drawComboIndicator() {
    if (game.combo < 2 || phase !== "running") return;

    const text = "x" + game.combo + " COMBO!";
    const x = CONFIG.WORLD_W / 2;
    const y = 50;
    
    const pulse = Math.sin(performance.now() / 100) * 0.1 + 1;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pulse, pulse);
    ctx.font = '800 36px "Comic Sans MS", "Trebuchet MS", system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 8;
    ctx.strokeStyle = "#ffffff";
    ctx.strokeText(text, 0, 0);
    
    const colors = ["#ff4d4d", "#ff9f1c", "#ffd60a", "#2ec46a", "#2d9cff"];
    ctx.fillStyle = colors[Math.min(game.combo - 1, colors.length - 1)];
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  /* ======================================================================
     9. MAIN LOOP
     ====================================================================== */
  let lastTime = 0;

  function loop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
    lastTime = timestamp;

    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  /* ======================================================================
     10. OVERLAYS + DISPLAY
     ====================================================================== */
  const startOverlay = document.getElementById("startOverlay");
  const pauseOverlay = document.getElementById("pauseOverlay");
  const gameOverOverlay = document.getElementById("gameOverOverlay");
  const levelOverlay = document.getElementById("levelOverlay");
  const newBubbleOverlay = document.getElementById("newBubbleOverlay");
  const slowmoTint = document.getElementById("slowmoTint");

  const scoreValueEl = document.getElementById("scoreValue");
  const bestValueEl = document.getElementById("bestValue");
  const livesValueEl = document.getElementById("livesValue");
  const livesChip = document.getElementById("livesChip");
  const levelChip = document.getElementById("levelChip");
  const levelValueEl = document.getElementById("levelValue");
  const progressFillEl = document.getElementById("progressFill");

  const finalScoreEl = document.getElementById("finalScore");
  const finalBestEl = document.getElementById("finalBest");
  const finalLevelEl = document.getElementById("finalLevel");
  const finalBestLevelEl = document.getElementById("finalBestLevel");
  const newBestBanner = document.getElementById("newBestBanner");
  const gameOverEmoji = document.getElementById("gameOverEmoji");

  const levelCompleteTitleEl = document.getElementById("levelCompleteTitle");
  const levelStarsEl = document.getElementById("levelStars");
  const levelMessageEl = document.getElementById("levelMessage");

  const newBubbleEmojiEl = document.getElementById("newBubbleEmoji");
  const newBubbleNameEl = document.getElementById("newBubbleName");
  const newBubbleDescEl = document.getElementById("newBubbleDesc");

  function showOverlay(el) {
    el.classList.remove("is-hidden");
  }
  function hideOverlay(el) {
    el.classList.add("is-hidden");
  }

  let shownScore = -1;
  let shownBest = -1;

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
  }

  function updateLivesDisplay() {
    const hearts = [];
    for (let i = 0; i < CONFIG.MAX_LIVES; i++) {
      hearts.push(i < game.lives ? "❤️" : "🖤");
    }
    livesValueEl.textContent = hearts.join("");
  }

  function updateLevelDisplay() {
    levelValueEl.textContent = game.level;
  }

  function updateLevelProgress() {
    const cfg = getLevelConfig();
    const pct = Math.min(100, (game.poppedThisLevel / cfg.goal) * 100);
    progressFillEl.style.width = pct + "%";
    
    if (pct >= 100) {
      levelChip.classList.add("is-complete");
    } else {
      levelChip.classList.remove("is-complete");
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
  document.getElementById("nextLevelButton").addEventListener("click", function () {
    resumeAudio();
    startNextLevel();
  });
  document.getElementById("gotItButton").addEventListener("click", function () {
    resumeAudio();
    dismissNewBubbleIntro();
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) pauseRun();
    lastTime = 0;
  });
  window.addEventListener("blur", pauseRun);

  /* --- localStorage ------------------------------------------------------- */
  function loadBest() {
    try {
      const saved = parseInt(window.localStorage.getItem(CONFIG.STORAGE_BEST), 10);
      return Number.isFinite(saved) && saved > 0 ? saved : 0;
    } catch (err) {
      return 0;
    }
  }

  function saveBest(value) {
    try {
      window.localStorage.setItem(CONFIG.STORAGE_BEST, String(value));
    } catch (err) {}
  }

  function loadBestLevel() {
    try {
      const saved = parseInt(window.localStorage.getItem(CONFIG.STORAGE_BEST_LEVEL), 10);
      return Number.isFinite(saved) && saved > 0 ? saved : 1;
    } catch (err) {
      return 1;
    }
  }

  function saveBestLevel(value) {
    try {
      window.localStorage.setItem(CONFIG.STORAGE_BEST_LEVEL, String(value));
    } catch (err) {}
  }

  /* ======================================================================
     11. SOUND
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
    soundButton.blur();
    soundOn = !soundOn;
    try {
      window.localStorage.setItem(CONFIG.STORAGE_SOUND, soundOn ? "on" : "off");
    } catch (err) {}
    renderSoundButton();
    if (soundOn) {
      resumeAudio();
      playPop(40, 1);
    }
  });

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

  function playPop(radius, combo) {
    if (!soundOn || !audioCtx) return;

    const now = audioCtx.currentTime;
    const pitchMult = 1 + (combo - 1) * 0.12;
    const baseFreq = (600 - radius * 4) * pitchMult;
    const duration = 0.12 + radius * 0.001;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 2.5, now + 0.03);
    osc.frequency.exponentialRampToValueAtTime(Math.max(baseFreq * 0.5, 50), now + duration);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);

    const noise = audioCtx.createOscillator();
    const noiseGain = audioCtx.createGain();
    noise.type = "triangle";
    noise.frequency.setValueAtTime(1200 * pitchMult, now);
    noise.frequency.exponentialRampToValueAtTime(200, now + 0.08);
    noiseGain.gain.setValueAtTime(0.08, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    noise.connect(noiseGain).connect(audioCtx.destination);
    noise.start(now);
    noise.stop(now + 0.1);
  }

  function playMiss() {
    if (!soundOn || !audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.25);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.27);
  }

  function playBombHit() {
    if (!soundOn || !audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.4);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.42);
  }

  function playHeal() {
    if (!soundOn || !audioCtx) return;
    playNotes([523, 659, 784], 80, 0.15, 0.1);
  }

  function playSlowmo() {
    if (!soundOn || !audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.5);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.52);
  }

  function playRainbow() {
    if (!soundOn || !audioCtx) return;
    playNotes([523, 587, 659, 698, 784, 880, 988, 1047], 50, 0.12, 0.08);
  }

  function playGameOver() {
    if (!soundOn || !audioCtx) return;
    playNotes([392, 349, 330, 262], 150, 0.3, 0.1);
  }

  function playLevelComplete() {
    if (!soundOn || !audioCtx) return;
    playNotes([523, 659, 784, 880, 1047], 100, 0.2, 0.1);
  }

  function playFanfare() {
    playNotes([523, 659, 784, 1047], 130, 0.22, 0.09);
  }

  function playNotes(notes, spacingMs, duration, volume) {
    if (!soundOn || !audioCtx) return;
    notes.forEach(function (freq, i) {
      setTimeout(function () {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.02, now + duration);
        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + duration + 0.02);
      }, i * spacingMs);
    });
  }

  /* ======================================================================
     12. BOOT
     ====================================================================== */
  resizeCanvas();
  renderSoundButton();
  updateScoreDisplay();
  updateLivesDisplay();
  updateLevelDisplay();
  updateLevelProgress();
  requestAnimationFrame(loop);
})();
