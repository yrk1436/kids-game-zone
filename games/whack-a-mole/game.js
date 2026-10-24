/* ==========================================================================
   WHACK-A-MOLE  🐹
   Tap moles as they pop up from holes. Miss 5 and it's game over!

   Features:
   - Grid grows from 3x3 to 4x3 to 4x4 at higher levels
   - Moles appear faster each level, with more at once
   - Special moles: Golden (5x), Helmet (2 taps), Heart (+life), Freeze, Bunny (decoy)
   - Combo system for quick consecutive bonks
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
    MAX_LIVES: 5,
    STARTING_LIVES: 5,

    POINTS_PER_MOLE: 10,
    GOLDEN_MULTIPLIER: 5,

    COMBO_WINDOW_MS: 1200,
    MAX_COMBO: 5,

    FREEZE_DURATION_MS: 5000,
    FREEZE_SPEED_MULT: 0.5,

    MOLES_TO_CLEAR_LEVEL: [8, 10, 12, 14, 16, 18, 20, 22, 24, 26],

    LEVEL_SETTINGS: [
      { cols: 3, rows: 3, visibleMs: 1100, spawnMs: 900,  maxMoles: 1 },
      { cols: 3, rows: 3, visibleMs: 1000, spawnMs: 800,  maxMoles: 2 },
      { cols: 3, rows: 3, visibleMs: 900,  spawnMs: 700,  maxMoles: 2 },
      { cols: 4, rows: 3, visibleMs: 850,  spawnMs: 650,  maxMoles: 2 },
      { cols: 4, rows: 3, visibleMs: 800,  spawnMs: 600,  maxMoles: 3 },
      { cols: 4, rows: 3, visibleMs: 750,  spawnMs: 550,  maxMoles: 3 },
      { cols: 4, rows: 4, visibleMs: 700,  spawnMs: 500,  maxMoles: 3 },
      { cols: 4, rows: 4, visibleMs: 650,  spawnMs: 450,  maxMoles: 4 },
      { cols: 4, rows: 4, visibleMs: 600,  spawnMs: 420,  maxMoles: 4 },
      { cols: 4, rows: 4, visibleMs: 550,  spawnMs: 400,  maxMoles: 5 },
    ],

    SPECIAL_CHANCES: {
      golden:  { minLevel: 1, chance: 0.08 },
      helmet:  { minLevel: 2, chance: 0.10 },
      heart:   { minLevel: 3, chance: 0.06 },
      freeze:  { minLevel: 4, chance: 0.05 },
      bunny:   { minLevel: 2, chance: 0.07 },
    },

    STORAGE_BEST_SCORE: "badri.whackamole.best",
    STORAGE_BEST_LEVEL: "badri.whackamole.bestlevel",
    STORAGE_SOUND: "badri.whackamole.sound",
    STORAGE_SEEN_SPECIALS: "badri.whackamole.seen",
  };

  const SPECIAL_INFO = {
    golden: { icon: "🐹", title: "Golden Mole!", desc: "Worth 5x points! Quick, bonk it!", golden: true },
    helmet: { icon: "🪖", title: "Helmet Mole!", desc: "Needs 2 taps to bonk. Hurry!" },
    heart:  { icon: "💖", title: "Heart Mole!", desc: "Bonk it to gain a life!" },
    freeze: { icon: "❄️", title: "Freeze Mole!", desc: "Bonk to slow all moles for 5 seconds!" },
    bunny:  { icon: "🐰", title: "Bunny Alert!", desc: "DON'T tap the bunny! It's a decoy!" },
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
    lives: CONFIG.STARTING_LIVES,
    molesInLevel: 0,
    molesToClear: CONFIG.MOLES_TO_CLEAR_LEVEL[0],

    combo: 0,
    lastBonkTime: 0,

    freezeEndTime: 0,

    holes: [],
    moles: [],
    spawnTimer: null,

    seenSpecials: loadSeenSpecials(),
    pendingIntro: null,
  };

  /* ======================================================================
     3. DOM REFS
     ====================================================================== */
  const stage = document.getElementById("stage");
  const moleGrid = document.getElementById("moleGrid");
  const livesBar = document.getElementById("livesBar");
  const comboIndicator = document.getElementById("comboIndicator");
  const levelToast = document.getElementById("levelToast");

  const startOverlay = document.getElementById("startOverlay");
  const pauseOverlay = document.getElementById("pauseOverlay");
  const gameOverOverlay = document.getElementById("gameOverOverlay");
  const helpOverlay = document.getElementById("helpOverlay");
  const newSpecialOverlay = document.getElementById("newSpecialOverlay");

  const scoreValueEl = document.getElementById("scoreValue");
  const bestValueEl = document.getElementById("bestValue");
  const levelValueEl = document.getElementById("levelValue");
  const levelChip = document.getElementById("levelChip");

  const finalScoreEl = document.getElementById("finalScore");
  const finalBestEl = document.getElementById("finalBest");
  const finalLevelEl = document.getElementById("finalLevel");
  const newBestBanner = document.getElementById("newBestBanner");
  const gameOverEmoji = document.getElementById("gameOverEmoji");

  const newSpecialIcon = document.getElementById("newSpecialIcon");
  const newSpecialTitle = document.getElementById("newSpecialTitle");
  const newSpecialDesc = document.getElementById("newSpecialDesc");

  /* ======================================================================
     4. GRID SETUP
     ====================================================================== */
  function buildGrid(cols, rows) {
    moleGrid.innerHTML = "";
    moleGrid.setAttribute("data-cols", cols);
    game.holes = [];
    game.moles = [];

    const totalHoles = cols * rows;
    for (let i = 0; i < totalHoles; i++) {
      const hole = document.createElement("div");
      hole.className = "hole";
      hole.innerHTML = `
        <div class="hole__inner"></div>
        <div class="hole__clip">
          <div class="mole" data-index="${i}">🐹</div>
        </div>
        <div class="hole__dirt"></div>
      `;
      hole.addEventListener("pointerdown", function (e) {
        e.preventDefault();
        onHoleTap(i);
      });
      moleGrid.appendChild(hole);
      game.holes.push({
        el: hole,
        moleEl: hole.querySelector(".mole"),
        active: false,
        type: "normal",
        helmetHits: 0,
        hideTimeout: null,
      });
    }
  }

  function renderLives() {
    livesBar.innerHTML = "";
    for (let i = 0; i < CONFIG.MAX_LIVES; i++) {
      const heart = document.createElement("span");
      heart.className = "heart" + (i >= game.lives ? " is-lost" : "");
      heart.textContent = i < game.lives ? "❤️" : "🤍";
      livesBar.appendChild(heart);
    }
  }

  function shakeHeart(index) {
    const hearts = livesBar.querySelectorAll(".heart");
    if (hearts[index]) {
      hearts[index].classList.add("is-shaking");
      setTimeout(() => hearts[index].classList.remove("is-shaking"), 400);
    }
  }

  /* ======================================================================
     5. MOLE SPAWNING
     ====================================================================== */
  function getLevelSettings() {
    const idx = Math.min(game.level - 1, CONFIG.LEVEL_SETTINGS.length - 1);
    return CONFIG.LEVEL_SETTINGS[idx];
  }

  function getEffectiveSpeed(ms) {
    const now = Date.now();
    if (now < game.freezeEndTime) {
      return ms / CONFIG.FREEZE_SPEED_MULT;
    }
    return ms;
  }

  function startSpawning() {
    stopSpawning();
    scheduleNextSpawn();
  }

  function stopSpawning() {
    if (game.spawnTimer) {
      clearTimeout(game.spawnTimer);
      game.spawnTimer = null;
    }
    game.holes.forEach(h => {
      if (h.hideTimeout) {
        clearTimeout(h.hideTimeout);
        h.hideTimeout = null;
      }
    });
  }

  function scheduleNextSpawn() {
    if (phase !== "running") return;
    const settings = getLevelSettings();
    const delay = getEffectiveSpeed(settings.spawnMs);
    game.spawnTimer = setTimeout(() => {
      spawnMole();
      scheduleNextSpawn();
    }, delay);
  }

  function spawnMole() {
    if (phase !== "running") return;

    const settings = getLevelSettings();
    const activeMoles = game.holes.filter(h => h.active).length;
    if (activeMoles >= settings.maxMoles) return;

    const availableIndexes = game.holes
      .map((h, i) => (!h.active ? i : -1))
      .filter(i => i >= 0);

    if (availableIndexes.length === 0) return;

    const idx = availableIndexes[Math.floor(Math.random() * availableIndexes.length)];
    const hole = game.holes[idx];

    const type = pickMoleType();
    hole.type = type;
    hole.helmetHits = 0;
    hole.active = true;

    const moleEl = hole.moleEl;
    moleEl.className = "mole is-up";
    moleEl.innerHTML = getMoleEmoji(type);

    if (type === "golden") moleEl.classList.add("mole--golden");
    else if (type === "helmet") moleEl.classList.add("mole--helmet");
    else if (type === "heart") moleEl.classList.add("mole--heart");
    else if (type === "freeze") moleEl.classList.add("mole--freeze");
    else if (type === "bunny") moleEl.classList.add("mole--bunny");

    if (type !== "normal" && !game.seenSpecials[type]) {
      showSpecialIntro(type);
    }

    const visibleMs = getEffectiveSpeed(settings.visibleMs);
    hole.hideTimeout = setTimeout(() => {
      if (hole.active && phase === "running") {
        moleMissed(idx);
      }
    }, visibleMs);
  }

  function pickMoleType() {
    for (const [type, cfg] of Object.entries(CONFIG.SPECIAL_CHANCES)) {
      if (game.level >= cfg.minLevel && Math.random() < cfg.chance) {
        return type;
      }
    }
    return "normal";
  }

  function getMoleEmoji(type) {
    switch (type) {
      case "golden": return "🐹";
      case "helmet": return "🪖";
      case "heart": return "💖";
      case "freeze": return "❄️";
      case "bunny": return "🐰";
      default: return "🐹";
    }
  }

  /* ======================================================================
     6. MOLE INTERACTIONS
     ====================================================================== */
  function onHoleTap(index) {
    if (phase !== "running") return;
    const hole = game.holes[index];

    if (!hole.active) {
      playMiss();
      resetCombo();
      return;
    }

    const type = hole.type;

    if (type === "bunny") {
      bunnyTapped(index);
      return;
    }

    if (type === "helmet" && hole.helmetHits === 0) {
      hole.helmetHits = 1;
      hole.moleEl.innerHTML = "🐹";
      playBonk();
      showHitEffect(hole.el, "💥");
      return;
    }

    bonkMole(index);
  }

  function bonkMole(index) {
    const hole = game.holes[index];
    const type = hole.type;

    if (hole.hideTimeout) {
      clearTimeout(hole.hideTimeout);
      hole.hideTimeout = null;
    }

    hole.active = false;
    hole.moleEl.classList.remove("is-up");
    hole.moleEl.classList.add("is-bonked");

    setTimeout(() => {
      hole.moleEl.className = "mole";
      hole.moleEl.innerHTML = "🐹";
    }, 300);

    const now = Date.now();
    if (now - game.lastBonkTime < CONFIG.COMBO_WINDOW_MS) {
      game.combo = Math.min(game.combo + 1, CONFIG.MAX_COMBO);
    } else {
      game.combo = 1;
    }
    game.lastBonkTime = now;
    updateComboDisplay();

    let points = CONFIG.POINTS_PER_MOLE;
    let isGolden = false;

    if (type === "golden") {
      points *= CONFIG.GOLDEN_MULTIPLIER;
      isGolden = true;
    }

    points *= game.combo;
    game.score += points;

    if (type === "heart") {
      if (game.lives < CONFIG.MAX_LIVES) {
        game.lives++;
        renderLives();
        playHeart();
      }
    } else if (type === "freeze") {
      activateFreeze();
      playFreeze();
    } else {
      playBonk();
    }

    showHitEffect(hole.el, "🔨");
    showPointsPopup(hole.el, points, isGolden, game.combo > 1);

    game.molesInLevel++;
    updateScoreDisplay();

    if (game.molesInLevel >= game.molesToClear) {
      levelUp();
    }
  }

  function moleMissed(index) {
    const hole = game.holes[index];
    if (!hole.active) return;

    const type = hole.type;
    hole.active = false;

    hole.moleEl.classList.remove("is-up");
    hole.moleEl.classList.add("is-missed");

    setTimeout(() => {
      hole.moleEl.className = "mole";
      hole.moleEl.innerHTML = "🐹";
    }, 300);

    if (type !== "bunny") {
      loseLife();
      resetCombo();
    }
  }

  function bunnyTapped(index) {
    const hole = game.holes[index];

    if (hole.hideTimeout) {
      clearTimeout(hole.hideTimeout);
      hole.hideTimeout = null;
    }

    hole.active = false;
    hole.moleEl.classList.remove("is-up");
    hole.moleEl.classList.add("is-bonked");

    setTimeout(() => {
      hole.moleEl.className = "mole";
      hole.moleEl.innerHTML = "🐹";
    }, 300);

    showHitEffect(hole.el, "❌");
    playBunny();
    loseLife();
    resetCombo();
  }

  function loseLife() {
    game.lives--;
    shakeHeart(game.lives);
    renderLives();
    playHurt();

    if (game.lives <= 0) {
      endRun();
    }
  }

  /* ======================================================================
     7. COMBO & EFFECTS
     ====================================================================== */
  function resetCombo() {
    game.combo = 0;
    game.lastBonkTime = 0;
    updateComboDisplay();
  }

  function updateComboDisplay() {
    if (game.combo >= 2) {
      comboIndicator.textContent = "x" + game.combo;
      comboIndicator.classList.remove("is-hidden");
    } else {
      comboIndicator.classList.add("is-hidden");
    }
  }

  function showHitEffect(holeEl, emoji) {
    const effect = document.createElement("div");
    effect.className = "hit-effect";
    effect.textContent = emoji;
    holeEl.appendChild(effect);
    setTimeout(() => effect.remove(), 350);
  }

  function showPointsPopup(holeEl, points, isGolden, isCombo) {
    const popup = document.createElement("div");
    popup.className = "points-popup";
    if (isGolden) popup.classList.add("points-popup--golden");
    else if (isCombo) popup.classList.add("points-popup--combo");
    popup.textContent = "+" + points;
    holeEl.appendChild(popup);
    setTimeout(() => popup.remove(), 700);
  }

  function activateFreeze() {
    game.freezeEndTime = Date.now() + CONFIG.FREEZE_DURATION_MS;
    stage.classList.add("is-frozen");
    setTimeout(() => {
      stage.classList.remove("is-frozen");
    }, CONFIG.FREEZE_DURATION_MS);
  }

  /* ======================================================================
     8. LEVELS
     ====================================================================== */
  function levelUp() {
    game.level++;
    game.molesInLevel = 0;

    const levelIdx = Math.min(game.level - 1, CONFIG.MOLES_TO_CLEAR_LEVEL.length - 1);
    game.molesToClear = CONFIG.MOLES_TO_CLEAR_LEVEL[levelIdx];

    const oldSettings = getLevelSettings();
    const newIdx = Math.min(game.level - 1, CONFIG.LEVEL_SETTINGS.length - 1);
    const newSettings = CONFIG.LEVEL_SETTINGS[newIdx];

    if (newSettings.cols !== oldSettings.cols || newSettings.rows !== oldSettings.rows) {
      stopSpawning();
      game.holes.forEach(h => {
        h.active = false;
        h.moleEl.className = "mole";
      });
      buildGrid(newSettings.cols, newSettings.rows);
      startSpawning();
    }

    showLevelToast();
    playLevelUp();

    levelChip.classList.remove("is-levelling");
    void levelChip.offsetWidth;
    levelChip.classList.add("is-levelling");

    updateScoreDisplay();
  }

  function showLevelToast() {
    levelToast.textContent = "Level " + game.level + "!";
    levelToast.classList.remove("is-hidden");
    setTimeout(() => {
      levelToast.classList.add("is-hidden");
    }, 1000);
  }

  /* ======================================================================
     9. SPECIAL INTRO CARDS
     ====================================================================== */
  function showSpecialIntro(type) {
    if (game.seenSpecials[type]) return;

    game.pendingIntro = type;
    pauseForIntro();

    const info = SPECIAL_INFO[type];
    newSpecialIcon.textContent = info.icon;
    newSpecialIcon.className = "intro-icon" + (info.golden ? " mole--golden" : "");
    newSpecialTitle.textContent = info.title;
    newSpecialDesc.textContent = info.desc;

    showOverlay(newSpecialOverlay);
  }

  function dismissIntro() {
    if (game.pendingIntro) {
      game.seenSpecials[game.pendingIntro] = true;
      saveSeenSpecials();
      game.pendingIntro = null;
    }
    hideOverlay(newSpecialOverlay);
    resumeFromIntro();
  }

  function pauseForIntro() {
    stopSpawning();
  }

  function resumeFromIntro() {
    if (phase === "running") {
      startSpawning();
    }
  }

  /* ======================================================================
     10. GAME LIFECYCLE
     ====================================================================== */
  function startRun() {
    game.score = 0;
    game.level = 1;
    game.lives = CONFIG.STARTING_LIVES;
    game.molesInLevel = 0;
    game.molesToClear = CONFIG.MOLES_TO_CLEAR_LEVEL[0];
    game.combo = 0;
    game.lastBonkTime = 0;
    game.freezeEndTime = 0;

    const settings = getLevelSettings();
    buildGrid(settings.cols, settings.rows);
    renderLives();
    updateComboDisplay();

    hideOverlay(startOverlay);
    hideOverlay(pauseOverlay);
    hideOverlay(gameOverOverlay);
    hideOverlay(helpOverlay);
    stage.classList.remove("is-frozen");

    updateScoreDisplay();
    phase = "running";
    startSpawning();
  }

  function pauseRun() {
    if (phase !== "running") return;
    phase = "paused";
    stopSpawning();
    showOverlay(pauseOverlay);
  }

  function resumeRun() {
    if (phase !== "paused") return;
    hideOverlay(pauseOverlay);
    phase = "running";
    startSpawning();
  }

  function endRun() {
    phase = "over";
    stopSpawning();
    playCrash();

    game.holes.forEach(h => {
      if (h.active) {
        h.active = false;
        h.moleEl.classList.remove("is-up");
      }
    });

    const finalScore = game.score;
    const finalLevel = game.level;
    const isNewBest = finalScore > game.best;

    if (isNewBest) {
      game.best = finalScore;
      saveBest(finalScore);
    }
    if (finalLevel > game.bestLevel) {
      game.bestLevel = finalLevel;
      saveBestLevel(finalLevel);
    }

    finalScoreEl.textContent = finalScore;
    finalBestEl.textContent = game.best;
    finalLevelEl.textContent = finalLevel;
    gameOverEmoji.textContent = isNewBest ? "🏆" : "😵";
    newBestBanner.classList.toggle("is-hidden", !isNewBest);

    updateScoreDisplay();

    if (isNewBest) {
      playFanfare();
    }

    setTimeout(() => {
      if (phase === "over") showOverlay(gameOverOverlay);
    }, 400);
  }

  /* ======================================================================
     11. UI HELPERS
     ====================================================================== */
  function showOverlay(el) {
    el.classList.remove("is-hidden");
  }

  function hideOverlay(el) {
    el.classList.add("is-hidden");
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
     12. EVENT LISTENERS
     ====================================================================== */
  document.getElementById("startButton").addEventListener("click", () => {
    resumeAudio();
    startRun();
  });

  document.getElementById("playAgainButton").addEventListener("click", () => {
    resumeAudio();
    startRun();
  });

  document.getElementById("resumeButton").addEventListener("click", () => {
    resumeAudio();
    resumeRun();
  });

  document.getElementById("helpButton").addEventListener("click", () => {
    if (phase === "running") pauseRun();
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

  document.getElementById("dismissIntroButton").addEventListener("click", () => {
    resumeAudio();
    dismissIntro();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && phase === "running") pauseRun();
  });

  window.addEventListener("blur", () => {
    if (phase === "running") pauseRun();
  });

  /* ======================================================================
     13. LOCAL STORAGE
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

  function loadSeenSpecials() {
    try {
      const data = localStorage.getItem(CONFIG.STORAGE_SEEN_SPECIALS);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      return {};
    }
  }

  function saveSeenSpecials() {
    try {
      localStorage.setItem(CONFIG.STORAGE_SEEN_SPECIALS, JSON.stringify(game.seenSpecials));
    } catch (e) {}
  }

  /* ======================================================================
     14. SOUND - WebAudio API (no external files)
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
      playBonk();
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

  function playBonk() {
    tone(400, 0.08, "square", 0.08);
    setTimeout(() => tone(600, 0.06, "square", 0.06), 40);
  }

  function playMiss() {
    tone(200, 0.12, "sawtooth", 0.04);
  }

  function playHurt() {
    tone(280, 0.25, "sawtooth", 0.09, 100);
  }

  function playBunny() {
    tone(350, 0.15, "sawtooth", 0.08, 150);
    setTimeout(() => tone(250, 0.2, "sawtooth", 0.06, 100), 100);
  }

  function playHeart() {
    tone(660, 0.12, "triangle", 0.08);
    setTimeout(() => tone(880, 0.15, "triangle", 0.08), 80);
  }

  function playFreeze() {
    tone(1200, 0.2, "sine", 0.06, 800);
    setTimeout(() => tone(1000, 0.25, "sine", 0.05, 600), 100);
  }

  function playLevelUp() {
    tone(660, 0.1, "triangle", 0.07);
    setTimeout(() => tone(880, 0.12, "triangle", 0.07), 90);
    setTimeout(() => tone(1100, 0.14, "triangle", 0.06), 180);
  }

  function playCrash() {
    tone(300, 0.35, "sawtooth", 0.1, 80);
  }

  function playFanfare() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      setTimeout(() => tone(freq, 0.2, "triangle", 0.08), i * 120);
    });
  }

  /* ======================================================================
     15. BOOT
     ====================================================================== */
  const settings = getLevelSettings();
  buildGrid(settings.cols, settings.rows);
  renderLives();
  renderSoundButton();
  updateScoreDisplay();
  showOverlay(startOverlay);
})();
