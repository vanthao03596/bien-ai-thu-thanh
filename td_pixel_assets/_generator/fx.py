"""Projectiles and effects."""
import math

from px import Canvas, P, OUT, WHITE, hx, darken, lighten, Sheet, BAYER4

D2R = math.pi / 180


def mixc(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(4))


# ------------------------------------------------------------ projectiles
def arrow(angle):
    c = Canvas(16, 16)
    ca, sa = math.cos(angle * D2R), math.sin(angle * D2R)
    cx, cy = 7.5, 7.5
    tail = (cx - ca * 5, cy - sa * 5)
    head = (cx + ca * 4, cy + sa * 4)
    c.line(*tail, *head, P['woodl'][2])
    c.px(head[0] + ca, head[1] + sa, P['metal'][3])
    c.px(head[0], head[1], P['metal'][2])
    px_, py_ = -sa, ca
    for d in (0, 1):
        tx, ty = tail[0] + ca * d, tail[1] + sa * d
        c.px(tx + px_, ty + py_, hx('#d84a3a') if d else hx('#8a1c22'))
        c.px(tx - px_, ty - py_, hx('#d84a3a') if d else hx('#8a1c22'))
    c.outline()
    return c


def magic_bolt(i):
    c = Canvas(16, 16)
    m = P['magic']
    # trail
    for k in range(4):
        x = 7 - k * 2 - (i % 2) * 0.5
        y = 8 + math.sin(i * 1.6 + k) * 1.2
        c.px(x, y, m[3 - min(3, k)] if k < 3 else m[1])
    r = 3.2 + 0.6 * math.sin(i * math.pi / 2)
    c.sphere(10, 8, r, r, m)
    c.sphere(10, 8, r * 0.5, r * 0.5, [m[3], m[4], m[4], WHITE])
    c.outline(darken(m[0], 0.8))
    for k in range(2):
        a = i * 1.3 + k * 3.1
        c.px(10 + math.cos(a) * (r + 2), 8 + math.sin(a) * (r + 2), m[4])
    return c


