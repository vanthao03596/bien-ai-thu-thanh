import { anim, frameAt, sheet } from '../assets'
import { VIEW_H, VIEW_W } from '../data/levels'
import { RANGE_SQUASH, towerSheet } from '../data/towers'
import type { Gfx } from '../gfx'
import { BUILD_TIME, type World } from '../sim/world'
import type { Enemy, Plot, Projectile, Soldier, Tower } from '../sim/types'
import type { MapProp, MapView } from './map'

export interface RangeMarker {
  x: number
  y: number
  r: number
  ok: boolean
}

export interface SceneOptions {
  /** wall-clock seconds, drives idle loops that are not part of the simulation */
  time: number
  hoverPlot: Plot | null
  selectedPlot: Plot | null
  selectedTower: Tower | null
  heroSelected: boolean
  ranges: RangeMarker[]
}

interface Drawable {
  y: number
  draw: () => void
}

function hpBar(g: Gfx, x: number, y: number, ratio: number): void {
  const left = Math.round(x) - 10
  g.frame('ui/hud', 'hp_frame', left, y)
  const fill = ratio > 0.5 ? 'hp_fill_green' : ratio > 0.25 ? 'hp_fill_yellow' : 'hp_fill_red'
  g.framePart('ui/hud', fill, left + 1, y + 1, Math.max(1, Math.round(18 * ratio)), 3)
}

function drawProp(g: Gfx, p: MapProp, time: number): void {
  switch (p.kind) {
    case 'static':
      g.framePivot('props/props_static', p.frame, p.x, p.y)
      break
    case 'oak':
      g.spriteAt('props/oak_tree_sway', 'loop', time + p.phase, p.x, p.y)
      break
    case 'pine':
      g.spriteAt('props/pine_tree_sway', 'loop', time + p.phase, p.x, p.y)
      break
    case 'campfire':
      g.spriteAt('props/campfire', 'loop', time + p.phase, p.x, p.y)
      break
    case 'grass':
      g.spriteAt('props/tall_grass_sway', 'loop', time + p.phase, p.x, p.y)
      break
  }
}

function drawPlot(g: Gfx, plot: Plot, time: number, lit: boolean): void {
  if (lit) g.spriteAt('towers/build_plot', 'hover', time, plot.x, plot.y)
  else g.sprite('towers/build_plot', 'idle', 0, plot.x, plot.y)
}

function drawTower(g: Gfx, t: Tower): void {
  if (t.buildT > 0) {
    g.sprite('towers/build_plot', 'idle', 0, t.x, t.y)
    g.spriteAt('towers/construction', 'build', BUILD_TIME - t.buildT, t.x, t.y)
    return
  }
  const key = towerSheet(t.type, t.level)
  const s = sheet(key)
  if (t.type === 'barracks') {
    if (t.doorT >= 0) g.spriteAt(key, 'door', t.doorT, t.x, t.y)
    else g.spriteAt(key, 'idle', t.animT, t.x, t.y)
    return
  }
  if (t.attackT >= 0 && s.anims.attack) g.spriteAt(key, 'attack', t.attackT, t.x, t.y)
  else g.spriteAt(key, 'idle', t.animT, t.x, t.y)

  const ox = t.x - s.ax
  const oy = t.y - s.ay
  t.units.forEach((u, i) => {
    const slot = s.unitSlots[i]
    if (!slot) return
    if (t.type === 'archer') {
      const shooting = u.shootT >= 0
      const name = `${shooting ? 'shoot' : 'idle'}_${u.dir}`
      g.spriteAt('units/archer_unit', name, shooting ? u.shootT : t.animT + i * 0.4, ox + slot.x, oy + slot.y, u.dir === 'side' && u.flip)
    } else {
      const casting = u.shootT >= 0
      g.spriteAt('units/mage_unit', casting ? 'cast' : 'idle', casting ? u.shootT : t.animT, ox + slot.x, oy + slot.y)
    }
  })
}

function drawEnemy(g: Gfx, e: Enemy, time: number): void {
  const def = e.def
  const alpha = e.state === 'dying' ? 1 : Math.min(1, e.age / 0.35)
  if (e.state !== 'dying' || def.flying) {
    const sh = sheet(def.shadow)
    g.sprite(def.shadow, 'default', 0, e.x, e.y + (def.flying ? 2 : 0) - sh.fh / 2 + sh.ay, false, alpha * 0.9)
  }
  if (e.slowT > 0 && e.state !== 'dying') g.spriteAt('effects/slow_rune', 'play', time, e.x, e.y, false, 0.9)
  const vertical = e.anim === 'walk_down' || e.anim === 'walk_up'
  const lift = def.flying && e.state !== 'dying' ? Math.round(Math.sin(time * 5 + e.id) * 1.5) : 0
  g.spriteAt(def.sheet, e.anim, e.animT, e.x, e.y + lift, !vertical && e.flip, alpha)
}

function drawSoldier(g: Gfx, s: Soldier, selected: boolean, time: number): void {
  if (s.state === 'dead') return
  if (s.state !== 'dying') g.sprite('effects/shadow_small', 'default', 0, s.x, s.y)
  if (selected) {
    const pulse = 1 + Math.round(Math.sin(time * 6))
    g.ring(s.x, s.y, 11 + pulse, 5 + pulse * 0.5, '#fff07a')
  }
  const vertical = s.anim === 'walk_down' || s.anim === 'walk_up'
  // reinforcements fade out shortly before their time is up
  const alpha = s.life < 1.5 && s.state !== 'dying' ? 0.55 + 0.45 * Math.abs(Math.sin(time * 10)) : 1
  g.spriteAt(s.sheet, s.anim, s.animT, s.x, s.y, !vertical && s.flip, alpha)
}

