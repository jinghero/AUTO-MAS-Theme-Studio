(() => {
  'use strict'
  const $ = id => document.getElementById(id)
  const tokenLabels = {
    colorPrimary: '主题色', colorBgLayout: '页面底色', colorBgContainer: '卡片底色',
    colorBgElevated: '浮层底色', colorText: '主要文字', colorTextSecondary: '辅助文字',
    colorBorder: '主要边框', colorBorderSecondary: '次要边框',
  }
  const palettes = [
    { name: 'MAS 默认', colors: ['#1677ff', '#e6f4ff', '#f5f5f5'] },
    { name: '林间', colors: ['#548466', '#d5e3bf', '#f1f5ed'] },
    { name: '海盐', colors: ['#498a9c', '#c9e2e7', '#edf5f8'] },
    { name: '暮紫', colors: ['#8b72ad', '#ddcfeb', '#f5f0f9'] },
    { name: '陶土', colors: ['#b07860', '#e9d5c4', '#f9f2eb'] },
    { name: '玫瑰', colors: ['#b16f88', '#ebcdd9', '#fbf0f4'] },
  ]
  const icons = window.themeIconSet
  let state, currentTab = 'info', currentSlot = 'background', busy = false, saveTimer, toastTimer
  let draftQueue = Promise.resolve(), draftRevision = 0, imageRevision = 0, frame = 0, lastFrame = 0
  let sprite = null, staticMascot = null, displayedMascotSource = ''

  function newState() {
    return { manifest: { formatVersion: 1, id: `my-theme-${Date.now().toString(36)}`, name: '我的主题',
      mode: 'light', tokens: { colorPrimary: '#1677ff' } }, assets: {} }
  }
  function effectiveTokens() { return window.MASPreview.resolveTokens(state.manifest) }
  function hexValue(value, base = '#ffffff') {
    if (/^#[\da-f]{6}$/i.test(value)) return value
    const match = /^rgba?\(([^)]+)\)/.exec(value)
    if (!match) return '#000000'
    const [r, g, b, a = 1] = match[1].split(',').map(Number)
    const backdrop = /^#[\da-f]{6}$/i.test(base) ? base : '#ffffff'
    return '#' + [r, g, b].map((part, index) => Math.round(part * a + parseInt(backdrop.slice(1 + index*2, 3 + index*2), 16) * (1-a)).toString(16).padStart(2,'0')).join('')
  }
  function refPaths(manifest = state.manifest) {
    return [...new Set([manifest.background?.path, manifest.preview, manifest.mascot?.path,
      manifest.mascot?.animation?.path, manifest.mascot?.animation?.resultPath,
      manifest.mascot?.animation?.dragPath, manifest.mascot?.animation?.lookPath,
      ...Object.values(manifest.menuIcons || {}), ...Object.values(manifest.cursors || {}).map(item => item.path),
    ].filter(Boolean))]
  }
  function asset(name) {
    if (!name) return ''
    return state.assets[name] || state.assets[Object.keys(state.assets).find(key => key.toLowerCase() === name.toLowerCase())] || ''
  }
  function prune() {
    const used = new Set(refPaths().map(name => name.toLowerCase()))
    for (const name of Object.keys(state.assets)) if (!used.has(name.toLowerCase())) delete state.assets[name]
  }
  function bytesSize(bytes) { return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB` }
  function totalBytes() { return Object.values(state.assets).reduce((sum, url) => sum + Math.floor((url.split(',')[1]?.length || 0) * .75), 0) }
  function toast(message, error = false) {
    clearTimeout(toastTimer)
    $('toast').textContent = message
    $('toast').classList.toggle('error', error)
    $('toast').hidden = false
    toastTimer = setTimeout(() => { $('toast').hidden = true }, error ? 7000 : 5000)
  }
  function confirm(title, message) {
    $('confirm-title').textContent = title
    $('confirm-text').textContent = message
    const dialog = $('confirm-dialog')
    dialog.showModal()
    return new Promise(resolve => {
      const finish = value => { dialog.close(); dialog.oncancel = null; resolve(value) }
      $('confirm-ok').onclick = () => finish(true)
      $('confirm-cancel').onclick = () => finish(false)
      dialog.oncancel = event => { event.preventDefault(); finish(false) }
    })
  }
  function markChanged() {
    prune()
    $('validation').textContent = ''
    renderPreview()
    renderSummary()
    clearTimeout(saveTimer)
    $('draft-status').textContent = '正在保存草稿…'
    saveTimer = setTimeout(() => saveDraft().catch(() => {}), 300)
  }
  function saveDraft() {
    clearTimeout(saveTimer)
    const revision = ++draftRevision
    const snapshot = structuredClone(state)
    draftQueue = draftQueue.catch(() => {}).then(async () => {
      const result = await window.studio.saveDraft(snapshot)
      if (revision === draftRevision) $('draft-status').textContent = result.success ? '草稿已保存 · 仅保存在本机' : `草稿保存失败：${result.error}`
      if (!result.success) throw new Error(result.error)
    })
    return draftQueue
  }
  async function run(action) {
    if (busy) return
    busy = true
    document.querySelectorAll('#export,#export-panel,#validate,#open-package,#open-mascot,#new').forEach(button => { button.disabled = true })
    try { await action() } catch (error) { toast(error.message || '操作失败', true) }
    finally {
      busy = false
      document.querySelectorAll('#export,#export-panel,#validate,#open-package,#open-mascot,#new').forEach(button => { button.disabled = false })
    }
  }
  function selectTab(tab) {
    currentTab = tab
    document.querySelectorAll('.tab-panel').forEach(panel => { panel.hidden = panel.id !== `tab-${tab}` })
    document.querySelectorAll('.step').forEach(button => {
      button.classList.toggle('active', button.dataset.tab === tab)
      button.setAttribute('aria-current', button.dataset.tab === tab ? 'step' : 'false')
    })
    document.querySelector('.editor').scrollTop = 0
    if (tab === 'check') renderSummary()
    window.themeAI.selectTab(tab)
  }
  function slotPath(slot) {
    const m = state.manifest
    if (slot === 'background') return m.background?.path
    if (slot === 'cover') return m.preview
    if (slot === 'mascot') return m.mascot?.path
    if (slot === 'icon') return m.menuIcons?.[$('icon-key').value]
    return m.cursors?.[$('cursor-key').value]?.path
  }
  function renderSlot(slot, container) {
    const target = $(container)
    target.replaceChildren()
    const name = slotPath(slot), url = asset(name)
    const root = document.createElement('div')
    root.className = 'asset-slot'
    root.dataset.slot = slot
    if (url) {
      const image = document.createElement('img')
      image.src = url; image.alt = '已导入素材'; image.className = 'asset-thumb'
      root.append(image)
    } else {
      const plus = document.createElement('div')
      plus.className = 'asset-placeholder'; plus.textContent = '+'; root.append(plus)
    }
    const detail = document.createElement('div')
    detail.className = 'asset-detail'
    const title = document.createElement('strong')
    title.textContent = url ? name.split('/').pop().replace(/^studio-/, '') : '导入一张图片'
    const hint = document.createElement('small')
    hint.textContent = url ? `${bytesSize(Math.floor(url.split(',')[1].length * .75))} · 可替换或移除` : '拖入此处，或点击下方选择'
    const buttons = document.createElement('div'); buttons.className = 'asset-buttons'
    const choose = document.createElement('button'); choose.textContent = url ? '替换图片' : '选择图片'
    choose.onclick = () => { currentSlot = slot; $('image-file').accept = slot === 'cursor' ? '.png' : '.png,.jpg,.jpeg,.webp'; $('image-file').click() }
    buttons.append(choose)
    if (url) {
      const remove = document.createElement('button'); remove.className = 'remove'; remove.textContent = '移除'
      remove.onclick = () => removeSlot(slot)
      buttons.append(remove)
    }
    detail.append(title, hint, buttons); root.append(detail); target.append(root)
    root.addEventListener('dragover', event => { event.preventDefault(); root.classList.add('dragover') })
    root.addEventListener('dragleave', () => root.classList.remove('dragover'))
    root.addEventListener('drop', event => {
      event.preventDefault(); root.classList.remove('dragover')
      const file = event.dataTransfer.files[0]
      if (file) run(() => importImage(file, slot))
    })
  }
  function renderSlots() {
    renderSlot('background', 'background-slot'); renderSlot('cover', 'cover-slot')
    renderSlot('mascot', 'mascot-slot'); renderSlot('icon', 'icon-slot'); renderSlot('cursor', 'cursor-slot')
    $('background-controls').hidden = !state.manifest.background
    $('mascot-controls').hidden = !state.manifest.mascot
    const cursor = state.manifest.cursors?.[$('cursor-key').value]
    $('cursor-controls').hidden = !cursor
    $('hotspot-x').value = cursor?.hotspotX ?? 0; $('hotspot-y').value = cursor?.hotspotY ?? 0
    $('animation-note').textContent = state.manifest.mascot?.animation ? '已保留桌宠动画。预览播放待机动画，导出包含全部动作。' : '当前为静态桌宠形象。'
  }
  function removeSlot(slot) {
    const m = state.manifest
    if (slot === 'background') delete m.background
    else if (slot === 'cover') delete m.preview
    else if (slot === 'mascot') delete m.mascot
    else if (slot === 'icon') { delete m.menuIcons[$('icon-key').value]; if (!Object.keys(m.menuIcons).length) delete m.menuIcons }
    else { delete m.cursors[$('cursor-key').value]; if (!Object.keys(m.cursors).length) delete m.cursors }
    renderSlots(); markChanged()
  }
  function renderForm() {
    const m = state.manifest, tokens = effectiveTokens()
    $('name').value = m.name; $('theme-id').value = m.id; $('description').value = m.description || ''
    $('description-count').textContent = (m.description || '').length
    document.querySelectorAll('[data-mode]').forEach(button => { button.classList.toggle('selected', button.dataset.mode === m.mode) })
    for (const key of Object.keys(tokenLabels)) {
      const value = hexValue(tokens[key], tokens.colorBgContainer)
      $(`color-${key}`).value = value; $(`text-${key}`).value = value
      $(`color-${key}`).closest('.color-row').classList.toggle('auto-token', m.tokens[key] === undefined)
    }
    renderPageTitleColor()
    $('radius').value = tokens.borderRadius ?? 6
    $('radius-value').textContent = `${tokens.borderRadius ?? 6} px`
    $('bg-size').value = m.background?.size || 'cover'; $('bg-position').value = m.background?.position || 'right bottom'
    if (!$('bg-position').value) $('bg-position').value = 'center'
    for (const [id, value] of [['bg-opacity', m.background?.opacity ?? 1], ['surface-opacity', m.background?.surfaceOpacity ?? .72], ['mascot-opacity', m.mascot?.opacity ?? 1]]) {
      $(id).value = Math.round(value * 100); $(`${id}-value`).textContent = `${Math.round(value * 100)}%`
    }
    $('mascot-width').value = m.mascot?.width ?? 192
    $('mascot-position').value = m.mascot?.position ?? 'bottom-right'
    renderSlots(); renderPreview(); renderSummary(); window.themeAI.render()
  }
  function renderPageTitleColor() {
    const color = state.manifest.tokens.colorPageTitle
    $('page-title-enabled').checked = color !== undefined
    $('page-title-fields').hidden = color === undefined
    const value = color ?? hexValue(effectiveTokens().colorText, effectiveTokens().colorBgContainer)
    $('color-page-title').value = value; $('text-page-title').value = value
  }
  function renderSummary() {
    $('summary-name').textContent = state.manifest.name || '未命名主题'
    $('summary-id').textContent = state.manifest.id || '尚未填写主题标识'
    $('asset-count').textContent = Object.keys(state.assets).length
    $('asset-size').textContent = bytesSize(totalBytes())
    $('footer-assets').textContent = `${Object.keys(state.assets).length} 张图片 · ${bytesSize(totalBytes())}`
    $('manifest-json').textContent = JSON.stringify(state.manifest, null, 2)
  }
  function renderPreview() {
    const m = state.manifest
    window.themePreview.render(state)
    $('preview-mode-label').textContent = m.mode === 'dark' ? '深色主题' : '浅色主题'
    const cover = asset(m.preview); $('cover-preview').hidden = !cover
    if (cover) {
      $('cover-preview').querySelector('img').src = cover
      $('cover-preview').querySelector('strong').textContent = m.name
      $('cover-preview').querySelector('p').textContent = m.description || '你的下一套专属主题'
    }
    updateMascot()
  }
  function updateMascot() {
    const m = state.manifest.mascot, canvas = $('preview-mascot')
    canvas.hidden = !m
    $('desktop-mascot-preview').hidden = !m
    if (!m) { displayedMascotSource = ''; sprite = null; staticMascot = null; return }
    const width = Math.min(240, (m.width ?? 192) * .65)
    canvas.style.width = `${width}px`; canvas.style.opacity = m.opacity ?? 1
    const position = m.position || 'bottom-right'
    canvas.style.top = position.startsWith('top') ? '50px' : 'auto'
    canvas.style.bottom = position.startsWith('bottom') ? '15px' : 'auto'
    canvas.style.left = position.endsWith('left') ? '125px' : 'auto'
    canvas.style.right = position.endsWith('right') ? '14px' : 'auto'
    const source = asset(m.animation?.path || m.path)
    if (source === displayedMascotSource) return
    displayedMascotSource = source
    const revision = ++imageRevision
    sprite = null; staticMascot = null; frame = 0
    const image = new Image()
    image.onload = () => {
      if (revision !== imageRevision) return
      if (m.animation) sprite = image; else staticMascot = image
      drawMascot()
    }
    image.src = source
  }
  function drawMascot() {
    const m = state.manifest.mascot, canvas = $('preview-mascot')
    const image = sprite || staticMascot
    if (!m || !image) return
    const animation = m.animation, columns = animation?.columns ?? 1
    const count = animation?.frameCount ?? columns
    const rows = sprite ? Math.ceil(count / columns) * 2 : 1
    const width = image.naturalWidth / (sprite ? columns : 1), height = image.naturalHeight / rows
    canvas.width = Math.ceil(width); canvas.height = Math.ceil(height)
    const context = canvas.getContext('2d')
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, sprite ? frame % columns * width : 0, sprite ? Math.floor(frame / columns) * height : 0, width, height, 0, 0, canvas.width, canvas.height)
  }
  function animationLoop(time) {
    const animation = state?.manifest.mascot?.animation
    if (sprite && animation && time - lastFrame >= 1000 / (animation.idleFps || 12)) {
      frame = (frame + 1) % (animation.frameCount || animation.columns); lastFrame = time; drawMascot()
    }
    requestAnimationFrame(animationLoop)
  }
  async function importImage(file, slot) {
    if (!file || file.size > 8 * 1024 * 1024) throw new Error('单张图片不能超过 8 MB')
    const match = /\.(png|jpe?g|webp)$/i.exec(file.name)
    if (!match) throw new Error('请选择 PNG、JPEG 或 WebP 图片')
    const extension = match[1].toLowerCase()
    if (slot === 'cursor' && extension !== 'png') throw new Error('鼠标光标必须使用 PNG 图片')
    const key = slot === 'icon' ? $('icon-key').value : $('cursor-key').value
    const data = new Uint8Array(await file.arrayBuffer())
    const url = await new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('图片读取失败'))
      reader.readAsDataURL(new Blob([data], { type: extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg' }))
    })
    const info = await window.themeImages.inspect(url, file.name)
    if (slot === 'cursor' && (info.width > 64 || info.height > 64)) throw new Error(`光标图片为 ${info.width} × ${info.height}，请先缩小到 64 × 64 像素以内`)
    if (slot === 'mascot' && state.manifest.mascot?.animation && !await confirm('替换桌宠形象？', '导入单张图片将替换当前动画桌宠。若要保留原动画，请取消。')) return
    const name = `assets/studio-${slot}-${crypto.randomUUID().slice(0, 8)}.${extension}`
    state.assets[name] = url
    const m = state.manifest
    if (slot === 'background') m.background = { opacity: 1, surfaceOpacity: .72, position: 'right bottom', size: 'cover', ...m.background, path: name }
    else if (slot === 'cover') m.preview = name
    else if (slot === 'mascot') m.mascot = { path: name, width: m.mascot?.width ?? 192, opacity: m.mascot?.opacity ?? 1, position: m.mascot?.position ?? 'bottom-right' }
    else if (slot === 'icon') { m.menuIcons ||= {}; m.menuIcons[key] = name }
    else { m.cursors ||= {}; m.cursors[key] = { path: name, hotspotX: 0, hotspotY: 0 } }
    renderForm(); markChanged(); toast(`图片已导入 · ${info.width} × ${info.height}`)
  }
  async function importIcons(entries) {
    if (!Array.isArray(entries) || !entries.length || entries.length > icons.length) throw new Error('请先选择要应用的图标')
    const owner = state, originalManifest = JSON.stringify(state.manifest), candidate = structuredClone(state), keys = new Set()
    candidate.manifest.menuIcons ||= {}
    for (const {key, url} of entries) {
      if (!icons.some(icon => icon.key === key) || keys.has(key)) throw new Error('菜单图标用途无效或重复')
      keys.add(key)
      const info = await window.themeImages.inspect(url, '生成的菜单图标')
      if (!url.startsWith('data:image/png;') || info.width > 128 || info.height > 128) throw new Error('生成的菜单图标需为 128 像素以内的 PNG')
      const name = `assets/ai-menu-${key}-${crypto.randomUUID().slice(0,8)}.png`
      candidate.assets[name] = url; candidate.manifest.menuIcons[key] = name
    }
    const used = new Set(refPaths(candidate.manifest).map(name => name.toLowerCase()))
    for (const name of Object.keys(candidate.assets)) if (!used.has(name.toLowerCase())) delete candidate.assets[name]
    const checked = await window.studio.validate(candidate)
    if (!checked.success) throw new Error(checked.error)
    if (state !== owner) throw new Error('主题已改变，请在当前主题重新应用图标')
    if (JSON.stringify(state.manifest) !== originalManifest) throw new Error('主题素材已改变，请重新应用图标')
    state.assets = candidate.assets; state.manifest.menuIcons = candidate.manifest.menuIcons
    renderForm(); markChanged(); toast(`已应用 ${entries.length} 个菜单图标`)
  }
  async function importZip(file, kind) {
    if (!file) return
    if (file.size > 16 * 1024 * 1024) throw new Error('ZIP 不能超过 16 MB')
    const result = await window.studio.open({ bytes: new Uint8Array(await file.arrayBuffer()), kind })
    if (!result.success) throw new Error(result.error)
    for (const [name, url] of Object.entries(result.state.assets)) await window.themeImages.inspect(url, name)
    if (kind === 'theme') {
      if (!await confirm('打开这个主题？', `当前草稿将被「${result.state.manifest.name}」替换。请先导出需要保留的当前主题。`)) return
      state = result.state; selectTab('info')
    } else {
      const mascot = result.state.manifest.mascot
      const sourceAssets = result.state.assets
      const mapping = new Map()
      for (const name of [mascot.path, mascot.animation?.path, mascot.animation?.lookPath, mascot.animation?.resultPath, mascot.animation?.dragPath].filter(Boolean)) {
        const target = `assets/studio-pet-${crypto.randomUUID().slice(0, 8)}.${name.split('.').pop()}`
        const source = Object.keys(sourceAssets).find(key => key.toLowerCase() === name.toLowerCase())
        state.assets[target] = sourceAssets[source]; mapping.set(name, target)
      }
      mascot.path = mapping.get(mascot.path)
      if (mascot.animation) for (const key of ['path', 'lookPath', 'resultPath', 'dragPath']) if (mascot.animation[key]) mascot.animation[key] = mapping.get(mascot.animation[key])
      state.manifest.mascot = mascot
    }
    renderForm(); markChanged(); await saveDraft(); toast(kind === 'theme' ? '主题已打开，可以继续编辑' : '桌宠已导入，动画与全部动作已保留')
  }
  async function exportPackage() {
    await run(async () => {
      await saveDraft()
      const result = await window.studio.export(structuredClone(state))
      if (!result.success) { selectTab('check'); showValidation(result.error, false); throw new Error(`无法导出：${result.error}`) }
      if (!result.canceled) { showValidation(`已导出 ${result.count} 张图片 · ${bytesSize(result.bytes)}\n${result.filePath}`, true); toast(`主题包已导出到：\n${result.filePath}`) }
    })
  }
  function showValidation(message, valid) {
    $('validation').textContent = message
    $('validation').className = `validation ${valid ? 'success' : 'error'}`
  }
  function bind() {
    for (const [value, label] of [['left', '左侧（默认垂直位置）'], ['right', '右侧（默认垂直位置）'], ['center center', '水平垂直居中']]) {
      const option = document.createElement('option'); option.value = value; option.textContent = label; $('bg-position').append(option)
    }
    for (const [key, label] of Object.entries(tokenLabels)) {
      const row = document.createElement('div'); row.className = 'color-row'; row.textContent = label
      const wrap = document.createElement('div'); wrap.className = 'color-input'
      const picker = document.createElement('input'); picker.type = 'color'; picker.id = `color-${key}`; picker.setAttribute('aria-label', label)
      const text = document.createElement('input'); text.type = 'text'; text.id = `text-${key}`; text.maxLength = 7; text.spellcheck = false; text.setAttribute('aria-label', `${label}十六进制`)
      picker.oninput = () => { state.manifest.tokens[key] = picker.value; text.value = picker.value; row.classList.remove('auto-token'); markChanged() }
      text.onchange = () => {
        if (!/^#[0-9a-f]{6}$/i.test(text.value)) { text.value = hexValue(effectiveTokens()[key]); toast('颜色请填写 # 加六位十六进制数字，例如 #1677ff', true); return }
        picker.value = text.value; state.manifest.tokens[key] = text.value.toLowerCase(); row.classList.remove('auto-token'); markChanged()
      }
      wrap.append(picker, text); row.append(wrap); $('color-fields').append(row)
    }
    $('page-title-enabled').onchange = () => {
      if ($('page-title-enabled').checked) state.manifest.tokens.colorPageTitle = $('color-page-title').value
      else delete state.manifest.tokens.colorPageTitle
      renderPageTitleColor(); markChanged()
    }
    $('color-page-title').oninput = () => {
      state.manifest.tokens.colorPageTitle = $('color-page-title').value
      $('text-page-title').value = $('color-page-title').value; markChanged()
    }
    $('text-page-title').onchange = () => {
      if (!/^#[0-9a-f]{6}$/i.test($('text-page-title').value)) {
        renderPageTitleColor(); toast('颜色请填写 # 加六位十六进制数字，例如 #1677ff', true); return
      }
      state.manifest.tokens.colorPageTitle = $('text-page-title').value.toLowerCase()
      renderPageTitleColor(); markChanged()
    }
    $('preview-page-title').onclick = () => window.themePreview.showPage('/plans')
    palettes.forEach(palette => {
      const button = document.createElement('button'); button.className = 'palette'; button.title = palette.name; button.setAttribute('aria-label', `${palette.name}配色`)
      palette.colors.forEach(color => { const swatch = document.createElement('i'); swatch.style.background = color; button.append(swatch) })
      button.onclick = () => {
        const mode = state.manifest.mode
        state.manifest.tokens = { colorPrimary: palette.colors[0], ...(state.manifest.tokens.colorPageTitle === undefined ? {} : { colorPageTitle: state.manifest.tokens.colorPageTitle }), ...(state.manifest.tokens.borderRadius === undefined ? {} : { borderRadius: state.manifest.tokens.borderRadius }) }
        if (mode === 'light' && palette.name !== 'MAS 默认') state.manifest.tokens.colorBgLayout = palette.colors[2]
        renderForm(); markChanged()
      }
      $('palettes').append(button)
    })
    for (const {key, label} of icons) {
      const option = document.createElement('option'); option.value = key; option.textContent = label; $('icon-key').append(option)
    }
    document.querySelectorAll('.step').forEach(button => { button.onclick = () => selectTab(button.dataset.tab) })
    document.querySelectorAll('.next').forEach(button => { button.onclick = () => selectTab(button.dataset.next) })
    for (const [id, key] of [['name', 'name'], ['theme-id', 'id'], ['description', 'description']]) $(id).oninput = () => {
      const value = key === 'description' ? $(id).value.replace(/[\r\n\t]+/g, ' ') : $(id).value
      if (key === 'description' && value !== $(id).value) $(id).value = value
      if (key === 'description' && !value) delete state.manifest.description; else state.manifest[key] = value
      $('description-count').textContent = $('description').value.length; markChanged()
    }
    document.querySelectorAll('[data-mode]').forEach(button => {
      button.onclick = () => {
        if (state.manifest.mode === button.dataset.mode) return
        state.manifest.mode = button.dataset.mode
        for (const key of Object.keys(tokenLabels)) if (key !== 'colorPrimary') delete state.manifest.tokens[key]
        renderForm(); markChanged()
      }
    })
    $('radius').oninput = () => { state.manifest.tokens.borderRadius = +$('radius').value; $('radius-value').textContent = `${$('radius').value} px`; markChanged() }
    for (const [id, key] of [['bg-size', 'size'], ['bg-position', 'position']]) $(id).onchange = () => { if (state.manifest.background) { state.manifest.background[key] = $(id).value; markChanged() } }
    for (const [id, key] of [['bg-opacity', 'opacity'], ['surface-opacity', 'surfaceOpacity']]) $(id).oninput = () => {
      if (state.manifest.background) { state.manifest.background[key] = +$(id).value / 100; $(`${id}-value`).textContent = `${$(id).value}%`; markChanged() }
    }
    for (const id of ['icon-key', 'cursor-key']) $(id).onchange = renderSlots
    $('mascot-width').onchange = () => {
      const value = Number($('mascot-width').value)
      if (!Number.isFinite(value) || value < 16 || value > 1024) { $('mascot-width').value = state.manifest.mascot?.width ?? 192; toast('桌宠宽度需要在 16–1024 像素之间', true); return }
      if (state.manifest.mascot) { state.manifest.mascot.width = value; markChanged() }
    }
    $('mascot-position').onchange = () => { if (state.manifest.mascot) { state.manifest.mascot.position = $('mascot-position').value; markChanged() } }
    $('mascot-opacity').oninput = () => { if (state.manifest.mascot) { state.manifest.mascot.opacity = +$('mascot-opacity').value / 100; $('mascot-opacity-value').textContent = `${$('mascot-opacity').value}%`; markChanged() } }
    for (const [id, key] of [['hotspot-x', 'hotspotX'], ['hotspot-y', 'hotspotY']]) $(id).onchange = async () => {
      const cursor = state.manifest.cursors?.[$('cursor-key').value]
      if (!cursor) return
      let info
      try { info = await window.themeImages.inspect(asset(cursor.path), cursor.path) }
      catch (error) { toast(error.message, true); return }
      const max = key === 'hotspotX' ? info.width : info.height
      const value = Number($(id).value)
      if (!Number.isInteger(value) || value < 0 || value >= max) { $(id).value = cursor[key] ?? 0; toast(`热点需要是图片范围内的整数（0–${(max || 64) - 1}）`, true); return }
      cursor[key] = value; markChanged()
    }
    $('image-file').onchange = () => { const file = $('image-file').files[0], slot = currentSlot; $('image-file').value = ''; run(() => importImage(file, slot)) }
    $('open-package').onclick = () => $('theme-file').click()
    $('open-mascot').onclick = () => $('mascot-file').click()
    for (const [id, kind] of [['theme-file', 'theme'], ['mascot-file', 'mascot']]) $(id).onchange = () => { const file = $(id).files[0]; $(id).value = ''; run(() => importZip(file, kind)) }
    $('export').onclick = exportPackage; $('export-panel').onclick = exportPackage
    $('validate').onclick = () => run(async () => {
      const result = await window.studio.validate(structuredClone(state))
      showValidation(result.success ? `校验通过 · ${result.count} 张图片 · ZIP ${bytesSize(result.bytes)}` : `校验未通过：${result.error}`, result.success)
    })
    $('new').onclick = async () => {
      if (await confirm('新建主题？', '新建主题将替换当前草稿。请先导出需要保留的主题 ZIP。')) { state = newState(); displayedMascotSource = ''; renderForm(); selectTab('info'); markChanged(); await saveDraft() }
    }
    $('preview-page-toggle').onclick = () => window.themePreview.toggle()
    $('mas-default-colors').onclick = () => { state.manifest.tokens = { colorPrimary: '#1677ff', ...(state.manifest.tokens.borderRadius === undefined ? {} : { borderRadius: state.manifest.tokens.borderRadius }) }; renderForm(); markChanged() }
    $('mascot-tool').onclick = () => window.studio.openMascotTool()
    $('preview-current-mascot').onclick = $('open-mascot-preview').onclick = () => run(async () => {
      if (!state.manifest.mascot) throw new Error('请先导入或生成桌宠素材')
      const result = await window.studio.openMascotTool(structuredClone(state))
      if (!result.success) throw new Error(result.error)
    })
    $('export-mascot').onclick = () => run(async () => {
      const result = await window.studio.exportMascot(structuredClone(state))
      if (!result.success) throw new Error(result.error)
      if (!result.canceled) toast(`独立桌宠包已导出：${result.filePath}`)
    })
    $('help').onclick = () => $('help-dialog').showModal(); $('help-close').onclick = () => $('help-dialog').close()
    document.addEventListener('dragover', event => event.preventDefault())
    document.addEventListener('drop', event => event.preventDefault())
    window.studio.beforeClose(async () => {
      try { await saveDraft(); await window.studio.close() }
      catch (error) {
        if (await confirm('草稿保存失败', `${error.message}。仍要退出并放弃尚未保存的修改吗？`)) await window.studio.close()
      }
    })
  }
  async function init() {
    state = newState(); bind()
    window.themePreview.init()
    window.themeAI.init({ getState: () => state, changed: markChanged, toast, importImage, importIcons, selectTab })
    const result = await window.studio.loadDraft()
    if (result.success && result.state?.manifest && result.state.assets && ['light', 'dark'].includes(result.state.manifest.mode) && result.state.manifest.tokens) {
      state = result.state; $('draft-status').textContent = '已恢复上次草稿 · 仅保存在本机'
    } else if (!result.success) toast(`草稿读取失败：${result.error}`, true)
    renderForm(); requestAnimationFrame(animationLoop)
    await window.themeAI.restoreLibrary()
  }
  init().catch(error => toast(`启动失败：${error.message}`, true))
})()
