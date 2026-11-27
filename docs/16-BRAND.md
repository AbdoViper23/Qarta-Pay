# 16 — Brand

The Qarta Pay logo and how to use it. Master files are in `apps/web/public/brand/`, and the site's copy is `apps/web/src/components/Logo.tsx`. Adopted 27 Nov 2026.

## The idea

A coin inside a rounded card unrolls into a receipt strip. Together, the card, coin and strip read as a **Q**: crypto goes in, something real comes out (airtime, a gift card, later a paid bill).

The mark does not draw a phone, a controller or a wallet, so it stays true as the catalogue grows. It also avoids the payments clichés: blue, arrows, shields and globes.

## Construction (256 grid)

- **Card:** a rounded square from 28 to 228, corner radius 40.
- **Hole:** radius 58, centred at (118, 114).
- **Coin:** radius 30, centred in the hole.
- **Strip:** 26 units high. It leaves the hole along the tangent at its bottom (y 146–172) and runs out of the right edge.
- **Small-size cut** (`qarta-mark-small.svg`, used for favicons): the crop is tighter (8–248, radius 44), the hole is larger (r 70), the coin is r 32 and the strip is 34. The wider gaps stay open at 16 px.
- **Single path, no strokes, no text.** The wordmark is set in Barlow Condensed ExtraBold (SIL Open Font License, which allows logo use). Its letters are converted to outlines in every lockup file.

## Files

| File | Use |
|------|-----|
| `qarta-mark.svg` | The symbol in brand red, on light backgrounds |
| `qarta-mark-black.svg`, `qarta-mark-white.svg` | One-colour versions (print, stamps, single-colour media) |
| `qarta-mark-small.svg` | 16–32 px uses. Also `src/app/icon.svg` and the source of `favicon.ico` (16/32/48) |
| `qarta-app-icon.svg` | Full-bleed red app icon. Source of `src/app/apple-icon.png` (180) and `public/icon-192.png` / `icon-512.png` (manifest, maskable) |
| `qarta-lockup.svg` | Horizontal logo: symbol + QARTA PAY, on light backgrounds |
| `qarta-lockup-on-dark.svg` | Horizontal logo on dark backgrounds (lighter red, paper text) |
| `qarta-lockup-black.svg`, `qarta-lockup-white.svg` | One-colour horizontal logo |
| `qarta-lockup-stacked.svg` | Symbol over wordmark, for square spaces |
| `src/app/opengraph-image.png`, `twitter-image.png` | Share preview (1200×630) for Telegram, X and WhatsApp |

## Colour

| Name | HEX | RGB | CMYK (approx.) | Use |
|------|-----|-----|----------------|-----|
| Qarta red | `#D9381E` | 217 56 30 | 0 74 86 15 | The symbol, accents, the app icon |
| Qarta red (dark mode) | `#EF5B3F` | 239 91 63 | 0 62 74 6 | The symbol on dark backgrounds |
| Ink | `#141414` | 20 20 20 | 0 0 0 92 | Wordmark, text, borders |
| Paper | `#FBFAF7` | 251 250 247 | 0 0 1 2 | Backgrounds, the reversed wordmark |

Match the red to a printed swatch book before any print job. The CMYK values above are a screen conversion, and no Pantone has been chosen.

## Rules

- **Clear space:** keep at least the coin's diameter (60 on the 256 grid, about a quarter of the symbol's width) free on every side.
- **Minimum size:** 16 px for the symbol, using the small-size cut below 32 px. The horizontal lockup needs at least 96 px of width.
- **Backgrounds:** paper, white or ink. On a photo or a busy background, use the white one-colour version on a dark area.
- **Do not:**
  - recolour the symbol (other than black or white);
  - stretch, rotate or outline it;
  - add shadows or gradients;
  - fill the hole or the coin;
  - set "QARTA PAY" in another font;
  - put the red symbol on a red or orange background.

## Open items

- No trademark search has been done. Before any commercial use beyond the hackathon, search the trademark databases and run a reverse image search.
- A Pantone match is still needed for print.
