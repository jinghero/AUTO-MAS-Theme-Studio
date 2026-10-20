const fs = require('node:fs') as typeof import('node:fs')
const path = require('node:path') as typeof import('node:path')
const { createRequire } = require('node:module') as typeof import('node:module')
const dep = createRequire(path.join(__dirname, 'package.json'))
const AdmZip = dep('adm-zip') as typeof import('adm-zip')
const asar = dep('@electron/asar') as typeof import('@electron/asar')
const root = __dirname
async function build() {
  const { createStage, discardStage } = await import('./tools/build-output.mts')
  const output = createStage(root, 'portable')
  try {
    // 将运行时 ZIP 依赖带入 app.asar，便携版不依赖开发目录。
    const vendor = path.join(root, '.build/app/node_modules/adm-zip')
    fs.mkdirSync(path.dirname(vendor), { recursive: true })
    fs.cpSync(path.dirname(dep.resolve('adm-zip')), vendor, { recursive: true })
    fs.mkdirSync(output, { recursive: true })
    const runtime = path.join(path.dirname(dep.resolve('electron')), 'dist')
    fs.cpSync(runtime, output, {
      recursive: true,
      filter: (file) => path.basename(file) !== 'default_app.asar',
    })
    const executable = path.join(output, 'MAS主题工坊.exe')
    if (fs.existsSync(executable)) fs.unlinkSync(executable)
    fs.renameSync(path.join(output, 'electron.exe'), executable)
    await asar.createPackage(
      path.join(root, '.build/app'),
      path.join(output, 'resources', 'app.asar'),
    )
    for (const name of ['使用说明.txt', 'guide.md', '示例主题-林间来信.zip', '示例桌宠.zip'])
      fs.copyFileSync(path.join(root, name), path.join(output, name))
    fs.cpSync(path.join(root, 'docs'), path.join(output, 'docs'), { recursive: true })
    fs.copyFileSync(path.join(root, 'app/LICENSE'), path.join(output, 'LICENSE-AGPL-3.0.txt'))
    fs.copyFileSync(
      path.join(root, '.build/app/node_modules/adm-zip/LICENSE'),
      path.join(output, 'LICENSE-adm-zip.txt'),
    )
    fs.copyFileSync(path.join(root, 'src/compat/SOURCE.txt'), path.join(output, '兼容版本.txt'))
    const source = new AdmZip()
    source.addLocalFolder(
      path.join(root, 'app'),
      'app',
      (name) => !name.split(/[\\/]/).includes('node_modules'),
    )
    source.addLocalFolder(path.join(root, 'src'), 'src')
    source.addLocalFolder(path.join(root, 'preview-src'), 'preview-src')
    source.addLocalFolder(path.join(root, '.github'), '.github')
    source.addLocalFolder(path.join(root, 'tools'), 'tools')
    source.addLocalFolder(path.join(root, 'tests'), 'tests')
    source.addLocalFolder(path.join(root, 'docs'), 'docs')
    const sourceFiles = [
      ...fs.readdirSync(root).filter((name) => /\.(cts|mts)$/.test(name)),
      'package.json',
      'package-lock.json',
      'tsconfig.json',
      'tsconfig.scripts.json',
      'tsconfig.preview.json',
      'tsconfig.node.json',
      'tsconfig.renderer.json',
      '.prettierrc.json',
      '.prettierignore',
      'README.md',
      'guide.md',
      'LICENSE',
      'THIRD_PARTY_NOTICES.md',
      '.gitignore',
      '使用说明.txt',
      '示例主题-林间来信.zip',
      '示例桌宠.zip',
    ]
    for (const name of sourceFiles) source.addLocalFile(path.join(root, name))
    source.addFile(
      'README.txt',
      Buffer.from(
        '完整 TypeScript 源码位于 src/ 与 preview-src/，app/ 保存静态资源。\n需要 Node.js 22.16 或更新版本，运行 npm ci、npm start。\n类型检查：npm run typecheck；便携版打包：npm run build。\n便携运行无需 Node.js；许可见 LICENSE 和 THIRD_PARTY_NOTICES.md。\n',
      ),
    )
    source.writeZip(path.join(output, 'source.zip'))
    fs.mkdirSync(path.join(root, 'dist'), { recursive: true })
    const zipPath = path.join(root, 'dist', 'MAS创作工具箱-便携版.zip')
    const archive = new AdmZip()
    archive.addLocalFolder(output, 'MAS主题工坊')
    // 开发和验证时产生的 data 不属于分发包。
    for (const entry of archive.getEntries())
      if (entry.entryName.startsWith('MAS主题工坊/data/')) archive.deleteFile(entry)
    archive.writeZip(zipPath)
    const finalOutput = path.join(root, 'dist', 'MAS创作工具箱')
    fs.cpSync(output, finalOutput, { recursive: true })
    console.log(
      JSON.stringify({
        executable: path.join(finalOutput, 'MAS主题工坊.exe'),
        zipPath,
        sizeMiB: +(fs.statSync(zipPath).size / 1024 / 1024).toFixed(1),
      }),
    )
  } finally {
    discardStage(root, output)
  }
}
build().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
