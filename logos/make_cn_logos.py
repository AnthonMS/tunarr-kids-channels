# Renders the Cartoon Network DA and EN channel logos for Tunarr/Jellyfin.
# Usage: python make_cn_logos.py   (writes cartoon-network-da-v2.png and cartoon-network-en-v2.png next to this script)
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent
SIZE = 1024
SS = 4  # supersampling factor for clean anti-aliased edges
FONT = "C:/Windows/Fonts/ariblk.ttf"

BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
DK_RED = (200, 16, 46)     # Dannebrog red
UK_BLUE = (1, 33, 105)     # Union Jack blue
UK_RED = (200, 16, 46)


def s(v):
    return int(round(v * SS))


def font(px):
    return ImageFont.truetype(FONT, s(px))


def danish_flag(w, h):
    img = Image.new("RGB", (w, h), DK_RED)
    d = ImageDraw.Draw(img)
    cw = h * 4 / 28
    x0 = w * 12 / 37
    y0 = (h - cw) / 2
    d.rectangle([x0, 0, x0 + cw, h], fill=WHITE)
    d.rectangle([0, y0, w, y0 + cw], fill=WHITE)
    return img


def union_jack(w, h):
    img = Image.new("RGB", (w, h), UK_BLUE)
    d = ImageDraw.Draw(img)
    u = h / 30
    cx, cy = w / 2, h / 2

    def band(p1, p2, half):
        dx, dy = p2[0] - p1[0], p2[1] - p1[1]
        L = math.hypot(dx, dy)
        nx, ny = -dy / L * half, dx / L * half
        ex, ey = dx / L * w, dy / L * w  # extend past the edges
        a = (p1[0] - ex, p1[1] - ey)
        b = (p2[0] + ex, p2[1] + ey)
        return [(a[0] + nx, a[1] + ny), (b[0] + nx, b[1] + ny),
                (b[0] - nx, b[1] - ny), (a[0] - nx, a[1] - ny)]

    # White saltire, 6u wide
    d.polygon(band((0, 0), (w, h), 3 * u), fill=WHITE)
    d.polygon(band((w, 0), (0, h), 3 * u), fill=WHITE)

    # Red saltire, 2u wide, counterchanged: TL below, TR above, BR above, BL below
    for corner, below in (((0, 0), True), ((w, 0), False), ((w, h), False), ((0, h), True)):
        dx, dy = corner[0] - cx, corner[1] - cy
        L = math.hypot(dx, dy)
        px, py = -dy / L, dx / L
        if (py > 0) != below:
            px, py = -px, -py
        nx, ny = px * 2 * u, py * 2 * u
        far = (cx + dx * 2, cy + dy * 2)
        d.polygon([(cx, cy), far, (far[0] + nx, far[1] + ny), (cx + nx, cy + ny)], fill=UK_RED)

    # White cross 10u, red cross 6u
    d.rectangle([cx - 5 * u, 0, cx + 5 * u, h], fill=WHITE)
    d.rectangle([0, cy - 5 * u, w, cy + 5 * u], fill=WHITE)
    d.rectangle([cx - 3 * u, 0, cx + 3 * u, h], fill=UK_RED)
    d.rectangle([0, cy - 3 * u, w, cy + 3 * u], fill=UK_RED)
    return img


def make_logo(flag_fn, filename, fg=BLACK, bg=WHITE):
    # fg/bg swap gives the inverted (white text) version for dark backgrounds
    W = s(SIZE)
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))  # transparent background
    d = ImageDraw.Draw(img)

    # CN block: white square with black C, black square with white N, shared black outline.
    # Fills the canvas width (small side margin); block plus text centred vertically.
    side = 32
    sq = (SIZE - 2 * side) / 2
    stroke = sq * 24 / 330
    text = "CARTOON NETWORK"
    gap = sq * 0.11
    px = 220
    while True:
        f = font(px)
        l, t, r, b = d.textbbox((0, 0), text, font=f, anchor="lt")
        if (r - l) <= s(2 * sq) or px <= 20:
            break
        px -= 1
    text_h = (b - t) / SS
    group_h = sq + gap + text_h
    bx0 = side
    by0 = (SIZE - group_h) / 2 + 40
    d.rectangle([s(bx0), s(by0), s(bx0 + 2 * sq), s(by0 + sq)], fill=fg)
    d.rectangle([s(bx0 + stroke), s(by0 + stroke), s(bx0 + sq), s(by0 + sq - stroke)], fill=bg)
    letter = font(sq * 300 / 330)
    d.text((s(bx0 + sq / 2 + stroke / 2), s(by0 + sq / 2)), "C", font=letter, fill=fg, anchor="mm")
    d.text((s(bx0 + sq * 1.5 - stroke / 2), s(by0 + sq / 2)), "N", font=letter, fill=bg, anchor="mm")
    d.text((s(SIZE / 2), s(by0 + sq + gap)), text, font=f, fill=fg, anchor="mt")

    # Flag overlapping the top-right corner of the CN block, thin black outline
    fw, fh = 300, 200
    overlap = 70
    fx1 = SIZE - 16
    fy1 = by0 + overlap
    fx0, fy0 = fx1 - fw, fy1 - fh
    ol = 6
    d.rectangle([s(fx0 - ol), s(fy0 - ol), s(fx1 + ol), s(fy1 + ol)], fill=fg)
    img.paste(flag_fn(s(fw), s(fh)), (s(fx0), s(fy0)))

    img = img.resize((SIZE, SIZE), Image.LANCZOS)
    img.save(OUT / filename, optimize=True)
    print("wrote", OUT / filename)


if __name__ == "__main__":
    make_logo(danish_flag, "cartoon-network-da-v2.png")
    make_logo(union_jack, "cartoon-network-en-v2.png")
    make_logo(danish_flag, "cartoon-network-da-v2-white.png", fg=WHITE, bg=BLACK)
    make_logo(union_jack, "cartoon-network-en-v2-white.png", fg=WHITE, bg=BLACK)
