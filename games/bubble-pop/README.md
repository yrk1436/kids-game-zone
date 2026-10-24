# Bubble Pop 🫧

**Tile tagline:** Pop every floating bubble

A colorful, tap-to-pop bubble game designed for a 7-year-old. Bubbles drift up from the bottom of the screen, and you tap or click them to pop them for points!

## How to Play

1. Tap or click bubbles before they float off the top of the screen
2. Complete each level's goal to progress (pop 10, 12, 15... bubbles)
3. Bigger bubbles give more points
4. Pop bubbles quickly in succession to build combos (up to x5 multiplier!)
5. Let a bubble escape and you lose a life (you have 5)
6. Earn 1-3 stars per level based on lives lost
7. Try to beat your best score and reach the highest level!

## Levels

- **Levels 1-2**: Very gentle — slow bubbles, plenty of time, hard to lose
- Each level has a goal (10 → 12 → 15 → 18 → 20 → 22 → 25...)
- Complete a level to see your star rating and unlock the next
- Best level reached is saved to localStorage

## Special Bubbles

New special bubbles are introduced one per level with an intro screen:

| Level | Bubble | Effect |
|-------|--------|--------|
| 2 | ⭐ **Gold** | Worth 5x points! |
| 3 | ❤️ **Heart** | +1 life (max 5) |
| 4 | 🐌 **Slow-Mo** | Slows everything for 5 seconds (purple tint) |
| 5 | 🌈 **Rainbow** | Pops ALL bubbles on screen! |
| 6 | 💣 **Spiky Bomb** | AVOID! Costs a life if popped (clearly distinct look) |

Special bubbles are rare (~6-14% chance depending on level).

## Combo System

- Pop bubbles within ~0.8 seconds of each other to build a combo
- Multiplier increases: x2 → x3 → x4 → x5 (capped)
- Big "x3 COMBO!" text shown at top of screen
- Pop sound pitch rises with combo
- Combo resets on miss-tap or pause in popping
- Multiplier applies to all points earned

## Features

- **Touch-first design**: Big, easy-to-tap bubbles (30-50px radius + 14px tap padding)
- **Level progression**: 10+ levels with increasing difficulty
- **Star ratings**: 1-3 stars per level based on lives lost (3 = perfect)
- **Satisfying feedback**: Pop animation, particles, and WebAudio sounds
- **Sound toggle**: Mute button in the top bar
- **Progress bar**: Shows how close you are to completing the level
- **Best score & level**: Both saved locally
- **Forgiving start**: 4 second grace period + very gentle first two levels
- **Kid-friendly visuals**: Bright colors, smooth animations, no scary elements
- **Slow-mo visual**: Purple tint overlay when slow-mo is active

## Controls

- **Tap/Click**: Pop a bubble (or avoid bombs!)
- **Sound button (🔊/🔇)**: Toggle sound on/off

## Files

```
bubble-pop/
  index.html   <- links ../../style.css first, then its own style.css
  style.css    <- only game-specific styling
  game.js      <- CONFIG -> canvas setup -> state -> input -> update -> draw
```

Built following the recipe in [../README.md](../README.md).
