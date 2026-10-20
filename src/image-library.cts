import { parseLibraryEntry } from './state.cjs'
import type {
  ImageMetadata,
  ReferenceMetadata,
  LibrarySaveInput,
  LibraryEntry,
} from './types/studio'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { decodeImage } from './package-service.cjs'
import { imageURL, validateReferences } from './image-api.cjs'

const targets = new Set(['background', 'cover', 'icon', 'mascot', 'cursor'])
const validId = (id: string) => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id)
const text = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : '')
function metadata(input: Omit<ImageMetadata, 'bytes'>): Omit<ImageMetadata, 'bytes'> {
  if (!targets.has(input.target)) throw new Error('素材用途无效')
  for (const dimension of [input.width, input.height])
    if (!Number.isInteger(dimension) || dimension < 1 || dimension > 8192)
      throw new Error('素材尺寸无效')
  return {
    target: input.target,
    iconKey: input.target === 'icon' ? text(input.iconKey, 40) : '',
    prompt: text(input.prompt, 20000),
    basePrompt: text(input.basePrompt, 16000),
    iconSubject: text(input.iconSubject, 1200),
    model: text(input.model, 200),
    style: text(input.style, 2000),
    width: input.width,
    height: input.height,
  }
}
function imageBytes(url: string) {
  const bytes = decodeImage(url),
    checked = imageURL(bytes)
  if (!url.startsWith(`data:${checked.mime};`)) throw new Error('素材图片格式不一致')
  return {
    bytes,
    extension:
      checked.mime === 'image/png' ? 'png' : checked.mime === 'image/webp' ? 'webp' : 'jpg',
  }
}
function referenceMetadata(reference: ReferenceMetadata): ReferenceMetadata {
  if (!validId(reference.id) || !['png', 'jpg', 'webp'].includes(reference.extension))
    throw new Error('参考图信息已损坏')
  for (const dimension of [reference.width, reference.height])
    if (!Number.isInteger(dimension) || dimension < 1 || dimension > 8192)
      throw new Error('参考图尺寸无效')
  if (
    !Number.isInteger(reference.bytes) ||
    reference.bytes < 1 ||
    reference.bytes > 8 * 1024 * 1024
  )
    throw new Error('参考图大小无效')
  return {
    id: reference.id,
    extension: reference.extension,
    name: text(reference.name, 255),
    width: reference.width,
    height: reference.height,
    bytes: reference.bytes,
  }
}
function createImageLibrary(directory: string) {
  const referenceDirectory = path.join(directory, 'references')
  function readEntry(id: string): LibraryEntry {
    if (!validId(id)) throw new Error('素材编号无效')
    const file = path.join(directory, `${id}.json`)
    if (fs.statSync(file).size > 160 * 1024) throw new Error('素材信息过大')
    return parseLibraryEntry(JSON.parse(fs.readFileSync(file, 'utf8')) as unknown, id)
  }

  function atomicWrite(file: string, bytes: string | Uint8Array) {
    const temporary = `${file}.${randomUUID()}.tmp`
    try {
      fs.writeFileSync(temporary, bytes, { flag: 'wx' })
      fs.renameSync(temporary, file)
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
    }
  }
  function save(input: LibrarySaveInput) {
    const info = metadata(input),
      image = imageBytes(input.url),
      thumb = imageBytes(input.thumbnail)
    if (thumb.extension !== 'png' || thumb.bytes.length > 256 * 1024)
      throw new Error('素材缩略图无效或过大')
    const sources = validateReferences(input.referenceImages)
    const references = sources.map((source, index) => {
      const original = input.referenceImages![index]
      return referenceMetadata({
        id: createHash('sha256').update(source.data).digest('hex'),
        extension: source.mime === 'image/jpeg' ? 'jpg' : source.mime.slice(6),
        name: original.name || `参考图 ${index + 1}`,
        width: original.width,
        height: original.height,
        bytes: source.bytes,
      })
    })
    const referencesStored = Array.isArray(input.referenceImages)
    // 相同图片、用途和生成说明复用同一条记录，避免恢复草稿时重复归档。
    const hash = createHash('sha256').update(image.bytes).update(JSON.stringify(info))
    if (referencesStored) hash.update(JSON.stringify({ references }))
    const id = hash.digest('hex')
    fs.mkdirSync(directory, { recursive: true })
    const entry = {
      ...info,
      id,
      extension: image.extension,
      bytes: image.bytes.length,
      createdAt: new Date().toISOString(),
      references,
      referencesStored,
    }
    const record = path.join(directory, `${id}.json`)
    if (sources.length) fs.mkdirSync(referenceDirectory, { recursive: true })
    for (const [index, source] of sources.entries()) {
      const reference = references[index],
        file = path.join(referenceDirectory, `${reference.id}.${reference.extension}`)
      // 共享参考图按内容去重，整套图标只保存一份；损坏或缺失时可以重试修复。
      if (
        !fs.existsSync(file) ||
        fs.statSync(file).size !== source.bytes ||
        createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== reference.id
      )
        atomicWrite(file, source.data)
    }
    if (fs.existsSync(record)) {
      const existing = readEntry(id)
      if (
        fs.existsSync(path.join(directory, `${id}.${existing.extension}`)) &&
        fs.existsSync(path.join(directory, `${id}.thumb.png`))
      )
        return { entry: existing }
    }
    atomicWrite(path.join(directory, `${id}.${image.extension}`), image.bytes)
    atomicWrite(path.join(directory, `${id}.thumb.png`), thumb.bytes)
    atomicWrite(record, JSON.stringify(entry, null, 2))
    return { entry }
  }
  function list(input: { offset?: number } = {}) {
    const offset = Number.isInteger(input.offset!) && input.offset! >= 0 ? input.offset! : 0
    if (!fs.existsSync(directory))
      return { entries: [], total: 0, offset: 0, directory, skipped: 0 }
    const entries: LibraryEntry[] = []
    let skipped = 0
    for (const file of fs.readdirSync(directory)) {
      if (!/^[a-f0-9]{64}\.json$/.test(file)) continue
      try {
        const entry = readEntry(file.slice(0, -5))
        if (!fs.existsSync(path.join(directory, `${entry.id}.${entry.extension}`)))
          throw new Error('素材原图不存在')
        entries.push(entry)
      } catch {
        skipped++
      }
    }
    entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
    const start = Math.min(offset, Math.max(0, Math.floor((entries.length - 1) / 12) * 12))
    return {
      entries: entries.slice(start, start + 12).map((entry) => {
        let thumbnail = ''
        try {
          const file = path.join(directory, `${entry.id}.thumb.png`)
          if (fs.statSync(file).size <= 256 * 1024)
            thumbnail = `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`
        } catch {
          /* 原图仍可选用；缺失缩略图不影响其他素材。 */
        }
        return { ...entry, thumbnail }
      }),
      total: entries.length,
      offset: start,
      directory,
      skipped,
    }
  }
  function read(id: string) {
    const entry = readEntry(id),
      file = path.join(directory, `${id}.${entry.extension}`)
    if (fs.statSync(file).size > 8 * 1024 * 1024) throw new Error('素材原图超过 8 MB')
    return { entry, image: imageURL(fs.readFileSync(file)) }
  }
  function readReferences(id: string) {
    const entry = readEntry(id)
    const referenceImages = entry.references.map((reference) => {
      const file = path.join(referenceDirectory, `${reference.id}.${reference.extension}`)
      if (!fs.existsSync(file))
        throw new Error(`参考图「${reference.name}」缺失，请重新添加原图或恢复 data 文件夹`)
      if (fs.statSync(file).size !== reference.bytes)
        throw new Error('参考图文件已损坏，请重新添加原图')
      const bytes = fs.readFileSync(file)
      if (createHash('sha256').update(bytes).digest('hex') !== reference.id)
        throw new Error('参考图文件已损坏，请重新添加原图')
      const image = imageURL(bytes)
      if (
        image.mime !==
        (reference.extension === 'jpg' ? 'image/jpeg' : `image/${reference.extension}`)
      )
        throw new Error('参考图格式已损坏')
      return { name: reference.name, width: reference.width, height: reference.height, ...image }
    })
    return { referenceImages, referencesStored: entry.referencesStored }
  }
  return { save, list, read, readReferences, directory }
}
export { createImageLibrary }
