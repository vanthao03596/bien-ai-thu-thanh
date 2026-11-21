import { describe, expect, it } from 'vitest'
import { anim, assetFiles, frameNameAt, sheet, sheetKeys } from '../src/assets'
import type { Sfx } from '../src/audio'
import { LEVELS } from '../src/data/levels'
import { SPELLS, TOWERS } from '../src/data/towers'
import { Session } from '../src/session'

function makeSession(levelIndex = 0): { session: Session; sounds: string[]; wins: [string, number][] } {
  const sounds: string[] = []
  const wins: [string, number][] = []
  const sfx = { play: (name: string) => sounds.push(name) } as unknown as Sfx
  const session = new Session(levelIndex, sfx, (o) => {
    if (o.won) wins.push([o.levelId, o.stars])
  })
  return { session, sounds, wins }
}

describe('session', () => {
  it('selects a plot on click and deselects it on a second click', () => {
    const { session } = makeSession()
    const plot = session.world.plots[0]
    session.worldClick(plot.x, plot.y - 4)
    expect(session.selection).toEqual({ kind: 'plot', plot })
    session.worldClick(plot.x, plot.y - 4)
    expect(session.selection.kind).toBe('none')
  })

  it('drops the selection when its plot gets a tower', () => {
    const { session } = makeSession()
    const plot = session.world.plots[0]
    session.worldClick(plot.x, plot.y - 4)
    expect(session.world.build(plot.id, 'archer')).not.toBeNull()
    session.advance(1 / 60)
    expect(session.selection.kind).toBe('none')
    session.worldClick(plot.x, plot.y - 20)
    expect(session.selection.kind).toBe('tower')
  })

  it('asks touch players to confirm with a second tap', () => {
    const { session } = makeSession()
    let built = 0
    session.confirm('build-archer', true, () => (built += 1))
    expect(built).toBe(0)
    expect(session.armed).toBe('build-archer')
    session.confirm('build-archer', true, () => (built += 1))
    expect(built).toBe(1)
    expect(session.armed).toBeNull()
    session.confirm('build-archer', false, () => (built += 1))
    expect(built).toBe(2)
  })

  it('casts a spell where the player clicks and leaves targeting mode', () => {
    const { session } = makeSession()
    session.toggleSpell('fire')
    expect(session.input).toBe('fire')
    session.worldClick(200, 160)
    expect(session.input).toBe('normal')
    expect(session.world.spellCd.fire).toBe(SPELLS.fire.cooldown)
    expect(session.world.projectiles).toHaveLength(SPELLS.fire.count)
  })

  it('refuses a spell that is recharging', () => {
    const { session, sounds } = makeSession()
    session.world.spellCd.reinforce = 5
    session.toggleSpell('reinforce')
    expect(session.input).toBe('normal')
    expect(sounds).toContain('deny')
  })

  it('cancels the targeting mode first, then the selection', () => {
    const { session } = makeSession()
    session.selectHero()
    session.toggleSpell('fire')
    expect(session.selection.kind).toBe('none')
    session.selectHero()
    session.input = 'fire'
    expect(session.cancel()).toBe(true)
    expect(session.input).toBe('normal')
    expect(session.selection.kind).toBe('hero')
    expect(session.cancel()).toBe(true)
    expect(session.selection.kind).toBe('none')
    expect(session.cancel()).toBe(false)
  })

  it('moves the selected hero to the clicked spot', () => {
    const { session } = makeSession()
    session.selectHero()
    session.worldClick(100, 300)
    expect(session.world.hero.home).toEqual({ x: 100, y: 300 })
    expect(session.selection.kind).toBe('none')
  })

  it('does not advance while paused and runs twice as fast at speed 2', () => {
    const a = makeSession().session
    a.world.callWave()
    a.paused = true
    a.advance(1)
    expect(a.world.time).toBe(0)
    a.paused = false
    a.advance(1)
    const b = makeSession().session
    b.world.callWave()
    b.speed = 2
    b.advance(1)
    expect(b.world.time).toBeCloseTo(a.world.time * 2, 1)
  })

  it('reports the simulation events of the frame and plays them', () => {
    const { session, sounds } = makeSession()
    session.world.callWave()
    const events = session.advance(1 / 30)
    expect(events).toContain('wave')
    expect(sounds).toContain('wave')
    expect(session.world.events).toHaveLength(0)
  })

  it('records a win once and ignores orders afterwards', () => {
    const { session, wins } = makeSession()
    const w = session.world
    w.waveIndex = w.waveCount - 1
    session.advance(1 / 30)
    session.advance(1 / 30)
    expect(w.result).toBe('win')
    expect(wins).toEqual([[LEVELS[0].id, 3]])
    expect(session.live).toBe(false)
    const plot = w.plots[0]
    session.worldClick(plot.x, plot.y - 4)
    expect(session.selection.kind).toBe('none')
    expect(session.resultT).toBeGreaterThan(0)
  })

  it('keeps the price list the HUD shows in step with the simulation', () => {
    const { session } = makeSession()
    const w = session.world
    const plot = w.plots[0]
    const before = w.gold
    w.build(plot.id, 'mage')
    expect(before - w.gold).toBe(TOWERS.mage.cost[0])
  })
})

describe('loader manifest', () => {
  const files = assetFiles()
  const byKey = new Map(files.map((f) => [f.key, f]))

  function frameNames(key: string): Set<string> {
    const atlas = byKey.get(key)?.atlas
    const frames = atlas && typeof atlas.frames === 'object' && atlas.frames !== null ? atlas.frames : {}
    return new Set(Object.keys(frames))
  }

  it('hands every sprite sheet to the atlas loader', () => {
    for (const key of sheetKeys()) expect(byKey.get(key)?.atlas, key).toBeTruthy()
  })

  it('names a real atlas frame for every frame of every animation', () => {
    for (const key of sheetKeys()) {
      const names = frameNames(key)
      for (const animName of Object.keys(sheet(key).anims)) {
        const a = anim(key, animName)
        expect(a.names, `${key}:${animName}`).toHaveLength(a.frames)
        for (const n of a.names) expect(names.has(n), `${key}:${animName} -> ${n}`).toBe(true)
      }
    }
  })

  it('picks animation frames by time', () => {
    expect(frameNameAt('enemies/goblin', 'walk_side', 0)).toBe('goblin_walk_side_0')
    expect(frameNameAt('enemies/goblin', 'walk_side', 0.15)).toBe('goblin_walk_side_1')
    // one-shot animations hold their last frame
    expect(frameNameAt('enemies/goblin', 'death', 99)).toBe('goblin_death_7')
  })

  it('strips pivots from UI atlases and tiles but keeps them for props', () => {
    const first = (key: string): Record<string, unknown> => {
      const frames = byKey.get(key)?.atlas?.frames as Record<string, Record<string, unknown>>
      return Object.values(frames)[0]
    }
    expect(first('ui/hud').pivot).toBeUndefined()
    expect(first('tiles/terrain_path').frame).toBeDefined()
    expect(first('props/props_static').pivot).toBeDefined()
  })

  it('loads the digit font as a plain image', () => {
    expect(byKey.get('ui/font_digits')?.atlas).toBeNull()
  })
})
