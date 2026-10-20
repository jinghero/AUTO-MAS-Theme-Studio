const path = require('node:path')
const zlib = require('node:zlib')
const AdmZip = require('adm-zip')

const MiB = 1024 * 1024
const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }

function number(value, fallback, label, min, max, integer = false) {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new Error(`${label} 必须为 ${min}–${max} 范围内的${integer ? '整数' : '数字'}`)
  }
  return value
}

function assetPath(value) {
  if (typeof value !== 'string' || value.length > 240 || !value.startsWith('assets/') || value.includes('\\') || value.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('图片路径必须位于 ZIP 内的 assets 目录')
  }
  if (!mime[path.extname(value).toLowerCase()]) throw new Error(`不支持的图片格式：${value}`)
  return value
}

function loadBytes(filename, bytes) {
  if (!bytes.length || bytes.length > 16 * MiB) throw new Error('文件为空或超过 16 MiB')
  const extension = path.extname(filename).toLowerCase()
  if (mime[extension]) {
    if (bytes.length > 8 * MiB) throw new Error('单张图片不能超过 8 MiB')
    return {
      name: filename, source: filename, raw: true, columns: 8, frameCount: 8,
      idleFps: 4, workingFps: 8, width: 192, opacity: 1,
      images: { static: `data:${mime[extension]};base64,${bytes.toString('base64')}` },
    }
  }
  if (extension !== '.zip') throw new Error('请选择桌宠 ZIP 或 PNG、JPEG、WebP 图片')
  const archive = new AdmZip(bytes)
  const entries = archive.getEntries()
  if (entries.length > 32) throw new Error('ZIP 条目数超过 MAS 的 32 项限制')
  let total = 0
  const files = new Map()
  for (const entry of entries) {
    if (entry.isDirectory) continue
    const name = entry.entryName
    if (name.length > 240 || name.includes('\\') || name.startsWith('/') || /^[a-z]:/i.test(name) || name.split('/').some(part => !part || part === '.' || part === '..')) {
      throw new Error('ZIP 包含无效文件路径')
    }
    if (files.has(name.toLowerCase())) throw new Error(`ZIP 包含重复文件：${name}`)
    if (entry.header.flags & 1) throw new Error('不支持加密 ZIP')
    if (entry.header.size > 8 * MiB) throw new Error(`文件超过 8 MiB：${name}`)
    total += entry.header.size
    if (total > 32 * MiB) throw new Error('ZIP 解压后的总大小不能超过 32 MiB')
    files.set(name.toLowerCase(), entry)
  }
  const read = name => {
    const entry = files.get(name.toLowerCase())
    if (!entry) throw new Error(`ZIP 缺少文件：${name}`)
    const compressed = entry.getCompressedData()
    const data = entry.header.method === 0 ? Buffer.from(compressed)
      : entry.header.method === 8 ? zlib.inflateRawSync(compressed, { maxOutputLength: 8 * MiB }) : null
    if (!data) throw new Error(`ZIP 压缩方式不受支持：${name}`)
    if (data.length !== entry.header.size) throw new Error(`ZIP 文件已损坏：${name}`)
    return data
  }
  const manifestName = files.has('mascot.json') ? 'mascot.json' : files.has('theme.json') ? 'theme.json' : null
  if (!manifestName) throw new Error('ZIP 根目录需要包含 mascot.json 或附带桌宠的 theme.json')
  const manifestBytes = read(manifestName)
  if (manifestBytes.length > 256 * 1024) throw new Error('桌宠描述文件超过 256 KiB')
  let manifest
  try { manifest = JSON.parse(manifestBytes.toString('utf8').replace(/^\uFEFF/, '')) }
  catch { throw new Error(`${manifestName} 不是有效的 JSON`) }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error(`${manifestName} 的顶层必须为对象`)
  if (manifest.formatVersion !== 1) throw new Error('仅支持 formatVersion 为 1 的资源包')
  const mascot = manifest.mascot
  if (!mascot || typeof mascot !== 'object' || Array.isArray(mascot)) throw new Error('资源包没有附带桌宠')
  const image = (value, pngOnly = false) => {
    const name = assetPath(value)
    const ext = path.extname(name).toLowerCase()
    if (pngOnly && ext !== '.png') throw new Error('动画图集必须为 PNG 格式')
    return `data:${mime[ext]};base64,${read(name).toString('base64')}`
  }
  const pack = {
    name: typeof manifest.name === 'string' ? manifest.name.slice(0, 100) : filename,
    source: filename, raw: false, columns: 8, frameCount: 8,
    width: number(mascot.width, 144, '桌宠宽度', 16, 1024),
    opacity: number(mascot.opacity, 1, '透明度', 0, 1),
    idleFps: 4, workingFps: 8, images: { static: image(mascot.path) },
  }
  if (mascot.animation !== undefined) {
    const animation = mascot.animation
    if (!animation || typeof animation !== 'object' || Array.isArray(animation)) throw new Error('animation 必须为对象')
    pack.columns = number(animation.columns, null, '每行列数', 2, 120, true)
    if (pack.columns === null) throw new Error('动画缺少 columns（每行列数）')
    pack.frameCount = number(animation.frameCount, pack.columns, '每动作帧数', pack.columns, 120, true)
    pack.idleFps = number(animation.idleFps, 4, '待机帧率', 1, 120)
    pack.workingFps = number(animation.workingFps, 8, '工作帧率', 1, 120)
    pack.images.main = image(animation.path, true)
    for (const [slot, field] of [['result', 'resultPath'], ['drag', 'dragPath'], ['look', 'lookPath']]) {
      if (animation[field] !== undefined) pack.images[slot] = image(animation[field], true)
    }
  }
  return pack
}

module.exports = { loadBytes }
