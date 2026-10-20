import type { StudioState } from './types/studio'
export const themePreview = (() => {
  let current: StudioState | undefined,
    page = '/home'
  const frame = () => document.getElementById('mas-preview-frame') as HTMLIFrameElement
  function render(state: StudioState) {
    current = { manifest: state.manifest, assets: state.assets }
    frame()?.contentWindow?.postMessage({ type: 'mas-theme-preview', state: current, page }, '*')
  }
  function resize() {
    const viewport = document.getElementById('preview-viewport')
    if (!viewport || !viewport.clientWidth || !viewport.clientHeight) return
    document.getElementById('preview-scale')!.textContent =
      `自适应 · ${viewport.clientWidth} × ${viewport.clientHeight}`
  }
  function init() {
    new ResizeObserver(resize).observe(document.querySelector('.preview-wrap')!)
    frame().addEventListener('load', () => {
      if (current) render(current)
      resize()
    })
    window.addEventListener('message', (event) => {
      if (event.source === frame().contentWindow && event.data?.type === 'mas-preview-page')
        page = event.data.page
      if (
        event.source === frame().contentWindow &&
        event.data?.type === 'mas-preview-ready' &&
        current
      )
        render(current)
    })
    resize()
  }
  function toggle() {
    page = page === '/home' ? '/plans' : '/home'
    if (current) render(current)
  }
  function showPage(value: string) {
    page = value
    if (current) render(current)
  }
  return { init, render, toggle, resize, showPage }
})()

export {}
