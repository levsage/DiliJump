# Art sources

Source artwork. **Not shipped** with the game; only the processed files in
`public/assets/` are.

| Path | Description |
| --- | --- |
| `source/mascot-reference.png` | Official Dlicom mascot reference (downscaled) |
| `source/helmet-highlights.png` | Helmet glass highlight layer from the original artwork |
| `poses/*.png` | AI-generated pose renders on a flat magenta (`#FF00FF`) chroma background |
| `sheets/jump.png` | AI-generated 30-frame jump cycle (6×5 grid, magenta background) |
| `sheets/spring.png` | AI-generated 8-frame spring super-jump (charge, blast-off, flight ×3, tuck ×2, unfold) |

## Regenerating sprites

```bash
npm run sprites
# = python3 tools/process_sprites.py art/poses public/assets/sprites 320
```

All seven poses are processed (so they share one scale), but only the ones the
game uses — `idle`, `shoot`, `hurt`, `cheer` — are written, as WebP. `jump`,
`fall` and `crouch` are kept here as source art; in game they were replaced by
the animation sheets.

Animation sheets:

```bash
npm run sprites:sheets
# = python3 tools/process_sheets.py  → public/assets/sprites/*-sheet.webp + src/config/spriteSheets.json
```

It finds each pose on the sheet, keys out the magenta, scales the sheet so the
mascot matches the single-pose sprites, and packs the frames into a WebP atlas.

Needs Python 3 with `numpy`, `Pillow` and `scipy`. The script keys out the
magenta background, removes colour spill from the glass helmet, crops each pose
to its content, scales every pose by the same factor and anchors them
bottom-centre on a shared canvas. It also writes `sprites.json`.
