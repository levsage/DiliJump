"""
Slice AI-generated animation sheets (many poses on one flat magenta image)
into bottom-anchored frames and pack them into a compact sprite atlas.

Each sheet is scaled so that a chosen reference frame matches the content
height of an existing single-pose sprite, which keeps the mascot the same
size as in public/assets/sprites/*.png.

Usage: npm run sprites:sheets   (= python3 tools/process_sheets.py)

Outputs public/assets/sprites/<name>-sheet.webp + src/config/spriteSheets.json
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
from process_sprites import key_out  # noqa: E402  (shared chroma-key)

ROOT = os.path.join(os.path.dirname(__file__), "..")
SPRITES = os.path.join(ROOT, "public", "assets", "sprites")
REF_CANVAS_H = 320  # canvas height of the single-pose sprites

# name -> source sheet, expected frame count, reference frame index and the
# single-pose sprite whose content height it should match.
SHEETS = {
    "jump": {"src": "art/sheets/jump.png", "count": 12, "ref": 3, "match": "jump"},
    "spring": {"src": "art/sheets/spring.png", "count": 8, "ref": 1, "match": "shoot"},
}
PAD = 6
# Atlas resolution relative to the 320px single-pose sprites. The mascot is
# drawn ~104 CSS px tall (≤ 208 device px at the max DPR of 2), so 0.75 keeps
# it crisp while cutting the download size roughly in half.
ATLAS_SCALE = 0.75
WEBP_QUALITY = 88


def find_frames(rgba, count):
    """Connected blobs → frame boxes, ordered in reading order (rows, then x)."""
    solid = rgba[..., 3] > 40
    # merge nearby parts of the same pose (gloves, cape tips) before labelling
    merged = ndimage.binary_dilation(solid, iterations=3)
    lab, n = ndimage.label(merged)
    boxes = []
    for i, sl in enumerate(ndimage.find_objects(lab), start=1):
        ys, xs = sl
        area = solid[sl].sum()
        boxes.append((xs.start, ys.start, xs.stop, ys.stop, area, i))
    biggest = max(b[4] for b in boxes)
    boxes = [b for b in boxes if b[4] > biggest * 0.15]  # drop stray specks
    if len(boxes) != count:
        raise SystemExit(f"expected {count} frames, found {len(boxes)}")
    # reading order: group into rows by vertical centre
    boxes.sort(key=lambda b: (b[1] + b[3]) / 2)
    rows, row = [], [boxes[0]]
    for b in boxes[1:]:
        prev_cy = np.mean([(r[1] + r[3]) / 2 for r in row])
        avg_h = np.mean([r[3] - r[1] for r in row])
        if abs((b[1] + b[3]) / 2 - prev_cy) < avg_h * 0.5:
            row.append(b)
        else:
            rows.append(row)
            row = [b]
    rows.append(row)
    ordered = [b for r in rows for b in sorted(r, key=lambda b: b[0])]
    return ordered, lab


def tight(rgba, box, lab):
    """Crop one frame, masking out pixels that belong to neighbouring poses."""
    x0, y0, x1, y1, _, label = box
    crop = rgba[y0:y1, x0:x1].copy()
    crop[..., 3] = np.where(lab[y0:y1, x0:x1] == label, crop[..., 3], 0)
    ys, xs = np.where(crop[..., 3] > 8)
    return crop[ys.min(): ys.max() + 1, xs.min(): xs.max() + 1]


def process(name, cfg):
    rgb = np.array(Image.open(os.path.join(ROOT, cfg["src"])).convert("RGB")).astype(float)
    rgba = key_out(rgb)
    boxes, lab = find_frames(rgba, cfg["count"])
    frames = [tight(rgba, b, lab) for b in boxes]

    meta = json.load(open(os.path.join(SPRITES, "sprites.json")))
    target_h = meta["frames"][cfg["match"]]["h"]
    scale = target_h / frames[cfg["ref"]].shape[0] * ATLAS_SCALE

    scaled = []
    for f in frames:
        img = Image.fromarray(f, "RGBA")
        w, h = max(1, round(img.width * scale)), max(1, round(img.height * scale))
        img = img.resize((w, h), Image.LANCZOS)
        a = np.array(img)[..., 3].astype(float)
        # horizontal anchor = mass centroid (body), not bbox centre, so poses
        # with one arm stretched out don't jitter sideways between frames
        cx = (a.sum(axis=0) * np.arange(w)).sum() / max(a.sum(), 1)
        scaled.append((img, cx))

    half_w = max(max(cx, img.width - cx) for img, cx in scaled)
    cell_w = int(np.ceil(half_w * 2)) + PAD * 2
    cell_h = max(img.height for img, _ in scaled) + PAD
    cols = min(len(scaled), 6)
    rows = int(np.ceil(len(scaled) / cols))
    atlas = Image.new("RGBA", (cols * cell_w, rows * cell_h), (0, 0, 0, 0))
    for i, (img, cx) in enumerate(scaled):
        ox = (i % cols) * cell_w + round(cell_w / 2 - cx)
        oy = (i // cols) * cell_h + cell_h - img.height
        atlas.paste(img, (ox, oy), img)

    out_file = os.path.join(SPRITES, f"{name}-sheet.webp")
    atlas.save(out_file, "WEBP", quality=WEBP_QUALITY, method=6, alpha_quality=100)
    info = {
        "file": f"{name}-sheet.webp",
        "cell": [cell_w, cell_h],
        "cols": cols,
        "count": len(scaled),
        "anchor": "bottom-center",
        "refHeight": round(REF_CANVAS_H * ATLAS_SCALE),
    }
    print(f"{name:7s} {len(scaled)} frames, cell {cell_w}x{cell_h}, atlas {atlas.size}, "
          f"{os.path.getsize(out_file) // 1024} KB")
    return info


def main():
    out = {name: process(name, cfg) for name, cfg in SHEETS.items()}
    # metadata is imported by the game code (src/config/assets.js)
    with open(os.path.join(ROOT, "src", "config", "spriteSheets.json"), "w") as f:
        json.dump(out, f, indent=2)
        f.write("\n")


if __name__ == "__main__":
    main()
