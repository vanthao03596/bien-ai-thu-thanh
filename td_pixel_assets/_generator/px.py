"""Tiny pixel-art drawing toolkit used to generate the asset pack."""
import json
import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw


def hx(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def R(*hexes):
    return [hx(h) for h in hexes]


# ---------------------------------------------------------------- palette
OUT = hx('#1d1322')
WHITE = hx('#ffffff')
BLACK = hx('#000000')

P = {
    'skin':    R('#7a3f30', '#b86e50', '#e4a47a', '#f6cfa4'),
    'goblin':  R('#24401a', '#3f6e26', '#64a236', '#a0d258'),
    'orc':     R('#28361f', '#465a30', '#678446', '#98b266'),
    'ogre':    R('#3a304a', '#5a5076', '#80749e', '#ada2c8'),
    'demon':   R('#360c14', '#6a1822', '#a42e2e', '#d65a52'),
    'bone':    R('#5e5246', '#9a8c7a', '#d2c6ae', '#f2ead6'),
    'wood':    R('#36200f', '#5e361c', '#88572c', '#b48048'),
    'woodl':   R('#5e3f22', '#8e6234', '#c08f54', '#e4bf86'),
    'stone':   R('#33344a', '#55586e', '#7f839c', '#b0b5ca'),
    'stonew':  R('#433a3c', '#6a5e5a', '#93877c', '#c2b6a4'),
    'metal':   R('#2a303c', '#556078', '#909fb6', '#d8e4f0'),
    'gold':    R('#673f0e', '#a8721a', '#e3b02a', '#fff07a'),
    'red':     R('#45101e', '#861c2a', '#c63838', '#ee7656'),
    'blue':    R('#182250', '#26478a', '#3b77c6', '#78b2ee'),
    'purple':  R('#271240', '#4b2270', '#7b3ca8', '#b676e0'),
    'cloth_g': R('#1b3626', '#2b5a38', '#478644', '#7ebc5e'),
    'leather': R('#352010', '#5a3820', '#865632', '#b07e4e'),
    'fur':     R('#2a2832', '#4a4856', '#757384', '#a9a5b6'),
    'furb':    R('#2e1c14', '#553424', '#80543a', '#ad7e5a'),
    'grass':   R('#2a5222', '#3a722c', '#549834', '#80bc46', '#ade06c'),
    'dirt':    R('#56361f', '#7a5232', '#a47646', '#cb9f66', '#e4c28a'),
    'sand':    R('#8a6a3e', '#b8945a', '#dcbc7e', '#f2dca6'),
    'water':   R('#17345f', '#255492', '#357ebe', '#62b2e4', '#aee2f6'),
    'fire':    R('#5e160a', '#b23810', '#ec7618', '#ffc036', '#fff4a2'),
    'magic':   R('#330a52', '#7228b0', '#ac56ee', '#dca4ff', '#fbf0ff'),
    'arcane':  R('#0e2a4a', '#1e5a9a', '#36a0e0', '#8ae0ff', '#efffff'),
    'smoke':   R('#36323c', '#625e6a', '#9a96a2', '#d2ced8'),
    'leaf':    R('#1c3a1c', '#2c5a24', '#43822e', '#69aa3a', '#98cc52'),
    'pine':    R('#14301e', '#1f4a2a', '#2e6a36', '#468c44'),
    'roof_r':  R('#4a141a', '#7e2224', '#b23a30', '#de6a48'),
    'roof_b':  R('#16244a', '#24407a', '#3866ae', '#6898d6'),
    'roof_p':  R('#26123e', '#44206a', '#6a3496', '#9a5cc6'),
    'dark':    R('#16161e', '#2a2a38', '#44445a', '#6e6e88'),
    'darkred': R('#2a0a12', '#4e1220', '#7a1e2a', '#a83a3a'),
    'blood':   R('#4a0a10', '#8a1418', '#c42a2a'),
    'green_fx': R('#1a4a10', '#3a8a1a', '#7ad030', '#c8f870'),
}


def darken(c, f=0.6):
    return (int(c[0] * f), int(c[1] * f), int(c[2] * f), c[3])


def lighten(c, f=0.4):
    return (int(c[0] + (255 - c[0]) * f), int(c[1] + (255 - c[1]) * f),
            int(c[2] + (255 - c[2]) * f), c[3])


def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(4))


BAYER4 = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0

LIGHT = np.array([-0.55, -0.75, 0.62])
LIGHT = LIGHT / np.linalg.norm(LIGHT)


