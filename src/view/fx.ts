import Phaser from 'phaser'

export const FX_PIXEL = 'fx/pixel'
export const FX_GLOW = 'fx/glow'

/** Creates the two procedural textures every particle and light is built from. */
export function createFxTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(FX_PIXEL)) {
    const tex = scene.textures.createCanvas(FX_PIXEL, 2, 2)
    if (tex) {
      tex.getContext().fillStyle = '#ffffff'
      tex.getContext().fillRect(0, 0, 2, 2)
      tex.refresh()
    }
  }
  if (!scene.textures.exists(FX_GLOW)) {
    const size = 64
    const tex = scene.textures.createCanvas(FX_GLOW, size, size)
    if (tex) {
      const ctx = tex.getContext()
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
      g.addColorStop(0, 'rgba(255,255,255,1)')
      g.addColorStop(0.35, 'rgba(255,255,255,0.45)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, size, size)
      tex.refresh()
    }
  }
}

type Emitter = Phaser.GameObjects.Particles.ParticleEmitter
type EmitterConfig = Phaser.Types.GameObjects.Particles.ParticleEmitterConfig

const SMALL = [0.5, 0.5, 1]

/**
 * Particle bursts and additive lights of the battlefield. Every emitter is idle
 * until one of the methods below fires it at a point.
 */
