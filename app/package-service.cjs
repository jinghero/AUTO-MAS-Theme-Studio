const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const AdmZip = require('adm-zip')
const { readAppearancePackage, validateAppearanceManifest } = require('./compat/appearanceService')
const { AssetPackageStore, normalizePackageInfo } = require('./compat/assetPackageService')
const { normalizeMascot, validateMascotAssets, mascotAssetPaths } = require('./compat/mascotManifest')

const LIMIT = 8 * 1024 * 1024
const mascotStore = new AssetPackageStore({
  directoryName: 'mascots', manifestName: 'mascot.json',
  normalize(raw) {
    const info = normalizePackageInfo(raw, 'mascot.json')
    const mascot = normalizeMascot(raw.mascot)
    if (!mascot) throw new Error('桌宠包缺少桌宠素材')
    return { ...info, mascot }
  },
  referencedPaths: manifest => [...mascotAssetPaths(manifest.mascot), ...(manifest.preview ? [manifest.preview] : [])],
  validateAssets: (manifest, read) => validateMascotAssets(manifest.mascot, read),
})

function withArchive(bytes, callback) {
  if (bytes.length > 16 * 1024 * 1024) throw new Error('主题 ZIP 不能超过 16 MB')
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mas-theme-check-'))
  try {
    const target = path.join(directory, 'package.zip')
    fs.writeFileSync(target, bytes)
    return callback(target)
  } finally {
    // 仅删除本函数创建的专属临时目录。
    if (path.dirname(directory) === os.tmpdir() && path.basename(directory).startsWith('mas-theme-check-'))
      fs.rmSync(directory, { recursive: true, force: true })
  }
}

function references(manifest) {
  return [...new Set([
    manifest.background?.path, manifest.preview,
    ...(manifest.mascot ? mascotAssetPaths(manifest.mascot) : []),
    ...Object.values(manifest.menuIcons || {}),
    ...Object.values(manifest.cursors || {}).map(item => item.path),
  ].filter(Boolean))]
}

function decodeImage(url) {
  if (typeof url !== 'string' || url.length > LIMIT * 1.4) throw new Error('图片不能超过 8 MB')
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(url)
  if (!match) throw new Error('图片只支持 PNG、JPEG、WebP')
  const data = Buffer.from(match[2], 'base64')
  if (!data.length || data.length > LIMIT) throw new Error('图片为空或超过 8 MB')
  return data
}

function serialize(result) {
  return { manifest: result.manifest, assets: Object.fromEntries(result.files.map(file => [
    file.path, `data:${file.mime};base64,${file.data.toString('base64')}`,
  ])) }
}

function readPackage(bytes, kind = 'theme') {
  return withArchive(bytes, target => serialize(kind === 'mascot' ? mascotStore.readArchive(target) : readAppearancePackage(target)))
}

function buildPackage(state) {
  const manifest = validateAppearanceManifest(state?.manifest)
  const zip = new AdmZip()
  zip.addFile('theme.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'))
  const paths = references(manifest)
  if (paths.length > 31) throw new Error('图片数量过多，主题包最多包含 31 张图片')
  let total = 0
  for (const name of paths) {
    const sourceKey = Object.keys(state.assets || {}).find(key => key.toLowerCase() === name.toLowerCase())
    const data = decodeImage(state.assets?.[sourceKey])
    total += data.length
    if (total > 32 * 1024 * 1024 - 256 * 1024) throw new Error('图片总大小超过主题包的 32 MB 限制')
    zip.addFile(name, data)
  }
  const bytes = zip.toBuffer()
  const checked = withArchive(bytes, readAppearancePackage)
  return { bytes, manifest: checked.manifest, count: paths.length, imageBytes: total }
}

function buildMascotPackage(state) {
  const theme = validateAppearanceManifest(state?.manifest)
  if (!theme.mascot) throw new Error('请先导入或生成桌宠素材')
  const manifest = { formatVersion: 1, id: `${theme.id.slice(0, 57)}-mascot`, name: `${theme.name}桌宠`.slice(0, 80),
    ...(theme.description ? { description: theme.description } : {}), mascot: theme.mascot, preview: theme.mascot.path }
  const zip = new AdmZip()
  zip.addFile('mascot.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'))
  const paths = [...new Set(mascotAssetPaths(theme.mascot))]
  for (const name of paths) {
    const key = Object.keys(state.assets || {}).find(key => key.toLowerCase() === name.toLowerCase())
    zip.addFile(name, decodeImage(state.assets?.[key]))
  }
  const bytes = zip.toBuffer()
  withArchive(bytes, target => mascotStore.readArchive(target))
  return { bytes, manifest, count: paths.length }
}
module.exports = { readPackage, buildPackage, buildMascotPackage, references, decodeImage }
