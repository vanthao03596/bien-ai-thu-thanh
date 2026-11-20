"""Non-humanoid creatures: wolf (quadruped) and giant bat (flyer)."""
import math

from px import Canvas, P, OUT, WHITE, hx, darken, Sheet
from chars import rot_fit, soul, dark_ramp

D2R = math.pi / 180


class Wolf:
    fw, fh, ground = 32, 32, 30

    def __init__(self, fur='fur', eye=hx('#ffd23a')):
        self.fur = P[fur]
        self.eye = eye
        self.cx = 16

    def leg(self, c, x, y, ang, ln, ramp, w=2.2, hind=False):
        if hind:
            kx = x + math.sin((ang - 25) * D2R) * ln * 0.5
            ky = y + math.cos((ang - 25) * D2R) * ln * 0.5
            fx = kx + math.sin((ang + 25) * D2R) * ln * 0.55
            fy = ky + math.cos((ang + 25) * D2R) * ln * 0.55
            c.limb(x, y, kx, ky, w + 1.6, ramp)
            c.limb(kx, ky, fx, min(fy, self.ground - 0.5), w, ramp)
        else:
            fx = x + math.sin(ang * D2R) * ln
            fy = y + math.cos(ang * D2R) * ln
            c.limb(x, y, fx, min(fy, self.ground - 0.5), w, ramp)
        fy = min(fy, self.ground - 0.5)
        c.rect(int(fx), int(fy), 2, 1, ramp[0])

    def side(self, p=0.0, bob=0, head_dy=0, mouth=0, lunge=0, run=True):
        fr = Canvas(self.fw, self.fh)
        f = self.fur
        by = 22 + bob
        bx = 15 + lunge
        a = 34 if run else 6
        s = math.sin(p)
        ln = 7.5 - bob
        L = Canvas(self.fw, self.fh)
        self.leg(L, bx + 5, by + 1, s * a + 6, ln, dark_ramp(f))
        self.leg(L, bx - 5, by, -s * a * 0.9, ln, dark_ramp(f), hind=True)
        L.outline()
        fr.over(L)
        # tail
        L = Canvas(self.fw, self.fh)
        tw = math.sin(p * 2) * 1.5
        L.thick(bx - 6, by - 1.5, bx - 10, by - 3 + tw, 3.0, f[1])
        L.thick(bx - 9, by - 2.5 + tw, bx - 12.5, by - 0.5 + tw, 2.4, f[2])
        L.px(bx - 13, by - 0.5 + tw, f[3])
        L.outline()
        fr.over(L)
        # body
        L = Canvas(self.fw, self.fh)
        L.sphere(bx - 0.5, by, 7.5, 4.0, f)
        L.ellipse(bx + 0.5, by + 2.5, 5.0, 1.3, f[3])
        L.sphere(bx + 4.5, by - 1.0, 4.0, 4.4, f)  # chest/neck
        L.sphere(bx - 4.5, by - 0.3, 3.4, 3.8, f)  # haunch
        for i in range(5):
            L.px(bx - 4 + i * 2, by - 4 + (i % 2), f[0])
        L.px(bx + 3, by - 5, f[0])
        L.px(bx + 5, by - 5, f[0])
        L.outline()
        fr.over(L)
        # near legs
        L = Canvas(self.fw, self.fh)
        self.leg(L, bx + 5.5, by + 1, -s * a + 4, ln, f, w=2.4)
        self.leg(L, bx - 4.5, by + 0.5, s * a * 0.9, ln, f, w=2.4, hind=True)
        L.outline()
        fr.over(L)
        # head
        L = Canvas(self.fw, self.fh)
        hx_, hy_ = bx + 8.5, by - 4.5 + head_dy
        L.poly([(hx_ - 3, hy_ - 1.5), (hx_ - 1.5, hy_ - 7), (hx_ + 0.5, hy_ - 2)], f[1])
        L.px(hx_ - 1.5, hy_ - 4, f[3])
        L.sphere(hx_, hy_, 3.6, 3.1, f)
        L.rect(int(hx_ + 1), int(hy_ - 0.5), 4, 2, f[2])
        L.px(int(hx_ + 1), int(hy_ - 0.5), f[3])
        if mouth:
            L.rect(int(hx_ + 1), int(hy_ + 1.5 + mouth), 4, 1, f[1])
            L.rect(int(hx_ + 1), int(hy_ + 1.5), 3, mouth, hx('#7a1a22'))
            L.px(int(hx_ + 3), int(hy_ + 1.5), WHITE)
        else:
            L.rect(int(hx_ + 1), int(hy_ + 1.5), 3, 1, f[1])
        L.px(int(hx_ + 4.5), int(hy_ - 0.5), OUT)
        L.px(int(hx_ + 0.5), int(hy_ - 1), self.eye)
        L.px(int(hx_ - 0.5), int(hy_ - 1), self.eye)
        L.outline()
        fr.over(L)
        return fr

    def front(self, p, back=False):
        fr = Canvas(self.fw, self.fh)
        f = self.fur
        s = math.sin(p)
        bob = -1 if abs(s) < 0.5 else 0
        cx = 16
        if not back:
            L = Canvas(self.fw, self.fh)
            L.sphere(cx, 21 + bob, 5.5, 5, f)
            L.ellipse(cx, 23 + bob, 3, 2.5, f[3])
            L.outline()
            fr.over(L)
            L = Canvas(self.fw, self.fh)
            for sg, ph in ((-1, s), (1, -s)):
                lift = max(0, ph) * 2
                L.limb(cx + sg * 3, 23 + bob, cx + sg * 3, 29 - lift, 2.6, f)
                L.rect(int(cx + sg * 3 - 1), int(29 - lift), 2, 1, f[0])
            L.outline()
            fr.over(L)
            L = Canvas(self.fw, self.fh)
            hy_ = 15 + bob
            for sg in (-1, 1):
                L.poly([(cx + sg * 1.5, hy_ - 2), (cx + sg * 4.5, hy_ - 7.5), (cx + sg * 5, hy_ - 1)], f[1])
                L.poly([(cx + sg * 2.5, hy_ - 2.5), (cx + sg * 4.2, hy_ - 5.5), (cx + sg * 4.2, hy_ - 2)], f[3])
            L.sphere(cx, hy_, 4.6, 3.8, f)
            L.sphere(cx, hy_ + 2.4, 2.4, 2.0, [f[1], f[2], f[3], f[3]])
            L.rect(cx - 1, int(hy_ + 1), 2, 1, OUT)
            L.px(cx - 3, hy_ - 0.5, self.eye)
            L.px(cx + 2, hy_ - 0.5, self.eye)
            L.outline()
            fr.over(L)
        else:
            L = Canvas(self.fw, self.fh)
            hy_ = 14 + bob
            for sg in (-1, 1):
                L.poly([(cx + sg * 1.5, hy_ - 1), (cx + sg * 4.5, hy_ - 6.5), (cx + sg * 5, hy_)], f[1])
            L.sphere(cx, hy_, 4.3, 3.4, f)
            L.outline()
            fr.over(L)
            L = Canvas(self.fw, self.fh)
            for sg, ph in ((-1, s), (1, -s)):
                lift = max(0, ph) * 2
                L.limb(cx + sg * 3.5, 24 + bob, cx + sg * 3.5, 29 - lift, 2.6, f)
                L.rect(int(cx + sg * 3.5 - 1), int(29 - lift), 2, 1, f[0])
            L.outline()
            fr.over(L)
            L = Canvas(self.fw, self.fh)
            L.sphere(cx, 19 + bob, 5, 4.2, f)
            for sg in (-1, 1):
                L.sphere(cx + sg * 3, 22 + bob, 3.4, 3.6, f)
            L.outline()
            fr.over(L)
            L = Canvas(self.fw, self.fh)
            tw = s * 2
            L.thick(cx, 20 + bob, cx + tw, 15 + bob, 3.2, f[2])
            L.thick(cx + tw, 16 + bob, cx + tw * 1.3, 13 + bob, 2.2, f[3])
            L.outline()
            fr.over(L)
        return fr

    def sheet(self, name='wolf'):
        sh = Sheet(name, self.fw, self.fh, anchor=(16, 30))
        sh.add('idle', [self.side(0, bob=b, run=False, head_dy=b) for b in (0, 0, 1, 1)], fps=5)
        run = []
        for i in range(6):
            p = 2 * math.pi * i / 6
            run.append(self.side(p, bob=-1 if i in (1, 4) else 0))
        sh.add('walk_side', run, fps=12)
        sh.add('walk_down', [self.front(2 * math.pi * i / 4) for i in range(4)], fps=10)
        sh.add('walk_up', [self.front(2 * math.pi * i / 4, back=True) for i in range(4)], fps=10)
        atk = [self.side(0, run=False), self.side(0, run=False, head_dy=-1, mouth=1, lunge=-1),
               self.side(0.6, run=True, head_dy=0, mouth=2, lunge=2), self.side(0.6, run=True, head_dy=1, mouth=0, lunge=3),
               self.side(0, run=False, mouth=1, lunge=1), self.side(0, run=False)]
        sh.add('attack', atk, fps=12, loop=False, hitFrame=3)
        base = self.side(0, run=False)
        d = [base.copy().tint(WHITE, 0.6), rot_fit(base, -12, 16, 30, 30, 0)]
        lying = self.lying()
        d += [rot_fit(base, -25, 16, 30, 30, 0), lying.shift(0, -1), lying.copy()]
        for i, t in enumerate((0.3, 0.65)):
            f = lying.copy().dissolve(t)
            soul(f, 16, 22 - i * 5, i)
            d.append(f)
        sh.add('death', d, fps=10, loop=False)
        sh.extra['facing'] = 'right (flip X for left)'
        return sh

    def lying(self):
        fr = Canvas(self.fw, self.fh)
        f = self.fur
        L = Canvas(self.fw, self.fh)
        for x in (11, 19):
            L.limb(x, 26, x + 6, 22, 2.2, dark_ramp(f))
        L.outline()
        fr.over(L)
        L = Canvas(self.fw, self.fh)
        L.sphere(15, 26, 8, 3.4, f)
        L.thick(7, 26, 3, 27, 2.4, f[1])
        L.outline()
        fr.over(L)
        L = Canvas(self.fw, self.fh)
        for x in (12, 20):
            L.limb(x, 25, x + 6, 21, 2.2, f)
        L.sphere(24, 27, 3.2, 2.6, f)
        L.rect(26, 27, 3, 2, f[2])
        L.px(24, 26, OUT)
        L.px(23, 25, OUT)
        L.outline()
        fr.over(L)
        return fr


