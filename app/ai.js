(() => {
  'use strict'
  const $ = id => document.getElementById(id)
  const targets = { background: '主题背景', cover: '主题封面', icon: '菜单图标', mascot: '静态桌宠', cursor: '鼠标光标' }
  const templates = {
    background: '创作一张用于桌面管理软件的横向背景插画。画面宁静、低对比、层次柔和，细节适度。左侧约四分之一及中间区域留出干净、低细节的空间，方便覆盖导航和半透明卡片；视觉主体放在右侧或右下角。画面完整铺满，不画软件界面、按钮、边框和设备模型。无文字、无字母、无标志、无水印。',
    cover: '创作一张横向主题包展示封面。使用一个清晰的视觉主体和简洁的画面层次，构图完整，缩小后仍然有辨识度，延续同一主题的色彩与气质。只画艺术插画，不画软件截图、手机或电脑样机。无文字、无字母、无标志、无水印。',
    icon: '创作一个用于软件侧边栏的小图标，单个主体，居中，四周留出约15%的安全间距。轮廓简洁、粗线条、大色块、色彩统一，不堆砌小细节。缩小到24像素依然清晰可辨。透明背景，不要投影、底板、外框或场景；不要图标合集，不要文字、字母、标志或水印。',
    mascot: '创作一个单独的可爱桌宠角色，全身完整可见，正面或轻微四分之三视角，居中构图，四周留白，表情友好。造型简洁有辨识度、轮廓干净，适合缩小后显示在桌面角落。透明背景，不要地面、底板、场景或投影。只画一个角色的一张静态形象；不要动画图集、多视图、重复角色、文字、标志或水印。',
    cursor: '创作一个鼠标箭头光标素材：单个箭头，尖端朝向左上角，主体位于方形画布中央且完整可见，保留小幅透明边距。使用粗而清晰的外轮廓、大色块和极简细节，保证缩小到32至64像素后仍可识别。透明背景，无阴影、无底板、无场景，不要光标合集、文字、字母或水印。',
  }
  const defaults = { baseURL: 'https://api.openai.com/v1', model: 'gpt-image-2', target: 'background',
    style: '清新森林、鼠尾草绿与奶油白、柔和手绘、安静温暖', size: '1536x1024', quality: '', responseFormat: '', transparent: false,
    visionModel:'', visionSeparate:false, visionBaseURL:'https://api.openai.com/v1', iconBatch:false, iconKey:'default' }
  let hooks, generating = false, timer, started = 0
  let referenceImages = [], referenceOwner, loadingReferences = false
  let describing = false, promptCandidate = null, referenceVersion = 0
  let batchRun = null
  const iconSet = window.themeIconSet
  const batchMode = () => settings().target === 'icon' && settings().iconBatch === true
  function iconPrompt(config, key) {
    const icon = iconSet.find(item => item.key === key)
    return `${config.prompt}\n\n本次只绘制「${icon.label}」的单个图标。用途：${icon.purpose}。\n专属要求：${config.iconPrompts?.[key]?.trim() || icon.subject}。\n沿用共同的画风、配色、线条粗细和原参考图风格；保持简洁清晰，主体居中、完整可见，透明背景。不要图标合集、其他菜单的符号、文字、字母或水印。`
  }
  function generationMetadata(config, key) {
    return {target:config.target, model:config.model, style:config.style,
      prompt:config.target === 'icon' ? iconPrompt(config, key) : config.prompt,
      ...(config.target === 'icon' ? {iconKey:key, basePrompt:config.prompt, iconSubject:config.iconPrompts?.[key]?.trim() || iconSet.find(icon => icon.key === key).subject} : {})}
  }
  function clearSuggestion() { promptCandidate = null; $('ai-prompt-suggestion').hidden = true; $('ai-suggested-prompt').value = '' }
  function promptContext() {
    return { owner:hooks.getState(), target:settings().target, style:settings().style, color:hooks.getState().manifest.tokens.colorPrimary, references:referenceVersion }
  }
  function sameContext(context) {
    const current = promptContext()
    return Object.keys(context).every(key => context[key] === current[key])
  }
  function settings() {
    const state = hooks.getState()
    state.generator ||= { ...defaults }
    return state.generator
  }
  function presetPrompt() {
    const config = settings(), theme = hooks.getState().manifest
    return `${templates[config.target] || templates.background}\n\n统一风格：${config.style || defaults.style}。\n配色以 ${theme.tokens.colorPrimary} 为主色，与主题「${theme.name || '我的主题'}」保持一致。\n如有参考图，请参考其中的主体特征和视觉风格，按照本次用途重新构图。\n素材将用于 AUTO-MAS 的${targets[config.target]}；请直接输出可用图片。`
  }
  function renderReferences() {
    if (referenceOwner !== hooks.getState()) {
      if (batchRun) { batchRun.cancelled = true; window.studio.cancelGeneration().catch(() => {}) }
      referenceOwner = hooks.getState(); referenceImages = []; referenceVersion++; clearSuggestion()
    }
    const busy = generating || describing || loadingReferences
    const list = $('ai-reference-list')
    list.replaceChildren()
    $('ai-reference-count').textContent = `${referenceImages.length} / 4`
    referenceImages.forEach((reference, index) => {
      const item = document.createElement('div'); item.className = 'ai-reference-item'
      const image = document.createElement('img'); image.src = reference.url; image.alt = `参考图 ${index + 1}`
      const detail = document.createElement('div')
      const name = document.createElement('strong'); name.textContent = `${index + 1}. ${reference.name}`; name.title = reference.name
      const size = document.createElement('small'); size.textContent = `${reference.width} × ${reference.height} · ${Math.ceil(reference.bytes / 1024)} KB`
      detail.append(name, size)
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '移除'
      remove.setAttribute('aria-label', `移除参考图 ${index + 1}`); remove.disabled = busy
      remove.onclick = () => { referenceImages.splice(index, 1); referenceVersion++; clearSuggestion(); renderReferences() }
      item.append(image, detail, remove); list.append(item)
    })
    $('ai-reference-add').disabled = busy || referenceImages.length >= 4
    $('ai-reference-add').textContent = loadingReferences ? '正在读取参考图…' : '＋ 添加参考图'
    $('ai-generate').disabled = busy
    $('ai-describe').disabled = busy || !referenceImages.length
    $('ai-describe').textContent = describing ? '正在生成提示词…' : '根据参考图生成提示词'
    if (!generating) $('ai-generate').textContent = batchMode() ? `✦ 批量生成 ${iconSet.length} 个图标` : referenceImages.length ? '✦ 参考图生成' : '✦ 生成图片'
  }
  async function addReferences(files) {
    if (!files.length || generating || describing || loadingReferences) return
    renderReferences()
    const owner = hooks.getState()
    loadingReferences = true; renderReferences()
    try {
      if (referenceImages.length + files.length > 4) throw new Error('参考图最多 4 张，请先移除已有参考图')
      const total = referenceImages.reduce((sum, item) => sum + item.bytes, 0) + files.reduce((sum, file) => sum + file.size, 0)
      if (total > 16 * 1024 * 1024) throw new Error('参考图总大小不能超过 16 MB')
      const added = []
      for (const file of files) {
        if (file.size > 8 * 1024 * 1024) throw new Error('单张参考图不能超过 8 MB')
        const match = /\.(png|jpe?g|webp)$/i.exec(file.name)
        if (!match) throw new Error('参考图只支持 PNG、JPEG 或 WebP')
        const mime = match[1].toLowerCase() === 'png' ? 'image/png' : match[1].toLowerCase() === 'webp' ? 'image/webp' : 'image/jpeg'
        const bytes = await file.arrayBuffer()
        const url = await new Promise((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('参考图读取失败'))
          reader.readAsDataURL(new Blob([bytes], { type: mime }))
        })
        added.push({ name: file.name, url, ...await window.themeImages.inspect(url, file.name) })
      }
      if (owner === hooks.getState()) { referenceImages.push(...added); referenceVersion++; clearSuggestion() }
    } catch (error) { hooks.toast(error.message, true) }
    finally { loadingReferences = false; $('ai-reference-file').value = ''; renderReferences() }
  }
  function renderResult() {
    const result = hooks.getState().aiResult
    const batch = result?.kind === 'icon-batch'
    $('ai-empty').hidden = !!result; $('ai-result').hidden = !result || batch
    $('ai-icon-results').hidden = !batch
    $('ai-archive').hidden = !result?.libraryError || batch
    $('ai-archive').disabled = generating || describing
    if (batch) { renderBatch(result); return }
    if (!result) return
    $('ai-result-image').src = result.url
    $('ai-result-title').textContent = `已生成 · ${targets[result.target] || '素材'}`
    $('ai-result-info').textContent = `${result.width} × ${result.height} · ${Math.round(result.bytes / 1024)} KB`
    $('ai-apply').textContent = `应用为${targets[result.target] || '主题背景'} ↗`
    $('ai-icon-key-field').hidden = result.target !== 'icon'
    if (result.iconKey) $('ai-icon-key').value = result.iconKey
    $('ai-cursor-key-field').hidden = result.target !== 'cursor'
    $('ai-result-note').textContent = result.target === 'cursor' ? '应用时保持比例缩小至 64 × 64 像素以内，热点从左上角开始，可在图片素材中调整。' : result.target === 'icon' ? '应用时保持比例缩小至 128 × 128 像素以内。透明效果取决于模型实际返回的图片。' : result.target === 'mascot' ? '应用为静态桌宠，原有桌宠动画会被替换。透明效果取决于模型实际返回的图片。' : '这张图片还未自动应用到主题；你可以先保存图片，也可以确认后应用。'
    $('ai-result-note').textContent += result.libraryError ? ` 素材库保存失败：${result.libraryError}。请重试保存或另存图片。` : result.libraryId ? ' 原图已保存到本地素材库。' : ''
  }
  function render() {
    if (!hooks) return
    const config = settings()
    for (const [id, key] of [['ai-base-url', 'baseURL'], ['ai-model', 'model'], ['ai-target', 'target'], ['ai-style', 'style'],
      ['ai-size', 'size'], ['ai-quality', 'quality'], ['ai-response-format', 'responseFormat'], ['ai-vision-model','visionModel'], ['ai-vision-url','visionBaseURL']]) $(id).value = config[key] ?? defaults[key]
    if (!config.prompt) config.prompt = presetPrompt()
    $('ai-prompt').value = config.prompt
    $('ai-transparent').checked = config.transparent === true
    $('ai-vision-separate').checked = config.visionSeparate === true
    $('ai-vision-custom').hidden = config.visionSeparate !== true
    $('ai-icon-settings').hidden = config.target !== 'icon'
    $('ai-icon-batch').checked = config.iconBatch === true
    $('ai-icon-single-field').hidden = batchMode()
    $('ai-icon-batch-hint').hidden = !batchMode()
    $('ai-icon-target').value = config.iconKey || 'default'
    for (const icon of iconSet) $(`ai-icon-prompt-${icon.key}`).value = config.iconPrompts?.[icon.key] ?? icon.subject
    if (promptCandidate && !sameContext(promptCandidate)) clearSuggestion()
    renderReferences()
    renderResult()
  }
  function selectTab(tab) {
    const selected = tab === 'ai'
    document.querySelector('.workspace').classList.toggle('ai-view', selected)
    $('ai-result-panel').hidden = !selected
    const heading = document.querySelector('.workspace-top h2')
    heading.textContent = selected ? '灵感，在这里变成画面' : '你的主题，正在成形'
    document.querySelector('.workspace-top .eyebrow').textContent = selected ? 'AI IMAGE STUDIO' : 'LIVE PREVIEW'
    document.querySelector('.preview-label').textContent = selected ? '先预览，再应用' : '视觉示意'
    if (selected) { render(); $('ai-status').textContent ||= '准备就绪，填写 API Key 后即可生成。' }
  }
  async function generate() {
    if (generating || describing || loadingReferences) return
    if (batchMode()) { await generateBatch(); return }
    const apiKey = $('ai-key').value.trim()
    if (!apiKey) { $('ai-key').focus(); hooks.toast('请在工具里填写 API Key', true); return }
    const config = structuredClone(settings()), owner = hooks.getState()
    renderReferences()
    const references = referenceImages.map(({ url }) => ({ url }))
    if (!config.prompt?.trim()) { hooks.toast('请填写提示词，或点击「套用内置提示词」', true); return }
    generating = true; started = Date.now()
    renderReferences()
    $('ai-generate').disabled = true; $('ai-generate').textContent = '正在生成…'; $('ai-cancel').hidden = false
    $('ai-result-panel').classList.add('generating')
    $('ai-status').className = 'validation'
    const update = () => { $('ai-status').textContent = `正在等待 ${config.model}${references.length ? ` · ${references.length} 张参考图` : ''} · ${Math.floor((Date.now() - started) / 1000)} 秒；生成期间可以继续编辑。` }
    update(); timer = setInterval(update, 1000)
    try {
      const response = await window.studio.generate({ ...config, apiKey, prompt:config.target === 'icon' ? iconPrompt(config, config.iconKey || 'default') : config.prompt, referenceImages: references })
      if (!response.success) throw new Error(response.error)
      const info = await window.themeImages.inspect(response.image.url, '生成的图片')
      const image = {...response.image, ...info, ...generationMetadata(config, config.iconKey || 'default')}
      const saved = await window.themeLibrary.save(image)
      if (owner !== hooks.getState()) { hooks.toast(saved ? '图片已存入本地素材库，可在当前主题选用' : `素材库保存失败：${image.libraryError}`, !saved); return }
      owner.aiResult = image
      hooks.changed(); renderResult()
      $('ai-status').className = saved ? 'validation success' : 'validation error'
      $('ai-status').textContent = saved ? '生成完成，原图已存入本地素材库。请预览后应用到主题。' : `生成完成，但素材库保存失败：${image.libraryError}。请重试保存或另存图片。`
      hooks.toast('图片已生成，可以预览后应用')
    } catch (error) {
      $('ai-status').className = 'validation error'; $('ai-status').textContent = error.message
    } finally {
      clearInterval(timer); generating = false; $('ai-generate').disabled = false
      $('ai-generate').textContent = '✦ 生成图片'; $('ai-cancel').hidden = true
      $('ai-result-panel').classList.remove('generating')
      renderReferences(); renderResult()
      if (owner !== hooks.getState()) $('ai-status').textContent = '已切换主题，可从本地素材库选用已保存的图片。'
    }
  }
  function batchButtons(result) {
    const ready = result.items.filter(item => item.url && item.selected !== false).length
    const remaining = result.items.filter(item => item.status !== 'ready').length
    $('ai-apply-icons').textContent = `应用已选图标（${ready}）`
    $('ai-apply-icons').disabled = generating || describing || !ready
    $('ai-continue-icons').hidden = !remaining
    $('ai-continue-icons').textContent = `继续生成未完成项（${remaining}）`
    $('ai-continue-icons').disabled = generating || describing || loadingReferences || !batchMode() || result.items.some(item => item.archiveSource)
    $('ai-archive-icons').hidden = !result.items.some(item => item.archiveSource)
    $('ai-archive-icons').disabled = generating || describing
  }
  function renderBatch(result) {
    const ready = result.items.filter(item => item.url).length
    $('ai-icon-summary').textContent = `已生成 ${ready} / ${result.items.length} 个图标 · 每个图标有独立的用途提示词，共用画风与参考图`
    const grid = $('ai-icon-grid'); grid.replaceChildren()
    for (const item of result.items) {
      const card = document.createElement('article'); card.className = 'ai-icon-card'; card.dataset.icon = item.key
      const preview = document.createElement('div'); preview.className = 'ai-icon-thumb'
      if (item.url) { const image = document.createElement('img'); image.src = item.url; image.alt = item.label; preview.append(image) }
      else preview.textContent = item.status === 'generating' ? '生成中…' : item.status === 'error' ? '未完成' : '待生成'
      const label = document.createElement('label'); label.className = 'checkbox-field'
      const checked = document.createElement('input'); checked.type = 'checkbox'; checked.checked = item.selected !== false; checked.disabled = !item.url || generating || describing
      checked.setAttribute('aria-label', `使用${item.label}图标`)
      checked.onchange = () => { item.selected = checked.checked; hooks.changed(); batchButtons(result) }
      label.append(checked, document.createTextNode(item.label))
      const status = document.createElement('p'); status.className = 'hint'; status.textContent = item.error || (item.archiveSource ? `原图保存失败：${item.archiveSource.libraryError}，请重试保存` : item.url ? `${item.width} × ${item.height} · 已生成${item.libraryId ? ' · 原图已存入素材库' : ''}` : '尚未生成')
      const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'text-button'; retry.textContent = '单独重新生成'; retry.setAttribute('aria-label', `重新生成${item.label}图标`)
      retry.disabled = generating || describing || loadingReferences || !batchMode(); retry.onclick = () => generateBatch([item.key])
      card.append(preview, label, status, retry); grid.append(card)
    }
    batchButtons(result)
  }
  async function generateBatch(keys) {
    if (generating || describing || loadingReferences) return
    const apiKey = $('ai-key').value.trim()
    if (!apiKey) { $('ai-key').focus(); hooks.toast('请在工具里填写 API Key', true); return }
    renderReferences()
    const config = structuredClone(settings()), owner = hooks.getState(), references = referenceImages.map(({url}) => ({url}))
    if (!config.prompt?.trim()) { hooks.toast('请填写共同的风格提示词', true); return }
    let result = owner.aiResult
    if (result?.items?.some(item => item.archiveSource)) { hooks.toast('请先重试保存未归档的原图', true); return }
    if (keys) {
      if (result?.kind !== 'icon-batch') return
      if (result.referenceCount && !references.length) { hooks.toast('请重新添加参考图后再继续生成', true); return }
    } else {
      result = { kind:'icon-batch', target:'icon', referenceCount:references.length, items:iconSet.map(icon => ({key:icon.key,label:icon.label,status:'pending',selected:true})) }
      owner.aiResult = result
    }
    const jobs = result.items.filter(item => !keys || keys.includes(item.key))
    if (!jobs.length) return
    const run = { cancelled:false, position:0, label:'' }; batchRun = run
    generating = true; started = Date.now(); renderReferences(); renderResult(); hooks.changed()
    $('ai-generate').textContent = '正在批量生成…'; $('ai-cancel').hidden = false; $('ai-status').className = 'validation'
    const update = () => { $('ai-status').textContent = `正在生成 ${run.position} / ${jobs.length} · ${run.label} · ${Math.floor((Date.now() - started) / 1000)} 秒；已完成的图标会保留。` }
    timer = setInterval(update, 1000)
    try {
      for (const [index, item] of jobs.entries()) {
        if (run.cancelled || owner !== hooks.getState()) break
        run.position = index + 1; run.label = item.label; item.status = 'generating'; delete item.error; renderResult(); update()
        try {
          const response = await window.studio.generate({...config, target:'icon', apiKey, prompt:iconPrompt(config, item.key), referenceImages:references})
          if (!response.success) throw new Error(response.error)
          const original = {...response.image, ...await window.themeImages.inspect(response.image.url, '生成的图标'), ...generationMetadata(config, item.key)}
          const saved = await window.themeLibrary.save(original)
          if (owner !== hooks.getState()) break
          const url = await window.themeImages.fit(response.image.url, 128), info = await window.themeImages.inspect(url, '生成的图标')
          if (owner !== hooks.getState()) break
          Object.assign(item, info, {url,status:'ready', libraryId:original.libraryId})
          if (!saved) item.archiveSource = original
          hooks.changed(); renderResult()
          if (!saved) break
        } catch (error) {
          item.status = item.url ? 'ready' : 'error'
          if (!run.cancelled) item.error = error.message
          break
        }
      }
    } finally {
      clearInterval(timer); generating = false; batchRun = null; $('ai-cancel').hidden = true
      if (owner === hooks.getState()) {
        for (const item of result.items) if (item.status === 'generating') item.status = item.url ? 'ready' : 'pending'
        const ready = result.items.filter(item => item.url).length, remaining = result.items.filter(item => item.status !== 'ready').length
        $('ai-status').className = remaining ? 'validation' : 'validation success'
        $('ai-status').textContent = result.items.some(item => item.archiveSource) ? '素材库保存失败，批量生成已暂停。请先重试保存原图。' : `${run.cancelled ? '已取消批量生成' : remaining ? '批量生成已暂停' : '整套图标已生成'} · 已保留 ${ready} / ${result.items.length} 个图标${remaining ? '，可继续生成未完成项。' : '，原图均已存入本地素材库，请预览后应用。'}`
        hooks.changed()
      } else $('ai-status').textContent = '已切换主题，旧主题的批量生成已停止。已完成原图保留在本地素材库。'
      renderReferences(); renderResult()
    }
  }
  async function describe() {
    if (generating || describing || loadingReferences) return
    renderReferences()
    if (!referenceImages.length) { hooks.toast('请先添加至少 1 张参考图', true); return }
    const config = structuredClone(settings()), context = promptContext()
    if (!config.visionModel?.trim()) { document.querySelector('.ai-vision-settings').open = true; $('ai-vision-model').focus(); hooks.toast('请填写支持图片输入的看图模型名', true); return }
    const keyInput = $(config.visionSeparate ? 'ai-vision-key' : 'ai-key'), apiKey = keyInput.value.trim()
    if (!apiKey) { document.querySelector(config.visionSeparate ? '.ai-vision-settings' : '#ai-settings').open = true; keyInput.focus(); hooks.toast('请填写看图服务使用的 API Key', true); return }
    const input = { baseURL:config.visionSeparate ? config.visionBaseURL || defaults.visionBaseURL : config.baseURL,
      apiKey, model:config.visionModel,
      instructions:`用途：${targets[config.target]}。\n${templates[config.target] || templates.background}\n从参考图的实际主体、配色和画风提取描述。当前风格偏好「${config.style || '未指定'}」仅作辅助，冲突时优先使用参考图的可见特征。主题主色 ${context.color} 仅供搭配参考。`,
      referenceImages:referenceImages.map(({url}) => ({url})) }
    describing = true; renderReferences(); renderResult(); $('ai-describe-cancel').hidden = false
    $('ai-describe-status').className = 'validation'
    const began = Date.now(), update = () => { $('ai-describe-status').textContent = `正在分析 ${input.referenceImages.length} 张参考图 · ${Math.floor((Date.now() - began) / 1000)} 秒` }
    update(); const progressTimer = setInterval(update, 1000)
    try {
      const response = await window.studio.describe(input)
      if (!response.success) throw new Error(response.error)
      if (!sameContext(context)) throw new Error('主题、参考图、用途或风格已改变，请重新生成提示词')
      promptCandidate = context
      $('ai-suggested-prompt').value = response.prompt; $('ai-prompt-suggestion').hidden = false
      $('ai-describe-status').className = 'validation success'
      $('ai-describe-status').textContent = '候选提示词已生成，可编辑后点击「使用此提示词」。'
      hooks.toast('候选提示词已生成，可编辑后使用')
      $('ai-prompt-suggestion').scrollIntoView({ block:'nearest' })
    } catch (error) { $('ai-describe-status').className = 'validation error'; $('ai-describe-status').textContent = error.message }
    finally { clearInterval(progressTimer); describing = false; $('ai-describe-cancel').hidden = true; renderReferences(); renderResult() }
  }
  async function apply() {
    const result = hooks.getState().aiResult
    if (!result) return
    try {
      let url = result.url
      if (['icon', 'cursor'].includes(result.target)) url = await window.themeImages.fit(url, result.target === 'cursor' ? 64 : 128)
      if (result.target === 'icon') $('icon-key').value = $('ai-icon-key').value
      if (result.target === 'cursor') $('cursor-key').value = $('ai-cursor-key').value
      const [header, encoded] = url.split(',')
      const mime = header.slice(5, header.indexOf(';'))
      const blob = new Blob([Uint8Array.from(atob(encoded), character => character.charCodeAt(0))], { type: mime })
      const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'
      await hooks.importImage(new File([blob], `ai-${result.target}.${extension}`, { type: blob.type }), result.target)
      hooks.selectTab(result.target === 'background' ? 'design' : 'assets')
    } catch (error) { hooks.toast(`无法应用：${error.message}`, true) }
  }
  function init(options) {
    hooks = options
    window.themeLibrary.init({...hooks, busy:() => generating || describing || loadingReferences,
      useImage:image => { hooks.getState().aiResult = image; hooks.changed(); renderResult(); hooks.toast('已选用原图，请预览后应用到主题') },
      usePrompt:entry => {
        const config = settings(); config.target = entry.target; config.prompt = entry.basePrompt || entry.prompt
        config.style = entry.style || config.style; config.size = ['background','cover'].includes(entry.target) ? '1536x1024' : '1024x1024'
        if (entry.target === 'icon' && iconSet.some(icon => icon.key === entry.iconKey)) {
          config.iconKey = entry.iconKey; config.iconBatch = false
          if (entry.iconSubject) { config.iconPrompts ||= {}; config.iconPrompts[entry.iconKey] = entry.iconSubject }
        }
        clearSuggestion(); render(); hooks.changed(); hooks.toast('已复用提示词；再次生成时仍使用当前选择的参考图')
      }})
    $('ai-archive').onclick = async () => { await window.themeLibrary.save(hooks.getState().aiResult); hooks.changed(); renderResult() }
    $('ai-archive-icons').onclick = async () => {
      const result = hooks.getState().aiResult
      for (const item of result?.items || []) if (item.archiveSource && await window.themeLibrary.save(item.archiveSource)) { item.libraryId = item.archiveSource.libraryId; delete item.archiveSource }
      hooks.changed(); renderResult()
    }
    $('ai-reference-add').onclick = () => $('ai-reference-file').click()
    $('ai-reference-file').onchange = () => addReferences(Array.from($('ai-reference-file').files))
    for (const id of ['ai-icon-key']) for (const option of $('icon-key').options) $(id).append(option.cloneNode(true))
    for (const icon of iconSet) {
      const option = document.createElement('option'); option.value = icon.key; option.textContent = icon.label; $('ai-icon-target').append(option)
      const label = document.createElement('label'); label.className = 'field'; label.append(document.createTextNode(icon.label))
      const purpose = document.createElement('small'); purpose.textContent = `用途：${icon.purpose}`
      const input = document.createElement('textarea'); input.id = `ai-icon-prompt-${icon.key}`; input.rows = 2; input.maxLength = 1200; input.value = icon.subject
      input.oninput = () => { settings().iconPrompts ||= {}; settings().iconPrompts[icon.key] = input.value; hooks.changed() }
      label.append(purpose, input); $('ai-icon-prompt-list').append(label)
    }
    $('ai-icon-target').onchange = () => { settings().iconKey = $('ai-icon-target').value; hooks.changed() }
    $('ai-icon-batch').onchange = () => { settings().iconBatch = $('ai-icon-batch').checked; render(); hooks.changed() }
    $('ai-continue-icons').onclick = () => generateBatch(hooks.getState().aiResult.items.filter(item => item.status !== 'ready').map(item => item.key))
    $('ai-apply-icons').onclick = async () => {
      const result = hooks.getState().aiResult
      if (result?.kind !== 'icon-batch' || generating || describing) return
      const selected = result.items.filter(item => item.url && item.selected !== false).map(({key,url}) => ({key,url}))
      $('ai-apply-icons').disabled = true
      try { await hooks.importIcons(selected); hooks.selectTab('assets') } catch (error) { hooks.toast(`无法应用：${error.message}`, true) }
      finally { renderResult() }
    }
    for (const [id, key] of [['ai-base-url', 'baseURL'], ['ai-model', 'model'], ['ai-style', 'style'], ['ai-prompt', 'prompt'], ['ai-size', 'size'], ['ai-vision-model','visionModel'], ['ai-vision-url','visionBaseURL']]) $(id).oninput = () => { settings()[key] = $(id).value; if (key === 'style') clearSuggestion(); hooks.changed() }
    $('ai-vision-separate').onchange = () => { settings().visionSeparate = $('ai-vision-separate').checked; $('ai-vision-custom').hidden = !settings().visionSeparate; hooks.changed() }
    $('ai-describe').onclick = describe
    $('ai-describe-cancel').onclick = async () => { $('ai-describe-cancel').disabled = true; await window.studio.cancelDescription(); $('ai-describe-cancel').disabled = false }
    $('ai-discard-prompt').onclick = clearSuggestion
    $('ai-use-prompt').onclick = () => {
      if (!promptCandidate || !sameContext(promptCandidate)) { clearSuggestion(); hooks.toast('参考图或生成要求已改变，请重新生成提示词', true); return }
      const prompt = $('ai-suggested-prompt').value.trim()
      if (!prompt || prompt.length > 16000) { hooks.toast('提示词需要在 1–16000 字以内', true); return }
      settings().prompt = prompt; $('ai-prompt').value = prompt; clearSuggestion(); hooks.changed()
      $('ai-prompt').focus(); hooks.toast('已使用生成的提示词，可继续编辑或生成图片')
    }
    for (const [id, key] of [['ai-quality', 'quality'], ['ai-response-format', 'responseFormat']]) $(id).onchange = () => { settings()[key] = $(id).value; hooks.changed() }
    $('ai-target').onchange = () => {
      const config = settings(); config.target = $('ai-target').value
      config.size = ['background', 'cover'].includes(config.target) ? '1536x1024' : '1024x1024'
      config.prompt = presetPrompt(); render(); hooks.changed()
    }
    $('ai-reset-prompt').onclick = () => { settings().prompt = presetPrompt(); render(); hooks.changed() }
    $('ai-transparent').onchange = () => { settings().transparent = $('ai-transparent').checked; hooks.changed() }
    $('ai-key-toggle').onclick = () => {
      $('ai-key').type = $('ai-key').type === 'password' ? 'text' : 'password'
      $('ai-key-toggle').textContent = $('ai-key').type === 'password' ? '显示' : '隐藏'
    }
    $('ai-generate').onclick = generate
    $('ai-cancel').onclick = async () => { if (batchRun) batchRun.cancelled = true; $('ai-cancel').disabled = true; await window.studio.cancelGeneration(); $('ai-cancel').disabled = false }
    $('ai-apply').onclick = apply
    $('ai-save-image').onclick = async () => {
      const image = hooks.getState().aiResult
      if (!image) return
      const result = await window.studio.saveImage({ url: image.url })
      if (!result.success) hooks.toast(result.error, true)
      else if (!result.canceled) hooks.toast(`图片已保存：${result.filePath}`)
    }
  }
  async function restoreLibrary() {
    const owner = hooks.getState(), result = owner.aiResult
    for (const image of result?.kind === 'icon-batch' ? result.items : result ? [result] : []) {
      if (!image.url || image.libraryId) continue
      const source = image.archiveSource || image
      const candidate = {...source, target:source.target || 'icon', iconKey:source.iconKey || image.key}
      const saved = await window.themeLibrary.save(candidate)
      // 旧草稿缺少生成说明时，只归档已保存的图片，不猜测当时使用的提示词。
      if (saved) { image.libraryId = candidate.libraryId; delete image.libraryError; delete image.archiveSource }
      else image.libraryError = candidate.libraryError
    }
    if (owner === hooks.getState() && result) { hooks.changed(); renderResult() }
  }
  window.themeAI = { init, render, selectTab, restoreLibrary }
})()
