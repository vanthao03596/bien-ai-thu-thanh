"""UI: icons, buttons, panels, bars, build-menu, font."""
import math

from px import Canvas, P, OUT, WHITE, hx, darken, lighten, Sheet

D2R = math.pi / 180


def icon(name):
    c = Canvas(16, 16)
    g, r, m, w = P['gold'], P['red'], P['metal'], P['wood']
    if name == 'heart':
        c.sphere(5.5, 6, 3.6, 3.4, r)
        c.sphere(10.5, 6, 3.6, 3.4, r)
        c.poly([(2, 7), (14, 7), (8, 14)], r[2])
        c.poly([(9, 7), (14, 7), (8, 14), (8, 9)], r[1])
        c.px(4, 4, WHITE)
        c.px(5, 4, r[3])
    elif name == 'coin':
        c.sphere(8, 8, 5.5, 5.5, g)
        c.ring(8, 8, 3.8, 3.8, g[1])
        c.vline(7, 5, 10, g[3])
        c.px(5, 4, WHITE)
    elif name == 'skull':
        b = P['bone']
        c.sphere(8, 7, 5.5, 5, b)
        c.rect(5, 10, 6, 3, b[2])
        c.rect(5, 6, 2, 3, OUT)
        c.rect(9, 6, 2, 3, OUT)
        c.px(8, 9, OUT)
        for x in (6, 8, 10):
            c.px(x, 12, b[0])
    elif name in ('star', 'star_empty'):
        pts = []
        for k in range(10):
            a = (-90 + k * 36) * D2R
            rr = 6.8 if k % 2 == 0 else 3.0
            pts.append((8 + math.cos(a) * rr, 8.5 + math.sin(a) * rr))
        if name == 'star':
            c.poly(pts, g[2])
            c.poly([(8, 2), (8, 8.5), (2, 6.5)], g[3])
            c.px(7, 5, WHITE)
        else:
            c.poly(pts, hx('#4a4458'))
            c.poly([(8, 2), (8, 8.5), (2, 6.5)], hx('#5e586e'))
    elif name == 'hourglass':
        c.rect(3, 2, 10, 2, w[2])
        c.rect(3, 12, 10, 2, w[2])
        c.poly([(4, 4), (12, 4), (8, 8)], hx('#cfe8ff'))
        c.poly([(4, 12), (12, 12), (8, 8)], hx('#cfe8ff'))
        c.poly([(6, 12), (10, 12), (8, 9)], P['sand'][2])
        c.poly([(5, 4), (11, 4), (8, 7)], P['sand'][2])
    elif name == 'sword':
        c.line(3, 13, 12, 4, m[2], w=1)
        c.line(4, 13, 13, 4, m[3])
        c.line(2, 10, 6, 14, g[2])
        c.line(1, 15, 3, 13, w[1])
        c.px(13, 3, WHITE)
    elif name == 'shield':
        pts = [(3, 2), (13, 2), (13, 8), (8, 14), (3, 8)]
        c.poly(pts, g[1])
        c.poly([(4, 3), (12, 3), (12, 8), (8, 12.5), (4, 8)], P['blue'][2])
        c.poly([(4, 3), (8, 3), (8, 12.5), (4, 8)], P['blue'][3])
        c.vline(8, 3, 12, g[2])
        c.hline(4, 12, 6, g[2])
    elif name == 'bow':
        for y in range(2, 15):
            dx = math.sqrt(max(0, 1 - ((y - 8) / 6.5) ** 2)) * 5
            c.px(4 + dx, y, w[2])
        c.vline(4, 2, 14, hx('#e8e0d0'))
        c.line(3, 8, 13, 8, P['woodl'][3])
        c.px(13, 8, m[3])
        c.px(14, 8, m[2])
    elif name == 'magic':
        c.line(3, 14, 10, 7, w[2])
        c.sphere(11, 5, 3.4, 3.4, P['magic'])
        c.px(10, 4, WHITE)
        for a in (0, 90, 180, 270):
            c.px(11 + math.cos(a * D2R) * 5, 5 + math.sin(a * D2R) * 5, P['magic'][4])
    elif name == 'bomb':
        c.sphere(7, 9, 5, 5, [hx('#14141c'), hx('#262834'), hx('#40445a'), hx('#6a7090')])
        c.line(10, 5, 12, 2, P['woodl'][2])
        c.px(13, 1, P['fire'][4])
        c.px(12, 1, P['fire'][3])
        c.px(13, 2, P['fire'][3])
        c.px(5, 7, WHITE)
    elif name == 'gear':
        for k in range(8):
            a = k * 45 * D2R
            c.disc(8 + math.cos(a) * 5.2, 8 + math.sin(a) * 5.2, 1.6, m[2])
        c.sphere(8, 8, 5, 5, m)
        c.disc(8, 8, 2, hx('#2a2a38'))
    elif name == 'lock':
        c.ring(8, 6, 3.6, 4, m[2], t=1.4)
        c.rect(3, 7, 10, 7, g[2])
        c.rect(3, 7, 10, 1, g[3])
        c.rect(7, 9, 2, 3, OUT)
    elif name == 'check':
        c.line(3, 8, 6, 12, P['green_fx'][2], w=2)
        c.line(6, 12, 13, 4, P['green_fx'][2], w=2)
        c.line(6, 11, 12, 4, P['green_fx'][3])
    elif name == 'close':
        c.line(4, 4, 12, 12, r[2], w=2)
        c.line(12, 4, 4, 12, r[2], w=2)
    elif name == 'upgrade':
        c.poly([(8, 2), (14, 8), (10, 8), (10, 14), (6, 14), (6, 8), (2, 8)], P['green_fx'][2])
        c.poly([(8, 2), (8, 14), (6, 14), (6, 8), (2, 8)], P['green_fx'][3])
    elif name == 'sell':
        c.sphere(8, 9, 5, 5, g)
        c.vline(7, 6, 11, g[3])
        c.poly([(11, 1), (15, 1), (15, 5)], r[2])
        c.line(10, 6, 14, 2, r[2], w=2)
    elif name == 'rally':
        c.vline(4, 2, 14, w[2])
        c.poly([(5, 2), (13, 4), (5, 7)], P['blue'][2])
        c.ellipse(5, 14, 3, 1, OUT)
    elif name == 'pause':
        c.rect(4, 3, 3, 10, WHITE)
        c.rect(9, 3, 3, 10, WHITE)
    elif name == 'play':
        c.poly([(5, 3), (13, 8), (5, 13)], WHITE)
    elif name == 'fast':
        c.poly([(2, 3), (8, 8), (2, 13)], WHITE)
        c.poly([(8, 3), (14, 8), (8, 13)], WHITE)
    elif name == 'info':
        c.sphere(8, 8, 6, 6, P['blue'])
        c.rect(7, 7, 2, 5, WHITE)
        c.rect(7, 4, 2, 2, WHITE)
    elif name == 'wave':
        c.vline(3, 2, 14, w[2])
        c.poly([(4, 2), (13, 3), (11, 6), (13, 9), (4, 9)], r[2])
        c.px(7, 5, P['bone'][3])
        c.px(9, 5, P['bone'][3])
    elif name == 'lightning':
        c.poly([(9, 1), (3, 9), (8, 9), (6, 15), (13, 6), (8, 6), (11, 1)], g[3])
    elif name == 'fire':
        from fx import flame
        f = flame(0, 6, (16, 24))
        c.blit(f, 0, -7)
    elif name == 'hero':
        c.sphere(8, 9, 5.5, 5.5, P['metal'])
        c.rect(3, 9, 10, 2, hx('#1a1020'))
        c.thick(8, 3, 8, 0, 2, P['blue'][2])
    c.outline()
    return c