def ramp_pick(ramp, t):
    t = max(0.0, min(0.999, t))
    return ramp[int(t * len(ramp))]


class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.a = np.zeros((h, w, 4), np.uint8)

    # ----------------------------------------------------------- basics
    def copy(self):
        c = Canvas(self.w, self.h)
        c.a = self.a.copy()
        return c

    def px(self, x, y, c):
        x, y = int(math.floor(x)), int(math.floor(y))
        if 0 <= x < self.w and 0 <= y < self.h:
            if c is None:
                self.a[y, x] = 0
            elif c[3] >= 255:
                self.a[y, x] = c
            elif c[3] > 0:
                src = np.array(c, float)
                dst = self.a[y, x].astype(float)
                al = src[3] / 255.0
                da = dst[3] / 255.0
                oa = al + da * (1 - al)
                rgb = (src[:3] * al + dst[:3] * da * (1 - al)) / max(oa, 1e-6)
                self.a[y, x] = [*rgb.astype(int), int(oa * 255)]

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return tuple(int(v) for v in self.a[y, x])
        return (0, 0, 0, 0)

    def opaque(self, x, y):
        return 0 <= x < self.w and 0 <= y < self.h and self.a[y, x, 3] > 0

    def rect(self, x, y, w, h, c):
        x, y, w, h = int(x), int(y), int(w), int(h)
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.px(xx, yy, c)

    def hline(self, x0, x1, y, c):
        for x in range(int(x0), int(x1) + 1):
            self.px(x, y, c)

    def vline(self, x, y0, y1, c):
        for y in range(int(y0), int(y1) + 1):
            self.px(x, y, c)

    def line(self, x0, y0, x1, y1, c, w=1):
        x0, y0, x1, y1 = int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1))
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        err = dx + dy
        while True:
            if w == 1:
                self.px(x0, y0, c)
            else:
                self.disc(x0 + 0.5, y0 + 0.5, w / 2.0, c)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x0 += sx
            if e2 <= dx:
                err += dx
                y0 += sy

    def disc(self, cx, cy, r, c):
        self.ellipse(cx, cy, r, r, c)

    def ellipse(self, cx, cy, rx, ry, c):
        for y in range(int(math.floor(cy - ry)) - 1, int(math.ceil(cy + ry)) + 1):
            for x in range(int(math.floor(cx - rx)) - 1, int(math.ceil(cx + rx)) + 1):
                dx = (x + 0.5 - cx) / max(rx, 0.01)
                dy = (y + 0.5 - cy) / max(ry, 0.01)
                if dx * dx + dy * dy <= 1.0:
                    self.px(x, y, c)

    def ring(self, cx, cy, rx, ry, c, t=1.0):
        for y in range(int(math.floor(cy - ry)) - 1, int(math.ceil(cy + ry)) + 1):
            for x in range(int(math.floor(cx - rx)) - 1, int(math.ceil(cx + rx)) + 1):
                dx = (x + 0.5 - cx) / max(rx, 0.01)
                dy = (y + 0.5 - cy) / max(ry, 0.01)
                d = dx * dx + dy * dy
                dxi = (x + 0.5 - cx) / max(rx - t, 0.01)
                dyi = (y + 0.5 - cy) / max(ry - t, 0.01)
                if d <= 1.0 and dxi * dxi + dyi * dyi > 1.0:
                    self.px(x, y, c)

    def sphere(self, cx, cy, rx, ry, ramp, light=None, rim=False):
        """Ellipse shaded like a sphere lit from the upper-left."""
        L = LIGHT if light is None else light
        for y in range(int(math.floor(cy - ry)) - 1, int(math.ceil(cy + ry)) + 1):
            for x in range(int(math.floor(cx - rx)) - 1, int(math.ceil(cx + rx)) + 1):
                dx = (x + 0.5 - cx) / max(rx, 0.01)
                dy = (y + 0.5 - cy) / max(ry, 0.01)
                d2 = dx * dx + dy * dy
                if d2 <= 1.0:
                    nz = math.sqrt(max(0.0, 1 - d2))
                    i = dx * L[0] + dy * L[1] + nz * L[2]
                    t = (i + 0.25) / 1.15
                    self.px(x, y, ramp_pick(ramp, t))

    def cyl(self, x, y, w, h, ramp, hl=0.3):
        """Vertical cylinder-like band shading across x."""
        for xx in range(int(x), int(x + w)):
            u = (xx + 0.5 - x) / w  # 0..1
            # brightness peaks at hl
            b = 1 - abs(u - hl) / max(hl, 1 - hl)
            b = b ** 0.8
            col = ramp_pick(ramp, 0.08 + b * 0.92)
            for yy in range(int(y), int(y + h)):
                self.px(xx, yy, col)

    def poly(self, pts, c):
        m = poly_mask(self.w, self.h, pts)
        ys, xs = np.nonzero(m)
        for y, x in zip(ys, xs):
            self.px(x, y, c)

    def poly_shaded(self, pts, ramp, axis='x', hl=0.3):
        m = poly_mask(self.w, self.h, pts)
        ys, xs = np.nonzero(m)
        if len(xs) == 0:
            return
        if axis == 'x':
            lo, hi = xs.min(), xs.max() + 1
            vals = xs
        else:
            lo, hi = ys.min(), ys.max() + 1
            vals = ys
        for y, x, v in zip(ys, xs, vals):
            u = (v + 0.5 - lo) / max(1, hi - lo)
            b = 1 - abs(u - hl) / max(hl, 1 - hl)
            self.px(x, y, ramp_pick(ramp, 0.08 + b * 0.92))

    def thick(self, x0, y0, x1, y1, w, c):
        """Thick line drawn as a capsule."""
        L = math.hypot(x1 - x0, y1 - y0)
        n = max(1, int(L * 2))
        for i in range(n + 1):
            t = i / n
            self.disc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w / 2.0, c)

    def limb(self, x0, y0, x1, y1, w, ramp):
        """Capsule with a 2-tone shading (lit side / shadow side)."""
        self.thick(x0, y0, x1, y1, w, ramp[1])
        if w >= 2:
            off = 0.35 * w
            self.thick(x0 - off * 0.6, y0 - off * 0.2, x1 - off * 0.6, y1 - off * 0.2,
                       max(1, w - 1.5), ramp[2])

    # -------------------------------------------------------- compositing
    def blit(self, other, ox=0, oy=0, flip=False):
        src = other.a[:, ::-1] if flip else other.a
        oh, ow = src.shape[:2]
        for y in range(oh):
            ty = y + oy
            if not (0 <= ty < self.h):
                continue
            for x in range(ow):
                tx = x + ox
                if 0 <= tx < self.w and src[y, x, 3] > 0:
                    if src[y, x, 3] >= 255:
                        self.a[ty, tx] = src[y, x]
                    else:
                        self.px(tx, ty, tuple(int(v) for v in src[y, x]))

    def over(self, other):
        """Fast alpha composite of same-size canvas (binary alpha preferred)."""
        m = other.a[:, :, 3] > 0
        full = other.a[:, :, 3] >= 255
        self.a[full] = other.a[full]
        part = m & ~full
        if part.any():
            ys, xs = np.nonzero(part)
            for y, x in zip(ys, xs):
                self.px(x, y, tuple(int(v) for v in other.a[y, x]))

    def outline(self, c=OUT, diag=False):
        m = self.a[:, :, 3] > 0
        n = np.zeros_like(m)
        n[1:, :] |= m[:-1, :]
        n[:-1, :] |= m[1:, :]
        n[:, 1:] |= m[:, :-1]
        n[:, :-1] |= m[:, 1:]
        if diag:
            n[1:, 1:] |= m[:-1, :-1]
            n[1:, :-1] |= m[:-1, 1:]
            n[:-1, 1:] |= m[1:, :-1]
            n[:-1, :-1] |= m[1:, 1:]
        o = n & ~m
        self.a[o] = c
        return self

    def tint(self, c, t):
        m = self.a[:, :, 3] > 0
        rgb = self.a[:, :, :3].astype(float)
        rgb[m] = rgb[m] * (1 - t) + np.array(c[:3], float) * t
        self.a[:, :, :3] = rgb.astype(np.uint8)
        return self

    def dissolve(self, t, seed=0):
        """Ordered-dither fade: t=0 visible, t=1 gone."""
        h, w = self.h, self.w
        for y in range(h):
            for x in range(w):
                if BAYER4[y % 4, x % 4] < t:
                    self.a[y, x] = 0
        return self

    def shift(self, dx, dy):
        c = Canvas(self.w, self.h)
        c.blit(self, dx, dy)
        return c

    def rotate(self, deg, cx=None, cy=None):
        """Nearest-neighbour rotation around (cx,cy)."""
        cx = self.w / 2 if cx is None else cx
        cy = self.h / 2 if cy is None else cy
        out = Canvas(self.w, self.h)
        r = math.radians(deg)
        cs, sn = math.cos(r), math.sin(r)
        for y in range(self.h):
            for x in range(self.w):
                # inverse map
                dx, dy = x + 0.5 - cx, y + 0.5 - cy
                sx = cs * dx + sn * dy + cx
                sy = -sn * dx + cs * dy + cy
                ix, iy = int(math.floor(sx)), int(math.floor(sy))
                if 0 <= ix < self.w and 0 <= iy < self.h:
                    out.a[y, x] = self.a[iy, ix]
        return out

    def recolor_dark(self, f=0.55):
        m = self.a[:, :, 3] > 0
        self.a[m, :3] = (self.a[m, :3] * f).astype(np.uint8)
        return self

    def img(self):
        return Image.fromarray(self.a, 'RGBA')


