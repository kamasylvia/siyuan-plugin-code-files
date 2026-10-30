"""Generate icon.png (160x160) and preview.png (1024x768) for Script Assets.

Design: dark rounded square, terminal glyph `>_` in accent green, plus a
small asset-tag corner ribbon. No text besides the glyph, readable at 32px.
"""
from PIL import Image, ImageDraw

BG = (30, 32, 44, 255)        # dark slate
PANEL = (42, 46, 62, 255)     # lighter panel
GREEN = (110, 231, 147, 255)  # terminal green
AMBER = (247, 191, 80, 255)   # asset tag
WHITE = (240, 242, 248, 255)


def rounded_panel(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def draw_glyph(draw, ox, oy, s):
    # `>` chevron
    draw.line([(ox, oy), (ox + 3 * s, oy + 3 * s), (ox, oy + 6 * s)],
              fill=GREEN, width=s, joint="curve")
    # `_` cursor
    draw.line([(ox + 5 * s, oy + 6 * s), (ox + 9 * s, oy + 6 * s)],
              fill=GREEN, width=s)


def make_icon(path, size=160):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    rounded_panel(d, [0, 0, size - 1, size - 1], size // 6, BG)
    m = size // 8
    rounded_panel(d, [m, m, size - 1 - m, size - 1 - m], size // 10, PANEL)
    s = size // 24
    draw_glyph(d, size // 2 - 5 * s, size // 2 - 3 * s, s)
    # asset-tag ribbon, bottom-right corner
    r = size // 5
    d.polygon([(size - r, size), (size, size), (size, size - r)], fill=AMBER)
    img.save(path, optimize=True)
    print(path, img.size, f"{len(open(path, 'rb').read()) / 1024:.1f} KiB")


def make_preview(path, w=1024, h=768):
    img = Image.new("RGBA", (w, h), BG)
    d = ImageDraw.Draw(img)
    # terminal window
    wx, wy, ww, wh = w // 8, h // 6, w * 3 // 4, h * 2 // 3
    rounded_panel(d, [wx, wy, wx + ww, wy + wh], 24, PANEL)
    # traffic lights
    for i, c in enumerate([(255, 95, 86, 255), (255, 189, 46, 255), (39, 201, 63, 255)]):
        d.ellipse([wx + 28 + i * 36, wy + 24, wx + 48 + i * 36, wy + 44], fill=c)
    d.line([(wx, wy + 68), (wx + ww, wy + 68)], fill=(60, 65, 86, 255), width=2)
    # script lines
    y = wy + 110
    for indent, width, color in [(0, 280, GREEN), (40, 360, WHITE), (40, 220, WHITE),
                                 (0, 320, GREEN), (40, 380, WHITE), (0, 170, AMBER)]:
        d.rounded_rectangle([wx + 48 + indent, y, wx + 48 + indent + width, y + 22],
                            radius=11, fill=color)
        y += 52
    lx = wx + ww - 250
    for i in range(3):
        y0 = wy + 110 + i * 104
        d.rounded_rectangle([lx, y0, lx + 190, y0 + 22], radius=11, fill=(90, 120, 200, 255))
    img.save(path, optimize=True)
    print(path, img.size, f"{len(open(path, 'rb').read()) / 1024:.1f} KiB")


make_icon("icon.png")
make_preview("preview.png")
