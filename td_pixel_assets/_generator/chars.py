"""Characters: humanoid rig (side/front/back), quadruped, flyer."""
import math

from px import Canvas, P, OUT, WHITE, hx, darken, lighten, mix, ramp_pick, Sheet

D2R = math.pi / 180


def dark_ramp(r, f=0.72):
    return [darken(c, f) for c in r]


# ================================================================ weapons
def draw_weapon(c, kind, x, y, ang, s=1.0, glow=0.0):
    """Draw weapon held at hand (x,y); ang = direction of the business end."""
    ca, sa = math.cos(ang * D2R), math.sin(ang * D2R)
    px_, py_ = -sa, ca  # perpendicular

    def at(d, p=0.0):
        return x + ca * d + px_ * p, y + sa * d + py_ * p

    M, W, G = P['metal'], P['wood'], P['gold']
    if kind == 'dagger':
        hx0, hy0 = at(-1.5 * s)
        c.line(hx0, hy0, x, y, P['leather'][1])
        a0, a1 = at(-0.5 * s, -1.5 * s), at(-0.5 * s, 1.5 * s)
        c.line(*a0, *a1, G[1])
        b0, b1 = at(0.5 * s), at(5 * s)
        c.line(*b0, *b1, M[2])
        c.px(*at(4.5 * s), M[3])
    elif kind == 'sword':
        c.line(*at(-2.5 * s), *at(-0.5 * s), P['leather'][1])
        c.px(*at(-3 * s), G[2])
        c.line(*at(0, -2.2 * s), *at(0, 2.2 * s), G[2])
        c.line(*at(1 * s), *at(9 * s), M[2], w=max(1, int(1.6 * s)) if s > 1.2 else 1)
        c.line(*at(1 * s, -0.6), *at(8 * s, -0.6), M[3])
    elif kind == 'axe':
        c.line(*at(-3 * s), *at(8 * s), W[2], w=1 if s < 1.5 else 2)
        hx_, hy_ = at(7 * s)
        pts = [at(5 * s, 0), at(4.5 * s, 4.5 * s), at(9 * s, 4.5 * s), at(9 * s, 0)]
        c.poly(pts, M[1])
        pts2 = [at(5.5 * s, 1), at(5.5 * s, 4 * s), at(8.5 * s, 4 * s), at(8.5 * s, 1)]
        c.poly(pts2, M[2])
        c.line(*at(5 * s, 4.6 * s), *at(9 * s, 4.6 * s), M[3])
    elif kind == 'cleaver':
        c.line(*at(-4 * s), *at(4 * s), W[1], w=2)
        pts = [at(3 * s, -1.5 * s), at(3 * s, 5 * s), at(13 * s, 6 * s), at(14 * s, -1.5 * s)]
        c.poly(pts, P['metal'][1])
        pts2 = [at(4 * s, -0.5 * s), at(4 * s, 4 * s), at(12.5 * s, 4.8 * s), at(13 * s, -0.5 * s)]
        c.poly(pts2, P['metal'][2])
        c.line(*at(3 * s, 5.4 * s), *at(13 * s, 6.3 * s), P['metal'][3])
        if glow > 0:
            c.line(*at(5 * s, 1.5 * s), *at(11 * s, 1.5 * s), P['fire'][3])
    elif kind == 'club':
        n = 10
        for i in range(n + 1):
            t = i / n
            d = -2 * s + t * 11 * s
            r = (0.8 + t * 1.8) * s
            c.disc(*at(d), r, W[1] if i < n * 0.6 else W[2])
        c.disc(*at(8 * s, -0.8 * s), 1.0 * s, W[3])
        for d, p in ((6, 2.6), (8.5, -2.6), (9.5, 2.4)):
            c.px(*at(d * s, p * s), P['bone'][2])
    elif kind == 'spear':
        c.line(*at(-6 * s), *at(9 * s), W[2])
        tip = [at(8 * s, -1.5), at(12.5 * s, 0), at(8 * s, 1.5)]
        c.poly(tip, M[2])
        c.px(*at(10 * s, -0.5), M[3])
    elif kind == 'staff':
        c.line(*at(-6 * s), *at(7 * s), W[2])
        ox, oy = at(8.5 * s)
        ramp = P['green_fx'] if glow >= 0 else P['magic']
        r = 1.8 * s + max(0.0, glow) * 1.0
        c.sphere(ox, oy, r, r, P['green_fx'])
        c.px(ox - 1, oy - 1, WHITE)
    elif kind == 'staff_p':
        c.line(*at(-6 * s), *at(7 * s), W[3])
        ox, oy = at(8.5 * s)
        r = 1.8 * s + glow * 1.0
        c.sphere(ox, oy, r, r, P['magic'])
        c.px(ox - 1, oy - 1, WHITE)
    elif kind == 'hammer':
        c.line(*at(-3 * s), *at(8 * s), W[2])
        pts = [at(6 * s, -3 * s), at(6 * s, 3 * s), at(10 * s, 3 * s), at(10 * s, -3 * s)]
        c.poly(pts, M[1])
        c.poly([at(6.5 * s, -2.5 * s), at(6.5 * s, 2.5 * s), at(8 * s, 2.5 * s), at(8 * s, -2.5 * s)], M[3])