def poly_mask(w, h, pts):
    im = Image.new('L', (w, h), 0)
    ImageDraw.Draw(im).polygon([(float(x), float(y)) for x, y in pts], fill=255)
    return np.array(im) > 0


# ------------------------------------------------------------- sheets
class Sheet:
    """Grid sprite sheet: one row per animation."""

    def __init__(self, name, fw, fh, anchor=None):
        self.name, self.fw, self.fh = name, fw, fh
        self.rows = []  # (anim_name, [frames], fps, loop)
        self.anchor = anchor or (fw // 2, fh - 2)
        self.extra = {}

    def add(self, anim, frames, fps=10, loop=True, **meta):
        self.rows.append((anim, frames, fps, loop, meta))

    def save(self, outdir, sub):
        d = os.path.join(outdir, sub)
        os.makedirs(d, exist_ok=True)
        cols = max(len(r[1]) for r in self.rows)
        W, H = cols * self.fw, len(self.rows) * self.fh
        im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        frames_meta = {}
        anims = {}
        for ri, (anim, frames, fps, loop, meta) in enumerate(self.rows):
            names = []
            for fi, fr in enumerate(frames):
                im.paste(fr.img(), (fi * self.fw, ri * self.fh))
                fname = f"{self.name}_{anim}_{fi}"
                frames_meta[fname] = {
                    'frame': {'x': fi * self.fw, 'y': ri * self.fh, 'w': self.fw, 'h': self.fh},
                    'rotated': False, 'trimmed': False,
                    'spriteSourceSize': {'x': 0, 'y': 0, 'w': self.fw, 'h': self.fh},
                    'sourceSize': {'w': self.fw, 'h': self.fh},
                    'pivot': {'x': round(self.anchor[0] / self.fw, 4), 'y': round(self.anchor[1] / self.fh, 4)},
                }
                names.append(fname)
            a = {'row': ri, 'frames': len(frames), 'fps': fps, 'loop': loop, 'frameNames': names}
            a.update(meta)
            anims[anim] = a
        png = f"{self.name}.png"
        im.save(os.path.join(d, png))
        data = {
            'frames': frames_meta,
            'animations': anims,
            'meta': {
                'image': png, 'size': {'w': W, 'h': H}, 'format': 'RGBA8888', 'scale': '1',
                'frameWidth': self.fw, 'frameHeight': self.fh,
                'anchor': {'x': self.anchor[0], 'y': self.anchor[1]},
                'app': 'td-pixel-pack generator',
            },
        }
        data['meta'].update(self.extra)
        with open(os.path.join(d, f"{self.name}.json"), 'w') as f:
            json.dump(data, f, indent=1)
        return os.path.join(d, png)


def save_gif(frames, path, fps=10, scale=4, bg=(46, 82, 40)):
    imgs = []
    for fr in frames:
        im = Image.new('RGBA', (fr.w, fr.h), bg + (255,))
        im.alpha_composite(fr.img())
        im = im.resize((fr.w * scale, fr.h * scale), Image.NEAREST).convert('P', palette=Image.ADAPTIVE)
        imgs.append(im)
    imgs[0].save(path, save_all=True, append_images=imgs[1:], duration=int(1000 / fps), loop=0, disposal=2)


def contact(sheets_png, path, scale=3, bg=(40, 60, 40)):
    """Upscaled preview of a sheet png on a checker background."""
    im = Image.open(sheets_png)
    W, H = im.size
    b = Image.new('RGBA', (W, H), bg + (255,))
    for y in range(0, H, 8):
        for x in range(0, W, 8):
            if (x // 8 + y // 8) % 2:
                b.paste((bg[0] + 10, bg[1] + 10, bg[2] + 10, 255), (x, y, x + 8, y + 8))
    b.alpha_composite(im)
    b.resize((W * scale, H * scale), Image.NEAREST).save(path)


def rng(seed):
    return random.Random(seed)
