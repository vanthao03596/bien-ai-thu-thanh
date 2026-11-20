// Asset registry: reads every sprite sheet description (JSON) of the pixel pack at
// build time and loads the matching PNG files at runtime. The pack itself stays
// untouched inside td_pixel_assets/.

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface AnimDef {
  row: number
  frames: number
  fps: number
  loop: boolean
  hitFrame?: number
  releaseFrame?: number
  spawnFrame?: number
}

/** Uniform grid sheet: one animation per row. */
export interface Sheet {
  key: string
  fw: number
  fh: number
  ax: number
  ay: number
  anims: Record<string, AnimDef>
  unitSlots: Point[]
  projectileOrigin: Point | null
  spawnPoint: Point | null
}

/** Packed atlas of differently sized static sprites. */
export interface Atlas {
  key: string
  frames: Record<string, Rect>
}

export interface DigitFont {
  key: string
  glyphW: number
  glyphH: number
  chars: string
}

const jsonModules = import.meta.glob<unknown>('../td_pixel_assets/*/*.json', {
  eager: true,
  import: 'default',
})

const imageUrls = import.meta.glob<string>('../td_pixel_assets/*/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
})

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function optNum(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function point(v: unknown): Point | null {
  if (!isRecord(v)) return null
  return { x: num(v.x), y: num(v.y) }
}

function rect(v: unknown): Rect | null {
  if (!isRecord(v)) return null
  return { x: num(v.x), y: num(v.y), w: num(v.w), h: num(v.h) }
}

function keyOf(path: string): string {
  const m = /td_pixel_assets\/(.+)\.(json|png)$/.exec(path)
  if (!m) throw new Error(`Unexpected asset path: ${path}`)
  return m[1]
}

const sheets = new Map<string, Sheet>()
const atlases = new Map<string, Atlas>()
let digitFont: DigitFont | null = null

function parseSheet(key: string, json: Record<string, unknown>): Sheet {
  const meta = isRecord(json.meta) ? json.meta : {}
  const anchor = point(meta.anchor) ?? { x: 0, y: 0 }
  const anims: Record<string, AnimDef> = {}
  const rawAnims = isRecord(json.animations) ? json.animations : {}
  for (const [name, raw] of Object.entries(rawAnims)) {
    if (!isRecord(raw)) continue
    anims[name] = {
      row: num(raw.row),
      frames: Math.max(1, num(raw.frames, 1)),
      fps: Math.max(1, num(raw.fps, 1)),
      loop: raw.loop === true,
      hitFrame: optNum(raw.hitFrame),
      releaseFrame: optNum(raw.releaseFrame),
      spawnFrame: optNum(raw.spawnFrame),
    }
  }
  const unitSlots: Point[] = []
  if (Array.isArray(meta.unitSlots)) {
    for (const s of meta.unitSlots) {
      const p = point(s)
      if (p) unitSlots.push(p)
    }
  }
  return {
    key,
    fw: num(meta.frameWidth, 32),
    fh: num(meta.frameHeight, 32),
    ax: anchor.x,
    ay: anchor.y,
    anims,
    unitSlots,
    projectileOrigin: point(meta.projectileOrigin),
    spawnPoint: point(meta.spawnPoint),
  }
}

function parseAtlas(key: string, source: Record<string, unknown>): Atlas {
  const frames: Record<string, Rect> = {}
  for (const [name, raw] of Object.entries(source)) {
    if (!isRecord(raw)) continue
    // TexturePacker hash stores the rect under "frame"; the tile sheets store it inline.
    const r = rect(isRecord(raw.frame) ? raw.frame : raw)
    if (r) frames[name] = r
  }
  return { key, frames }
}

for (const [path, json] of Object.entries(jsonModules)) {
  if (!isRecord(json)) continue
  const key = keyOf(path)
  if (isRecord(json.animations) && isRecord(json.meta)) {
    sheets.set(key, parseSheet(key, json))
  } else if (isRecord(json.tiles)) {
    atlases.set(key, parseAtlas(key, json.tiles))
  } else if (isRecord(json.frames)) {
    atlases.set(key, parseAtlas(key, json.frames))
  } else if (typeof json.chars === 'string') {
    digitFont = {
      key,
      glyphW: num(json.glyphWidth, 7),
      glyphH: num(json.glyphHeight, 10),
      chars: json.chars,
    }
  }
}

export function sheet(key: string): Sheet {
  const s = sheets.get(key)
  if (!s) throw new Error(`Unknown sprite sheet: ${key}`)
  return s
}

export function anim(key: string, name: string): AnimDef {
  const a = sheet(key).anims[name]
  if (!a) throw new Error(`Unknown animation ${name} in ${key}`)
  return a
}

export function hasAnim(key: string, name: string): boolean {
  return sheets.get(key)?.anims[name] !== undefined
}

export function atlas(key: string): Atlas {
  const a = atlases.get(key)
  if (!a) throw new Error(`Unknown atlas: ${key}`)
  return a
}

export function atlasFrame(key: string, name: string): Rect {
  const f = atlas(key).frames[name]
  if (!f) throw new Error(`Unknown frame ${name} in atlas ${key}`)
  return f
}

export function digits(): DigitFont {
  if (!digitFont) throw new Error('Digit font description missing')
  return digitFont
}

export function sheetKeys(): string[] {
  return [...sheets.keys()]
}

/** Length of an animation in seconds. */
export function animDuration(a: AnimDef): number {
  return a.frames / a.fps
}

/** Frame index shown at time t (seconds since the animation started). */
export function frameAt(a: AnimDef, t: number): number {
  const f = Math.floor(Math.max(0, t) * a.fps)
  return a.loop ? f % a.frames : Math.min(a.frames - 1, f)
}

/** Seconds from the start of an animation until its marker frame is reached. */
export function markerTime(a: AnimDef): number {
  const f = a.hitFrame ?? a.releaseFrame ?? a.spawnFrame ?? 0
  return f / a.fps
}

// ---------------------------------------------------------------- images

const images = new Map<string, HTMLImageElement>()

export function image(key: string): HTMLImageElement {
  const img = images.get(key)
  if (!img) throw new Error(`Image not loaded: ${key}`)
  return img
}

export async function loadImages(onProgress?: (done: number, total: number) => void): Promise<void> {
  const entries = Object.entries(imageUrls)
  let done = 0
  await Promise.all(
    entries.map(
      ([path, url]) =>
        new Promise<void>((resolve, reject) => {
          const img = new Image()
          img.onload = () => {
            images.set(keyOf(path), img)
            done += 1
            onProgress?.(done, entries.length)
            resolve()
          }
          img.onerror = () => reject(new Error(`Failed to load ${path}`))
          img.src = url
        }),
    ),
  )
}
