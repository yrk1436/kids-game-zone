/* ==========================================================================
   TARGET ARCHERY  🏹
   Drag to aim, release to shoot arrows at moving targets!

   Features:
   - Drag anywhere to aim, release to shoot
   - Arrow follows a parabolic arc
   - Colorful ringed targets that move (faster each level)
   - Points by ring (bullseye = 100, red = 50, blue = 25, white = 10)
   - Limited arrows per round
   - Multiple levels with increasing difficulty
   - Score + best score saved in localStorage
   - WebAudio sound effects with mute toggle
   - Touch-first design for kids

   Built to match the kids-game-hub style.
   ========================================================================== */

(function () {
  "use strict";

  /* ======================================================================
     1. CONFIG — tweak these to adjust difficulty and pacing
     ====================================================================== */
  const CONFIG = {
    ARROWS_PER_LEVEL: 5,
    TOTAL_LEVELS: 5,

    RING_POINTS: {
      bullseye: 100,
      red: 50,
      blue: 25,
      white: 10,
    },

    TARGET_BASE_SPEED: 0.5,
    TARGET_SPEED_INCREMENT: 0.3,

    ARROW_GRAVITY: 0.15,
    ARROW_POWER_SCALE: 0.12,
    MAX_POWER: 25,

    TARGET_SIZE_RATIO: 0.22,

    STORAGE_BEST_SCORE: "badri.archery.best",
    STORAGE_BEST_LEVEL: "badri.archery.bestlevel",
    STORAGE_SOUND: "badri.archery.sound",
  };

  /* ======================================================================
     2. STATE
     ====================================================================== */
  let phase = "ready";

  const game = {
    score: 0,
    best: loadBest(),
    bestLevel: loadBestLevel(),
    level: 1,
    arrowsLeft: CONFIG.ARROWS_PER_LEVEL,
    levelScore: 0,

    target: {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 60,
      bounceMode: "horizontal",
    },

    bow: {
      x: 0,
      y: 0,
    },

    arrow: {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      flying: false,
      angle: 0,
    },

    aiming: {
      active: false,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
    },

    particles: [],
    hitEffects: [],
  };

  /* ======================================================================
     3. DOM REFS
     ====================================================================== */
  const stage = document.getElementById("stage");
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const arrowsBar = document.getElementById("arrowsBar");

  const startOverlay = document.getElementById("startOverlay");
  const pauseOverlay = document.getElementById("pauseOverlay");
  const levelCompleteOverlay = document.getElementById("levelCompleteOverlay");
  const gameOverOverlay = document.getElementById("gameOverOverlay");
  const helpOverlay = document.getElementById("helpOverlay");

  const scoreValueEl = document.getElementById("scoreValue");
  const bestValueEl = document.getElementById("bestValue");
  const levelValueEl = document.getElementById("levelValue");
  const levelChip = document.getElementById("levelChip");

  const levelScoreEl = document.getElementById("levelScore");
  const levelCompleteTitle = document.getElementById("levelCompleteTitle");
  const finalScoreEl = document.getElementById("finalScore");
  const finalBestEl = document.getElementById("finalBest");
  const finalLevelEl = document.getElementById("finalLevel");
  const newBestBanner = document.getElementById("newBestBanner");
  const gameOverEmoji = document.getElementById("gameOverEmoji");

  /* ======================================================================
     4. CANVAS SETUP
     ====================================================================== */
  let canvasW = 0;
  let canvasH = 0;

  function resizeCanvas() {
    const rect = stage.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvasW = rect.width;
    canvasH = rect.height;
    canvas.width = canvasW * dpr;
    canvas.height = canvasH * dpr;
    canvas.style.width = canvasW + "px";
    canvas.style.height = canvasH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    game.bow.x = canvasW * 0.12;
    game.bow.y = canvasH * 0.85;

    game.target.radius = canvasW * CONFIG.TARGET_SIZE_RATIO;

    if (!game.arrow.flying) {
      game.arrow.x = game.bow.x;
      game.arrow.y = game.bow.y;
    }
  }

  window.addEventListener("resize", resizeCanvas);

  /* ======================================================================
     5. ARROWS BAR
     ====================================================================== */
  function renderArrows() {
    arrowsBar.innerHTML = "";
    for (let i = 0; i < CONFIG.ARROWS_PER_LEVEL; i++) {
      const arrow = document.createElement("span");
      arrow.className = "arrow-icon" + (i >= game.arrowsLeft ? " is-used" : "");
      arrow.textContent = i < game.arrowsLeft ? "🏹" : "➖";
      arrowsBar.appendChild(arrow);
    }
  }

  /* ======================================================================
     6. TARGET
     ====================================================================== */
  function initTarget() {
    const r = game.target.radius;
    const padding = r + 20;

    game.target.x = canvasW * 0.7;
    game.target.y = canvasH * 0.3;

    const speed = CONFIG.TARGET_BASE_SPEED + (game.level - 1) * CONFIG.TARGET_SPEED_INCREMENT;

    if (game.level <= 2) {
      game.target.bounceMode = "horizontal";
      game.target.vx = speed * (Math.random() > 0.5 ? 1 : -1);
      game.target.vy = 0;
    } else if (game.level <= 4) {
      game.target.bounceMode = "vertical";
      game.target.vx = 0;
      game.target.vy = speed * (Math.random() > 0.5 ? 1 : -1);
    } else {
      game.target.bounceMode = "diagonal";
      game.target.vx = speed * 0.7 * (Math.random() > 0.5 ? 1 : -1);
      game.target.vy = speed * 0.7 * (Math.random() > 0.5 ? 1 : -1);
    }
  }

  function updateTarget() {
    const t = game.target;
    const r = t.radius;
    const padding = 10;

    t.x += t.vx;
    t.y += t.vy;

    const minX = canvasW * 0.4 + r;
    const maxX = canvasW - r - padding;
    const minY = r + padding + 40;
    const maxY = canvasH * 0.6;

    if (t.x < minX) {
      t.x = minX;
      t.vx = Math.abs(t.vx);
    }
    if (t.x > maxX) {
      t.x = maxX;
      t.vx = -Math.abs(t.vx);
    }
    if (t.y < minY) {
      t.y = minY;
      t.vy = Math.abs(t.vy);
    }
    if (t.y > maxY) {
      t.y = maxY;
      t.vy = -Math.abs(t.vy);
    }
  }

  function drawTarget() {
    const t = game.target;
    const r = t.radius;

    ctx.save();

    ctx.beginPath();
    ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(t.x, t.y, r * 0.75, 0, Math.PI * 2);
    ctx.fillStyle = "#2d9cff";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(t.x, t.y, r * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = "#ff4d4d";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(t.x, t.y, r * 0.25, 0, Math.PI * 2);
    const gradient = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, r * 0.25);
    gradient.addColorStop(0, "#ffd700");
    gradient.addColorStop(1, "#ffaa00");
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.shadowColor = "rgba(255, 215, 0, 0.6)";
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(t.x, t.y, r * 0.25, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /* ======================================================================
     7. BOW
     ====================================================================== */
  function drawBow() {
    const bx = game.bow.x;
    const by = game.bow.y;

    ctx.save();

    let angle = -Math.PI / 4;
    let pullBack = 0;

    if (game.aiming.active) {
      const dx = game.aiming.currentX - game.aiming.startX;
      const dy = game.aiming.currentY - game.aiming.startY;
      angle = Math.atan2(-dy, -dx);
      pullBack = Math.min(Math.sqrt(dx * dx + dy * dy) * 0.3, 30);
    }

    ctx.translate(bx, by);
    ctx.rotate(angle + Math.PI / 2);

    const bowHeight = 80;
    const bowWidth = 25;

    ctx.beginPath();
    ctx.moveTo(0, -bowHeight / 2);
    ctx.quadraticCurveTo(-bowWidth - pullBack * 0.3, 0, 0, bowHeight / 2);
    ctx.strokeStyle = "#8B4513";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, -bowHeight / 2);
    ctx.lineTo(-pullBack, 0);
    ctx.lineTo(0, bowHeight / 2);
    ctx.strokeStyle = "#ddd";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();

    if (game.aiming.active && !game.arrow.flying) {
      drawAimingArrow(angle, pullBack);
    }
  }

  function drawAimingArrow(angle, pullBack) {
    const bx = game.bow.x;
    const by = game.bow.y;

    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(angle);

    const arrowLength = 50;

    ctx.beginPath();
    ctx.moveTo(-pullBack, 0);
    ctx.lineTo(-pullBack + arrowLength, 0);
    ctx.strokeStyle = "#5D4037";
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-pullBack + arrowLength, 0);
    ctx.lineTo(-pullBack + arrowLength - 12, -6);
    ctx.lineTo(-pullBack + arrowLength - 12, 6);
    ctx.closePath();
    ctx.fillStyle = "#666";
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-pullBack, -4);
    ctx.lineTo(-pullBack - 15, -8);
    ctx.lineTo(-pullBack - 15, 8);
    ctx.lineTo(-pullBack, 4);
    ctx.fillStyle = "#ff5ea8";
    ctx.fill();

    ctx.restore();

    if (pullBack > 10) {
      drawTrajectoryPreview(angle, pullBack);
    }
  }

  function drawTrajectoryPreview(angle, pullBack) {
    const power = Math.min(pullBack * CONFIG.ARROW_POWER_SCALE * 2, CONFIG.MAX_POWER);
    let px = game.bow.x;
    let py = game.bow.y;
    let pvx = Math.cos(angle) * power;
    let pvy = Math.sin(angle) * power;

    ctx.save();
    ctx.setLineDash([5, 10]);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, py);

    for (let i = 0; i < 20; i++) {
      px += pvx;
      pvy += CONFIG.ARROW_GRAVITY;
      py += pvy;

      if (px > canvasW || py > canvasH || py < 0) break;

      ctx.lineTo(px, py);
    }

    ctx.stroke();
    ctx.restore();
  }

  /* ======================================================================
     8. FLYING ARROW
     ====================================================================== */
  function updateArrow() {
    if (!game.arrow.flying) return;

    const a = game.arrow;
    a.vy += CONFIG.ARROW_GRAVITY;
    a.x += a.vx;
    a.y += a.vy;
    a.angle = Math.atan2(a.vy, a.vx);

    if (checkTargetHit()) {
      return;
    }

    if (a.x > canvasW + 50 || a.y > canvasH + 50 || a.y < -50 || a.x < -50) {
      arrowMissed();
    }
  }

  function drawArrow() {
    if (!game.arrow.flying) return;

    const a = game.arrow;
    const length = 40;

    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(a.angle);

    ctx.beginPath();
    ctx.moveTo(-length / 2, 0);
    ctx.lineTo(length / 2, 0);
    ctx.strokeStyle = "#5D4037";
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(length / 2, 0);
    ctx.lineTo(length / 2 - 12, -6);
    ctx.lineTo(length / 2 - 12, 6);
    ctx.closePath();
    ctx.fillStyle = "#666";
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-length / 2, -4);
    ctx.lineTo(-length / 2 - 15, -8);
    ctx.lineTo(-length / 2 - 15, 8);
    ctx.lineTo(-length / 2, 4);
    ctx.fillStyle = "#ff5ea8";
    ctx.fill();

    ctx.restore();
  }

  function shootArrow() {
    if (game.arrow.flying || game.arrowsLeft <= 0) return;

    const dx = game.aiming.currentX - game.aiming.startX;
    const dy = game.aiming.currentY - game.aiming.startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 20) return;

    const power = Math.min(dist * CONFIG.ARROW_POWER_SCALE, CONFIG.MAX_POWER);
    const angle = Math.atan2(-dy, -dx);

    game.arrow.x = game.bow.x;
    game.arrow.y = game.bow.y;
    game.arrow.vx = Math.cos(angle) * power;
    game.arrow.vy = Math.sin(angle) * power;
    game.arrow.angle = angle;
    game.arrow.flying = true;

    game.arrowsLeft--;
    renderArrows();

    playShoot();
  }

  function checkTargetHit() {
    const a = game.arrow;
    const t = game.target;
    const dx = a.x - t.x;
    const dy = a.y - t.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > t.radius) return false;

    let points = 0;
    let ring = "";

    if (dist <= t.radius * 0.25) {
      points = CONFIG.RING_POINTS.bullseye;
      ring = "bullseye";
    } else if (dist <= t.radius * 0.5) {
      points = CONFIG.RING_POINTS.red;
      ring = "red";
    } else if (dist <= t.radius * 0.75) {
      points = CONFIG.RING_POINTS.blue;
      ring = "blue";
    } else {
      points = CONFIG.RING_POINTS.white;
      ring = "white";
    }

    game.score += points;
    game.levelScore += points;
    updateScoreDisplay();

    game.arrow.flying = false;
    createHitEffect(a.x, a.y, points, ring);
    createParticles(a.x, a.y, ring);

    if (ring === "bullseye") {
      playBullseye();
    } else {
      playHit();
    }

    setTimeout(() => {
      checkRoundEnd();
    }, 500);

    return true;
  }

  function arrowMissed() {
    game.arrow.flying = false;
    playMiss();
    setTimeout(() => {
      checkRoundEnd();
    }, 300);
  }

  function checkRoundEnd() {
    if (game.arrowsLeft <= 0) {
      if (game.level >= CONFIG.TOTAL_LEVELS) {
        endGame();
      } else {
        showLevelComplete();
      }
    }
  }

  /* ======================================================================
     9. PARTICLES & EFFECTS
     ====================================================================== */
  function createParticles(x, y, ring) {
    const colors = {
      bullseye: ["#ffd700", "#ffaa00", "#fff"],
      red: ["#ff4d4d", "#ff6b6b", "#fff"],
      blue: ["#2d9cff", "#5bb3ff", "#fff"],
      white: ["#fff", "#ddd", "#eee"],
    };

    const ringColors = colors[ring] || colors.white;
    const count = ring === "bullseye" ? 30 : 15;

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const speed = 2 + Math.random() * 4;
      game.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 3 + Math.random() * 4,
        color: ringColors[Math.floor(Math.random() * ringColors.length)],
        life: 1,
        decay: 0.02 + Math.random() * 0.02,
      });
    }
  }

  function updateParticles() {
    for (let i = game.particles.length - 1; i >= 0; i--) {
      const p = game.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1;
      p.life -= p.decay;

      if (p.life <= 0) {
        game.particles.splice(i, 1);
      }
    }
  }

  function drawParticles() {
    for (const p of game.particles) {
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * p.life, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.restore();
    }
  }

  function createHitEffect(x, y, points, ring) {
    game.hitEffects.push({
      x,
      y,
      points,
      ring,
      life: 1,
      scale: 0,
    });
  }

  function updateHitEffects() {
    for (let i = game.hitEffects.length - 1; i >= 0; i--) {
      const e = game.hitEffects[i];
      e.life -= 0.02;
      e.scale = Math.min(e.scale + 0.15, 1);
      e.y -= 1;

      if (e.life <= 0) {
        game.hitEffects.splice(i, 1);
      }
    }
  }

  function drawHitEffects() {
    for (const e of game.hitEffects) {
      ctx.save();
      ctx.globalAlpha = e.life;
      ctx.translate(e.x, e.y);
      ctx.scale(e.scale, e.scale);

      ctx.font = "bold 28px 'Baloo 2', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.strokeStyle = "#333";
      ctx.lineWidth = 4;
      ctx.strokeText("+" + e.points, 0, 0);

      const colors = {
        bullseye: "#ffd700",
        red: "#ff4d4d",
        blue: "#2d9cff",
        white: "#fff",
      };
      ctx.fillStyle = colors[e.ring] || "#fff";
      ctx.fillText("+" + e.points, 0, 0);

      if (e.ring === "bullseye") {
        ctx.font = "bold 20px sans-serif";
        ctx.fillText("🎯", 0, -35);
      }

      ctx.restore();
    }
  }

  /* ======================================================================
     10. GAME LOOP
     ====================================================================== */
  let lastTime = 0;
  let animationId = null;

  function gameLoop(timestamp) {
    const delta = timestamp - lastTime;
    lastTime = timestamp;

    if (phase === "running") {
      updateTarget();
      updateArrow();
      updateParticles();
      updateHitEffects();
    }

    render();

    animationId = requestAnimationFrame(gameLoop);
  }

  function render() {
    ctx.clearRect(0, 0, canvasW, canvasH);

    drawGrass();
    drawTarget();
    drawBow();
    drawArrow();
    drawParticles();
    drawHitEffects();
  }

  function drawGrass() {
    const grassY = canvasH * 0.85;
    ctx.fillStyle = "#5da33e";
    ctx.fillRect(0, grassY, canvasW, canvasH - grassY);

    ctx.strokeStyle = "#4a9030";
    ctx.lineWidth = 2;
    for (let x = 0; x < canvasW; x += 15) {
      const h = 8 + Math.random() * 12;
      ctx.beginPath();
      ctx.moveTo(x, grassY);
      ctx.lineTo(x + 3, grassY - h);
      ctx.stroke();
    }
  }

  /* ======================================================================
     11. INPUT HANDLING
     ====================================================================== */
  function getPointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    };
  }

  function onPointerDown(e) {
    if (phase !== "running" || game.arrow.flying || game.arrowsLeft <= 0) return;

    e.preventDefault();
    const pos = getPointerPos(e);
    game.aiming.active = true;
    game.aiming.startX = pos.x;
    game.aiming.startY = pos.y;
    game.aiming.currentX = pos.x;
    game.aiming.currentY = pos.y;
  }

  function onPointerMove(e) {
    if (!game.aiming.active) return;

    e.preventDefault();
    const pos = getPointerPos(e);
    game.aiming.currentX = pos.x;
    game.aiming.currentY = pos.y;
  }

  function onPointerUp(e) {
    if (!game.aiming.active) return;

    e.preventDefault();
    game.aiming.active = false;
    shootArrow();
  }

  canvas.addEventListener("mousedown", onPointerDown);
  canvas.addEventListener("mousemove", onPointerMove);
  canvas.addEventListener("mouseup", onPointerUp);
  canvas.addEventListener("mouseleave", onPointerUp);

  canvas.addEventListener("touchstart", onPointerDown, { passive: false });
  canvas.addEventListener("touchmove", onPointerMove, { passive: false });
  canvas.addEventListener("touchend", onPointerUp, { passive: false });
  canvas.addEventListener("touchcancel", onPointerUp, { passive: false });

  /* ======================================================================
     12. GAME LIFECYCLE
     ====================================================================== */
  function startGame() {
    game.score = 0;
    game.level = 1;
    game.arrowsLeft = CONFIG.ARROWS_PER_LEVEL;
    game.levelScore = 0;
    game.arrow.flying = false;
    game.particles = [];
    game.hitEffects = [];

    resizeCanvas();
    initTarget();
    renderArrows();
    updateScoreDisplay();

    hideAllOverlays();
    phase = "running";

    if (!animationId) {
      animationId = requestAnimationFrame(gameLoop);
    }
  }

  function nextLevel() {
    game.level++;
    game.arrowsLeft = CONFIG.ARROWS_PER_LEVEL;
    game.levelScore = 0;
    game.arrow.flying = false;
    game.particles = [];
    game.hitEffects = [];

    initTarget();
    renderArrows();
    updateScoreDisplay();

    levelChip.classList.remove("is-levelling");
    void levelChip.offsetWidth;
    levelChip.classList.add("is-levelling");

    hideAllOverlays();
    phase = "running";

    playLevelUp();
  }

  function showLevelComplete() {
    phase = "levelcomplete";
    levelScoreEl.textContent = game.levelScore;
    levelCompleteTitle.textContent = "Level " + game.level + " Complete!";
    showOverlay(levelCompleteOverlay);
    playLevelUp();
  }

  function endGame() {
    phase = "over";

    const isNewBest = game.score > game.best;
    if (isNewBest) {
      game.best = game.score;
      saveBest(game.score);
    }
    if (game.level > game.bestLevel) {
      game.bestLevel = game.level;
      saveBestLevel(game.level);
    }

    finalScoreEl.textContent = game.score;
    finalBestEl.textContent = game.best;
    finalLevelEl.textContent = game.level;
    gameOverEmoji.textContent = isNewBest ? "🏆" : "🎯";
    newBestBanner.classList.toggle("is-hidden", !isNewBest);

    updateScoreDisplay();

    if (isNewBest) {
      playFanfare();
    }

    setTimeout(() => {
      showOverlay(gameOverOverlay);
    }, 300);
  }

  function pauseGame() {
    if (phase !== "running") return;
    phase = "paused";
    showOverlay(pauseOverlay);
  }

  function resumeGame() {
    if (phase !== "paused") return;
    hideOverlay(pauseOverlay);
    phase = "running";
  }

  /* ======================================================================
     13. UI HELPERS
     ====================================================================== */
  function showOverlay(el) {
    el.classList.remove("is-hidden");
  }

  function hideOverlay(el) {
    el.classList.add("is-hidden");
  }

  function hideAllOverlays() {
    hideOverlay(startOverlay);
    hideOverlay(pauseOverlay);
    hideOverlay(levelCompleteOverlay);
    hideOverlay(gameOverOverlay);
    hideOverlay(helpOverlay);
  }

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

  /* ======================================================================
     14. EVENT LISTENERS
     ====================================================================== */
  document.getElementById("startButton").addEventListener("click", () => {
    resumeAudio();
    startGame();
  });

  document.getElementById("playAgainButton").addEventListener("click", () => {
    resumeAudio();
    startGame();
  });

  document.getElementById("nextLevelButton").addEventListener("click", () => {
    resumeAudio();
    nextLevel();
  });

  document.getElementById("resumeButton").addEventListener("click", () => {
    resumeAudio();
    resumeGame();
  });

  document.getElementById("helpButton").addEventListener("click", () => {
    if (phase === "running") pauseGame();
    showOverlay(helpOverlay);
  });

  document.getElementById("startHelpButton").addEventListener("click", () => {
    showOverlay(helpOverlay);
  });

  document.getElementById("closeHelpButton").addEventListener("click", () => {
    hideOverlay(helpOverlay);
    if (phase === "paused") {
      showOverlay(pauseOverlay);
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && phase === "running") pauseGame();
  });

  window.addEventListener("blur", () => {
    if (phase === "running") pauseGame();
  });

  /* ======================================================================
     15. LOCAL STORAGE
     ====================================================================== */
  function loadBest() {
    try {
      const val = parseInt(localStorage.getItem(CONFIG.STORAGE_BEST_SCORE), 10);
      return Number.isFinite(val) && val > 0 ? val : 0;
    } catch (e) {
      return 0;
    }
  }

  function saveBest(val) {
    try {
      localStorage.setItem(CONFIG.STORAGE_BEST_SCORE, String(val));
    } catch (e) {}
  }

  function loadBestLevel() {
    try {
      const val = parseInt(localStorage.getItem(CONFIG.STORAGE_BEST_LEVEL), 10);
      return Number.isFinite(val) && val > 0 ? val : 1;
    } catch (e) {
      return 1;
    }
  }

  function saveBestLevel(val) {
    try {
      localStorage.setItem(CONFIG.STORAGE_BEST_LEVEL, String(val));
    } catch (e) {}
  }

  /* ======================================================================
     16. SOUND - WebAudio API (no external files)
     ====================================================================== */
  const soundButton = document.getElementById("soundButton");
  let soundOn = loadSoundPref();
  let audioCtx = null;

  function loadSoundPref() {
    try {
      return localStorage.getItem(CONFIG.STORAGE_SOUND) !== "off";
    } catch (e) {
      return true;
    }
  }

  function renderSoundButton() {
    soundButton.textContent = soundOn ? "🔊" : "🔇";
    soundButton.setAttribute("aria-pressed", String(soundOn));
  }

  soundButton.addEventListener("click", () => {
    soundButton.blur();
    soundOn = !soundOn;
    try {
      localStorage.setItem(CONFIG.STORAGE_SOUND, soundOn ? "on" : "off");
    } catch (e) {}
    renderSoundButton();
    if (soundOn) {
      resumeAudio();
      playShoot();
    }
  });

  function resumeAudio() {
    if (!soundOn) return;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      if (!audioCtx) audioCtx = new Ctor();
      if (audioCtx.state === "suspended") audioCtx.resume();
    } catch (e) {
      audioCtx = null;
    }
  }

  function tone(freq, duration, type, volume, endFreq) {
    if (!soundOn || !audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), now + duration);
    }
    gain.gain.setValueAtTime(volume || 0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function playShoot() {
    tone(300, 0.1, "triangle", 0.08, 150);
    setTimeout(() => tone(200, 0.15, "sine", 0.05), 50);
  }

  function playHit() {
    tone(500, 0.1, "square", 0.06);
    setTimeout(() => tone(700, 0.08, "square", 0.05), 40);
  }

  function playBullseye() {
    tone(800, 0.1, "triangle", 0.08);
    setTimeout(() => tone(1000, 0.12, "triangle", 0.08), 80);
    setTimeout(() => tone(1200, 0.15, "triangle", 0.07), 160);
  }

  function playMiss() {
    tone(200, 0.2, "sawtooth", 0.05, 100);
  }

  function playLevelUp() {
    tone(660, 0.1, "triangle", 0.07);
    setTimeout(() => tone(880, 0.12, "triangle", 0.07), 90);
    setTimeout(() => tone(1100, 0.14, "triangle", 0.06), 180);
  }

  function playFanfare() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      setTimeout(() => tone(freq, 0.2, "triangle", 0.08), i * 120);
    });
  }

  /* ======================================================================
     17. BOOT
     ====================================================================== */
  resizeCanvas();
  renderArrows();
  renderSoundButton();
  updateScoreDisplay();
  showOverlay(startOverlay);

  animationId = requestAnimationFrame(gameLoop);
})();
