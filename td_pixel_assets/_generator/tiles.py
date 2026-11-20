"""Terrain autotiles and map props."""
import math

from px import Canvas, P, OUT, WHITE, hx, darken, lighten, Sheet, BAYER4
from towers import (stone_cyl, wood_cyl, ellipse_top, cone_roof, flag, banner, arch_door,
                    merlons, hsh, window, roof, plank_box)

T = 32
B = 9  # grass margin on edge tiles


def nz(t, ph=0.0):
    """Periodic boundary noise, period T."""
    return (1.4 * math.sin(2 * math.pi * t / T * 2 + ph) + 0.9 * math.sin(2 * math.pi * t / T * 3 + ph * 1.7)
            + 0.5 * math.sin(2 * math.pi * t / T * 5 + ph * 0.3))


# ------------------------------------------------------------- textures
def grass_px(x, y, seed=0, flowers=0.0):
    g = P['grass']
    h = hsh(x % T, y % T, seed)
    v = (math.sin((x % T) * 0.45 + seed) + math.cos((y % T) * 0.5 + seed * 1.3)
         + math.sin(((x + y) % T) * 0.33 + seed * 0.7))
    k = 2
    if v > 2.05:
        k = 3
    elif v < -2.15:
        k = 1
    if h % 19 == 0:
        k = 3
    if h % 27 == 0:
        k = 1
    return g[k]


def grass_detail(c, seed=0, flowers=0, tufts=6, x0=0, y0=0, mask=None):
    g = P['grass']
    import random
    r = random.Random(seed * 977 + 13)
    for _ in range(tufts):
        x, y = r.randrange(1, T - 2), r.randrange(2, T - 1)
        if mask and not mask(x, y):
            continue
        c.px(x0 + x, y0 + y, g[4])
        c.px(x0 + x, y0 + y - 1, g[3])
        c.px(x0 + x + 1, y0 + y, g[3])
        c.px(x0 + x - 1, y0 + y + 1, g[1])
    cols = [hx('#f4e86a'), hx('#ffffff'), hx('#e86a8a'), hx('#8ab4f0')]
    for _ in range(flowers):
        x, y = r.randrange(2, T - 2), r.randrange(2, T - 2)
        if mask and not mask(x, y):
            continue
        col = cols[r.randrange(len(cols))]
        c.px(x0 + x, y0 + y, col)
        c.px(x0 + x + 1, y0 + y, darken(col, 0.8))
        c.px(x0 + x, y0 + y + 1, g[1])


def dirt_px(x, y, seed=0):
    d = P['dirt']
    h = hsh(x % T, y % T, seed + 99)
    v = math.sin((x % T) * 0.39 + 1 + seed) + math.cos((y % T) * 0.41 + seed) + math.sin(((x - y) % T) * 0.2)
    k = 2
    if v > 2.1:
        k = 3
    elif v < -2.2:
        k = 1
    if h % 23 == 0:
        k = 1
    if h % 37 == 0:
        k = 3
    return d[k]


def pebbles(c, seed=0, n=4, x0=0, y0=0, mask=None, ramp=None):
    import random
    r = random.Random(seed * 131 + 7)
    st = ramp or P['stonew']
    for _ in range(n):
        x, y = r.randrange(2, T - 3), r.randrange(2, T - 3)
        if mask and not mask(x, y):
            continue
        c.px(x0 + x, y0 + y, st[2])
        c.px(x0 + x + 1, y0 + y, st[1])
        c.px(x0 + x, y0 + y + 1, st[0])
        c.px(x0 + x, y0 + y - 1 + 1, st[3]) if r.random() < 0.5 else None


def water_px(x, y, frame=0):
    w = P['water']
    xx, yy = x % T, y % T
    ph = frame * math.pi / 2
    v = math.sin(xx * 2 * math.pi / T * 2 + yy * 2 * math.pi / T + ph) + math.sin(yy * 2 * math.pi / T * 3 - ph)
    k = 2
    if v > 1.45:
        k = 3
    if v > 1.85:
        k = 4
    if v < -1.6:
        k = 1
    return w[k]


# ------------------------------------------------------- autotile shapes
def _top(u, v):
    return v - (B + nz(u, 0.0))


def _bot(u, v):
    return (T - B + nz(u, 2.0)) - v


def _left(u, v):
    return u - (B + nz(v, 1.0))


