import type { RegisterHandler, Output } from '../src/ipc'

declare const register: RegisterHandler
register('studio:validate', () => ({ count: 1, bytes: 20 }))
// @ts-expect-error IPC handlers must return the declared response shape.
register('studio:validate', () => ({ unrelated: true }))
// @ts-expect-error IPC channel names are constrained by the contract.
register('studio:unknown', () => ({}))
// @ts-expect-error A successful export needs its path, count and size.
const incomplete: Output<'studio:export'> = { canceled: false }
void incomplete
// @ts-expect-error Main-process code does not have a browser document.
document.createElement('div')
