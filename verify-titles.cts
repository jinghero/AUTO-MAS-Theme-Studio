if (!process.env.STUDIO_QA_DIR || !process.env.STUDIO_DATA_DIR)
  throw new Error('请通过 npm run check 或对应的 check:* 命令运行验证')
const fs = require('node:fs') as typeof import('node:fs')
const path = require('node:path') as typeof import('node:path')
const assert: typeof import('node:assert/strict') = require('node:assert/strict')
const electron = {
  launch: async (options: Parameters<typeof import('@playwright/test')._electron.launch>[0]) =>
    (await import('./tools/verification.mts')).launch(options),
}
const { buildPackage, readPackage } =
  require('./.build/app/package-service.cjs') as typeof import('./src/package-service.cjs')
const { validateAppearanceManifest } =
  require('./.build/app/compat/appearanceService') as typeof import('./src/compat/appearanceService.js')
const root = __dirname,
  qa = process.env.STUDIO_QA_DIR!
const packaged = process.argv.includes('--packaged')
fs.mkdirSync(qa, { recursive: true })
const legacy: import('./src/types/studio').Manifest = {
  formatVersion: 1,
  id: 'title-check',
  name: '标题色检查',
  mode: 'light',
  tokens: { colorPrimary: '#548466' },
}
const independent = { ...legacy, tokens: { ...legacy.tokens, colorPageTitle: '#244A38' } }
assert.equal(validateAppearanceManifest(independent).tokens.colorPageTitle, '#244a38')
assert.throws(() =>
  validateAppearanceManifest({ ...legacy, tokens: { ...legacy.tokens, colorPageTitle: '#123' } }),
)
assert(
  !JSON.stringify(
    readPackage(buildPackage({ manifest: legacy, assets: {} }).bytes).manifest,
  ).includes('colorPageTitle'),
)
assert.equal(
  readPackage(buildPackage({ manifest: independent, assets: {} }).bytes).manifest.tokens
    .colorPageTitle,
  '#244a38',
)
console.log('PASS 可选标题色校验、非法颜色拒绝、新旧主题 ZIP 往返')