def draw_shield(c, kind, x, y, view='side', s=1.0):
    if kind is None:
        return
    if kind == 'round':
        if view == 'side':
            c.ellipse(x, y, 1.8 * s, 3.6 * s, P['wood'][1])
            c.ellipse(x + 0.4, y - 0.3, 1.2 * s, 3.0 * s, P['wood'][2])
            c.px(x, y, P['metal'][3])
        elif view == 'front':
            c.sphere(x, y, 3.4 * s, 3.4 * s, P['wood'])
            c.ring(x, y, 3.4 * s, 3.4 * s, P['metal'][1])
            c.px(x - 0.5, y - 0.5, P['metal'][3])
        else:
            c.ellipse(x, y, 3.4 * s, 3.4 * s, P['wood'][0])
            c.ring(x, y, 3.4 * s, 3.4 * s, P['wood'][1])
            c.line(x - 2, y, x + 2, y, P['leather'][2])
    elif kind in ('kite_b', 'kite_k', 'kite_r'):
        base = {'kite_b': P['blue'], 'kite_k': R_K, 'kite_r': P['red']}[kind]
        trim = P['gold'] if kind != 'kite_k' else P['metal']
        if view == 'side':
            pts = [(x - 1.5, y - 4 * s), (x + 1.5, y - 4 * s), (x + 1.5, y + 2 * s), (x, y + 5 * s), (x - 1.5, y + 2 * s)]
            c.poly(pts, trim[1])
            pts = [(x - 0.5, y - 3.2 * s), (x + 1.0, y - 3.2 * s), (x + 1.0, y + 2 * s), (x, y + 3.8 * s), (x - 0.5, y + 2 * s)]
            c.poly(pts, base[2])
        else:
            w = 3.4 * s
            pts = [(x - w, y - 4 * s), (x + w, y - 4 * s), (x + w, y + 1 * s), (x, y + 5.5 * s), (x - w, y + 1 * s)]
            if view == 'front':
                c.poly(pts, trim[1])
                pts2 = [(x - w + 1, y - 3 * s), (x + w - 1, y - 3 * s), (x + w - 1, y + 0.6 * s), (x, y + 4.2 * s), (x - w + 1, y + 0.6 * s)]
                c.poly_shaded(pts2, base, 'x', 0.3)
                c.vline(int(x), int(y - 3 * s), int(y + 3 * s), trim[2])
                c.hline(int(x - w + 1), int(x + w - 2), int(y - 1 * s), trim[2])
            else:
                c.poly(pts, P['wood'][1])
                c.line(x - 2, y - 1, x + 2, y - 1, P['leather'][2])


R_K = [hx('#16161e'), hx('#2a2a38'), hx('#44445a'), hx('#6e6e88')]


