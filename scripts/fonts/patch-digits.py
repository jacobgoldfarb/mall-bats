"""Redraws the 2 and 5 in Pixelify Sans so they stop reading as mirror images.

pip install fonttools brotli skia-pathops
python scripts/fonts/patch-digits.py
"""

from pathlib import Path

import pathops
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'node_modules/@fontsource/pixelify-sans/files'
OUT = ROOT / 'src/assets/fonts'
FAMILY = 'Pixelify Bats'

TWO = [
    '.###.',
    '#...#',
    '....#',
    '...#.',
    '..#..',
    '.#...',
    '#####',
]

FIVE = [
    '#####',
    '#....',
    '####.',
    '....#',
    '....#',
    '#...#',
    '.###.',
]

GRID = {
    400: dict(x0=60, gx=91, sx=101, y0=-12, gy=90.3, sy=100),
    600: dict(x0=61, gx=89, sx=118, y0=-11, gy=87.3, sy=124),
}


def draw(rows, grid):
    path = pathops.Path()
    for r, row in enumerate(reversed(rows)):
        for c, cell in enumerate(row):
            if cell != '#':
                continue
            x0 = round(grid['x0'] + c * grid['gx'])
            y0 = round(grid['y0'] + r * grid['gy'])
            x1 = x0 + grid['sx']
            y1 = round(y0 + grid['sy'])
            path.moveTo(x0, y0)
            path.lineTo(x0, y1)
            path.lineTo(x1, y1)
            path.lineTo(x1, y0)
            path.close()
    path.simplify()
    pen = TTGlyphPen(None)
    path.draw(pen)
    return pen.glyph()


def rename(font):
    for record in font['name'].names:
        if record.nameID in (1, 4, 16):
            record.string = FAMILY
        elif record.nameID == 6:
            record.string = FAMILY.replace(' ', '') + '-' + str(record.toUnicode()).split('-')[-1]


def patch(weight):
    font = TTFont(SOURCE / f'pixelify-sans-latin-{weight}-normal.woff2')
    glyf = font['glyf']
    for name, rows in (('two', TWO), ('five', FIVE)):
        glyf[name] = draw(rows, GRID[weight])
        glyf[name].recalcBounds(glyf)
        advance, _ = font['hmtx'][name]
        font['hmtx'][name] = (advance, glyf[name].xMin)
    rename(font)
    OUT.mkdir(parents=True, exist_ok=True)
    font.flavor = 'woff2'
    font.save(OUT / f'pixelify-bats-{weight}.woff2')


for weight in GRID:
    patch(weight)
