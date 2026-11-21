import Phaser from 'phaser'
import { sfx } from '../app'
import { VIEW_H, VIEW_W } from '../data/levels'
import { CREAM, label } from './text'

export const HUD = 'ui/hud'
export const BUTTONS = 'ui/buttons'
export const ICONS = 'ui/icons_16'

type Parent = Phaser.GameObjects.Container | null

function adopt<T extends Phaser.GameObjects.GameObject>(parent: Parent, obj: T): T {
  if (parent) parent.add(obj)
  return obj
}

/** An atlas frame placed by its top-left corner. */
export function sprite(scene: Phaser.Scene, key: string, frame: string, x: number, y: number, parent: Parent = null): Phaser.GameObjects.Image {
  return adopt(parent, scene.add.image(x, y, key, frame).setOrigin(0, 0))
}

/** A 16x16 icon of the pack. */
export function icon(scene: Phaser.Scene, name: string, x: number, y: number, parent: Parent = null): Phaser.GameObjects.Image {
  return sprite(scene, ICONS, name, x, y, parent)
}

/** Swaps the frame of a top-left anchored image only when it changed. */
export function setFrame(image: Phaser.GameObjects.Image, frame: string): void {
  if (image.frame.name !== frame) image.setFrame(frame)
}

/** Stretches a 48x48 panel frame over any size, keeping its corners intact. */
export function panel(
  scene: Phaser.Scene,
  frame: string,
  x: number,
  y: number,
  w: number,
  h: number,
  parent: Parent = null,
): Phaser.GameObjects.NineSlice {
  const cw = Math.min(16, Math.floor(w / 2))
  const ch = Math.min(16, Math.floor(h / 2))
  return adopt(parent, scene.add.nineslice(x, y, HUD, frame, w, h, cw, cw, ch, ch).setOrigin(0, 0))
}

export function resizePanel(p: Phaser.GameObjects.NineSlice, w: number, h: number): void {
  if (p.width === w && p.height === h) return
  const cw = Math.min(16, Math.floor(w / 2))
  const ch = Math.min(16, Math.floor(h / 2))
  p.setSlices(w, h, cw, cw, ch, ch)
}

/** Full-screen dimmer in the ink colour of the pack. */
export function veil(scene: Phaser.Scene, alpha: number, parent: Parent = null): Phaser.GameObjects.Rectangle {
  return adopt(parent, scene.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x1d1322, alpha).setOrigin(0, 0))
}

/** True when the object and all containers above it are drawn. */
function shown(obj: Phaser.GameObjects.Zone): boolean {
  if (!obj.visible) return false
  let p = obj.parentContainer
  while (p) {
    if (!p.visible || p.alpha <= 0) return false
    p = p.parentContainer
  }
  return true
}

export interface HitHandlers {
  onClick?: (pointer: Phaser.Input.Pointer) => void
  /** hover or press state changed */
  onChange?: () => void
}

/** Marks the zones that turn the cursor gold. */
export const CLICKABLE = 'clickable'

/** A rectangular pointer target with hover and press state. */
export class HitBox {
  readonly zone: Phaser.GameObjects.Zone
  private over = false
  private pressed = false

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    w: number,
    h: number,
    private readonly handlers: HitHandlers,
    parent: Parent = null,
    clickable = true,
  ) {
    this.zone = adopt(parent, scene.add.zone(x, y, w, h).setOrigin(0, 0))
    this.zone.setInteractive()
    this.zone.setData(CLICKABLE, clickable)
    this.zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      this.over = true
      handlers.onChange?.()
    })
    this.zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      this.over = false
      this.pressed = false
      handlers.onChange?.()
    })
    this.zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (pointer.button !== 0) return
      this.over = true
      this.pressed = true
      handlers.onChange?.()
    })
    this.zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      if (pointer.button !== 0) return
      const click = this.pressed
      this.pressed = false
      handlers.onChange?.()
      if (click) handlers.onClick?.(pointer)
    })
  }

  get hover(): boolean {
    return this.over && shown(this.zone)
  }

  get down(): boolean {
    return this.pressed && this.hover
  }

  /** Forgets hover and press, for widgets that were hidden while the pointer was on them. */
  reset(): void {
    if (!this.over && !this.pressed) return
    this.over = false
    this.pressed = false
    this.handlers.onChange?.()
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.zone.visible) return
    this.zone.setVisible(enabled)
    if (!enabled) this.reset()
  }
}

export interface RoundButtonOptions {
  icon?: string
}

