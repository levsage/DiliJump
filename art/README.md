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
| `skins/_classic/*.png` | Classic mascot reference sheets (2x2, magenta), built from the game's own frames by `process_skins.py --refs` |
| `skins/<id>/reference.jpg` | Uploaded costume art the skin was generated from |
| `skins/<id>/poses.webp` | Idle / shoot / hurt / cheer, magenta background |
| `skins/<id>/jump.webp` | Squat / rising / falling (+ idle, unused) |
| `skins/<id>/spring-a.webp`, `spring-b.webp` | 8-frame spring super-jump, 4 frames per sheet |

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
# = python3 tools/process_sheets.py  → public/assets/sprites/*-sheet.<hash>.webp + src/config/spriteSheets.json
```

It finds each pose on the sheet, keys out the magenta, scales the sheet so the
mascot matches the single-pose sprites, and packs the frames into a WebP atlas.

Needs Python 3 with `numpy`, `Pillow` and `scipy`. The script keys out the
magenta background, removes colour spill from the glass helmet, crops each pose
to its content, scales every pose by the same factor and anchors them
bottom-centre on a shared canvas. It also writes `sprites.json`.

## Dressing Room skins

```bash
npm run sprites:skins
# = python3 tools/process_skins.py  → public/assets/sprites/skins/<id>/*.<hash>.webp + src/config/skins.json
```

Each skin (`wings`, `golden`, `sunfire`, `galaxy`) has four sheets, stored as
lossless WebP (a third smaller than PNG, identical pixels). Every
sheet is a redraw of the matching **classic reference sheet** in
`skins/_classic/` (`python3 tools/process_skins.py --refs` rebuilds those from
the game's own classic frames), with two images given to the image model: the
classic sheet ("keep this exact layout, these exact poses and proportions")
and the costume ("only change the outfit to this"). So every skin does exactly
the classic mascot's moves, frame for frame.

The AI still redraws each sheet at a slightly different size, and wings, plumes
and tails make the bounding box useless as a size reference, so the script
gives **each sheet one scale**: the median ratio between the classic frame's
visor and the skin frame's visor, over the frames where both measure cleanly
(`visor_skip` lists tilted or tucked heads). Visors are found by colour (`navy`,
`grey` or `sky`; `sky` tells a medium-blue visor from an indigo suit by hue and
shape). `scale_mul` corrects single frames drawn out of proportion. Which frame
of which sheet becomes which pose is listed in the `SKINS` table at the top of
the script.

Output per skin: the four single poses (shared canvas, 320 units = the mascot's
draw height), the jump and spring atlases, and a head-crop avatar for the HUD.
`skins.json` records each file with its reference height, so the game draws
every skin at the same body size.

