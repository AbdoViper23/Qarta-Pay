# demo/

Material for the hackathon demo video. The script and the shot list are in `docs/17-DEMO-SCRIPT.md`.

| Path | What |
|------|------|
| `scenes.html` | The six animated scenes, one per URL hash (`scenes.html#1` … `#6`), 1920×1080, in the site's fonts and colours |
| `storyboard/` | One rendered frame per scene and `storyboard.png`, the one-page overview |
| `fonts/` | Barlow Condensed and IBM Plex Mono (SIL Open Font License, see the `OFL-*.txt` files), so rendering works offline |
| `tools/shot.mjs` | Screenshots a page with headless Chrome (`CHROME=<chrome-headless-shell> W=1920 H=1080 node demo/tools/shot.mjs <url> <waitMs> <out.png>`) |

Re-render a scene:

```bash
CHROME=~/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell \
  node demo/tools/shot.mjs "file://$PWD/demo/scenes.html#3" 2500 demo/storyboard/scene-3.png
```
