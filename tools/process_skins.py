#!/usr/bin/env python3
"""Build the purchasable character skins from their generated sheets.

Each skin lives in ``art/skins/<id>/`` as four magenta-background sheets.
Every sheet is generated as a redraw of the matching **classic reference
sheet** in ``art/skins/_classic/`` (``--refs`` rebuilds those from the game's
own classic frames): same 2x2 layout, same poses, same proportions — only the
costume changes, so every skin does exactly the classic mascot's moves:

    poses.webp     idle / shoot / hurt / cheer
    jump.webp      squat / rising / falling (+ idle, unused)
    spring-a.webp  charge / blast-off / flight / flight
    spring-b.webp  flight / tuck / tuck / star

The AI redraws each sheet at a slightly different size, and wings, plumes and
tails make bounding boxes useless, so each sheet is scaled by its **visors**:
the median ratio between the classic frame's visor and the skin frame's visor
over the frames where both measure cleanly. One scale per sheet keeps the
relative sizes exactly as in the classic sheet.

Output per skin (``public/assets/sprites/skins/<id>/``, content-hashed):
  * ``<pose>.<hash>.webp``  single poses on a shared canvas, 1 px = 1 unit
  * ``<sheet>-sheet.<hash>.webp``  jump (3) and spring (8) atlases
  * ``avatar.<hash>.webp``  round-HUD head crop
plus an ``avatar`` for the classic skin, and ``src/config/skins.json``.

Usage: python3 tools/process_skins.py            all skins (npm run sprites:skins)
       python3 tools/process_skins.py <id> ...   only these skins
       python3 tools/process_skins.py --refs     classic reference sheets
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

# Every skin sheet is a redraw of the matching classic reference sheet in
# art/skins/_classic/ (same 2x2 layout, same poses) — only the costume differs.
# ``sources``: sheet -> (cols, rows) grid, or ("blob", n) for n loose figures.
# ``slots``: skin frame -> classic reference slot, when a sheet has extra figures.
# ``visor_skip``: frames whose visor can't be measured (tilted / hidden heads).
# ``factor``: optional size fudge; ``scale_mul``: per-frame size correction.
_GRID = {"poses": (2, 2), "jump": (2, 2), "spring-a": (2, 2), "spring-b": (2, 2)}
_POSES = {"idle": ("poses", 0), "shoot": ("poses", 1), "hurt": ("poses", 2), "cheer": ("poses", 3)}
_SHEETS = {
    "jump": [("jump", 0), ("jump", 1), ("jump", 2)],
    "spring": [("spring-a", 0), ("spring-a", 1), ("spring-a", 2), ("spring-a", 3),
               ("spring-b", 0), ("spring-b", 1), ("spring-b", 2), ("spring-b", 3)],
}
_SKIP = {("poses", 2), ("jump", 2), ("spring-b", 1), ("spring-b", 2)}
# wings / capes wrapped around the tuck ball make it come out ~20 % too big
_TUCK = {("spring-b", 1): 0.8, ("spring-b", 2): 0.8}

SKINS = {
    "wings": {"visor": "sky", "sources": _GRID, "poses": _POSES, "sheets": _SHEETS,
              "visor_skip": _SKIP},
    "golden": {"visor": "grey", "sources": _GRID, "poses": _POSES, "sheets": _SHEETS,
               "visor_skip": _SKIP},
    "sunfire": {"visor": "navy", "sources": _GRID, "poses": _POSES, "sheets": _SHEETS,
                "visor_skip": _SKIP, "scale_mul": _TUCK},
    "galaxy": {"visor": "sky", "sources": _GRID, "poses": _POSES,
               # spring-a frame 2 strayed from the flight pose; frames 2 and 3 are the
               # same classic pose, so frame 3 is used twice
               "sheets": {**_SHEETS, "spring": [("spring-a", 0), ("spring-a", 1), ("spring-a", 3)]
                          + _SHEETS["spring"][3:]},
               "visor_skip": _SKIP, "scale_mul": _TUCK},
}


def visor_width(rgba, kind, tops=(0.7,), min_ratio=1.15):
    """Visor width, or None when the blob isn't visor-shaped (wider than tall)."""
    for t in tops:
        try:
            x0, y0, x1, y1 = visor_box(rgba, kind, top_only=t)
        except SystemExit:
            continue
        if min_ratio < (x1 - x0) / max(1, y1 - y0) < 1.8:
            return x1 - x0
    return None