def _right(u, v):
    return (T - B + nz(v, 3.0)) - u


def _outer(a, b, r=5.0):
    if 0 < a < r and 0 < b < r:
        return r - math.hypot(r - a, r - b)
    return min(a, b)


def _inner(a, b, r=4.0):
    if a > 0 or b > 0:
        return max(a, b)
    if a > -r and b > -r:
        return math.hypot(r + a, r + b) - r
    return max(a, b)


def inside_fn(kind):
    """f(u,v) -> signed distance, >0 inside the region (path / water)."""
    return {
        'C': lambda u, v: 99.0,
        'T': _top, 'B': _bot, 'L': _left, 'R': _right,
        'TL': lambda u, v: _outer(_top(u, v), _left(u, v)),
        'TR': lambda u, v: _outer(_top(u, v), _right(u, v)),
        'BL': lambda u, v: _outer(_bot(u, v), _left(u, v)),
        'BR': lambda u, v: _outer(_bot(u, v), _right(u, v)),
        'iTL': lambda u, v: _inner(_left(u, v), _top(u, v)),
        'iTR': lambda u, v: _inner(_right(u, v), _top(u, v)),
        'iBL': lambda u, v: _inner(_left(u, v), _bot(u, v)),
        'iBR': lambda u, v: _inner(_right(u, v), _bot(u, v)),
    }[kind]


def render_blob(kind, region='path', frame=0, seed=0):
    """region: 'path' (dirt in grass) or 'water' (water with sand shore in grass)."""
    c = Canvas(T, T)
    f = inside_fn(kind)
    D = [[f(u + 0.5, v + 0.5) for u in range(T)] for v in range(T)]
    for v in range(T):
        for u in range(T):
            d = D[v][u]
            if region == 'path':
                if d > 0:
                    col = dirt_px(u, v, seed)
                    if d < 1.6:
                        col = P['dirt'][0]
                    elif d < 3.0:
                        col = P['dirt'][1]
                else:
                    col = grass_px(u, v, seed)
                    if d > -1.2:
                        col = P['grass'][4]
                    elif d > -2.2:
                        col = P['grass'][3]
            else:
                if d > 3.0:
                    col = water_px(u, v, frame)
                    if d < 4.2:
                        col = P['water'][3]
                    if d < 5.2 and d >= 4.2:
                        col = P['water'][1]
                elif d > 0:
                    col = P['sand'][2] if d > 1.2 else P['sand'][1]
                    if hsh(u, v, 5) % 9 == 0:
                        col = P['sand'][3]
                else:
                    col = grass_px(u, v, seed)
                    if d > -1.2:
                        col = P['grass'][4]
                    elif d > -2.2:
                        col = P['grass'][3]
            c.px(u, v, col)
    if region == 'path':
        pebbles(c, seed + hash(kind) % 50, 3, mask=lambda x, y: D[y][x] > 3)
        grass_detail(c, seed + len(kind), 0, 4, mask=lambda x, y: D[y][x] < -3)
        # grass blades overhanging the edge
        for u in range(0, T, 3):
            for v in range(T):
                if -1 < D[v][u] <= 0 and hsh(u, v, 11) % 3 == 0:
                    c.px(u, v + 1, P['grass'][3])
    else:
        if frame >= 0:
            for v in range(T):
                for u in range(T):
                    if 3.0 < D[v][u] < 4.0 and (u + frame * 2) % 7 < 2:
                        c.px(u, v, P['water'][4])
    return c


KINDS = ['TL', 'T', 'TR', 'L', 'C', 'R', 'BL', 'B', 'BR', 'iTL', 'iTR', 'iBL', 'iBR']


