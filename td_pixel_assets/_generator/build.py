"""Build the whole asset pack into out/td_pixel_assets."""
import json
import math
import os
import shutil

from PIL import Image

from px import Canvas, Sheet, P, WHITE, hx
from chars import build_humanoid_sheet
from roster import ROSTER
from creatures import Wolf, Bat
import towers as TW
import fx
import tiles as TL
import ui as U

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, 'out', 'td_pixel_assets')
MANIFEST = []  # entries for preview page


def reg(cat, sh, path, **kw):
    d = {'cat': cat, 'name': sh.name, 'png': os.path.relpath(path, ROOT), 'fw': sh.fw, 'fh': sh.fh,
         'anchor': list(sh.anchor),
         'anims': [{'name': a, 'row': i, 'frames': len(f), 'fps': fps, 'loop': loop}
                   for i, (a, f, fps, loop, meta) in enumerate(sh.rows)]}
    d.update(kw)
    MANIFEST.append(d)


def save_sheet(cat, sh, sub, **kw):
    p = sh.save(ROOT, sub)
    reg(cat, sh, p, **kw)
    return p


def single(name, canvas, fps=1):
    sh = Sheet(name, canvas.w, canvas.h, anchor=(canvas.w // 2, canvas.h - 2))
    sh.add('default', [canvas], fps=fps, loop=False)
    return sh


# ----------------------------------------------------------- characters
def build_characters():
    enemies = ['goblin', 'orc', 'skeleton', 'shaman', 'dark_knight', 'ogre', 'demon_boss']
    stats = {
        'goblin': dict(hp=20, speed='fast', armor='none', gold=3),
        'orc': dict(hp=80, speed='medium', armor='low', gold=10),
        'skeleton': dict(hp=60, speed='medium', armor='low', gold=8),
        'shaman': dict(hp=50, speed='medium', armor='magic res', gold=12, note='heals allies (use attack row as cast)'),
        'dark_knight': dict(hp=180, speed='slow', armor='high', gold=20),
        'ogre': dict(hp=600, speed='slow', armor='none', gold=40, size='large'),
        'demon_boss': dict(hp=3000, speed='slow', armor='medium', gold=200, size='boss'),
        'wolf': dict(hp=35, speed='very fast', armor='none', gold=5),
        'bat': dict(hp=30, speed='fast', armor='none', gold=6, flying=True),
    }
    for nm in enemies:
        h = ROSTER[nm]()
        sh = build_humanoid_sheet(nm, h)
        sh.extra['suggestedStats'] = stats[nm]
        save_sheet('enemies', sh, 'enemies', stats=stats[nm])
    w = Wolf().sheet('wolf')
    w.extra['suggestedStats'] = stats['wolf']
    save_sheet('enemies', w, 'enemies', stats=stats['wolf'])
    b = Bat().sheet('bat')
    b.extra['suggestedStats'] = stats['bat']
    save_sheet('enemies', b, 'enemies', stats=stats['bat'])

    # hero with special
    h = ROSTER['hero_paladin']()
    special = []
    poses = [(70, -20, 0), (10, -60, 0), (-60, -95, 0), (-80, -95, 0), (-80, -95, 0), (-80, -95, 0), (30, -30, 0)]
    for i, (an, wa, g) in enumerate(poses):
        fr = h.side({'arm_n': an, 'wpn': wa, 'legs': ((1.5, 0), (-1.5, 0)), 'arm_f': 100, 'glow': 1})
        if 2 <= i <= 5:
            k = i - 2
            for a in range(0, 360, 30):
                r = 5 + k * 3
                x = h.cx + math.cos(math.radians(a + k * 15)) * r
                y = h.ground - 1 + math.sin(math.radians(a + k * 15)) * r * 0.35
                fr.px(x, y, P['gold'][3] if a % 60 else WHITE)
            for s in range(3):
                fr.px(h.cx + 4 + s, 2 + (k * 2 + s * 3) % 8, P['gold'][3])
        special.append(fr)
    sh = build_humanoid_sheet('hero_paladin', h, extra_anims=[('special', special, 10, False)])
    save_sheet('heroes', sh, 'heroes')

    sh = build_humanoid_sheet('soldier', ROSTER['soldier']())
    save_sheet('units', sh, 'units')

    # tower units
    sh = Sheet('archer_unit', 16, 16, anchor=(8, 14))
    for view in ('side', 'down', 'up'):
        sh.add(f'idle_{view}', [TW.archer_unit('idle', view, i) for i in range(4)], fps=4)
        sh.add(f'shoot_{view}', [TW.archer_unit(p, view, 0) for p in ('draw', 'hold', 'hold', 'release', 'recover')],
               fps=12, loop=False, releaseFrame=3)
    save_sheet('units', sh, 'units')
    sh = Sheet('mage_unit', 16, 20, anchor=(8, 18))
    sh.add('idle', [TW.mage_unit('idle', i) for i in range(4)], fps=4)
    sh.add('cast', [TW.mage_unit('cast', i) for i in range(6)], fps=12, loop=False, releaseFrame=3)
    save_sheet('units', sh, 'units')


# --------------------------------------------------------------- towers
def build_towers():
    for lv in (1, 2, 3):
        frames = []
        for i in range(4):
            c, uy = TW.archer_tower(lv, i * math.pi / 2)
            frames.append(c)
        sh = Sheet(f'archer_tower_l{lv}', 64, 64, anchor=(32, 57))
        sh.add('idle', frames, fps=6)
        slots = [{'x': 26, 'y': uy}, {'x': 38, 'y': uy}]
        sh.extra['unitSlots'] = slots
        sh.extra['unit'] = 'units/archer_unit.png'
        save_sheet('towers', sh, 'towers', unitSlots=slots, unit='archer_unit')

        idle, atk = [], []
        for i in range(6):
            c, uy = TW.mage_tower(lv, i * math.pi / 3, 0.0)
            idle.append(c)
        for i, ch in enumerate((0.3, 0.7, 1.0, 1.0, 0.5, 0.1)):
            c, uy = TW.mage_tower(lv, i * math.pi / 3, ch)
            atk.append(c)
        sh = Sheet(f'mage_tower_l{lv}', 64, 64, anchor=(32, 57))
        sh.add('idle', idle, fps=8)
        sh.add('attack', atk, fps=12, loop=False, releaseFrame=3)
        slots = [{'x': 32, 'y': uy}]
        sh.extra['unitSlots'] = slots
        sh.extra['unit'] = 'units/mage_unit.png'
        save_sheet('towers', sh, 'towers', unitSlots=slots, unit='mage_unit')

        idle = []
        for i in range(4):
            c, mo = TW.artillery_tower(lv, phase=i * math.pi / 2)
            idle.append(c)
        atk = []
        seq = [(0, 0, 0), (2, 1.0, 0.05), (3, 0.6, 0.2), (2, 0, 0.35), (1, 0, 0.5), (1, 0, 0.65), (0, 0, 0.8), (0, 0, 0.95)]
        for i, (rc, fl, sm) in enumerate(seq):
            c, _ = TW.artillery_tower(lv, rc, fl, sm, phase=i * math.pi / 4)
            atk.append(c)
        sh = Sheet(f'artillery_tower_l{lv}', 64, 64, anchor=(32, 57))
        sh.add('idle', idle, fps=6)
        sh.add('attack', atk, fps=14, loop=False, releaseFrame=1)
        sh.extra['projectileOrigin'] = {'x': round(mo[0]), 'y': round(mo[1])}
        save_sheet('towers', sh, 'towers', projectileOrigin=[round(mo[0]), round(mo[1])])

        idle = [TW.barracks(lv, i * math.pi / 2) for i in range(4)]
        door = [TW.barracks(lv, i * math.pi / 3, d) for i, d in enumerate((0.25, 0.55, 0.9, 0.9, 0.55, 0.25))]
        sh = Sheet(f'barracks_l{lv}', 64, 64, anchor=(32, 57))
        sh.add('idle', idle, fps=6)
        sh.add('door', door, fps=10, loop=False, spawnFrame=2)
        sh.extra['spawnPoint'] = {'x': 32, 'y': 52}
        save_sheet('towers', sh, 'towers', spawnPoint=[32, 52])

    sh = Sheet('build_plot', 64, 64, anchor=(32, 53))
    sh.add('idle', [TW.build_plot()], fps=1)
    sh.add('hover', [TW.build_plot(True, i * math.pi / 2) for i in range(4)], fps=8)
    save_sheet('towers', sh, 'towers')
    sh = Sheet('construction', 64, 64, anchor=(32, 53))
    sh.add('build', [TW.construction(i) for i in range(8)], fps=8, loop=False)
    save_sheet('towers', sh, 'towers')


# ------------------------------------------------------------ fx/projs
def build_fx():
    sh = Sheet('arrow', 16, 16, anchor=(8, 8))
    sh.add('fly_8dir', [fx.arrow(a) for a in range(0, 360, 45)], fps=1, loop=False,
           note='frame i = angle i*45deg, 0=right, clockwise (screen y down)')
    sh.add('fly_16dir', [fx.arrow(a) for a in [x * 22.5 for x in range(16)]], fps=1, loop=False)
    save_sheet('projectiles', sh, 'projectiles')
    for nm, fn, n, fps in (('magic_bolt', fx.magic_bolt, 4, 14), ('bomb', fx.bomb, 4, 12),
                           ('fireball', fx.fireball, 4, 14), ('heal_orb', fx.heal_orb, 4, 10)):
        sh = Sheet(nm, 16, 16, anchor=(8, 8))
        sh.add('fly', [fn(i) for i in range(n)], fps=fps)
        save_sheet('projectiles', sh, 'projectiles')

    specs = [
        ('explosion', 48, 48, [fx.explosion(i) for i in range(9)], 16, False, (24, 36)),
        ('magic_hit', 32, 32, [fx.magic_hit(i) for i in range(6)], 14, False, (16, 16)),
        ('hit_spark', 16, 16, [fx.hit_spark(i) for i in range(4)], 16, False, (8, 8)),
        ('smoke_puff', 32, 32, [fx.smoke_puff(i) for i in range(6)], 10, False, (16, 24)),
        ('dust', 32, 32, [fx.dust(i) for i in range(6)], 12, False, (16, 24)),
        ('coin_spin', 16, 16, [fx.coin(i) for i in range(6)], 12, True, (8, 8)),
        ('upgrade_sparkle', 48, 48, [fx.upgrade_sparkle(i) for i in range(8)], 12, False, (24, 44)),
        ('heal', 32, 32, [fx.heal(i) for i in range(6)], 10, False, (16, 26)),
        ('flame', 16, 24, [fx.flame(i) for i in range(6)], 12, True, (8, 21)),
        ('portal', 48, 48, [fx.portal(i) for i in range(8)], 10, True, (24, 36)),
        ('soul', 16, 24, [fx.soul_fx(i) for i in range(6)], 10, False, (8, 20)),
        ('hero_respawn', 32, 48, [fx.hero_beam(i) for i in range(8)], 12, False, (16, 44)),
        ('slow_rune', 32, 16, [fx.freeze_slow(i) for i in range(4)], 8, True, (16, 8)),
    ]
    for nm, w, h, frames, fps, loop, anc in specs:
        sh = Sheet(nm, w, h, anchor=anc)
        sh.add('play', frames, fps=fps, loop=loop)
        save_sheet('effects', sh, 'effects')
    for nm, w, h in (('shadow_small', 16, 6), ('shadow_medium', 24, 8), ('shadow_large', 40, 12)):
        sh = single(nm, fx.shadow(w, h))
        sh.anchor = (w // 2, h // 2)
        save_sheet('effects', sh, 'effects')


# ---------------------------------------------------------------- tiles
def build_tiles():
    d = os.path.join(ROOT, 'tiles')
    os.makedirs(d, exist_ok=True)
    sheets = TL.terrain_sheets()
    for nm, (tl, names, cols) in sheets.items():
        im, meta = TL.pack_tiles(tl, names, cols)
        im.save(os.path.join(d, nm + '.png'))
        info = {'tileSize': 32, 'columns': cols, 'tiles': meta,
                'autotile': {
                    'layout': 'TL T TR / L C R / BL B BR = outer edges of the region; iTL..iBR = inner (concave) corners, '
                              'named by the corner where grass remains',
                    'seamless': 'all edge tiles share the same periodic border so any combination tiles cleanly'}}
        if nm == 'terrain_water':
            info['animation'] = {'frames': 4, 'fps': 4, 'naming': 'water_<KIND>_f<frame>'}
        with open(os.path.join(d, nm + '.json'), 'w') as f:
            json.dump(info, f, indent=1)
        MANIFEST.append({'cat': 'tiles', 'name': nm, 'png': f'tiles/{nm}.png', 'tile': 32, 'cols': cols,
                         'count': len(tl)})


# ---------------------------------------------------------------- props
def pack_atlas(name, items, sub, cat):
    """Shelf-pack (name, canvas) into one atlas with TexturePacker-hash JSON."""
    d = os.path.join(ROOT, sub)
    os.makedirs(d, exist_ok=True)
    W = 256
    x = y = rowh = 0
    pos = []
    for nm, cv in items:
        if x + cv.w > W:
            x = 0
            y += rowh + 1
            rowh = 0
        pos.append((nm, cv, x, y))
        x += cv.w + 1
        rowh = max(rowh, cv.h)
    H = y + rowh
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    frames = {}
    for nm, cv, px_, py_ in pos:
        im.paste(cv.img(), (px_, py_))
        frames[nm] = {'frame': {'x': px_, 'y': py_, 'w': cv.w, 'h': cv.h}, 'rotated': False, 'trimmed': False,
                      'spriteSourceSize': {'x': 0, 'y': 0, 'w': cv.w, 'h': cv.h},
                      'sourceSize': {'w': cv.w, 'h': cv.h}, 'pivot': {'x': 0.5, 'y': 0.92}}
    im.save(os.path.join(d, name + '.png'))
    with open(os.path.join(d, name + '.json'), 'w') as f:
        json.dump({'frames': frames, 'meta': {'image': name + '.png', 'size': {'w': W, 'h': H}, 'scale': '1',
                                               'format': 'RGBA8888'}}, f, indent=1)
    MANIFEST.append({'cat': cat, 'name': name, 'png': f'{sub}/{name}.png', 'atlas': {k: v['frame'] for k, v in frames.items()}})


def build_props():
    static = [
        ('oak_tree', TL.oak_tree()), ('oak_tree_apples', TL.oak_tree(0, 1)), ('pine_tree', TL.pine_tree()),
        ('pine_tree_b', TL.pine_tree(0, 1)), ('bush', TL.bush()), ('bush_b', TL.bush(1)), ('bush_berries', TL.bush(0, True)),
        ('rock_small', TL.rock(0)), ('rock_medium', TL.rock(1, 1)), ('rock_medium_mossy', TL.rock(1, 2, True)),
        ('rock_large', TL.rock(2, 2)), ('rock_large_mossy', TL.rock(2, 3, True)), ('stump', TL.stump()),
        ('mushrooms', TL.mushrooms()), ('flowers_a', TL.flowers(0)), ('flowers_b', TL.flowers(3)),
        ('fence_h', TL.fence('h')), ('fence_v', TL.fence('v')), ('signpost', TL.signpost()), ('barrel', TL.barrel()),
        ('crate', TL.crate()), ('bones', TL.bones()), ('bridge', TL.bridge()), ('well', TL.well()), ('tent', TL.tent()),
        ('ruin_pillar', TL.ruin_pillar()), ('ruin_pillar_broken', TL.ruin_pillar(True)), ('cave_entrance', TL.cave_entrance()),
    ]
    pack_atlas('props_static', static, 'props', 'props')
    anim = [
        ('oak_tree_sway', 48, 64, [TL.oak_tree(s) for s in (0, 1, 1, 0, -1, -1)], 4, (24, 58)),
        ('pine_tree_sway', 32, 56, [TL.pine_tree(s) for s in (0, 1, 1, 0, -1, -1)], 4, (16, 51)),
        ('tall_grass_sway', 16, 16, [TL.tall_grass(s) for s in (0, 1, 0, -1)], 4, (8, 14)),
        ('campfire', 32, 32, [TL.campfire(i) for i in range(6)], 10, (16, 27)),
        ('kingdom_gate', 80, 64, [TL.kingdom_gate(i * math.pi / 2) for i in range(4)], 6, (40, 58)),
    ]
    for nm, w, h, frames, fps, anc in anim:
        sh = Sheet(nm, w, h, anchor=anc)
        sh.add('loop', frames, fps=fps)
        save_sheet('props', sh, 'props')


# ------------------------------------------------------------------- UI
def build_ui():
    d = os.path.join(ROOT, 'ui')
    os.makedirs(d, exist_ok=True)
    pack_atlas('icons_16', [(n, U.icon(n)) for n in U.ICONS], 'ui', 'ui')
    btns = []
    for n in ('pause', 'play', 'fast', 'gear', 'upgrade', 'sell', 'rally', 'info', 'close', 'hero'):
        for st in ('normal', 'pressed', 'disabled'):
            btns.append((f'btn_{n}_{st}', U.button_with_icon(n, st)))
    for st in ('normal', 'pressed', 'disabled'):
        btns.append((f'btn_round_blank_{st}', U.round_button(st)))
        btns.append((f'btn_rect_green_{st}', U.rect_button(64, 20, st)))
        btns.append((f'btn_rect_red_{st}', U.rect_button(64, 20, st, P['red'])))
    pack_atlas('buttons', btns, 'ui', 'ui')
    hud = []
    for t in ('archer', 'mage', 'artillery', 'barracks'):
        hud.append((f'build_{t}', U.build_slot(t)))
        hud.append((f'build_{t}_locked', U.build_slot(t, True)))
    hud += [('panel_wood', U.panel('wood')), ('panel_stone', U.panel('stone')), ('panel_parchment', U.panel('parch')),
            ('hp_frame', U.bar_frame()), ('hp_fill_green', U.bar_fill()), ('hp_fill_yellow', U.bar_fill(ramp=P['gold'])),
            ('hp_fill_red', U.bar_fill(ramp=P['red'])), ('boss_bar_frame', U.boss_bar()),
            ('boss_bar_fill', U.bar_fill(90, 4, P['red'])), ('cursor_point', U.cursor()), ('cursor_gold', U.cursor('gold')),
            ('range_ok', U.range_circle(64, 40, True)), ('range_bad', U.range_circle(64, 40, False))]
    pack_atlas('hud', hud, 'ui', 'ui')
    sh = Sheet('wave_call_button', 32, 32, anchor=(16, 16))
    sh.add('pulse', [U.wave_button(i) for i in range(4)], fps=6)
    save_sheet('ui', sh, 'ui')
    sh = Sheet('rally_flag', 16, 20, anchor=(4, 18))
    sh.add('wave', [U.rally_flag(i) for i in range(4)], fps=8)
    save_sheet('ui', sh, 'ui')
    f, chars, gw, gh = U.font_sheet()
    f.img().save(os.path.join(d, 'font_digits.png'))
    with open(os.path.join(d, 'font_digits.json'), 'w') as fp:
        json.dump({'glyphWidth': gw, 'glyphHeight': gh, 'chars': ''.join(chars),
                   'note': 'monospace, char i at x=i*glyphWidth'}, fp, indent=1)
    MANIFEST.append({'cat': 'ui', 'name': 'font_digits', 'png': 'ui/font_digits.png', 'font': ''.join(chars), 'gw': gw, 'gh': gh})


def palette():
    keys = list(P.keys())
    im = Image.new('RGBA', (5 * 8, len(keys) * 8), (0, 0, 0, 0))
    for r, k in enumerate(keys):
        for i, c in enumerate(P[k]):
            im.paste(c, (i * 8, r * 8, i * 8 + 8, r * 8 + 8))
    im.save(os.path.join(ROOT, 'palette.png'))
    with open(os.path.join(ROOT, 'palette.json'), 'w') as f:
        json.dump({k: ['#%02x%02x%02x' % v[:3] for v in P[k]] for k in keys}, f, indent=1)


if __name__ == '__main__':
    if os.path.exists(ROOT):
        shutil.rmtree(ROOT)
    os.makedirs(ROOT)
    build_characters()
    print('chars ok')
    build_towers()
    print('towers ok')
    build_fx()
    print('fx ok')
    build_tiles()
    print('tiles ok')
    build_props()
    print('props ok')
    build_ui()
    print('ui ok')
    palette()
    with open(os.path.join(HERE, 'out', 'manifest.json'), 'w') as f:
        json.dump(MANIFEST, f)
    print(len(MANIFEST), 'entries')
