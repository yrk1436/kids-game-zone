(function () {
  "use strict";

  const CONFIG = {
    ITEMS_PER_ROUND: 12,
    POINTS: 10,
    BONUS_POINTS: 15,
    BONUS_IDS: new Set(["bridge", "train", "plane", "tractor"]),
    STORAGE_BEST: "badri.scavenger.best",
    STORAGE_SOUND: "badri.scavenger.sound",
    STORAGE_SEEN: "badri.scavenger.seen",
  };

  const ALL_ITEMS = [
    { id: "cow", emoji: "🐄", name: "Cow" },
    { id: "horse", emoji: "🐴", name: "Horse" },
    { id: "redcar", emoji: "🚗", name: "Red Car" },
    { id: "bus", emoji: "🚌", name: "School Bus" },
    { id: "truck", emoji: "🚚", name: "Truck" },
    { id: "bridge", emoji: "🌉", name: "Bridge" },
    { id: "gas", emoji: "⛽", name: "Gas Station" },
    { id: "dog", emoji: "🐕", name: "Dog" },
    { id: "flag", emoji: "🚩", name: "Flag" },
    { id: "tractor", emoji: "🚜", name: "Tractor" },
    { id: "train", emoji: "🚂", name: "Train" },
    { id: "police", emoji: "🚓", name: "Police Car" },
    { id: "plane", emoji: "✈️", name: "Airplane" },
    { id: "motorcycle", emoji: "🏍️", name: "Motorcycle" },
    { id: "stopsign", emoji: "🛑", name: "Stop Sign" },
    { id: "firetruck", emoji: "🚒", name: "Fire Truck" },
    { id: "bike", emoji: "🚲", name: "Bicycle" },
    { id: "boat", emoji: "⛵", name: "Boat" },
  ];

  const INTRO_INFO = {
    bridge: { desc: "Worth bonus points — look high!" },
    train: { desc: "Choo choo! Bonus points!" },
    airplane: { desc: "Look up — bonus points!" },
    tractor: { desc: "Farm country favorite — bonus!" },
    plane: { desc: "Sky spy — bonus points!" },
  };

  let phase = "ready";
  let twoPlayer = false;
  let currentPlayer = 1;
  const game = {
    round: 1,
    score: 0,
    best: loadBest(),
    p1: 0,
    p2: 0,
    items: [],
    seen: loadSeen(),
    pendingIntro: null,
  };

  const huntGrid = document.getElementById("huntGrid");
  const startOverlay = document.getElementById("startOverlay");
  const roundCompleteOverlay = document.getElementById("roundCompleteOverlay");
  const helpOverlay = document.getElementById("helpOverlay");
  const newItemOverlay = document.getElementById("newItemOverlay");
  const scoreboard1P = document.getElementById("scoreboard1P");
  const scoreboard2P = document.getElementById("scoreboard2P");
  const playerBar = document.getElementById("playerBar");
  const playerToggle = document.getElementById("playerToggle");
  const currentPlayerLabel = document.getElementById("currentPlayerLabel");

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function pickRoundItems() {
    return shuffle(ALL_ITEMS).slice(0, CONFIG.ITEMS_PER_ROUND);
  }

  function buildGrid() {
    huntGrid.innerHTML = "";
    game.items.forEach((item, index) => {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "hunt-cell";
      cell.dataset.testid = "hunt-cell";
      cell.dataset.id = item.id;
      cell.dataset.index = String(index);
      cell.innerHTML =
        '<span class="hunt-cell__emoji" aria-hidden="true">' +
        item.emoji +
        '</span><span class="hunt-cell__name">' +
        item.name +
        "</span>";
      cell.addEventListener("pointerdown", onCellTap);
      huntGrid.appendChild(cell);
    });
  }

  function onCellTap(e) {
    e.preventDefault();
    if (phase !== "playing") return;
    const cell = e.currentTarget;
    if (cell.classList.contains("is-found")) return;

    resumeAudio();
    cell.classList.add("is-found");
    if (twoPlayer) {
      cell.classList.add(currentPlayer === 1 ? "found-p1" : "found-p2");
    }

    const id = cell.dataset.id;
    const pts = CONFIG.BONUS_IDS.has(id) ? CONFIG.BONUS_POINTS : CONFIG.POINTS;
    playFound();

    if (twoPlayer) {
      if (currentPlayer === 1) game.p1 += pts;
      else game.p2 += pts;
    } else {
      game.score += pts;
    }

    maybeShowIntro(id);
    updateUI();

    if (game.items.every((_, i) => isFound(i))) {
      finishRound();
    }
  }

  function isFound(index) {
    const cell = huntGrid.children[index];
    return cell && cell.classList.contains("is-found");
  }

  function finishRound() {
    phase = "complete";
    playFanfare();

    if (!twoPlayer) {
      const isNew = game.score > game.best;
      if (isNew) {
        game.best = game.score;
        saveBest(game.best);
      }
      document.getElementById("roundCompleteTitle").textContent = "Round Complete!";
      document.getElementById("roundCompleteScore").textContent = "Score: " + game.score;
      document.getElementById("winnerText").classList.add("is-hidden");
    } else {
      document.getElementById("roundCompleteTitle").textContent = "Round Over!";
      document.getElementById("roundCompleteScore").textContent =
        "P1: " + game.p1 + "  •  P2: " + game.p2;
      const w = document.getElementById("winnerText");
      w.classList.remove("is-hidden");
      if (game.p1 > game.p2) w.textContent = "🏆 Player 1 wins!";
      else if (game.p2 > game.p1) w.textContent = "🏆 Player 2 wins!";
      else w.textContent = "🤝 It's a tie!";
    }

    showOverlay(roundCompleteOverlay);
    updateUI();
  }

  function startRound(isTwo) {
    twoPlayer = isTwo;
    if (game.round === 1 && !twoPlayer) game.score = 0;
    if (game.round === 1 && twoPlayer) {
      game.p1 = 0;
      game.p2 = 0;
    }
    if (game.round > 1 && !twoPlayer) {
      /* score carries across rounds in 1P */
    }
    if (game.round > 1 && twoPlayer) {
      game.p1 = 0;
      game.p2 = 0;
    }

    currentPlayer = 1;
    game.items = pickRoundItems();
    buildGrid();
    phase = "playing";

    scoreboard1P.classList.toggle("is-hidden", twoPlayer);
    scoreboard2P.classList.toggle("is-hidden", !twoPlayer);
    playerBar.classList.toggle("is-hidden", !twoPlayer);
    updatePlayerToggle();

    hideOverlay(startOverlay);
    hideOverlay(roundCompleteOverlay);
    updateUI();
  }

  function newRound() {
    game.round += 1;
    startRound(twoPlayer);
  }

  function maybeShowIntro(id) {
    if (game.seen[id] || !INTRO_INFO[id]) return;
    const item = ALL_ITEMS.find((x) => x.id === id);
    if (!item) return;
    game.seen[id] = true;
    saveSeen();
    game.pendingIntro = item;
    document.getElementById("newItemIcon").textContent = item.emoji;
    document.getElementById("newItemTitle").textContent = item.name + "!";
    document.getElementById("newItemDesc").textContent =
      (INTRO_INFO[id] || INTRO_INFO.plane || { desc: "Bonus find!" }).desc;
    showOverlay(newItemOverlay);
  }

  function updatePlayerToggle() {
    playerToggle.classList.toggle("player-toggle--p1", currentPlayer === 1);
    playerToggle.classList.toggle("player-toggle--p2", currentPlayer === 2);
    playerToggle.classList.toggle("is-active", true);
    currentPlayerLabel.textContent =
      currentPlayer === 1 ? "Player 1 🔵" : "Player 2 🟠";
  }

  function updateUI() {
    document.getElementById("roundValue").textContent = game.round;
    document.getElementById("roundValue2P").textContent = game.round;
    document.getElementById("scoreValue").textContent = game.score;
    document.getElementById("bestValue").textContent = game.best;
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
    game.round = 1;
    game.score = 0;
    startRound(false);
  });
  document.getElementById("start2P").addEventListener("click", () => {
    resumeAudio();
    game.round = 1;
    startRound(true);
  });
  document.getElementById("newRoundButton").addEventListener("click", () => {
    resumeAudio();
    newRound();
  });
  document.getElementById("helpButton").addEventListener("click", () => showOverlay(helpOverlay));
  document.getElementById("startHelpButton").addEventListener("click", () => showOverlay(helpOverlay));
  document.getElementById("closeHelpButton").addEventListener("click", () => hideOverlay(helpOverlay));
  document.getElementById("dismissIntroButton").addEventListener("click", () => {
    hideOverlay(newItemOverlay);
    game.pendingIntro = null;
  });

  playerToggle.addEventListener("click", () => {
    if (!twoPlayer || phase !== "playing") return;
    currentPlayer = currentPlayer === 1 ? 2 : 1;
    updatePlayerToggle();
    playTick();
  });

  function loadBest() {
    try {
      const v = parseInt(localStorage.getItem(CONFIG.STORAGE_BEST), 10);
      return Number.isFinite(v) && v > 0 ? v : 0;
    } catch (e) {
      return 0;
    }
  }
  function saveBest(v) {
    try {
      localStorage.setItem(CONFIG.STORAGE_BEST, String(v));
    } catch (e) {}
  }
  function loadSeen() {
    try {
      const d = localStorage.getItem(CONFIG.STORAGE_SEEN);
      return d ? JSON.parse(d) : {};
    } catch (e) {
      return {};
    }
  }
  function saveSeen() {
    try {
      localStorage.setItem(CONFIG.STORAGE_SEEN, JSON.stringify(game.seen));
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

  function tone(freq, dur, type, vol, end) {
    if (!soundOn || !audioCtx) return;
    const now = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, now);
    if (end) o.frequency.exponentialRampToValueAtTime(Math.max(end, 1), now + dur);
    g.gain.setValueAtTime(vol || 0.08, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start(now);
    o.stop(now + dur + 0.02);
  }

  function playFound() {
    tone(520, 0.08, "triangle", 0.08);
    setTimeout(() => tone(780, 0.1, "triangle", 0.07), 50);
  }
  function playTick() {
    tone(440, 0.05, "sine", 0.05);
  }
  function playFanfare() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.18, "triangle", 0.08), i * 110));
  }

  renderSound();
  updateUI();
  showOverlay(startOverlay);
})();