class Bat:
    fw, fh = 32, 32

    def __init__(self):
        self.body = P['fur']
        self.wing = [hx('#2a1a32'), hx('#4a2e52'), hx('#6e4a74'), hx('#946c96')]

    def frame(self, wing, dy=0, flash=False):
        fr = Canvas(self.fw, self.fh)
        cx, cy = 16, 14 + dy
        w = self.wing
        L = Canvas(self.fw, self.fh)
        for sg in (-1, 1):
            tipy = cy - 7 * wing
            midy = cy - 3 * wing
            pts = [(cx + sg * 2, cy - 2), (cx + sg * 7, midy - 3), (cx + sg * 13, tipy - 1),
                   (cx + sg * 14, tipy + 2), (cx + sg * 11, midy + 3), (cx + sg * 8, midy + 2), (cx + sg * 5, cy + 3), (cx + sg * 2, cy + 3)]
            L.poly(pts, w[1])
            L.poly([(cx + sg * 2, cy - 1), (cx + sg * 7, midy - 1.5), (cx + sg * 12, tipy + 1), (cx + sg * 8, midy + 1), (cx + sg * 3, cy + 2)], w[2])
            L.line(cx + sg * 2, cy - 2, cx + sg * 7, midy - 3, w[0])
            L.line(cx + sg * 7, midy - 3, cx + sg * 13, tipy - 1, w[0])
            L.line(cx + sg * 7, midy - 3, cx + sg * 8, midy + 2, w[0])
            L.line(cx + sg * 7, midy - 3, cx + sg * 11, midy + 3, w[0])
        L.outline()
        fr.over(L)
        L = Canvas(self.fw, self.fh)
        b = self.body
        for sg in (-1, 1):
            L.poly([(cx + sg * 1, cy - 4), (cx + sg * 3.5, cy - 8), (cx + sg * 3.5, cy - 3)], b[1])
        L.sphere(cx, cy, 3.6, 4.2, b)
        L.sphere(cx, cy + 1.5, 2, 2, [b[2], b[3], b[3], b[3]])
        L.px(cx - 2, cy - 1, hx('#ff3a3a'))
        L.px(cx + 1, cy - 1, hx('#ff3a3a'))
        L.px(cx - 1, cy + 1, WHITE)
        L.px(cx, cy + 1, WHITE)
        L.px(cx - 1, cy + 4, b[0])
        L.px(cx, cy + 4, b[0])
        L.outline()
        fr.over(L)
        if flash:
            fr.tint(WHITE, 0.6)
        return fr

    def sheet(self, name='bat'):
        sh = Sheet(name, self.fw, self.fh, anchor=(16, 30))
        wings = [1.0, 0.5, -0.3, -0.8, -0.3, 0.5]
        dys = [0, 0, 1, 1, 1, 0]
        fly = [self.frame(w, d) for w, d in zip(wings, dys)]
        sh.add('fly', fly, fps=12)
        d = [self.frame(0.2, 0, True)]
        for i, (w, dy) in enumerate(((0.1, 2), (-0.2, 5), (-0.5, 9), (-0.6, 13), (-0.6, 15))):
            f = self.frame(w, dy).rotate(i * 25, 16, 14 + dy)
            if i >= 3:
                f.dissolve(0.3 * (i - 2))
            d.append(f)
        sh.add('death', d, fps=10, loop=False)
        sh.extra['flying'] = True
        sh.extra['note'] = 'Fly animation is used for all directions; draw shadow.png under it on the ground.'
        return sh
