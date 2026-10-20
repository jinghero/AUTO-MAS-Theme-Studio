if (!process.env.STUDIO_QA_DIR || !process.env.STUDIO_DATA_DIR)
  throw new Error('请通过 npm run check 或对应的 check:* 命令运行验证')
const fs = require('node:fs') as typeof import('node:fs')
const path = require('node:path') as typeof import('node:path')
const assert: typeof import('node:assert/strict') = require('node:assert/strict')
const { createRequire } = require('node:module') as typeof import('node:module')
const dep = createRequire(path.join(__dirname, 'package.json'))
const electron = {
  launch: async (options: Parameters<typeof import('@playwright/test')._electron.launch>[0]) =>
    (await import('./tools/verification.mts')).launch(options),
}
const AdmZip = dep('adm-zip') as typeof import('adm-zip')
const { readPackage, buildPackage } =
  require('./.build/app/package-service.cjs') as typeof import('./src/package-service.cjs')
const root = __dirname,
  qa = process.env.STUDIO_QA_DIR!
const sample = fs.readFileSync(path.join(root, '示例主题-林间来信.zip'))
const valid = readPackage(sample)
function rejects(label, change) {
  const state = structuredClone(valid)
  change(state)
  assert.throws(() => buildPackage(state))
  console.log('PASS', label)
}
rejects('背景透明度越界', (state) => {
  state.manifest.background.opacity = 2
})
rejects('光标热点在图片之外', (state) => {
  state.manifest.cursors.default.hotspotX = 63
})
rejects('光标使用非 PNG', (state) => {
  state.manifest.cursors.default.path = 'assets/not-png.webp'
})
rejects('路径穿越', (state) => {
  state.manifest.background.path = 'assets/../evil.png'
})
rejects('错误的图片内容', (state) => {
  state.assets[state.manifest.background.path] = 'data:image/png;base64,YmFk'
})
rejects('主题色非法', (state) => {
  state.manifest.tokens.colorPrimary = 'red'
})
const tooMany = new AdmZip(sample)
for (let i = 0; i < 33; i++)
  tooMany.addFile(`assets/extra${i}.png`, fs.readFileSync(path.join(qa, 'cursor.png')))
assert.throws(() => readPackage(tooMany.toBuffer()), /文件数量/)
console.log('PASS ZIP 文件数量超限')
const nested = new AdmZip()
nested.addFile('folder/theme.json', Buffer.from(JSON.stringify(valid.manifest)))
assert.throws(() => readPackage(nested.toBuffer()), /根目录/)
const extra = new AdmZip(sample)
extra.addFile('assets/extra.png', fs.readFileSync(path.join(qa, 'cursor.png')))
assert.throws(() => readPackage(extra.toBuffer()), /未声明/)
console.log('PASS 外层目录和未声明资源拒绝')
const mixed = structuredClone(valid)
mixed.manifest.background!.path = 'assets/' + mixed.manifest.background!.path.slice(7).toUpperCase()
assert.equal(buildPackage(mixed).manifest.background!.path, mixed.manifest.background!.path)
console.log('PASS 原主题资源路径大小写兼容')

async function verifyUI() {
  const application = await electron.launch({
    executablePath: dep('electron'),
    args: [path.join(root, '.build/app')],
  })
  const page = await application.firstWindow()
  try {
    await page.waitForFunction(() =>
      Boolean((document.getElementById('name') as HTMLInputElement)?.value),
    )
    await application.evaluate(({ dialog }) => {
      dialog.showSaveDialog = async () => ({ canceled: true, filePath: '' })
    })
    await page.locator('#export').click()
    await page.waitForFunction(
      () => !(document.getElementById('export') as HTMLButtonElement).disabled,
    )
    assert.equal(await page.locator('#confirm-dialog').isVisible(), false)
    console.log('PASS 取消导出后继续编辑')
    await page.locator('[data-tab="design"]').click()
    await page.locator('#background-slot .remove').click()
    assert.equal(await page.locator('#background-controls').isVisible(), false)
    await page.locator('[data-tab="check"]').click()
    await page.locator('#validate').click()
    await page.waitForFunction(() =>
      (document.getElementById('validation') as HTMLElement).textContent!.includes('校验通过'),
    )
    console.log('PASS 移除背景后的清理与重新校验')
    await page.locator('#theme-file').setInputFiles(path.join(root, '示例主题-林间来信.zip'))
    await page.locator('#confirm-ok').click()
    await page.waitForFunction(() =>
      (document.getElementById('draft-status') as HTMLElement).textContent!.includes('草稿已保存'),
    )
    await page.locator('[data-tab="assets"]').click()
    const promise = page.waitForEvent('filechooser')
    await page.locator('#cursor-slot .asset-buttons button').first().click()
    await (await promise).setFiles(path.join(qa, 'background.png'))
    await page.waitForFunction(() =>
      (document.getElementById('toast') as HTMLElement).textContent!.includes('64 × 64'),
    )
    console.log('PASS 过大光标有明确错误且保留原光标')
    await page.locator('[data-tab="info"]').click()
    await page.evaluate(() => {
      ;(document.getElementById('toast') as HTMLElement).hidden = true
    })
    await page.screenshot({ path: path.join(qa, 'final-preview.png') })
  } finally {
    await application.close()
  }
}
verifyUI().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
