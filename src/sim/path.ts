import type { Point } from '../assets'

export const TILE = 32

/** A walkable route: a smoothed polyline with cumulative lengths for sampling. */
export interface PathData {
  pts: Point[]
  cum: number[]
  length: number
}

export interface PathSample {
  x: number
  y: number
  /** unit tangent */
  tx: number
  ty: number
}

export type TileCoord = readonly [number, number]

/**
 * Builds a smoothed route from waypoints given in tile-grid coordinates
 * (grid lines, so a 2-tile wide road is centred on them). Corners are
 * rounded so units do not turn on the spot.
 */
export function buildPath(waypoints: readonly TileCoord[], radius = 22): PathData {
  if (waypoints.length < 2) throw new Error('A path needs at least two waypoints')
  const raw: Point[] = waypoints.map(([gx, gy]) => ({ x: gx * TILE, y: gy * TILE }))
  const pts: Point[] = [raw[0]]
  for (let i = 1; i < raw.length - 1; i++) {
    const a = raw[i - 1]
    const b = raw[i]
    const c = raw[i + 1]
    const lab = Math.hypot(a.x - b.x, a.y - b.y)
    const lbc = Math.hypot(c.x - b.x, c.y - b.y)
    const r = Math.min(radius, lab / 2, lbc / 2)
    if (r < 1) {
      pts.push(b)
      continue
    }
    const p1 = { x: b.x + ((a.x - b.x) / lab) * r, y: b.y + ((a.y - b.y) / lab) * r }
    const p2 = { x: b.x + ((c.x - b.x) / lbc) * r, y: b.y + ((c.y - b.y) / lbc) * r }
    const steps = 6
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      const u = 1 - t
      pts.push({
        x: u * u * p1.x + 2 * u * t * b.x + t * t * p2.x,
        y: u * u * p1.y + 2 * u * t * b.y + t * t * p2.y,
      })
    }
  }
  pts.push(raw[raw.length - 1])

  const cum: number[] = [0]
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  }
  return { pts, cum, length: cum[cum.length - 1] }
}

/** Position and direction at a distance travelled along the path. */
export function samplePath(path: PathData, dist: number): PathSample {
  const d = Math.max(0, Math.min(path.length, dist))
  let lo = 0
  let hi = path.cum.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (path.cum[mid] <= d) lo = mid
    else hi = mid
  }
  const a = path.pts[lo]
  const b = path.pts[hi]
  const seg = path.cum[hi] - path.cum[lo]
  const t = seg > 0 ? (d - path.cum[lo]) / seg : 0
  const len = seg > 0 ? seg : 1
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    tx: (b.x - a.x) / len,
    ty: (b.y - a.y) / len,
  }
}

export interface NearestResult {
  x: number
  y: number
  /** distance travelled along the path at the nearest point */
  dist: number
  /** straight-line distance from the query point */
  d: number
}

export function nearestOnPath(path: PathData, x: number, y: number): NearestResult {
  let best: NearestResult = { x: path.pts[0].x, y: path.pts[0].y, dist: 0, d: Infinity }
  for (let i = 1; i < path.pts.length; i++) {
    const a = path.pts[i - 1]
    const b = path.pts[i]
    const vx = b.x - a.x
    const vy = b.y - a.y
    const len2 = vx * vx + vy * vy
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / len2)) : 0
    const px = a.x + vx * t
    const py = a.y + vy * t
    const d = Math.hypot(x - px, y - py)
    if (d < best.d) {
      best = { x: px, y: py, dist: path.cum[i - 1] + Math.sqrt(len2) * t, d }
    }
  }
  return best
}

/**
 * Marks the tiles covered by a 2-tile wide road that follows the waypoints.
 * Returns a row-major boolean grid.
 */
export function rasterizePaths(
  paths: readonly (readonly TileCoord[])[],
  cols: number,
  rows: number,
): boolean[] {
  const grid = new Array<boolean>(cols * rows).fill(false)
  for (const wp of paths) {
    for (let i = 1; i < wp.length; i++) {
      const [ax, ay] = wp[i - 1]
      const [bx, by] = wp[i]
      const c0 = Math.floor(Math.min(ax, bx)) - 1
      const c1 = Math.ceil(Math.max(ax, bx)) - 1 + 1
      const r0 = Math.floor(Math.min(ay, by)) - 1
      const r1 = Math.ceil(Math.max(ay, by)) - 1 + 1
      for (let r = Math.max(0, r0); r <= Math.min(rows - 1, r1); r++) {
        for (let c = Math.max(0, c0); c <= Math.min(cols - 1, c1); c++) {
          grid[r * cols + c] = true
        }
      }
    }
  }
  return grid
}