function drawProjectile(g: Gfx, p: Projectile, time: number): void {
  if (p.t < 0) return
  switch (p.kind) {
    case 'arrow': {
      const step = (Math.PI * 2) / 16
      const frame = ((Math.round(p.angle / step) % 16) + 16) % 16
      g.sprite('projectiles/arrow', 'fly_16dir', frame, p.x, p.y)
      break
    }
    case 'bolt':
      g.spriteAt('projectiles/magic_bolt', 'fly', time, p.x, p.y)
      break
    case 'bomb': {
      // the shadow travels on the ground under the arc
      const k = Math.min(1, p.t / p.dur)
      g.sprite('effects/shadow_small', 'default', 0, p.sx + (p.tx - p.sx) * k, p.sy + 26 + (p.ty - p.sy - 26) * k, false, 0.6)
      g.spriteAt('projectiles/bomb', 'fly', time, p.x, p.y)
      break
    }
    case 'fireball':
      g.spriteAt('projectiles/fireball', 'fly', time, p.x, p.y)
      break
    case 'heal':
      g.spriteAt('projectiles/heal_orb', 'fly', time, p.x, p.y)
      break
  }
}

export function drawScene(g: Gfx, world: World, map: MapView, o: SceneOptions): void {
  const time = o.time
  g.ctx.drawImage(map.groundAt(time), 0, 0)

  for (const r of o.ranges) g.rangeEllipse(r.x, r.y - 4, r.r, r.r * RANGE_SQUASH, r.ok)
  for (const fx of world.effects) {
    if (fx.layer === 'ground') g.spriteAt(fx.sheet, 'play', fx.t, fx.x, fx.y)
  }

  const items: Drawable[] = []
  for (const p of map.props) items.push({ y: p.y, draw: () => drawProp(g, p, time) })

  map.spawnPoints.forEach((p, i) => {
    const kind = world.level.spawns[i]
    if (kind === 'portal') {
      items.push({ y: p.y - 4, draw: () => g.spriteAt('effects/portal', 'play', time, p.x, p.y + 6) })
    } else if (kind === 'cave') {
      items.push({ y: p.y + 14, draw: () => g.framePivot('props/props_static', 'cave_entrance', p.x - 4, p.y + 14) })
    }
  })

  const gate = world.gate
  items.push({ y: gate.y - 6, draw: () => g.spriteAt('props/kingdom_gate', 'loop', time, gate.x, gate.y) })

  for (const plot of world.plots) {
    if (plot.tower) continue
    const lit = plot === o.hoverPlot || plot === o.selectedPlot
    items.push({ y: plot.y - 6, draw: () => drawPlot(g, plot, time, lit) })
  }
  for (const t of world.towers) items.push({ y: t.y, draw: () => drawTower(g, t) })
  for (const e of world.enemies) {
    // flying units sort by their ground position but always pass over walkers nearby
    items.push({ y: e.y + (e.def.flying ? 6 : 0), draw: () => drawEnemy(g, e, time) })
  }
  for (const s of world.soldiers) {
    const selected = o.heroSelected && s === world.hero
    items.push({ y: s.y + 0.5, draw: () => drawSoldier(g, s, selected, time) })
  }
  for (const f of world.flags) {
    items.push({ y: f.y, draw: () => g.spriteAt('ui/rally_flag', 'wave', f.t, f.x, f.y, false, Math.min(1, (2.5 - f.t) * 2)) })
  }
  const sel = o.selectedTower
  if (sel && sel.type === 'barracks' && sel.buildT <= 0) {
    items.push({ y: sel.rally.y, draw: () => g.spriteAt('ui/rally_flag', 'wave', time, sel.rally.x, sel.rally.y) })
  }

  items.sort((a, b) => a.y - b.y)
  for (const it of items) it.draw()

  for (const p of world.projectiles) drawProjectile(g, p, time)
  for (const fx of world.effects) {
    if (fx.layer === 'top') g.spriteAt(fx.sheet, 'play', fx.t, fx.x, fx.y)
  }

  // health bars sit above everything in the field
  let boss: Enemy | null = null
  for (const e of world.enemies) {
    if (e.state === 'dying') continue
    if (e.def.boss) {
      boss = e
      continue
    }
    if (e.hp < e.def.hp) hpBar(g, e.x, e.y - e.def.height - 7, e.hp / e.def.hp)
  }
  for (const s of world.soldiers) {
    if (s.state === 'dying' || s.state === 'dead') continue
    if (s.hp < s.maxHp || s === world.hero) hpBar(g, s.x, s.y - 30, s.hp / s.maxHp)
  }
  if (boss) {
    const bx = Math.round(VIEW_W / 2 - 52)
    const by = VIEW_H - 26
    g.frame('ui/hud', 'boss_bar_frame', bx, by)
    g.framePart('ui/hud', 'boss_bar_fill', bx + 7, by + 8, Math.round(90 * Math.max(0, boss.hp / boss.def.hp)), 4)
  }

  for (const f of world.floats) {
    const rise = f.t * 16
    const alpha = Math.min(1, (1 - f.t) * 3)
    const pad = f.icon === 'coin' ? 13 : f.icon === 'heart' ? 17 : 0
    const left = Math.round(f.x - (g.digitsWidth(f.text) + pad) / 2)
    if (f.icon === 'coin') {
      const coin = anim('effects/coin_spin', 'play')
      g.sprite('effects/coin_spin', 'play', frameAt(coin, f.t), left + 6, f.y - rise + 5, false, alpha)
    } else if (f.icon === 'heart') {
      g.icon('heart', left, f.y - rise - 3, alpha)
    }
    g.digits(f.text, left + pad, f.y - rise, 'left', alpha)
  }
}
