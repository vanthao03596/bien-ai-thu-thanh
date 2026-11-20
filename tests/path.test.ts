import { describe, expect, it } from 'vitest'
import { TILE, buildPath, nearestOnPath, rasterizePaths, samplePath, type TileCoord } from '../src/sim/path'

const L: TileCoord[] = [
  [0, 2],
  [4, 2],
  [4, 6],
]

describe('buildPath', () => {
  it('keeps the end points and rounds the corner', () => {
    const p = buildPath(L)
    expect(p.pts[0]).toEqual({ x: 0, y: 2 * TILE })
    expect(p.pts[p.pts.length - 1]).toEqual({ x: 4 * TILE, y: 6 * TILE })
    // a rounded corner is shorter than the square one
    expect(p.length).toBeLessThan(8 * TILE)
    expect(p.length).toBeGreaterThan(8 * TILE - 30)
    // and never touches the sharp corner itself
    expect(p.pts.some((q) => q.x === 4 * TILE && q.y === 2 * TILE)).toBe(false)
  })

  it('has monotonically growing cumulative lengths', () => {
    const p = buildPath(L)
    for (let i = 1; i < p.cum.length; i++) expect(p.cum[i]).toBeGreaterThan(p.cum[i - 1])
  })

  it('rejects a single waypoint', () => {
    expect(() => buildPath([[1, 1]])).toThrow()
  })
})

describe('samplePath', () => {
  it('clamps to both ends', () => {
    const p = buildPath(L)
    expect(samplePath(p, -50)).toMatchObject({ x: 0, y: 2 * TILE })
    expect(samplePath(p, p.length + 50)).toMatchObject({ x: 4 * TILE, y: 6 * TILE })
  })

  it('returns a unit tangent pointing along the travel direction', () => {
    const p = buildPath(L)
    const start = samplePath(p, 10)
    expect(start.tx).toBeCloseTo(1)
    expect(start.ty).toBeCloseTo(0)
    const end = samplePath(p, p.length - 10)
    expect(end.tx).toBeCloseTo(0)
    expect(end.ty).toBeCloseTo(1)
  })

  it('moves smoothly: a small step never jumps', () => {
    const p = buildPath(L)
    let prev = samplePath(p, 0)
    for (let d = 2; d <= p.length; d += 2) {
      const cur = samplePath(p, d)
      expect(Math.hypot(cur.x - prev.x, cur.y - prev.y)).toBeLessThanOrEqual(2.001)
      prev = cur
    }
  })
})

describe('nearestOnPath', () => {
  it('projects a point onto the road', () => {
    const p = buildPath(L)
    const n = nearestOnPath(p, 64, 100)
    expect(n.x).toBeCloseTo(64)
    expect(n.y).toBeCloseTo(2 * TILE)
    expect(n.d).toBeCloseTo(36)
    expect(n.dist).toBeCloseTo(64)
  })
})

describe('rasterizePaths', () => {
  it('paints a road two tiles wide around the waypoints', () => {
    const grid = rasterizePaths([L], 8, 8)
    const at = (c: number, r: number): boolean => grid[r * 8 + c]
    // horizontal leg on grid line y=2 covers rows 1 and 2
    expect(at(1, 1)).toBe(true)
    expect(at(1, 2)).toBe(true)
    expect(at(1, 0)).toBe(false)
    expect(at(1, 3)).toBe(false)
    // vertical leg on grid line x=4 covers columns 3 and 4
    expect(at(3, 5)).toBe(true)
    expect(at(4, 5)).toBe(true)
    expect(at(2, 5)).toBe(false)
    expect(at(5, 5)).toBe(false)
    // the corner square is filled
    expect(at(4, 1)).toBe(true)
  })
})
