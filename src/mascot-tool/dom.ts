import { requiredElement, validateElements } from '../required-element'
const tags = {
  app: 'main',
  demo: 'button',
  theme: 'select',
  open: 'button',
  file: 'input',
  error: 'div',
  name: 'h2',
  source: 'span',
  stage: 'div',
  'action-badge': 'span',
  canvas: 'canvas',
  'size-info': 'span',
  'frame-label': 'output',
  'cell-info': 'span',
  frame: 'input',
  previous: 'button',
  play: 'button',
  next: 'button',
  'sheet-section': 'details',
  sheet: 'canvas',
  action: 'select',
  'look-controls': 'div',
  look: 'select',
  'package-fps': 'input',
  fps: 'input',
  duration: 'p',
  'width-label': 'output',
  width: 'input',
  'opacity-label': 'output',
  opacity: 'input',
  background: 'select',
  pixel: 'input',
  parameters: 'details',
  'raw-controls': 'div',
  'raw-kind': 'select',
  columns: 'input',
  count: 'input',
  'parameter-hint': 'p',
  status: 'span',
} as const
export type ElementId = keyof typeof tags
export function initializeElements() {
  validateElements(tags)
}
export function element<K extends ElementId>(id: K): HTMLElementTagNameMap[(typeof tags)[K]]
export function element(id: string): HTMLElement {
  if (!(id in tags)) throw new Error(`未知界面元素：${id}`)
  return requiredElement(id, tags[id as ElementId])
}
