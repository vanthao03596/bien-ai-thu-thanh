import { anim, atlasFrame, digits, frameAt, image, sheet, type Point } from './assets'
import { VIEW_H, VIEW_W } from './data/levels'

export const FONT_FAMILY = 'VT323'
export const INK = '#1d1322'

export type Align = 'left' | 'center' | 'right'

export interface TextStyle {
  size?: number
  color?: string
  align?: Align
  outline?: string | null
  alpha?: number
}

/**
 * Thin drawing layer over a 2D canvas. Everything is drawn in logical pixels
 * (768x432); the backing store is an integer multiple of that so the pixel
 * art stays crisp at any window size.
 */
export class Gfx {
  readonly canvas: HTMLCanvasElement
  readonly ctx: CanvasRenderingContext2D
  /** backing-store pixels per logical pixel */
  private scale = 1
  /** CSS pixels per logical pixel */
  private cssScale = 1

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Canvas 2D is not available')
    this.ctx = ctx
    this.resize()
  }

  resize(): void {
    const availW = Math.max(160, window.innerWidth)
    const availH = Math.max(90, window.innerHeight)
    this.cssScale = Math.min(availW / VIEW_W, availH / VIEW_H)
    const dpr = window.devicePixelRatio || 1
    this.scale = Math.max(1, Math.min(6, Math.ceil(this.cssScale * dpr - 0.01)))
    this.canvas.width = VIEW_W * this.scale
    this.canvas.height = VIEW_H * this.scale
    this.canvas.style.width = `${Math.floor(VIEW_W * this.cssScale)}px`
    this.canvas.style.height = `${Math.floor(VIEW_H * this.cssScale)}px`
  }

  begin(): void {
    const c = this.ctx
    c.setTransform(this.scale, 0, 0, this.scale, 0, 0)
    c.imageSmoothingEnabled = false
    c.globalAlpha = 1
    c.fillStyle = INK
    c.fillRect(0, 0, VIEW_W, VIEW_H)
  }

  /** Converts a pointer position to logical coordinates. */
  toLogical(clientX: number, clientY: number): Point {
    const r = this.canvas.getBoundingClientRect()
    return {
      x: ((clientX - r.left) / r.width) * VIEW_W,
      y: ((clientY - r.top) / r.height) * VIEW_H,
    }
  }

  // ------------------------------------------------------------ sprites

  /** Draws one frame of a grid sheet with its anchor at (x, y). */
  sprite(key: string, animName: string, frame: number, x: number, y: number, flip = false, alpha = 1): void {
    const s = sheet(key)
    const a = anim(key, animName)
    const img = image(key)
    const f = Math.max(0, Math.min(a.frames - 1, frame))
    const c = this.ctx
    const px = Math.round(x)
    const py = Math.round(y)
    if (alpha !== 1) c.globalAlpha = alpha
    if (flip) {
      c.save()
      c.translate(px, py)
      c.scale(-1, 1)
      c.drawImage(img, f * s.fw, a.row * s.fh, s.fw, s.fh, -s.ax, -s.ay, s.fw, s.fh)
      c.restore()
    } else {
      c.drawImage(img, f * s.fw, a.row * s.fh, s.fw, s.fh, px - s.ax, py - s.ay, s.fw, s.fh)
    }
    if (alpha !== 1) c.globalAlpha = 1
  }

  /** Draws the frame an animation shows t seconds after it started. */
  spriteAt(key: string, animName: string, t: number, x: number, y: number, flip = false, alpha = 1): void {
    this.sprite(key, animName, frameAt(anim(key, animName), t), x, y, flip, alpha)
  }

  /** Draws an atlas frame with its top-left corner at (x, y). */
  frame(key: string, name: string, x: number, y: number, alpha = 1): void {
    const f = atlasFrame(key, name)
    const c = this.ctx
    if (alpha !== 1) c.globalAlpha = alpha
    c.drawImage(image(key), f.x, f.y, f.w, f.h, Math.round(x), Math.round(y), f.w, f.h)
    if (alpha !== 1) c.globalAlpha = 1
  }

  /** Draws an atlas frame enlarged by an integer factor (big stars, portraits). */
  frameScaled(key: string, name: string, x: number, y: number, scale: number, alpha = 1): void {
    const f = atlasFrame(key, name)
    const c = this.ctx
    if (alpha !== 1) c.globalAlpha = alpha
    c.drawImage(image(key), f.x, f.y, f.w, f.h, Math.round(x), Math.round(y), f.w * scale, f.h * scale)
    if (alpha !== 1) c.globalAlpha = 1
  }

  /** Draws a 16x16 icon of the pack. */
  icon(name: string, x: number, y: number, alpha = 1): void {
    this.frame('ui/icons_16', name, x, y, alpha)
  }

  /** Splits a sentence into lines no wider than maxW. */
  wrap(str: string, maxW: number, size = 16): string[] {
    const lines: string[] = []
    let line = ''
    for (const word of str.split(' ')) {
      const next = line ? `${line} ${word}` : word
      if (line && this.textWidth(next, size) > maxW) {
        lines.push(line)
        line = word
      } else {
        line = next
      }
    }
    if (line) lines.push(line)
    return lines
  }

  /** Draws part of an atlas frame (used for bars that fill up). */
  framePart(key: string, name: string, x: number, y: number, w: number, h: number, srcDx = 0, srcDy = 0): void {
    if (w <= 0 || h <= 0) return
    const f = atlasFrame(key, name)
    this.ctx.drawImage(
      image(key), f.x + srcDx, f.y + srcDy, Math.min(w, f.w - srcDx), Math.min(h, f.h - srcDy),
      Math.round(x) + srcDx, Math.round(y) + srcDy, Math.min(w, f.w - srcDx), Math.min(h, f.h - srcDy),
    )
  }

  /** Draws an atlas frame anchored at its bottom centre pivot. */
  framePivot(key: string, name: string, x: number, y: number, alpha = 1): void {
    const f = atlasFrame(key, name)
    this.frame(key, name, x - f.w / 2, y - f.h * 0.92, alpha)
  }

  /** Stretches a 48x48 panel frame over any size, keeping its corners intact. */
  nine(key: string, name: string, x: number, y: number, w: number, h: number, corner = 16): void {
    const f = atlasFrame(key, name)
    const img = image(key)
    const c = this.ctx
    const dx = Math.round(x)
    const dy = Math.round(y)
    const cw = Math.min(corner, Math.floor(w / 2))
    const ch = Math.min(corner, Math.floor(h / 2))
    const sxs = [f.x, f.x + corner, f.x + f.w - corner]
    const sws = [corner, f.w - corner * 2, corner]
    const sys = [f.y, f.y + corner, f.y + f.h - corner]
    const shs = [corner, f.h - corner * 2, corner]
    const dxs = [dx, dx + cw, dx + w - cw]
    const dws = [cw, w - cw * 2, cw]
    const dys = [dy, dy + ch, dy + h - ch]
    const dhs = [ch, h - ch * 2, ch]
    for (let r = 0; r < 3; r++) {
      for (let col = 0; col < 3; col++) {
        if (dws[col] <= 0 || dhs[r] <= 0) continue
        // corners are cropped rather than squashed when the panel is small
        const sw = col === 1 ? sws[col] : dws[col]
        const sh = r === 1 ? shs[r] : dhs[r]
        const sx = col === 2 ? sxs[col] + (corner - dws[col]) : sxs[col]
        const sy = r === 2 ? sys[r] + (corner - dhs[r]) : sys[r]
        c.drawImage(img, sx, sy, sw, sh, dxs[col], dys[r], dws[col], dhs[r])
      }
    }
  }

  /** Stretches a rectangular button frame horizontally. */
  three(key: string, name: string, x: number, y: number, w: number, cap = 6): void {
    const f = atlasFrame(key, name)
    const img = image(key)
    const c = this.ctx
    const dx = Math.round(x)
    const dy = Math.round(y)
    c.drawImage(img, f.x, f.y, cap, f.h, dx, dy, cap, f.h)
    c.drawImage(img, f.x + cap, f.y, f.w - cap * 2, f.h, dx + cap, dy, w - cap * 2, f.h)
    c.drawImage(img, f.x + f.w - cap, f.y, cap, f.h, dx + w - cap, dy, cap, f.h)
  }

  // ------------------------------------------------------------ text

  /** Width in pixels of a string drawn with the bitmap digit font. */
  digitsWidth(text: string): number {
    return text.length * 6 + 1
  }

  /** Draws numbers with the bitmap font of the pack (0-9 + - / x : % $). */
  digits(text: string, x: number, y: number, align: Align = 'left', alpha = 1): void {
    const font = digits()
    const img = image(font.key)
    const w = this.digitsWidth(text)
    let dx = Math.round(align === 'left' ? x : align === 'center' ? x - w / 2 : x - w)
    const dy = Math.round(y)
    const c = this.ctx
    if (alpha !== 1) c.globalAlpha = alpha
    for (const ch of text) {
      const i = font.chars.indexOf(ch)
      if (i >= 0) c.drawImage(img, i * font.glyphW, 0, font.glyphW, font.glyphH, dx, dy, font.glyphW, font.glyphH)
      dx += 6
    }
    if (alpha !== 1) c.globalAlpha = 1
  }

  text(str: string, x: number, y: number, style: TextStyle = {}): void {
    const c = this.ctx
    const size = style.size ?? 16
    c.font = `${size}px ${FONT_FAMILY}, monospace`
    c.textAlign = style.align ?? 'left'
    c.textBaseline = 'top'
    if (style.alpha !== undefined) c.globalAlpha = style.alpha
    const outline = style.outline === undefined ? INK : style.outline
    if (outline) {
      c.lineJoin = 'round'
      c.lineWidth = Math.max(2, size / 6)
      c.strokeStyle = outline
      c.strokeText(str, x, y)
    }
    c.fillStyle = style.color ?? '#f6efd8'
    c.fillText(str, x, y)
    if (style.alpha !== undefined) c.globalAlpha = 1
  }

  textWidth(str: string, size = 16): number {
    this.ctx.font = `${size}px ${FONT_FAMILY}, monospace`
    return this.ctx.measureText(str).width
  }

  // ------------------------------------------------------------ shapes

  rect(x: number, y: number, w: number, h: number, color: string, alpha = 1): void {
    const c = this.ctx
    c.globalAlpha = alpha
    c.fillStyle = color
    c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
    c.globalAlpha = 1
  }

  /** Dotted ellipse with a faint fill, in the style of the range sprites of the pack. */
  rangeEllipse(cx: number, cy: number, rx: number, ry: number, ok = true): void {
    const c = this.ctx
    const rgb = ok ? '255,240,160' : '255,90,80'
    c.fillStyle = `rgba(${rgb},0.2)`
    c.beginPath()
    c.ellipse(Math.round(cx), Math.round(cy), rx, ry, 0, 0, Math.PI * 2)
    c.fill()
    c.fillStyle = `rgba(${rgb},0.95)`
    const n = Math.max(24, Math.round((rx + ry) * 0.22) * 2)
    for (let k = 0; k < n; k += 2) {
      const a = (k / n) * Math.PI * 2
      c.fillRect(Math.round(cx + Math.cos(a) * rx) - 1, Math.round(cy + Math.sin(a) * ry), 3, 2)
    }
  }

  /** Solid pixel ellipse outline (selection rings). */
  ring(cx: number, cy: number, rx: number, ry: number, color: string): void {
    const c = this.ctx
    c.fillStyle = color
    const n = Math.round((rx + ry) * 3)
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2
      c.fillRect(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), 1, 1)
    }
  }
}
