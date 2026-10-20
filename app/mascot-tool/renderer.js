(() => {
  const $ = id => document.getElementById(id)
  const canvas = $('canvas')
  const context = canvas.getContext('2d')
  const actions = [
    ['idle', '待机', 'main'], ['working', '工作', 'main'],
    ['success', '成功', 'result'], ['failure', '失败', 'result'],
    ['drag', '拖拽', 'drag'], ['look', '视线', 'look'],
    ['stopped', '停止反应', 'main'], ['static', '静态图片', 'static'],
  ]
  let pack
  let action = 'idle'
  let frame = 0
  let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches
  let raf = 0
  let lastTime = 0
  let importRevision = 0
  window.preview.onLoad(async data => {
    const revision = ++importRevision
    try { await loadResult({ success:true,pack:data },revision) }
    catch (reason) { error(reason.message) }
  })

  function error(text) {
    $('error').textContent = text
    $('error').hidden = !text
  }

  function frameCount() {
    return action === 'look' ? 9 : action === 'static' || action === 'stopped' ? 1 : pack.frameCount
  }

  function fps() {
    return $('package-fps').checked ? (action === 'working' ? pack.workingFps : pack.idleFps) : Number($('fps').value)
  }

  function animated() {
    return pack && !['look', 'static', 'stopped'].includes(action)
  }

  function selectedRect() {
    const slot = actions.find(item => item[0] === action)[2]
    const image = pack.images[slot]
    if (action === 'static') return { image, x: 0, y: 0, width: image.width, height: image.height, column: 0, row: 0 }
    const looking = action === 'look'
    const columns = looking ? 3 : pack.columns
    const rowsPerAction = looking ? 3 : Math.ceil(pack.frameCount / pack.columns)
    const rows = looking ? 3 : rowsPerAction * (slot === 'drag' ? 1 : 2)
    const current = action === 'stopped' ? Math.min(2, pack.frameCount - 1) : frame
    const actionIndex = action === 'working' || action === 'success' || action === 'stopped' ? 1 : 0
    const column = current % columns
    const row = looking ? Math.floor(current / 3) : actionIndex * rowsPerAction + Math.floor(current / columns)
    const width = image.width / columns
    const height = image.height / rows
    return { image, x: column * width, y: row * height, width, height, column, row }
  }

  function draw() {
    if (!pack) return
    const bounds = canvas.getBoundingClientRect()
    const ratio = devicePixelRatio || 1
    const width = Math.max(1, Math.round(bounds.width * ratio))
    const height = Math.max(1, Math.round(bounds.height * ratio))
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, bounds.width, bounds.height)
    const rect = selectedRect()
    const desired = Number($('width').value)
    const scale = Math.min(desired / rect.width, Math.max(1, bounds.width - 60) / rect.width, Math.max(1, bounds.height - 90) / rect.height)
    const targetWidth = rect.width * scale
    const targetHeight = rect.height * scale
    context.imageSmoothingEnabled = !$('pixel').checked
    context.imageSmoothingQuality = 'high'
    context.globalAlpha = Number($('opacity').value) / 100
    context.drawImage(rect.image, rect.x, rect.y, rect.width, rect.height, (bounds.width - targetWidth) / 2, (bounds.height - targetHeight) / 2 + 8, targetWidth, targetHeight)
    context.globalAlpha = 1
    $('size-info').textContent = `单帧 ${rect.width} × ${rect.height} px · 显示 ${Math.round(targetWidth)} × ${Math.round(targetHeight)} px`
    $('frame').value = frame
    $('frame-label').textContent = `${frame + 1} / ${frameCount()}`
    $('cell-info').textContent = action === 'static' ? '完整图片' : `图集第 ${rect.row + 1} 行 · 第 ${rect.column + 1} 列`
    if (action === 'look') $('look').value = frame
    if ($('sheet-section').open) drawSheet(rect)
  }

  function drawSheet(rect) {
    const sheet = $('sheet')
    const scale = Math.min(1, Math.max(1, sheet.parentElement.clientWidth - 2) / rect.image.width, 440 / rect.image.height)
    sheet.width = Math.max(1, Math.round(rect.image.width * scale))
    sheet.height = Math.max(1, Math.round(rect.image.height * scale))
    const ctx = sheet.getContext('2d')
    ctx.imageSmoothingEnabled = !$('pixel').checked
    ctx.drawImage(rect.image, 0, 0, sheet.width, sheet.height)
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    ctx.lineWidth = 2
    ctx.strokeRect(rect.x * scale + 1, rect.y * scale + 1, Math.max(1, rect.width * scale - 2), Math.max(1, rect.height * scale - 2))
  }

  function tick(time) {
    raf = 0
    if (!playing || !animated()) return
    const interval = 1000 / fps()
    if (!lastTime || document.hidden) lastTime = time
    const steps = Math.floor((time - lastTime) / interval)
    if (steps > 0) {
      frame = (frame + steps) % frameCount()
      lastTime += steps * interval
      draw()
    }
    raf = requestAnimationFrame(tick)
  }

  function updatePlayback() {
    cancelAnimationFrame(raf)
    raf = 0
    lastTime = 0
    $('play').disabled = !animated()
    $('play').textContent = playing && animated() ? '暂停' : '播放'
    $('previous').disabled = frameCount() <= 1
    $('next').disabled = frameCount() <= 1
    $('frame').disabled = frameCount() <= 1
    $('frame').max = frameCount() - 1
    $('look-controls').hidden = action !== 'look'
    $('fps').disabled = $('package-fps').checked || !animated()
    $('package-fps').disabled = !animated()
    if ($('package-fps').checked) $('fps').value = fps()
    $('duration').textContent = animated() ? `${pack.frameCount} 帧 / 动作 · 每轮 ${(pack.frameCount / fps()).toFixed(2)} 秒` : action === 'look' ? '固定 3 × 3 视线图，可逐帧选择方向' : '当前动作显示静态帧'
    $('action-badge').textContent = actions.find(item => item[0] === action)[1]
    if (playing && animated()) raf = requestAnimationFrame(tick)
    draw()
  }

  function switchAction(value) {
    action = value
    frame = action === 'look' ? 4 : 0
    updatePlayback()
  }

  function updateActions(preferred) {
    const options = actions.filter(item => pack.images[item[2]])
    $('action').replaceChildren(...options.map(([value, text]) => new Option(text, value)))
    action = options.some(item => item[0] === preferred) ? preferred : options[0][0]
    $('action').value = action
    switchAction(action)
  }

  function validateImages(candidate) {
    for (const [slot, image] of Object.entries(candidate.images)) {
      if (image.width < 1 || image.height < 1 || image.width > 8192 || image.height > 8192) throw new Error('图片宽高必须在 1–8192 px 内')
      if (slot === 'static') continue
      const columns = slot === 'look' ? 3 : candidate.columns
      const rows = slot === 'look' ? 3 : Math.ceil(candidate.frameCount / candidate.columns) * (slot === 'drag' ? 1 : 2)
      if (image.width % columns !== 0 || image.height % rows !== 0) {
        const label = { main: '待机 / 工作', result: '失败 / 成功', drag: '拖拽', look: '视线' }[slot]
        throw new Error(`${label}图集 ${image.width} × ${image.height} px 无法等分为 ${columns} 列 × ${rows} 行，请检查列数和每动作帧数`)
      }
    }
  }

  async function decodeImages(candidate) {
    const images = {}
    await Promise.all(Object.entries(candidate.images).map(async ([slot, source]) => {
      const image = new Image()
      image.src = source
      try { await image.decode() } catch { throw new Error(`无法解码${slot === 'static' ? '静态图片' : '动画图片'}，请检查文件是否损坏`) }
      images[slot] = image
    }))
    return { ...candidate, images }
  }

  function install(candidate) {
    validateImages(candidate)
    pack = candidate
    $('name').textContent = pack.name
    $('source').textContent = pack.source
    $('width').value = pack.width
    $('width-label').textContent = `${pack.width} px`
    $('opacity').value = Math.round(pack.opacity * 100)
    $('opacity-label').textContent = `${Math.round(pack.opacity * 100)}%`
    $('columns').value = pack.columns
    $('count').value = pack.frameCount
    $('columns').disabled = !pack.raw
    $('count').disabled = !pack.raw
    $('raw-controls').hidden = !pack.raw
    $('raw-kind').value = 'static'
    $('parameters').open = pack.raw
    $('parameter-hint').textContent = pack.raw ? '图集参数只影响当前预览，不会改写原图片。' : '参数从资源包读取；旧包未填写帧数时沿用列数。'
    $('status').textContent = `${pack.raw ? '图片' : '资源包'}已载入 · ${Object.keys(pack.images).length} 组素材`
    $('package-fps').checked = true
    updateActions(pack.images.main ? 'idle' : 'static')
    error('')
  }

  async function loadResult(result, revision) {
    if (revision !== importRevision || !result) return
    if (!result.success) throw new Error(result.error)
    const candidate = await decodeImages(result.pack)
    if (revision === importRevision) install(candidate)
  }

  async function loadFile(file) {
    if (!file) return
    const revision = ++importRevision
    $('open').disabled = true
    $('status').textContent = '正在读取资源…'
    try {
      if (file.size > 16 * 1024 * 1024) throw new Error('文件不能超过 16 MiB')
      await loadResult(await window.preview.load(file.name, new Uint8Array(await file.arrayBuffer())), revision)
    } catch (reason) {
      if (revision === importRevision) { error(reason.message); $('status').textContent = '载入失败，已保留上一份预览' }
    } finally { if (revision === importRevision) $('open').disabled = false }
  }

  function applyRaw() {
    if (!pack?.raw) return
    const columns = Number($('columns').value)
    const count = Number($('count').value)
    const kind = $('raw-kind').value
    if (!Number.isInteger(columns) || columns < 2 || columns > 120 || !Number.isInteger(count) || count < columns || count > 120) {
      error('列数需为 2–120 的整数；每动作帧数不得小于列数，且最多为 120')
      return
    }
    const candidate = { ...pack, columns, frameCount: count, images: { static: pack.images.static } }
    if (kind !== 'static') candidate.images[kind] = pack.images.static
    try {
      validateImages(candidate)
      pack = candidate
      updateActions({ static: 'static', main: 'idle', result: 'failure', drag: 'drag', look: 'look' }[kind])
      error('')
    } catch (reason) { error(reason.message) }
  }

  // 内置示意素材按正式图集格式绘制，和用户导入的素材走同一播放路径。
  function demoSheet(kind, columns, count) {
    const rows = kind === 'look' ? 3 : Math.ceil(count / columns) * (kind === 'drag' ? 1 : 2)
    const image = document.createElement('canvas')
    image.width = (kind === 'look' ? 3 : columns) * 128
    image.height = rows * 128
    const ctx = image.getContext('2d')
    const actionRows = Math.ceil(count / columns)
    const ellipse = (x, y, rx, ry, fill, stroke = true) => {
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
      ctx.fillStyle = fill; ctx.fill(); if (stroke) ctx.stroke()
    }
    for (let group = 0; group < (kind === 'main' || kind === 'result' ? 2 : 1); group++) {
      for (let index = 0; index < (kind === 'look' ? 9 : count); index++) {
        const phase = index / count * Math.PI * 2
        ctx.save()
        ctx.translate(index % (kind === 'look' ? 3 : columns) * 128, (kind === 'look' ? Math.floor(index / 3) : group * actionRows + Math.floor(index / columns)) * 128)
        const working = kind === 'main' && group === 1
        const happy = kind === 'result' && group === 1
        const sad = kind === 'result' && group === 0
        const dragging = kind === 'drag'
        ctx.translate(0, Math.sin(phase) * (working ? 1.5 : 2.5))
        ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 2.5; ctx.strokeStyle = '#624c47'
        ctx.save(); ctx.translate(92, 90); ctx.rotate(Math.sin(phase) * .2)
        ctx.beginPath(); ctx.moveTo(0, 10); ctx.bezierCurveTo(26, 8, 21, -16, 16, -16); ctx.stroke(); ctx.restore()
        ellipse(64, dragging ? 90 : 88, 26, dragging ? 29 : 25, '#f8dfa6')
        ellipse(51, dragging ? 116 : 110, 11, 6, '#ffeac0')
        ellipse(77, dragging ? 116 : 110, 11, 6, '#ffeac0')
        ctx.beginPath(); ctx.moveTo(34, 43); ctx.lineTo(35, 16); ctx.lineTo(55, 32); ctx.lineTo(76, 32); ctx.lineTo(95, 16); ctx.lineTo(94, 44); ctx.fillStyle = '#f8dfa6'; ctx.fill(); ctx.stroke()
        ctx.fillStyle = '#eab2a4'; ctx.beginPath(); ctx.moveTo(39, 23); ctx.lineTo(41, 39); ctx.lineTo(50, 33); ctx.fill(); ctx.beginPath(); ctx.moveTo(90, 23); ctx.lineTo(88, 39); ctx.lineTo(79, 33); ctx.fill()
        ellipse(64, sad ? 57 : 54, 34, 28, '#ffeac0')
        ellipse(42, 63, 7, 3, '#efb7a4', false); ellipse(86, 63, 7, 3, '#efb7a4', false)
        const dx = kind === 'look' ? (index % 3 - 1) * 3.5 : 0
        const dy = kind === 'look' ? (Math.floor(index / 3) - 1) * 3 : 0
        const blink = kind !== 'look' && index >= count - 2
        if (happy || blink) {
          for (const x of [51, 77]) { ctx.beginPath(); ctx.moveTo(x - 5, 54); ctx.quadraticCurveTo(x, 48, x + 5, 54); ctx.stroke() }
        } else {
          ellipse(51 + dx, 53 + dy, 2.8, sad ? 3 : 4.5, '#624c47', false)
          ellipse(77 + dx, 53 + dy, 2.8, sad ? 3 : 4.5, '#624c47', false)
        }
        ctx.fillStyle = '#b97668'; ctx.beginPath(); ctx.moveTo(61, 62); ctx.lineTo(67, 62); ctx.lineTo(64, 65); ctx.closePath(); ctx.fill()
        ctx.beginPath(); ctx.moveTo(58, 68); ctx.quadraticCurveTo(64, sad ? 63 : 74, 70, 68); ctx.stroke()
        if (working) {
          ctx.fillStyle = '#c2cfed'; ctx.beginPath(); ctx.roundRect(36, 96, 56, 15, 4); ctx.fill(); ctx.stroke()
          ellipse(52, 95 + Math.sin(phase) * 3, 8, 5, '#ffeac0')
          ellipse(76, 95 - Math.sin(phase) * 3, 8, 5, '#ffeac0')
        } else {
          ellipse(dragging ? 38 : 43, dragging ? 78 : 88, 7, 10, '#ffeac0')
          ellipse(dragging ? 90 : 85, dragging ? 78 : 88, 7, 10, '#ffeac0')
        }
        if (happy) { ctx.strokeStyle = '#d5a03f'; for (const x of [17, 111]) { const y = 45 + Math.sin(phase + x) * 7; ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y); ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4); ctx.stroke() } }
        if (sad) { ctx.fillStyle = '#8ebce4'; ctx.beginPath(); ctx.ellipse(87, 63 + index / count * 6, 2, 4, -.3, 0, Math.PI * 2); ctx.fill() }
        ctx.restore()
      }
    }
    return image
  }

  function loadDemo() {
    importRevision++
    $('open').disabled = false
    const columns = 8, frameCount = 24
    const images = { main: demoSheet('main', columns, frameCount), result: demoSheet('result', columns, frameCount), drag: demoSheet('drag', columns, frameCount), look: demoSheet('look', 3, 9) }
    const still = document.createElement('canvas'); still.width = 128; still.height = 128
    still.getContext('2d').drawImage(images.main, 0, 0, 128, 128, 0, 0, 128, 128)
    images.static = still
    install({ name: '奶油猫 · 内置示例', source: '示意素材 · 8 列 / 每动作 24 帧', raw: false, demo: true, columns, frameCount, width: 192, opacity: 1, idleFps: 12, workingFps: 24, images })
  }

  $('open').addEventListener('click', () => $('file').click())
  $('file').addEventListener('change', event => { void loadFile(event.target.files[0]); event.target.value = '' })
  $('demo').addEventListener('click', loadDemo)
  $('action').addEventListener('change', event => switchAction(event.target.value))
  $('play').addEventListener('click', () => { playing = !playing; updatePlayback() })
  function step(offset) { playing = false; frame = (frame + offset + frameCount()) % frameCount(); updatePlayback() }
  $('previous').addEventListener('click', () => step(-1))
  $('next').addEventListener('click', () => step(1))
  $('frame').addEventListener('input', event => { playing = false; frame = Number(event.target.value); updatePlayback() })
  $('look').addEventListener('change', event => { frame = Number(event.target.value); draw() })
  $('package-fps').addEventListener('change', updatePlayback)
  $('fps').addEventListener('change', () => {
    if (!Number.isFinite(fps()) || fps() < 1 || fps() > 120) { $('fps').value = 12; error('自定义帧率范围为 1–120 FPS') }
    else error('')
    updatePlayback()
  })
  $('width').addEventListener('input', event => { $('width-label').textContent = `${event.target.value} px`; draw() })
  $('opacity').addEventListener('input', event => { $('opacity-label').textContent = `${event.target.value}%`; draw() })
  $('background').addEventListener('change', event => { $('stage').dataset.background = event.target.value })
  $('pixel').addEventListener('change', draw)
  $('theme').addEventListener('change', event => { if (event.target.value === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = event.target.value; draw() })
  $('sheet-section').addEventListener('toggle', draw)
  for (const id of ['columns', 'count', 'raw-kind']) $(id).addEventListener('change', applyRaw)
  new ResizeObserver(draw).observe($('stage'))
  document.addEventListener('visibilitychange', () => { lastTime = 0 })
  document.addEventListener('keydown', event => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return
    if (event.code === 'Space' && animated()) { event.preventDefault(); playing = !playing; updatePlayback() }
    if (event.code === 'ArrowLeft') { event.preventDefault(); step(-1) }
    if (event.code === 'ArrowRight') { event.preventDefault(); step(1) }
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyO') { event.preventDefault(); $('file').click() }
  })
  document.addEventListener('dragover', event => { event.preventDefault(); $('stage').classList.add('drag-over') })
  document.addEventListener('dragleave', event => { if (!event.relatedTarget) $('stage').classList.remove('drag-over') })
  document.addEventListener('drop', event => { event.preventDefault(); $('stage').classList.remove('drag-over'); void loadFile(event.dataTransfer.files[0]) })
  loadDemo()
})()
