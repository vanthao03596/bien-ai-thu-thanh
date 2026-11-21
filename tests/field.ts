import { LEVELS, type LevelDef } from '../src/data/levels'
import type { World } from '../src/sim/world'

export const DT = 1 / 60
/** a spot on the test road, in front of the first plot */
export const MID = 320

/** A straight test road with two plots beside it and waves that do not get in the way. */
export function testLevel(overrides: Partial<LevelDef> = {}): LevelDef {
  return {
    id: 'test',
    name: 'Test',
    blurb: '',
    seed: 1,
    paths: [[[0, 6], [20, 6]]],
    spawns: ['edge'],
    water: [],
    bridges: [],
    gate: [20, 6],
    plots: [[10, 4.4], [14, 4.4]],
    heroStart: [23, 13],
    props: [],
    towers: ['archer', 'barracks', 'mage', 'artillery'],
    startGold: 5000,
    lives: 20,
    waves: [{ groups: [{ type: 'goblin', count: 3, gap: 1, at: 0 }] }, { groups: [{ type: 'goblin', count: 2, gap: 1, at: 0 }] }],
    modes: LEVELS[0].modes,
    endless: LEVELS[0].endless,
    ...overrides,
  }
}

export function run(w: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) w.update(DT)
}
