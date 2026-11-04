"""Scripture Quest sprite generator.

Draws every sprite as a string grid (one char = one palette colour) or with the
small Canvas helper below, then packs assets/sprites/spritesheet.png + .json,
preview.png (all frames, labelled) and tiles_preview.png (each tile 4x4).

Run:  python3 assets/sprites/src/make_sprites.py
All art is original.
"""
import json, os, math, random
from PIL import Image, ImageDraw, ImageFont

PAL = {
    '.': None,
    'K': (26, 28, 44), 'S': (244, 196, 154), 's': (201, 139, 94),
    'H': (91, 58, 30), 'W': (240, 234, 214), 'w': (185, 174, 142),
    'B': (59, 93, 201), 'b': (41, 54, 111), 'R': (177, 62, 83), 'r': (110, 32, 56),
    'Y': (255, 205, 117), 'y': (196, 138, 44), 'G': (56, 183, 100), 'g': (37, 113, 121),
    'N': (138, 90, 43), 'n': (91, 58, 30), 'O': (239, 125, 87), 'L': (115, 239, 247),
    'T': (232, 201, 138), 't': (201, 165, 96), 'P': (148, 176, 194), 'p': (86, 108, 134),
    # --- added colours ---
    'U': (214, 168, 108), 'u': (176, 128, 80),      # dirt path
    'A': (184, 114, 84), 'a': (138, 80, 62),        # arena clay
    'D': (74, 68, 90), 'd': (48, 44, 62),           # den stone (dark)
    'C': (182, 146, 108), 'c': (130, 96, 70),       # sandstone boulder
    'F': (30, 96, 60),                              # dark leaf green
    'e': (72, 66, 92),                              # empty heart
    'Z': (255, 214, 110, 205), 'z': (255, 244, 196, 120),   # translucent gold (fx only)
}

def mirror(g): return [row[::-1] for row in g]

HERO_DOWN_1 = [
".....KKKKKK.....",
"....KWWWWWWK....",
"...KWWWWWWWWK...",
"...KBBBBBBBBK...",
"...KWSSSSSSWK...",
"..KWSKSSSSKSWK..",
"..KWSSSSSSSSWK..",
"..KWWsSSSSsWWK..",
"...KKKssssKKK...",
"..KWWWWBBWWWWK..",
".KSKWWWBBWWWKSK.",
".KSKWWWBBWWWKSK.",
"..KKWWWWWWWWKK..",
"...KwwwwwwwwK...",
"...KNNK..KNNK...",
"...KKK....KKK...",
]
HERO_DOWN_2 = HERO_DOWN_1[:14] + ["....KNNKKNNK....", "....KKK..KKK...."]

HERO_UP_1 = [
".....KKKKKK.....",
"....KWWWWWWK....",
"...KWWWWWWWWK...",
"...KBBBBBBBBK...",
"...KWWWWWWWWK...",
"..KWWWWWWWWWWK..",
"..KWWWWWWWWWWK..",
"..KWwWWWWWWwWK..",
"...KKwwwwwwKK...",
"..KWWWWBBWWWWK..",
".KSKWWWBBWWWKSK.",
".KSKWWWBBWWWKSK.",
"..KKWWWWWWWWKK..",
"...KwwwwwwwwK...",
"...KNNK..KNNK...",
"...KKK....KKK...",
]
HERO_UP_2 = HERO_UP_1[:14] + ["....KNNKKNNK....", "....KKK..KKK...."]

HERO_RIGHT_1 = [
"......KKKKK.....",
".....KWWWWWK....",
"....KWWWWWWWK...",
"....KBBBBBBBK...",
"...KWWWWSSSSK...",
"...KWWWSSSKSK...",
"...KWWWSSSSSSK..",
"...KWWWWsSSSK...",
"....KKKKsssK....",
"....KWWBBWWK....",
"....KWWBBWSK....",
"....KWWWWWSK....",
"....KWWWWWWK....",
"....KwwwwwwK....",
"....KNNKKNNK....",
"....KKK..KKK....",
]
HERO_RIGHT_2 = HERO_RIGHT_1[:14] + [".....KNNNNK.....", ".....KKKKKK....."]

def with_staff(g):
    g = [list(r) for r in g]
    g[1][14] = 'Y'; g[0][14] = 'K'
    for y in range(2, 16): g[y][14] = 'N'
    for y in range(1, 16): g[y][15] = 'K'
    g[0][15] = '.'
    return [''.join(r) for r in g]

ELDER = with_staff([
".....KKKKKK.....",
"....KnnnnnnK....",
"...KnNNNNNNnK...",
"...KNSSSSSSNK...",
"...KNSKSSKSNK...",
"...KNSSSSSSNK...",
"...KNWWssWWNK...",
"..KNNWWWWWWNNK..",
"..KNNNWWWWNNNK..",
"..KNNNNWWNNNNK..",
".KSNNNNNNNNNNSK.",
"..KNNNNNNNNNNK..",
"..KNNNNNNNNNNK..",
"..KnnnnnnnnnnK..",
"...KNNK..KNNK...",
"...KKK....KKK...",
])

SCROLL = [
"................",
"..KKKKKKKKKKKK..",
".KNyYYYYYYYYyNK.",
"..KKKKKKKKKKKK..",
"...KTTTTTTTTK...",
"...KTnnnnnTTK...",
"...KTTTTTTTTK...",
"...KTnnnTnnTK...",
"...KTTTTTTTTK...",
"...KTnnnnnnTK...",
"...KTTTTTTTTK...",
"...KTnnTRRTTK...",
"..KKKKKKKKKKKK..",
".KNyYYYYYYYYyNK.",
"..KKKKKKKKKKKK..",
"................",
]
# Golden "rare verse" variant
GOLD_SCROLL = [r.replace('T', 'Y').replace('n', 'y').replace('RR', 'WW') for r in SCROLL]

STAFF = [
".....KKKK.......",
"....KNNNNK......",
"...KNKKKKNK.....",
"...KNK..KNK.....",
"....K...KNK.....",
"........KNK.....",
"........KNK.....",
"........KNK.....",
"........KyK.....",
"........KNK.....",
"........KNK.....",
"........KNK.....",
"........KNK.....",
"........KNK.....",
"........KNK.....",
"........KKK.....",
]

