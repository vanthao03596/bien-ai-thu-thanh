import { describe, expect, it } from 'vitest'
import type { Sfx } from '../src/audio'
import { WAVE_CALL, Session } from '../src/session'
import { TIP_IDS, Tips, type TipId } from '../src/tips'

const FRAME = 1 / 60

function setup(levelIndex = 0, retired: readonly string[] = [], touch = false): { session: Session; tips: Tips; gone: TipId[] } {
  const sfx = { play: () => undefined } as unknown as Sfx
  const session = new Session(levelIndex, sfx, () => undefined)
  const gone: TipId[] = []
  const tips = new Tips(session, retired, (id) => gone.push(id), touch)
  return { session, tips, gone }
}

/** Runs the battle and the tips together for some seconds. */
function run(session: Session, tips: Tips, seconds: number): void {
  for (let t = 0; t < seconds; t += FRAME) {
    session.advance(FRAME)
    tips.update(FRAME)
  }
}

describe('tips', () => {
  it('walks a new player through the opening: build, then call the wave', () => {
    const { session, tips, gone } = setup()
    tips.update(FRAME)
    expect(tips.current).toBe('build')
    run(session, tips, 30)
    expect(tips.current).toBe('build')

    session.world.build(session.world.plots[0].id, 'archer')
    tips.update(FRAME)
    expect(tips.current).toBe('call')

    session.callWave(false)
    tips.update(FRAME)
    expect(tips.current).not.toBe('call')
    // the opening tips come back on every level, so they are never written to the save
    expect(gone).not.toContain('build')
    expect(gone).not.toContain('call')
  })

  it('words the tips for touch screens when asked to', () => {
    const mouse = setup().tips.update(FRAME)
    const touch = setup(0, [], true).tips.update(FRAME)
    expect(mouse).toContain('Bấm')
    expect(touch).toContain('Chạm')
  })

  it('points at the hero once enemies are on the road and stops when the player has moved him', () => {
    const { session, tips, gone } = setup()
    session.world.build(session.world.plots[0].id, 'archer')
    session.callWave(false)
    run(session, tips, 3)
    expect(tips.current).toBe('hero')

    session.selectHero()
    session.worldClick(100, 300)
    tips.update(FRAME)
    expect(gone).toContain('hero')
    expect(tips.current).toBeNull()
  })

  it('gives up on a tip the player ignores, and leaves a pause before the next one', () => {
    // without the spell tip, which would cut in as soon as a crowd forms
    const { session, tips, gone } = setup(0, ['spell'])
    session.world.gold = 5000
    session.world.build(session.world.plots[0].id, 'archer')
    session.callWave(false)
    run(session, tips, 2)
    const first = tips.current
    expect(first).not.toBeNull()
    let lasted = 0
    while (tips.current === first && lasted < 60) {
      session.advance(FRAME)
      tips.update(FRAME)
      lasted += FRAME
    }
    expect(lasted).toBeGreaterThan(5)
    expect(lasted).toBeLessThan(20)
    expect(gone).toContain(first)
    expect(tips.current).toBeNull()
  })

  it('never shows a tip that the save already retired', () => {
    const { session, tips } = setup(0, TIP_IDS)
    session.world.gold = 5000
    session.world.build(session.world.plots[0].id, 'barracks')
    session.callWave(false)
    const seen = new Set<TipId>()
    for (let t = 0; t < 40; t += FRAME) {
      session.advance(FRAME)
      tips.update(FRAME)
      if (tips.current) seen.add(tips.current)
    }
    expect([...seen]).toEqual([])
  })

  it('stays silent while the battle is paused', () => {
    const { session, tips } = setup()
    session.paused = true
    expect(tips.update(FRAME)).toBeNull()
  })

  it('mentions specialisations only on levels that have them', () => {
    for (const [levelIndex, expected] of [[0, false], [1, true]] as const) {
      const { session, tips } = setup(levelIndex, TIP_IDS.filter((id) => id !== 'spec'))
      const w = session.world
      w.gold = 5000
      const tower = w.build(w.plots[0].id, 'archer')
      expect(tower).not.toBeNull()
      session.callWave(false)
      const seen = new Set<TipId>()
      for (let t = 0; t < 30; t += FRAME) {
        session.advance(FRAME)
        if (tower && w.upgradeCost(tower) !== null) w.upgrade(tower)
        tips.update(FRAME)
        if (tips.current) seen.add(tips.current)
      }
      expect(seen.has('spec'), `level ${levelIndex}`).toBe(expected)
    }
  })
})

describe('calling a wave', () => {
  it('starts at once for the mouse', () => {
    const { session } = setup()
    session.callWave(false)
    expect(session.world.waveIndex).toBe(0)
  })

  it('shows the preview on the first tap and calls on the second', () => {
    const { session } = setup()
    session.callWave(true)
    expect(session.world.waveIndex).toBe(-1)
    expect(session.armed).toBe(WAVE_CALL)
    session.callWave(true)
    expect(session.world.waveIndex).toBe(0)
    expect(session.armed).toBeNull()
  })

  it('drops the preview when the wave it showed starts by itself', () => {
    const { session } = setup()
    session.callWave(false)
    session.callWave(true)
    expect(session.armed).toBe(WAVE_CALL)
    for (let t = 0; t < 120 && session.world.waveIndex === 0; t += FRAME) session.advance(FRAME)
    expect(session.world.waveIndex).toBe(1)
    expect(session.armed).toBeNull()
  })

  it('does nothing while paused', () => {
    const { session } = setup()
    session.paused = true
    session.callWave(false)
    expect(session.world.waveIndex).toBe(-1)
  })
})
