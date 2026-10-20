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
const { readPackage } =
  require('./.build/app/package-service.cjs') as typeof import('./src/package-service.cjs')
const root = __dirname,
  qa = process.env.STUDIO_QA_DIR!
const packaged = process.argv.includes('--packaged')
const original = process.env.THEME_FIXTURE || path.join(root, '示例主题-林间来信.zip')
const expected = readPackage(fs.readFileSync(original))
const output = path.join(qa, packaged ? 'theme-portable-roundtrip.zip' : 'theme-roundtrip.zip')
async function verify() {
  const application = await electron.launch({
    executablePath: packaged
      ? path.join(root, 'dist/MAS创作工具箱/MAS主题工坊.exe')
      : dep('electron'),
    args: packaged ? [] : [path.join(root, '.build/app')],
  })
  const page = await application.firstWindow()
  try {
    await page.waitForFunction(() =>
      Boolean((document.getElementById('name') as HTMLInputElement)?.value),
    )
    await page.locator('#theme-file').setInputFiles(original)
    await page.locator('#confirm-dialog').waitFor({ state: 'visible' })
    await page.locator('#confirm-ok').click()
    await page.waitForFunction(
      (name) => (document.getElementById('name') as HTMLInputElement).value === name,
      expected.manifest.name,
    )
    assert.equal(
      await page.locator('#asset-count').textContent(),
      String(Object.keys(readPackage(fs.readFileSync(original)).assets).length),
    )
    assert(
      (
        await page
          .frameLocator('#mas-preview-frame')
          .locator('.mas-background')
          .evaluate((node) => getComputedStyle(node).backgroundImage)
      ).includes('blob:'),
    )
    await page.waitForFunction(
      () =>
        (document.getElementById('preview-mascot') as HTMLCanvasElement).width > 0 &&
        !(document.getElementById('preview-mascot') as HTMLCanvasElement).hidden,
    )
    await page.locator('[data-tab="check"]').click()
    await page.locator('#validate').click()
    await page.waitForFunction(() =>
      (document.getElementById('validation') as HTMLElement).textContent!.includes('校验通过'),
    )
    await application.evaluate(({ dialog }, output) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: output })
    }, output)
    await page.locator('#export-panel').click()
    await page.waitForFunction(() =>
      (document.getElementById('validation') as HTMLElement).textContent!.includes('已导出'),
    )
    const before = readPackage(fs.readFileSync(original)),
      after = readPackage(fs.readFileSync(output))
    assert.deepEqual(after.manifest, before.manifest)
    assert.deepEqual(after.assets, before.assets)
    console.log('PASS 主题包打开、背景预览、动画、素材校验与导出完全保留')
    await page.locator('[data-tab="info"]').click()
    await page.evaluate(() => {
      ;(document.getElementById('toast') as HTMLElement).hidden = true
    })
    await page.screenshot({ path: path.join(qa, packaged ? 'theme-portable.png' : 'theme.png') })
    const webp = await page.evaluate(async (data) => {
      const image = new Image()
      image.src = data
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = 640
      canvas.height = 360
      canvas.getContext('2d')!.drawImage(image, 0, 0, 640, 360)
      return canvas.toDataURL('image/webp', 0.85)
    }, before.assets[before.manifest.background!.path])
    const jpeg = await page.evaluate(async (data) => {
      const image = new Image()
      image.src = data
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = 640
      canvas.height = 360
      canvas.getContext('2d')!.drawImage(image, 0, 0, 640, 360)
      return canvas.toDataURL('image/jpeg', 0.85)
    }, webp)
    for (const [name, url] of [
      ['sample.webp', webp],
      ['sample.jpg', jpeg],
    ]) {
      const info = await page.evaluate(
        async ({ name, url }) => window.themeImages.inspect(url, name),
        { name, url },
      )
      assert(info.width > 0 && info.height > 0)
    }
    console.log('PASS WebP 与 JPEG 使用同一浏览器解码路径验证')
  } finally {
    await application.close()
  }
}
verify().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
