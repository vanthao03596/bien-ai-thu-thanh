import { describe, expect, it } from 'vitest'
import { atlasFrame, digits, hasAnim, sheet } from '../src/assets'
import { ENEMIES } from '../src/data/enemies'
import { LEVELS, MAP_COLS, MAP_ROWS, VIEW_H, VIEW_W } from '../src/data/levels'
import { HERO, RANGE_SQUASH, TOWERS, TOWER_TYPES, towerSheet } from '../src/data/towers'
import { TILE, rasterizePaths, samplePath } from '../src/sim/path'
import { World } from '../src/sim/world'

describe('asset pack', () => {
  it('provides every animation the enemies need', () => {
    for (const def of Object.values(ENEMIES)) {
      const names = def.flying ? ['fly', 'death'] : ['idle', 'walk_side', 'walk_down', 'walk_up', 'attack', 'death']
      for (const name of names) expect(hasAnim(def.sheet, name), `${def.sheet}:${name}`).toBe(true)
      expect(sheet(def.shadow).fw).toBeGreaterThan(0)
    }
  })

  it('provides three levels of every tower with the expected markers', () => {
    for (const type of TOWER_TYPES) {
      for (let level = 0; level < 3; level++) {
        const s = sheet(towerSheet(type, level))
        expect(s.anims.idle, `${type} ${level} idle`).toBeDefined()
        if (type === 'archer') expect(s.unitSlots).toHaveLength(2)
        if (type === 'mage') expect(s.unitSlots).toHaveLength(1)
        if (type === 'artillery') expect(s.projectileOrigin).not.toBeNull()
        if (type === 'barracks') {
          expect(s.spawnPoint).not.toBeNull()
          expect(s.anims.door.spawnFrame).toBeDefined()
        }
        if (type === 'mage' || type === 'artillery') expect(s.anims.attack.releaseFrame).toBeDefined()
      }
    }
  })

  it('provides hero, units, UI frames and the digit font', () => {
    for (const name of ['idle', 'walk_side', 'walk_down', 'walk_up', 'attack', 'death', 'special']) {
      expect(hasAnim(HERO.sheet, name)).toBe(true)
    }
    expect(hasAnim('units/archer_unit', 'shoot_up')).toBe(true)
    expect(hasAnim('units/mage_unit', 'cast')).toBe(true)
    for (const type of TOWER_TYPES) {
      expect(atlasFrame('ui/hud', `build_${type}`).w).toBe(36)
      expect(atlasFrame('ui/hud', `build_${type}_locked`).w).toBe(36)
    }
    expect(atlasFrame('ui/buttons', 'btn_upgrade_normal')).toMatchObject({ w: 32, h: 32 })
    expect(atlasFrame('tiles/terrain_path', 'path_iBR')).toMatchObject({ w: 32, h: 32 })
    expect(atlasFrame('tiles/terrain_water', 'water_C_f3')).toMatchObject({ w: 32, h: 32 })
    expect(digits().chars).toContain('0123456789')
  })
})

describe('level data', () => {
  for (const level of LEVELS) {
    describe(level.name, () => {
      const road = rasterizePaths(level.paths, MAP_COLS, MAP_ROWS)
      const tileAt = (x: number, y: number): boolean => {
        const c = Math.floor(x / TILE)
        const r = Math.floor(y / TILE)
        return c >= 0 && c < MAP_COLS && r >= 0 && r < MAP_ROWS && road[r * MAP_COLS + c]
      }
      const inWater = (x: number, y: number): boolean =>
        level.water.some(([c0, r0, c1, r1]) => x >= c0 * TILE && x < (c1 + 1) * TILE && y >= r0 * TILE && y < (r1 + 1) * TILE)

      it('has axis-aligned roads that all end at the gate', () => {
        expect(level.spawns).toHaveLength(level.paths.length)
        for (const path of level.paths) {
          for (let i = 1; i < path.length; i++) {
            const straight = path[i][0] === path[i - 1][0] || path[i][1] === path[i - 1][1]
            expect(straight).toBe(true)
          }
          expect(path[path.length - 1]).toEqual(level.gate)
        }
      })

      it('keeps every plot on dry grass, on screen and clear of the roads', () => {
        for (const [px, py] of level.plots) {
          const x = px * TILE
          const y = py * TILE
          expect(x).toBeGreaterThan(24)
          expect(x).toBeLessThan(VIEW_W - 24)
          expect(y).toBeGreaterThan(70)
          expect(y).toBeLessThan(VIEW_H - 20)
          // the footprint of the plot (not just its centre) stays off the road
          for (const [dx, dy] of [[0, 0], [-18, 0], [18, 0], [0, -8], [0, 6]]) {
            expect(tileAt(x + dx, y + dy), `plot ${px},${py} on road`).toBe(false)
            expect(inWater(x + dx, y + dy), `plot ${px},${py} in water`).toBe(false)
          }
        }
      })

      it('puts every plot within reach of a road', () => {
        const w = new World(level)
        for (const plot of w.plots) {
          let best = Infinity
          for (const path of w.paths) {
            for (let d = 0; d <= path.length; d += 8) {
              const p = samplePath(path, d)
              best = Math.min(best, Math.hypot(p.x - plot.x, (p.y - plot.y) / RANGE_SQUASH))
            }
          }
          expect(best, `plot ${plot.id}`).toBeLessThan(TOWERS.barracks.range[0])
        }
      })

      it('only references existing paths, enemies and towers in its waves', () => {
        expect(level.waves.length).toBeGreaterThan(0)
        for (const wave of level.waves) {
          expect(wave.groups.length).toBeGreaterThan(0)
          for (const grp of wave.groups) {
            expect(ENEMIES[grp.type]).toBeDefined()
            expect(grp.count).toBeGreaterThan(0)
            expect(grp.gap).toBeGreaterThan(0)
            expect(grp.path ?? 0).toBeLessThan(level.paths.length)
          }
        }
        for (const type of level.towers) expect(TOWERS[type]).toBeDefined()
        expect(level.startGold).toBeGreaterThanOrEqual(TOWERS.archer.cost[0])
      })
    })
  }
})
