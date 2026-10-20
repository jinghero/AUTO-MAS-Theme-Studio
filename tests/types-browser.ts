import { element } from '../src/dom'

element('name').value = 'theme'
element('preview-mascot').getContext('2d')
// @ts-expect-error Unknown static DOM IDs must not bypass the checked map.
element('not-a-real-element')
// @ts-expect-error Callers cannot reinterpret an input as a canvas.
element<HTMLCanvasElement>('name')
// @ts-expect-error Sandboxed renderer code cannot use Node globals.
Buffer.from('renderer')
// @ts-expect-error Sandboxed renderer code cannot use the Node process.
process.cwd()