# ================================================================ humanoid
class Humanoid:
    def __init__(self, **k):
        d = dict(fw=32, fh=32, ground=30, leg_len=5, leg_w=2.6, torso_w=7, torso_h=7,
                 head_rx=4.0, head_ry=3.8, arm_len=5, arm_w=2.2, skin='skin',
                 shirt='leather', pants='leather', boots='leather', feat='human',
                 helmet=None, weapon='dagger', shield=None, cape=None, belly=False,
                 eye=hx('#1d1322'), hair=None, wscale=1.0, stride=2.5, armor=None,
                 belt='leather', plume=None, s=1.0, hunch=0, pauldron=None, wings=None)
        d.update(k)
        self.__dict__.update(d)
        self.cx = self.fw / 2.0

    # ---------------------------------------------------------- geometry
    def frame(self):
        return Canvas(self.fw, self.fh)

    def layer(self):
        return Canvas(self.fw, self.fh)

    def hip_y(self, bob):
        return self.ground - self.leg_len + bob

    def torso_box(self, bob, view):
        tw = self.torso_w if view != 'side' else max(4, round(self.torso_w * 0.78))
        th = self.torso_h
        bot = self.hip_y(bob) + 1
        top = bot - th
        x0 = self.cx - tw / 2.0
        return x0, top, tw, th

    # ------------------------------------------------------------ parts
    def draw_torso(self, c, bob, view, lean=0):
        x0, top, tw, th = self.torso_box(bob, view)
        x0 += lean
        ramp = P[self.shirt]
        if self.belly:
            c.sphere(x0 + tw / 2, top + th / 2 + 1, tw / 2 + 0.6, th / 2 + 0.6, ramp)
            if view != 'back':
                bx = x0 + tw / 2 + (1.5 if view == 'side' else 0)
                c.sphere(bx, top + th * 0.62, tw * 0.36, th * 0.36, P[self.skin])
        else:
            for yy in range(int(top), int(top + th)):
                for xx in range(int(x0), int(x0 + tw)):
                    u = (xx + 0.5 - x0) / tw
                    v = (yy + 0.5 - top) / th
                    # round the 4 corners
                    if (u < 0.15 or u > 0.85) and (v < 0.12 or v > 0.9):
                        continue
                    b = 1 - abs(u - 0.32) / 0.68
                    b = b * 0.85 + (1 - v) * 0.2
                    c.px(xx, yy, ramp_pick(ramp, b))
        # armour / details
        if self.armor == 'plate' or self.armor == 'plate_k' or self.armor == 'plate_g':
            m = P['metal'] if self.armor != 'plate_k' else R_K
            if self.armor == 'plate_g':
                m = P['metal']
            cx = x0 + tw / 2
            if view == 'front':
                c.sphere(cx, top + th * 0.4, tw * 0.45, th * 0.42, m)
                if self.armor == 'plate_g':
                    c.hline(int(cx - 1), int(cx), int(top + th * 0.4), P['gold'][2])
                    c.vline(int(cx - 0.5), int(top + 1), int(top + th * 0.7), P['gold'][2])
            elif view == 'side':
                c.sphere(cx + 0.5, top + th * 0.4, tw * 0.5, th * 0.42, m)
            else:
                c.sphere(cx, top + th * 0.4, tw * 0.45, th * 0.42, darken_r(m))
        elif self.armor == 'ribs':
            cx = x0 + tw / 2
            for i in range(3):
                yy = int(top + 1 + i * 2)
                if view == 'side':
                    c.hline(int(x0 + 1), int(x0 + tw - 1), yy, P['bone'][0])
                else:
                    c.hline(int(cx - tw / 2 + 1), int(cx - 1), yy, P['bone'][0])
                    c.hline(int(cx + 1), int(cx + tw / 2 - 1), yy, P['bone'][0])
            if view != 'side':
                c.vline(int(cx - 0.5), int(top), int(top + th - 1), P['bone'][3] if view == 'front' else P['bone'][1])
        elif self.armor == 'robe':
            pass
        elif self.armor == 'vest':
            if view == 'front':
                cx = x0 + tw / 2
                c.vline(int(cx - 0.5), int(top + 1), int(top + th - 2), darken(P[self.shirt][1], 0.8))
        # belt
        if self.belt and not self.belly:
            by = int(top + th - 2)
            c.hline(int(x0), int(x0 + tw - 1), by, P[self.belt][0] if self.belt != 'gold' else P['gold'][1])
            if view == 'front':
                c.px(int(x0 + tw / 2 - 0.5), by, P['gold'][2])
        # tabard/robe skirt
        if self.armor == 'robe':
            sk = P[self.shirt]
            hy = self.hip_y(bob)
            if view == 'side':
                c.poly([(x0 - 0.5, hy - 1), (x0 + tw + 0.5, hy - 1), (x0 + tw + 1.5, hy + self.leg_len - 1), (x0 - 1.5, hy + self.leg_len - 1)], sk[1])
                c.poly([(x0 + 0.5, hy - 1), (x0 + tw - 0.5, hy - 1), (x0 + tw, hy + self.leg_len - 2), (x0, hy + self.leg_len - 2)], sk[2])
            else:
                c.poly([(x0 - 0.5, hy - 1), (x0 + tw + 0.5, hy - 1), (x0 + tw + 1.5, hy + self.leg_len - 1), (x0 - 1.5, hy + self.leg_len - 1)], sk[1])
                c.poly([(x0 + 0.5, hy - 1), (x0 + tw * 0.5, hy - 1), (x0 + tw * 0.5, hy + self.leg_len - 2), (x0, hy + self.leg_len - 2)], sk[2])

    def head_center(self, bob, view, lean=0):
        x0, top, tw, th = self.torso_box(bob, view)
        hx_ = self.cx + (1.0 if view == 'side' else 0) + lean + (self.hunch if view == 'side' else 0)
        hy_ = top - self.head_ry + 1.5 + (self.hunch * 0.5)
        return hx_, hy_

    def draw_head(self, c, bob, view, lean=0, eyes_open=True, glow_eyes=False):
        hx_, hy_ = self.head_center(bob, view, lean)
        rx, ry = self.head_rx, self.head_ry
        skin = P[self.skin]
        f = self.feat
        # ears behind
        if f in ('goblin',):
            if view == 'side':
                c.poly([(hx_ - 1, hy_ - 1), (hx_ - rx - 3.5, hy_ - 3.5), (hx_ - 1.5, hy_ + 1.5)], skin[1])
                c.poly([(hx_ - 1.5, hy_ - 0.5), (hx_ - rx - 2, hy_ - 2.5), (hx_ - 1.5, hy_ + 0.8)], skin[2])
            else:
                for sgn in (-1, 1):
                    c.poly([(hx_ + sgn * (rx - 1.5), hy_ - 1), (hx_ + sgn * (rx + 4), hy_ - 3.5), (hx_ + sgn * (rx - 1.0), hy_ + 1.5)], skin[1])
                    if view == 'front':
                        c.poly([(hx_ + sgn * (rx - 0.5), hy_ - 0.5), (hx_ + sgn * (rx + 2.5), hy_ - 2.5), (hx_ + sgn * (rx - 0.5), hy_ + 0.8)], skin[2])
        if f == 'demon':
            hornr = P['bone']
            for sgn in ((-1, 1) if view != 'side' else (-1, 1)):
                if view == 'side':
                    bx = hx_ + (sgn * 1.5)
                    c.thick(bx, hy_ - ry + 1, bx - 2.5 + sgn, hy_ - ry - 3, 2.4, hornr[1] if sgn < 0 else hornr[2])
                    c.thick(bx - 2.5 + sgn, hy_ - ry - 3, bx - 1 + sgn, hy_ - ry - 6, 1.4, hornr[2] if sgn < 0 else hornr[3])
                else:
                    bx = hx_ + sgn * (rx - 1.5)
                    c.thick(bx, hy_ - ry + 2, bx + sgn * 3, hy_ - ry - 2, 2.6, hornr[1])
                    c.thick(bx + sgn * 3, hy_ - ry - 2, bx + sgn * 2, hy_ - ry - 6, 1.6, hornr[2])
        # cranium
        if f == 'skull':
            c.sphere(hx_, hy_, rx, ry, P['bone'])
        else:
            c.sphere(hx_, hy_, rx, ry, skin)
        # hair
        if self.hair and not self.helmet:
            hr = P[self.hair]
            if view == 'side':
                c.ellipse(hx_ - 1, hy_ - 1.5, rx - 0.5, ry - 1.5, hr[2])
                c.ellipse(hx_ - 1.5, hy_ - 2, rx - 1.5, ry - 2.5, hr[3])
            elif view == 'front':
                c.ellipse(hx_, hy_ - 2, rx, ry - 2, hr[2])
            else:
                c.ellipse(hx_, hy_ - 0.5, rx, ry, hr[2])
                c.ellipse(hx_ - 1, hy_ - 1.5, rx - 1.5, ry - 1.5, hr[3])
        # face
        e = self.eye if not glow_eyes else P['fire'][4]
        if view == 'side':
            ex = hx_ + rx * 0.45
            ey = hy_ - 0.2
            if f == 'skull':
                c.rect(int(ex - 0.5), int(ey - 1), 2, 2, P['bone'][0])
                c.px(int(ex), int(ey), hx('#ff5a3a'))
                c.hline(int(hx_ + 0.5), int(hx_ + rx - 0.5), int(hy_ + ry - 1.5), P['bone'][0])
            else:
                c.px(int(ex), int(ey), e)
                if rx >= 4.5:
                    c.px(int(ex), int(ey - 1), e if not glow_eyes else P['fire'][3])
                # nose
                c.px(int(hx_ + rx - 0.2), int(hy_ + 0.5), skin[1] if f != 'goblin' else skin[2])
                if f == 'goblin':
                    c.px(int(hx_ + rx + 0.8), int(hy_ + 0.5), skin[2])
                    c.px(int(hx_ + rx * 0.4), int(hy_ + ry - 1.2), OUT)
                if f in ('orc', 'ogre', 'demon'):
                    c.px(int(hx_ + rx - 1), int(hy_ + ry - 1.6), P['bone'][3])
                    c.px(int(hx_ + rx - 1), int(hy_ + ry - 2.6), P['bone'][3])
                # brow
                c.px(int(ex - 1), int(ey - 1 - (1 if rx >= 4.5 else 0)), skin[0])
        elif view == 'front':
            sp = max(1.5, rx * 0.45)
            for sgn in (-1, 1):
                ex = hx_ + sgn * sp
                ey = hy_ - 0.2
                if f == 'skull':
                    c.rect(int(ex - 0.5), int(ey - 1), 2, 2, P['bone'][0])
                    c.px(int(ex), int(ey), hx('#ff5a3a'))
                else:
                    c.px(int(ex - (0 if sgn > 0 else 0)), int(ey), e)
                    if rx >= 4.5:
                        c.px(int(ex), int(ey - 1), e if not glow_eyes else P['fire'][3])
            if f in ('orc', 'ogre', 'demon'):
                c.px(int(hx_ - 2), int(hy_ + ry - 1.6), P['bone'][3])
                c.px(int(hx_ + 1.5), int(hy_ + ry - 1.6), P['bone'][3])
            if f == 'goblin':
                c.px(int(hx_ - 0.5), int(hy_ + 1), skin[1])
                c.hline(int(hx_ - 1.5), int(hx_ + 0.5), int(hy_ + ry - 1.2), OUT)
            if f == 'skull':
                c.hline(int(hx_ - 1.5), int(hx_ + 1.5), int(hy_ + ry - 1.5), P['bone'][0])
                c.px(int(hx_ - 0.5), int(hy_ + 1), P['bone'][0])
        # helmets
        if self.helmet:
            self.draw_helmet(c, hx_, hy_, view)

    def draw_helmet(self, c, hx_, hy_, view):
        rx, ry = self.head_rx, self.head_ry
        k = self.helmet
        if k in ('iron', 'gold', 'dark'):
            m = {'iron': P['metal'], 'gold': P['gold'], 'dark': R_K}[k]
            # dome
            for yy in range(int(hy_ - ry - 1), int(hy_ + (0 if view != 'back' else ry))):
                for xx in range(int(hx_ - rx - 1), int(hx_ + rx + 1)):
                    dx = (xx + 0.5 - hx_) / (rx + 0.6)
                    dy = (yy + 0.5 - hy_) / (ry + 0.6)
                    if dx * dx + dy * dy <= 1.0:
                        nz = math.sqrt(max(0, 1 - dx * dx - dy * dy))
                        i = -0.55 * dx - 0.75 * dy + 0.62 * nz
                        c.px(xx, yy, ramp_pick(m, (i + 0.25) / 1.15))
            if view == 'side':
                c.hline(int(hx_ - rx), int(hx_ + rx), int(hy_ - 0.5), m[1])
                c.vline(int(hx_ + rx - 0.5), int(hy_ - 0.5), int(hy_ + 1.5), m[2])
                if k == 'dark':
                    c.rect(int(hx_ - rx + 0.5), int(hy_ - 0.5), int(2 * rx), int(ry + 0.5), m[1])
                    c.hline(int(hx_), int(hx_ + rx), int(hy_), hx('#ff4a3a'))
            elif view == 'front':
                c.hline(int(hx_ - rx), int(hx_ + rx - 1), int(hy_ - 0.5), m[1])
                c.vline(int(hx_ - 0.5), int(hy_ - 0.5), int(hy_ + 1.5), m[2])
                if k == 'dark':
                    c.rect(int(hx_ - rx + 0.5), int(hy_ - 0.5), int(2 * rx), int(ry + 0.5), m[1])
                    c.hline(int(hx_ - rx + 1.5), int(hx_ + rx - 2), int(hy_), hx('#ff4a3a'))
                    c.vline(int(hx_ - 0.5), int(hy_ - 0.5), int(hy_ + ry), m[2])
            else:
                c.rect(int(hx_ - rx + 0.5), int(hy_ - 0.5), int(2 * rx), int(ry), m[1])
            if self.plume:
                pr = P[self.plume]
                if view == 'side':
                    c.thick(hx_ - 0.5, hy_ - ry - 0.5, hx_ - rx - 1.5, hy_ - ry + 1.5, 2.2, pr[2])
                    c.px(int(hx_ - 0.5), int(hy_ - ry - 1), pr[3])
                else:
                    c.thick(hx_ - 0.5, hy_ - ry - 1.5, hx_ - 0.5, hy_ - ry + 0.5, 2.2, pr[2])
                    c.px(int(hx_ - 1), int(hy_ - ry - 2), pr[3])
        elif k in ('hood', 'hood_g', 'hood_p'):
            m = {'hood': P['cloth_g'], 'hood_g': P['cloth_g'], 'hood_p': P['purple']}[k]
            c.sphere(hx_ - (0.5 if view == 'side' else 0), hy_ - 0.5, rx + 0.8, ry + 0.8, m)
            if view == 'side':
                c.poly([(hx_ - rx, hy_ - 1), (hx_ - rx - 3, hy_ + 1), (hx_ - rx + 1, hy_ + 2)], m[1])
                c.ellipse(hx_ + 1.2, hy_ + 0.6, rx * 0.55, ry * 0.6, darken(P[self.skin][1], 0.6))
                c.px(int(hx_ + rx * 0.5), int(hy_ + 0.2), P['green_fx'][3] if k != 'hood' else hx('#ffe07a'))
            elif view == 'front':
                c.ellipse(hx_, hy_ + 0.8, rx * 0.65, ry * 0.6, darken(P[self.skin][1], 0.55))
                c.px(int(hx_ - 1.5), int(hy_ + 0.5), P['green_fx'][3] if k != 'hood' else hx('#ffe07a'))
                c.px(int(hx_ + 1), int(hy_ + 0.5), P['green_fx'][3] if k != 'hood' else hx('#ffe07a'))
            else:
                c.poly([(hx_ - 1.5, hy_ + ry - 1), (hx_ + 1.5, hy_ + ry - 1), (hx_, hy_ + ry + 2)], m[1])
        elif k == 'wizard':
            m = P['purple']
            c.ellipse(hx_, hy_ - ry + 1.2, rx + 2.5, 1.4, m[1])
            c.poly([(hx_ - rx + 0.5, hy_ - ry + 1), (hx_ + rx - 0.5, hy_ - ry + 1), (hx_ - 2, hy_ - ry - 7)], m[2])
            c.px(int(hx_ - 1), int(hy_ - ry - 2), P['gold'][3])

    def draw_leg(self, c, hipx, hipy, fx, fy, ramp, boot, view, facing=1):
        c.limb(hipx, hipy, fx, fy - 1, self.leg_w, ramp)
        b = boot
        if view == 'side':
            c.rect(int(fx - 1), int(fy - 1), 3 + (1 if self.leg_w > 3 else 0), 2, b[1])
            c.px(int(fx + 1), int(fy - 1), b[2])
        else:
            w = max(2, int(self.leg_w + 0.5))
            c.rect(int(fx - w / 2), int(fy - 1), w, 2, b[1])
            c.px(int(fx - w / 2), int(fy - 1), b[2])

    def arm_ramp(self):
        if self.armor in ('plate', 'plate_k', 'plate_g'):
            return P['metal'] if self.armor != 'plate_k' else R_K
        if self.armor == 'ribs':
            return P['bone']
        return P[self.shirt] if self.armor in ('robe', 'sleeve') else P[self.skin]

    def draw_wing(self, c, bx, by, sgn, f, view):
        k = self.wings
        m = [hx('#1e0e2a'), hx('#3a1a4e'), hx('#5a2a6e'), hx('#7e3e8e')] if k == 'demon' else P['fur']
        bn = P['dark'] if k == 'demon' else P['fur']
        S = self.s * 0.82
        tip1 = (bx + sgn * 5 * S, by - 9 * S - f * 2 * S)
        tip2 = (bx + sgn * 12 * S, by - 6 * S - f * 3 * S)
        tip3 = (bx + sgn * 11 * S, by + 2 * S - f * 1.5 * S)
        low = (bx + sgn * 5 * S, by + 6 * S)
        c.poly([(bx, by), tip1, tip2, tip3, low], m[1])
        c.poly([(bx, by + 1), (tip1[0], tip1[1] + 2), (tip2[0] - sgn, tip2[1] + 2), (bx + sgn * 6 * S, by + 1 * S)], m[2])
        for t in (tip1, tip2, tip3):
            c.line(bx, by, t[0], t[1], bn[0])
        c.px(*tip1, P['bone'][2])
        c.px(*tip2, P['bone'][2])

    # --------------------------------------------------------- side view
    def side(self, st):
        """st: bob, legs [(dx,lift)] near, far; arm_n, arm_f angles; wpn angle; lean."""
        bob = st.get('bob', 0)
        lean = st.get('lean', 0)
        fr = self.frame()
        hipx = self.cx + lean * 0.5
        hipy = self.hip_y(bob)
        x0, top, tw, th = self.torso_box(bob, 'side')
        shx, shy = self.cx + lean + 0.5, top + 2
        skin = P[self.skin]
        armr = self.arm_ramp()
        if self.wings:
            L = self.layer()
            self.draw_wing(L, shx - 1, shy + 1, -1, st.get('wing', 0), 'side')
            L.outline()
            fr.over(L)
        # cape (behind everything)
        if self.cape:
            L = self.layer()
            cr = P[self.cape]
            sw = st.get('cape', 0)
            L.poly([(shx - 1, shy - 1), (shx + 1, shy - 1), (shx - 2 - sw, hipy + self.leg_len - 1), (shx - 5 - sw, hipy + self.leg_len - 2)], cr[1])
            L.poly([(shx - 1, shy), (shx - 3.5 - sw, hipy + self.leg_len - 2.5), (shx - 2 - sw, hipy + self.leg_len - 2)], cr[2])
            L.outline()
            fr.over(L)
        # far arm
        L = self.layer()
        af = st.get('arm_f', 100)
        hfx = shx - 0.5 + math.cos(af * D2R) * self.arm_len
        hfy = shy + math.sin(af * D2R) * self.arm_len
        L.limb(shx - 0.5, shy, hfx, hfy, self.arm_w, dark_ramp(armr))
        L.disc(hfx, hfy, self.arm_w * 0.6, darken(skin[2], 0.72))
        if self.weapon in ('staff', 'staff_p') and st.get('two_hand'):
            pass
        L.outline()
        fr.over(L)
        # legs
        (n_dx, n_lift), (f_dx, f_lift) = st.get('legs', ((0, 0), (0, 0)))
        L = self.layer()
        self.draw_leg(L, hipx - 0.5, hipy, hipx + f_dx, self.ground - f_lift, dark_ramp(P[self.pants]), dark_ramp(P[self.boots]), 'side')
        L.outline()
        fr.over(L)
        L = self.layer()
        self.draw_leg(L, hipx + 0.5, hipy, hipx + n_dx, self.ground - n_lift, P[self.pants], P[self.boots], 'side')
        L.outline()
        fr.over(L)
        # torso
        L = self.layer()
        self.draw_torso(L, bob, 'side', lean)
        L.outline()
        fr.over(L)
        # head
        L = self.layer()
        self.draw_head(L, bob, 'side', lean, glow_eyes=st.get('glow_eyes', False))
        L.outline()
        fr.over(L)
        # shield (far arm, but in front of torso)
        if self.shield:
            L = self.layer()
            draw_shield(L, self.shield, x0 + tw + lean + 0.5, top + th * 0.55, 'side', self.s)
            L.outline()
            fr.over(L)
        # near arm + weapon
        an = st.get('arm_n', 80)
        hnx = shx + 0.5 + math.cos(an * D2R) * self.arm_len
        hny = shy + math.sin(an * D2R) * self.arm_len
        wa = st.get('wpn', an - 70)
        L = self.layer()
        behind = st.get('wpn_behind', False)
        if self.weapon and behind:
            W = self.layer()
            draw_weapon(W, self.weapon, hnx, hny, wa, self.wscale, st.get('glow', 0))
            W.outline()
            L.over(W)
        A = self.layer()
        A.limb(shx + 0.5, shy, hnx, hny, self.arm_w, armr)
        A.disc(hnx, hny, self.arm_w * 0.6, skin[2] if self.armor not in ('plate', 'plate_k', 'plate_g') else P['metal'][2] if self.armor != 'plate_k' else R_K[2])
        A.outline()
        if self.pauldron:
            Pd = self.layer()
            pr = P[self.pauldron] if isinstance(self.pauldron, str) else self.pauldron
            Pd.sphere(shx + 0.5, shy + 0.5, self.arm_w * 0.62 + 0.8, self.arm_w * 0.5 + 0.6, pr)
            Pd.outline()
            A.over(Pd)
        L.over(A)
        if self.weapon and not behind:
            W = self.layer()
            draw_weapon(W, self.weapon, hnx, hny, wa, self.wscale, st.get('glow', 0))
            W.outline()
            L.over(W)
        fr.over(L)
        return fr

    # -------------------------------------------------------- front/back
    def frontback(self, st, view):
        bob = st.get('bob', 0)
        fr = self.frame()
        cx = self.cx
        hipy = self.hip_y(bob)
        x0, top, tw, th = self.torso_box(bob, view)
        skin = P[self.skin]
        armr = self.arm_ramp()
        lw = self.leg_w
        lx = cx - lw / 2 - 0.6
        rx_ = cx + lw / 2 + 0.6
        ll, rl = st.get('legs', (0, 0))
        # in front view: weapon in character right hand => viewer left (sgn=-1)
        wside = -1 if view == 'front' else 1
        if self.wings:
            L = self.layer()
            for sg in (-1, 1):
                self.draw_wing(L, cx + sg * tw * 0.25, top + 2, sg, st.get('wing', 0), view)
            L.outline()
            fr.over(L)
        # back view: cape drawn over torso later; shield on back
        # arms behind torso when back view? arms at sides, drawn after torso for front.
        L = self.layer()
        self.draw_leg(L, lx + 0.3, hipy, lx, self.ground - ll, P[self.pants], P[self.boots], view)
        self.draw_leg(L, rx_ - 0.3, hipy, rx_, self.ground - rl, P[self.pants], P[self.boots], view)
        L.outline()
        fr.over(L)
        if view == 'front' and self.cape:
            L = self.layer()
            cr = P[self.cape]
            L.poly([(x0 - 1.5, top + 1), (x0 + tw + 0.5, top + 1), (x0 + tw + 1.5, hipy + 3), (x0 - 2.5, hipy + 3)], cr[1])
            L.outline()
            fr.over(L)
        L = self.layer()
        self.draw_torso(L, bob, view)
        L.outline()
        fr.over(L)
        # arms
        swing = st.get('swing', 0)
        for sgn in (-1, 1):
            L = self.layer()
            sx = x0 - 0.5 if sgn < 0 else x0 + tw - 0.5
            sy = top + 1.5
            hxx = sx + sgn * 0.8
            hyy = sy + self.arm_len - abs(swing) * 0.3 + (swing * sgn * 0.6)
            L.limb(sx + 0.5, sy, hxx + 0.5, hyy, self.arm_w, armr)
            hand = skin[2] if self.armor not in ('plate', 'plate_k', 'plate_g') else (P['metal'][2] if self.armor != 'plate_k' else R_K[2])
            L.disc(hxx + 0.5, hyy, self.arm_w * 0.6, hand)
            L.outline()
            if self.pauldron:
                Pd = self.layer()
                pr = P[self.pauldron] if isinstance(self.pauldron, str) else self.pauldron
                Pd.sphere(sx + 0.5, sy + 0.3, self.arm_w * 0.62 + 0.8, self.arm_w * 0.5 + 0.6, pr)
                Pd.outline()
                L.over(Pd)
            if sgn == wside and self.weapon:
                W = self.layer()
                out_t = 18 if self.wscale > 1.3 else 0
                wang = (-100 - out_t) if sgn < 0 else (-80 + out_t)
                draw_weapon(W, self.weapon, hxx + 0.5, hyy, wang + st.get('wtilt', 0), self.wscale, st.get('glow', 0))
                W.outline()
                if view == 'back':
                    fr.over(W)
                    fr.over(L)
                else:
                    fr.over(L)
                    fr.over(W)
            else:
                fr.over(L)
                if sgn != wside and self.shield and view == 'front':
                    S = self.layer()
                    draw_shield(S, self.shield, hxx + 0.5 + sgn * 0.5, hyy - 1.5, 'front', self.s)
                    S.outline()
                    fr.over(S)
        # head
        L = self.layer()
        self.draw_head(L, bob, view, glow_eyes=st.get('glow_eyes', False))
        L.outline()
        fr.over(L)
        if view == 'back':
            if self.cape:
                L = self.layer()
                cr = P[self.cape]
                sw = st.get('cape', 0)
                L.poly([(x0 - 0.5, top), (x0 + tw - 0.5, top), (x0 + tw + 1 + sw, hipy + 3), (x0 - 2 + sw, hipy + 3)], cr[2])
                L.poly([(x0 + 1, top + 1), (x0 + tw * 0.45, top + 1), (x0 + tw * 0.4 + sw, hipy + 2), (x0 - 0.5 + sw, hipy + 2)], cr[3])
                L.outline()
                fr.over(L)
            if self.shield:
                S = self.layer()
                draw_shield(S, self.shield, x0 - 1.0, top + th * 0.6, 'back', self.s * 0.85)
                S.outline()
                fr.over(S)
        return fr

    # -------------------------------------------------------- animations
    def walk_side(self, n=6):
        out = []
        for i in range(n):
            p = 2 * math.pi * i / n
            s = math.sin(p)
            cs = math.cos(p)
            st = {
                'bob': -1 if abs(s) < 0.6 else 0,
                'legs': ((s * self.stride, max(0, cs) * 1.5 * self.s), (-s * self.stride, max(0, -cs) * 1.5 * self.s)),
                'arm_n': 85 - s * 30, 'arm_f': 95 + s * 30,
                'wpn': 85 - s * 30 - 75,
                'cape': int(round(abs(s))),
                'wing': cs,
            }
            out.append(self.side(st))
        return out

    def walk_fb(self, view, n=4):
        out = []
        for i in range(n):
            p = 2 * math.pi * i / n
            s = math.sin(p)
            st = {
                'bob': -1 if abs(s) < 0.5 else 0,
                'legs': (max(0, s) * 2 * self.s, max(0, -s) * 2 * self.s),
                'swing': s * 2,
                'cape': int(round(s)),
                'wtilt': s * 8,
                'wing': math.cos(p),
            }
            out.append(self.frontback(st, view))
        return out

    def idle(self, n=4):
        out = []
        for i in range(n):
            b = [0, 0, 1, 1][i % 4] if n == 4 else (1 if i >= n // 2 else 0)
            st = {'bob': b * 0, 'legs': ((1, 0), (-1, 0)), 'arm_n': 75, 'arm_f': 100,
                  'wpn': -20 + b * 4, 'glow': b * 0.5, 'wing': math.sin(2 * math.pi * i / n)}
            fr = self.side(st)
            if b:
                # breathe: shift upper body by 1px down using torso bob
                st2 = dict(st)
                st2['bob'] = 0
                fr = self.side_breathe(st2)
            out.append(fr)
        return out

    def side_breathe(self, st):
        # draw legs at normal hip, upper body 1px lower
        saved = self.ground
        fr = self.side(st)
        top = self.frame()
        # move pixels above hip down by 1 (cheap breathing)
        hy = int(self.hip_y(0)) - 1
        top.a[1:hy + 1] = fr.a[0:hy]
        top.a[hy + 1:] = fr.a[hy + 1:]
        return top

    def attack(self, kind=None):
        k = kind or self.weapon
        seq = []
        if k in ('staff', 'staff_p'):
            # cast: raise staff, glow, release
            poses = [(60, -30, 0, 0), (20, -60, 0, 0.3), (-30, -85, 0, 0.8), (-45, -95, -1, 1.5),
                     (-45, -95, -1, 2.2), (0, -60, 1, 0.6), (50, -30, 0, 0)]
            for an, wa, lean, g in poses:
                seq.append(self.side({'arm_n': an, 'wpn': wa, 'arm_f': 60 if g > 1 else 100, 'lean': lean,
                                      'glow': g, 'legs': ((1.5, 0), (-1.5, 0))}))
            return seq
        if k == 'spear':
            poses = [(70, 0, 0), (110, -5, -1), (120, -5, -1), (10, 0, 2), (5, 0, 2), (60, 0, 0)]
            for an, wa, lean in poses:
                # spear held horizontally; arm angle changes hand x
                seq.append(self.side({'arm_n': an, 'wpn': wa, 'lean': lean, 'legs': ((2, 0), (-2, 0))}))
            return seq
        # slash
        poses = [(80, -40, 0, False), (-60, -150, -1, True), (-110, -175, -1, True), (10, 30, 1, False),
                 (50, 70, 1, False), (80, 0, 0, False)]
        for i, (an, wa, lean, behind) in enumerate(poses):
            fr = self.side({'arm_n': an, 'wpn': wa, 'lean': lean, 'wpn_behind': behind,
                            'legs': ((2 if i >= 3 else 1, 0), (-2, 0)), 'arm_f': 100,
                            'glow': 1 if i == 3 else 0})
            if i == 3:
                self.swoosh(fr)
            seq.append(fr)
        return seq

    def swoosh(self, fr):
        x0, top, tw, th = self.torso_box(0, 'side')
        cx = self.cx + 2
        cy = top + 2
        r = self.arm_len + 7 * self.wscale
        for a in range(-80, 50, 4):
            for dr in (0, 1):
                x = cx + math.cos(a * D2R) * (r - dr)
                y = cy + math.sin(a * D2R) * (r - dr)
                if fr.get(int(x), int(y))[3] == 0:
                    fr.px(x, y, WHITE if dr == 0 else hx('#cfe8ff'))

    def death(self):
        base = self.side({'legs': ((1, 0), (-1, 0)), 'arm_n': 80, 'arm_f': 110, 'wpn': 70})
        out = []
        out.append(base.copy().tint(WHITE, 0.6))
        gx, gy = self.cx - 1, self.ground
        for ang, dx in ((-15, -1), (-45, -2), (-75, -2)):
            out.append(rot_fit(base, ang, gx, gy, self.ground, dx))
        lying = rot_fit(base, -90, gx, gy, self.ground, 0, center=True)
        out.append(lying.shift(0, -1))
        out.append(lying.copy())
        for i, t in enumerate((0.3, 0.65)):
            f = lying.copy().dissolve(t)
            soul(f, self.cx, self.ground - 6 - i * 5, i)
            out.append(f)
        return out


def rot_fit(fr, ang, px_, py_, ground, dx=0, center=False):
    big = Canvas(fr.w * 2, fr.h * 2)
    ox, oy = fr.w // 2, fr.h // 2
    big.blit(fr, ox, oy)
    r = big.rotate(ang, px_ + ox, py_ + oy)
    m = r.a[:, :, 3] > 0
    ys, xs = m.nonzero()
    out = Canvas(fr.w, fr.h)
    if len(ys) == 0:
        return out
    shift_y = min(0, ground - (ys.max() - oy))
    if center:
        shift_x = int(round(fr.w / 2 - ((xs.min() + xs.max()) / 2 - ox)))
    else:
        shift_x = dx
    out.blit(r, -ox + shift_x, -oy + shift_y)
    return out


def soul(fr, x, y, i):
    c1, c2 = hx('#e8f4ff'), hx('#9ec4e8')
    pts = [(0, 0), (1, 0), (-1, 1), (0, 1), (1, 1), (2, 1), (-1, 2), (0, 2), (1, 2), (2, 2), (0, 3), (1, 3), (1 - i, 4)]
    for ax, ay in pts:
        fr.px(x + ax - 0.5, y + ay, c1 if ay < 2 else c2)
    fr.px(x - 0.5, y + 1, hx('#2a3a5a'))
    fr.px(x + 1.5, y + 1, hx('#2a3a5a'))


def darken_r(r, f=0.75):
    return [darken(c, f) for c in r]


def soul_puff(fr, cx, cy, t):
    """Little rising soul wisp used on death frames."""
    pass


def build_humanoid_sheet(name, h, extra_anims=None, attack_fps=12):
    sh = Sheet(name, h.fw, h.fh, anchor=(int(h.cx), h.ground))
    sh.add('idle', h.idle(), fps=6)
    sh.add('walk_side', h.walk_side(), fps=10)
    sh.add('walk_down', h.walk_fb('front'), fps=8)
    sh.add('walk_up', h.walk_fb('back'), fps=8)
    atk = h.attack()
    sh.add('attack', atk, fps=attack_fps, loop=False, hitFrame=3)
    sh.add('death', h.death(), fps=10, loop=False)
    if extra_anims:
        for nm, frs, fps, loop in extra_anims:
            sh.add(nm, frs, fps=fps, loop=loop)
    sh.extra['facing'] = 'right (flip X for left)'
    return sh
