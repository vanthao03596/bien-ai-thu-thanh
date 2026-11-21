import { SPECS, SPEC_CHOICES, TOWERS, type TowerType } from '../data/towers'
import { samplePath } from './path'
import type { Enemy, Plot } from './types'
import { inRange, type World } from './world'

/** part of the plots the bot fills before it only upgrades */
const BUILD_SHARE = 0.7
export const BUILD_ORDER: readonly TowerType[] = ['archer', 'barracks', 'mage', 'archer', 'artillery', 'mage', 'archer', 'barracks']

/** How one bot differs from the next. The balance tests field a panel of them so that no single lucky or unlucky run decides. */
export interface BotPlan {
  /** the tower types in the order they are built, repeated as needed */
  order?: readonly TowerType[]
  /** call the next wave as soon as the field is empty */
  callEarly?: boolean
}

/**
 * A simple automatic player. It drives the battle on the title screen and
 * gives the balance tests a "reasonable but not clever" baseline.
 */
export class Bot {
  private readonly world: World
  private readonly order: Plot[]
  private readonly buildOrder: readonly TowerType[]
  private thinkT = 0
  private built = 0
  /** when false the bot never calls a wave early (title screen pacing) */
  callEarly: boolean

  constructor(world: World, plan: BotPlan = {}) {
    this.world = world
    // a challenge may lock tower types: the bot plays its order without them
    const order = (plan.order ?? BUILD_ORDER).filter((type) => world.level.towers.includes(type))
    this.buildOrder = order.length > 0 ? order : world.level.towers
    this.callEarly = plan.callEarly ?? false
    // best plots first: the ones that see the most road
    const score = (plot: Plot): number => {
      let n = 0
      for (const path of world.paths) {
        for (let d = 0; d < path.length; d += 16) {
          const s = samplePath(path, d)
          if (inRange(plot.x, plot.y, s.x, s.y, 125)) n += 1
        }
      }
      return n
    }
    this.order = [...world.plots].sort((a, b) => score(b) - score(a))
  }

  update(dt: number): void {
    const w = this.world
    if (w.result !== null) return
    this.thinkT -= dt
    if (this.thinkT > 0) return
    this.thinkT = 0.5

    this.spend()
    if (w.canCallWave() && (w.waveIndex === -1 || (this.callEarly && w.enemies.length === 0 && w.pendingSpawns === 0))) {
      w.callWave()
    }
    this.castSpells()
  }

  private spend(): void {
    const w = this.world
    // a few rounds per think so the opening gold is spent at once
    for (let round = 0; round < 6; round++) {
      // leave some plots empty: the gold goes further in a few strong towers than in many weak ones
      const wantTowers = Math.min(Math.ceil(this.order.length * BUILD_SHARE), 3 + Math.floor((w.waveIndex + 1) * 0.9))
      const free = this.order.find((p) => p.tower === null)
      if (free && w.towers.length < wantTowers) {
        const type = this.buildOrder[this.built % this.buildOrder.length]
        if (w.gold < TOWERS[type].cost[0]) return
        if (w.build(free.id, type)) this.built += 1
        continue
      }
      // the cheapest improvement on the field: a level, a specialisation or a skill rank
      const options: { cost: number; buy: () => boolean }[] = []
      const consider = (cost: number | null, buy: () => boolean): void => {
        if (cost !== null) options.push({ cost, buy })
      }
      for (const t of w.towers) {
        if (t.buildT > 0) continue
        consider(w.upgradeCost(t), () => w.upgrade(t))
        if (w.awaitsSpec(t)) {
          const open = SPEC_CHOICES[t.type].filter((id) => w.specAllowed(id))
          const pick = open[t.id % Math.max(1, open.length)]
          if (pick) consider(SPECS[pick].cost, () => w.specialize(t, pick))
        }
        for (const slot of [0, 1] as const) consider(w.skillCost(t, slot), () => w.buySkill(t, slot))
      }
      options.sort((x, y) => x.cost - y.cost)
      const best = options[0]
      if (best && w.gold >= best.cost) {
        best.buy()
        continue
      }
      if (!best && free) {
        const type = this.buildOrder[this.built % this.buildOrder.length]
        if (w.gold >= TOWERS[type].cost[0] && w.build(free.id, type)) {
          this.built += 1
          continue
        }
      }
      return
    }
  }

  private castSpells(): void {
    const w = this.world
    let lead: Enemy | null = null
    let leadRemaining = Infinity
    for (const e of w.enemies) {
      if (e.state === 'dying') continue
      const remaining = e.path.length - e.dist
      if (remaining < leadRemaining) {
        leadRemaining = remaining
        lead = e
      }
    }
    if (!lead) return
    if (w.spellCd.reinforce <= 0 && leadRemaining < lead.path.length * 0.6 && !lead.def.flying) {
      const ahead = samplePath(lead.path, Math.min(lead.path.length, lead.dist + 24))
      w.castReinforcements(ahead.x, ahead.y)
    }
    if (w.spellCd.fire <= 0) {
      // drop the fire on the densest pack
      let best: Enemy | null = null
      let bestCount = 0
      for (const e of w.enemies) {
        if (e.state === 'dying') continue
        let n = 0
        for (const o of w.enemies) {
          if (o.state !== 'dying' && Math.hypot(o.x - e.x, o.y - e.y) < 34) n += 1
        }
        if (n > bestCount) {
          bestCount = n
          best = e
        }
      }
      if (best && (bestCount >= 4 || best.def.hp >= 300)) w.castFireRain(best.x, best.y)
    }
  }
}