ICONS = ['heart', 'coin', 'skull', 'star', 'star_empty', 'hourglass', 'sword', 'shield', 'bow', 'magic', 'bomb',
         'gear', 'lock', 'check', 'close', 'upgrade', 'sell', 'rally', 'pause', 'play', 'fast', 'info', 'wave',
         'lightning', 'fire', 'hero']


def round_button(state='normal', ramp=None, size=32):
    c = Canvas(size, size)
    ramp = ramp or P['wood']
    r = size / 2 - 2
    cx = cy = size / 2
    off = 1 if state == 'pressed' else 0
    if state == 'disabled':
        ramp = [hx('#2e2c36'), hx('#4a4856'), hx('#6a6878'), hx('#8a8898')]
    c.ellipse(cx, cy + 1.5, r, r, darken(ramp[0], 0.8))
    c.sphere(cx, cy + off, r, r, P['gold'] if state != 'disabled' else ramp)
    c.sphere(cx, cy + off, r - 2, r - 2, ramp)
    c.outline()
    return c


def button_with_icon(name, state='normal', ramp=None):
    c = round_button(state, ramp)
    ic = icon(name)
    if state == 'disabled':
        ic.tint(hx('#6a6878'), 0.7)
    c.blit(ic, 8, 8 + (1 if state == 'pressed' else 0))
    return c


def rect_button(w=64, h=20, state='normal', ramp=None):
    c = Canvas(w, h)
    ramp = ramp or P['green_fx']
    if state == 'disabled':
        ramp = [hx('#2e2c36'), hx('#4a4856'), hx('#6a6878'), hx('#8a8898')]
    off = 1 if state == 'pressed' else 0
    c.rect(1, 3, w - 2, h - 4, darken(ramp[0], 0.8))
    for y in range(1 + off, h - 3 + off):
        for x in range(1, w - 1):
            v = (y - 1 - off) / (h - 4)
            k = 3 if v < 0.2 else (2 if v < 0.65 else 1)
            c.px(x, y, ramp[k])
    for (x, y) in ((1, 1 + off), (w - 2, 1 + off), (1, h - 4 + off), (w - 2, h - 4 + off)):
        c.px(x, y, None)
    c.outline()
    return c