export class Fx {
  private readonly emitters: Emitter[] = []
  private readonly dustP: Emitter
  private readonly sparkP: Emitter
  private readonly debrisP: Emitter
  private readonly emberP: Emitter
  private readonly magicP: Emitter
  private readonly healP: Emitter
  private readonly goldP: Emitter
  private readonly smokeP: Emitter
  private readonly boneP: Emitter

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly depth: number,
  ) {
    this.dustP = this.make({
      lifespan: { min: 260, max: 520 },
      speed: { min: 12, max: 46 },
      angle: { min: 195, max: 345 },
      gravityY: 70,
      scale: SMALL,
      alpha: { start: 0.9, end: 0 },
      tint: [0xcdb68a, 0xa98f63, 0xe6d6b0],
    })
    this.sparkP = this.make({
      lifespan: { min: 120, max: 260 },
      speed: { min: 40, max: 110 },
      angle: { min: 0, max: 360 },
      scale: 0.5,
      alpha: { start: 1, end: 0 },
      tint: [0xfff6c2, 0xffd24a, 0xffffff],
      blendMode: Phaser.BlendModes.ADD,
    })
    this.debrisP = this.make({
      lifespan: { min: 350, max: 700 },
      speed: { min: 50, max: 150 },
      angle: { min: 205, max: 335 },
      gravityY: 320,
      scale: SMALL,
      alpha: { start: 1, end: 0.2 },
      tint: [0x4a3b32, 0x6b5a4c, 0x2c2430],
    })
    this.emberP = this.make({
      lifespan: { min: 300, max: 750 },
      speed: { min: 18, max: 90 },
      angle: { min: 215, max: 325 },
      gravityY: -30,
      scale: SMALL,
      alpha: { start: 1, end: 0 },
      tint: [0xffb347, 0xff7a2a, 0xffe08a],
      blendMode: Phaser.BlendModes.ADD,
    })
    this.magicP = this.make({
      lifespan: { min: 250, max: 520 },
      speed: { min: 14, max: 60 },
      angle: { min: 0, max: 360 },
      scale: SMALL,
      alpha: { start: 1, end: 0 },
      tint: [0xc79bff, 0x8fd3ff, 0xffffff],
      blendMode: Phaser.BlendModes.ADD,
    })
    this.healP = this.make({
      lifespan: { min: 400, max: 750 },
      speedX: { min: -12, max: 12 },
      speedY: { min: -42, max: -14 },
      scale: SMALL,
      alpha: { start: 1, end: 0 },
      tint: [0x9bff9b, 0x5fe07a, 0xeaffea],
      blendMode: Phaser.BlendModes.ADD,
    })
    this.goldP = this.make({
      lifespan: { min: 400, max: 850 },
      speedX: { min: -22, max: 22 },
      speedY: { min: -56, max: -18 },
      gravityY: 40,
      scale: SMALL,
      alpha: { start: 1, end: 0 },
      tint: [0xffe27a, 0xfff6c2, 0xffc94a],
      blendMode: Phaser.BlendModes.ADD,
    })
    this.smokeP = this.make({
      lifespan: { min: 450, max: 900 },
      speed: { min: 5, max: 22 },
      angle: { min: 235, max: 305 },
      scale: { start: 1, end: 2 },
      alpha: { start: 0.55, end: 0 },
      tint: [0x8c8c96, 0x6e6e78, 0xb4b4be],
    })
    this.boneP = this.make({
      lifespan: { min: 300, max: 560 },
      speed: { min: 20, max: 70 },
      angle: { min: 210, max: 330 },
      gravityY: 240,
      scale: SMALL,
      alpha: { start: 1, end: 0 },
      tint: [0xe9e2cf, 0xb7ad98, 0x8d2b2b],
    })
  }

  private make(config: EmitterConfig): Emitter {
    const e = this.scene.add.particles(0, 0, FX_PIXEL, { ...config, emitting: false })
    e.setDepth(this.depth)
    this.emitters.push(e)
    return e
  }

  /** Follows the pace of the battle: 0 freezes every particle in the air, 2 matches fast forward. */
  setTimeScale(scale: number): void {
    for (const e of this.emitters) e.timeScale = scale
  }

  dust(x: number, y: number, count = 8): void {
    this.dustP.emitParticleAt(x, y, count)
  }

  sparks(x: number, y: number, count = 5): void {
    this.sparkP.emitParticleAt(x, y, count)
  }

  /** Shrapnel, embers and a flash of light for a shell or fireball going off. */
  blast(x: number, y: number): void {
    this.debrisP.emitParticleAt(x, y, 12)
    this.emberP.emitParticleAt(x, y - 4, 10)
    this.smokeP.emitParticleAt(x, y - 6, 4)
    this.flash(x, y - 6, 0xffa64a, 72, 260)
  }

  ember(x: number, y: number, count = 1): void {
    this.emberP.emitParticleAt(x, y, count)
  }

  magic(x: number, y: number, count = 7): void {
    this.magicP.emitParticleAt(x, y, count)
  }

  heal(x: number, y: number): void {
    this.healP.emitParticleAt(x, y - 8, 7)
  }

  gold(x: number, y: number, count = 12): void {
    this.goldP.emitParticleAt(x, y, count)
  }

  smoke(x: number, y: number, count = 4): void {
    this.smokeP.emitParticleAt(x, y, count)
  }

  death(x: number, y: number, count = 6): void {
    this.boneP.emitParticleAt(x, y, count)
  }

  /** A short additive bloom of light that swells and fades. */
  flash(x: number, y: number, color: number, size: number, duration: number): void {
    const img = this.scene.add
      .image(x, y, FX_GLOW)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(color)
      .setDepth(this.depth - 1)
      .setDisplaySize(size * 0.5, size * 0.5)
      .setAlpha(0.85)
    this.scene.tweens.add({
      targets: img,
      displayWidth: size,
      displayHeight: size,
      alpha: 0,
      duration,
      ease: 'Quad.easeOut',
      onComplete: () => img.destroy(),
    })
  }

  /** A steady flickering light, for campfires and portals. */
  light(x: number, y: number, color: number, size: number, alpha: number): Phaser.GameObjects.Image {
    const img = this.scene.add
      .image(x, y, FX_GLOW)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(color)
      .setDepth(this.depth - 1)
      .setDisplaySize(size, size)
      .setAlpha(alpha)
    this.scene.tweens.add({
      targets: img,
      alpha: alpha * 0.7,
      displayWidth: size * 0.92,
      displayHeight: size * 0.92,
      duration: 420,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
    return img
  }
}
