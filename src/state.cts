import type {
  GeneratedImage,
  GeneratorSettings,
  AssetBatch,
  IconResult,
  ImageMetadata,
  LibraryEntry,
  ReferenceImage,
  ReferenceMetadata,
  StudioState,
  Target,
} from './types/studio'
import { validateAppearanceManifest } from './compat/appearanceService'
import { defaults, targetKeys } from './generation'
import { iconSet } from './icons'
import { cursorSet } from './cursors'

type RecordValue = Record<string, unknown>
function object(value: unknown, label: string): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} 需要为对象`)
  return value as RecordValue
}
function text(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} 需要为文本`)
  return value
}
function number(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max)
    throw new Error(`${label} 无效`)
  return value
}
function choice<const T extends readonly string[]>(
  value: unknown,
  values: T,
  label: string,
): T[number] {
  if (typeof value !== 'string' || !values.includes(value)) throw new Error(`${label} 无效`)
  return value as T[number]
}
function strings<const K extends readonly string[]>(
  raw: RecordValue,
  keys: K,
): Partial<Record<K[number], string>> {
  return Object.fromEntries(
    keys.filter((key) => raw[key] !== undefined).map((key) => [key, text(raw[key], key)]),
  ) as Partial<Record<K[number], string>>
}
function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} 需要为布尔值`)
  return value
}
function imageUrl(value: unknown): string {
  const url = text(value, '图片地址')
  if (
    !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(url) ||
    url.length > 12 * 1024 * 1024
  )
    throw new Error('草稿图片数据无效')
  return url
}
const targets = ['background', 'cover', 'icon', 'mascot', 'cursor'] as const
function metadata(raw: RecordValue, fallback?: Target): Omit<ImageMetadata, 'bytes'> {
  return {
    target: choice(raw.target ?? fallback, targets, '素材用途'),
    width: number(raw.width, '图片宽度', 1, 8192),
    height: number(raw.height, '图片高度', 1, 8192),
    ...strings(raw, [
      'iconKey',
      'cursorKey',
      'prompt',
      'basePrompt',
      'iconSubject',
      'cursorSubject',
      'model',
      'style',
    ]),
  }
}
function references(value: unknown): ReferenceMetadata[] {
  if (!Array.isArray(value) || value.length > 4) throw new Error('参考图信息已损坏')
  const items = value.map((value: unknown) => {
    const raw = object(value, '参考图')
    const id = text(raw.id, '参考图编号')
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('参考图信息已损坏')
    return {
      id,
      extension: choice(raw.extension, ['png', 'jpg', 'webp'], '参考图格式'),
      name: text(raw.name, '参考图名称'),
      width: number(raw.width, '参考图宽度', 1, 8192),
      height: number(raw.height, '参考图高度', 1, 8192),
      bytes: number(raw.bytes, '参考图大小', 1, 8 * 1024 * 1024),
    }
  })
  if (items.reduce((sum, item) => sum + item.bytes, 0) > 16 * 1024 * 1024)
    throw new Error('参考图总大小不能超过 16 MB')
  return items
}
function referenceImages(value: unknown): ReferenceImage[] {
  if (!Array.isArray(value) || value.length > 4) throw new Error('参考图信息已损坏')
  const items = value.map((value: unknown) => {
    const raw = object(value, '参考图')
    return {
      name: text(raw.name, '参考图名称'),
      url: imageUrl(raw.url),
      width: number(raw.width, '参考图宽度', 1, 8192),
      height: number(raw.height, '参考图高度', 1, 8192),
      bytes: number(raw.bytes, '参考图大小', 1, 8 * 1024 * 1024),
    }
  })
  if (items.reduce((sum, item) => sum + item.bytes, 0) > 16 * 1024 * 1024)
    throw new Error('参考图总大小不能超过 16 MB')
  return items
}
function generated(value: unknown): GeneratedImage {
  const raw = object(value, '生成结果')
  return {
    ...metadata(raw, 'icon'),
    url: imageUrl(raw.url),
    bytes: number(raw.bytes, '图片大小', 0, 8 * 1024 * 1024),
    ...strings(raw, ['mime', 'libraryId', 'libraryError', 'key']),
    ...(raw.referenceImages === undefined
      ? {}
      : { referenceImages: referenceImages(raw.referenceImages) }),
    ...(raw.references === undefined ? {} : { references: references(raw.references) }),
    ...(raw.referencesStored === undefined
      ? {}
      : { referencesStored: boolean(raw.referencesStored, '参考图归档状态') }),
  }
}
function result(value: unknown): GeneratedImage | AssetBatch {
  const raw = object(value, '生成结果')
  if (raw.kind === undefined) return generated(raw)
  if (
    !['icon-batch', 'cursor-batch'].includes(String(raw.kind)) ||
    !Array.isArray(raw.items) ||
    raw.items.length > 32
  )
    throw new Error('批量图标草稿无效')
  const items: IconResult[] = raw.items.map((value: unknown) => {
    const item = object(value, '图标结果')
    return {
      key: text(item.key, '图标编号'),
      label: text(item.label, '图标名称'),
      status: choice(item.status, ['pending', 'generating', 'ready', 'error'], '图标状态'),
      selected: item.selected === undefined ? true : boolean(item.selected, '图标选择'),
      ...strings(item, ['error', 'libraryId', 'libraryError', 'iconKey', 'cursorKey']),
      ...(item.url === undefined ? {} : { url: imageUrl(item.url) }),
      ...(item.width === undefined ? {} : { width: number(item.width, '图标宽度', 1, 8192) }),
      ...(item.height === undefined ? {} : { height: number(item.height, '图标高度', 1, 8192) }),
      ...(item.bytes === undefined
        ? {}
        : { bytes: number(item.bytes, '图标大小', 0, 8 * 1024 * 1024) }),
      ...(item.archiveSource === undefined ? {} : { archiveSource: generated(item.archiveSource) }),
      ...(item.previewSource === undefined ? {} : { previewSource: generated(item.previewSource) }),
    }
  })
  return {
    kind: raw.kind === 'cursor-batch' ? 'cursor-batch' : 'icon-batch',
    target: raw.kind === 'cursor-batch' ? 'cursor' : 'icon',
    referenceCount: number(raw.referenceCount ?? 0, '参考图数量', 0, 4),
    ...strings(raw, ['inputFingerprint']),
    items,
  }
}
function generator(value: unknown): GeneratorSettings {
  const raw = object(value, '生成设置')
  const settings = {
    ...defaults,
    ...strings(raw, [
      'baseURL',
      'model',
      'style',
      'size',
      'quality',
      'responseFormat',
      'visionModel',
      'visionBaseURL',
      'iconKey',
      'cursorKey',
      'prompt',
    ]),
  }
  settings.target = choice(raw.target ?? defaults.target, targets, '生成用途')
  for (const key of ['transparent', 'visionSeparate', 'iconBatch', 'cursorBatch'] as const)
    if (raw[key] !== undefined) settings[key] = boolean(raw[key], key)
  if (!iconSet.some((icon) => icon.key === settings.iconKey)) settings.iconKey = 'default'
  if (!cursorSet.some((cursor) => cursor.key === settings.cursorKey)) settings.cursorKey = 'default'
  if (raw.cursorPrompts !== undefined)
    settings.cursorPrompts = Object.fromEntries(
      Object.entries(object(raw.cursorPrompts, '光标提示词')).map(([key, value]) => [
        key,
        text(value, '光标提示词'),
      ]),
    )
  if (raw.iconPrompts !== undefined)
    settings.iconPrompts = Object.fromEntries(
      Object.entries(object(raw.iconPrompts, '图标提示词')).map(([key, value]) => [
        key,
        text(value, '图标提示词'),
      ]),
    )
  if (raw.targetPrompts !== undefined) {
    const prompts = object(raw.targetPrompts, '各用途提示词')
    settings.targetPrompts = Object.fromEntries(
      targetKeys
        .filter((key) => prompts[key] !== undefined)
        .map((key) => {
          const item = object(prompts[key], '用途提示词')
          return [key, { style: text(item.style, '灵感风格'), prompt: text(item.prompt, '提示词') }]
        }),
    )
  }
  return settings
}
/** Versionless drafts are migrated in memory; editable IDs and names need not be export-ready. */
export function parseDraft(value: unknown): StudioState {
  const raw = object(value, '草稿')
  if (raw.draftVersion !== undefined && raw.draftVersion !== 1)
    throw new Error('草稿版本不受支持，请使用匹配的工具版本')
  const source = object(raw.manifest, '主题信息')
  const manifest = validateAppearanceManifest({ ...source, id: 'draft-preview', name: '草稿' })
  // Optional tokens stay absent in editable drafts, including across structured-clone IPC.
  manifest.tokens = Object.fromEntries(
    Object.entries(manifest.tokens).filter(([, value]) => value !== undefined),
  ) as StudioState['manifest']['tokens']
  manifest.id = text(source.id, '主题标识')
  manifest.name = text(source.name, '主题名称')
  const assets = Object.fromEntries(
    Object.entries(object(raw.assets, '草稿素材')).map(([key, value]) => [key, imageUrl(value)]),
  )
  return {
    manifest,
    assets,
    ...(raw.generator === undefined ? {} : { generator: generator(raw.generator) }),
    ...(raw.aiResult === undefined || raw.aiResult === null
      ? {}
      : { aiResult: result(raw.aiResult) }),
  }
}
export function serializeDraft(value: unknown): string {
  return JSON.stringify({ ...parseDraft(value), draftVersion: 1 })
}
export function parseLibraryEntry(value: unknown, expectedId: string): LibraryEntry {
  const raw = object(value, '素材信息')
  if (raw.id !== expectedId || !Number.isFinite(Date.parse(text(raw.createdAt, '素材时间'))))
    throw new Error('素材信息已损坏')
  return {
    ...metadata(raw),
    id: expectedId,
    createdAt: text(raw.createdAt, '素材时间'),
    extension: choice(raw.extension, ['png', 'jpg', 'webp'], '素材格式'),
    bytes: number(raw.bytes, '素材大小', 1, 8 * 1024 * 1024),
    references: references(raw.references ?? []),
    referencesStored:
      raw.referencesStored === undefined ? false : boolean(raw.referencesStored, '参考图归档状态'),
  }
}