def visor_box(rgba, kind, top_only=1.0):
    """Bounding box (x0, y0, x1, y1) of the visor: the largest blob of visor colour."""
    f = rgba.copy()
    f[int(f.shape[0] * top_only):] = 0
    rgb = f[..., :3].astype(float) / 255
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    v = rgb.max(-1)
    s = np.where(v > 0, (v - rgb.min(-1)) / np.maximum(v, 1e-6), 0)
    solid = f[..., 3] > 128
    if kind == "sky":  # medium blue, told apart from indigo suits by hue (galaxy)
        mx, mn = rgb.max(-1), rgb.min(-1)
        d = np.maximum(mx - mn, 1e-6)
        hue = np.where(mx == b, 240 + 60 * (r - g) / d, np.where(mx == g, 120 + 60 * (b - r) / d, 0))
        m = solid & (mx == b) & (hue > 196) & (hue < 226) & (v > 0.3) & (v < 0.85) & (s > 0.4)
    elif kind == "navy":  # dark saturated blue (classic / wings / sunfire)
        m = solid & (b > r + 0.2) & (v > 0.25) & (v < 0.75) & (s > 0.45)
    else:  # desaturated grey-blue (golden)
        m = solid & (b > r + 0.08) & (b >= g - 0.02) & (v > 0.45) & (v < 0.9) & (s > 0.12) & (s < 0.5)
    m = ndimage.binary_fill_holes(ndimage.binary_closing(m, iterations=2 if kind == "sky" else 4))
    lab, n = ndimage.label(m)
    if n == 0:
        raise SystemExit("no visor found")
    areas = ndimage.sum(m, lab, range(1, n + 1))
    k = int(np.argmax(areas)) + 1
    if kind == "sky":
        # the suit shares the visor's hue: the visor is the topmost solid, wide blob
        # (tendrils are thin, fists small, the chest emblem sits below the visor)
        objs = ndimage.find_objects(lab)
        cand = []
        for i, (ys, xs) in enumerate(objs):
            w, h = xs.stop - xs.start, ys.stop - ys.start
            if areas[i] >= 0.15 * areas.max() and areas[i] / (w * h) > 0.55 and 1.05 < w / h < 2.4:
                cand.append(i)
        if cand:
            biggest = max(areas[i] for i in cand)
            cand = [i for i in cand if areas[i] >= 0.35 * biggest]
            k = min(cand, key=lambda i: objs[i][0].start) + 1
    ys, xs = ndimage.find_objects(lab)[k - 1]
    return xs.start, ys.start, xs.stop, ys.stop


def load_frames(skin_id, cfg):
    frames = {}
    for sheet, layout in cfg["sources"].items():
        # sheets are stored as lossless WebP (a third smaller than PNG, same pixels)
        rgb = np.array(Image.open(os.path.join(ART, skin_id, f"{sheet}.webp")).convert("RGB"))
        rgba = key_out(rgb.astype(float))
        if layout[0] == "blob":  # loose figures: separate by connected blobs
            boxes, lab = find_frames(rgba, layout[1])
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
    classic = classic_visors()
    used = set(cfg["poses"].values()) | {k for keys in cfg["sheets"].values() for k in keys}
    # one scale per source sheet: median of classic-visor / skin-visor over the frames
    # both sides measure cleanly, so relative sizes stay exactly as drawn
    sheet_scale = {}
    for sheet in cfg["sources"]:
        # skin visors (helmet tint can make them squarer than the classic ones)
        widths = {k: visor_width(frames[k], cfg["visor"], min_ratio=1.0)
                  for k in sorted(k for k in used if k[0] == sheet)
                  if k not in cfg.get("visor_skip", ())}
        widths = {k: w for k, w in widths.items() if w}
        # one sheet is drawn at one scale: drop measurements far off the median
        mid = float(np.median(list(widths.values()))) if widths else 0
        ratios = []
        for key, sw in widths.items():
            cw = classic.get(cfg.get("slots", {}).get(key, key))
            if cw and abs(sw - mid) <= 0.25 * mid:
                ratios.append(cw / sw)
        if not ratios:
            raise SystemExit(f"{skin_id}: no measurable visor on {sheet}")
        sheet_scale[sheet] = float(np.median(ratios)) * cfg.get("factor", 1.0)
        print(f"  {skin_id}.{sheet}: scale {sheet_scale[sheet]:.3f} from {len(ratios)} frames "
              f"(spread {min(ratios) / max(ratios):.2f})")

    def scale_for(key):
        return sheet_scale[key[0]] * cfg.get("scale_mul", {}).get(key, 1.0)

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
    box = visor_box(idle, cfg["visor"], top_only=0.7)
    name, _ = avatar(idle, box, folder)
    entry["avatar"] = f"skins/{skin_id}/{name}"
    return entry


