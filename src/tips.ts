import type { Session } from './session'

export type TipId = 'build' | 'call' | 'spell' | 'hero' | 'upgrade' | 'rally' | 'spec' | 'early'

interface TipDef {
  id: TipId
  /** wording for mouse and keyboard, then for touch screens */
  text: readonly [string, string]
  /** seconds on screen before the tip gives up; 0 keeps it for as long as it applies */
  life: number
  /** shown on every level instead of once per save */
  always?: boolean
  /** the situation the tip talks about is on screen right now */
  when(s: Session): boolean
  /** the player has done what the tip asks for */
  done(s: Session): boolean
}

/** how many enemies make a crowd worth a spell */
const CROWD = 6
/** seconds without any tip after one has left */
const QUIET_AFTER = 4

const never = (): boolean => false

/** In order of priority: the first one that applies is shown. */
const TIPS: readonly TipDef[] = [
  {
    id: 'build',
    text: ['Bấm vào một ô đất trống để xây tháp đầu tiên', 'Chạm vào một ô đất trống để xây tháp đầu tiên'],
    life: 0,
    always: true,
    when: (s) => s.world.waveIndex === -1 && s.world.towers.length === 0,
    done: never,
  },
  {
    id: 'call',
    text: [
      'Bấm nút đầu lâu ở đầu đường để gọi đợt quái đầu tiên',
      'Chạm nút đầu lâu ở đầu đường để xem đợt quái, chạm lần nữa để gọi',
    ],
    life: 0,
    always: true,
    when: (s) => s.world.waveIndex === -1 && s.world.towers.length > 0,
    done: never,
  },
  {
    id: 'spell',
    text: [
      'Quái kéo đến đông: bấm Mưa lửa ở góc dưới trái (phím 1) rồi chọn chỗ trút lửa',
      'Quái kéo đến đông: chạm Mưa lửa ở góc dưới trái rồi chọn chỗ trút lửa',
    ],
    life: 12,
    when: (s) => s.world.waveIndex >= 0 && s.world.spellCd.fire <= 0 && s.world.enemies.length >= CROWD,
    done: (s) => s.world.spellCd.fire > 0 || s.world.spellCd.reinforce > 0,
  },
  {
    id: 'hero',
    text: [
      'Bấm vào tướng (phím H) rồi bấm lên đường để đưa tướng ra chặn quái',
      'Chạm vào tướng rồi chạm lên đường để đưa tướng ra chặn quái',
    ],
    life: 14,
    when: (s) => {
      const hero = s.world.hero
      return s.world.waveIndex >= 0 && hero.state !== 'dead' && hero.state !== 'dying'
    },
    done: (s) => s.heroOrders > 0,
  },
  {
    id: 'upgrade',
    text: ['Đủ vàng rồi: bấm vào một tháp để nâng cấp', 'Đủ vàng rồi: chạm vào một tháp để nâng cấp'],
    life: 14,
    when: (s) => {
      const w = s.world
      if (w.waveIndex < 0) return false
      return w.towers.some((t) => {
        const cost = w.upgradeCost(t)
        return t.buildT <= 0 && cost !== null && w.gold >= cost
      })
    },
    done: (s) => s.world.towers.some((t) => t.level > 0),
  },
  {
    id: 'rally',
    text: [
      'Doanh trại: bấm vào tháp rồi bấm nút cờ để chọn chỗ lính đứng chặn',
      'Doanh trại: chạm vào tháp rồi chạm nút cờ để chọn chỗ lính đứng chặn',
    ],
    life: 12,
    when: (s) => s.world.waveIndex >= 0 && s.world.towers.some((t) => t.type === 'barracks' && t.buildT <= 0),
    done: (s) => s.rallyOrders > 0,
  },
  {
    id: 'spec',
    text: [
      'Tháp cấp 3 rẽ được nhánh chuyên biệt: bấm vào tháp để chọn một trong hai',
      'Tháp cấp 3 rẽ được nhánh chuyên biệt: chạm vào tháp để chọn một trong hai',
    ],
    life: 14,
    when: (s) => (s.world.level.specs?.length ?? 0) > 0 && s.world.towers.some((t) => s.world.awaitsSpec(t)),
    done: (s) => s.world.towers.some((t) => t.spec !== null),
  },
  {
    id: 'early',
    text: [
      'Sân đã sạch: bấm nút đầu lâu để gọi đợt kế sớm và nhận thưởng vàng',
      'Sân đã sạch: chạm nút đầu lâu để gọi đợt kế sớm và nhận thưởng vàng',
    ],
    life: 10,
    when: (s) => {
      const w = s.world
      return w.waveTimer !== null && w.canCallWave() && w.enemies.length === 0 && w.pendingSpawns === 0
    },
    done: never,
  },
]

export const TIP_IDS: readonly TipId[] = TIPS.map((tip) => tip.id)

/**
 * One line of advice for new players, picked from what is happening on the field.
 * A tip leaves for good once the player has done what it says or it has been
 * shown long enough; the two opening tips come back on every level.
 */
export class Tips {
  /** the tip on screen, or null */
  current: TipId | null = null
  private readonly retired: Set<string>
  private readonly age = new Map<TipId, number>()
  private quietT = 0

  constructor(
    private readonly session: Session,
    retired: readonly string[],
    private readonly onRetire: (id: TipId) => void,
    private readonly touch = false,
  ) {
    this.retired = new Set(retired)
  }

  /** Advances by dt seconds of real time and returns the line to show, or null. */
  update(dt: number): string | null {
    const s = this.session
    this.current = null
    if (!s.live) return null
    for (const tip of TIPS) {
      if (!tip.always && !this.retired.has(tip.id) && tip.done(s)) this.retire(tip)
    }
    this.quietT = Math.max(0, this.quietT - dt)
    const tip = TIPS.find((t) => !this.retired.has(t.id) && t.when(s))
    if (!tip || (!tip.always && this.quietT > 0)) return null
    if (tip.life > 0) {
      const age = (this.age.get(tip.id) ?? 0) + dt
      this.age.set(tip.id, age)
      if (age >= tip.life) {
        this.retire(tip)
        return null
      }
    }
    this.current = tip.id
    return tip.text[this.touch ? 1 : 0]
  }

  private retire(tip: TipDef): void {
    this.retired.add(tip.id)
    // leave a pause after a tip the player has seen, so the next one does not pop up in its place
    if (this.age.has(tip.id)) this.quietT = QUIET_AFTER
    this.onRetire(tip.id)
  }
}
