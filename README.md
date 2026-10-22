# Badri's Game Zone 🎮

A little hub of browser games for a 7-year-old. Plain HTML, CSS and vanilla
JavaScript — no frameworks, no bundler, no `npm install`.

## Running it

Double-click `index.html`, or serve the folder if you prefer a local server:

```bash
# Python 3
python -m http.server 8000
# then open http://localhost:8000
```

Everything works straight from the file system too (`file://`), since there are
no modules, fetches or external dependencies.

## What's here

| Game | Status |
| --- | --- |
| 🦖 Dino Runner | Playable |
| 🐍 Snake | Playable |
| 🍎 Fruit Catcher | Playable |
| 🫧 Bubble Pop | Coming soon |
| 🐹 Whack-a-Mole | Coming soon |
| 🧩 Maze Escape | Coming soon |
| 🏹 Target Archery | Coming soon |
| 🃏 Memory Match | Coming soon |

```
kids-game-hub/
  index.html          the hub page (tile grid, GAMES config at the bottom)
  style.css           shared theme: palette, buttons, tile grid, game top bar
  games/
    README.md         how to add or unlock a game
    dino-runner/      index.html + style.css + game.js
    snake/            index.html + style.css + game.js
    fruit-catcher/    index.html + style.css + game.js
    ...               placeholder folders for the upcoming games
```

## Dino Runner

Endless runner with two controls:

| Action | Keyboard | Touch |
| --- | --- | --- |
| Jump (cactus and rocks) | `Space` / `↑` / `W` | Tap the picture, or the **Jump** pad |
| Duck (flocks of birds) | Hold `↓` / `S` | Hold the **Duck** pad |

Holding duck in mid-air also makes the dino drop faster, which is the escape
hatch if he jumps just as birds arrive.

Score climbs 10 points per second plus 25 for every obstacle cleared. The best
score is saved in `localStorage` (`badri.dino-runner.best`) with a 🎉
celebration when it's beaten, and sound toggles with the 🔊 button.

### Levels

A new level starts every 250 points, shown in the **Level** chip and announced
with a banner. Levels unlock new obstacle shapes and slowly tighten the gaps
between them:

| Level | Unlocks |
| --- | --- |
| 1 | Short cactus and rocks — jump only |
| 2 | Taller cactus |
| 3 | 🦅 Flocks of birds — these must be **ducked**, jumping can't clear them |
| 4 | Double cactus |
| 5+ | Same shapes, gaps keep tightening a little |

Difficulty lives in the `CONFIG` object at the top of
`games/dino-runner/game.js` — every number that affects how hard the game feels
is in that one block, and `OBSTACLE_TYPES` right below it controls which shape
appears at which level.

## Snake

The old-Nokia classic. Steer the snake around the grid and eat the blinking
dot to grow one segment (+10 points each).

| Action | How |
| --- | --- |
| Turn | Arrow keys / `WASD`, **swipe** the board, or the on-screen **D-pad** |

- The **walls don't kill** — slide off one edge and you reappear on the
  opposite side (classic wrap-around).
- Biting your own body ends the game.
- Best score is saved in `localStorage` (`badri.snake.best`) with a 🎉
  celebration when it's beaten. Fill the whole board and you win outright.

### Levels & speed

The snake gets one notch faster each time you clear a level, and a level is
cleared by eating a growing number of dots. It starts slow and forgiving and
ramps up gently:

| Level | Dots to clear | Step time |
| --- | --- | --- |
| 1 | 5 | 0.20s |
| 2 | 8 | 0.18s |
| 3 | 10 | 0.16s |
| 4 | 13 | 0.15s |
| 5 | 15 | 0.13s |
| … | +2–3 each level | ~10% faster each level, down to 0.085s |

Each level-up flashes the **Level** chip and a big "LEVEL 2!" banner. The dots
needed come from `dotsToClearLevel()` (`round(5 + 2.5 × (level − 1))`) and the
per-level speed from `speedForLevel()` — both at the top of
`games/snake/game.js`, alongside the `CONFIG` block (grid size, start/min speed,
how much each level speeds up, points per dot).

## Fruit Catcher

Slide a basket along the bottom and catch the fruit tumbling from the sky.

| Action | How |
| --- | --- |
| Move the basket | Arrow keys / `A`,`D`, **drag** the board, or the on-screen **⬅️ ➡️** buttons |

- Catch a piece of fruit for **+10**; a golden ⭐ star is worth **+30**.
- Drop a piece of fruit and you lose one of your **three baskets** (❤️ up in the
  corner). Lose all three and the game ends.
- Best score is saved in `localStorage` (`badri.fruitcatcher.best`) with a 🎉
  celebration when it's beaten.

### Levels & speed

Each level the fruit falls a little faster and a little more often. A level is
cleared by catching a growing number of fruit — it starts slow and forgiving:

| Level | Catches to clear | Fall speed | Drop gap |
| --- | --- | --- | --- |
| 1 | 5 | 135 px/s | 1.5s |
| 2 | 8 | ~151 px/s | ~1.35s |
| 3 | 10 | ~169 px/s | ~1.22s |
| 4 | 13 | ~190 px/s | ~1.09s |
| … | +2–3 each level | ~12% faster, up to 360 px/s | ~10% quicker, down to 0.6s |

Each level-up flashes the **Level** chip and a big "LEVEL 2!" banner. The
catches needed come from `catchesToClearLevel()` (`round(5 + 2.5 × (level − 1))`)
and the per-level fall speed / drop gap from `fallSpeedForLevel()` and
`spawnGapForLevel()` — all at the top of `games/fruit-catcher/game.js`, alongside
the `CONFIG` block (basket size/speed, lives, scoring, star chance).

## Adding the next game

See [`games/README.md`](games/README.md). Short version: copy `dino-runner/`,
build the game, then change that game's `locked: true` to `locked: false` in the
`GAMES` array at the bottom of `index.html`.
