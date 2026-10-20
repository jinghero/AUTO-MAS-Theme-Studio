const fs = require('node:fs')
const path = require('node:path')
const { createHash, randomUUID } = require('node:crypto')
const { decodeImage } = require('./package-service.cjs')
const { imageURL } = require('./image-api.cjs')

const targets = new Set(['background', 'cover', 'icon', 'mascot', 'cursor'])
const validId = id => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id)
const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : ''
function metadata(input) {
  if (!targets.has(input.target)) throw new Error('素材用途无效')
  for (const dimension of [input.width, input.height])
    if (!Number.isInteger(dimension) || dimension < 1 || dimension > 8192) throw new Error('素材尺寸无效')
  return { target:input.target, iconKey:input.target === 'icon' ? text(input.iconKey, 40) : '',
    prompt:text(input.prompt, 20000), basePrompt:text(input.basePrompt, 16000), iconSubject:text(input.iconSubject, 1200), model:text(input.model, 200), style:text(input.style, 2000),
    width:input.width, height:input.height }
}
function imageBytes(url) {
  const bytes = decodeImage(url), checked = imageURL(bytes)
  if (!url.startsWith(`data:${checked.mime};`)) throw new Error('素材图片格式不一致')
  return { bytes, extension:checked.mime === 'image/png' ? 'png' : checked.mime === 'image/webp' ? 'webp' : 'jpg' }
}
function createImageLibrary(directory) {
  function readEntry(id) {
    if (!validId(id)) throw new Error('素材编号无效')
    const file = path.join(directory, `${id}.json`)
    if (fs.statSync(file).size > 160 * 1024) throw new Error('素材信息过大')
    const entry = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (entry.id !== id || !['png', 'jpg', 'webp'].includes(entry.extension) || !Number.isFinite(Date.parse(entry.createdAt))) throw new Error('素材信息已损坏')
    return { ...metadata(entry), id, createdAt:entry.createdAt, extension:entry.extension, bytes:entry.bytes }
  }
  function atomicWrite(file, bytes) {
    const temporary = `${file}.${randomUUID()}.tmp`
    try { fs.writeFileSync(temporary, bytes, {flag:'wx'}); fs.renameSync(temporary, file) }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary) }
  }
  function save(input) {
    const info = metadata(input), image = imageBytes(input.url), thumb = imageBytes(input.thumbnail)
    if (thumb.extension !== 'png' || thumb.bytes.length > 256 * 1024) throw new Error('素材缩略图无效或过大')
    // 相同图片、用途和生成说明复用同一条记录，避免恢复草稿时重复归档。
    const id = createHash('sha256').update(image.bytes).update(JSON.stringify(info)).digest('hex')
    fs.mkdirSync(directory, {recursive:true})
    const entry = {...info, id, extension:image.extension, bytes:image.bytes.length, createdAt:new Date().toISOString()}
    const record = path.join(directory, `${id}.json`)
    if (fs.existsSync(record)) {
      const existing = readEntry(id)
      if (fs.existsSync(path.join(directory, `${id}.${existing.extension}`)) && fs.existsSync(path.join(directory, `${id}.thumb.png`))) return {entry:existing}
    }
    atomicWrite(path.join(directory, `${id}.${image.extension}`), image.bytes)
    atomicWrite(path.join(directory, `${id}.thumb.png`), thumb.bytes)
    atomicWrite(record, JSON.stringify(entry, null, 2))
    return {entry}
  }
  function list(input = {}) {
    const offset = Number.isInteger(input.offset) && input.offset >= 0 ? input.offset : 0
    if (!fs.existsSync(directory)) return {entries:[], total:0, offset:0, directory, skipped:0}
    const entries = []; let skipped = 0
    for (const file of fs.readdirSync(directory)) {
      if (!/^[a-f0-9]{64}\.json$/.test(file)) continue
      try {
        const entry = readEntry(file.slice(0, -5))
        if (!fs.existsSync(path.join(directory, `${entry.id}.${entry.extension}`))) throw new Error('素材原图不存在')
        entries.push(entry)
      } catch { skipped++ }
    }
    entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
    const start = Math.min(offset, Math.max(0, Math.floor((entries.length - 1) / 12) * 12))
    return {entries:entries.slice(start, start + 12).map(entry => {
      let thumbnail = ''
      try {
        const file = path.join(directory, `${entry.id}.thumb.png`)
        if (fs.statSync(file).size <= 256 * 1024) thumbnail = `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`
      } catch { /* 原图仍可选用；缺失缩略图不影响其他素材。 */ }
      return {...entry, thumbnail}
    }), total:entries.length, offset:start, directory, skipped}
  }
  function read(id) {
    const entry = readEntry(id), file = path.join(directory, `${id}.${entry.extension}`)
    if (fs.statSync(file).size > 8 * 1024 * 1024) throw new Error('素材原图超过 8 MB')
    return {entry, image:imageURL(fs.readFileSync(file))}
  }
  return {save, list, read, directory}
}
module.exports = {createImageLibrary}
