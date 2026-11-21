import Phaser from 'phaser'
import { atlasFrame, type Point, type Rect } from '../assets'
import { MAP_COLS, MAP_ROWS, VIEW_H, VIEW_W, type LevelDef } from '../data/levels'
import { TILE, rasterizePaths } from '../sim/path'

export interface MapProp {
  /** static = frame of props/props_static, the others are animated sheets */
  kind: 'static' | 'oak' | 'pine' | 'campfire' | 'grass'
  frame: string
  x: number
  y: number
  /** animation offset in seconds so neighbours do not sway in sync */
  phase: number
}

const WATER_FRAMES = 4

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Picks the autotile piece for a cell from its neighbours (see the pack README). */
export function autotileKind(same: (dc: number, dr: number) => boolean): string {
  const n = same(0, -1)
  const s = same(0, 1)
  const w = same(-1, 0)
  const e = same(1, 0)
  if (!n && !w) return 'TL'
  if (!n && !e) return 'TR'
  if (!s && !w) return 'BL'
  if (!s && !e) return 'BR'
  if (!n) return 'T'
  if (!s) return 'B'
  if (!w) return 'L'
  if (!e) return 'R'
  if (!same(-1, -1)) return 'iTL'
  if (!same(1, -1)) return 'iTR'
  if (!same(-1, 1)) return 'iBL'
  if (!same(1, 1)) return 'iBR'
  return 'C'
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

function sourceImage(scene: Phaser.Scene, key: string): CanvasImageSource {
  const img = scene.textures.get(key).getSourceImage()
  if (img instanceof HTMLImageElement || img instanceof HTMLCanvasElement) return img
  throw new Error(`Texture ${key} has no drawable source`)
}

/**
 * Static scenery of a level: the tile ground (baked into one texture per water
 * frame) and the list of props that take part in depth sorting.
 */
export class MapView {
  readonly level: LevelDef
  readonly props: MapProp[] = []
  readonly spawnPoints: Point[]
  /** number of ground textures; more than one when the level has animated water */
  readonly groundFrames: number
  private readonly pathGrid: boolean[]
  private readonly waterGrid: boolean[]

  constructor(level: LevelDef) {
    this.level = level
    this.pathGrid = rasterizePaths(level.paths, MAP_COLS, MAP_ROWS)
    this.waterGrid = new Array<boolean>(MAP_COLS * MAP_ROWS).fill(false)
    for (const [c0, r0, c1, r1] of level.water) {
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          if (c >= 0 && c < MAP_COLS && r >= 0 && r < MAP_ROWS) this.waterGrid[r * MAP_COLS + c] = true
        }
      }
    }
    this.spawnPoints = level.paths.map((wp) => ({ x: wp[0][0] * TILE, y: wp[0][1] * TILE }))
    this.groundFrames = level.water.length > 0 ? WATER_FRAMES : 1
    this.placeProps()
  }

  private isWater(c: number, r: number): boolean {
    // beyond the map edge counts as "same" so shores do not close at the border
    if (c < 0 || c >= MAP_COLS || r < 0 || r >= MAP_ROWS) return true
    return this.waterGrid[r * MAP_COLS + c]
  }

  private isRoad(c: number, r: number): boolean {
    if (c < 0 || c >= MAP_COLS || r < 0 || r >= MAP_ROWS) return true
    return this.pathGrid[r * MAP_COLS + c] || this.waterGrid[r * MAP_COLS + c]
  }

  /**
   * Bakes the tile ground into canvas textures, one per water frame, and returns
   * their keys. The result only depends on the level, so it is built once and reused.
   */
  groundTextures(scene: Phaser.Scene): string[] {
    const keys: string[] = []
    for (let f = 0; f < this.groundFrames; f++) {
      const key = `ground/${this.level.id}/${f}`
      keys.push(key)
      if (scene.textures.exists(key)) continue
      const tex = scene.textures.createCanvas(key, MAP_COLS * TILE, MAP_ROWS * TILE)
      if (!tex) throw new Error(`Could not create the ground texture ${key}`)
      this.paintGround(scene, tex.getContext(), f)
      tex.refresh()
    }
    return keys
  }

  private paintGround(scene: Phaser.Scene, ctx: CanvasRenderingContext2D, waterFrame: number): void {
    const rng = mulberry32(this.level.seed)
    const pathImg = sourceImage(scene, 'tiles/terrain_path')
    const waterImg = sourceImage(scene, 'tiles/terrain_water')
    const drawTile = (img: CanvasImageSource, key: string, name: string, c: number, r: number): void => {
      const f = atlasFrame(key, name)
      ctx.drawImage(img, f.x, f.y, f.w, f.h, c * TILE, r * TILE, TILE, TILE)
    }
    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        const roll = rng()
        const idx = r * MAP_COLS + c
        if (this.waterGrid[idx]) {
          const kind = autotileKind((dc, dr) => this.isWater(c + dc, r + dr))
          drawTile(waterImg, 'tiles/terrain_water', `water_${kind}_f${waterFrame}`, c, r)
        } else if (this.pathGrid[idx]) {
          const kind = autotileKind((dc, dr) => this.isRoad(c + dc, r + dr))
          const name = kind === 'C' && roll < 0.45 ? `dirt_${Math.floor(roll * 6.6) % 3}` : `path_${kind}`
          drawTile(pathImg, 'tiles/terrain_path', name, c, r)
        } else {
          let name = 'grass_0'
          if (roll > 0.94) name = 'grass_flowers'
          else if (roll > 0.85) name = 'grass_tufts'
          else if (roll > 0.65) name = 'grass_2'
          else if (roll > 0.4) name = 'grass_1'
          drawTile(pathImg, 'tiles/terrain_path', name, c, r)
        }
      }
    }
    // bridges are flat ground decals: units walk over them
    const bridge = atlasFrame('props/props_static', 'bridge')
    const propsImg = sourceImage(scene, 'props/props_static')
    for (const [bx, by] of this.level.bridges) {
      ctx.drawImage(
        propsImg, bridge.x, bridge.y, bridge.w, bridge.h,
        Math.round(bx * TILE - bridge.w / 2), Math.round(by * TILE - bridge.h / 2), bridge.w, bridge.h,
      )
    }
  }

  // ------------------------------------------------------------ scenery

  private gridHit(grid: boolean[], rect: Rect): boolean {
    const c0 = Math.floor(rect.x / TILE)
    const c1 = Math.floor((rect.x + rect.w - 1) / TILE)
    const r0 = Math.floor(rect.y / TILE)
    const r1 = Math.floor((rect.y + rect.h - 1) / TILE)
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (c < 0 || c >= MAP_COLS || r < 0 || r >= MAP_ROWS) continue
        if (grid[r * MAP_COLS + c]) return true
      }
    }
    return false
  }

  private placeProps(): void {
    const level = this.level
    const rng = mulberry32(level.seed * 31 + 5)
    // areas that must stay clear: HUD corners, plots with their towers, the gate, spawn decor
    const reserved: Rect[] = [
      { x: 0, y: 0, w: 210, h: 34 },
      { x: VIEW_W - 84, y: 0, w: 84, h: 42 },
      { x: 0, y: VIEW_H - 46, w: 124, h: 46 },
    ]
    for (const [px, py] of level.plots) reserved.push({ x: px * TILE - 30, y: py * TILE - 58, w: 60, h: 72 })
    reserved.push({ x: level.gate[0] * TILE - 46, y: level.gate[1] * TILE - 62, w: 92, h: 72 })
    this.spawnPoints.forEach((p, i) => {
      if (level.spawns[i] !== 'edge') reserved.push({ x: p.x - 34, y: p.y - 48, w: 68, h: 66 })
    })

    for (const p of level.props) {
      const x = Math.round(p.x * TILE)
      const y = Math.round(p.y * TILE)
      const kind = p.kind === 'oak' || p.kind === 'pine' || p.kind === 'campfire' || p.kind === 'grass' ? p.kind : 'static'
      this.props.push({ kind, frame: p.kind, x, y, phase: rng() * 4 })
      reserved.push({ x: x - 26, y: y - 40, w: 52, h: 48 })
    }

    interface Scatter {
      kind: MapProp['kind']
      frames: string[]
      count: number
      /** footprint that must stay off roads and water: half width, height above, depth below */
      hw: number
      up: number
      down: number
      /** keeps big props apart */
      spacing: number
    }
    const plan: Scatter[] = [
      { kind: 'oak', frames: ['oak'], count: 9, hw: 20, up: 56, down: 6, spacing: 34 },
      { kind: 'pine', frames: ['pine'], count: 9, hw: 14, up: 48, down: 6, spacing: 28 },
      { kind: 'static', frames: ['rock_large', 'rock_large_mossy', 'rock_medium', 'rock_medium_mossy'], count: 5, hw: 15, up: 18, down: 4, spacing: 30 },
      { kind: 'static', frames: ['bush', 'bush_b', 'bush_berries'], count: 10, hw: 11, up: 14, down: 4, spacing: 22 },
      { kind: 'static', frames: ['stump', 'mushrooms', 'rock_small'], count: 6, hw: 8, up: 10, down: 3, spacing: 18 },
      { kind: 'static', frames: ['flowers_a', 'flowers_b'], count: 16, hw: 6, up: 8, down: 2, spacing: 12 },
      { kind: 'grass', frames: ['grass'], count: 22, hw: 6, up: 8, down: 2, spacing: 10 },
    ]
    const placed: { x: number; y: number; spacing: number }[] = []
    for (const item of plan) {
      let made = 0
      for (let attempt = 0; attempt < item.count * 40 && made < item.count; attempt++) {
        const x = Math.round(8 + rng() * (VIEW_W - 16))
        const y = Math.round(20 + rng() * (MAP_ROWS * TILE - 24))
        const foot: Rect = { x: x - item.hw, y: y - item.up, w: item.hw * 2, h: item.up + item.down }
        // roads keep a small clear margin so nothing hides the units walking on them
        const wide: Rect = { x: foot.x - 3, y: foot.y - 3, w: foot.w + 6, h: foot.h + 6 }
        if (this.gridHit(this.pathGrid, wide) || this.gridHit(this.waterGrid, wide)) continue
        if (reserved.some((r) => overlaps(foot, r))) continue
        if (placed.some((p) => Math.hypot(p.x - x, (p.y - y) * 1.6) < Math.max(p.spacing, item.spacing))) continue
        const frame = item.frames[Math.floor(rng() * item.frames.length)]
        this.props.push({ kind: item.kind, frame, x, y, phase: rng() * 4 })
        placed.push({ x, y, spacing: item.spacing })
        made += 1
      }
    }
  }
}