async function verify() {
  const sandbox = fs.mkdtempSync(path.join(qa, 'titles-'))
  const source = packaged ? path.join(root, 'dist/MAS创作工具箱') : path.join(root, '.build/app')
  const target = path.join(sandbox, packaged ? 'portable' : 'app')
  fs.cpSync(source, target, {
    recursive: true,
    filter: (file) => path.relative(source, file).split(path.sep)[0] !== 'data',
  })
  const executablePath = packaged ? path.join(target, 'MAS主题工坊.exe') : require('electron')
  const fixture = path.join(sandbox, 'legacy.zip'),
    output = path.join(sandbox, 'export.zip')
  fs.writeFileSync(fixture, buildPackage({ manifest: legacy, assets: {} }).bytes)
  let application
  try {
    application = await electron.launch({ executablePath, args: packaged ? [] : [target] })
    let page = await application.firstWindow()
    await page.waitForFunction(() =>
      Boolean((document.getElementById('name') as HTMLInputElement)?.value),
    )
    await page.locator('#theme-file').setInputFiles(fixture)
    await page.locator('#confirm-ok').click()
    await page.waitForFunction(
      () => (document.getElementById('name') as HTMLInputElement).value === '标题色检查',
    )
    await page.locator('[data-tab="design"]').click()
    await page.locator('#preview-page-title').click()
    let frame = page.frameLocator('#mas-preview-frame')
    await frame.locator('.page-title').waitFor()
    assert.equal(await page.locator('#text-colorBgContainer').inputValue(), '#ffffff')
    assert.equal(
      await frame.locator('body').evaluate((node) => getComputedStyle(node).backgroundColor),
      'rgb(245, 245, 245)',
    )
    assert.equal(
      await frame
        .locator('.ant-btn-primary')
        .first()
        .evaluate((node) => getComputedStyle(node).backgroundColor),
      'rgb(84, 132, 102)',
    )
    assert.equal(await page.locator('#page-title-enabled').isChecked(), false)
    assert(
      (
        await frame
          .locator('.page-title')
          .evaluate((node) => getComputedStyle(node).backgroundImage)
      ).includes('linear-gradient'),
    )
    await page.locator('#page-title-enabled').check()
    await page.locator('#text-page-title').fill('#244a38')
    await page.locator('#text-page-title').press('Tab')
    await frame.locator('.page-title').filter({ hasText: '计划管理' }).waitFor()
    await page.waitForFunction(
      () =>
        document
          .querySelector<HTMLIFrameElement>('#mas-preview-frame')!
          .contentDocument!.documentElement.style.getPropertyValue('--app-page-title-color') ===
        '#244a38',
    )
    assert.equal(
      await frame.locator('.page-title').evaluate((node) => getComputedStyle(node).backgroundColor),
      'rgb(36, 74, 56)',
    )
    const button = frame.locator('.ant-btn-primary').first()
    assert.notEqual(
      await button.evaluate((node) => getComputedStyle(node).backgroundColor),
      'rgb(36, 74, 56)',
    )
    assert.notEqual(
      await frame.locator('.ant-card-head-title').evaluate((node) => getComputedStyle(node).color),
      'rgb(36, 74, 56)',
    )
    await page.locator('#text-page-title').fill('bad')
    await page.locator('#text-page-title').press('Tab')
    assert.equal(await page.locator('#text-page-title').inputValue(), '#244a38')
    for (const mode of ['dark', 'light']) {
      await page.locator(`#mode-${mode}`).click()
      assert.equal(await page.locator('#page-title-enabled').isChecked(), true)
      assert.equal(await page.locator('#text-page-title').inputValue(), '#244a38')
    }
    await page
      .locator('.palette')
      .filter({ has: page.locator('i') })
      .nth(2)
      .click()
    assert.equal(await page.locator('#text-page-title').inputValue(), '#244a38')
    await page.locator('[data-tab="info"]').click()
    await page.locator('[data-tab="design"]').click()
    await page.locator('#preview-page-title').scrollIntoViewIfNeeded()
    await page.evaluate(() => {
      ;(document.getElementById('toast') as HTMLElement).hidden = true
    })
    await page.screenshot({ path: path.join(qa, packaged ? 'title-portable.png' : 'title.png') })
    await page.waitForFunction(() =>
      (document.getElementById('draft-status') as HTMLElement).textContent!.startsWith(
        '草稿已保存',
      ),
    )
    assert.equal(
      await page.evaluate(async () => {
        const result = await window.studio.loadDraft()
        return result.success ? result.state?.manifest.tokens.colorPageTitle : undefined
      }),
      '#244a38',
    )
    await page.reload()
    await page.waitForFunction(
      () => (document.getElementById('name') as HTMLInputElement)?.value === '标题色检查',
    )
    await page.locator('[data-tab="design"]').click()
    assert.equal(await page.locator('#page-title-enabled').isChecked(), true)
    await page.locator('#preview-page-title').click()
    frame = page.frameLocator('#mas-preview-frame')
    await frame.locator('.page-title').waitFor()
    await application.evaluate(({ dialog }, output) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: output })
    }, output)
    await page.locator('#export').click()
    await page.waitForFunction(() =>
      (document.getElementById('validation') as HTMLElement).textContent!.includes('已导出'),
    )
    assert.equal(readPackage(fs.readFileSync(output)).manifest.tokens.colorPageTitle, '#244a38')
    await page.locator('#page-title-enabled').uncheck()
    await page.waitForFunction(
      () =>
        !document
          .querySelector<HTMLIFrameElement>('#mas-preview-frame')!
          .contentDocument!.documentElement.style.getPropertyValue('--app-page-title-color'),
    )
    assert(
      (
        await frame
          .locator('.page-title')
          .evaluate((node) => getComputedStyle(node).backgroundImage)
      ).includes('linear-gradient'),
    )
    assert(!JSON.parse(await page.locator('#manifest-json').textContent()).tokens.colorPageTitle)
    await page.locator('#page-title-enabled').check()
    await page.locator('#mas-default-colors').click()
    assert.equal(await page.locator('#page-title-enabled').isChecked(), false)
    assert(!JSON.parse(await page.locator('#manifest-json').textContent()).tokens.colorPageTitle)
    await page.waitForFunction(
      () =>
        !document
          .querySelector<HTMLIFrameElement>('#mas-preview-frame')!
          .contentDocument!.documentElement.style.getPropertyValue('--app-page-title-color'),
    )
    assert(
      (
        await frame
          .locator('.page-title')
          .evaluate((node) => getComputedStyle(node).backgroundImage)
      ).includes('linear-gradient'),
    )
    console.log('PASS 标题独立配色、按钮和卡片不变、明暗模式、配色切换、草稿恢复、导出与清除')
  } finally {
    if (application) await application.close()
  }
}
verify().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
