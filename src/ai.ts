import { uiTask } from './async-ui'
import { errorMessage } from './errors'
import {
  targets,
  defaults,
  assetPrompt,
  generationMetadata,
  rememberTargetPrompt,
  isBatch,
  templates,
} from './generation'
import { parsePromptPlan } from './prompt-plan'
import { iconSet } from './icons'
import { cursorSet } from './cursors'
import { themeImages } from './image-support'
import { themeLibrary } from './library'
import type { Target } from './types/studio'
import type {
  EditorHooks,
  ReferenceImage,
  StudioState,
  AssetBatch,
  GeneratedImage,
  LibraryEntry,
  PromptPlan,
} from './types/studio'
import { element as $ } from './dom'
export const themeAI = (() => {
  const reportAsyncError = (error: unknown) => hooks.toast(errorMessage(error), true)

  let hooks: EditorHooks,
    generating = false,
    timer: ReturnType<typeof setInterval> | undefined,
    started = 0
  let referenceImages: ReferenceImage[] = [],
    referenceOwner: StudioState | undefined,
    loadingReferences = false
  let describing = false,
    promptCandidate: { context: ReturnType<typeof promptContext>; plan: PromptPlan } | null = null,
    referenceVersion = 0,
    promptRevision = 0
  let batchRun: { cancelled: boolean; position: number; label: string } | null = null
  const batchMode = () =>
    settings().target === 'icon'
      ? settings().iconBatch
      : settings().target === 'cursor' && settings().cursorBatch
  const batchAvailable = (result: AssetBatch) => batchMode() && settings().target === result.target
  function clearSuggestion() {
    promptCandidate = null
    $('ai-prompt-suggestion').hidden = true
    $('ai-suggested-prompt').value = ''
  }
  function renderPromptCandidate() {
    if (!promptCandidate) return
    const target = $('ai-suggested-target').value as Target,
      candidate = promptCandidate.plan.targets[target]
    $('ai-suggested-style').value = candidate.style
    $('ai-suggested-prompt').value = candidate.prompt
    $('ai-suggested-icons').hidden = target !== 'icon'
    $('ai-suggested-cursors').hidden = target !== 'cursor'
    for (const [catalog, field, listId] of [
      [iconSet, 'iconPrompts', 'ai-suggested-icon-prompts'],
      [cursorSet, 'cursorPrompts', 'ai-suggested-cursor-prompts'],
    ] as const) {
      const list = $(listId)
      list.replaceChildren()
      for (const icon of catalog) {
        const label = document.createElement('label'),
          input = document.createElement('textarea')
        label.className = 'field'
        label.append(document.createTextNode(icon.label))
        input.rows = 3
        input.maxLength = 1200
        input.setAttribute('aria-label', `${icon.label}候选专属提示词`)
        input.value = promptCandidate.plan[field][icon.key]
        input.oninput = () => {
          if (promptCandidate) promptCandidate.plan[field][icon.key] = input.value
        }
        label.append(input)
        list.append(label)
      }
    }
  }
  function promptContext() {
    return {
      owner: hooks.getState(),
      target: settings().target,
      style: settings().style,
      color: hooks.getState().manifest.tokens.colorPrimary,
      references: referenceVersion,
      revision: promptRevision,
    }
  }
  function sameContext(context: ReturnType<typeof promptContext>) {
    const current = promptContext()
    return (Object.keys(context) as (keyof typeof context)[]).every(
      (key) => context[key] === current[key],
    )
  }
  function samePlanContext(context: ReturnType<typeof promptContext>) {
    const current = promptContext()
    return (['owner', 'color', 'references', 'revision'] as const).every(
      (key) => context[key] === current[key],
    )
  }
  function promptPreferencesChanged() {
    promptRevision++
    clearSuggestion()
  }
  function settings() {
    const state = hooks.getState()
    state.generator ||= { ...defaults }
    return state.generator
  }
  function presetPrompt() {
    const config = settings(),
      theme = hooks.getState().manifest
    return `${templates[config.target] || templates.background}\n\n统一风格：${config.style || defaults.style}。\n配色以 ${theme.tokens.colorPrimary} 为主色，与主题「${theme.name || '我的主题'}」保持一致。\n如有参考图，请参考其中的主体特征和视觉风格，按照本次用途重新构图。\n素材将用于 AUTO-MAS 的${targets[config.target]}；请直接输出可用图片。`
  }
  function renderReferences() {
    if (referenceOwner !== hooks.getState()) {
      if (batchRun) {
        batchRun.cancelled = true
        window.studio.cancelGeneration().catch(() => {})
      }
      referenceOwner = hooks.getState()
      referenceImages = []
      referenceVersion++
      clearSuggestion()
    }
    const busy = generating || describing || loadingReferences
    const list = $('ai-reference-list')
    list.replaceChildren()
    $('ai-reference-count').textContent = `${referenceImages.length} / 4`
    referenceImages.forEach((reference, index) => {
      const item = document.createElement('div')
      item.className = 'ai-reference-item'
      const image = document.createElement('img')
      image.src = reference.url
      image.alt = `参考图 ${index + 1}`
      const detail = document.createElement('div')
      const name = document.createElement('strong')
      name.textContent = `${index + 1}. ${reference.name}`
      name.title = reference.name
      const size = document.createElement('small')
      size.textContent = `${reference.width} × ${reference.height} · ${Math.ceil(reference.bytes / 1024)} KB`
      detail.append(name, size)
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.textContent = '移除'
      remove.setAttribute('aria-label', `移除参考图 ${index + 1}`)
      remove.disabled = busy
      remove.onclick = () => {
        referenceImages.splice(index, 1)
        referenceVersion++
        clearSuggestion()
        renderReferences()
      }
      item.append(image, detail, remove)
      list.append(item)
    })
    $('ai-reference-add').disabled = busy || referenceImages.length >= 4
    $('ai-reference-add').textContent = loadingReferences ? '正在读取参考图…' : '＋ 添加参考图'
    $('ai-generate').disabled = busy
    $('ai-describe').disabled = busy || !referenceImages.length
    $('ai-describe').textContent = describing ? '正在生成整套提示词…' : '根据参考图生成整套提示词'
    if (!generating)
      $('ai-generate').textContent = batchMode()
        ? settings().target === 'cursor'
          ? '✦ 批量生成 3 个光标'
          : `✦ 批量生成 ${iconSet.length} 个图标`
        : referenceImages.length
          ? '✦ 参考图生成'
          : '✦ 生成图片'
  }
  async function addReferences(files: File[]) {
    if (!files.length || generating || describing || loadingReferences) return
    renderReferences()
    const owner = hooks.getState()
    loadingReferences = true
    renderReferences()
    try {
      if (referenceImages.length + files.length > 4)
        throw new Error('参考图最多 4 张，请先移除已有参考图')
      const total =
        referenceImages.reduce((sum, item) => sum + item.bytes, 0) +
        files.reduce((sum, file) => sum + file.size, 0)
      if (total > 16 * 1024 * 1024) throw new Error('参考图总大小不能超过 16 MB')
      const added = []
      for (const file of files) {
        if (file.size > 8 * 1024 * 1024) throw new Error('单张参考图不能超过 8 MB')
        const match = /\.(png|jpe?g|webp)$/i.exec(file.name)
        if (!match) throw new Error('参考图只支持 PNG、JPEG 或 WebP')
        const mime =
          match[1].toLowerCase() === 'png'
            ? 'image/png'
            : match[1].toLowerCase() === 'webp'
              ? 'image/webp'
              : 'image/jpeg'
        const bytes = await file.arrayBuffer()
        const url = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = () => reject(new Error('参考图读取失败'))
          reader.readAsDataURL(new Blob([bytes], { type: mime }))
        })
        added.push({ name: file.name, url, ...(await themeImages.inspect(url, file.name)) })
      }
      if (owner === hooks.getState()) {
        referenceImages.push(...added)
        referenceVersion++
        clearSuggestion()
      }
    } catch (error) {
      hooks.toast(errorMessage(error), true)
    } finally {
      loadingReferences = false
      $('ai-reference-file').value = ''
      renderReferences()
    }
  }
  function renderResult() {
    const result = hooks.getState().aiResult
    const batch = isBatch(result)
    $('ai-empty').hidden = !!result
    $('ai-result').hidden = !result || batch
    $('ai-icon-results').hidden = !batch
    $('ai-archive').hidden = !result?.libraryError || batch
    $('ai-archive').disabled = generating || describing
    if (batch) {
      renderBatch(result)
      return
    }
    if (!result) return
    $('ai-result-image').src = result.url
    $('ai-result-title').textContent = `已生成 · ${targets[result.target] || '素材'}`
    $('ai-result-info').textContent =
      `${result.width} × ${result.height} · ${Math.round(result.bytes / 1024)} KB`
    $('ai-apply').textContent = `应用为${targets[result.target] || '主题背景'} ↗`
    $('ai-icon-key-field').hidden = result.target !== 'icon'
    if (result.iconKey) $('ai-icon-key').value = result.iconKey
    if (result.cursorKey) $('ai-cursor-key').value = result.cursorKey
    $('ai-cursor-key-field').hidden = result.target !== 'cursor'
    $('ai-result-note').textContent =
      result.target === 'cursor'
        ? '应用时保持比例缩小至 64 × 64 像素以内，热点从左上角开始，可在图片素材中调整。'
        : result.target === 'icon'
          ? '应用时保持比例缩小至 128 × 128 像素以内。透明效果取决于模型实际返回的图片。'
          : result.target === 'mascot'
            ? '应用为静态桌宠，原有桌宠动画会被替换。透明效果取决于模型实际返回的图片。'
            : '这张图片还未自动应用到主题；你可以先保存图片，也可以确认后应用。'
    $('ai-result-note').textContent += result.libraryError
      ? ` 素材库保存失败：${result.libraryError}。请重试保存或另存图片。`
      : result.libraryId
        ? ' 原图已保存到本地素材库。'
        : ''
  }
  function render() {
    if (!hooks) return
    const config = settings()
    for (const [id, key] of [
      ['ai-base-url', 'baseURL'],
      ['ai-model', 'model'],
      ['ai-target', 'target'],
      ['ai-style', 'style'],
      ['ai-size', 'size'],
      ['ai-quality', 'quality'],
      ['ai-response-format', 'responseFormat'],
      ['ai-vision-model', 'visionModel'],
      ['ai-vision-url', 'visionBaseURL'],
    ] as const)
      $(id).value = config[key] ?? defaults[key]
    if (!config.prompt) config.prompt = presetPrompt()
    rememberTargetPrompt(config)
    $('ai-prompt').value = config.prompt
    $('ai-transparent').checked = config.transparent === true
    $('ai-vision-separate').checked = config.visionSeparate === true
    $('ai-vision-custom').hidden = config.visionSeparate !== true
    $('ai-icon-settings').hidden = config.target !== 'icon'
    $('ai-cursor-settings').hidden = config.target !== 'cursor'
    $('ai-cursor-batch').checked = config.cursorBatch
    $('ai-cursor-single-field').hidden = config.cursorBatch
    $('ai-cursor-target').value = config.cursorKey
    for (const cursor of cursorSet)
      $(`ai-cursor-prompt-${cursor.key}`).value =
        config.cursorPrompts?.[cursor.key] ?? cursor.subject
    $('ai-icon-batch').checked = config.iconBatch === true
    $('ai-icon-single-field').hidden = batchMode()
    $('ai-icon-batch-hint').hidden = !batchMode()
    $('ai-icon-target').value = config.iconKey || 'default'
    for (const icon of iconSet)
      $(`ai-icon-prompt-${icon.key}`).value = config.iconPrompts?.[icon.key] ?? icon.subject
    if (promptCandidate && !samePlanContext(promptCandidate.context)) clearSuggestion()
    renderReferences()
    renderResult()
  }
  function selectTab(tab: string) {
    const selected = tab === 'ai'
    document.querySelector('.workspace')!.classList.toggle('ai-view', selected)
    $('ai-result-panel').hidden = !selected
    const heading = document.querySelector('.workspace-top h2')!
    heading.textContent = selected ? '灵感，在这里变成画面' : '你的主题，正在成形'
    document.querySelector('.workspace-top .eyebrow')!.textContent = selected
      ? 'AI IMAGE STUDIO'
      : 'LIVE PREVIEW'
    document.querySelector('.preview-label')!.textContent = selected ? '先预览，再应用' : '视觉示意'
    if (selected) {
      render()
      $('ai-status').textContent ||= '准备就绪，填写 API Key 后即可生成。'
    }
  }
  function generationError(message: string) {
    $('ai-status').className = 'validation error'
    $('ai-status').textContent = message
    hooks.toast(message, true)
  }
  async function generate() {
    if (generating || describing || loadingReferences) return
    if (batchMode()) {
      await generateBatch()
      return
    }
    const apiKey = $('ai-key').value.trim()
    if (!apiKey) {
      $('ai-key').focus()
      hooks.toast('请在工具里填写 API Key', true)
      return
    }
    const config = structuredClone(settings()),
      owner = hooks.getState()
    renderReferences()
    const references = structuredClone(referenceImages)
    if (!config.prompt?.trim()) {
      hooks.toast('请填写提示词，或点击「套用内置提示词」', true)
      return
    }
    generating = true
    started = Date.now()
    renderReferences()
    $('ai-generate').disabled = true
    $('ai-generate').textContent = '正在生成…'
    $('ai-cancel').hidden = false
    $('ai-result-panel').classList.add('generating')
    $('ai-status').className = 'validation'
    const update = () => {
      $('ai-status').textContent =
        `正在等待 ${config.model}${references.length ? ` · ${references.length} 张参考图` : ''} · ${Math.floor((Date.now() - started) / 1000)} 秒；生成期间可以继续编辑。`
    }
    update()
    timer = setInterval(update, 1000)
    try {
      const response = await window.studio.generate({
        ...config,
        apiKey,
        prompt: assetPrompt(config, config.target === 'cursor' ? config.cursorKey : config.iconKey),
        referenceImages: references,
      })
      if (!response.success) throw new Error(response.error)
      const info = await themeImages.inspect(response.image.url, '生成的图片')
      const image: GeneratedImage = {
        ...response.image,
        ...info,
        ...generationMetadata(
          config,
          config.target === 'cursor' ? config.cursorKey : config.iconKey,
        ),
        referenceImages: references,
      }
      const saved = await themeLibrary.save(image)
      if (owner !== hooks.getState()) {
        hooks.toast(
          saved
            ? '图片已存入本地素材库，可在当前主题选用'
            : `素材库保存失败：${image.libraryError}`,
          !saved,
        )
        return
      }
      owner.aiResult = image
      hooks.changed()
      renderResult()
      $('ai-status').className = saved ? 'validation success' : 'validation error'
      $('ai-status').textContent = saved
        ? '生成完成，原图已存入本地素材库。请预览后应用到主题。'
        : `生成完成，但素材库保存失败：${image.libraryError}。请重试保存或另存图片。`
      hooks.toast('图片已生成，可以预览后应用')
    } catch (error) {
      $('ai-status').className = 'validation error'
      $('ai-status').textContent = errorMessage(error)
    } finally {
      clearInterval(timer)
      generating = false
      $('ai-generate').disabled = false
      $('ai-generate').textContent = '✦ 生成图片'
      $('ai-cancel').hidden = true
      $('ai-result-panel').classList.remove('generating')
      renderReferences()
      renderResult()
      if (owner !== hooks.getState())
        $('ai-status').textContent = '已切换主题，可从本地素材库选用已保存的图片。'
    }
  }
  function batchButtons(result: AssetBatch) {
    const unit = result.target === 'cursor' ? '光标' : '图标'
    const ready = result.items.filter((item) => item.url && item.selected !== false).length
    const remaining = result.items.filter((item) => item.status !== 'ready').length
    $('ai-apply-icons').textContent = `应用已选${unit}（${ready}）`
    $('ai-apply-icons').disabled = generating || describing || !ready
    $('ai-continue-icons').hidden = !remaining
    $('ai-continue-icons').textContent = `继续生成未完成项（${remaining}）`
    $('ai-continue-icons').disabled =
      generating ||
      describing ||
      loadingReferences ||
      !batchAvailable(result) ||
      result.items.some((item) => item.archiveSource)
    $('ai-archive-icons').hidden = !result.items.some((item) => item.archiveSource)
    $('ai-archive-icons').disabled = generating || describing
  }
  function renderBatch(result: AssetBatch) {
    const unit = result.target === 'cursor' ? '光标' : '图标'
    $('ai-batch-title').textContent =
      `${result.target === 'cursor' ? '鼠标光标' : '菜单图标'} · 同一套风格`
    const ready = result.items.filter((item) => item.url).length
    $('ai-icon-summary').textContent =
      `已生成 ${ready} / ${result.items.length} 个${unit} · 每项有独立的用途提示词，共用画风与参考图`
    const grid = $('ai-icon-grid')
    grid.replaceChildren()
    for (const item of result.items) {
      const card = document.createElement('article')
      card.className = 'ai-icon-card'
      card.dataset.icon = item.key
      const preview = document.createElement('div')
      preview.className = 'ai-icon-thumb'
      if (item.url) {
        const image = document.createElement('img')
        image.src = item.url
        image.alt = item.label
        preview.append(image)
      } else
        preview.textContent =
          item.status === 'generating' ? '生成中…' : item.status === 'error' ? '未完成' : '待生成'
      const label = document.createElement('label')
      label.className = 'checkbox-field'
      const checked = document.createElement('input')
      checked.type = 'checkbox'
      checked.checked = item.selected !== false
      checked.disabled = !item.url || generating || describing
      checked.setAttribute('aria-label', `使用${item.label}${unit}`)
      checked.onchange = () => {
        item.selected = checked.checked
        hooks.changed()
        batchButtons(result)
      }
      label.append(checked, document.createTextNode(item.label))
      const status = document.createElement('p')
      status.className = 'hint'
      status.textContent =
        item.error ||
        (item.archiveSource
          ? `原图保存失败：${item.archiveSource.libraryError}，请重试保存`
          : item.url
            ? `${item.width} × ${item.height} · 已生成${item.libraryId ? ' · 原图已存入素材库' : ''}`
            : '尚未生成')
      const retry = document.createElement('button')
      retry.type = 'button'
      retry.className = 'text-button'
      retry.textContent = '单独重新生成'
      retry.setAttribute('aria-label', `重新生成${item.label}${unit}`)
      retry.disabled = generating || describing || loadingReferences || !batchAvailable(result)
      retry.onclick = uiTask(() => generateBatch([item.key]), reportAsyncError)
      card.append(preview, label, status, retry)
      grid.append(card)
    }
    batchButtons(result)
  }
  async function generateBatch(keys?: string[]) {
    if (generating || describing || loadingReferences) return
    const apiKey = $('ai-key').value.trim()
    if (!apiKey) {
      $('ai-settings').open = true
      $('ai-key').focus()
      generationError('请在工具里填写 API Key 后再继续生成')
      return
    }
    renderReferences()
    const config = structuredClone(settings()),
      owner = hooks.getState(),
      references = structuredClone(referenceImages)
    if (!config.prompt?.trim()) {
      generationError('请填写共同的风格提示词')
      return
    }
    let result = owner.aiResult
    if (result?.items?.some((item) => item.archiveSource)) {
      generationError('请先重试保存未归档的原图')
      return
    }
    if (keys) {
      if (!isBatch(result) || result.target !== config.target) return
      if (result.referenceCount && !references.length) {
        generationError('请重新添加参考图后再继续生成')
        return
      }
    } else {
      result = {
        kind: config.target === 'cursor' ? 'cursor-batch' : 'icon-batch',
        target: config.target === 'cursor' ? 'cursor' : 'icon',
        referenceCount: references.length,
        items: (config.target === 'cursor' ? cursorSet : iconSet).map((icon) => ({
          key: icon.key,
          label: icon.label,
          status: 'pending',
          selected: true,
        })),
      }
      owner.aiResult = result
    }
    const jobs = result.items.filter((item) => !keys || keys.includes(item.key))
    const unit = result.target === 'cursor' ? '光标' : '图标'
    if (!jobs.length) return
    const run = { cancelled: false, position: 0, label: '' }
    let failure: string | undefined
    batchRun = run
    generating = true
    started = Date.now()
    renderReferences()
    renderResult()
    hooks.changed()
    $('ai-generate').textContent = '正在批量生成…'
    $('ai-cancel').hidden = false
    $('ai-status').className = 'validation'
    const update = () => {
      $('ai-status').textContent =
        `正在生成 ${run.position} / ${jobs.length} · ${run.label} · ${Math.floor((Date.now() - started) / 1000)} 秒；已完成的${unit}会保留。`
    }
    timer = setInterval(update, 1000)
    try {
      for (const [index, item] of jobs.entries()) {
        if (run.cancelled || owner !== hooks.getState()) break
        run.position = index + 1
        run.label = item.label
        item.status = 'generating'
        delete item.error
        renderResult()
        update()
        try {
          const response = await window.studio.generate({
            ...config,
            target: result.target,
            apiKey,
            prompt: assetPrompt(config, item.key),
            referenceImages: references,
          })
          if (!response.success) throw new Error(response.error)
          const original: GeneratedImage = {
            ...response.image,
            ...(await themeImages.inspect(response.image.url, `生成的${unit}`)),
            ...generationMetadata(config, item.key),
            referenceImages: references,
          }
          const saved = await themeLibrary.save(original)
          if (owner !== hooks.getState()) break
          const url = await themeImages.fit(
              response.image.url,
              result.target === 'cursor' ? 64 : 128,
            ),
            info = await themeImages.inspect(url, `生成的${unit}`)
          if (owner !== hooks.getState()) break
          Object.assign(item, info, { url, status: 'ready', libraryId: original.libraryId })
          if (!saved) item.archiveSource = original
          hooks.changed()
          renderResult()
          if (!saved) break
        } catch (error) {
          item.status = item.url ? 'ready' : 'error'
          if (!run.cancelled) {
            failure = errorMessage(error)
            item.error = failure
          }
          break
        }
      }
    } finally {
      clearInterval(timer)
      generating = false
      batchRun = null
      $('ai-cancel').hidden = true
      if (owner === hooks.getState()) {
        for (const item of result.items)
          if (item.status === 'generating') item.status = item.url ? 'ready' : 'pending'
        const ready = result.items.filter((item) => item.url).length,
          remaining = result.items.filter((item) => item.status !== 'ready').length
        $('ai-status').className = remaining ? 'validation' : 'validation success'
        $('ai-status').textContent = result.items.some((item) => item.archiveSource)
          ? '素材库保存失败，批量生成已暂停。请先重试保存原图。'
          : `${run.cancelled ? '已取消批量生成' : remaining ? '批量生成已暂停' : `整套${unit}已生成`} · 已保留 ${ready} / ${result.items.length} 个${unit}${remaining ? '，可继续生成未完成项。' : '，原图均已存入本地素材库，请预览后应用。'}`
        if (failure)
          generationError(
            `生成失败：${failure}。已保留 ${ready} / ${result.items.length} 个${unit}${remaining ? '，可继续生成未完成项。' : '，原有图片已保留。'}`,
          )
        hooks.changed()
      } else
        $('ai-status').textContent =
          '已切换主题，旧主题的批量生成已停止。已完成原图保留在本地素材库。'
      renderReferences()
      renderResult()
    }
  }
  async function describe() {
    if (generating || describing || loadingReferences) return
    renderReferences()
    if (!referenceImages.length) {
      hooks.toast('请先添加至少 1 张参考图', true)
      return
    }
    const config = structuredClone(settings()),
      context = promptContext()
    if (!config.visionModel?.trim()) {
      document.querySelector<HTMLDetailsElement>('.ai-vision-settings')!.open = true
      $('ai-vision-model').focus()
      hooks.toast('请填写支持图片输入的看图模型名', true)
      return
    }
    const keyInput = $(config.visionSeparate ? 'ai-vision-key' : 'ai-key'),
      apiKey = keyInput.value.trim()
    if (!apiKey) {
      document.querySelector<HTMLDetailsElement>(
        config.visionSeparate ? '.ai-vision-settings' : '#ai-settings',
      )!.open = true
      keyInput.focus()
      hooks.toast('请填写看图服务使用的 API Key', true)
      return
    }
    const input = {
      baseURL: config.visionSeparate
        ? config.visionBaseURL || defaults.visionBaseURL
        : config.baseURL,
      apiKey,
      model: config.visionModel,
      instructions: `为全部五类用途和全部菜单图标生成整套方案。从参考图的实际主体、配色和画风提取描述。当前风格偏好「${config.style || '未指定'}」仅作辅助，冲突时优先使用参考图的可见特征。各用途已有风格：${JSON.stringify(Object.fromEntries(Object.entries(config.targetPrompts || {}).map(([key, value]) => [key, value?.style])))}。主题主色 ${context.color} 仅供搭配参考。`,
      referenceImages: referenceImages.map(({ url }) => ({ url })),
    }
    describing = true
    renderReferences()
    renderResult()
    $('ai-describe-cancel').hidden = false
    $('ai-describe-status').className = 'validation'
    const began = Date.now(),
      update = () => {
        $('ai-describe-status').textContent =
          `正在分析 ${input.referenceImages.length} 张参考图并规划全部用途 · ${Math.floor((Date.now() - began) / 1000)} 秒`
      }
    update()
    const progressTimer = setInterval(update, 1000)
    try {
      const response = await window.studio.describe(input)
      if (!response.success) throw new Error(response.error)
      if (!samePlanContext(context))
        throw new Error('主题、参考图或风格偏好已改变，请重新生成提示词')
      promptCandidate = { context, plan: response.plan }
      $('ai-suggested-target').value = settings().target
      renderPromptCandidate()
      $('ai-prompt-suggestion').hidden = false
      $('ai-describe-status').className = 'validation success'
      $('ai-describe-status').textContent =
        '五类用途、11 个菜单图标与 3 个光标的候选提示词已生成，可逐项编辑后点击「使用整套提示词」。'
      hooks.toast('整套候选提示词已生成，可逐项编辑后统一使用')
      $('ai-prompt-suggestion').scrollIntoView({ block: 'nearest' })
    } catch (error) {
      $('ai-describe-status').className = 'validation error'
      $('ai-describe-status').textContent = errorMessage(error)
    } finally {
      clearInterval(progressTimer)
      describing = false
      $('ai-describe-cancel').hidden = true
      renderReferences()
      renderResult()
    }
  }
  async function apply() {
    const result = hooks.getState().aiResult
    if (!result || isBatch(result)) return
    try {
      let url = result.url
      if (['icon', 'cursor'].includes(result.target))
        url = await themeImages.fit(url, result.target === 'cursor' ? 64 : 128)
      if (result.target === 'icon') $('icon-key').value = $('ai-icon-key').value
      if (result.target === 'cursor') $('cursor-key').value = $('ai-cursor-key').value
      const [header, encoded] = url.split(',')
      const mime = header.slice(5, header.indexOf(';'))
      const blob = new Blob(
        [Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))],
        { type: mime },
      )
      const extension =
        blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'
      await hooks.importImage(
        new File([blob], `ai-${result.target}.${extension}`, { type: blob.type }),
        result.target,
      )
      hooks.selectTab(result.target === 'background' ? 'design' : 'assets')
    } catch (error) {
      hooks.toast(`无法应用：${errorMessage(error)}`, true)
    }
  }
  async function reusePrompt(entry: LibraryEntry) {
    if (generating || describing || loadingReferences) return
    const context = promptContext()
    loadingReferences = true
    renderReferences()
    renderResult()
    try {
      const restored = await window.studio.readLibraryReferences(entry.id)
      if (!restored.success) throw new Error(restored.error)
      const references = []
      for (const reference of restored.referenceImages)
        references.push({
          ...reference,
          ...(await themeImages.inspect(reference.url, reference.name)),
        })
      if (!sameContext(context)) throw new Error('主题、用途或风格已改变，请重新复用提示词')
      if (restored.referencesStored) {
        referenceOwner = context.owner
        referenceImages = references
        referenceVersion++
      }
      const config = settings()
      rememberTargetPrompt(config)
      config.target = entry.target
      config.prompt = entry.basePrompt || entry.prompt
      config.style = entry.style || config.style
      config.size = ['background', 'cover'].includes(entry.target) ? '1536x1024' : '1024x1024'
      if (entry.target === 'icon' && iconSet.some((icon) => icon.key === entry.iconKey)) {
        config.iconKey = entry.iconKey!
        config.iconBatch = false
        if (entry.iconSubject) {
          config.iconPrompts ||= {}
          config.iconPrompts[entry.iconKey!] = entry.iconSubject
        }
      }
      if (entry.target === 'cursor' && cursorSet.some((cursor) => cursor.key === entry.cursorKey)) {
        config.cursorKey = entry.cursorKey!
        config.cursorBatch = false
        if (entry.cursorSubject) {
          config.cursorPrompts ||= {}
          config.cursorPrompts[entry.cursorKey!] = entry.cursorSubject
        }
      }
      clearSuggestion()
      render()
      hooks.changed()
      hooks.toast(
        restored.referencesStored
          ? `已复用提示词，并恢复 ${references.length} 张原参考图`
          : '已复用提示词；此旧记录未保存参考图，请自行添加或检查当前选择',
      )
    } catch (error) {
      hooks.toast(`无法复用提示词：${errorMessage(error)}`, true)
    } finally {
      loadingReferences = false
      renderReferences()
      renderResult()
    }
  }
  function init(options: EditorHooks) {
    hooks = options
    themeLibrary.init({
      ...hooks,
      busy: () => generating || describing || loadingReferences,
      usePrompt: reusePrompt,
      useImage: (image) => {
        hooks.getState().aiResult = image
        hooks.changed()
        renderResult()
        hooks.toast('已选用原图，请预览后应用到主题')
      },
    })
    $('ai-archive').onclick = uiTask(async () => {
      await themeLibrary.save(hooks.getState().aiResult as GeneratedImage)
      hooks.changed()
      renderResult()
    }, reportAsyncError)
    $('ai-archive-icons').onclick = uiTask(async () => {
      const result = hooks.getState().aiResult
      for (const item of result?.items || [])
        if (item.archiveSource && (await themeLibrary.save(item.archiveSource))) {
          item.libraryId = item.archiveSource.libraryId
          delete item.archiveSource
        }
      hooks.changed()
      renderResult()
    }, reportAsyncError)
    $('ai-reference-add').onclick = () => $('ai-reference-file').click()
    $('ai-reference-file').onchange = uiTask(
      () => addReferences(Array.from($('ai-reference-file').files!)),
      reportAsyncError,
    )
    for (const id of ['ai-icon-key'] as const)
      for (const option of $('icon-key').options) $(id).append(option.cloneNode(true))
    for (const [prefix, catalog, field] of [
      ['icon', iconSet, 'iconPrompts'],
      ['cursor', cursorSet, 'cursorPrompts'],
    ] as const) {
      for (const icon of catalog) {
        const option = document.createElement('option')
        option.value = icon.key
        option.textContent = icon.label
        $(prefix === 'icon' ? 'ai-icon-target' : 'ai-cursor-target').append(option)
        const label = document.createElement('label')
        label.className = 'field'
        label.append(document.createTextNode(icon.label))
        const purpose = document.createElement('small')
        purpose.textContent = `用途：${icon.purpose}`
        const input = document.createElement('textarea')
        input.id = `ai-${prefix}-prompt-${icon.key}`
        input.rows = 2
        input.maxLength = 1200
        input.value = icon.subject
        input.oninput = () => {
          settings()[field] ||= {}
          settings()[field]![icon.key] = input.value
          promptPreferencesChanged()
          hooks.changed()
        }
        label.append(purpose, input)
        $(prefix === 'icon' ? 'ai-icon-prompt-list' : 'ai-cursor-prompt-list').append(label)
      }
    }
    $('ai-cursor-target').onchange = () => {
      settings().cursorKey = $('ai-cursor-target').value
      hooks.changed()
    }
    $('ai-cursor-batch').onchange = () => {
      settings().cursorBatch = $('ai-cursor-batch').checked
      render()
      hooks.changed()
    }
    $('ai-icon-target').onchange = () => {
      settings().iconKey = $('ai-icon-target').value
      hooks.changed()
    }
    $('ai-icon-batch').onchange = () => {
      settings().iconBatch = $('ai-icon-batch').checked
      render()
      hooks.changed()
    }
    $('ai-continue-icons').onclick = uiTask(
      () =>
        generateBatch(
          (hooks.getState().aiResult as AssetBatch).items
            .filter((item) => item.status !== 'ready')
            .map((item) => item.key),
        ),
      reportAsyncError,
    )
    $('ai-apply-icons').onclick = uiTask(async () => {
      const result = hooks.getState().aiResult
      if (!isBatch(result) || generating || describing) return
      const selected = result.items
        .filter((item) => item.url && item.selected !== false)
        .map(({ key, url }) => ({ key, url: url! }))
      $('ai-apply-icons').disabled = true
      try {
        if (result.target === 'cursor') await hooks.importCursors(selected)
        else await hooks.importIcons(selected)
        hooks.selectTab('assets')
      } catch (error) {
        hooks.toast(`无法应用：${errorMessage(error)}`, true)
      } finally {
        renderResult()
      }
    }, reportAsyncError)
    for (const [id, key] of [
      ['ai-base-url', 'baseURL'],
      ['ai-model', 'model'],
      ['ai-style', 'style'],
      ['ai-prompt', 'prompt'],
      ['ai-size', 'size'],
      ['ai-vision-model', 'visionModel'],
      ['ai-vision-url', 'visionBaseURL'],
    ] as const)
      $(id).oninput = () => {
        settings()[key] = $(id).value
        if (key === 'style' || key === 'prompt') rememberTargetPrompt(settings())
        if (key === 'style' || key === 'prompt') promptPreferencesChanged()
        hooks.changed()
      }
    $('ai-vision-separate').onchange = () => {
      settings().visionSeparate = $('ai-vision-separate').checked
      $('ai-vision-custom').hidden = !settings().visionSeparate
      hooks.changed()
    }
    $('ai-describe').onclick = uiTask(describe, reportAsyncError)
    $('ai-describe-cancel').onclick = uiTask(async () => {
      $('ai-describe-cancel').disabled = true
      try {
        const result = await window.studio.cancelDescription()
        if (!result.success) throw new Error(result.error)
      } finally {
        $('ai-describe-cancel').disabled = false
      }
    }, reportAsyncError)
    $('ai-discard-prompt').onclick = clearSuggestion
    $('ai-suggested-target').onchange = renderPromptCandidate
    for (const [id, key] of [
      ['ai-suggested-style', 'style'],
      ['ai-suggested-prompt', 'prompt'],
    ] as const)
      $(id).oninput = () => {
        if (promptCandidate)
          promptCandidate.plan.targets[$('ai-suggested-target').value as Target][key] = $(id).value
      }
    $('ai-use-prompt').onclick = () => {
      if (!promptCandidate || !samePlanContext(promptCandidate.context)) {
        clearSuggestion()
        hooks.toast('参考图或生成要求已改变，请重新生成提示词', true)
        return
      }
      let plan: PromptPlan
      try {
        plan = parsePromptPlan(promptCandidate.plan)
      } catch (error) {
        hooks.toast(errorMessage(error), true)
        return
      }
      const config = settings()
      config.targetPrompts = plan.targets
      config.iconPrompts = plan.iconPrompts
      config.cursorPrompts = plan.cursorPrompts
      Object.assign(config, plan.targets[config.target])
      clearSuggestion()
      render()
      hooks.changed()
      $('ai-prompt').focus()
      hooks.toast('已使用整套灵感风格与提示词，切换用途即可查看和生成图片')
    }
    for (const [id, key] of [
      ['ai-quality', 'quality'],
      ['ai-response-format', 'responseFormat'],
    ] as const)
      $(id).onchange = () => {
        settings()[key] = $(id).value
        hooks.changed()
      }
    $('ai-target').onchange = () => {
      const config = settings()
      rememberTargetPrompt(config)
      config.target = $('ai-target').value as Target
      config.size = ['background', 'cover'].includes(config.target) ? '1536x1024' : '1024x1024'
      const saved = config.targetPrompts?.[config.target]
      config.style = saved?.style ?? config.style
      config.prompt = saved?.prompt ?? presetPrompt()
      render()
      hooks.changed()
    }
    $('ai-reset-prompt').onclick = () => {
      settings().prompt = presetPrompt()
      promptPreferencesChanged()
      render()
      hooks.changed()
    }
    $('ai-transparent').onchange = () => {
      settings().transparent = $('ai-transparent').checked
      hooks.changed()
    }
    $('ai-key-toggle').onclick = () => {
      $('ai-key').type = $('ai-key').type === 'password' ? 'text' : 'password'
      $('ai-key-toggle').textContent = $('ai-key').type === 'password' ? '显示' : '隐藏'
    }
    $('ai-generate').onclick = uiTask(generate, reportAsyncError)
    $('ai-cancel').onclick = uiTask(async () => {
      if (batchRun) batchRun.cancelled = true
      $('ai-cancel').disabled = true
      try {
        const result = await window.studio.cancelGeneration()
        if (!result.success) throw new Error(result.error)
      } finally {
        $('ai-cancel').disabled = false
      }
    }, reportAsyncError)
    $('ai-apply').onclick = uiTask(apply, reportAsyncError)
    $('ai-save-image').onclick = uiTask(async () => {
      const image = hooks.getState().aiResult
      if (!image || isBatch(image)) return
      const result = await window.studio.saveImage({ url: image.url })
      if (!result.success) hooks.toast(result.error, true)
      else if (!result.canceled) hooks.toast(`图片已保存：${result.filePath}`)
    }, reportAsyncError)
  }
  async function restoreLibrary() {
    const owner = hooks.getState(),
      result = owner.aiResult
    for (const image of isBatch(result) ? result.items : result ? [result] : []) {
      if (!image.url || image.libraryId) continue
      const source = image.archiveSource || image
      const target = source.target || result?.target || 'icon'
      const candidate = {
        ...source,
        target,
        ...(target === 'cursor'
          ? { cursorKey: source.cursorKey || image.key }
          : { iconKey: source.iconKey || image.key }),
      }
      const saved = await themeLibrary.save(candidate as GeneratedImage)
      // 旧草稿缺少生成说明时，只归档已保存的图片，不猜测当时使用的提示词。
      if (saved) {
        image.libraryId = candidate.libraryId
        delete image.libraryError
        delete image.archiveSource
        delete image.referenceImages
      } else image.libraryError = candidate.libraryError
    }
    if (owner === hooks.getState() && result) {
      hooks.changed()
      renderResult()
    }
  }
  return { init, render, selectTab, restoreLibrary }
})()

export {}
