"""Towers: archer, mage, artillery, barracks (3 levels) + build plot + construction."""
import math

from px import Canvas, P, OUT, WHITE, hx, darken, lighten, ramp_pick, Sheet, BAYER4

LX, LZ = -0.62, 0.78  # light for vertical surfaces


def hsh(*a):
    h = 2166136261
    for v in a:
        h = ((h ^ (int(v) & 0xffffffff)) * 16777619) & 0xffffffff
    return h


def shade_idx(dx, n, bias=0.0):
    nz = math.sqrt(max(0.0, 1 - dx * dx))
    i = LX * dx + LZ * nz + bias
    t = (i + 0.35) / 1.4
    return max(0, min(n - 1, int(t * n)))


# ------------------------------------------------------------ primitives
def ellipse_top(c, cx, cy, rx, ry, ramp, edge=True):
    for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
        for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
            dx = (x + 0.5 - cx) / rx
            dy = (y + 0.5 - cy) / ry
            d = dx * dx + dy * dy
            if d <= 1:
                k = 2 if d < 0.55 else 1
                if dx < -0.2 and dy < 0.1 and d < 0.8:
                    k = min(len(ramp) - 1, k + 1)
                c.px(x, y, ramp[k] if not (edge and d > 0.82 and dy > 0) else ramp[0])


