# Adding a new game

Every game is a self-contained folder. Nothing outside the folder needs to change
except one `locked` flag on the hub.

## Recipe

1. **Pick the folder.** One of the placeholder folders here (`fruit-catcher`,
   `bubble-pop`, `whack-a-mole`, `maze-escape`, `target-archery`,
   `memory-match`) or a brand new one.

2. **Copy `dino-runner/` as the template.** It already has the structure and the
   comments explaining each section:

   ```
   your-game/
     index.html   <- links ../../style.css first, then its own style.css
     style.css    <- only game-specific styling
     game.js      <- CONFIG -> canvas setup -> state -> input -> update -> draw
   ```

3. **Keep the shared pieces**, so all the games feel like one product:
   - `<a class="btn btn--purple" href="../../index.html">⬅️ Back to Games</a>` in the top bar
   - The `.game-bar` header with `.score-chip` score/best readouts
   - A `.stage` wrapper holding the `<canvas>` plus the HTML overlays
   - Start overlay, Paused overlay, Game Over overlay (final score, big
     **Play Again**, and **Back to Games**)
   - Best score in `localStorage` under a `badri.<game-id>.best` key

4. **Unlock the tile.** In `../index.html`, find the game in the `GAMES` array
   and change `locked: true` to `locked: false`. That is the only edit needed.

## House rules (this hub is for a 7-year-old)

- **One simple control.** One button, or one tap target. No combos.
- **Forgiving.** Start slow, ramp up gently, use padded hitboxes, and make the
  first 10–15 seconds nearly impossible to lose.
- **Cheerful.** Bright colours, emoji sprites, no dark or scary themes.
- **Touch first.** Buttons at least 56px tall, `touch-action: none` on the
  canvas stage so tapping never scrolls or zooms the page.
- **No build step.** Plain HTML/CSS/JS that runs by opening the file.
