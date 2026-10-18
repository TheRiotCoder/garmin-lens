# Generates Garmin Lens icons (structure adapted from SatPass/tools/make_icons.py). Run from repo root: python3 tools/make_icons.py   (needs Pillow)
from PIL import Image, ImageDraw
import math
S = 1024

def gradient(size):
    im = Image.new("RGB", (size, size)); px = im.load()
    c1 = (8, 14, 30); c2 = (16, 78, 110)
    for y in range(size):
        for x in range(size):
            t = (x * 0.4 + y * 0.6) / size
            px[x, y] = tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))
    return im

def art(scale):
    L = Image.new("RGBA", (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
    cx, cy = S / 2, S / 2
    def P(x, y): return (cx + x * scale, cy + y * scale)
    # lens ring
    R = 330 * scale
    d.ellipse([cx - R, cy - R, cx + R, cy + R], outline=(34, 211, 238, 255), width=int(44 * scale))
    # handle
    a = math.radians(45); x0, y0 = cx + R * math.cos(a), cy + R * math.sin(a)
    x1, y1 = cx + (R + 190 * scale) * math.cos(a), cy + (R + 190 * scale) * math.sin(a)
    d.line([x0, y0, x1, y1], fill=(34, 211, 238, 255), width=int(64 * scale))
    # heartbeat trace inside the lens
    pts = [(-250, 20), (-130, 20), (-80, -150), (-10, 190), (60, -90), (110, 20), (250, 20)]
    d.line([P(x, y) for x, y in pts], fill=(244, 114, 182, 255), width=int(34 * scale), joint="curve")
    return L

def make(size, scale, path, bg=True):
    base = gradient(S).convert("RGBA") if bg else Image.new("RGBA", (S, S), (0, 0, 0, 0))
    base.alpha_composite(art(scale))
    base.resize((size, size), Image.LANCZOS).save(path)

make(512, 1.0, "icons/icon-512.png"); make(192, 1.0, "icons/icon-192.png")
make(512, 0.72, "icons/maskable-512.png")       # extra padding: stays inside the maskable safe zone (centre 80%)
make(180, 0.86, "icons/apple-touch-icon.png"); make(32, 1.0, "icons/favicon-32.png")
print("icons written")
