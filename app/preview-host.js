(() => {
  let current, page = '/home'
  const frame = () => document.getElementById('mas-preview-frame')
  function render(state) {
    current = { manifest: state.manifest, assets: state.assets }
    frame()?.contentWindow?.postMessage({ type: 'mas-theme-preview', state: current, page }, '*')
  }
  function resize() {
    const container = document.querySelector('.preview-wrap'), viewport = document.getElementById('preview-viewport')
    if (!container || !viewport || !container.clientWidth || !container.clientHeight) return
    const scale = Math.min(container.clientWidth / 1280, container.clientHeight / 800)
    viewport.style.width = `${1280 * scale}px`; viewport.style.height = `${800 * scale}px`
    frame().style.transform = `scale(${scale})`
    document.getElementById('preview-scale').textContent = `${Math.round(scale * 100)}% · 1280 × 800`
  }
  function init() {
    new ResizeObserver(resize).observe(document.querySelector('.preview-wrap'))
    frame().addEventListener('load', () => { if (current) render(current); resize() })
    window.addEventListener('message', event => {
      if (event.source === frame().contentWindow && event.data?.type === 'mas-preview-ready' && current) render(current)
    })
    resize()
  }
  function toggle() { page = page === '/home' ? '/plans' : '/home'; if (current) render(current) }
  window.themePreview = { init, render, toggle, resize }
})()
