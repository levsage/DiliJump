# Art sources

Source artwork. **Not shipped** with the game; only the processed files in
`public/assets/` are.

| Path | Description |
| --- | --- |
| `source/mascot-reference.png` | Official Dlicom mascot reference (downscaled) |
| `source/helmet-highlights.png` | Helmet glass highlight layer from the original artwork |
| `poses/*.png` | AI-generated pose renders on a flat magenta (`#FF00FF`) chroma background |

## Regenerating sprites

```bash
npm run sprites
# = python3 tools/process_sprites.py art/poses public/assets/sprites 320
```

Needs Python 3 with `numpy`, `Pillow` and `scipy`. The script keys out the
magenta background, removes colour spill from the glass helmet, crops each pose
to its content, scales every pose by the same factor and anchors them
bottom-centre on a shared canvas. It also writes `sprites.json`.
