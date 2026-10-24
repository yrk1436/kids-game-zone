# Bubble Pop 🫧

**Tile tagline:** Pop every floating bubble

A colorful, tap-to-pop bubble game designed for a 7-year-old. Bubbles drift up from the bottom of the screen, and you tap or click them to pop them for points!

## How to Play

1. Tap or click bubbles before they float off the top of the screen
2. Bigger bubbles give more points
3. Let a bubble escape and you lose a life (you have 5)
4. The game gradually speeds up as you play
5. Try to beat your best score!

## Features

- **Touch-first design**: Big, easy-to-tap bubbles that work great on iPad, phone, or with a mouse
- **Satisfying feedback**: Pop animation and WebAudio sound effects
- **Sound toggle**: Mute button in the top bar
- **Best score**: Saved locally so you can try to beat your record
- **Forgiving start**: Grace period at the beginning where escaped bubbles don't count
- **Kid-friendly visuals**: Bright colors, smooth animations, and no scary elements

## Controls

- **Tap/Click**: Pop a bubble
- **Sound button (🔊/🔇)**: Toggle sound on/off

## Files

```
bubble-pop/
  index.html   <- links ../../style.css first, then its own style.css
  style.css    <- only game-specific styling
  game.js      <- CONFIG -> canvas setup -> state -> input -> update -> draw
```

Built following the recipe in [../README.md](../README.md).
