/* ==========================================================================
   MEMORY MATCH  🃏
   Flip two cards at a time and find every matching pair.

   Levels: Easy 3×4 (6 pairs), Medium 4×4 (8 pairs), Hard 4×5 (10 pairs)
   Touch-first for iPhone Safari, also happy with a desktop mouse.

   Built to match the kids-game-hub style.
   ========================================================================== */

(function () {
  "use strict";

  /* ======================================================================
     1. CONFIG
     ====================================================================== */
  const CONFIG = {
    FLIP_BACK_MS: 850,
    MATCH_HOLD_MS: 220,
    STORAGE_BEST: "badri.memory-match.best",
    STORAGE_SOUND: "badri.memory-match.sound",
    SYMBOLS: ["🐶", "🐱", "🐼", "🦊", "🐸", "🐵", "🍓", "🍉", "🍎", "🍌"],
    COLORS: [
      "#ff4d4d",
      "#ff9f1c",
      "#2ec46a",
      "#2d9cff",
      "#9b5de5",
      "#ff5ea8",
      "#16c8c8",
      "#ffd60a",
      "#ff7a59",
      "#6c63ff",
    ],
    LEVELS: {
      easy: { id: "easy", name: "Easy", cols: 3, rows: 4, pairs: 6 },
      medium: { id: "medium", name: "Medium", cols: 4, rows: 4, pairs: 8 },
      hard: { id: "hard", name: "Hard", cols: 4, rows: 5, pairs: 10 },
    },
  };

  const CONFETTI = ["🎉", "✨", "⭐", "🎈", "🍭", "🧁", "🌟", "🎊"];

  /* ======================================================================
     2. STATE
     ====================================================================== */
  let phase = "ready"; // ready | playing | paused | won
  let inputLocked = false;
  let helpReturnPhase = null;

  const game = {
    levelId: "easy",
    cards: [],
    firstIndex: -1,
    secondIndex: -1,
    moves: 0,
    matches: 0,
    elapsedMs: 0,
    timerStartedAt: 0,
    timerId: null,
    best: loadBest(),
  };

  /* ======================================================================
     3. DOM
     ====================================================================== */
  const stage = document.getElementById("stage");
  const cardGrid = document.getElementById("cardGrid");
  const confetti = document.getElementById("confetti");

  const startOverlay = document.getElementById("startOverlay");
  const pauseOverlay = document.getElementById("pauseOverlay");
  const winOverlay = document.getElementById("winOverlay");
  const helpOverlay = document.getElementById("helpOverlay");

  const movesValueEl = document.getElementById("movesValue");
  const timeValueEl = document.getElementById("timeValue");
  const pairsValueEl = document.getElementById("pairsValue");
  const bestValueEl = document.getElementById("bestValue");

  const finalMovesEl = document.getElementById("finalMoves");
  const finalTimeEl = document.getElementById("finalTime");
  const finalBestEl = document.getElementById("finalBest");
  const newBestBanner = document.getElementById("newBestBanner");
  const winEmoji = document.getElementById("winEmoji");

  /* ======================================================================
     4. RNG / shuffle (optional ?seed= for repeatable QA)
     ====================================================================== */
  function parseSeed() {
    try {
      const raw = new URLSearchParams(location.search).get("seed");
      if (raw === null || raw === "") return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n >>> 0 : null;
    } catch (e) {
      return null;
    }
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, rand) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  function makeDeck(pairCount) {
    const faces = CONFIG.SYMBOLS.slice(0, pairCount);
    const deck = [];
    faces.forEach(function (symbol, colorIndex) {
      deck.push({ symbol: symbol, color: CONFIG.COLORS[colorIndex] });
      deck.push({ symbol: symbol, color: CONFIG.COLORS[colorIndex] });
    });
    const seed = parseSeed();
    const rand = seed === null ? Math.random : mulberry32(seed);
    return shuffle(deck, rand);
  }

  /* ======================================================================
     5. BOARD
     ====================================================================== */
  function buildBoard(level) {
    cardGrid.innerHTML = "";
    cardGrid.style.setProperty("--cols", String(level.cols));
    cardGrid.style.setProperty("--rows", String(level.rows));
    stage.style.setProperty("--cols", String(level.cols));
    stage.style.setProperty("--rows", String(level.rows));

    const deck = makeDeck(level.pairs);
    game.cards = deck.map(function (face, index) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "card";
      button.dataset.testid = "memory-card";
      button.dataset.index = String(index);
      button.dataset.symbol = face.symbol;
      button.dataset.state = "back";
      button.setAttribute("aria-label", "Hidden card " + (index + 1));
      button.style.setProperty("--card-color", face.color);
      button.innerHTML =
        '<span class="card__burst" aria-hidden="true">✨</span>' +
        '<span class="card__inner">' +
        '<span class="card__face card__face--back">⭐</span>' +
        '<span class="card__face card__face--front">' +
        face.symbol +
        "</span>" +
        "</span>";

      button.addEventListener("click", function (event) {
        event.preventDefault();
        onCardTap(index);
      });

      cardGrid.appendChild(button);

      return {
        symbol: face.symbol,
        color: face.color,
        el: button,
        flipped: false,
        matched: false,
      };
    });
  }

  function setCardState(card, state) {
    card.el.dataset.state = state;
    card.el.classList.toggle("is-flipped", state === "flipped" || state === "mismatch");
    card.el.classList.toggle("is-matched", state === "matched");
    card.el.classList.toggle("is-mismatch", state === "mismatch");
    if (state === "back") {
      card.el.setAttribute("aria-label", "Hidden card");
    } else {
      card.el.setAttribute("aria-label", card.symbol);
    }
  }

  /* ======================================================================
     6. PLAY
     ====================================================================== */
  function onCardTap(index) {
    if (phase !== "playing" || inputLocked) return;

    const card = game.cards[index];
    if (!card || card.matched || card.flipped) return;

    card.flipped = true;
    setCardState(card, "flipped");
    playFlip();

    if (game.firstIndex < 0) {
      game.firstIndex = index;
      if (!game.timerId) startTimer();
      return;
    }

    game.secondIndex = index;
    game.moves += 1;
    updateHud();
    inputLocked = true;

    const first = game.cards[game.firstIndex];
    const second = card;

    if (first.symbol === second.symbol) {
      resolveMatch(first, second);
    } else {
      resolveMismatch(first, second);
    }
  }

  function resolveMatch(first, second) {
    first.matched = true;
    second.matched = true;
    game.matches += 1;
    setCardState(first, "matched");
    setCardState(second, "matched");
    playMatch();
    updateHud();

    window.setTimeout(function () {
      game.firstIndex = -1;
      game.secondIndex = -1;
      inputLocked = false;
      if (game.matches >= CONFIG.LEVELS[game.levelId].pairs) {
        winRun();
      }
    }, CONFIG.MATCH_HOLD_MS);
  }

  function resolveMismatch(first, second) {
    setCardState(first, "mismatch");
    setCardState(second, "mismatch");
    playMismatch();

    window.setTimeout(function () {
      first.flipped = false;
      second.flipped = false;
      setCardState(first, "back");
      setCardState(second, "back");
      game.firstIndex = -1;
      game.secondIndex = -1;
      inputLocked = false;
    }, CONFIG.FLIP_BACK_MS);
  }

  /* ======================================================================
     7. LIFECYCLE
     ====================================================================== */
  function startRun(levelId) {
    const level = CONFIG.LEVELS[levelId];
    if (!level) return;

    stopTimer();
    clearConfetti();
    game.levelId = levelId;
    game.firstIndex = -1;
    game.secondIndex = -1;
    game.moves = 0;
    game.matches = 0;
    game.elapsedMs = 0;
    inputLocked = false;

    buildBoard(level);
    hideOverlay(startOverlay);
    hideOverlay(pauseOverlay);
    hideOverlay(winOverlay);
    hideOverlay(helpOverlay);
    setPhase("playing");
    updateHud();
    resumeAudio();
    playStart();
  }

  function pauseRun() {
    if (phase !== "playing") return;
    freezeTimer();
    setPhase("paused");
    showOverlay(pauseOverlay);
  }

  function resumeRun() {
    if (phase !== "paused") return;
    hideOverlay(pauseOverlay);
    setPhase("playing");
    if (game.elapsedMs > 0 || game.moves > 0 || game.firstIndex >= 0) {
      startTimer();
    }
  }

  function winRun() {
    if (phase === "won") return;
    freezeTimer();
    setPhase("won");
    playWin();
    burstConfetti();

    const record = { moves: game.moves, timeMs: game.elapsedMs };
    const previous = game.best[game.levelId];
    const isNewBest = !previous || isBetter(record, previous);
    if (isNewBest) {
      game.best[game.levelId] = record;
      saveBest(game.best);
    }

    finalMovesEl.textContent = String(game.moves);
    finalTimeEl.textContent = formatTime(game.elapsedMs);
    finalBestEl.textContent = formatBest(game.best[game.levelId]);
    winEmoji.textContent = isNewBest ? "🏆" : "🎉";
    newBestBanner.classList.toggle("is-hidden", !isNewBest);
    updateHud();

    window.setTimeout(function () {
      if (phase === "won") showOverlay(winOverlay);
    }, 280);
  }

  function showStart() {
    stopTimer();
    clearConfetti();
    hideOverlay(pauseOverlay);
    hideOverlay(winOverlay);
    hideOverlay(helpOverlay);
    showOverlay(startOverlay);
    setPhase("ready");
    updateHud();
  }

  function setPhase(next) {
    phase = next;
    stage.dataset.phase = next;
  }

  function isBetter(next, prev) {
    if (next.moves !== prev.moves) return next.moves < prev.moves;
    return next.timeMs < prev.timeMs;
  }

  /* ======================================================================
     8. TIMER + HUD
     ====================================================================== */
  function startTimer() {
    if (game.timerId) return;
    game.timerStartedAt = Date.now() - game.elapsedMs;
    game.timerId = window.setInterval(function () {
      game.elapsedMs = Date.now() - game.timerStartedAt;
      timeValueEl.textContent = formatTime(game.elapsedMs);
    }, 200);
  }

  function freezeTimer() {
    if (game.timerId) {
      game.elapsedMs = Date.now() - game.timerStartedAt;
      window.clearInterval(game.timerId);
      game.timerId = null;
    }
  }

  function stopTimer() {
    freezeTimer();
    game.elapsedMs = 0;
    game.timerStartedAt = 0;
  }

  function formatTime(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return minutes + ":" + String(seconds).padStart(2, "0");
  }

  function formatBest(record) {
    if (!record) return "—";
    return String(record.moves);
  }

  function updateHud() {
    const level = CONFIG.LEVELS[game.levelId];
    movesValueEl.textContent = String(game.moves);
    timeValueEl.textContent = formatTime(game.elapsedMs);
    pairsValueEl.textContent = game.matches + "/" + level.pairs;
    bestValueEl.textContent = formatBest(game.best[game.levelId]);
  }

  /* ======================================================================
     9. CONFETTI
     ====================================================================== */
  function burstConfetti() {
    clearConfetti();
    const count = 22;
    for (let i = 0; i < count; i++) {
      const bit = document.createElement("span");
      bit.className = "confetti__bit";
      bit.textContent = CONFETTI[i % CONFETTI.length];
      bit.style.left = Math.round((i * 100) / count) + "%";
      bit.style.animationDelay = (i % 8) * 0.08 + "s";
      confetti.appendChild(bit);
    }
  }

  function clearConfetti() {
    confetti.innerHTML = "";
  }

  /* ======================================================================
     10. OVERLAY HELPERS
     ====================================================================== */
  function showOverlay(el) {
    el.classList.remove("is-hidden");
  }

  function hideOverlay(el) {
    el.classList.add("is-hidden");
  }

  /* ======================================================================
     11. STORAGE
     ====================================================================== */
  function loadBest() {
    try {
      const raw = localStorage.getItem(CONFIG.STORAGE_BEST);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function saveBest(value) {
    try {
      localStorage.setItem(CONFIG.STORAGE_BEST, JSON.stringify(value));
    } catch (e) {}
  }

  /* ======================================================================
     12. SOUND
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

  soundButton.addEventListener("click", function () {
    soundButton.blur();
    soundOn = !soundOn;
    try {
      localStorage.setItem(CONFIG.STORAGE_SOUND, soundOn ? "on" : "off");
    } catch (e) {}
    renderSoundButton();
    if (soundOn) {
      resumeAudio();
      playFlip();
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

  function playFlip() {
    tone(520, 0.08, "triangle", 0.06);
  }

  function playMatch() {
    tone(660, 0.1, "triangle", 0.07);
    window.setTimeout(function () {
      tone(880, 0.14, "triangle", 0.07);
    }, 70);
  }

  function playMismatch() {
    tone(240, 0.18, "sawtooth", 0.05, 120);
  }

  function playStart() {
    tone(523, 0.08, "triangle", 0.05);
    window.setTimeout(function () {
      tone(659, 0.1, "triangle", 0.05);
    }, 70);
  }

  function playWin() {
    const notes = [523, 659, 784, 1047];
    notes.forEach(function (freq, i) {
      window.setTimeout(function () {
        tone(freq, 0.2, "triangle", 0.08);
      }, i * 120);
    });
  }

  /* ======================================================================
     13. EVENTS
     ====================================================================== */
  document.querySelectorAll("[data-difficulty]").forEach(function (button) {
    button.addEventListener("click", function () {
      resumeAudio();
      startRun(button.getAttribute("data-difficulty"));
    });
  });

  document.getElementById("playAgainButton").addEventListener("click", function () {
    resumeAudio();
    startRun(game.levelId);
  });

  document.getElementById("changeLevelButton").addEventListener("click", function () {
    showStart();
  });

  document.getElementById("resumeButton").addEventListener("click", function () {
    resumeAudio();
    resumeRun();
  });

  document.getElementById("helpButton").addEventListener("click", function () {
    if (phase === "playing") {
      helpReturnPhase = "paused";
      pauseRun();
      hideOverlay(pauseOverlay);
    } else {
      helpReturnPhase = phase;
    }
    showOverlay(helpOverlay);
  });

  document.getElementById("startHelpButton").addEventListener("click", function () {
    helpReturnPhase = phase;
    showOverlay(helpOverlay);
  });

  document.getElementById("closeHelpButton").addEventListener("click", function () {
    hideOverlay(helpOverlay);
    if (helpReturnPhase === "paused" || phase === "paused") {
      showOverlay(pauseOverlay);
      if (phase !== "paused") setPhase("paused");
    }
    helpReturnPhase = null;
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden && phase === "playing") pauseRun();
  });

  /* ======================================================================
     14. BOOT
     ====================================================================== */
  renderSoundButton();
  updateHud();
  showOverlay(startOverlay);
  setPhase("ready");
})();
