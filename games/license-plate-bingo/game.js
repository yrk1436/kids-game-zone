(function () {
  "use strict";

  const CONFIG = {
    GRID: 5,
    STORAGE_TRIP: "badri.platebingo.tripstates",
    STORAGE_SOUND: "badri.platebingo.sound",
  };

  const STATE_WEIGHTS = {
    NJ: 6,
    NY: 6,
    PA: 6,
    CT: 5,
    MA: 5,
    MD: 4,
    DE: 4,
    RI: 3,
    NH: 3,
    VT: 3,
    ME: 3,
    VA: 2,
    OH: 2,
    NC: 2,
    FL: 2,
    GA: 2,
    SC: 2,
    WV: 2,
    DC: 2,
  };

  const ALL_STATES = [
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
  ];

  let phase = "ready";
  let twoPlayer = false;
  let currentPlayer = 1;
  let bingoWon = false;

  const game = {
    card: [],
    marked: new Set(),
    owners: {},
    p1: 0,
    p2: 0,
    tripStates: loadTrip(),
  };

  const bingoGrid = document.getElementById("bingoGrid");
  const startOverlay = document.getElementById("startOverlay");
  const bingoOverlay = document.getElementById("bingoOverlay");
  const blackoutOverlay = document.getElementById("blackoutOverlay");
  const helpOverlay = document.getElementById("helpOverlay");
  const scoreboard1P = document.getElementById("scoreboard1P");
  const scoreboard2P = document.getElementById("scoreboard2P");
  const playerBar = document.getElementById("playerBar");
  const playerToggle = document.getElementById("playerToggle");
  const tripList = document.getElementById("tripList");
  const statusLine = document.getElementById("statusLine");

  function weightedPool() {
    const pool = [];
    ALL_STATES.forEach((st) => {
      const w = STATE_WEIGHTS[st] || 1;
      for (let i = 0; i < w; i++) pool.push(st);
    });
    return pool;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildCard() {
    const picked = new Set();
    const pool = shuffle(weightedPool());
    const states = [];
    for (const st of pool) {
      if (picked.size >= 24) break;
      if (!picked.has(st)) {
        picked.add(st);
        states.push(st);
      }
    }
    while (states.length < 24) {
      const st = ALL_STATES[Math.floor(Math.random() * ALL_STATES.length)];
      if (!picked.has(st)) {
        picked.add(st);
        states.push(st);
      }
    }

    const card = [];
    let si = 0;
    const center = Math.floor(CONFIG.GRID / 2);
    for (let r = 0; r < CONFIG.GRID; r++) {
      for (let c = 0; c < CONFIG.GRID; c++) {
        if (r === center && c === center) {
          card.push({ state: "FREE", free: true, r, c });
        } else {
          card.push({ state: states[si++], free: false, r, c });
        }
      }
    }
    return card;
  }

  function renderGrid() {
    bingoGrid.innerHTML = "";
    game.card.forEach((cell, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "bingo-cell";
      btn.dataset.testid = "bingo-cell";
      btn.dataset.index = String(index);
      btn.dataset.state = cell.state;
      if (cell.free) {
        btn.classList.add("is-free");
        btn.innerHTML = '<span class="bingo-cell__state">FREE</span><span class="bingo-cell__star">⭐</span>';
        btn.disabled = true;
        game.marked.add(index);
      } else {
        btn.innerHTML = '<span class="bingo-cell__state">' + cell.state + "</span>";
        btn.addEventListener("pointerdown", onMark);
      }
      bingoGrid.appendChild(btn);
    });
  }

  function onMark(e) {
    e.preventDefault();
    if (phase !== "playing") return;
    const btn = e.currentTarget;
    const index = parseInt(btn.dataset.index, 10);
    if (game.marked.has(index)) return;

    resumeAudio();
    game.marked.add(index);
    btn.classList.add("is-marked");
    const st = btn.dataset.state;

    if (twoPlayer) {
      btn.classList.add(currentPlayer === 1 ? "mark-p1" : "mark-p2");
      game.owners[index] = currentPlayer;
      if (currentPlayer === 1) game.p1++;
      else game.p2++;
    }

    if (!game.tripStates.includes(st)) {
      game.tripStates.push(st);
      game.tripStates.sort();
      saveTrip();
    }

    playMark();
    renderTripList();
    updateUI();
    checkWin();
  }

  function checkWin() {
    const size = CONFIG.GRID;
    const marked = game.marked;

    function isMarked(r, c) {
      return marked.has(r * size + c);
    }

    let hasLine = false;
    for (let r = 0; r < size; r++) {
      let row = true;
      for (let c = 0; c < size; c++) if (!isMarked(r, c)) row = false;
      if (row) hasLine = true;
    }
    for (let c = 0; c < size; c++) {
      let col = true;
      for (let r = 0; r < size; r++) if (!isMarked(r, c)) col = false;
      if (col) hasLine = true;
    }
    let d1 = true;
    let d2 = true;
    for (let i = 0; i < size; i++) {
      if (!isMarked(i, i)) d1 = false;
      if (!isMarked(i, size - 1 - i)) d2 = false;
    }
    if (d1 || d2) hasLine = true;

    const totalCells = size * size;
    const allMarked = marked.size >= totalCells;

    if (hasLine && !bingoWon) {
      bingoWon = true;
      playBingo();
      statusLine.textContent = "BINGO! Keep going for blackout!";
      const w = document.getElementById("bingoWinnerText");
      if (twoPlayer) {
        w.classList.remove("is-hidden");
        w.textContent = "P1: " + game.p1 + " • P2: " + game.p2;
      } else w.classList.add("is-hidden");
      showOverlay(bingoOverlay);
    }

    if (allMarked) {
      phase = "blackout";
      playFanfare();
      const bw = document.getElementById("blackoutWinnerText");
      if (twoPlayer) {
        bw.classList.remove("is-hidden");
        if (game.p1 > game.p2) bw.textContent = "🏆 Player 1 wins the card!";
        else if (game.p2 > game.p1) bw.textContent = "🏆 Player 2 wins the card!";
        else bw.textContent = "🤝 Tie game!";
      } else bw.classList.add("is-hidden");
      showOverlay(blackoutOverlay);
    }
  }

  function startGame(isTwo) {
    twoPlayer = isTwo;
    currentPlayer = 1;
    bingoWon = false;
    game.marked = new Set();
    game.owners = {};
    game.p1 = 0;
    game.p2 = 0;
    game.card = buildCard();
    phase = "playing";
    statusLine.textContent = "Get 5 in a row for BINGO!";

    scoreboard1P.classList.toggle("is-hidden", twoPlayer);
    scoreboard2P.classList.toggle("is-hidden", !twoPlayer);
    playerBar.classList.toggle("is-hidden", !twoPlayer);
    updatePlayerToggle();

    renderGrid();
    renderTripList();
    hideOverlay(startOverlay);
    hideOverlay(bingoOverlay);
    hideOverlay(blackoutOverlay);
    updateUI();
  }

  function newCard() {
    startGame(twoPlayer);
  }

  function updatePlayerToggle() {
    playerToggle.classList.toggle("player-toggle--p1", currentPlayer === 1);
    playerToggle.classList.toggle("player-toggle--p2", currentPlayer === 2);
    document.getElementById("currentPlayerLabel").textContent =
      currentPlayer === 1 ? "Player 1 🔵" : "Player 2 🟠";
  }

  function renderTripList() {
    tripList.innerHTML = "";
    game.tripStates.forEach((st) => {
      const li = document.createElement("li");
      li.textContent = st;
      tripList.appendChild(li);
    });
    document.getElementById("tripListCount").textContent = game.tripStates.length;
    document.getElementById("tripTotal").textContent = game.tripStates.length;
  }

  function updateUI() {
    document.getElementById("markedCount").textContent = game.marked.size;
    document.getElementById("p1Score").textContent = game.p1;
    document.getElementById("p2Score").textContent = game.p2;
  }

  function showOverlay(el) {
    el.classList.remove("is-hidden");
  }
  function hideOverlay(el) {
    el.classList.add("is-hidden");
  }

  document.getElementById("start1P").addEventListener("click", () => {
    resumeAudio();
    startGame(false);
  });
  document.getElementById("start2P").addEventListener("click", () => {
    resumeAudio();
    startGame(true);
  });
  document.getElementById("keepPlayingButton").addEventListener("click", () => {
    hideOverlay(bingoOverlay);
    phase = "playing";
  });
  document.getElementById("newCardButton").addEventListener("click", () => {
    resumeAudio();
    newCard();
  });
  document.getElementById("resetTripButton").addEventListener("click", () => {
    game.tripStates = [];
    saveTrip();
    renderTripList();
    updateUI();
  });
  document.getElementById("helpButton").addEventListener("click", () => showOverlay(helpOverlay));
  document.getElementById("startHelpButton").addEventListener("click", () => showOverlay(helpOverlay));
  document.getElementById("closeHelpButton").addEventListener("click", () => hideOverlay(helpOverlay));

  playerToggle.addEventListener("click", () => {
    if (!twoPlayer || phase !== "playing") return;
    currentPlayer = currentPlayer === 1 ? 2 : 1;
    updatePlayerToggle();
    playTick();
  });

  function loadTrip() {
    try {
      const d = localStorage.getItem(CONFIG.STORAGE_TRIP);
      return d ? JSON.parse(d) : [];
    } catch (e) {
      return [];
    }
  }
  function saveTrip() {
    try {
      localStorage.setItem(CONFIG.STORAGE_TRIP, JSON.stringify(game.tripStates));
    } catch (e) {}
  }

  const soundButton = document.getElementById("soundButton");
  let soundOn = true;
  let audioCtx = null;
  try {
    soundOn = localStorage.getItem(CONFIG.STORAGE_SOUND) !== "off";
  } catch (e) {}

  function renderSound() {
    soundButton.textContent = soundOn ? "🔊" : "🔇";
    soundButton.setAttribute("aria-pressed", String(soundOn));
  }
  soundButton.addEventListener("click", () => {
    soundOn = !soundOn;
    try {
      localStorage.setItem(CONFIG.STORAGE_SOUND, soundOn ? "on" : "off");
    } catch (e) {}
    renderSound();
    if (soundOn) {
      resumeAudio();
      playTick();
    }
  });

  function resumeAudio() {
    if (!soundOn) return;
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      if (!audioCtx) audioCtx = new C();
      if (audioCtx.state === "suspended") audioCtx.resume();
    } catch (e) {
      audioCtx = null;
    }
  }

  function tone(freq, dur, type, vol) {
    if (!soundOn || !audioCtx) return;
    const now = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(vol || 0.08, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start(now);
    o.stop(now + dur + 0.02);
  }

  function playMark() {
    tone(600, 0.07, "square", 0.06);
  }
  function playTick() {
    tone(440, 0.05, "sine", 0.05);
  }
  function playBingo() {
    [660, 880, 1100, 1320].forEach((f, i) => setTimeout(() => tone(f, 0.12, "triangle", 0.08), i * 90));
  }
  function playFanfare() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.18, "triangle", 0.08), i * 110));
  }

  renderSound();
  renderTripList();
  updateUI();
  showOverlay(startOverlay);
})();