SLING = [
"................",
"................",
"...KK......KK...",
"..KNNK....KNNK..",
"...KNK....KNK...",
"....KNK..KNK....",
".....KNKKNK.....",
"......KNNK......",
".....KnPPnK.....",
".....KnPpnK.....",
"......KnnK......",
".......KK.......",
"................",
"................",
"................",
"................",
]

FIRE_1 = [
".......K........",
"......KOK.......",
"......KOK...K...",
".....KOYOK.KOK..",
".....KOYOK.KOK..",
"....KOYYYOKOOK..",
"...KOOYYYOOOOK..",
"..KOOYYWYYOOOK..",
"..KOYYWWWYYOOK..",
".KROYYWWWWYYORK.",
".KROYYWWWWYYORK.",
".KROOYYWWYYOORK.",
"..KRROOYYOORRK..",
"...KRRROORRRK...",
"....KKRRRRKK....",
"......KKKK......",
]
FIRE_2 = mirror(FIRE_1)

LION = [
"....KKKKKKKK....",
"..KKyyyyyyyyKK..",
".KyyyYYYYYYyyyK.",
"KyyYYTTTTTTYYyyK",
"KyYTTTTTTTTTTYyK",
"KyYTKKTTTTKKTYyK",
"KyYTTTTTTTTTTYyK",
"KyyTTTTnnTTTTyyK",
"KyyTTTTKKTTTTyyK",
".KyyTTKTTKTTyyK.",
".KyyyTTTTTTyyyK.",
"..KyyyTTTTyyyK..",
"...KKyyyyyyKK...",
".....KKKKKK.....",
"................",
"................",
]

SERPENT_1 = [
"................",
"................",
"................",
"................",
"................",
"................",
"..........KKKK..",
".........KGGGGK.",
".........KGKGGRK",
"....KKK..KGGGGK.",
"...KGGGK..KGGK..",
"..KGgKGGK.KGGK..",
"..KGK.KGGKGGK...",
"..KGGK.KGGGgK...",
"...KGGKKKKKK....",
"....KKK.........",
]
SERPENT_2 = SERPENT_1[:7] + [".........KGGGGK.", ".........KGKGGK.", ] + SERPENT_1[9:]

TABLETS = [
"................",
"..KKKK....KKKK..",
".KPPPPK..KPPPPK.",
"KPPPPPPKKPPPPPPK",
"KPpPpPPKKPpPpPPK",
"KPPPPPPKKPPPPPPK",
"KPpPpPPKKPpPpPPK",
"KPPPPPPKKPPPPPPK",
"KPpPpPPKKPpPpPPK",
"KPPPPPPKKPPPPPPK",
"KPpPpPPKKPpPpPPK",
"KPPPPPPKKPPPPPPK",
"KppppppKKppppppK",
"KKKKKKKKKKKKKKKK",
"................",
"................",
]

HEART = [
"................",
"................",
"..KKKK....KKKK..",
".KRRWRK..KRRRRK.",
"KRRWRRRKKRRRRRrK",
"KRRRRRRRRRRRRRrK",
"KRRRRRRRRRRRRRrK",
".KRRRRRRRRRRRrK.",
"..KRRRRRRRRRrK..",
"...KRRRRRRRrK...",
"....KRRRRRrK....",
".....KRRRrK.....",
"......KRrK......",
".......KK.......",
"................",
"................",
]

# ---- procedural tiles ----
def tile(base, specks, seed, density=0.12):
    rnd = random.Random(seed)
    g = [[base] * 16 for _ in range(16)]
    for y in range(16):
        for x in range(16):
            if rnd.random() < density:
                g[y][x] = rnd.choice(specks)
    return [''.join(r) for r in g]

GRASS = tile('G', ['g', 'g', 'Y'], 1, 0.10)
SAND = tile('T', ['t', 't', 'W'], 2, 0.10)

def water(phase):
    g = [['B'] * 16 for _ in range(16)]
    for y in range(16):
        for x in range(16):
            if (x + y * 2 + phase * 4) % 16 in (0, 1, 2) and y % 4 == 1:
                g[y][x] = 'L'
            elif (x + y + phase * 2) % 9 == 0:
                g[y][x] = 'b'
    return [''.join(r) for r in g]
WATER_1, WATER_2 = water(0), water(1)

