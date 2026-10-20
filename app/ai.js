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
    style: '清新森林、鼠尾草绿与奶油白、柔和手绘、安静温暖', size: '1536x1024', quality: '', responseFormat: '', transparent: false }
  let hooks, generating = false, timer, started = 0
  function settings() {
    const state = hooks.getState()
    state.generator ||= { ...defaults }
    return state.generator
  }
  function presetPrompt() {
    const config = settings(), theme = hooks.getState().manifest
    return `${templates[config.target] || templates.background}\n\n统一风格：${config.style || defaults.style}。\n配色以 ${theme.tokens.colorPrimary} 为主色，与主题「${theme.name || '我的主题'}」保持一致。\n素材将用于 AUTO-MAS 的${targets[config.target]}；请直接输出可用图片。`
  }
  function renderResult() {
    const result = hooks.getState().aiResult
    $('ai-empty').hidden = !!result; $('ai-result').hidden = !result
    if (!result) return
    $('ai-result-image').src = result.url
    $('ai-result-title').textContent = `已生成 · ${targets[result.target] || '素材'}`
    $('ai-result-info').textContent = `${result.width} × ${result.height} · ${Math.round(result.bytes / 1024)} KB`
    $('ai-apply').textContent = `应用为${targets[result.target] || '主题背景'} ↗`
    $('ai-icon-key-field').hidden = result.target !== 'icon'
    $('ai-cursor-key-field').hidden = result.target !== 'cursor'
    $('ai-result-note').textContent = result.target === 'cursor' ? '应用时保持比例缩小至 64 × 64 像素以内，热点从左上角开始，可在图片素材中调整。' : result.target === 'icon' ? '应用时保持比例缩小至 128 × 128 像素以内。透明效果取决于模型实际返回的图片。' : result.target === 'mascot' ? '应用为静态桌宠，原有桌宠动画会被替换。透明效果取决于模型实际返回的图片。' : '这张图片还未自动应用到主题；你可以先保存图片，也可以确认后应用。'
  }
  function render() {
    if (!hooks) return
    const config = settings()
    for (const [id, key] of [['ai-base-url', 'baseURL'], ['ai-model', 'model'], ['ai-target', 'target'], ['ai-style', 'style'],
      ['ai-size', 'size'], ['ai-quality', 'quality'], ['ai-response-format', 'responseFormat']]) $(id).value = config[key] ?? defaults[key]
    if (!config.prompt) config.prompt = presetPrompt()
    $('ai-prompt').value = config.prompt
    $('ai-transparent').checked = config.transparent === true
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
    if (generating) return
    const apiKey = $('ai-key').value.trim()
    if (!apiKey) { $('ai-key').focus(); hooks.toast('请在工具里填写 API Key', true); return }
    const config = structuredClone(settings())
    if (!config.prompt?.trim()) { hooks.toast('请填写提示词，或点击「套用内置提示词」', true); return }
    generating = true; started = Date.now()
    $('ai-generate').disabled = true; $('ai-generate').textContent = '正在生成…'; $('ai-cancel').hidden = false
    $('ai-result-panel').classList.add('generating')
    $('ai-status').className = 'validation'
    const update = () => { $('ai-status').textContent = `正在等待 ${config.model} · ${Math.floor((Date.now() - started) / 1000)} 秒；生成期间可以继续编辑。` }
    update(); timer = setInterval(update, 1000)
    try {
      const response = await window.studio.generate({ ...config, apiKey })
      if (!response.success) throw new Error(response.error)
      const info = await window.themeImages.inspect(response.image.url, '生成的图片')
      hooks.getState().aiResult = { ...response.image, ...info, target: config.target }
      hooks.changed(); renderResult()
      $('ai-status').className = 'validation success'
      $('ai-status').textContent = '生成完成。请在右侧预览，确认后应用到主题。'
      hooks.toast('图片已生成，可以预览后应用')
    } catch (error) {
      $('ai-status').className = 'validation error'; $('ai-status').textContent = error.message
    } finally {
      clearInterval(timer); generating = false; $('ai-generate').disabled = false
      $('ai-generate').textContent = '✦ 生成图片'; $('ai-cancel').hidden = true
      $('ai-result-panel').classList.remove('generating')
    }
  }
  async function apply() {
    const result = hooks.getState().aiResult
    if (!result) return
    try {
      let url = result.url
      if (['icon', 'cursor'].includes(result.target)) {
        const image = new Image(); image.src = url; await image.decode()
        const max = result.target === 'cursor' ? 64 : 128
        const ratio = Math.min(1, max / image.naturalWidth, max / image.naturalHeight)
        const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio)); canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio))
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
        url = canvas.toDataURL('image/png')
      }
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
    for (const id of ['ai-icon-key']) for (const option of $('icon-key').options) $(id).append(option.cloneNode(true))
    for (const [id, key] of [['ai-base-url', 'baseURL'], ['ai-model', 'model'], ['ai-style', 'style'], ['ai-prompt', 'prompt'], ['ai-size', 'size']]) $(id).oninput = () => { settings()[key] = $(id).value; hooks.changed() }
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
    $('ai-cancel').onclick = async () => { $('ai-cancel').disabled = true; await window.studio.cancelGeneration(); $('ai-cancel').disabled = false }
    $('ai-apply').onclick = apply
    $('ai-save-image').onclick = async () => {
      const image = hooks.getState().aiResult
      if (!image) return
      const result = await window.studio.saveImage({ url: image.url })
      if (!result.success) hooks.toast(result.error, true)
      else if (!result.canceled) hooks.toast(`图片已保存：${result.filePath}`)
    }
  }
  window.themeAI = { init, render, selectTab }
})()