/** 32x32 round button of the pack: btn_<name>_<normal|pressed|disabled>, with an optional icon on top. */
export class RoundButton {
  readonly root: Phaser.GameObjects.Container
  readonly hit: HitBox
  private readonly face: Phaser.GameObjects.Image
  private readonly glyph: Phaser.GameObjects.Image | null
  private glyphName: string
  private disabled = false
  private active = false

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly name: string,
    onClick: (pointer: Phaser.Input.Pointer) => void,
    opts: RoundButtonOptions = {},
    parent: Parent = null,
  ) {
    this.root = adopt(parent, scene.add.container(x, y))
    this.face = sprite(scene, BUTTONS, `btn_${name}_normal`, 0, 0, this.root)
    this.glyph = opts.icon ? icon(scene, opts.icon, 8, 8, this.root) : null
    this.glyphName = opts.icon ?? ''
    this.hit = new HitBox(
      scene, 0, 0, 32, 32,
      {
        onClick: (pointer) => {
          if (this.disabled) sfx.play('deny')
          else onClick(pointer)
        },
        onChange: () => this.render(),
      },
      this.root,
    )
  }

  setState(disabled: boolean, active = false): this {
    if (disabled !== this.disabled || active !== this.active) {
      this.disabled = disabled
      this.active = active
      this.render()
    }
    return this
  }

  /** Swaps the icon of a button that was created with one. */
  setIcon(name: string): this {
    if (this.glyph && name !== this.glyphName) {
      this.glyphName = name
      this.glyph.setFrame(name)
    }
    return this
  }

  setVisible(visible: boolean): this {
    if (visible !== this.root.visible) {
      this.root.setVisible(visible)
      if (!visible) this.hit.reset()
    }
    return this
  }

  /** Greys the button out and stops it from reacting at all. */
  setInert(inert: boolean): this {
    this.hit.setEnabled(!inert)
    return this
  }

  get hover(): boolean {
    return this.hit.hover
  }

  private render(): void {
    const pressed = !this.disabled && (this.active || this.hit.down)
    setFrame(this.face, `btn_${this.name}_${this.disabled ? 'disabled' : pressed ? 'pressed' : 'normal'}`)
    if (this.glyph) {
      this.glyph.y = 8 + (pressed ? 1 : 0)
      this.glyph.setAlpha(this.disabled ? 0.45 : 1)
    }
  }
}

/** Text button stretched from the 64x20 rectangle frames of the pack. */
export class RectButton {
  readonly root: Phaser.GameObjects.Container
  readonly hit: HitBox
  private readonly face: Phaser.GameObjects.NineSlice
  private readonly caption: Phaser.GameObjects.Text
  private readonly captionY: number
  private text: string

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    w: number,
    text: string,
    private readonly color: 'green' | 'red',
    onClick: () => void,
    parent: Parent = null,
  ) {
    this.text = text
    this.root = adopt(parent, scene.add.container(x, y))
    this.face = scene.add.nineslice(0, 0, BUTTONS, `btn_rect_${color}_normal`, w, 20, 6, 6, 0, 0).setOrigin(0, 0)
    this.root.add(this.face)
    this.caption = label(scene, w / 2, 2, text, { align: 'center' })
    this.captionY = this.caption.y
    this.root.add(this.caption)
    this.hit = new HitBox(
      scene, 0, 0, w, 20,
      {
        onClick: () => {
          sfx.play('click')
          onClick()
        },
        onChange: () => this.render(),
      },
      this.root,
    )
  }

  setText(text: string): this {
    if (text !== this.text) {
      this.text = text
      this.caption.setText(text)
    }
    return this
  }

  private render(): void {
    const pressed = this.hit.down
    const frame = `btn_rect_${this.color}_${pressed ? 'pressed' : 'normal'}`
    if (this.face.frame.name !== frame) this.face.setFrame(frame)
    this.caption.y = this.captionY + (pressed ? 1 : 0)
    this.caption.setColor(this.hit.hover ? '#ffffff' : CREAM)
  }
}

/** The arrow cursor of the pack; it follows the mouse and turns gold over anything clickable. */
export class Cursor {
  private readonly image: Phaser.GameObjects.Image

  constructor(private readonly scene: Phaser.Scene) {
    this.image = sprite(scene, HUD, 'cursor_point', -100, -100).setDepth(10000)
    scene.input.setDefaultCursor('none')
  }

  /** Logical position of the pointer in this scene. */
  position(pointer: Phaser.Input.Pointer): Phaser.Math.Vector2 {
    return this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y)
  }

  update(gold: boolean): void {
    const pointer = this.scene.input.activePointer
    const visible = !pointer.wasTouch && this.scene.sys.game.input.isOver
    this.image.setVisible(visible)
    if (!visible) return
    const p = this.position(pointer)
    this.image.setPosition(Math.floor(p.x) - 1, Math.floor(p.y) - 1)
    setFrame(this.image, gold ? 'cursor_gold' : 'cursor_point')
  }
}

/** The top-most interactive object under the active pointer, or null. */
export function topHit(scene: Phaser.Scene): Phaser.GameObjects.GameObject | null {
  const pointer = scene.input.activePointer
  const hits = scene.input.hitTestPointer(pointer)
  if (hits.length > 1) scene.input.sortGameObjects(hits, pointer)
  return hits[0] ?? null
}

/** True when the mouse is over a clickable widget of the scene. */
export function overClickable(scene: Phaser.Scene): boolean {
  if (scene.input.activePointer.wasTouch) return false
  return topHit(scene)?.getData(CLICKABLE) === true
}
