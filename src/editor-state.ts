import type { StudioState, Manifest } from './types/studio'
export const tokenLabels = {
  colorPrimary: '主题色',
  colorBgLayout: '页面底色',
  colorBgContainer: '卡片底色',
  colorBgElevated: '浮层底色',
  colorText: '主要文字',
  colorTextSecondary: '辅助文字',
  colorBorder: '主要边框',
  colorBorderSecondary: '次要边框',
}
export const palettes = [
  { name: 'MAS 默认', colors: ['#1677ff', '#e6f4ff', '#f5f5f5'] },
  { name: '林间', colors: ['#548466', '#d5e3bf', '#f1f5ed'] },
  { name: '海盐', colors: ['#498a9c', '#c9e2e7', '#edf5f8'] },
  { name: '暮紫', colors: ['#8b72ad', '#ddcfeb', '#f5f0f9'] },
  { name: '陶土', colors: ['#b07860', '#e9d5c4', '#f9f2eb'] },
  { name: '玫瑰', colors: ['#b16f88', '#ebcdd9', '#fbf0f4'] },
]
export function newState(now = Date.now()): StudioState {
  return {
    manifest: {
      formatVersion: 1,
      id: `my-theme-${now.toString(36)}`,
      name: '我的主题',
      mode: 'light',
      tokens: { colorPrimary: '#1677ff' },
    },
    assets: {},
  }
}
export function hexValue(value: string, base = '#ffffff') {
  if (/^#[\da-f]{6}$/i.test(value)) return value
  const match = /^rgba?\(([^)]+)\)/.exec(value)
  if (!match) return '#000000'
  const [r, g, b, a = 1] = match[1].split(',').map(Number)
  const backdrop = /^#[\da-f]{6}$/i.test(base) ? base : '#ffffff'
  return (
    '#' +
    [r, g, b]
      .map((part, index) =>
        Math.round(part * a + parseInt(backdrop.slice(1 + index * 2, 3 + index * 2), 16) * (1 - a))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  )
}
export function refPaths(manifest: Manifest) {
  return [
    ...new Set(
      [
        manifest.background?.path,
        manifest.preview,
        manifest.mascot?.path,
        manifest.mascot?.animation?.path,
        manifest.mascot?.animation?.resultPath,
        manifest.mascot?.animation?.dragPath,
        manifest.mascot?.animation?.lookPath,
        ...Object.values(manifest.menuIcons || {}),
        ...Object.values(manifest.cursors || {}).map((item) => item.path),
      ].filter((value): value is string => Boolean(value)),
    ),
  ]
}
export function asset(state: StudioState, name?: string) {
  if (!name) return ''
  return (
    state.assets[name] ||
    state.assets[
      Object.keys(state.assets).find((key) => key.toLowerCase() === name.toLowerCase())!
    ] ||
    ''
  )
}
export function prune(state: StudioState) {
  const used = new Set(refPaths(state.manifest).map((name) => name.toLowerCase()))
  for (const name of Object.keys(state.assets))
    if (!used.has(name.toLowerCase())) delete state.assets[name]
}
export function bytesSize(bytes: number) {
  return bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`
}
export function totalBytes(state: StudioState) {
  return Object.values(state.assets).reduce(
    (sum, url) => sum + Math.floor((url.split(',')[1]?.length || 0) * 0.75),
    0,
  )
}
