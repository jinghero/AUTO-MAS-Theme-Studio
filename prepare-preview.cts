const fs = require('node:fs') as typeof import('node:fs')
const path = require('node:path') as typeof import('node:path')
const { createRequire } = require('node:module') as typeof import('node:module')
const repo = process.env.AUTO_MAS_REPO || path.resolve(__dirname, '../AUTO-MAS')
const dep = createRequire(path.join(__dirname, 'package.json'))
const target = path.join(__dirname, 'preview-src')
for (const name of [
  'components/AppLayout.vue',
  'components/appearanceMenuIcon.ts',
  'components/inspira/ParticlesBg.vue',
  'views/home/components/HomeCommandCard.vue',
  'views/home/components/HomeQuickActionsCard.vue',
  'views/home/components/ShatterText.vue',
  'styles/appearanceSurfaces.css',
  'assets/AUTO-MAS.ico',
]) {
  const output = path.join(target, name)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  if (name.endsWith('.vue') || name.endsWith('.ts')) {
    let source = fs.readFileSync(path.join(repo, 'frontend/src', name), 'utf8')
    source = source
      .replaceAll('../composables/useTheme.ts', '../theme')
      .replaceAll('../composables/useRouteLock.ts', '../route-lock')
      .replaceAll('@/views/UpdateDownloadDev.vue', '@/ComponentPreview.vue')
      .replaceAll('@/composables/useTheme', '@/theme')
      .replaceAll('@/stores/performance', '@/performance')
    fs.writeFileSync(output, source)
  } else fs.copyFileSync(path.join(repo, 'frontend/src', name), output)
}
// 词表直接来自 MAS，保持菜单和主页标题一致。
const ts = dep('typescript') as typeof import('typescript')
const translations = fs.readFileSync(path.join(repo, 'frontend/src/i18n/locales/zh-CN.ts'), 'utf8')
const moduleSource = ts.transpileModule(translations, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText
const holder = { exports: {} as { default: { comp: unknown; home: unknown } } }
new Function('exports', 'module', moduleSource)(holder.exports, holder)
const { comp, home } = holder.exports.default
fs.writeFileSync(path.join(target, 'messages.json'), JSON.stringify({ comp, home }, null, 2))
// 保留原始上游文件，便于检查预览适配只替换了无后端的依赖入口。
fs.mkdirSync(path.join(target, 'source-reference'), { recursive: true })
for (const name of ['AppLayout.vue', 'TitleBar.vue'])
  fs.copyFileSync(
    path.join(repo, 'frontend/src/components', name),
    path.join(target, 'source-reference', name),
  )
fs.copyFileSync(
  path.join(repo, 'frontend/src/composables/useTheme.ts'),
  path.join(target, 'source-reference/useTheme.ts'),
)
fs.copyFileSync(
  path.join(repo, 'frontend/src/composables/appearanceBackground.ts'),
  path.join(target, 'appearanceBackground.ts'),
)
// 桌宠工具完整源码已包含在 app/mascot-tool，不依赖原临时目录。
console.log(
  'Prepared MAS layout, home components, and locale; mascot previewer is included in app/mascot-tool',
)