def panel(kind='wood', size=48, corner=16):
    c = Canvas(size, size)
    if kind == 'wood':
        frame, fill = P['wood'], P['woodl']
    elif kind == 'stone':
        frame, fill = P['stone'], [hx('#2a2c3a'), hx('#34374a'), hx('#3e4258'), hx('#4a4f66')]
    else:  # parchment
        frame, fill = P['wood'], [hx('#b89a6a'), hx('#d4bb88'), hx('#e8d4a6'), hx('#f4e6c2')]
    c.rect(0, 0, size, size, frame[1])
    for y in range(size):
        for x in range(size):
            if x < 1 or y < 1 or x >= size - 1 or y >= size - 1:
                c.px(x, y, OUT)
            elif x < 4 or y < 4 or x >= size - 4 or y >= size - 4:
                k = 2 if (x < 4 or y < 4) else 1
                if x == 1 or y == 1:
                    k = 3
                c.px(x, y, frame[k])
            else:
                if kind == 'wood':
                    k = 2 if (y - 4) % 5 else 1
                    if (y - 4) % 5 == 1:
                        k = 3
                elif kind == 'stone':
                    k = 2 if ((y // 6) + (x // 9)) % 2 else 1
                else:
                    k = 2
                c.px(x, y, fill[k])
    # gold corner rivets
    for (x, y) in ((5, 5), (size - 6, 5), (5, size - 6), (size - 6, size - 6)):
        c.disc(x + 0.5, y + 0.5, 1.6, P['gold'][2])
        c.px(x, y, P['gold'][3])
    return c


def bar_frame(w=20, h=5):
    c = Canvas(w, h)
    c.rect(0, 0, w, h, OUT)
    c.rect(1, 1, w - 2, h - 2, hx('#3a1a1e'))
    return c


def bar_fill(w=18, h=3, ramp=None):
    c = Canvas(w, h)
    ramp = ramp or P['green_fx']
    c.rect(0, 0, w, h, ramp[2])
    c.hline(0, w - 1, 0, ramp[3])
    if h > 2:
        c.hline(0, w - 1, h - 1, ramp[1])
    return c


def boss_bar(w=96, h=12):
    c = Canvas(w, h)
    c.rect(0, 0, w, h, OUT)
    c.rect(1, 1, w - 2, h - 2, P['metal'][1])
    c.rect(3, 3, w - 6, h - 6, hx('#2a0e14'))
    c.hline(1, w - 2, 1, P['metal'][3])
    for x in (0, w - 1):
        c.vline(x, 2, h - 3, P['gold'][2])
    icon_ = icon('skull')
    big = Canvas(w + 8, h + 8)
    big.blit(c, 4, 4)
    big.blit(icon_, 0, 0)
    return big


def build_slot(tower, locked=False, price=True):
    """Circle portrait used in the build ring menu (36x40 incl. price tag)."""
    from towers import archer_tower, mage_tower, artillery_tower, barracks
    c = Canvas(36, 44)
    ring = P['gold'] if not locked else [hx('#2e2c36'), hx('#4a4856'), hx('#6a6878'), hx('#8a8898')]
    c.sphere(18, 18, 16, 16, ring)
    c.ellipse(18, 18, 13.5, 13.5, hx('#26324a') if not locked else hx('#26262e'))
    fn = {'archer': lambda: archer_tower(1, 0.4)[0], 'mage': lambda: mage_tower(1, 0.4)[0],
          'artillery': lambda: artillery_tower(1)[0], 'barracks': lambda: barracks(1, 0.4)}[tower]
    t = fn()
    from PIL import Image
    im = t.img().crop((10, 10, 54, 62)).resize((22, 26), Image.NEAREST)
    import numpy as np
    small = Canvas(22, 26)
    small.a = np.array(im)
    # mask to circle
    for y in range(26):
        for x in range(22):
            dx, dy = x + 7 - 18 + 0.5, y + 4 - 18 + 0.5
            if dx * dx + dy * dy > 13.0 ** 2:
                small.a[y, x] = 0
    if locked:
        small.tint(hx('#3a3a48'), 0.75)
    c.blit(small, 7, 4)
    if locked:
        c.blit(icon('lock'), 10, 10)
    c.outline()
    if price:
        c.rect(7, 33, 22, 9, P['wood'][2])
        c.hline(7, 28, 33, P['wood'][3])
        c.rect(6, 34, 1, 7, OUT)
        c.rect(29, 34, 1, 7, OUT)
        c.hline(7, 28, 42, OUT)
        c.hline(7, 28, 32, OUT)
        c.sphere(11, 37.5, 2.6, 2.6, P['gold'])
    return c


def wave_button(i, n=4):
    c = Canvas(32, 32)
    pulse = 0.5 + 0.5 * math.sin(i / n * 2 * math.pi)
    rr = 13 + pulse * 1.5
    c.ellipse(16, 16, rr + 1.5, rr + 1.5, (200, 40, 40, int(70 + 80 * pulse)))
    c.sphere(16, 16, 12, 12, P['red'])
    c.sphere(16, 16, 10, 10, P['dark'])
    sk = icon('skull')
    c.blit(sk, 8, 8)
    c.outline()
    return c


def rally_flag(i, n=4):
    c = Canvas(16, 20)
    c.ellipse(5, 18, 4, 1.4, (10, 16, 8, 90))
    c.vline(4, 3, 18, P['wood'][2])
    for k in range(8):
        dy = math.sin(i / n * 2 * math.pi + k * 0.8) * (k * 0.15)
        for j in range(5):
            c.px(5 + k, 3 + j + dy, P['blue'][2] if j < 3 else P['blue'][1])
    c.px(4, 2, P['gold'][3])
    c.outline()
    return c


def range_circle(rx=64, ry=40, ok=True):
    c = Canvas(rx * 2 + 4, ry * 2 + 4)
    col = (255, 240, 160, 220) if ok else (255, 90, 80, 220)
    fill = (255, 240, 160, 36) if ok else (255, 90, 80, 36)
    cx, cy = rx + 2, ry + 2
    c.ellipse(cx, cy, rx, ry, fill)
    n = 72
    for k in range(n):
        if k % 2 == 0:
            a = k / n * 2 * math.pi
            c.px(cx + math.cos(a) * rx, cy + math.sin(a) * ry, col)
            c.px(cx + math.cos(a) * rx + 1, cy + math.sin(a) * ry, col)
    return c


def cursor(kind='point'):
    c = Canvas(16, 16)
    pts = [(1, 1), (1, 12), (4, 9), (7, 14), (9, 13), (6, 8), (10, 8)]
    c.poly(pts, P['metal'][3] if kind == 'point' else P['gold'][3])
    c.poly([(2, 3), (2, 10), (4, 8)], WHITE)
    c.outline()
    return c


# ------------------------------------------------------------- font
FONT = {
    '0': ['0110', '1001', '1011', '1101', '1001', '1001', '0110'],
    '1': ['0010', '0110', '0010', '0010', '0010', '0010', '0111'],
    '2': ['0110', '1001', '0001', '0010', '0100', '1000', '1111'],
    '3': ['1110', '0001', '0001', '0110', '0001', '0001', '1110'],
    '4': ['0011', '0101', '1001', '1111', '0001', '0001', '0001'],
    '5': ['1111', '1000', '1110', '0001', '0001', '1001', '0110'],
    '6': ['0110', '1000', '1000', '1110', '1001', '1001', '0110'],
    '7': ['1111', '0001', '0010', '0010', '0100', '0100', '0100'],
    '8': ['0110', '1001', '1001', '0110', '1001', '1001', '0110'],
    '9': ['0110', '1001', '1001', '0111', '0001', '0001', '0110'],
    '+': ['0000', '0000', '0100', '1110', '0100', '0000', '0000'],
    '-': ['0000', '0000', '0000', '1111', '0000', '0000', '0000'],
    '/': ['0001', '0001', '0010', '0010', '0100', '0100', '1000'],
    'x': ['0000', '0000', '1001', '0110', '0110', '1001', '0000'],
    ':': ['0000', '0100', '0100', '0000', '0100', '0100', '0000'],
    '%': ['1001', '1001', '0010', '0100', '1000', '1001', '1001'],
    '$': ['0100', '1111', '1100', '0110', '0011', '1111', '0010'],
}


def font_sheet(color=WHITE, shade=None):
    shade = shade or hx('#c8b88a')
    chars = list(FONT.keys())
    gw, gh = 7, 10
    c = Canvas(gw * len(chars), gh)
    for i, ch in enumerate(chars):
        g = Canvas(gw, gh)
        for y, row in enumerate(FONT[ch]):
            for x, bit in enumerate(row):
                if bit == '1':
                    g.px(x + 1, y + 1, color if y < 4 else shade)
        g.outline(OUT, diag=False)
        # drop shadow
        sh = Canvas(gw, gh)
        for y in range(gh - 1):
            for x in range(gw):
                if g.a[y, x, 3] > 0:
                    sh.px(x, y + 1, OUT)
        sh.over(g)
        c.blit(sh, i * gw, 0)
    return c, chars, gw, gh