def bomb(i):
    c = Canvas(16, 16)
    dark = [hx('#14141c'), hx('#262834'), hx('#40445a'), hx('#6a7090')]
    c.sphere(8, 9, 4.2, 4.2, dark)
    # band rotating
    a = i * 45
    for t in range(-4, 5):
        x = 8 + math.cos(a * D2R) * t
        y = 9 + math.sin(a * D2R) * t * 0.5
        c.px(x, y, dark[1])
    c.px(6, 7, dark[3])
    c.rect(7, 4, 2, 1, P['metal'][1])
    c.outline()
    # fuse + spark
    c.line(8, 3, 9, 1, P['woodl'][2])
    sx, sy = 9, 1
    cols = [P['fire'][4], P['fire'][3], P['fire'][2]]
    for k, (dx, dy) in enumerate(((0, 0), (1, -1), (-1, -1), (1, 1), (2, 0))):
        if (k + i) % 2 == 0 or k == 0:
            c.px(sx + dx, sy + dy, cols[min(2, k // 2)])
    return c


def fireball(i):
    c = Canvas(16, 16)
    f = P['fire']
    for k in range(5):
        x = 6 - k * 1.5
        y = 8 + math.sin(i * 1.7 + k * 1.1) * 1.5
        r = 2.4 - k * 0.4
        c.ellipse(x, y, r, r, f[2] if k < 2 else f[1])
    c.sphere(10, 8, 3.6, 3.4, f[1:])
    c.ellipse(10.5, 7.5, 1.8, 1.6, f[4])
    c.outline(darken(f[0], 0.8))
    return c


def heal_orb(i):
    c = Canvas(16, 16)
    g = P['green_fx']
    r = 2.6 + 0.5 * math.sin(i * math.pi / 2)
    c.sphere(8, 8, r, r, g)
    c.px(7, 7, WHITE)
    for k in range(3):
        a = i * 1.2 + k * 2.1
        c.px(8 + math.cos(a) * (r + 2.5), 8 + math.sin(a) * (r + 2.5), g[3])
    c.outline(darken(g[0], 0.8))
    return c


# ---------------------------------------------------------------- effects
def explosion(i, n=9):
    S = 48
    c = Canvas(S, S)
    cx, cy = 24, 30
    t = i / (n - 1)
    f = P['fire']
    sm = P['smoke']
    if i == 0:
        c.ellipse(cx, cy, 6, 5, f[4])
        c.ellipse(cx, cy, 9, 7, (255, 244, 162, 140))
        for a in range(0, 360, 45):
            c.line(cx, cy, cx + math.cos(a * D2R) * 12, cy + math.sin(a * D2R) * 9, f[4])
        return c
    # smoke ring expanding (later frames)
    if t > 0.25:
        for k in range(8):
            a = k * 45 + 22
            r = 6 + t * 14
            x = cx + math.cos(a * D2R) * r
            y = cy - 2 + math.sin(a * D2R) * r * 0.6 - t * 6
            rr = 3 + t * 4
            L = Canvas(S, S)
            L.sphere(x, y, rr, rr * 0.9, sm)
            L.outline(darken(sm[0], 0.7))
            if t > 0.55:
                L.dissolve((t - 0.55) * 2.0)
            c.over(L)
    # fire core
    core = max(0, 1 - t * 1.3)
    if core > 0:
        L = Canvas(S, S)
        R = 9 + t * 8
        for k in range(7):
            a = k * 51 + i * 13
            x = cx + math.cos(a * D2R) * R * 0.5
            y = cy - t * 8 + math.sin(a * D2R) * R * 0.35
            rr = R * 0.55 * core + 2
            L.sphere(x, y, rr, rr * 0.9, [f[1], f[2], f[3], f[4]])
        if t < 0.5:
            for k in range(10):
                a = (k * 36 + i * 17) * D2R
                ln = R * (1.25 + 0.35 * ((k * 7) % 3)) * core + 3
                x0, y0 = cx, cy - t * 8
                for s_ in range(int(ln)):
                    ww = max(0.6, (1 - s_ / ln) * 2.6)
                    L.disc(x0 + math.cos(a) * s_, y0 + math.sin(a) * s_ * 0.8, ww, f[2] if s_ < ln * 0.6 else f[1])
        L.sphere(cx, cy - t * 8, R * 0.45 * core + 1, R * 0.4 * core + 1, [f[3], f[4], f[4], WHITE])
        L.outline(darken(f[0], 0.7))
        c.over(L)
    # debris
    for k in range(6):
        a = (k * 60 + 17) * D2R
        d = t * 20
        x = cx + math.cos(a) * d
        y = cy - 6 + math.sin(a) * d * 0.6 - 18 * t + 26 * t * t
        if t < 0.9:
            c.px(x, y, P['dirt'][0] if k % 2 else OUT)
            c.px(x + 1, y, P['dirt'][1])
    # scorch on ground in last frames
    if t > 0.6:
        for y in range(cy + 2, cy + 7):
            for x in range(cx - 10, cx + 11):
                dx = (x - cx) / 10
                dy = (y - cy - 4.5) / 2.6
                if dx * dx + dy * dy <= 1 and BAYER4[y % 4, x % 4] > (t - 0.6) * 2:
                    c.px(x, y, (30, 22, 20, 160))
    return c


def magic_hit(i, n=6):
    c = Canvas(32, 32)
    m = P['magic']
    t = i / (n - 1)
    cx, cy = 16, 16
    if i == 0:
        c.sphere(cx, cy, 5, 5, [m[3], m[4], m[4], WHITE])
        c.outline(m[1])
        return c
    R = 4 + t * 11
    c.ring(cx, cy, R, R * 0.8, m[3] if t < 0.5 else m[2], t=1.4)
    c.ring(cx, cy, R * 0.6, R * 0.5, m[4] if t < 0.5 else m[3])
    for k in range(8):
        a = (k * 45 + i * 10) * D2R
        d = R + 2
        x = cx + math.cos(a) * d
        y = cy + math.sin(a) * d * 0.8
        if k % 2 == 0:
            for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
                c.px(x + dx, y + dy, m[4] if (dx, dy) == (0, 0) else m[3])
        else:
            c.px(x, y, m[4])
    if t > 0.6:
        c.dissolve((t - 0.6) * 2)
    return c


def hit_spark(i):
    c = Canvas(16, 16)
    cx, cy = 8, 8
    lens = [(3, 5), (5, 7), (6, 4), (4, 2)][i]
    col = [WHITE, hx('#fff4a2'), hx('#ffc036'), hx('#ec7618')][i]
    for k in range(8):
        a = (k * 45 + 22) * D2R
        L = lens[0] if k % 2 else lens[1]
        x0, y0 = cx + math.cos(a) * (i * 1.2), cy + math.sin(a) * (i * 1.2)
        c.line(x0, y0, cx + math.cos(a) * L, cy + math.sin(a) * L, col)
    if i < 2:
        c.ellipse(cx, cy, 2 - i * 0.5, 2 - i * 0.5, WHITE)
    return c


def smoke_puff(i, n=6, ramp=None, S=32):
    c = Canvas(S, S)
    sm = ramp or P['smoke']
    t = i / (n - 1)
    cx, cy = S / 2, S * 0.62
    for k in range(4):
        a = (k * 90 + 30) * D2R
        r = (2 + t * S * 0.16)
        x = cx + math.cos(a) * r * 0.8
        y = cy + math.sin(a) * r * 0.5 - t * S * 0.25
        L = Canvas(S, S)
        L.sphere(x, y, r, r * 0.85, sm)
        L.outline(darken(sm[0], 0.7))
        c.over(L)
    if t > 0.4:
        c.dissolve((t - 0.4) * 1.6)
    return c


def coin(i, n=6, S=16):
    c = Canvas(S, S)
    g = P['gold']
    w = abs(math.cos(i / n * math.pi)) * 4.5 + 0.8
    cx, cy = S / 2, S / 2
    c.sphere(cx, cy, w, 5, g)
    if w > 2.5:
        c.ellipse(cx, cy, w - 1.6, 3.2, g[1])
        c.vline(int(cx - 0.5), int(cy - 2), int(cy + 1), g[3])
        c.px(cx - 1, cy - 1, g[3])
    c.outline(darken(g[0], 0.6))
    if i == 0:
        c.px(cx - 2, cy - 3, WHITE)
    return c


def upgrade_sparkle(i, n=8):
    c = Canvas(48, 48)
    g = P['gold']
    t = i / (n - 1)
    # rising ring of light
    ry = 40 - t * 26
    c.ring(24, ry, 14 - t * 4, 4, g[3] if t < 0.7 else g[2], t=1.2)
    for k in range(10):
        a = k * 36 * D2R + t * 4
        x = 24 + math.cos(a) * (12 - t * 3)
        y = 44 - ((k * 7 + i * 6) % 38)
        s = 1 if k % 3 else 2
        col = g[3] if k % 2 else WHITE
        c.px(x, y, col)
        if s == 2:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                c.px(x + dx, y + dy, g[2])
    # arrow up
    if 2 <= i <= 6:
        ay = 26 - (i - 2) * 3
        for k in range(4):
            c.hline(24 - k, 23 + k + 1, ay + k, g[3])
        c.rect(22, ay + 4, 4, 5, g[2])
        c.outline(g[0])
    return c


def heal(i, n=6):
    c = Canvas(32, 32)
    g = P['green_fx']
    t = i / (n - 1)
    for k in range(4):
        x = 8 + k * 5 + (k % 2) * 2
        y = 26 - ((t * 18 + k * 5) % 22)
        col = g[3] if k % 2 else WHITE
        c.rect(x - 1, y, 3, 1, col)
        c.rect(x, y - 1, 1, 3, col)
    c.ring(16, 26, 10 + t * 3, 3.5, g[2] if t < 0.6 else g[1])
    c.outline(darken(g[0], 0.7))
    if t > 0.6:
        c.dissolve((t - 0.6) * 2)
    return c


def flame(i, n=6, S=(16, 24)):
    w, h = S
    c = Canvas(w, h)
    f = P['fire']
    cx, by = w / 2, h - 3
    for layer, (rs, col) in enumerate(((1.0, f[1]), (0.75, f[2]), (0.5, f[3]), (0.28, f[4]))):
        for y in range(int(by - 16 * rs) - 2, int(by) + 1):
            v = (by - y) / (16 * rs)
            if v < 0 or v > 1:
                continue
            wob = math.sin(i / n * 2 * math.pi + v * 5) * 1.2 * v
            hw = (5 * rs) * math.sin(math.pi * (0.25 + 0.75 * (1 - v))) * (1 - v * 0.6)
            for x in range(int(cx - hw + wob) - 1, int(cx + hw + wob) + 1):
                if abs(x + 0.5 - (cx + wob)) <= hw:
                    c.px(x, y, col)
    # embers
    for k in range(2):
        ey = by - 14 - ((i * 3 + k * 5) % 8)
        c.px(cx - 2 + k * 4 + math.sin(i + k), ey, f[3])
    c.outline(darken(f[0], 0.7))
    return c


def portal(i, n=8):
    c = Canvas(48, 48)
    m = [hx('#12061e'), hx('#2e0e48'), hx('#561a7a'), hx('#8a3ab0'), hx('#d08af0')]
    cx, cy = 24, 30
    # ground glow
    c.ellipse(cx, cy + 6, 16, 5, (90, 30, 120, 90))
    # swirl ellipse standing vertical
    for y in range(cy - 20, cy + 8):
        for x in range(cx - 14, cx + 15):
            dx = (x + 0.5 - cx) / 12
            dy = (y + 0.5 - (cy - 6)) / 14
            d = math.sqrt(dx * dx + dy * dy)
            if d <= 1:
                a = math.atan2(dy, dx)
                sw = math.sin(a * 3 + d * 9 - i / n * 2 * math.pi)
                k = int((1 - d) * 3 + sw * 0.9 + 0.5)
                k = max(0, min(4, k))
                if d > 0.88:
                    k = 3
                c.px(x, y, m[k])
    # stone arch frame
    for a in range(-200, 21, 8):
        x = cx + math.cos(a * D2R) * 14
        y = cy - 6 + math.sin(a * D2R) * 16
        c.sphere(x, y, 2.6, 2.4, P['stone'])
    for k in range(4):
        a = (i * 45 + k * 90) * D2R
        c.px(cx + math.cos(a) * 9, cy - 6 + math.sin(a) * 11, m[4])
    c.outline()
    return c


def soul_fx(i, n=6):
    c = Canvas(16, 24)
    t = i / (n - 1)
    y = 18 - t * 14
    c1, c2 = hx('#e8f4ff'), hx('#9ec4e8')
    c.ellipse(8, y, 3, 3.2, c1)
    for k in range(4):
        c.px(8 + math.sin(i + k) * (1 + k * 0.3), y + 3 + k, c2 if k < 2 else (158, 196, 232, 150))
    c.px(7, y - 0.5, hx('#2a3a5a'))
    c.px(9, y - 0.5, hx('#2a3a5a'))
    if t > 0.5:
        c.dissolve((t - 0.5) * 1.8)
    return c


def shadow(w, h):
    c = Canvas(w, h)
    c.ellipse(w / 2, h / 2, w / 2 - 0.5, h / 2 - 0.5, (10, 16, 8, 80))
    c.ellipse(w / 2, h / 2, w / 2 - 2, h / 2 - 1.5, (10, 16, 8, 50))
    return c


def hero_beam(i, n=8):
    c = Canvas(32, 48)
    g = P['gold']
    t = i / (n - 1)
    w = 6 * math.sin(math.pi * t) + 1
    for y in range(0, 44):
        for x in range(int(16 - w), int(16 + w) + 1):
            u = abs(x + 0.5 - 16) / max(w, 0.5)
            if u <= 1:
                col = WHITE if u < 0.3 else (g[3] if u < 0.7 else g[2])
                if BAYER4[y % 4, x % 4] < 0.85 or u < 0.5:
                    c.px(x, y, col)
    c.ring(16, 43, 10 * (0.4 + t), 3.5 * (0.4 + t), g[3])
    for k in range(6):
        sx = 16 + math.cos(k * 1.1 + t * 6) * 9
        sy = 40 - ((k * 9 + i * 5) % 36)
        c.px(sx, sy, WHITE)
    return c


def dust(i, n=6):
    return smoke_puff(i, n, P['sand'])


def freeze_slow(i, n=4):
    """Purple 'slowed' rune circle under enemies (loop)."""
    c = Canvas(32, 16)
    m = P['magic']
    for k in range(12):
        a = (k * 30 + i * 15) * D2R
        x = 16 + math.cos(a) * 12
        y = 8 + math.sin(a) * 5
        c.px(x, y, m[3] if k % 3 else m[4])
    c.ring(16, 8, 9, 3.6, (172, 86, 238, 160))
    return c
