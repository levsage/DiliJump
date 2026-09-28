#!/usr/bin/env python3
"""Build the purchasable character skins from their generated sheets.

Each skin lives in ``art/skins/<id>/`` as four magenta-background sheets
generated from the uploaded character art (see art/README.md):

    poses.png     idle / shoot / hurt / cheer (+ spare poses)
    jump.png      squat / rising / falling (+ spare)
    spring-a.png  charge / blast-off / flight / flight
    spring-b.png  flight / tuck / tuck / star

The AI draws every figure at a slightly different size — and wings and tails
make the bounding box useless as a size reference — so every frame is scaled
by the width of its **visor**, which every pose shows. The target is the
classic mascot's visor (in the classic 320-unit pose canvas), times a per-skin
``factor`` for characters whose helmet is proportionally bigger.

Output per skin (``public/assets/sprites/skins/<id>/``, content-hashed):
  * ``<pose>.<hash>.webp``  single poses on a shared canvas, 1 px = 1 unit
  * ``<sheet>-sheet.<hash>.webp``  jump (3) and spring (8) atlases
  * ``avatar.<hash>.webp``  round-HUD head crop
plus an ``avatar`` for the classic skin, and ``src/config/skins.json``.

Usage: python3 tools/process_skins.py   (npm run sprites:skins)
"""

import hashlib
import io
import json
import os
import shutil
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
from process_sheets import find_frames, grid_frames, tight  # noqa: E402
from process_sprites import key_out  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "art", "skins")
SPRITES = os.path.join(ROOT, "public", "assets", "sprites")
OUT = os.path.join(SPRITES, "skins")
MANIFEST = os.path.join(ROOT, "src", "config", "skins.json")

UNITS = 320  # the classic pose canvas height == PLAYER.DRAW_HEIGHT on screen
CLASSIC_VISOR = 80  # classic visor width in those units (measured on idle.webp)
ATLAS_SCALE = 0.75  # atlases store 0.75 px per unit, like process_sheets.py
AVATAR_PX = 128
WEBP_QUALITY = 88
POSES = ("idle", "shoot", "hurt", "cheer")

SKINS = {
    "wings": {
        "visor": "navy",
        "factor": 0.7,  # slim visor on a big helmet
        "sources": {"poses": (2, 2), "jump": (2, 2), "spring-a": "blob", "spring-b": (2, 2)},
        "poses": {"idle": ("poses", 0), "shoot": ("poses", 1), "hurt": ("poses", 2),
                  "cheer": ("poses", 3)},
        "sheets": {
            "jump": [("jump", 0), ("jump", 1), ("jump", 2)],
            "spring": [("spring-a", 0), ("spring-a", 1), ("spring-a", 2), ("spring-a", 3),
                       ("spring-b", 0), ("spring-b", 1), ("spring-b", 2), ("spring-b", 3)],
        },
        # tilted / side-on heads read narrow visors: size them like a reference frame
        "visor_from": {("poses", 2): ("poses", 0), ("spring-b", 1): ("spring-b", 0),
                       ("spring-b", 2): ("spring-b", 0)},
        # the tuck balls were drawn larger than the flight frames around them
        "scale_mul": {("spring-b", 1): 0.8, ("spring-b", 2): 0.8},
    },
    "golden": {
        "visor": "grey",
        "factor": 1.0,
        "sources": {"poses": (4, 2), "jump": (4, 2), "spring-a": (2, 2), "spring-b": (2, 2)},
        "poses": {"idle": ("poses", 0), "shoot": ("poses", 3), "hurt": ("poses", 4),
                  "cheer": ("poses", 7)},
        "sheets": {
            "jump": [("jump", 0), ("jump", 1), ("jump", 4)],
            "spring": [("spring-a", 0), ("spring-a", 1), ("spring-a", 2), ("spring-a", 3),
                       ("spring-b", 0), ("spring-b", 1), ("spring-b", 2), ("spring-b", 3)],
        },
        "visor_from": {("poses", 4): ("poses", 0), ("spring-b", 1): ("spring-b", 0),
                       ("spring-b", 2): ("spring-b", 0)},
    },
}


def visor_box(rgba, kind, top_only=1.0):
    """Bounding box (x0, y0, x1, y1) of the visor: the largest blob of visor colour."""
    f = rgba.copy()
    f[int(f.shape[0] * top_only):] = 0
    rgb = f[..., :3].astype(float) / 255
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    v = rgb.max(-1)
    s = np.where(v > 0, (v - rgb.min(-1)) / np.maximum(v, 1e-6), 0)
    solid = f[..., 3] > 128
    if kind == "navy":  # dark saturated blue (classic / wings)
        m = solid & (b > r + 0.2) & (v > 0.25) & (v < 0.75) & (s > 0.45)
    else:  # desaturated grey-blue (golden)
        m = solid & (b > r + 0.08) & (b >= g - 0.02) & (v > 0.45) & (v < 0.9) & (s > 0.12) & (s < 0.5)
    m = ndimage.binary_fill_holes(ndimage.binary_closing(m, iterations=4))
    lab, n = ndimage.label(m)
    if n == 0:
        raise SystemExit("no visor found")
    k = int(np.argmax(ndimage.sum(m, lab, range(1, n + 1)))) + 1
    ys, xs = ndimage.find_objects(lab)[k - 1]
    return xs.start, ys.start, xs.stop, ys.stop