def terrain_sheets():
    """Return dict name->(Canvas sheet, tile meta)."""
    out = {}
    # ---- grass + path ground tiles
    cols = 8
    tiles = []
    names = []
    for s in range(3):
        c = Canvas(T, T)
        for y in range(T):
            for x in range(T):
                c.px(x, y, grass_px(x, y, s))
        grass_detail(c, s, 0, 6 + s * 2)
        tiles.append(c)
        names.append(f'grass_{s}')
    c = Canvas(T, T)
    for y in range(T):
        for x in range(T):
            c.px(x, y, grass_px(x, y, 7))
    grass_detail(c, 7, 7, 4)
    tiles.append(c)
    names.append('grass_flowers')
    c = Canvas(T, T)
    for y in range(T):
        for x in range(T):
            c.px(x, y, grass_px(x, y, 9))
    grass_detail(c, 9, 0, 22)
    tiles.append(c)
    names.append('grass_tufts')
    for s in range(3):
        c = Canvas(T, T)
        for y in range(T):
            for x in range(T):
                c.px(x, y, dirt_px(x, y, s))
        pebbles(c, s + 20, 3 + s * 2)
        tiles.append(c)
        names.append(f'dirt_{s}')
    for k in KINDS:
        tiles.append(render_blob(k, 'path'))
        names.append(f'path_{k}')
    out['terrain_path'] = (tiles, names, cols)
    # ---- water (4 animation frames for every tile)
    wt, wn = [], []
    for fr in range(4):
        for k in KINDS:
            wt.append(render_blob(k, 'water', fr))
            wn.append(f'water_{k}_f{fr}')
    out['terrain_water'] = (wt, wn, 13)
    return out