def stone_cyl(c, cx, top, bot, rx, ramp, ry=None, bh=4, nb=7, seed=1, edge_dark=True):
    ry = rx * 0.42 if ry is None else ry
    n = len(ramp)
    for x in range(int(cx - rx), int(cx + rx) + 1):
        dx = (x + 0.5 - cx) / rx
        if abs(dx) > 1:
            continue
        e = ry * math.sqrt(max(0, 1 - dx * dx))
        th = math.asin(max(-1, min(1, dx)))
        thp = math.asin(max(-1, min(1, (x - 0.5 - cx) / rx)))
        y0, y1 = int(round(top + e)), int(round(bot + e))
        for y in range(y0, y1):
            rel = y - (top + e)
            row = int(rel // bh)
            u = th / math.pi * nb + (row % 2) * 0.5
            up = thp / math.pi * nb + (row % 2) * 0.5
            k = shade_idx(dx, n)
            v = hsh(int(math.floor(u)), row, seed) % 7
            if v == 0:
                k = max(0, k - 1)
            elif v == 1:
                k = min(n - 1, k + 1)
            mortar = (int(rel) % bh == 0) or (math.floor(u) != math.floor(up))
            if mortar:
                k = max(0, k - 2) if k > 1 else 0
            if y >= y1 - 1:
                k = 0
            c.px(x, y, ramp[k])


def wood_cyl(c, cx, top, bot, rx, ramp, ry=None, nlogs=9, spikes=0, bands=()):
    ry = rx * 0.42 if ry is None else ry
    n = len(ramp)
    for x in range(int(cx - rx), int(cx + rx) + 1):
        dx = (x + 0.5 - cx) / rx
        if abs(dx) > 1:
            continue
        e = ry * math.sqrt(max(0, 1 - dx * dx))
        th = math.asin(max(-1, min(1, dx)))
        u = (th / math.pi + 0.5) * nlogs
        fu = u - math.floor(u)
        logi = int(math.floor(u))
        k = shade_idx(dx, n)
        if fu < 0.18:
            k = 0
        elif fu > 0.45 and fu < 0.75:
            k = min(n - 1, k + 1)
        sp = spikes if logi % 2 == 0 else spikes * 0.6
        y0 = int(round(top + e - sp * (1 - abs(fu - 0.5) * 2)))
        y1 = int(round(bot + e))
        for y in range(y0, y1):
            kk = k
            if any(abs(y - (b + e)) < 1 for b in bands):
                kk = 0
            if y >= y1 - 1:
                kk = 0
            c.px(x, y, ramp[kk])
        if spikes:
            c.px(x, y0, OUT if fu < 0.18 else ramp[min(n - 1, k + 1)])


def plank_box(c, x, y, w, h, ramp, vertical=True):
    for xx in range(x, x + w):
        for yy in range(y, y + h):
            if vertical:
                k = 1 if (xx - x) % 4 == 0 else 2
                if (xx - x) % 4 == 1:
                    k = 3
            else:
                k = 1 if (yy - y) % 3 == 0 else 2
            c.px(xx, yy, ramp[k])
    c.hline(x, x + w - 1, y + h - 1, ramp[0])


def merlons(c, cx, top, rx, ry, ramp, h=4, n=8, front=True, w=4):
    """Crenellations around the rim. front=True draws front half, else back half."""
    pts = []
    for i in range(n):
        a = math.pi * (i + 0.5) / n
        if front:
            pts.append((cx + rx * math.cos(a), top + ry * math.sin(a), math.cos(a)))
        else:
            pts.append((cx + rx * math.cos(a), top - ry * math.sin(a), math.cos(a)))
    if not front:
        pts.sort(key=lambda p: p[1])
    for mx, my, ca in pts:
        ww = max(2, int(round(w * (0.5 + 0.5 * math.sqrt(max(0, 1 - ca * ca))))))
        x0 = int(round(mx - ww / 2))
        y0 = int(round(my - h))
        k = shade_idx(ca, len(ramp))
        for xx in range(x0, x0 + ww):
            for yy in range(y0, int(round(my)) + 1):
                kk = k
                if yy == y0:
                    kk = min(len(ramp) - 1, k + 1)
                c.px(xx, yy, ramp[kk])
        c.vline(x0 + ww, y0 + 1, int(round(my)), darken(ramp[k], 0.7))


def cone_roof(c, cx, base, rx, h, ramp, ry=None, rows=5, ncol=8):
    ry = rx * 0.42 if ry is None else ry
    ay = base - h
    n = len(ramp)
    for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
        dx = (x + 0.5 - cx) / rx
        if abs(dx) > 1:
            continue
        e = ry * math.sqrt(max(0, 1 - dx * dx))
        ytop = ay + h * abs(dx) ** 1.1
        ybot = base + e
        th = math.asin(max(-1, min(1, dx)))
        for y in range(int(math.floor(ytop)), int(math.ceil(ybot))):
            f = (y + 0.5 - ay) / max(1, ybot - ay)
            ring = int(f * rows)
            fr = f * rows - ring
            u = (th / math.pi + 0.5) * ncol * (0.4 + ring * 0.25) + ring * 0.5
            k = shade_idx(dx, n, bias=0.15)
            if fr > 0.8:
                k = max(0, k - 1)
            if abs(u - round(u)) < 0.08 and ring > 0:
                k = max(0, k - 1)
            if y >= ybot - 1:
                k = 0
            c.px(x, y, ramp[k])
    c.px(cx - 0.5, ay - 1, ramp[n - 1])


def flag(c, x, y, phase, ramp, w=7, h=4, pole=6, emblem=None):
    c.vline(int(x), int(y - pole), int(y), P['wood'][1])
    c.px(int(x), int(y - pole - 1), P['gold'][3])
    for i in range(w):
        dy = math.sin(phase + i * 0.9) * (0.6 + i * 0.12)
        for j in range(h):
            k = 2 if (j < h / 2) else 1
            if math.cos(phase + i * 0.9) > 0.3:
                k += 1
            c.px(int(x + 1 + i), int(round(y - pole + j + dy)), ramp[min(3, k)])
    if emblem:
        c.px(int(x + 3), int(round(y - pole + 1 + math.sin(phase + 2.7) * 0.9)), emblem)


def banner(c, x, y, w, h, ramp, trim=None, sway=0, emblem=None):
    trim = trim or P['gold']
    c.hline(int(x - 1), int(x + w), int(y), trim[1])
    for xx in range(int(x), int(x + w)):
        for yy in range(int(y + 1), int(y + h)):
            u = (xx - x) / w
            k = 2 if u < 0.5 else 1
            if xx == int(x):
                k = 3
            c.px(xx + (sway if yy > y + h * 0.6 else 0), yy, ramp[k])
    # notch
    mid = x + w / 2 - 0.5
    for i in range(2):
        c.px(int(mid) + (sway), int(y + h - 1 - i), None)
        c.px(int(mid) + 1 + (sway) - (1 if w % 2 else 0), int(y + h - 1 - i), None) if w > 4 and i == 0 else None
    if emblem:
        ex, ey = int(x + w / 2 - 0.5), int(y + h * 0.4)
        c.px(ex, ey, emblem)
        c.px(ex, ey + 1, emblem)
        c.px(ex - 1, ey, emblem)
        c.px(ex + 1, ey, emblem)


def window(c, x, y, w=2, h=3, glow=None):
    col = glow or hx('#1a1020')
    c.rect(x, y, w, h, col)
    c.hline(x, x + w - 1, y - 1, OUT)
    if glow:
        c.px(x, y, lighten(glow, 0.5))


def arch_door(c, cx, bot, w, h, open_t=0.0, ramp=None, trim=None):
    ramp = ramp or P['wood']
    trim = trim or P['stone']
    x0 = int(round(cx - w / 2))
    top = bot - h
    # frame
    for xx in range(x0 - 1, x0 + w + 1):
        for yy in range(int(top - 1), bot):
            dx = (xx + 0.5 - cx) / (w / 2 + 1)
            ay = top + (w / 2) * (1 - math.sqrt(max(0, 1 - dx * dx)))
            if yy >= ay - 1:
                c.px(xx, yy, trim[0])
    for xx in range(x0, x0 + w):
        for yy in range(int(top), bot):
            dx = (xx + 0.5 - cx) / (w / 2)
            ay = top + (w / 2) * (1 - math.sqrt(max(0, 1 - dx * dx)))
            if yy >= ay:
                u = (xx - x0) / w
                if u < open_t:
                    c.px(xx, yy, hx('#140a10'))
                else:
                    k = 2 if (xx - x0) % 3 else 1
                    c.px(xx, yy, ramp[k])
    if open_t < 0.9:
        c.hline(x0 + int(open_t * w), x0 + w - 1, int(top + h * 0.35), P['metal'][1])
        c.hline(x0 + int(open_t * w), x0 + w - 1, int(top + h * 0.75), P['metal'][1])
        c.px(x0 + w - 2, int(top + h * 0.55), P['gold'][2])


def ground_shadow(c, cx, cy, rx, ry):
    c._shadow = (cx, cy, rx, ry)


def _shadow(c, cx, cy, rx, ry):
    for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
        for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
            dx = (x + 0.5 - cx) / rx
            dy = (y + 0.5 - cy) / ry
            if dx * dx + dy * dy <= 1:
                c.px(x, y, (12, 20, 10, 90))


def base_stones(c, cx, cy, rx, ry, ramp=None):
    ramp = ramp or P['stonew']
    n = 12
    for i in range(n):
        a = math.pi * 2 * i / n + 0.2
        x = cx + rx * math.cos(a)
        y = cy + ry * math.sin(a)
        if math.sin(a) > -0.2:
            c.sphere(x, y, 2.4, 1.6, ramp)


# ================================================================ TOWERS
W, H = 64, 64
CX = 32
GY = 56  # ground line of tower base center


def new():
    return Canvas(W, H)


def finish(c):
    c.outline()
    sh = getattr(c, '_shadow', None)
    if sh:
        S = Canvas(c.w, c.h)
        _shadow(S, *sh)
        S.over(c)
        c.a = S.a
    return c


# ---------------------------------------------------------------- archer
def archer_tower(level, phase):
    c = new()
    ground_shadow(c, CX, GY + 1, 20, 6)
    if level == 1:
        stone_cyl(c, CX, GY - 5, GY + 1, 14, P['stonew'], bh=3, nb=8)
        wood_cyl(c, CX, 32, GY - 4, 11.5, P['wood'], nlogs=9, bands=(38, 48))
        ellipse_top(c, CX, 31, 14, 5.6, P['woodl'])
        wood_cyl(c, CX, 27, 31, 14, P['woodl'], ry=5.6, nlogs=12, spikes=2)
        flag(c, CX + 10, 25, phase, P['red'], pole=9, emblem=P['gold'][3])
        c.thick(CX - 12, GY - 4, CX - 15, GY + 1, 2, P['wood'][1])
        c.thick(CX + 12, GY - 4, CX + 15, GY + 1, 2, P['wood'][1])
        unit_y = 28
    elif level == 2:
        stone_cyl(c, CX, 38, GY + 1, 13, P['stonew'], bh=4, nb=8)
        wood_cyl(c, CX, 27, 38, 14.5, P['wood'], ry=6, nlogs=12, bands=(31,))
        ellipse_top(c, CX, 26, 14.5, 6, P['woodl'])
        merlons(c, CX, 26, 14.5, 6, P['woodl'], h=4, n=7, front=True)
        banner(c, CX - 3, 39, 6, 9, P['red'], sway=0, emblem=P['gold'][3])
        window(c, CX + 6, 44, 2, 3)
        flag(c, CX - 11, 21, phase, P['red'], pole=10, emblem=P['gold'][3])
        unit_y = 23
    else:
        stone_cyl(c, CX, 22, GY + 1, 14, P['stone'], bh=4, nb=9)
        # gold trim band
        for x in range(CX - 14, CX + 15):
            dx = (x + 0.5 - CX) / 14
            if abs(dx) <= 1:
                e = 14 * 0.42 * math.sqrt(1 - dx * dx)
                c.px(x, int(round(34 + e)), P['gold'][1 if dx > 0.3 else 2])
        ellipse_top(c, CX, 21, 15.5, 6.4, P['stone'])
        merlons(c, CX, 21, 15.5, 6.4, P['stone'], h=5, n=7, front=True, w=5)
        banner(c, CX - 10, 36, 5, 11, P['red'], emblem=P['gold'][3])
        banner(c, CX + 5, 36, 5, 11, P['red'], emblem=P['gold'][3])
        arch_door(c, CX, GY + 5, 6, 8, 0, P['wood'], P['stone'])
        window(c, CX - 1, 28, 2, 4)
        flag(c, CX - 13, 15, phase, P['blue'], pole=10, emblem=P['gold'][3])
        flag(c, CX + 13, 15, phase + 1.3, P['blue'], pole=10, emblem=P['gold'][3])
        unit_y = 18
    finish(c)
    return c, unit_y


# ------------------------------------------------------------------ mage
def mage_tower(level, phase, charge=0.0):
    c = new()
    ground_shadow(c, CX, GY + 1, 19, 6)
    glow = P['magic']
    bobv = math.sin(phase) * 1.5
    if level == 1:
        stone_cyl(c, CX, 34, GY + 1, 12, P['stone'], bh=4, nb=8)
        ellipse_top(c, CX, 33, 13.5, 5.6, P['roof_p'])
        merlons(c, CX, 33, 13.5, 5.6, P['stone'], h=3, n=6)
        window(c, CX - 1, 42, 2, 4, glow=mix_c(glow[2], glow[4], charge))
        unit_y = 31
        orbs = []
    elif level == 2:
        stone_cyl(c, CX, 28, GY + 1, 12.5, P['stone'], bh=4, nb=8)
        for x in range(CX - 13, CX + 14):
            dx = (x + 0.5 - CX) / 12.5
            if abs(dx) <= 1:
                e = 12.5 * 0.42 * math.sqrt(1 - dx * dx)
                c.px(x, int(round(36 + e)), P['purple'][2 if dx < 0.3 else 1])
        ellipse_top(c, CX, 27, 14, 5.8, P['roof_p'])
        merlons(c, CX, 27, 14, 5.8, P['stone'], h=4, n=7)
        banner(c, CX - 3, 40, 6, 10, P['purple'], emblem=glow[4])
        window(c, CX - 9, 41, 2, 3, glow=mix_c(glow[2], glow[4], charge))
        window(c, CX + 7, 41, 2, 3, glow=mix_c(glow[2], glow[4], charge))
        unit_y = 25
        orbs = [(CX - 16, 22 + bobv, 2.2), (CX + 16, 22 - bobv, 2.2)]
    else:
        for sx in (CX - 10, CX + 10):
            stone_cyl(c, sx, 9, 30, 3.5, P['stone'], bh=3, nb=3)
            cone_roof(c, sx, 9, 4.5, 8, P['roof_p'], rows=3, ncol=3)
        stone_cyl(c, CX, 22, GY + 1, 13, P['stone'], bh=4, nb=9)
        # rune band
        for x in range(CX - 13, CX + 14):
            dx = (x + 0.5 - CX) / 13
            if abs(dx) <= 1:
                e = 13 * 0.42 * math.sqrt(1 - dx * dx)
                col = mix_c(glow[1], glow[4], charge) if (x % 3) else glow[3]
                c.px(x, int(round(32 + e)), col)
                c.px(x, int(round(33 + e)), glow[1])
        ellipse_top(c, CX, 21, 15, 6.2, P['roof_p'])
        merlons(c, CX, 21, 15, 6.2, P['stone'], h=4, n=7, w=5)
        banner(c, CX - 10, 37, 5, 11, P['purple'], emblem=glow[4])
        banner(c, CX + 5, 37, 5, 11, P['purple'], emblem=glow[4])
        arch_door(c, CX, GY + 5, 6, 8, 0, P['roof_p'], P['stone'])
        unit_y = 19
        orbs = [(CX - 10, -2 + 4 + bobv, 2.2), (CX + 10, 2 - bobv, 2.2), (CX - 19, 24 + bobv, 2.0), (CX + 19, 24 - bobv, 2.0)]
    for ox, oy, r in orbs:
        rr = r + charge * 0.8
        c.sphere(ox, oy, rr, rr, glow)
        c.px(ox - 1, oy - 1, WHITE)
    finish(c)
    if charge > 0.5:
        sparkle(c, CX, unit_y - 14, int(charge * 6), glow)
    return c, unit_y


def mix_c(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(4))


def crystal(c, x, y, s, ramp, charge=0):
    pts = [(x, y - 3 * s), (x + s, y), (x, y + s), (x - s, y)]
    c.poly(pts, ramp[2 + (1 if charge > 0.5 else 0)])
    c.line(x - 0.5, y - 3 * s + 1, x - 0.5, y, ramp[4])


def sparkle(c, cx, cy, n, ramp):
    for i in range(n):
        a = i * 2.4
        r = 6 + (i * 3) % 7
        x, y = cx + math.cos(a) * r, cy + math.sin(a) * r * 0.6
        c.px(x, y, ramp[4])
        c.px(x + 1, y, ramp[3])
        c.px(x - 1, y, ramp[3])
        c.px(x, y + 1, ramp[3])
        c.px(x, y - 1, ramp[3])


# ------------------------------------------------------------- artillery
def mortar(c, cx, by, s, recoil=0, ramp=None, flash=0):
    ramp = ramp or P['metal']
    dark = [hx('#1e2230'), hx('#363e52'), hx('#58647e'), hx('#8a98b0')]
    by = by + recoil
    # carriage
    c.rect(int(cx - 5 * s), int(by - 2 * s), int(10 * s), int(3 * s), P['wood'][1])
    c.hline(int(cx - 5 * s), int(cx + 5 * s) - 1, int(by - 2 * s), P['wood'][3])
    # barrel: angled up-right
    for i in range(int(10 * s)):
        t = i / (10 * s)
        x = cx - 1 * s + t * 5 * s
        y = by - 3 * s - t * 9 * s * (1 - recoil * 0.06)
        r = (3.6 - t * 0.6) * s
        c.sphere(x, y, r, r * 0.9, dark if t < 0.3 else ramp)
    mx = cx + 4 * s
    my = by - 3 * s - 9 * s * (1 - recoil * 0.06)
    c.ellipse(mx, my, 3.2 * s, 1.6 * s, dark[1])
    c.ellipse(mx, my + 0.3, 2.2 * s, 1.0 * s, hx('#0a0a10'))
    # bands
    c.sphere(cx - 1 * s, by - 3 * s, 4 * s, 3 * s, dark)
    c.px(cx - 2 * s, by - 4 * s, ramp[3])
    if flash:
        for r, col in ((5 * s * flash, P['fire'][2]), (3.4 * s * flash, P['fire'][3]), (1.8 * s * flash, P['fire'][4])):
            c.ellipse(mx + 1, my - 3 * s * flash, r, r * 0.9, col)
    return mx, my


def artillery_tower(level, recoil=0, flash=0, smoke=0, phase=0):
    c = new()
    ground_shadow(c, CX, GY + 1, 21, 6.5)
    if level == 1:
        wood_cyl(c, CX, 42, GY + 1, 16, P['wood'], ry=6.5, nlogs=11, bands=(46, 52))
        ellipse_top(c, CX, 41, 16, 6.5, P['dirt'][1:])
        base_stones(c, CX, 41, 13, 4.5, P['stonew'])
        cy_ = 41
        s = 1.0
        for i in range(3):
            c.sphere(CX - 9 + i * 2.6, cy_ + 3 - (i % 2), 1.6, 1.6, [hx('#1e2230'), hx('#363e52'), hx('#58647e'), hx('#8a98b0')])
        flag(c, CX + 13, 38, phase, P['red'], pole=8)
    elif level == 2:
        stone_cyl(c, CX, 38, GY + 1, 16, P['stonew'], ry=6.5, bh=4, nb=9)
        ellipse_top(c, CX, 37, 17, 7, P['stonew'])
        cy_ = 37
        s = 1.2
        for i in range(4):
            c.sphere(CX - 12 + i * 2.6, cy_ + 3 - (i % 2), 1.7, 1.7, [hx('#1e2230'), hx('#363e52'), hx('#58647e'), hx('#8a98b0')])
        flag(c, CX + 14, 34, phase, P['red'], pole=9, emblem=P['gold'][3])
    else:
        stone_cyl(c, CX, 33, GY + 1, 17, P['stone'], ry=7, bh=4, nb=10)
        for x in range(CX - 17, CX + 18):
            dx = (x + 0.5 - CX) / 17
            if abs(dx) <= 1:
                e = 17 * 0.42 * math.sqrt(1 - dx * dx)
                c.px(x, int(round(42 + e)), P['gold'][1 if dx > 0.3 else 2])
        ellipse_top(c, CX, 32, 18, 7.5, P['stone'])
        cy_ = 32
        s = 1.45
        banner(c, CX - 12, 44, 5, 9, P['red'], emblem=P['gold'][3])
        banner(c, CX + 7, 44, 5, 9, P['red'], emblem=P['gold'][3])
        for i in range(4):
            c.sphere(CX - 13 + i * 2.6, cy_ + 3 - (i % 2), 1.8, 1.8, [hx('#1e2230'), hx('#363e52'), hx('#58647e'), hx('#8a98b0')])
        flag(c, CX + 15, 28, phase, P['red'], pole=10, emblem=P['gold'][3])
    if level >= 2:
        merlons(c, CX, cy_, 17 if level == 2 else 18, 7 if level == 2 else 7.5, P['stonew'] if level == 2 else P['stone'], h=3, n=9, front=False, w=4)
    mx, my = mortar(c, CX, cy_ + 2, s, recoil=recoil, flash=flash)
    if level >= 2:
        merlons(c, CX, cy_, 17 if level == 2 else 18, 7 if level == 2 else 7.5, P['stonew'] if level == 2 else P['stone'], h=3, n=9, front=True, w=4)
    finish(c)
    if smoke:
        for i in range(3):
            r = (1.5 + smoke * 3) * (1 - i * 0.2) * s
            sx = mx + 1 + i * 2 - smoke * 2
            sy = my - 4 * s - smoke * 10 - i * 3
            S = Canvas(W, H)
            S.sphere(sx, sy, r, r, P['smoke'])
            if smoke > 0.6:
                S.dissolve((smoke - 0.6) * 2.2)
            c.over(S)
    return c, (mx, my)


# --------------------------------------------------------------- barracks
def barracks(level, phase, door=0.0):
    c = new()
    ground_shadow(c, CX, GY + 1, 22, 7)
    if level == 1:
        # palisade ring (back), hut, palisade front
        wood_cyl(c, CX, 42, GY + 1, 18, P['wood'], ry=7, nlogs=16, spikes=3)
        # hut walls
        plank_box(c, CX - 9, 32, 18, 16, P['woodl'])
        # straw roof
        c.poly([(CX - 12, 33), (CX + 12, 33), (CX + 6, 22), (CX - 6, 22)], P['gold'][1])
        for i in range(0, 24, 3):
            c.line(CX - 12 + i, 33, CX - 6 + i * 0.5, 22, P['gold'][2])
        c.hline(CX - 12, CX + 11, 33, P['gold'][0])
        c.hline(CX - 6, CX + 5, 22, P['gold'][3])
        arch_door(c, CX, 48, 6, 8, door, P['wood'], P['wood'])
        flag(c, CX + 7, 22, phase, P['red'], pole=8)
        # low front fence
        for x in range(CX - 16, CX + 17, 3):
            if abs(x - CX) > 4:
                c.rect(x, 50, 2, 6 - (abs(x - CX) // 6), P['wood'][2])
                c.px(x, 49, P['wood'][3])
    elif level == 2:
        stone_cyl(c, CX, 46, GY + 1, 19, P['stonew'], ry=7.5, bh=3, nb=12)
        # house
        for x in range(CX - 11, CX + 11):
            for y in range(29, 49):
                u = (x - (CX - 11)) / 22
                k = 2 if u < 0.6 else 1
                if (y - 29) % 4 == 0 or ((x + (((y - 29) // 4) % 2) * 3) % 6 == 0):
                    k = 0
                c.px(x, y, P['stonew'][k + 1])
        c.hline(CX - 11, CX + 10, 48, P['stonew'][0])
        roof(c, CX, 30, 13, 9, P['roof_r'])
        arch_door(c, CX, 49, 8, 10, door, P['wood'], P['stone'])
        window(c, CX - 8, 35, 2, 3, glow=hx('#ffd27a'))
        window(c, CX + 6, 35, 2, 3, glow=hx('#ffd27a'))
        flag(c, CX, 19, phase, P['red'], pole=7, emblem=P['gold'][3])
    else:
        stone_cyl(c, CX, 44, GY + 1, 20, P['stone'], ry=8, bh=3, nb=12)
        # keep body
        for x in range(CX - 13, CX + 13):
            for y in range(24, 48):
                u = (x - (CX - 13)) / 26
                k = 2 if u < 0.55 else 1
                if (y - 24) % 4 == 0 or ((x + (((y - 24) // 4) % 2) * 3) % 6 == 0):
                    k = 0
                c.px(x, y, P['stone'][k + 1])
        c.hline(CX - 13, CX + 12, 47, P['stone'][0])
        # crenels on keep
        for x in range(CX - 13, CX + 13, 4):
            c.rect(x, 21, 3, 3, P['stone'][3 if x < CX else 2])
            c.px(x + 2, 22, P['stone'][1])
        c.hline(CX - 13, CX + 12, 24, P['gold'][2])
        # side turrets
        for sx in (CX - 15, CX + 15):
            stone_cyl(c, sx, 26, 50, 5, P['stone'], bh=3, nb=4)
            cone_roof(c, sx, 26, 6.5, 11, P['roof_r'], rows=3, ncol=4)
        arch_door(c, CX, 49, 10, 12, door, P['wood'], P['gold'])
        banner(c, CX - 10, 28, 5, 10, P['red'], emblem=P['gold'][3])
        banner(c, CX + 5, 28, 5, 10, P['red'], emblem=P['gold'][3])
        flag(c, CX, 14, phase, P['red'], pole=7, emblem=P['gold'][3])
    finish(c)
    return c


def roof(c, cx, base, hw, h, ramp):
    """Gabled roof viewed from the front-top."""
    for y in range(base - h, base + 2):
        f = (y - (base - h)) / (h + 2)
        w = hw * (0.55 + 0.45 * f)
        for x in range(int(cx - w), int(cx + w)):
            u = (x - (cx - w)) / (2 * w)
            row = (y - (base - h)) // 2
            k = 2 if u < 0.5 else 1
            if (x + row) % 3 == 0:
                k = max(0, k - 1)
            if y == base + 1:
                k = 0
            c.px(x, y, ramp[k + 1] if y < base + 1 else ramp[0])
    c.hline(int(cx - hw * 0.55), int(cx + hw * 0.55) - 1, base - h, ramp[3])


# ------------------------------------------------------------ build plot
def build_plot(hover=False, t=0):
    c = new()
    ground_shadow(c, CX, GY - 2, 21, 8)
    for y in range(GY - 12, GY + 6):
        for x in range(CX - 21, CX + 22):
            dx = (x + 0.5 - CX) / 19
            dy = (y + 0.5 - (GY - 3)) / 7.5
            d = dx * dx + dy * dy
            if d <= 1:
                k = 2 if d < 0.5 else 1
                if (hsh(x, y, 3) % 11) == 0:
                    k = 3
                c.px(x, y, P['dirt'][k])
    n = 14
    for i in range(n):
        a = math.pi * 2 * i / n
        x = CX + 19 * math.cos(a)
        y = GY - 3 + 7.5 * math.sin(a)
        ramp = P['stonew'] if not hover else P['gold']
        c.sphere(x, y, 2.6, 1.8, ramp)
    # sign post
    c.vline(CX + 9, GY - 16, GY - 4, P['wood'][1])
    c.vline(CX + 10, GY - 16, GY - 4, P['wood'][2])
    c.rect(CX + 4, GY - 19, 12, 6, P['woodl'][2])
    c.hline(CX + 4, CX + 15, GY - 19, P['woodl'][3])
    c.hline(CX + 4, CX + 15, GY - 14, P['woodl'][0])
    # hammer icon on sign
    c.line(CX + 7, GY - 15, CX + 11, GY - 18, P['wood'][0])
    c.rect(CX + 10, GY - 19, 3, 2, P['metal'][1])
    finish(c)
    if hover:
        k = 0.5 + 0.5 * math.sin(t)
        for i in range(n * 2):
            a = math.pi * 2 * i / (n * 2) + t * 0.3
            x = CX + 21 * math.cos(a)
            y = GY - 3 + 9 * math.sin(a)
            if i % 2 == 0:
                c.px(x, y, mix_c(P['gold'][2], WHITE, k))
    return c


def construction(i, n=8):
    c = new()
    ground_shadow(c, CX, GY - 1, 21, 7.5)
    t = (i + 1) / n
    # dirt base
    for y in range(GY - 12, GY + 6):
        for x in range(CX - 21, CX + 22):
            dx = (x + 0.5 - CX) / 18
            dy = (y + 0.5 - (GY - 3)) / 7
            if dx * dx + dy * dy <= 1:
                c.px(x, y, P['dirt'][1 if (hsh(x, y) % 9) else 2])
    # rising stone stub
    hgt = int(4 + t * 10)
    stone_cyl(c, CX, GY - 3 - hgt, GY - 1, 12, P['stonew'], bh=3, nb=7)
    ellipse_top(c, CX, GY - 4 - hgt, 12, 5, P['stonew'])
    # scaffolding
    poles = [CX - 15, CX - 5, CX + 5, CX + 15]
    ph = int(10 + t * 18)
    for px_ in poles:
        c.vline(px_, GY - ph, GY + 1, P['wood'][2])
        c.vline(px_ + 1, GY - ph, GY + 1, P['wood'][1])
    for yy in range(GY - 6, GY - ph, -7):
        c.hline(CX - 16, CX + 16, yy, P['woodl'][2])
        c.hline(CX - 16, CX + 16, yy + 1, P['woodl'][0])
    c.line(CX - 15, GY, CX - 5, GY - ph + 2, P['wood'][2])
    c.line(CX + 15, GY, CX + 5, GY - ph + 2, P['wood'][2])
    # crate & bricks
    c.rect(CX - 20, GY - 1, 5, 4, P['woodl'][2])
    c.hline(CX - 20, CX - 16, GY - 1, P['woodl'][3])
    finish(c)
    # hammer spark
    if i % 2 == 0:
        sx, sy = CX + 6 - (i % 4) * 3, GY - ph + 4
        for dx_, dy_ in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1), (2, -2), (-2, -2)):
            c.px(sx + dx_, sy + dy_, P['gold'][3] if (dx_, dy_) == (0, 0) else P['fire'][3])
    # dust puffs
    for k in range(3):
        a = (i * 0.9 + k * 2.1)
        r = 2.5 + ((i + k) % 3)
        x = CX - 14 + k * 14 + math.sin(a) * 2
        y = GY + 1 - ((i + k * 2) % 4)
        S = Canvas(W, H)
        S.sphere(x, y, r, r * 0.8, P['sand'])
        S.dissolve(0.15 + 0.15 * ((i + k) % 3))
        c.over(S)
    return c


# =========================================================== tower units
def archer_unit(pose, view='side', frame=0):
    """16x16 upper-body archer (stands behind parapet). Anchor (8,14)."""
    c = Canvas(16, 16)
    hood, body, skin = P['cloth_g'], P['cloth_g'], P['skin']
    bow = P['wood']
    breathe = 1 if (pose == 'idle' and frame >= 2) else 0
    if view == 'side':
        L = Canvas(16, 16)
        L.sphere(7, 11 + breathe, 3.2, 3.6, body)
        L.hline(4, 9, 13, P['leather'][1])
        # quiver
        L.rect(3, 6 + breathe, 2, 6, P['leather'][2])
        L.px(3, 5 + breathe, P['woodl'][3])
        L.px(4, 4 + breathe, P['red'][3])
        L.outline()
        c.over(L)
        L = Canvas(16, 16)
        L.sphere(8, 6 + breathe, 2.8, 2.6, skin)
        L.sphere(7.5, 5 + breathe, 3.0, 2.4, hood)
        L.px(6, 3 + breathe, hood[1])
        L.px(9, 6 + breathe, OUT)
        L.outline()
        c.over(L)
        # bow + arms
        draw = {'idle': 0, 'draw': 2, 'hold': 3, 'release': 0, 'recover': 0}[pose]
        L = Canvas(16, 16)
        bx = 12
        by = 9 + breathe
        for yy in range(-4, 5):
            xx = bx + (0 if abs(yy) < 2 else (-1 if abs(yy) < 4 else -2))
            L.px(xx, by + yy, bow[2] if yy < 0 else bow[1])
        sx = bx - 2 - draw
        L.line(bx - 2, by - 4, sx, by, hx('#e8e0d0'))
        L.line(sx, by, bx - 2, by + 4, hx('#e8e0d0'))
        if pose in ('draw', 'hold'):
            L.line(sx, by, bx + 2, by, P['woodl'][3])
            L.px(bx + 3, by, P['metal'][3])
        L.thick(8, 9 + breathe, bx - 0.5, by, 1.8, body[2])
        L.thick(8, 10 + breathe, sx, by + 0.5, 1.8, body[1])
        L.px(bx, by, skin[2])
        L.outline()
        c.over(L)
        if pose == 'release':
            c.px(14, 9, WHITE)
            c.px(15, 8, WHITE)
    else:
        front = view == 'down'
        L = Canvas(16, 16)
        L.sphere(8, 11 + breathe, 3.6, 3.4, body)
        L.hline(5, 11, 13, P['leather'][1])
        if not front:
            L.rect(9, 6 + breathe, 2, 6, P['leather'][2])
            L.px(9, 5 + breathe, P['red'][3])
        L.outline()
        c.over(L)
        L = Canvas(16, 16)
        L.sphere(8, 6 + breathe, 2.9, 2.7, skin if front else hood)
        L.sphere(8, 5 + breathe, 3.1, 2.3, hood)
        if front:
            L.px(7, 6 + breathe, OUT)
            L.px(9, 6 + breathe, OUT)
        L.outline()
        c.over(L)
        draw = {'idle': 0, 'draw': 2, 'hold': 3, 'release': 0, 'recover': 0}[pose]
        L = Canvas(16, 16)
        by = 10 + breathe + (1 if front else -1)
        L.hline(3, 12, by + (1 if front else 0), bow[2])
        L.px(2, by + 1, bow[1])
        L.px(13, by + 1, bow[1])
        if pose in ('draw', 'hold'):
            L.vline(8, by - draw, by + 2, hx('#e8e0d0'))
        L.thick(5, 10 + breathe, 6, by, 1.6, body[2])
        L.thick(11, 10 + breathe, 10, by, 1.6, body[2])
        L.outline()
        c.over(L)
        if pose == 'release':
            c.px(8, 15 if front else 1, WHITE)
    return c


def mage_unit(pose, frame=0, view='side'):
    c = Canvas(16, 20)
    robe, skin = P['purple'], P['skin']
    breathe = 1 if (pose == 'idle' and frame >= 2) else 0
    glow = 0.0
    raise_ = 0
    if pose == 'cast':
        glow = [0.2, 0.6, 1.2, 1.8, 0.8, 0.2][frame]
        raise_ = [0, 2, 4, 5, 2, 0][frame]
    L = Canvas(16, 20)
    L.sphere(7.5, 15 + breathe, 3.6, 3.8, robe)
    L.hline(5, 10, 16 + breathe, P['gold'][2])
    L.outline()
    c.over(L)
    L = Canvas(16, 20)
    hx_, hy_ = 8, 10 + breathe
    L.sphere(hx_, hy_, 2.6, 2.4, skin)
    # beard
    L.poly([(hx_ - 1, hy_ + 1), (hx_ + 3, hy_ + 1), (hx_ + 1, hy_ + 5)], P['bone'][3])
    L.px(hx_ + 1, hy_ - 0.5, OUT)
    # hat
    L.ellipse(hx_, hy_ - 2, 4.5, 1.3, robe[1])
    L.poly([(hx_ - 3, hy_ - 2), (hx_ + 3, hy_ - 2), (hx_ - 2.5, hy_ - 9)], robe[2])
    L.px(hx_ - 2, hy_ - 5, P['gold'][3])
    L.outline()
    c.over(L)
    L = Canvas(16, 20)
    sx, sy = 12, 14 + breathe - raise_
    L.line(sx, sy + 6, sx, sy - 5, P['wood'][2])
    L.thick(8, 13 + breathe, sx, sy, 1.8, robe[2])
    L.px(sx, sy, skin[2])
    r = 1.6 + glow * 0.8
    L.sphere(sx, sy - 6, r, r, P['magic'])
    L.px(sx - 1, sy - 7, WHITE)
    L.outline()
    c.over(L)
    if glow > 1.0:
        for a in range(0, 360, 45):
            x = sx + math.cos(math.radians(a)) * (r + 2)
            y = sy - 6 + math.sin(math.radians(a)) * (r + 2)
            c.px(x, y, P['magic'][4] if a % 90 == 0 else P['magic'][3])
    return c