def load_frames(skin_id, cfg):
    frames = {}
    for sheet, layout in cfg["sources"].items():
        rgb = np.array(Image.open(os.path.join(ART, skin_id, f"{sheet}.png")).convert("RGB"))
        rgba = key_out(rgb.astype(float))
        if layout == "blob":  # rows overlap vertically: separate by connected blobs
            boxes, lab = find_frames(rgba, 4)
            cut = [tight(rgba, b, lab) for b in boxes]
        else:
            cut = grid_frames(rgba, *layout)
        for i, f in enumerate(cut):
            frames[(sheet, i)] = f
    return frames


def scaled(frame, scale):
    img = Image.fromarray(frame, "RGBA")
    w, h = max(1, round(img.width * scale)), max(1, round(img.height * scale))
    img = img.resize((w, h), Image.LANCZOS)
    a = np.array(img)[..., 3].astype(float)
    # horizontal anchor = mass centroid, so poses don't jitter sideways
    cx = (a.sum(axis=0) * np.arange(w)).sum() / max(a.sum(), 1)
    return img, cx


def pack(items):
    """Bottom-centre anchored cells: returns (cell_w, cell_h, [(img, x, y)])."""
    half = max(max(cx, img.width - cx) for img, cx in items)
    cw = int(np.ceil(half * 2)) + 2
    ch = max(img.height for img, _ in items) + 2
    return cw, ch, [(img, int(round(cw / 2 - cx)), ch - img.height) for img, cx in items]


def save_hashed(img, folder, stem):
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=WEBP_QUALITY, method=6, alpha_quality=100)
    data = buf.getvalue()
    name = f"{stem}.{hashlib.sha256(data).hexdigest()[:8]}.webp"
    with open(os.path.join(folder, name), "wb") as fh:
        fh.write(data)
    return name, len(data)


def avatar(rgba, box, folder, factor=1.0):
    """Square head crop centred on the visor, for the round HUD avatar."""
    x0, y0, x1, y1 = box
    vw = x1 - x0
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2 - vw * 0.1
    half = vw * 0.85 / factor
    img = Image.fromarray(rgba, "RGBA").crop(
        (round(cx - half), round(cy - half), round(cx + half), round(cy + half)))
    return save_hashed(img.resize((AVATAR_PX, AVATAR_PX), Image.LANCZOS), folder, "avatar")


def build_skin(skin_id, cfg):
    folder = os.path.join(OUT, skin_id)
    os.makedirs(folder, exist_ok=True)
    frames = load_frames(skin_id, cfg)
    boxes = {k: visor_box(f, cfg["visor"], top_only=0.7) for k, f in frames.items()}
    target = CLASSIC_VISOR * cfg["factor"]

    def scale_for(key):
        ref = cfg.get("visor_from", {}).get(key, key)
        mul = cfg.get("scale_mul", {}).get(key, 1.0)
        return target * mul / (boxes[ref][2] - boxes[ref][0])

    entry = {"poses": {}, "sheets": {}}
    # single poses: 1 px per unit on a canvas shared by all four poses
    items = [scaled(frames[cfg["poses"][p]], scale_for(cfg["poses"][p])) for p in POSES]
    cw, ch, placed = pack(items)
    for p, (img, x, y) in zip(POSES, placed):
        canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
        canvas.alpha_composite(img, (x, y))
        name, size = save_hashed(canvas, folder, p)
        entry["poses"][p] = {"file": f"skins/{skin_id}/{name}", "refHeight": UNITS,
                             "w": cw, "h": ch}
        print(f"  {skin_id}.{p:6s} {cw}x{ch}  {size / 1024:.0f} KB")

    for sheet, keys in cfg["sheets"].items():
        items = [scaled(frames[k], scale_for(k) * ATLAS_SCALE) for k in keys]
        cw, ch, placed = pack(items)
        cols = min(len(keys), 4)
        rows = -(-len(keys) // cols)
        atlas = Image.new("RGBA", (cw * cols, ch * rows), (0, 0, 0, 0))
        for i, (img, x, y) in enumerate(placed):
            atlas.alpha_composite(img, ((i % cols) * cw + x, (i // cols) * ch + y))
        name, size = save_hashed(atlas, folder, f"{sheet}-sheet")
        entry["sheets"][sheet] = {
            "file": f"skins/{skin_id}/{name}", "cell": [cw, ch], "cols": cols,
            "count": len(keys), "anchor": "bottom-center", "refHeight": UNITS * ATLAS_SCALE,
        }
        print(f"  {skin_id}.{sheet}-sheet {atlas.width}x{atlas.height}  {size / 1024:.0f} KB")

    idle = frames[cfg["poses"]["idle"]]
    name, _ = avatar(idle, boxes[cfg["poses"]["idle"]], folder, cfg["factor"])
    entry["avatar"] = f"skins/{skin_id}/{name}"
    return entry


def main():
    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(OUT)
    manifest = {}
    # classic keeps its original sprites; it only gains a head-crop avatar
    classic = np.array(Image.open(os.path.join(SPRITES, "idle.webp")).convert("RGBA"))
    box = list(visor_box(classic, "navy", top_only=0.42))
    box[0] = box[2] - CLASSIC_VISOR  # the eye highlights split the mask: use the known width
    os.makedirs(os.path.join(OUT, "classic"))
    name, _ = avatar(classic, box, os.path.join(OUT, "classic"))
    manifest["classic"] = {"avatar": f"skins/classic/{name}"}
    for skin_id, cfg in SKINS.items():
        print(skin_id)
        manifest[skin_id] = build_skin(skin_id, cfg)
    with open(MANIFEST, "w") as fh:
        json.dump(manifest, fh, indent=2)
        fh.write("\n")
    print(f"wrote {os.path.relpath(MANIFEST, ROOT)}")


if __name__ == "__main__":
    main()