def pack_tiles(tiles, names, cols):
    rows = (len(tiles) + cols - 1) // cols
    from PIL import Image
    im = Image.new('RGBA', (cols * T, rows * T), (0, 0, 0, 0))
    meta = {}
    for i, (t, n) in enumerate(zip(tiles, names)):
        x, y = (i % cols) * T, (i // cols) * T
        im.paste(t.img(), (x, y))
        meta[n] = {'x': x, 'y': y, 'w': T, 'h': T, 'col': i % cols, 'row': i // cols}
    return im, meta


# ================================================================= props
def oak_tree(sway=0, variant=0):
    c = Canvas(48, 64)
    lf = P['leaf']
    # shadow
    S = Canvas(48, 64)
    S.ellipse(24, 58, 16, 5, (10, 20, 8, 90))
    # trunk
    L = Canvas(48, 64)
    L.cyl(21, 38, 6, 20, P['wood'], hl=0.3)
    L.poly([(19, 58), (21, 52), (23, 58)], P['wood'][1])
    L.poly([(26, 58), (26, 52), (29, 58)], P['wood'][1])
    L.px(23, 45, P['wood'][0])
    L.px(24, 50, P['wood'][0])
    L.outline()
    c.over(L)
    # canopy clusters
    import random
    r = random.Random(40 + variant)
    blobs = [(24, 24, 15, 12), (14, 30, 9, 8), (34, 30, 9, 8), (18, 17, 9, 8), (31, 16, 9, 8), (24, 33, 11, 7)]
    L = Canvas(48, 64)
    for bx, by, rx, ry in blobs:
        L.sphere(bx + sway * (1 - by / 40), by, rx, ry, lf)
    # leaf texture
    for _ in range(70):
        x, y = r.randrange(8, 40), r.randrange(6, 40)
        if L.opaque(x, y) and L.opaque(x + 1, y + 1):
            col = L.get(x, y)
            idx = [tuple(q) for q in lf].index(col) if col in [tuple(q) for q in lf] else 2
            L.px(x, y, lf[min(4, idx + 1)])
            L.px(x + 1, y + 1, lf[max(0, idx - 1)])
    if variant == 1:
        for _ in range(6):
            x, y = r.randrange(12, 36), r.randrange(12, 34)
            if L.opaque(x, y):
                L.sphere(x, y, 1.4, 1.4, P['red'])
    L.outline()
    c.over(L)
    S.over(c)
    return S


def pine_tree(sway=0, variant=0):
    c = Canvas(32, 56)
    pn = P['pine'] + [hx('#62a852')]
    S = Canvas(32, 56)
    S.ellipse(16, 51, 11, 3.5, (10, 20, 8, 90))
    L = Canvas(32, 56)
    L.cyl(14, 40, 4, 12, P['wood'], hl=0.3)
    L.outline()
    c.over(L)
    for i, (w, y0, h) in enumerate(((12, 26, 18), (10, 17, 15), (7, 9, 12), (4, 3, 8))):
        L = Canvas(32, 56)
        sx = sway * (i / 3)
        pts = [(16 + sx, y0 - 2), (16 + sx + w + 1, y0 + h), (16 + sx, y0 + h + 2), (16 + sx - w - 1, y0 + h)]
        L.poly_shaded(pts, pn, 'x', 0.3)
        # snowless needle rows
        for k in range(-w, w + 1, 3):
            L.px(16 + sx + k, y0 + h - abs(k) * 0.15, pn[0])
        L.outline()
        c.over(L)
    if variant == 1:
        for x, y in ((12, 30), (20, 22), (15, 14)):
            c.px(x, y, P['wood'][3])
            c.px(x, y + 1, P['wood'][1])
    S.over(c)
    return S


def bush(variant=0, berries=False):
    c = Canvas(24, 20)
    lf = P['leaf']
    S = Canvas(24, 20)
    S.ellipse(12, 16, 10, 3, (10, 20, 8, 90))
    L = Canvas(24, 20)
    if variant == 0:
        for bx, by, r in ((8, 11, 5), (16, 11, 5), (12, 8, 6)):
            L.sphere(bx, by, r, r * 0.85, lf)
    else:
        for bx, by, r in ((7, 12, 4.5), (12, 9, 5.5), (17, 12, 4.5)):
            L.sphere(bx, by, r, r * 0.85, lf)
    if berries:
        for x, y in ((9, 9), (14, 7), (16, 12), (7, 13)):
            L.px(x, y, P['red'][3])
            L.px(x + 1, y + 1, P['red'][1])
    L.outline()
    c.over(L)
    S.over(c)
    return S


def rock(size=1, variant=0, mossy=False):
    w, h = [(16, 12), (24, 18), (32, 26)][size]
    c = Canvas(w, h)
    st = P['stone']
    S = Canvas(w, h)
    S.ellipse(w / 2, h - 3, w / 2 - 1, 2.5, (10, 20, 8, 90))
    L = Canvas(w, h)
    import random
    r = random.Random(size * 10 + variant)
    n = 2 + size
    for i in range(n):
        rx = (w / 2 - 2) * (0.55 + 0.25 * r.random())
        ry = (h / 2 - 2) * (0.6 + 0.25 * r.random())
        x = w / 2 + (i - (n - 1) / 2) * w * 0.18
        y = h - 3 - ry + (i % 2)
        L.sphere(x, y, rx, ry, st)
    for _ in range(3 + size * 2):
        x, y = r.randrange(2, w - 2), r.randrange(2, h - 3)
        if L.opaque(x, y) and L.opaque(x + 1, y):
            L.px(x, y, st[0])
            L.px(x + 1, y - 1, st[3])
    if mossy:
        for _ in range(4 + size * 3):
            x, y = r.randrange(2, w - 2), r.randrange(1, h // 2 + 1)
            if L.opaque(x, y):
                L.px(x, y, P['leaf'][3])
                L.px(x + 1, y, P['leaf'][2])
    L.outline()
    c.over(L)
    S.over(c)
    return S


def stump():
    c = Canvas(20, 16)
    S = Canvas(20, 16)
    S.ellipse(10, 12, 8, 2.5, (10, 20, 8, 90))
    L = Canvas(20, 16)
    L.cyl(4, 6, 12, 6, P['wood'], hl=0.3)
    L.poly([(3, 12), (5, 9), (6, 12)], P['wood'][1])
    L.poly([(14, 12), (15, 9), (17, 12)], P['wood'][1])
    ellipse_top(L, 10, 6, 6, 2.5, P['woodl'], edge=False)
    L.ring(10, 6, 3.5, 1.5, P['woodl'][1])
    L.outline()
    c.over(L)
    S.over(c)
    return S


def mushrooms():
    c = Canvas(16, 16)
    for x, y, r, col in ((5, 10, 3, P['red']), (10, 12, 2.4, P['red']), (12, 8, 1.8, P['gold'])):
        c.rect(int(x - 0.5), int(y), 1 if r < 2.5 else 2, 3, P['bone'][3])
        c.sphere(x, y, r, r * 0.7, col)
        c.px(x - 1, y - 1, WHITE)
    c.outline()
    return c


def flowers(variant=0):
    c = Canvas(16, 16)
    cols = [hx('#f4e86a'), hx('#e86a8a'), hx('#8ab4f0'), WHITE]
    import random
    r = random.Random(variant)
    for _ in range(5):
        x, y = r.randrange(3, 13), r.randrange(5, 14)
        c.vline(x, y, y + 2, P['grass'][1])
        col = cols[r.randrange(4)]
        for dx, dy in ((0, -1), (-1, 0), (1, 0), (0, 1)):
            c.px(x + dx, y - 1 + dy, col)
        c.px(x, y - 1, P['gold'][2])
    return c


def tall_grass(sway=0):
    c = Canvas(16, 16)
    g = P['grass']
    for i, x in enumerate((4, 6, 8, 10, 12)):
        hgt = 6 + (i * 3) % 5
        top = (x + sway * (1 if i % 2 else 0.5), 14 - hgt)
        c.line(x, 14, *top, g[3] if i % 2 else g[4])
        c.px(x, 14, g[1])
    c.outline(P['grass'][0])
    return c


def fence(kind='h'):
    if kind == 'h':
        c = Canvas(32, 16)
        for x in (2, 15, 28):
            c.rect(x, 4, 2, 10, P['wood'][2])
            c.px(x, 3, P['wood'][3])
        c.rect(1, 6, 30, 2, P['woodl'][2])
        c.rect(1, 10, 30, 2, P['woodl'][1])
        c.hline(1, 30, 6, P['woodl'][3])
    else:
        c = Canvas(16, 32)
        c.rect(7, 2, 2, 28, P['woodl'][2])
        for y in (4, 16, 28):
            c.rect(6, y - 2, 4, 4, P['wood'][2])
            c.px(6, y - 2, P['wood'][3])
    c.outline()
    return c


def signpost():
    c = Canvas(20, 24)
    c.rect(9, 6, 2, 16, P['wood'][2])
    c.poly([(2, 4), (14, 4), (17, 7), (14, 10), (2, 10)], P['woodl'][2])
    c.hline(2, 14, 4, P['woodl'][3])
    c.hline(4, 12, 7, P['woodl'][0])
    c.outline()
    return c


def barrel():
    c = Canvas(16, 18)
    L = Canvas(16, 18)
    L.cyl(3, 4, 10, 11, P['wood'], hl=0.3)
    for y in (6, 12):
        L.hline(3, 12, y, P['metal'][1])
    ellipse_top(L, 8, 4, 5, 2, P['woodl'], edge=False)
    L.outline()
    c.over(L)
    return c


def crate():
    c = Canvas(16, 16)
    plank_box(c, 2, 5, 12, 9, P['woodl'], vertical=False)
    c.rect(2, 2, 12, 3, P['woodl'][3])
    c.line(2, 5, 13, 13, P['wood'][1])
    c.outline()
    return c


def bones():
    c = Canvas(20, 12)
    b = P['bone']
    c.sphere(6, 6, 3, 2.6, b)
    c.px(5, 6, OUT)
    c.px(7, 6, OUT)
    c.line(9, 9, 17, 6, b[2])
    c.line(10, 6, 17, 9, b[3])
    c.outline()
    return c


def campfire(i, n=6):
    from fx import flame
    c = Canvas(32, 32)
    for k in range(7):
        a = k * 2 * math.pi / 7
        c.sphere(16 + math.cos(a) * 7, 25 + math.sin(a) * 2.6, 2.2, 1.6, P['stonew'])
    c.line(10, 24, 22, 27, P['wood'][2], w=2)
    c.line(10, 27, 22, 24, P['wood'][1], w=2)
    c.outline()
    f = flame(i, n, (16, 24))
    c.blit(f, 8, 2)
    return c


def bridge():
    c = Canvas(64, 40)
    for x in range(4, 60, 5):
        c.rect(x, 10, 4, 22, P['woodl'][2])
        c.vline(x, 10, 31, P['woodl'][3])
        c.vline(x + 3, 10, 31, P['woodl'][0])
    for y in (8, 32):
        c.rect(2, y, 60, 3, P['wood'][2])
        c.hline(2, 61, y, P['wood'][3])
        for x in (2, 20, 40, 59):
            c.rect(x, y - 5, 3, 7, P['wood'][1])
            c.px(x + 1, y - 5, P['wood'][3])
    c.outline()
    return c


def well():
    c = Canvas(32, 40)
    stone_cyl(c, 16, 22, 33, 10, P['stonew'], bh=3, nb=6)
    ellipse_top(c, 16, 22, 10, 4.2, [hx('#0e1a2a'), hx('#1a3050'), hx('#24406a'), hx('#24406a')], edge=False)
    c.vline(7, 6, 26, P['wood'][2])
    c.vline(25, 6, 26, P['wood'][2])
    c.poly([(4, 8), (28, 8), (16, 1)], P['roof_r'][2])
    c.hline(4, 28, 8, P['roof_r'][0])
    c.line(16, 9, 16, 16, P['bone'][2])
    c.rect(14, 16, 4, 3, P['wood'][2])
    c.outline()
    return c


def tent():
    c = Canvas(48, 40)
    S = Canvas(48, 40)
    S.ellipse(24, 35, 20, 4, (10, 20, 8, 90))
    L = Canvas(48, 40)
    L.poly_shaded([(4, 34), (24, 6), (44, 34)], P['leather'], 'x', 0.3)
    L.poly([(19, 34), (24, 18), (29, 34)], hx('#1a1018'))
    L.line(24, 6, 24, 2, P['wood'][2])
    L.line(24, 6, 19, 34, P['leather'][0])
    L.line(24, 6, 29, 34, P['leather'][0])
    L.px(25, 3, P['red'][3])
    L.px(26, 3, P['red'][2])
    L.px(26, 4, P['red'][2])
    L.outline()
    c.over(L)
    S.over(c)
    return S


def ruin_pillar(broken=False):
    c = Canvas(20, 40)
    S = Canvas(20, 40)
    S.ellipse(10, 36, 8, 2.6, (10, 20, 8, 90))
    top = 14 if broken else 6
    stone_cyl(c, 10, top, 34, 5, P['stonew'], bh=4, nb=4)
    if not broken:
        c.rect(3, 3, 14, 4, P['stonew'][2])
        c.hline(3, 16, 3, P['stonew'][3])
    else:
        c.poly([(5, top + 1), (8, top - 3), (11, top), (15, top - 2), (15, top + 2), (5, top + 2)], P['stonew'][2])
    c.rect(3, 33, 14, 3, P['stonew'][1])
    c.outline()
    S.over(c)
    return S


def kingdom_gate(phase=0.0):
    """Exit point the enemies try to reach (lives)."""
    W_, H_ = 80, 64
    c = Canvas(W_, H_)
    S = Canvas(W_, H_)
    S.ellipse(40, 58, 36, 6, (10, 20, 8, 90))
    # wall
    for x in range(4, 76):
        for y in range(26, 58):
            row = (y - 26) // 4
            k = 2 if x < 40 else 1
            if (y - 26) % 4 == 0 or ((x + row % 2 * 3) % 7 == 0):
                k = 0
            c.px(x, y, P['stone'][k + 1])
    for x in range(4, 76, 5):
        c.rect(x, 22, 3, 4, P['stone'][3 if x < 40 else 2])
    # towers
    for tx in (12, 68):
        stone_cyl(c, tx, 14, 58, 9, P['stone'], bh=4, nb=6)
        cone_roof(c, tx, 14, 11, 14, P['roof_b'], rows=4, ncol=5)
        flag(c, tx, 0 + 4, phase + tx, P['blue'], pole=4, emblem=P['gold'][3])
    arch_door(c, 40, 58, 16, 22, 0.0, P['wood'], P['gold'])
    c.hline(30, 50, 34, P['gold'][2])
    banner(c, 24, 30, 5, 12, P['blue'], emblem=P['gold'][3])
    banner(c, 51, 30, 5, 12, P['blue'], emblem=P['gold'][3])
    c.outline()
    S.over(c)
    return S


def cave_entrance():
    c = Canvas(56, 48)
    S = Canvas(56, 48)
    S.ellipse(28, 42, 24, 5, (10, 20, 8, 90))
    L = Canvas(56, 48)
    for bx, by, r in ((14, 30, 12), (42, 30, 12), (28, 20, 14), (8, 38, 7), (48, 38, 7)):
        L.sphere(bx, by, r, r * 0.85, P['stone'])
    for y in range(20, 43):
        for x in range(18, 39):
            dx = (x + 0.5 - 28) / 9
            dy = (y + 0.5 - 42) / 18
            if dx * dx + dy * dy <= 1:
                L.px(x, y, hx('#0c0810') if dx * dx + dy * dy < 0.7 else hx('#1e1426'))
    for x, y in ((24, 26), (32, 28)):
        L.px(x, y, hx('#ff3a2a'))
        L.px(x + 2, y, hx('#ff3a2a'))
    L.outline()
    c.over(L)
    S.over(c)
    return S
