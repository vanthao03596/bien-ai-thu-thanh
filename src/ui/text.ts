import Phaser from 'phaser'
import { pixelScale } from '../display'

export const FONT_FAMILY = 'VT323'
export const FONT_STACK = `${FONT_FAMILY}, monospace`
export const INK = '#1d1322'
export const CREAM = '#f6efd8'
export const GOLD = '#ffe27a'
export const PARCHMENT_INK = '#3b2414'
export const PARCHMENT_DIM = '#8a5a2c'

export type Align = 'left' | 'center' | 'right'

export interface LabelStyle {
  size?: number
  color?: string
  align?: Align
  /** outline colour; null draws the text without one */
  outline?: string | null
  alpha?: number
}

// Tall Vietnamese capitals stack two diacritics; measuring with them keeps the text canvas from clipping.
const TEST_STRING = '|MÉqgyẨỆ'

let measure: CanvasRenderingContext2D | null = null

function measureCtx(size: number): CanvasRenderingContext2D {
  if (!measure) {
    const ctx = document.createElement('canvas').getContext('2d')
    if (!ctx) throw new Error('Canvas 2D is not available')
    measure = ctx
  }
  measure.font = `${size}px ${FONT_STACK}`
  return measure
}

const inkTops = new Map<number, number>()

/** Distance from the top of the em box down to the first inked row of the font at this size. */
function inkTop(size: number): number {
  let v = inkTops.get(size)
  if (v === undefined) {
    const ctx = measureCtx(size)
    ctx.textBaseline = 'top'
    v = -ctx.measureText(TEST_STRING).actualBoundingBoxAscent
    inkTops.set(size, v)
  }
  return v
}

export function textWidth(str: string, size = 16): number {
  return measureCtx(size).measureText(str).width
}

/** Splits a sentence into lines no wider than maxW. */
export function wrapText(str: string, maxW: number, size = 16): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of str.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (line && textWidth(next, size) > maxW) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

const live = new Set<Phaser.GameObjects.Text>()

function outlineWidth(size: number, outline: string | null): number {
  return outline ? Math.max(2, size / 6) : 0
}

/**
 * Text in the game font. (x, y) is the top of the em box, like a canvas fillText
 * with a top baseline; the glyphs are rasterised at the device resolution.
 */
export function label(scene: Phaser.Scene, x: number, y: number, str: string, style: LabelStyle = {}): Phaser.GameObjects.Text {
  const size = style.size ?? 16
  const align = style.align ?? 'left'
  const outline = style.outline === undefined ? INK : style.outline
  const thickness = outlineWidth(size, outline)
  const dx = align === 'left' ? -thickness / 2 : align === 'right' ? thickness / 2 : 0
  const t = scene.add.text(x + dx, y + inkTop(size) - thickness / 2, str, {
    fontFamily: FONT_STACK,
    fontSize: `${size}px`,
    color: style.color ?? CREAM,
    stroke: outline ?? undefined,
    strokeThickness: thickness,
    resolution: pixelScale(scene),
    testString: TEST_STRING,
  })
  t.setOrigin(align === 'left' ? 0 : align === 'center' ? 0.5 : 1, 0)
  // text maps texel to device pixel one to one; snapping the quad keeps it sharp under camera zoom
  t.vertexRoundMode = 'full'
  if (style.alpha !== undefined) t.setAlpha(style.alpha)
  live.add(t)
  t.once(Phaser.GameObjects.Events.DESTROY, () => live.delete(t))
  return t
}

/** Re-rasterises every label after the pixel scale changed. */
export function refreshLabels(scale: number): void {
  for (const t of live) {
    if (t.style.resolution !== scale) t.setResolution(scale)
  }
}

// ---------------------------------------------------------------- bitmap digits

export const DIGIT_FONT = 'digits'
const DIGIT_ADVANCE = 6

export function digitsWidth(text: string): number {
  return text.length * DIGIT_ADVANCE + 1
}

/** Numbers drawn with the bitmap font of the pack (0-9 + - / x : % $). */
export class Digits {
  readonly obj: Phaser.GameObjects.BitmapText
  private x: number
  private text = ''

  constructor(scene: Phaser.Scene, x: number, y: number, text = '', private readonly align: Align = 'left') {
    this.x = x
    this.obj = scene.add.bitmapText(x, Math.round(y), DIGIT_FONT, '')
    this.obj.setLetterSpacing(DIGIT_ADVANCE - 7)
    this.obj.vertexRoundMode = 'full'
    this.set(text)
  }

  set(text: string): this {
    if (text !== this.text) {
      this.text = text
      this.obj.setText(text)
    }
    this.place()
    return this
  }

  moveTo(x: number, y: number): this {
    this.x = x
    this.obj.y = Math.round(y)
    this.place()
    return this
  }

  private place(): void {
    const w = digitsWidth(this.text)
    this.obj.x = Math.round(this.align === 'left' ? this.x : this.align === 'center' ? this.x - w / 2 : this.x - w)
  }
}
