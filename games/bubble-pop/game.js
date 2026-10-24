/* ==========================================================================
   BUBBLE POP  🫧
   A gentle, tap-to-pop bubble game for a 7-year-old.

   How it fits together
   --------------------
   1. CONFIG          - every tunable number lives here (difficulty, sizes...)
   2. Canvas setup    - fixed 800x600 "world" scaled up to whatever size the
                        stage happens to be, so all game code uses simple
                        world coordinates and never worries about screen size.
   3. State           - one `game` object holding everything that changes.
   4. Input           - mouse click / tap to pop bubbles.
   5. update(dt)      - moves the world forward by dt seconds.
   6. draw()          - paints the scene.
   7. Overlays, score, sound helpers.
   ========================================================================== */

(function () {
  "use strict";

  /* ======================================================================
     1. CONFIG — tweak these to make the game easier or harder
     ====================================================================== */
  const CONFIG = {
    WORLD_W: 800,
    WORLD_H: 600,

    MAX_LIVES: 5,

    BUBBLE_MIN_RADIUS: 28,
    BUBBLE_MAX_RADIUS: 52,
    BUBBLE_TAP_PADDING: 12,

    BUBBLE_BASE_SPEED: 55,
    BUBBLE_SPEED_VARIANCE: 35,

    SPAWN_INTERVAL_START: 1.4,
    SPAWN_INTERVAL_MIN: 0.45,
    SPAWN_RAMP_TIME: 90,

    SPEED_MULTIPLIER_MAX: 2.2,
    SPEED_RAMP_TIME: 120,

    POINTS_BASE: 10,
    POINTS_PER_SIZE: 0.3,

    GRACE_PERIOD: 3.5,

    POP_PARTICLE_COUNT: 12,
    POP_ANIMATION_DURATION: 0.35,

    STORAGE_BEST: "badri.bubble-pop.best",
    STORAGE_SOUND: "badri.bubble-pop.sound",
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

  function lerp(a, b, t) {
    return a + (b - a) * t;
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
    lives: CONFIG.MAX_LIVES,
    spawnTimer: 0,
    gameOverTimer: 0,

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
    tryPopBubbleAt(pos.x, pos.y);
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

    const points = Math.round(CONFIG.POINTS_BASE + bubble.radius * CONFIG.POINTS_PER_SIZE);
    game.score += points;
    updateScoreDisplay();

    spawnPopEffect(bubble);
    spawnFloatingText(bubble.x, bubble.y - bubble.radius, "+" + points);
    playPop(bubble.radius);
  }

  /* ======================================================================
     5. RUN LIFECYCLE
     ====================================================================== */
  function startRun() {
    game.elapsed = 0;
    game.score = 0;
    game.lives = CONFIG.MAX_LIVES;
    game.spawnTimer = 0;
    game.gameOverTimer = 0;
    game.bubbles.length = 0;
    game.particles.length = 0;
    game.popEffects.length = 0;
    game.floatingTexts.length = 0;

    hideOverlay(startOverlay);
    hideOverlay(pauseOverlay);
    hideOverlay(gameOverOverlay);
    updateScoreDisplay();
    updateLivesDisplay();
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
    game.gameOverTimer = 0;
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
    gameOverEmoji.textContent = isNewBest ? "🏆" : "😢";
    newBestBanner.classList.toggle("is-hidden", !isNewBest);
    updateScoreDisplay();

    setTimeout(function () {
      if (phase === "over") showOverlay(gameOverOverlay);
    }, 600);
  }

  /* ======================================================================
     6. UPDATE — move everything forward by dt seconds
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

    game.elapsed += dt;

    updateBubbles(dt);
    updateSpawning(dt);
    updateScoreDisplay();
  }

  function updateBubbles(dt) {
    const speedMult = getSpeedMultiplier();

    for (let i = game.bubbles.length - 1; i >= 0; i--) {
      const bubble = game.bubbles[i];

      bubble.wobblePhase += bubble.wobbleSpeed * dt;
      const wobble = Math.sin(bubble.wobblePhase) * bubble.wobbleAmount;
      bubble.x += wobble * dt * 30;

      bubble.y -= bubble.speed * speedMult * dt;

      bubble.shimmer = (bubble.shimmer + dt * 2) % (Math.PI * 2);

      if (bubble.y + bubble.radius < -20) {
        game.bubbles.splice(i, 1);

        if (game.elapsed > CONFIG.GRACE_PERIOD) {
          loseLife();
        }
      }
    }
  }

  function loseLife() {
    game.lives--;
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
      game.spawnTimer = getSpawnInterval();
    }
  }

  function getSpawnInterval() {
    const t = clamp(game.elapsed / CONFIG.SPAWN_RAMP_TIME, 0, 1);
    const interval = lerp(CONFIG.SPAWN_INTERVAL_START, CONFIG.SPAWN_INTERVAL_MIN, t);
    return interval * (0.7 + Math.random() * 0.6);
  }

  function getSpeedMultiplier() {
    const t = clamp(game.elapsed / CONFIG.SPEED_RAMP_TIME, 0, 1);
    return lerp(1, CONFIG.SPEED_MULTIPLIER_MAX, t);
  }

  function spawnBubble() {
    const radius = CONFIG.BUBBLE_MIN_RADIUS + Math.random() * (CONFIG.BUBBLE_MAX_RADIUS - CONFIG.BUBBLE_MIN_RADIUS);
    const colorData = BUBBLE_COLORS[Math.floor(Math.random() * BUBBLE_COLORS.length)];

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

  function spawnFloatingText(x, y, text) {
    game.floatingTexts.push({
      x: x,
      y: y,
      text: text,
      life: 1,
      maxLife: 1,
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
      ft.life -= dt * 1.2;
      ft.y -= 50 * dt;
      if (ft.life <= 0) {
        game.floatingTexts.splice(i, 1);
      }
    }
  }

  /* ======================================================================
     7. DRAW
     ====================================================================== */
  function draw() {
    const W = CONFIG.WORLD_W;
    const H = CONFIG.WORLD_H;

    drawBackground(W, H);
    drawBubbles();
    drawPopEffects();
    drawParticles();
    drawFloatingTexts();
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
      drawBubble(bubble);
    }
  }

  function drawBubble(bubble) {
    const { x, y, radius, color, shimmer } = bubble;

    ctx.save();

    ctx.shadowColor = color.glow;
    ctx.shadowBlur = 15;

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
    ctx.lineWidth = 3;
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
      const scale = 0.8 + alpha * 0.4;

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
      ctx.fillStyle = "#ff9f1c";
      ctx.fillText(ft.text, 0, 0);
      ctx.restore();
    }
  }

  /* ======================================================================
     8. MAIN LOOP
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
     9. OVERLAYS + SCORE DISPLAY
     ====================================================================== */
  const startOverlay = document.getElementById("startOverlay");
  const pauseOverlay = document.getElementById("pauseOverlay");
  const gameOverOverlay = document.getElementById("gameOverOverlay");
  const scoreValueEl = document.getElementById("scoreValue");
  const bestValueEl = document.getElementById("bestValue");
  const livesValueEl = document.getElementById("livesValue");
  const livesChip = document.getElementById("livesChip");
  const finalScoreEl = document.getElementById("finalScore");
  const finalBestEl = document.getElementById("finalBest");
  const newBestBanner = document.getElementById("newBestBanner");
  const gameOverEmoji = document.getElementById("gameOverEmoji");

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
      return 0;
    }
  }

  function saveBest(value) {
    try {
      window.localStorage.setItem(CONFIG.STORAGE_BEST, String(value));
    } catch (err) {
      /* ignore */
    }
  }

  /* ======================================================================
     10. SOUND — WebAudio pop sounds with mute toggle
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
    } catch (err) {
      /* ignore */
    }
    renderSoundButton();
    if (soundOn) {
      resumeAudio();
      playPop(40);
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

  function playPop(radius) {
    if (!soundOn || !audioCtx) return;

    const now = audioCtx.currentTime;
    const baseFreq = 600 - radius * 4;
    const duration = 0.12 + radius * 0.001;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 2.5, now + 0.03);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.5, now + duration);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);

    const noise = audioCtx.createOscillator();
    const noiseGain = audioCtx.createGain();
    noise.type = "triangle";
    noise.frequency.setValueAtTime(1200, now);
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

  function playGameOver() {
    if (!soundOn || !audioCtx) return;
    playNotes([392, 349, 330, 262], 150, 0.3, 0.1);
  }

  function playFanfare() {
    playNotes([523, 659, 784, 1047], 130, 0.22, 0.09);
  }

  function playNotes(notes, spacingMs, duration, volume) {
    if (!soundOn || !audioCtx) return;
    notes.forEach(function (freq, i) {
      setTimeout(function () {
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
     11. BOOT
     ====================================================================== */
  resizeCanvas();
  renderSoundButton();
  updateScoreDisplay();
  updateLivesDisplay();
  requestAnimationFrame(loop);
})();
