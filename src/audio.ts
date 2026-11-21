import type { SimEvent } from './sim/types'

export type SoundName = SimEvent | 'click' | 'deny' | 'select'

/** Minimum seconds between two plays of the same sound, so volleys do not turn into noise. */
const MIN_GAP: Partial<Record<SoundName, number>> = {
  arrow: 0.07,
  hit: 0.06,
  melee: 0.09,
  kill: 0.08,
  bolt: 0.08,
  magic_hit: 0.08,
  explosion: 0.1,
  coin: 0.1,
  heal: 0.3,
  soldier_down: 0.2,
}

/** All sound effects are synthesised on the fly; the asset pack ships no audio. */
export class Sfx {
  muted = false
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null
  private readonly last = new Map<SoundName, number>()

  /**
   * Plugs the synthesiser into an audio graph. The game passes Phaser's own
   * context and master node, so the sound manager's unlock, mute and
   * pause-on-blur handling apply to these effects too.
   */
  attach(ctx: AudioContext, destination: AudioNode): void {
    if (this.ctx === ctx) return
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = 0.5
    this.master.connect(destination)
    const len = Math.floor(ctx.sampleRate * 0.6)
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = this.noiseBuf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, delay = 0): void {
    const ctx = this.ctx
    if (!ctx || !this.master) return
    const t0 = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(f0, t0)
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.linearRampToValueAtTime(gain, t0 + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(g).connect(this.master)
    osc.start(t0)
    osc.stop(t0 + dur + 0.02)
  }

  private noise(dur: number, gain: number, freq: number, type: BiquadFilterType, delay = 0): void {
    const ctx = this.ctx
    if (!ctx || !this.master || !this.noiseBuf) return
    const t0 = ctx.currentTime + delay
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    const filter = ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.value = freq
    const g = ctx.createGain()
    g.gain.setValueAtTime(gain, t0)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    src.connect(filter).connect(g).connect(this.master)
    src.start(t0)
    src.stop(t0 + dur + 0.02)
  }

  play(name: SoundName): void {
    const ctx = this.ctx
    if (this.muted || !ctx || ctx.state !== 'running') return
    const now = ctx.currentTime
    const gap = MIN_GAP[name] ?? 0.03
    if (now - (this.last.get(name) ?? -1) < gap) return
    this.last.set(name, now)

    switch (name) {
      case 'arrow':
        this.noise(0.07, 0.1, 2600, 'highpass')
        break
      case 'hit':
        this.tone('square', 240, 120, 0.04, 0.05)
        break
      case 'bolt':
        this.tone('sine', 1100, 420, 0.16, 0.1)
        break
      case 'magic_hit':
        this.tone('triangle', 520, 1300, 0.09, 0.08)
        break
      case 'cannon':
        this.tone('sine', 150, 48, 0.2, 0.3)
        this.noise(0.12, 0.16, 900, 'lowpass')
        break
      case 'explosion':
        this.noise(0.38, 0.32, 700, 'lowpass')
        this.tone('sine', 95, 38, 0.3, 0.28)
        break
      case 'melee':
        this.noise(0.04, 0.07, 1800, 'bandpass')
        break
      case 'kill':
        this.tone('square', 210, 90, 0.09, 0.05)
        break
      case 'boss_kill':
        this.noise(0.9, 0.3, 500, 'lowpass')
        this.tone('sawtooth', 160, 30, 0.9, 0.2)
        break
      case 'coin':
      case 'sell':
        this.tone('sine', 1250, 1250, 0.06, 0.09)
        this.tone('sine', 1680, 1680, 0.1, 0.09, 0.06)
        break
      case 'build':
        this.tone('square', 150, 110, 0.07, 0.1)
        this.tone('square', 150, 110, 0.07, 0.1, 0.12)
        this.noise(0.06, 0.08, 1200, 'bandpass', 0.24)
        break
      case 'upgrade':
        this.tone('triangle', 523, 523, 0.09, 0.12)
        this.tone('triangle', 659, 659, 0.09, 0.12, 0.08)
        this.tone('triangle', 784, 784, 0.16, 0.12, 0.16)
        break
      case 'wave':
        this.tone('sawtooth', 147, 147, 0.5, 0.1)
        this.tone('sawtooth', 220, 220, 0.5, 0.07, 0.02)
        break
      case 'leak':
        this.tone('square', 330, 140, 0.25, 0.12)
        break
      case 'heal':
        this.tone('sine', 660, 990, 0.2, 0.05)
        break
      case 'spell_fire':
        this.noise(0.5, 0.14, 1400, 'bandpass')
        this.tone('sawtooth', 500, 120, 0.45, 0.08)
        break
      case 'spell_reinforce':
      case 'hero_up':
        this.tone('triangle', 392, 392, 0.1, 0.12)
        this.tone('triangle', 523, 523, 0.18, 0.12, 0.1)
        break
      case 'hero_special':
        this.tone('triangle', 660, 1320, 0.25, 0.1)
        this.noise(0.15, 0.06, 3000, 'highpass')
        break
      case 'hero_down':
        this.tone('sawtooth', 300, 70, 0.5, 0.12)
        break
      case 'soldier_down':
        this.tone('square', 180, 80, 0.14, 0.05)
        break
      case 'win':
        ;[523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.22, 0.14, i * 0.14))
        break
      case 'lose':
        ;[392, 330, 262, 196].forEach((f, i) => this.tone('sawtooth', f, f * 0.97, 0.3, 0.09, i * 0.2))
        break
      case 'click':
        this.tone('square', 700, 500, 0.03, 0.06)
        break
      case 'select':
        this.tone('sine', 880, 1100, 0.05, 0.06)
        break
      case 'deny':
        this.tone('square', 160, 120, 0.1, 0.07)
        break
    }
  }
}