def wall():
    g = [['P'] * 16 for _ in range(16)]
    for y in range(16):
        for x in range(16):
            if y % 4 == 3: g[y][x] = 'p'
            elif (x + (4 if (y // 4) % 2 else 0)) % 8 == 7: g[y][x] = 'p'
            elif y % 4 == 0 and (x % 8) < 6: g[y][x] = 'W' if x % 3 else 'P'
    return [''.join(r) for r in g]
WALL = wall()

def parted_sea(phase):
    w = water(phase)
    g = [list(r) for r in w]
    for y in range(16):
        for x in range(5, 11): g[y][x] = 'T' if (x * 7 + y * 3) % 11 else 't'
        g[y][4] = 'L' if (y + phase) % 2 else 'W'
        g[y][11] = 'W' if (y + phase) % 2 else 'L'
    return [''.join(r) for r in g]
PARTED_1, PARTED_2 = parted_sea(0), parted_sea(1)


# =====================================================================================
#  Canvas helper for procedural / shape-based sprites
# =====================================================================================
class Canvas:
    def __init__(self, w=16, h=16, fill='.'):
        self.w, self.h = w, h
        self.g = [[fill] * w for _ in range(h)]
        if isinstance(fill, list):
            self.g = [list(r) for r in fill]

    @classmethod
    def of(cls, grid):
        c = cls(len(grid[0]), len(grid)); c.g = [list(r) for r in grid]; return c

    def px(self, x, y, c):
        x, y = int(x), int(y)
        if 0 <= x < self.w and 0 <= y < self.h: self.g[y][x] = c

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h: return self.g[y][x]
        return '.'

    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1): self.px(x, y, c)

    def ell(self, cx, cy, rx, ry=None, c='K', only=None):
        ry = rx if ry is None else ry
        for y in range(self.h):
            for x in range(self.w):
                if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0:
                    if only is None or self.g[y][x] in only: self.g[y][x] = c

    def line(self, x0, y0, x1, y1, c):
        n = max(abs(x1 - x0), abs(y1 - y0), 1)
        for i in range(n + 1):
            self.px(round(x0 + (x1 - x0) * i / n), round(y0 + (y1 - y0) * i / n), c)

    def pts(self, pts, c):
        for x, y in pts: self.px(x, y, c)

    def outline(self, c='K', diag=False):
        add = []
        for y in range(self.h):
            for x in range(self.w):
                if self.g[y][x] != '.': continue
                nb = [(1, 0), (-1, 0), (0, 1), (0, -1)]
                if diag: nb += [(1, 1), (1, -1), (-1, 1), (-1, -1)]
                if any(self.get(x + dx, y + dy) not in ('.', c) for dx, dy in nb): add.append((x, y))
        for x, y in add: self.g[y][x] = c
        return self

    def over(self, base):
        """Composite self over a base grid (list of strings) and return rows."""
        out = [list(r) for r in base]
        for y in range(self.h):
            for x in range(self.w):
                if self.g[y][x] != '.': out[y][x] = self.g[y][x]
        return [''.join(r) for r in out]

    def recolor(self, m):
        self.g = [[m.get(c, c) for c in row] for row in self.g]; return self

    def rows(self): return [''.join(r) for r in self.g]


def recolor(grid, m): return [''.join(m.get(c, c) for c in row) for row in grid]

# =====================================================================================
#  Items / UI
# =====================================================================================
CHEST_CLOSED = [
"................",
"................",
"...KKKKKKKKKK...",
"..KNNNNNNNNNNK..",
".KNnNNNNNNNNnNK.",
".KNNNNNNNNNNNNK.",
".KyYYYYYYYYYYyK.",
".KKKKKKYYKKKKKK.",
".KNNNNKYyKNNNNK.",
".KNnNNKKKKNNnNK.",
".KNNNNNNNNNNNNK.",
".KNnNNNNNNNNnNK.",
".KyYYYYYYYYYYyK.",
".KNNNNNNNNNNNNK.",
"..KKKKKKKKKKKK..",
"................",
]
CHEST_OPEN = [          # lid swung up/back, dark empty interior, tiny gold glint
"................",
"..KKKKKKKKKKKK..",
".KnnnnnnnnnnnnK.",
".KNNNNNNNNNNNNK.",
".KKKKKKKKKKKKKK.",
".KNnnnnnnnnnnNK.",
".KNddddddddddNK.",
".KNdddddddYddNK.",
".KNddddddddddNK.",
".KyYYYYYYYYYYyK.",
".KNNNNNNNNNNNNK.",
".KNnNNKyyKNNnNK.",
".KNNNNKKKKNNNNK.",
".KyYYYYYYYYYYyK.",
"..KKKKKKKKKKKK..",
"................",
]
SIGN_POST = [
"................",
"................",
".KKKKKKKKKKKKKK.",
"KUUUUUUUUUUUUUuK",
"KUnnnUnnnnUnnUuK",
"KUUUUUUUUUUUUUuK",
"KUnnnnUnnnUnnUuK",
"KuuuuuuuuuuuuuuK",
".KKKKKKKKKKKKKK.",
"......KNnK......",
"......KNnK......",
"......KNnK......",
"......KNnK......",
"......KNnK......",
".....KNNnnK.....",
"......KKKK......",
]
HEART_EMPTY = recolor(HEART, {'R': 'e', 'r': 'K', 'W': 'p'})

# =====================================================================================
#  Ability icons
# =====================================================================================
_C_LEFT = [
"..KKKK..",
".KPWWPK.",
"KPWKKKK.",
"KPK.....",
"KPK.....",
"KPK.....",
"KPK.....",
"KPpKKKK.",
".KPppPK.",
"..KKKK..",
]
def _strength():
    c = Canvas()
    for y, row in enumerate(_C_LEFT):
        for x, ch in enumerate(row):
            if ch != '.':
                c.px(x, y + 3, ch)
                c.px(15 - x, y + 3, {'W': 'P', 'p': 'p'}.get(ch, ch) if x != 2 or ch != 'W' else 'P')
    # spark in the gap
    c.pts([(7, 7), (8, 7), (7, 8), (8, 8)], 'W')
    c.pts([(7, 5), (8, 5), (7, 10), (8, 10), (6, 7), (9, 8), (6, 8), (9, 7)], 'Y')
    c.pts([(5, 1), (10, 1), (6, 2), (9, 2), (5, 14), (10, 14), (6, 13), (9, 13)], 'Y')
    c.pts([(7, 0), (8, 15)], 'O')
    return c.rows()
STRENGTH = _strength()

def make_sun():
    c = Canvas()
    for k in range(8):
        a = k * math.pi / 4
        L = 7.4 if k % 2 == 0 else 6.6
        for r10 in range(52, int(L * 10) + 1):
            r = r10 / 10
            c.px(round(7.5 + math.cos(a) * r - 0.0), round(7.5 + math.sin(a) * r), 'Y')
    c.ell(7.5, 7.5, 4.6, c='O')
    c.ell(7.5, 7.5, 3.7, c='Y')
    c.ell(6.6, 6.6, 1.6, c='W')
    c.outline()
    return c.rows()
SUN = make_sun()

FIRE_ICON = [
".......K........",
"......KOK.......",
"......KOK..K....",
".....KOYOKKOK...",
"....KOOYOOKOK...",
"...KOOYYYOOOK...",
"...KOYYWYYOOK...",
"..KOYYWWWYYOOK..",
"..KOYWWWWWYYOK..",
"..KROYWWWWYORK..",
"...KRRYYYYRRK...",
".KKKKKKKKKKKKKK.",
".KPWPKPPWPKPWPK.",
".KpPPPKpPPPKppK.",
".KKKKKKKKKKKKKK.",
"................",
]

FAITH = [list(r) for r in LION]
for (x, y) in [(1, 13), (0, 14), (2, 14), (1, 15), (14, 13), (13, 14), (15, 14), (14, 15), (1, 1)]:
    FAITH[y][x] = 'W' if (x, y) not in [(1, 14), (14, 14)] else 'Y'
FAITH[14][1] = 'Y'; FAITH[14][14] = 'Y'
FAITH = [''.join(r) for r in FAITH]

# =====================================================================================
#  FX
# =====================================================================================
SLING_STONE = [
"................",
"................",
"................",
"................",
"................",
"......KKKK......",
".....KPWPPK.....",
".....KWPPpK.....",
".....KPPPpK.....",
".....KPppPK.....",
"......KKKK......",
"................",
"................",
"................",
"................",
"................",
]

def make_shield(phase):
    c = Canvas()
    for y in range(16):
        for x in range(16):
            d = math.hypot(x - 7.5, y - 7.5)
            if 6.9 <= d <= 7.7 and (x + y) % 2 == 0: c.g[y][x] = 'Y'
            elif 6.3 <= d <= 7.7: c.g[y][x] = 'Z'
            elif 5.4 <= d < 6.3: c.g[y][x] = 'z'
    for k in range(4):
        a = k * math.pi / 2 + (math.pi / 4 if phase else 0)
        x, y = round(7.5 + math.cos(a) * 7.0), round(7.5 + math.sin(a) * 7.0)
        c.px(x, y, 'W')
        c.px(x + 1 if x < 8 else x - 1, y, 'Y'); c.px(x, y + 1 if y < 8 else y - 1, 'Y')
    return c.rows()

def make_puff(phase):
    c = Canvas()
    blobs = ([(7.5, 8.5, 3.3), (5.2, 6.3, 2.5), (10.0, 6.0, 2.6), (10.6, 10.0, 2.3), (4.8, 10.3, 2.3)] if phase == 0 else
             [(3.8, 4.2, 2.1), (11.8, 3.8, 1.9), (3.6, 11.6, 1.8), (11.6, 11.8, 2.2), (7.6, 7.8, 1.2)])
    for (x, y, r) in blobs: c.ell(x, y + 0.6, r, c='w')
    for (x, y, r) in blobs: c.ell(x - 0.3, y - 0.2, r * 0.82, c='W')
    return c.rows()

def make_smash(phase):
    c = Canvas()
    if phase == 0:
        for k in range(8):
            a = k * math.pi / 4 + math.pi / 8
            L = 7.2 if k % 2 == 0 else 5.0
            for r10 in range(20, int(L * 10)):
                r = r10 / 10
                c.px(round(7.5 + math.cos(a) * r), round(7.5 + math.sin(a) * r), 'Y' if r < L - 1.5 else 'O')
        c.ell(7.5, 7.5, 2.6, c='Y'); c.ell(7.5, 7.5, 1.6, c='W')
    else:
        for k in range(8):
            a = k * math.pi / 4
            x, y = round(7.5 + math.cos(a) * 5.6), round(7.5 + math.sin(a) * 5.6)
            c.rect(x - 1, y - 1, x, y, 'C'); c.px(x - 1, y - 1, 'T'); c.px(x, y, 'c')
        for k in range(4):
            a = k * math.pi / 2 + math.pi / 4
            c.px(round(7.5 + math.cos(a) * 3), round(7.5 + math.sin(a) * 3), 'Y')
        c.outline()
        c.px(7, 7, 'W'); c.px(8, 8, 'W')
    return c.rows()

def make_spear():
    rows = ["." * 10 + "KK....",
            "KKKKKKKKKK" + "KWPK..",
            "NNyyNNNNNN" + "KWWPPK",
            "nnyynnnnnn" + "KPPppK",
            "KKKKKKKKKK" + "KppK..",
            "." * 10 + "KK...."]
    return ["." * 16] * 5 + rows + ["." * 16] * 5
SPEAR = make_spear()

def make_shockwave(phase):
    c = Canvas()
    rx, ry = (4.6, 3.0) if phase == 0 else (7.4, 5.2)
    for y in range(16):
        for x in range(16):
            d = ((x - 7.5) / rx) ** 2 + ((y - 8) / ry) ** 2
            if 0.62 <= d <= 1.0: c.g[y][x] = 'W' if y < 8 else 'T'
            elif 0.40 <= d < 0.62 and phase == 0: c.g[y][x] = 'z'
    if phase == 1:
        for (x, y) in [(1, 3), (14, 3), (0, 12), (15, 12)]: c.px(x, y, 'w')
    return c.rows()

# =====================================================================================
#  Enemies
# =====================================================================================
SCORPION_0 = [
".....KKK........",
"....KWOOK.......",
".....KKORK......",
"......KROK......",
"......KRRK......",
"......KROK......",
".....KKRRKK.....",
"KK..KRROORRK..KK",
"..KKRROWORRRKK..",
"KK..KRROORRK..KK",
"..KKRRROORRRKK..",
"KK..KRRRRRRK..KK",
".K..KKrrrrKK..K.",
"KRK.KrYrrYrK.KRK",
"KRRKKRrrrrRKKRRK",
".KK..KKKKKK..KK.",
]
SCORPION_1 = [
"......KKK.......",
".....KWOOK......",
"......KKORK.....",
"......KROK......",
"......KRRK......",
"......KROK......",
".....KKRRKK.....",
"..KKKRROORRKKK..",
"KK.KRROWORRRK.KK",
"..KKKRROORRKKK..",
"KK.KRRROORRRK.KK",
"..KKKRRRRRRKKK..",
"KK..KKrrrrKK..KK",
"KRK.KrYrrYrK.KRK",
"KRRKKRrrrrRKKRRK",
".KK..KKKKKK..KK.",
]
def make_scorpion(phase): return SCORPION_1 if phase else SCORPION_0

_JACKAL_TOP = [
"................",
"................",
"..........K.K...",
".........KnKnK..",
".........KNNNNK.",
".........KNKNNKK",
"........KNNNNNNK",
"........KNUUUKK.",
".KK.....KNNUUK..",
"KNNKKKKKNNNNUK..",
"KNKNNNNNNNNNNK..",
"KnKNNNNNNNNNNK..",
".KKUUUUUUUUNNK..",
]
_JACKAL_LEGS = [[
"..KnKNKKKKNKnK..",
"..KnKNK..KNKnK..",
"..KKKKK..KKKKK..",
], [
"..KKKNKKKKNKKK..",
"...KNK....KNK...",
"...KK......KK...",
]]
def make_jackal(phase): return _JACKAL_TOP + _JACKAL_LEGS[phase]

def make_lion(phase):
    c = Canvas()
    # legs (thicker)
    legs = [(3, 2), (6, 7), (10, 10), (12, 13)] if phase == 0 else [(4, 4), (5, 5), (10, 11), (12, 11)]
    for (x0, x1) in legs:
        c.line(x0, 10, x1, 13, 'T'); c.line(x0 + 1, 10, x1 + 1, 13, 't')
        c.px(x1, 14, 'T'); c.px(x1 + 1, 14, 'T')
    # tail with tuft
    c.pts([(2, 8), (1, 7), (1, 6)], 't'); c.ell(1.3, 4.7 + phase * 0.6, 1.1, c='N')
    # body
    c.ell(7.0, 8.6, 5.0, 2.4, c='T')
    c.rect(3, 10, 11, 10, 't')
    # mane + face (facing right)
    c.ell(10.8, 5.6, 3.6, 3.8, c='y')
    c.ell(10.0, 6.5, 2.6, 3.0, c='N', only='y')
    c.ell(12.8, 5.8, 2.3, 2.0, c='T')
    c.rect(13, 7, 15, 7, 't'); c.rect(14, 5, 15, 6, 'T')
    c.outline()
    c.px(13, 5, 'K'); c.px(15, 5, 'n'); c.px(14, 7, 'K')
    c.px(10, 2, 'Y'); c.px(9, 3, 'Y')
    return c.rows()

# =====================================================================================
#  Boss — the Giant (32x32), original armoured warrior design
# =====================================================================================
def make_giant(mode, phase=0):
    c = Canvas(32, 32)
    dy = 1 if mode == 'stomp' else 0
    # spear (held in his right hand = viewer's left)
    sx = 5
    for y in range(4, 31): c.px(sx, y, 'N')
    c.pts([(sx, 0), (sx - 1, 1), (sx, 1), (sx + 1, 1), (sx - 1, 2), (sx, 2), (sx + 1, 2), (sx - 1, 3), (sx, 3), (sx + 1, 3)], 'P')
    c.pts([(sx, 1), (sx - 1, 2)], 'W'); c.px(sx, 4, 'y')
    # legs
    if mode == 'stomp':
        L = [(9, 12, 0), (19, 22, 0)]
    else:
        L = [(11, 14, 1 if phase == 0 else 0), (17, 20, 1 if phase == 1 else 0)]
    for (x0, x1, lift) in L:
        c.rect(x0, 24 + dy, x1, 28 - lift, 'y'); c.rect(x0 + 1, 24 + dy, x0 + 1, 28 - lift, 'Y')
        c.rect(x0, 24 + dy, x1, 24 + dy, 'S')
        c.rect(x0 - 1, 29 - lift, x1, 30 - lift, 'n'); c.rect(x0, 29 - lift, x1 - 1, 29 - lift, 'N')
    # kilt with straps
    c.rect(10, 20 + dy, 21, 24 + dy, 'R')
    for x in range(10, 22, 2): c.rect(x, 21 + dy, x, 24 + dy, 'r')
    c.rect(10, 24 + dy, 21, 24 + dy, 'y')
    # torso scale armour
    c.rect(10, 12 + dy, 21, 19 + dy, 'y')
    for y in range(12 + dy, 20 + dy):
        for x in range(10, 22):
            if (y - dy) % 2 == 1 and (x + ((y - dy) // 2) % 2) % 2 == 0: c.px(x, y, 'Y')
    c.rect(10, 19 + dy, 21, 19 + dy, 'n'); c.rect(15, 19 + dy, 16, 19 + dy, 'Y')
    # arm holding spear
    c.rect(7, 13 + dy, 9, 18 + dy, 'S'); c.rect(7, 16 + dy, 9, 17 + dy, 'y')
    c.rect(4, 17 + dy, 7, 19 + dy, 'S'); c.px(sx, 18 + dy, 'N')
    # shoulders
    c.ell(9.5, 12.5 + dy, 2.6, 1.8, c='Y'); c.ell(22, 12.5 + dy, 2.6, 1.8, c='Y')
    c.px(9, 13 + dy, 'y'); c.px(22, 13 + dy, 'y')
    # neck, head, helmet
    c.rect(14, 10 + dy, 17, 11 + dy, 's')
    c.ell(15.5, 6 + dy, 4.6, 4.3, c='y')
    c.ell(14.2, 4.4 + dy, 2.2, 1.6, c='Y', only='y')
    c.rect(13, 6 + dy, 18, 10 + dy, 'S'); c.rect(15, 5 + dy, 16, 7 + dy, 'y')
    c.rect(12, 6 + dy, 12, 10 + dy, 'y'); c.rect(19, 6 + dy, 19, 10 + dy, 'y')
    c.rect(13, 9 + dy, 18, 10 + dy, 'n'); c.rect(14, 11 + dy, 17, 11 + dy, 'n')
    c.px(14, 8 + dy, 'K'); c.px(17, 8 + dy, 'K'); c.px(13, 8 + dy, 'K'); c.px(18, 8 + dy, 'K')
    # plume (crest)
    c.rect(13, 0 + dy, 18, 1 + dy, 'R'); c.rect(12, 1 + dy, 19, 2 + dy, 'R'); c.rect(13, 2 + dy, 18, 2 + dy, 'r')
    c.rect(14, 0 + dy, 15, 0 + dy, 'O')
    # shield
    if mode == 'stomp':
        scx, scy, sr = 26.0, 23.0, 6.0
    else:
        scx, scy, sr = 22.0, 18.5, 7.6
    c.ell(scx, scy, sr + 0.6, c='K')
    c.ell(scx, scy, sr - 0.2, c='y')
    c.ell(scx, scy, sr - 1.3, c='Y')
    c.ell(scx, scy, sr * 0.48, c='N')
    c.ell(scx, scy, sr * 0.48 - 0.9, c='Y')
    c.ell(scx, scy, 1.3, c='W')
    for k in range(8):
        a = k * math.pi / 4
        c.px(round(scx + math.cos(a) * (sr - 0.8)), round(scy + math.sin(a) * (sr - 0.8)), 'W' if k in (4, 5, 6) else 'n')
    if mode == 'stomp':
        for (x, y) in [(6, 30), (7, 29), (8, 30), (23, 30), (24, 29), (25, 30), (4, 31), (27, 31)]: c.px(x, y, 'W')
    c.outline()
    return c

GIANT_0 = make_giant('walk', 0).rows()
GIANT_1 = make_giant('walk', 1).rows()
GIANT_STOMP = make_giant('stomp').rows()
GIANT_HURT = recolor(make_giant('walk', 0).rows(),
                     {'y': 'R', 'Y': 'O', 'S': 'W', 's': 'O', 'N': 'r', 'n': 'r', 'R': 'W', 'r': 'O', 'P': 'W', 'O': 'W'})

# =====================================================================================
#  Tiles
# =====================================================================================
PATH = tile('U', ['u', 'u', 't', 'T'], 3, 0.12)

def den_floor():
    rnd = random.Random(7)
    g = [['D'] * 16 for _ in range(16)]
    for y in range(16):
        for x in range(16):
            if y in (0, 8): g[y][x] = 'd'
            elif (y < 8 and x == 0) or (y > 8 and x == 8): g[y][x] = 'd'
            elif rnd.random() < 0.08: g[y][x] = rnd.choice(['d', 'p'])
    for (x, y) in [(3, 3), (4, 4), (5, 4), (12, 11), (13, 12)]: g[y][x] = 'd'
    for x in range(1, 8): g[1][x] = 'p' if x % 3 else 'D'
    for x in range(9, 16): g[9][x] = 'p' if x % 3 else 'D'
    return [''.join(r) for r in g]
DEN = den_floor()

def arena_floor():
    rnd = random.Random(11)
    g = [['A'] * 16 for _ in range(16)]
    for y in range(16):
        for x in range(16):
            if y in (7, 15): g[y][x] = 'a'
            elif (y < 7 and x in (5, 13)) or (y > 7 and x in (1, 9)): g[y][x] = 'a'
            elif rnd.random() < 0.10: g[y][x] = rnd.choice(['a', 'a', 'O', 'U'])
    return [''.join(r) for r in g]
ARENA = arena_floor()

def palm():
    c = Canvas()
    # trunk (segmented, slight curve)
    trunk = [(8, 15), (8, 14), (8, 13), (8, 12), (7, 11), (7, 10), (7, 9), (7, 8), (7, 7), (7, 6)]
    for i, (x, y) in enumerate(trunk):
        c.px(x, y, 'N' if i % 2 else 'n'); c.px(x + 1, y, 'n')
    # fronds
    fr = [((7.5, 5), (1, 7)), ((7.5, 5), (2, 3)), ((7.5, 5), (5, 1)), ((7.5, 5), (10, 1)),
          ((7.5, 5), (13, 3)), ((7.5, 5), (14, 7)), ((7.5, 5), (11, 8)), ((7.5, 5), (4, 8))]
    for (a, b) in fr:
        c.line(round(a[0]), round(a[1]), b[0], b[1], 'G')
        c.line(round(a[0]) + (1 if b[0] > 7 else 0), round(a[1]) + 1, b[0], b[1] + 1, 'F')
    c.ell(7.5, 4.6, 2.2, 1.5, c='G')
    c.pts([(7, 6), (9, 6)], 'n'); c.pts([(6, 6), (8, 6)], 'N')
    c.outline()
    shadow = Canvas.of(SAND)
    shadow.ell(9, 15, 4, 1.2, c='t')
    return c.over(shadow.rows())

def rock():
    c = Canvas()
    c.ell(7.5, 9.5, 6.6, 5.2, c='p')
    c.ell(6.2, 7.8, 3.6, 2.6, c='P', only='p')
    c.ell(5.4, 6.8, 1.4, 0.9, c='W', only='P')
    c.ell(9.5, 13.0, 4.6, 1.6, c='D', only='p')
    c.outline()
    base = Canvas.of(SAND); base.ell(8.5, 14.6, 6.5, 1.4, c='t')
    return c.over(base.rows())

def boulder():
    c = Canvas()
    c.ell(7.5, 8.8, 7.0, 6.2, c='C')
    c.ell(5.8, 6.4, 3.4, 2.4, c='T', only='C')
    c.ell(9.5, 12.8, 5.2, 2.0, c='c', only='C')
    # big zig-zag crack + branches
    crack = [(8, 3), (8, 4), (7, 5), (7, 6), (8, 7), (9, 8), (9, 9), (8, 10), (7, 11), (7, 12), (8, 13), (8, 14)]
    c.pts(crack, 'K')
    c.pts([(10, 8), (11, 7), (12, 7), (13, 6)], 'K')
    c.pts([(6, 9), (5, 9), (4, 10), (3, 10)], 'K')
    c.pts([(9, 4), (8, 5), (8, 6), (10, 9)], 'W')
    c.outline()
    base = Canvas.of(SAND)
    base.pts([(1, 14), (2, 14), (14, 14), (13, 15)], 'c')
    return c.over(base.rows())

def thorn():
    c = Canvas()
    for (x, y, r) in [(4.8, 9.6, 3.2), (10.6, 9.6, 3.2), (7.7, 6.6, 3.4), (7.7, 11.6, 3.0)]:
        c.ell(x, y, r, c='F')
    for (x, y, r) in [(4.4, 8.6, 1.3), (10.2, 8.6, 1.3), (7.0, 5.4, 1.5)]:
        c.ell(x, y, r, c='G', only='F')
    # tangled brown thorny vines
    c.line(2, 12, 6, 8, 'N'); c.line(6, 8, 7, 4, 'N'); c.line(13, 12, 9, 8, 'N'); c.line(9, 8, 8, 13, 'N')
    c.pts([(3, 10), (5, 7), (11, 10), (10, 7), (7, 10), (8, 5)], 'W')    # inner thorns
    c.pts([(5, 12), (11, 12)], 'R')                               # small red berries
    c.outline()
    # thorn spikes poking out of the silhouette
    for k in range(18):
        a = k * 2 * math.pi / 18 + 0.2
        r = 1.0
        while True:
            x, y = round(7.7 + math.cos(a) * r), round(9.0 + math.sin(a) * r)
            if not (0 <= x < 16 and 0 <= y < 16): break
            if c.g[y][x] == '.':
                c.px(x, y, 'K')
                x2, y2 = round(7.7 + math.cos(a) * (r + 1.2)), round(9.0 + math.sin(a) * (r + 1.2))
                if c.get(x2, y2) == '.': c.px(x2, y2, 'n')
                break
            r += 0.25
    return c.over(SAND)

def tent():
    c = Canvas()
    for y in range(2, 14):
        half = (y - 2) * 0.62 + 0.5
        for x in range(16):
            if abs(x - 7.5) <= half:
                c.g[y][x] = 'T' if (y // 3) % 2 == 0 else 'N'
    for y in range(2, 14): c.px(7 if y < 8 else 7, y, 't')
    # door
    for y in range(8, 14):
        half = (y - 8) * 0.5 + 0.5
        for x in range(16):
            if abs(x - 7.5) <= half: c.g[y][x] = 'K' if abs(x - 7.5) < half - 0.6 else 'n'
    c.px(7, 1, 'N'); c.px(7, 0, 'N'); c.px(8, 0, 'R')
    c.outline()
    base = Canvas.of(GRASS)
    base.rect(1, 14, 14, 14, 'g')
    base.line(0, 13, 2, 11, 'w'); base.line(15, 13, 13, 11, 'w')
    return c.over(base.rows())

PALM, ROCK, BOULDER, THORN, TENT = palm(), rock(), boulder(), thorn(), tent()

# =====================================================================================
#  Sprite list  (name, grid, category, label)
# =====================================================================================
SPRITES = [
    ("hero_down_0", HERO_DOWN_1, "hero", "hero_down_0"),
    ("hero_down_1", HERO_DOWN_2, "hero", "hero_down_1"),
    ("hero_up_0", HERO_UP_1, "hero", "hero_up_0"),
    ("hero_up_1", HERO_UP_2, "hero", "hero_up_1"),
    ("hero_right_0", HERO_RIGHT_1, "hero", ""),
    ("hero_right_1", HERO_RIGHT_2, "hero", ""),
    ("hero_left_0", mirror(HERO_RIGHT_1), "hero", ""),
    ("hero_left_1", mirror(HERO_RIGHT_2), "hero", ""),
    ("npc_prophet", ELDER, "npc", ""),
    ("chest_closed", CHEST_CLOSED, "item", ""),
    ("chest_open", CHEST_OPEN, "item", ""),
    ("sign_post", SIGN_POST, "item", ""),
    ("item_verse_scroll", SCROLL, "item", ""),
    ("item_verse_scroll_gold", GOLD_SCROLL, "item", ""),
    ("item_heart", HEART, "item", ""),
    ("ui_heart_full", HEART, "ui", ""),
    ("ui_heart_empty", HEART_EMPTY, "ui", ""),
    ("icon_sling", SLING, "icon", ""),
    ("icon_strength", STRENGTH, "icon", ""),
    ("icon_staff", STAFF, "icon", ""),
    ("icon_faith", FAITH, "icon", ""),
    ("icon_fire", FIRE_ICON, "icon", ""),
    ("icon_sun", SUN, "icon", ""),
    ("relic_tablets", TABLETS, "relic", ""),
    ("ally_lion_daniel", LION, "relic", ""),
    ("fx_sling_stone", SLING_STONE, "fx", ""),
    ("fx_fire_elijah_0", FIRE_1, "fx", ""),
    ("fx_fire_elijah_1", FIRE_2, "fx", ""),
    ("fx_shield_0", make_shield(0), "fx", ""),
    ("fx_shield_1", make_shield(1), "fx", ""),
    ("fx_puff_0", make_puff(0), "fx", ""),
    ("fx_puff_1", make_puff(1), "fx", ""),
    ("fx_smash_0", make_smash(0), "fx", ""),
    ("fx_smash_1", make_smash(1), "fx", ""),
    ("fx_spear", SPEAR, "fx", ""),
    ("fx_shockwave_0", make_shockwave(0), "fx", ""),
    ("fx_shockwave_1", make_shockwave(1), "fx", ""),
    ("enemy_serpent_0", SERPENT_1, "enemy", ""),
    ("enemy_serpent_1", SERPENT_2, "enemy", ""),
    ("enemy_scorpion_0", make_scorpion(0), "enemy", ""),
    ("enemy_scorpion_1", make_scorpion(1), "enemy", ""),
    ("enemy_jackal_0", make_jackal(0), "enemy", ""),
    ("enemy_jackal_1", make_jackal(1), "enemy", ""),
    ("enemy_lion_0", make_lion(0), "enemy", ""),
    ("enemy_lion_1", make_lion(1), "enemy", ""),
    ("tile_grass", GRASS, "tile", ""),
    ("tile_sand", SAND, "tile", ""),
    ("tile_path", PATH, "tile", ""),
    ("tile_water_0", WATER_1, "tile", ""),
    ("tile_water_1", WATER_2, "tile", ""),
    ("tile_parted_sea_0", PARTED_1, "tile", ""),
    ("tile_parted_sea_1", PARTED_2, "tile", ""),
    ("tile_stone_wall", WALL, "tile", ""),
    ("tile_palm", PALM, "tile", ""),
    ("tile_rock", ROCK, "tile", ""),
    ("tile_boulder", BOULDER, "tile", ""),
    ("tile_thorn", THORN, "tile", ""),
    ("tile_tent", TENT, "tile", ""),
    ("tile_den_floor", DEN, "tile", ""),
    ("tile_arena_floor", ARENA, "tile", ""),
    # 32x32
    ("boss_giant_0", GIANT_0, "boss", ""),
    ("boss_giant_1", GIANT_1, "boss", ""),
    ("boss_giant_stomp", GIANT_STOMP, "boss", ""),
    ("boss_giant_hurt", GIANT_HURT, "boss", ""),
]

REQUIRED = (
    [f"hero_{d}_{i}" for d in ("down", "up", "left", "right") for i in (0, 1)] +
    ["npc_prophet", "chest_closed", "chest_open", "sign_post", "item_verse_scroll", "item_verse_scroll_gold", "item_heart",
     "ui_heart_full", "ui_heart_empty"] +
    [f"icon_{a}" for a in ("sling", "strength", "staff", "faith", "fire", "sun")] +
    ["fx_sling_stone", "fx_spear"] +
    [f"fx_{n}_{i}" for n in ("fire_elijah", "shield", "puff", "smash", "shockwave") for i in (0, 1)] +
    [f"enemy_{n}_{i}" for n in ("serpent", "scorpion", "jackal", "lion") for i in (0, 1)] +
    ["boss_giant_0", "boss_giant_1", "boss_giant_stomp", "boss_giant_hurt"] +
    ["tile_grass", "tile_sand", "tile_path", "tile_water_0", "tile_water_1", "tile_parted_sea_0",
     "tile_parted_sea_1", "tile_stone_wall", "tile_palm", "tile_rock", "tile_boulder", "tile_thorn",
     "tile_tent", "tile_den_floor", "tile_arena_floor"]
)

# =====================================================================================
#  Render + pack
# =====================================================================================
def render(grid):
    h, w = len(grid), len(grid[0])
    assert (w, h) in ((16, 16), (32, 32)), (w, h)
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for y, row in enumerate(grid):
        assert len(row) == w, (y, row, len(row))
        for x, ch in enumerate(row):
            col = PAL[ch]
            if col: im.putpixel((x, y), col if len(col) == 4 else col + (255,))
    return im

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)          # assets/sprites/
COLS = 16                              # sheet is 256px wide

imgs = {name: render(grid) for name, grid, _, _ in SPRITES}
small = [s for s in SPRITES if imgs[s[0]].width == 16]
big = [s for s in SPRITES if imgs[s[0]].width == 32]
small_rows = (len(small) + COLS - 1) // COLS
big_per_row = COLS // 2
big_rows = (len(big) + big_per_row - 1) // big_per_row
sheet = Image.new("RGBA", (COLS * 16, small_rows * 16 + big_rows * 32), (0, 0, 0, 0))
atlas = {"tileSize": 16, "image": "spritesheet.png", "frames": {}, "animations": {}}
for i, (name, grid, cat, _) in enumerate(small):
    x, y = (i % COLS) * 16, (i // COLS) * 16
    sheet.paste(imgs[name], (x, y))
    atlas["frames"][name] = {"x": x, "y": y, "w": 16, "h": 16, "category": cat}
for i, (name, grid, cat, _) in enumerate(big):
    x, y = (i % big_per_row) * 32, small_rows * 16 + (i // big_per_row) * 32
    sheet.paste(imgs[name], (x, y))
    atlas["frames"][name] = {"x": x, "y": y, "w": 32, "h": 32, "category": cat}
for name in atlas["frames"]:
    if name[-2] == '_' and name[-1].isdigit():
        atlas["animations"].setdefault(name[:-2], []).append(name)
for k in atlas["animations"]: atlas["animations"][k].sort()
sheet.save(f"{OUT}/spritesheet.png")
with open(f"{OUT}/spritesheet.json", "w") as f: json.dump(atlas, f, indent=2)

missing = [n for n in REQUIRED if n not in atlas["frames"]]
assert not missing, missing
# overlap check
rects = [(v["x"], v["y"], v["w"], v["h"]) for v in atlas["frames"].values()]
for i in range(len(rects)):
    for j in range(i + 1, len(rects)):
        a, b = rects[i], rects[j]
        assert a[0] + a[2] <= b[0] or b[0] + b[2] <= a[0] or a[1] + a[3] <= b[1] or b[1] + b[3] <= a[1], (a, b)

# ---- labelled preview (every frame, x4; boss x4 = 128px) ----
SC = 4; CW = 150; CH = 16 * SC + 30
font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 11)
tfont = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf", 24)
PC = 10
nrow_s = (len(small) + PC - 1) // PC
W = PC * CW + 20
H = 60 + nrow_s * CH + 32 * SC + 50
prev = Image.new("RGB", (W, H), (32, 30, 46))
d = ImageDraw.Draw(prev)
d.text((20, 16), f"Scripture Quest — sprite set ({len(SPRITES)} frames)", font=tfont, fill=(255, 205, 117))
def cell(name, cx, cy):
    im = imgs[name]
    bw, bh = im.width * SC, im.height * SC
    d.rectangle([cx - 2, cy - 2, cx + bw + 1, cy + bh + 1], fill=(48, 46, 66))
    b = im.resize((bw, bh), Image.NEAREST)
    prev.paste(b, (cx, cy), b)
    tw = d.textlength(name, font=font)
    d.text((cx + bw / 2 - tw / 2, cy + bh + 6), name, font=font, fill=(230, 226, 210))
for i, (name, *_r) in enumerate(small):
    cx = 20 + (i % PC) * CW + (CW - 64) // 2 - 10
    cy = 60 + (i // PC) * CH
    cell(name, cx, cy)
for i, (name, *_r) in enumerate(big):
    cell(name, 40 + i * 200, 60 + nrow_s * CH + 6)
prev.save(f"{OUT}/preview.png")

# ---- tiles preview: each tile repeated 4x4, x3 ----
tiles = [s[0] for s in SPRITES if s[2] == "tile"]
TS = 3; TB = 16 * 4 * TS; TC = 5
TW = TC * (TB + 24) + 24; THh = 50 + ((len(tiles) + TC - 1) // TC) * (TB + 34)
tp = Image.new("RGB", (TW, THh), (32, 30, 46)); td = ImageDraw.Draw(tp)
td.text((24, 12), "Tiles repeated 4x4 (seam check)", font=tfont, fill=(255, 205, 117))
for i, name in enumerate(tiles):
    blk = Image.new("RGBA", (64, 64), (255, 0, 255, 255))
    for yy in range(4):
        for xx in range(4): blk.paste(imgs[name], (xx * 16, yy * 16), imgs[name])
    blk = blk.resize((TB, TB), Image.NEAREST)
    cx = 24 + (i % TC) * (TB + 24); cy = 50 + (i // TC) * (TB + 34)
    tp.paste(blk, (cx, cy))
    td.text((cx, cy + TB + 6), name, font=font, fill=(230, 226, 210))
tp.save(f"{OUT}/tiles_preview.png")
print("ok", sheet.size, len(SPRITES), "frames; required all present:", len(REQUIRED))
