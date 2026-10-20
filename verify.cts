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
const { readAppearancePackage, importAppearancePackage, listAppearances } =
  require('./.build/app/compat/appearanceService') as typeof import('./src/compat/appearanceService.js')
const { readPackage, buildPackage } =
  require('./.build/app/package-service.cjs') as typeof import('./src/package-service.cjs')
const root = __dirname,
  qa = process.env.STUDIO_QA_DIR!
fs.mkdirSync(qa, { recursive: true })
const packaged = process.argv.includes('--packaged')
const executable = packaged
  ? path.join(root, 'dist/MAS创作工具箱/MAS主题工坊.exe')
  : dep('electron')
const checks: string[] = []
const ok = (label) => {
  checks.push(label)
  console.log('PASS', label)
}
async function launch() {
  return electron.launch({
    executablePath: executable,
    args: packaged ? [] : [path.join(root, '.build/app')],
    timeout: 30000,
  })
}

async function verify() {
  let application = await launch()
  let page = await application.firstWindow()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  try {
    await page.waitForFunction(() =>
      Boolean((document.getElementById('name') as HTMLInputElement)?.value),
    )
    const generated = await page.evaluate(() => {
      function image(width, height, draw) {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        draw(canvas.getContext('2d')!)
        return canvas.toDataURL('image/png').split(',')[1]
      }
      return {
        background: image(1600, 1000, (context) => {
          const gradient = context.createLinearGradient(0, 0, 0, 1000)
          gradient.addColorStop(0, '#eddfc2')
          gradient.addColorStop(0.65, '#d9dec2')
          gradient.addColorStop(1, '#819a7f')
          context.fillStyle = gradient
          context.fillRect(0, 0, 1600, 1000)
          context.fillStyle = '#fcf2d7'
          context.beginPath()
          context.arc(1240, 235, 120, 0, Math.PI * 2)
          context.fill()
          for (const [color, y, scale] of [
            ['#b8c6a1', 550, 150],
            ['#8da58c', 710, 170],
            ['#597f70', 860, 200],
          ] as const) {
            context.fillStyle = color
            context.beginPath()
            context.moveTo(0, 1000)
            context.lineTo(0, y)
            context.bezierCurveTo(350, y - scale, 400, y + scale, 800, y)
            context.bezierCurveTo(1150, y - scale, 1370, y + scale, 1600, y - 70)
            context.lineTo(1600, 1000)
            context.fill()
          }
        }),
        icon: image(64, 64, (context) => {
          context.fillStyle = '#548466'
          context.beginPath()
          context.roundRect(3, 3, 58, 58, 15)
          context.fill()
          context.fillStyle = '#e8f0d8'
          context.font = '40px Georgia'
          context.textAlign = 'center'
          context.fillText('✦', 32, 46)
        }),
        mascot: image(180, 210, (context) => {
          context.fillStyle = '#e7d3ab'
          context.beginPath()
          context.ellipse(90, 130, 66, 65, 0, 0, Math.PI * 2)
          context.fill()
          context.beginPath()
          context.moveTo(28, 95)
          context.lineTo(28, 35)
          context.lineTo(65, 80)
          context.lineTo(115, 80)
          context.lineTo(151, 35)
          context.lineTo(151, 100)
          context.fill()
          context.fillStyle = '#395647'
          context.beginPath()
          context.arc(65, 124, 5, 0, Math.PI * 2)
          context.arc(115, 124, 5, 0, Math.PI * 2)
          context.fill()
          context.strokeStyle = '#395647'
          context.lineWidth = 3
          context.beginPath()
          context.arc(80, 144, 10, 0, Math.PI)
          context.arc(100, 144, 10, 0, Math.PI)
          context.stroke()
        }),
        cursor: image(24, 24, (context) => {
          context.fillStyle = '#548466'
          context.strokeStyle = '#fff'
          context.lineWidth = 2
          context.beginPath()
          context.moveTo(2, 2)
          context.lineTo(4, 21)
          context.lineTo(10, 15)
          context.lineTo(18, 12)
          context.closePath()
          context.fill()
          context.stroke()
        }),
      }
    })
    for (const [name, base64] of Object.entries(generated))
      fs.writeFileSync(path.join(qa, `${name}.png`), Buffer.from(base64, 'base64'))
    const choose = async (slot, file) => {
      const chooserPromise = page.waitForEvent('filechooser')
      await page.locator(`#${slot}-slot .asset-buttons button`).first().click()
      const chooser = await chooserPromise
      await chooser.setFiles(path.join(qa, file))
      await page.locator(`#${slot}-slot img`).waitFor()
    }
    // New always uses the same explicit confirmation that users see.
    await page.locator('#new').click()
    await page.locator('#confirm-ok').click()
    await page.locator('#name').fill('林间来信')
    await page.locator('#theme-id').fill('forest-letter')
    await page.locator('#description').fill('把一片温柔的山林，留在日常的界面里。')
    await page.locator('[data-tab="design"]').click()
    await choose('background', 'background.png')
    await page.locator('#surface-opacity').fill('78')
    await page.locator('#bg-opacity').fill('85')
    await page.selectOption('#bg-position', 'right bottom')
    await page.locator('#radius').fill('16')
    assert.equal(await page.locator('#radius-value').textContent(), '16 px')
    assert.equal(await page.locator('#surface-opacity-value').textContent(), '78%')
    assert.match(
      await page
        .frameLocator('#mas-preview-frame')
        .locator('.mas-background')
        .evaluate((node) => getComputedStyle(node).backgroundImage),
      /blob:/,
    )
    ok('主题信息、背景导入、透明度、位置与圆角')
    await page.locator('#mode-dark').click()
    assert.equal(await page.locator('#preview-mode-label').textContent(), '深色主题')
    await page.screenshot({ path: path.join(qa, packaged ? 'portable-dark.png' : 'dark.png') })
    await page.locator('#mode-light').click()
    await page.locator('#palettes button[title="海盐"]').click()
    assert.equal(await page.locator('#text-colorPrimary').inputValue(), '#498a9c')
    await page.locator('#palettes button[title="林间"]').click()
    await page.locator('#text-colorPrimary').fill('invalid')
    await page.locator('#text-colorPrimary').blur()
    assert.equal(await page.locator('#text-colorPrimary').inputValue(), '#548466')
    ok('浅深主题切换、配色预设与无效颜色反馈')
    await page.locator('[data-tab="assets"]').click()
    await choose('cover', 'background.png')
    await choose('icon', 'icon.png')
    await page.frameLocator('#mas-preview-frame').locator('.appearance-menu-icon').first().waitFor()
    assert.equal(
      await page.frameLocator('#mas-preview-frame').locator('.appearance-menu-icon').count(),
      10,
    )
    await choose('mascot', 'mascot.png')
    await choose('cursor', 'cursor.png')
    await page.locator('#hotspot-x').fill('3')
    await page.locator('#hotspot-x').blur()
    await page.locator('#hotspot-y').fill('4')
    await page.locator('#hotspot-y').blur()
    await page.waitForFunction(() =>
      (document.getElementById('manifest-json') as HTMLElement).textContent!.includes(
        '"hotspotY": 4',
      ),
    )
    await page.selectOption('#icon-key', 'home')
    await choose('icon', 'cursor.png')
    await page.locator('#icon-slot .remove').click()
    assert.equal(
      await page.frameLocator('#mas-preview-frame').locator('.appearance-menu-icon').count(),
      10,
    )
    ok('封面、默认与独立菜单图标、静态桌宠、光标与热点')
    await page.locator('[data-tab="check"]').click()
    await page.locator('#validate').click()
    await page.waitForFunction(() =>
      (document.getElementById('validation') as HTMLElement).textContent!.includes('校验通过'),
    )
    const output = path.join(qa, packaged ? 'portable-export.zip' : 'export.zip')
    await application.evaluate(({ dialog }, output) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: output })
    }, output)
    await page.locator('#export-panel').click()
    await page.waitForFunction(() =>
      (document.getElementById('validation') as HTMLElement).textContent!.includes('已导出'),
    )
    const manifest = readAppearancePackage(output).manifest
    assert.equal(manifest.background!.surfaceOpacity, 0.78)
    assert.equal(manifest.tokens.borderRadius, 16)
    assert.equal(manifest.cursors!.default!.hotspotX, 3)
    const installedPath = fs.mkdtempSync(path.join(qa, 'installed-'))
    const installed = importAppearancePackage(installedPath, output)
    assert.equal(installed.success, true, installed.error)
    assert.equal(listAppearances(installedPath)[0].name, '林间来信')
    ok('实际 ZIP 导出并由 AUTO-MAS 安装/列表读取全链路校验')
    await page.locator('#theme-file').setInputFiles(output)
    await page.locator('#confirm-ok').click()
    await page.waitForFunction(
      () =>
        (document.getElementById('name') as HTMLInputElement).value === '林间来信' &&
        (document.getElementById('asset-count') as HTMLElement).textContent === '5',
    )
    ok('重新打开导出的主题包并完整保留素材')
    const sample = path.join(root, '示例桌宠.zip')
    await page.locator('[data-tab="assets"]').click()
    await page.locator('#mascot-file').setInputFiles(sample)
    await page.waitForFunction(() =>
      (document.getElementById('animation-note') as HTMLElement).textContent!.includes('已保留'),
    )
    await page.locator('[data-tab="check"]').click()
    await page.locator('#validate').click()
    await page.waitForFunction(() =>
      (document.getElementById('validation') as HTMLElement).textContent!.includes('校验通过'),
    )
    await page.locator('#export-panel').click()
    await page.waitForFunction(() =>
      (document.getElementById('validation') as HTMLElement).textContent!.includes('已导出'),
    )
    const animated = readAppearancePackage(output).manifest
    assert(
      animated.mascot!.animation!.resultPath &&
        animated.mascot!.animation!.dragPath &&
        animated.mascot!.animation!.lookPath,
    )
    // Export fixtures stay in qa; never overwrite the shipped example.
    ok('导入真实动画桌宠 ZIP 并保留全部动作重新导出')
    const state = readPackage(fs.readFileSync(output))
    const backup = structuredClone(state)
    state.manifest.id = 'CON'
    assert.throws(() => buildPackage(state))
    state.manifest.id = 'bad/id'
    assert.throws(() => buildPackage(state))
    assert.throws(() => buildPackage({ manifest: backup.manifest, assets: {} }))
    const broken = new AdmZip()
    broken.addFile('theme.json', Buffer.from('{}'))
    const badPath = path.join(qa, 'invalid.zip')
    broken.writeZip(badPath)
    await page.locator('#theme-file').setInputFiles(badPath)
    await page.waitForFunction(
      () =>
        (document.getElementById('toast') as HTMLElement).classList.contains('error') &&
        (document.getElementById('toast') as HTMLElement).textContent!.includes('版本'),
    )
    ok('保留名、非法标识、缺失素材、损坏主题的拒绝与界面反馈')
    await page.locator('[data-tab="info"]').click()
    await page.screenshot({ path: path.join(qa, packaged ? 'portable-light.png' : 'light.png') })
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1000, 720),
    )
    await page.waitForTimeout(200)
    const overflow = await page.evaluate(() => ({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    assert(overflow.scrollWidth <= overflow.width, JSON.stringify(overflow))
    await page.screenshot({ path: path.join(qa, packaged ? 'portable-small.png' : 'small.png') })
    ok('最小 1000×720 窗口无页面横向溢出')
    // Close immediately after typing to exercise the final draft flush.
    await page.locator('#name').fill('草稿恢复验证')
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
    await application.waitForEvent('close')
    application = await launch()
    page = await application.firstWindow()
    await page.waitForFunction(
      () => (document.getElementById('name') as HTMLInputElement).value === '草稿恢复验证',
    )
    await page.locator('#name').fill('林间来信')
    await page.waitForFunction(() =>
      (document.getElementById('draft-status') as HTMLElement).textContent!.includes('草稿已保存'),
    )
    const dataPath = await application.evaluate(({ app }) => app.getPath('userData'))
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(dataPath, 'draft.json'), 'utf8')).manifest.name,
      '林间来信',
    )
    ok('输入后立即关闭，重启完整恢复草稿')
    assert.deepEqual(errors, [])
    ok('无渲染脚本错误或资源加载错误')
    fs.writeFileSync(
      path.join(qa, packaged ? 'portable-report.json' : 'report.json'),
      JSON.stringify({ packaged, checks, errors }, null, 2),
    )
  } finally {
    await application.close()
  }
}
verify().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
