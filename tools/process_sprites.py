"""
Convert AI-generated pose renders (on a flat magenta chroma background)
into transparent, uniformly-scaled, bottom-aligned game sprites.

Usage: python3 process_sprites.py <src_dir> <out_dir> [canvas_height]
"""
import sys, os, json
import numpy as np
from PIL import Image
from scipy import ndimage

POSES = ["idle", "jump", "fall", "crouch", "shoot", "hurt", "cheer"]
# Poses the game still loads as single images. jump / fall / crouch are
# processed only to keep the shared scale (and the sizes in sprites.json that
# tools/process_sheets.py matches against); the animation sheets replace them.
SHIPPED = {"idle", "shoot", "hurt", "cheer"}
WEBP_QUALITY = 90
KEY_LO, KEY_HI = 70.0, 175.0   # "magenta-ness" ramp -> alpha


def key_out(rgb: np.ndarray) -> np.ndarray:
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    m = np.minimum(r, b) - g                         # magenta-ness score
    alpha = 1.0 - np.clip((m - KEY_LO) / (KEY_HI - KEY_LO), 0, 1)

    # keep only substantial connected blobs (drop specks / floor shadows)
    solid = alpha > 0.5
    lab, n = ndimage.label(solid)
    if n:
        sizes = ndimage.sum(solid, lab, range(1, n + 1))
        keep = np.isin(lab, 1 + np.where(sizes >= sizes.max() * 0.02)[0])
        keep = ndimage.binary_dilation(keep, iterations=3)
        alpha = alpha * keep

    # unmix the magenta background from semi-transparent edges / glass
    a = np.clip(alpha, 1e-3, 1)[..., None]
    bg = np.array([255.0, 0.0, 255.0])
    fg = (rgb - (1 - a) * bg) / a
    fg = np.clip(fg, 0, 255)
    # glass helmet picks up a violet tint from the key colour: rotate those
    # violet pixels (r > g, b >= r) back to the character's sky-blue by
    # swapping red/green (preserves luminance, keeps red details untouched)
    fr, fgc, fb = fg[..., 0].copy(), fg[..., 1].copy(), fg[..., 2]
    violet = (fr > fgc + 6) & (fb >= fr - 4)
    fg[..., 0] = np.where(violet, fgc, fr)
    fg[..., 1] = np.where(violet, fr, fgc)
    return np.dstack([fg, alpha * 255]).astype(np.uint8)


def main(src, out, canvas_h=320):
    os.makedirs(out, exist_ok=True)
    frames, boxes = {}, {}
    for p in POSES:
        rgb = np.array(Image.open(os.path.join(src, p + ".png")).convert("RGB")).astype(float)
        rgba = key_out(rgb)
        ys, xs = np.where(rgba[..., 3] > 8)
        boxes[p] = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
        frames[p] = Image.fromarray(rgba, "RGBA")

    max_w = max(b[2] - b[0] for b in boxes.values())
    max_h = max(b[3] - b[1] for b in boxes.values())
    scale = canvas_h / max_h
    canvas_w = int(np.ceil(max_w * scale)) + 8
    meta = {"canvas": [canvas_w, canvas_h], "anchor": "bottom-center", "frames": {}}

    for p, img in frames.items():
        x0, y0, x1, y1 = boxes[p]
        crop = img.crop((x0, y0, x1, y1))
        w, h = int(round((x1 - x0) * scale)), int(round((y1 - y0) * scale))
        crop = crop.resize((w, h), Image.LANCZOS)
        canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        canvas.paste(crop, ((canvas_w - w) // 2, canvas_h - h), crop)
        meta["frames"][p] = {"file": f"{p}.webp" if p in SHIPPED else None, "w": w, "h": h}
        if p in SHIPPED:
            canvas.save(os.path.join(out, f"{p}.webp"), "WEBP", quality=WEBP_QUALITY,
                        method=6, alpha_quality=100)
        print(f"{p:7s} -> {canvas_w}x{canvas_h} (content {w}x{h})")

    with open(os.path.join(out, "sprites.json"), "w") as f:
        json.dump(meta, f, indent=2)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 320)
