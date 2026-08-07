#!/usr/bin/env python3
# ABOUTME: Regenerates media/icon.png — the marketplace icon — with a real alpha channel.
# ABOUTME: macOS qlmanage flattens SVGs onto white, so the mark is drawn here instead.
#
# Geometry mirrors media/logo.svg (128x128 viewBox); keep the two in step.
# Usage: python3 scripts/make-icon.py   (needs Pillow, dev-only — not a runtime dep)

from PIL import Image, ImageDraw

SCALE = 8
SIZE = 128
S = SIZE * SCALE

INK = (14, 14, 16, 255)          # thedevlabs near-black
ORANGE = (244, 124, 32)          # #f47c20
BONE = (244, 243, 241)

# A 5x4 heatmap. Each column is a week; the run of bright cells on the right is
# the streak — the mark is the product's core idea, not decoration.
GRID = [
    [1, 0, 2, 1, 4],
    [0, 2, 1, 3, 4],
    [2, 1, 0, 2, 4],
    [1, 3, 2, 4, 4],
]

CELL, GAP = 15, 6
LEFT, TOP = 14.5, 25


def px(v):
    return int(v * SCALE)


def shade(level):
    if level == 0:
        return (*BONE, 20)
    alpha = {1: 70, 2: 130, 3: 195, 4: 255}[level]
    return (*ORANGE, alpha)


canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
draw = ImageDraw.Draw(canvas)

draw.rounded_rectangle((px(4), px(4), px(124), px(124)), radius=px(26), fill=INK)
draw.rounded_rectangle(
    (px(4), px(4), px(124), px(124)),
    radius=px(26),
    outline=(244, 243, 241, 18),
    width=max(SCALE // 2, 1),
)

for row, levels in enumerate(GRID):
    for col, level in enumerate(levels):
        x = LEFT + col * (CELL + GAP)
        y = TOP + row * (CELL + GAP)
        draw.rounded_rectangle(
            (px(x), px(y), px(x + CELL), px(y + CELL)),
            radius=px(3),
            fill=shade(level),
        )

canvas.resize((SIZE, SIZE), Image.LANCZOS).save("media/icon.png")
print("wrote media/icon.png")
