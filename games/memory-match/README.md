# Memory Match 🃏

**Tile tagline:** Find the matching pairs

A colorful flip-the-cards memory game for a 7-year-old. Cartoon animals and fruit hide on the back of each card — tap two at a time and remember where the pairs live.

## How to Play

1. Pick a level: **Easy 3×4**, **Medium 4×4**, or **Hard 4×5**
2. Tap or click a card to flip it, then flip a second card
3. A match stays face-up with a happy sparkle
4. A miss flips back — try to remember those spots
5. Clear every pair to win. Fewer moves is a better score!

## Levels

| Level | Grid | Pairs |
| --- | --- | --- |
| Easy | 3×4 | 6 |
| Medium | 4×4 | 8 |
| Hard | 4×5 | 10 |

## Features

- **Flip animation** with a 3D card turn
- **Move counter** and **timer** (timer starts on the first flip)
- **Best score** (fewest moves) saved per level in `localStorage` (`badri.memory-match.best`)
- **Win celebration** with confetti and a new-best banner
- **Touch-first**: 56px+ tap targets, `user-scalable=no`, `touch-action: manipulation`, board fits an iPhone screen
- **Sound toggle** using WebAudio (no sound files)
- **How to Play** overlay and pause if you leave the tab

## Controls

- **Tap / click** a face-down card to flip it
- **Sound button (🔊/🔇)** in the top bar
- **?** for the help card

## Files

```
memory-match/
  index.html   <- links ../../style.css first, then its own style.css
  style.css    <- only game-specific styling
  game.js      <- CONFIG -> board -> flip / match -> overlays
```

Built following the recipe in [../README.md](../README.md).