REF_DIR = os.path.join(ART, "_classic")
REF_CELL = 512
REF_SCALE = 1.25  # px per unit on the reference sheets
# which classic frames go on which reference sheet (2x2, reading order)
REF_SHEETS = {
    "poses": [("pose", "idle"), ("pose", "shoot"), ("pose", "hurt"), ("pose", "cheer")],
    "jump": [("jump", 0), ("jump", 1), ("jump", 2), ("pose", "idle")],  # 4th: spare
    "spring-a": [("spring", 0), ("spring", 1), ("spring", 2), ("spring", 3)],
    "spring-b": [("spring", 4), ("spring", 5), ("spring", 6), ("spring", 7)],
}


def classic_frame(kind, key):
    """A classic frame as RGBA at 1 px per unit (bottom-centre anchored)."""
    if kind == "pose":
        return Image.open(os.path.join(SPRITES, f"{key}.webp")).convert("RGBA")
    meta = json.load(open(os.path.join(ROOT, "src", "config", "spriteSheets.json")))[kind]
    atlas = Image.open(os.path.join(SPRITES, meta["file"])).convert("RGBA")
    cw, ch = meta["cell"]
    x, y = (key % meta["cols"]) * cw, (key // meta["cols"]) * ch
    cell = atlas.crop((x, y, x + cw, y + ch))
    k = UNITS / meta["refHeight"]
    return cell.resize((round(cw * k), round(ch * k)), Image.LANCZOS)


def classic_visors():
    """Visor width of every classic reference slot (units), None if unmeasurable."""
    out = {}
    for sheet, frames in REF_SHEETS.items():
        for i, (kind, key) in enumerate(frames):
            f = np.array(classic_frame(kind, key))
            out[(sheet, i)] = visor_width(f, "navy", tops=(0.6, 0.42))  # cape is navy too
    return out


def build_references():
    """Classic mascot frames on magenta 2x2 sheets: the pose reference every
    skin is generated from, so all skins do exactly the classic poses."""
    os.makedirs(REF_DIR, exist_ok=True)
    for sheet, frames in REF_SHEETS.items():
        out = Image.new("RGBA", (REF_CELL * 2, REF_CELL * 2), (255, 0, 255, 255))
        for i, (kind, key) in enumerate(frames):
            f = classic_frame(kind, key)
            bbox = f.getbbox()
            f = f.crop(bbox)
            f = f.resize((round(f.width * REF_SCALE), round(f.height * REF_SCALE)), Image.LANCZOS)
            cx = (i % 2) * REF_CELL + (REF_CELL - f.width) // 2
            cy = (i // 2) * REF_CELL + REF_CELL - 36 - f.height
            out.alpha_composite(f, (cx, max((i // 2) * REF_CELL + 8, cy)))
        out.convert("RGB").save(os.path.join(REF_DIR, f"{sheet}.png"))
        print(f"reference {sheet}.png")


def build_some(ids):
    """Re-build only the given skins; every other skin keeps its current files."""
    manifest = json.load(open(MANIFEST))
    for skin_id in ids:
        if skin_id not in SKINS:
            raise SystemExit(f"unknown skin {skin_id!r} (known: {', '.join(SKINS)})")
        shutil.rmtree(os.path.join(OUT, skin_id), ignore_errors=True)
        print(skin_id)
        manifest[skin_id] = build_skin(skin_id, SKINS[skin_id])
    with open(MANIFEST, "w") as fh:
        json.dump(manifest, fh, indent=2)
        fh.write("\n")
    print(f"updated {os.path.relpath(MANIFEST, ROOT)}")


def main():
    if "--refs" in sys.argv:
        return build_references()
    ids = [a for a in sys.argv[1:] if not a.startswith("-")]
    if ids:
        return build_some(ids)
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
