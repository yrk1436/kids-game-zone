# Whack-a-Mole 🐹🔨

**Tile tagline:** Tap the peeking moles

Tap moles as they pop up from holes before they escape! Miss 5 moles and it's game over. Build combos by bonking quickly, and watch out for special moles!

## Gameplay

- **Grid**: Starts 3×3, grows to 4×3 at level 4, then 4×4 at level 7
- **Lives**: 5 hearts — lose one when a mole escapes (or tap the bunny!)
- **Levels**: Bonk N moles to advance; moles appear faster each level
- **Combos**: Quick consecutive bonks build x2, x3, x4, x5 multipliers

## Speed Settings by Level

| Level | Grid | Visible (ms) | Spawn Gap (ms) | Max Moles |
|-------|------|--------------|----------------|-----------|
| 1     | 3×3  | 1100         | 900            | 1         |
| 2     | 3×3  | 1000         | 800            | 2         |
| 3     | 3×3  | 900          | 700            | 2         |
| 4     | 4×3  | 850          | 650            | 2         |
| 5     | 4×3  | 800          | 600            | 3         |
| 6     | 4×3  | 750          | 550            | 3         |
| 7     | 4×4  | 700          | 500            | 3         |
| 8     | 4×4  | 650          | 450            | 4         |
| 9     | 4×4  | 600          | 420            | 4         |
| 10+   | 4×4  | 550          | 400            | 5         |

## Special Moles

- **🐹 Golden Mole** (Level 1+, 8%): Worth 5× points!
- **🪖 Helmet Mole** (Level 2+, 10%): Needs 2 taps to bonk
- **💖 Heart Mole** (Level 3+, 6%): Bonk to gain +1 life (max 5)
- **❄️ Freeze Mole** (Level 4+, 5%): Slows all moles for 5 seconds
- **🐰 Bunny Decoy** (Level 2+, 7%): DON'T tap — costs a life!

Each special type shows a "New!" intro card the first time it appears (stored in localStorage).

## Features

- Touch-first design with big tap targets
- WebAudio sound effects with mute toggle
- Combo multiplier with floating text feedback
- Non-blocking level-up toast (~1s)
- "How to Play" help overlay (? button)
- Best score and best level stored in localStorage

## Files

```
games/whack-a-mole/
  index.html   ← HTML structure, overlays, help content
  style.css    ← Game-specific styling (mole grid, holes, animations)
  game.js      ← All game logic, state, sound effects
```
