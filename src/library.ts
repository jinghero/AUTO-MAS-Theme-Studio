import { uiTask } from './async-ui'
import { errorMessage } from './errors'
import { themeImages } from './image-support'
import { iconSet } from './icons'
import type { LibraryHooks, GeneratedImage } from './types/studio'
import { element as $ } from './dom'
export const themeLibrary = (() => {
  const reportAsyncError = (error: unknown) => hooks.toast(errorMessage(error), true)

  const targets = {
    background: '主题背景',
    cover: '主题封面',
    icon: '菜单图标',
    mascot: '静态桌宠',
    cursor: '鼠标光标',
  }
  let hooks: LibraryHooks,
    offset = 0,
    revision = 0
  async function refresh(reset = false) {
    if (reset) offset = 0
    const current = ++revision
    const result = await window.studio.listLibraryImages({ offset })
    if (current !== revision) return
    if (!result.success) {
      $('ai-library-status').textContent = `素材库读取失败：${result.error}`
      return
    }
    offset = result.offset
    $('ai-library-title').textContent = `本地素材库（${result.total}）`
    $('ai-library-path').textContent = result.directory
    $('ai-library-status').textContent = result.total
      ? `${offset + 1}–${Math.min(offset + 12, result.total)} / ${result.total}${result.skipped ? ` · ${result.skipped} 条损坏记录未显示` : ''}`
      : '生成的图片会自动保存在这里，新建主题和重启后仍可使用。'
    $('ai-library-prev').disabled = offset === 0
    $('ai-library-next').disabled = offset + 12 >= result.total
    const grid = $('ai-library-grid')
    grid.replaceChildren()
    for (const entry of result.entries) {
      const card = document.createElement('article')
      card.className = 'ai-icon-card'
      card.dataset.libraryId = entry.id
      const preview = document.createElement('div')
      preview.className = 'ai-icon-thumb'
      if (entry.thumbnail) {
        const image = document.createElement('img')
        image.src = entry.thumbnail
        image.alt = targets[entry.target]
        preview.append(image)
      }
      const name = document.createElement('strong')
      name.textContent =
        entry.target === 'icon'
          ? iconSet.find((icon) => icon.key === entry.iconKey)?.label || targets.icon
          : targets[entry.target]
      const info = document.createElement('p')
      info.className = 'hint'
      info.textContent = `${entry.width} × ${entry.height} · ${new Date(entry.createdAt).toLocaleString()}${entry.model ? ` · ${entry.model}` : ''} · ${entry.referencesStored ? `${entry.references.length} 张参考图` : '旧记录未保存参考图'}`
      const actions = document.createElement('div')
      actions.className = 'library-actions'
      const use = document.createElement('button')
      use.textContent = '选用图片'
      use.className = 'text-button'
      use.onclick = uiTask(async () => {
        if (hooks.busy()) {
          hooks.toast('请等待当前 AI 请求完成后再选用素材', true)
          return
        }
        const owner = hooks.getState()
        use.disabled = true
        try {
          const result = await window.studio.readLibraryImage(entry.id)
          if (!result.success) throw new Error(result.error)
          const info = await themeImages.inspect(result.image.url, '素材原图')
          if (owner !== hooks.getState() || hooks.busy()) return
          hooks.useImage({ ...result.image, ...info, ...result.entry, libraryId: entry.id })
          $('ai-result').scrollIntoView({ block: 'start', behavior: 'smooth' })
        } catch (error) {
          hooks.toast(`无法选用素材：${errorMessage(error)}`, true)
        } finally {
          use.disabled = false
        }
      }, reportAsyncError)
      const prompt = document.createElement('button')
      prompt.textContent = '复用提示词'
      prompt.className = 'text-button'
      prompt.disabled = !entry.prompt
      prompt.onclick = () => {
        if (hooks.busy()) {
          hooks.toast('请等待当前 AI 请求完成后再复用提示词', true)
          return
        }
        hooks.usePrompt(entry)
      }
      actions.append(use, prompt)
      card.append(preview, name, info, actions)
      if (entry.prompt) {
        const details = document.createElement('details'),
          summary = document.createElement('summary'),
          text = document.createElement('p')
        summary.textContent = '查看提示词'
        text.textContent = entry.prompt
        text.className = 'library-prompt'
        details.append(summary, text)
        card.append(details)
      }
      grid.append(card)
    }
  }
  async function save(image: GeneratedImage) {
    if (image.libraryId) return true
    try {
      const thumbnail = await themeImages.fit(image.url, 128)
      const result = await window.studio.saveLibraryImage({ ...image, thumbnail })
      if (!result.success) throw new Error(result.error)
      image.libraryId = result.entry.id
      delete image.libraryError
      image.references = result.entry.references
      image.referencesStored = result.entry.referencesStored
      delete image.referenceImages
      await refresh(true)
      return true
    } catch (error) {
      image.libraryError = errorMessage(error)
      return false
    }
  }
  function init(options: LibraryHooks) {
    hooks = options
    $('ai-library-jump').onclick = () => {
      $('ai-library').open = true
      $('ai-library').scrollIntoView({ block: 'start', behavior: 'smooth' })
      void refresh(true).catch(reportAsyncError)
    }
    $('ai-library-refresh').onclick = uiTask(() => refresh(true), reportAsyncError)
    $('ai-library-prev').onclick = () => {
      offset = Math.max(0, offset - 12)
      void refresh().catch(reportAsyncError)
    }
    $('ai-library-next').onclick = () => {
      offset += 12
      void refresh().catch(reportAsyncError)
    }
    $('ai-library-folder').onclick = uiTask(async () => {
      const result = await window.studio.openLibraryFolder()
      if (!result.success) hooks.toast(result.error, true)
    }, reportAsyncError)
    void refresh().catch(reportAsyncError)
  }
  return { init, save, refresh }
})()

export {}
