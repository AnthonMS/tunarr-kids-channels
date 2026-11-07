# Renders the Disney Channel DA and EN channel logos for Tunarr/Jellyfin.
# Same layout as make_cn_logos.py: logo fills the width, flag overlaps its top-right corner.
# Sources (Wikimedia Commons, rendered to PNG in source/):
#   v2: "File:2014 Disney Channel text logo.svg" (flat wordmark, recoloured black or white)
#   v3: "File:2019 Disney Channel logo.svg" (full colour, used as is)
# Usage: python make_disney_logos.py
from pathlib import Path
from PIL import Image, ImageDraw

from make_cn_logos import danish_flag, union_jack, SIZE, BLACK, WHITE

OUT = Path(__file__).resolve().parent
SRC_V2 = OUT / "source" / "disney-channel-2014-text-logo.png"
SRC_V3 = OUT / "source" / "disney-channel-2019-logo.png"
V3_NAVY = (0, 58, 123)  # flag outline colour for v3, matches the logo's dark outline


def make_logo(flag_fn, filename, fg=BLACK, src=SRC_V2, recolour=True):
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    logo = Image.open(src).convert("RGBA")
    logo = logo.crop(logo.getchannel("A").getbbox())
    if recolour:
        # Recolour the wordmark to fg (black or white), keeping its alpha edges
        solid = Image.new("RGBA", logo.size, fg + (255,))
        solid.putalpha(logo.getchannel("A"))
        logo = solid
    side = 32
    w = SIZE - 2 * side
    h = round(logo.height * w / logo.width)
    logo = logo.resize((w, h), Image.LANCZOS)
    lx, ly = side, (SIZE - h) // 2 + 40
    img.alpha_composite(logo, (lx, ly))

    # Flag in exactly the same place as on the CN logos (measured there: y 125-325), thin black outline
    fw, fh = 300, 200
    fx1 = SIZE - 16
    fy1 = 325
    fx0, fy0 = fx1 - fw, fy1 - fh
    ol = 6
    d.rectangle([fx0 - ol, fy0 - ol, fx1 + ol - 1, fy1 + ol - 1], fill=fg)
    img.paste(flag_fn(fw * 4, fh * 4).resize((fw, fh), Image.LANCZOS), (fx0, fy0))

    img.save(OUT / filename, optimize=True)
    print("wrote", OUT / filename)


if __name__ == "__main__":
    make_logo(danish_flag, "disney-channel-da-v2.png")
    make_logo(union_jack, "disney-channel-en-v2.png")
    make_logo(danish_flag, "disney-channel-da-v2-white.png", fg=WHITE)
    make_logo(union_jack, "disney-channel-en-v2-white.png", fg=WHITE)
    make_logo(danish_flag, "disney-channel-da-v3.png", fg=V3_NAVY, src=SRC_V3, recolour=False)
    make_logo(union_jack, "disney-channel-en-v3.png", fg=V3_NAVY, src=SRC_V3, recolour=False)
