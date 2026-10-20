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
  qa = process.env.STUDIO_QA_DIR!,
  checks: string[] = [],
  errors: string[] = []
const packaged = process.argv.includes('--packaged')
const ok = (label) => {
  checks.push(label)
  console.log('PASS', label)
}
async function verify() {
  const application = await electron.launch({
    executablePath: packaged
      ? path.join(root, 'dist/MAS创作工具箱/MAS主题工坊.exe')
      : dep('electron'),
    args: packaged ? [] : [path.join(root, '.build/app')],
  })
  const page = await application.firstWindow()
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  try {
    await page.waitForFunction(() =>
      Boolean((document.getElementById('name') as HTMLInputElement)?.value),
    )
    await page.locator('#new').click()
    await page.locator('#confirm-ok').click()
    const frame = page.frameLocator('#mas-preview-frame')
    await frame.locator('.home-title').waitFor()
    const manifest = JSON.parse((await page.locator('#manifest-json').textContent())!)
    assert.deepEqual(manifest.tokens, { colorPrimary: '#1677ff' })
    assert.equal(
      await frame.locator('.ant-layout-sider').evaluate((node) => getComputedStyle(node).width),
      '160px',
    )
    assert.equal(await frame.locator('.ant-menu-item').count(), 10)
    for (const label of [
      '主页',
      '托管管理',
      '计划管理',
      '模拟器管理',
      '调度队列',
      '调度中心',
      '游戏社区',
      '历史记录',
      '资源商店',
      '设置',
    ])
      assert((await frame.locator('.sider-content').textContent())!.includes(label))
    assert(await frame.locator('.command-card').count())
    assert(await frame.locator('.shortcut-card').count())
    assert.equal(
      await frame.locator('body').evaluate((node) => getComputedStyle(node).backgroundColor),
      'rgb(245, 245, 245)',
    )
    ok('新建主题为 MAS 默认蓝色、自动 token、160px 实际侧栏、10 个菜单及主页原组件')
    await page.locator('[data-tab="design"]').click()
    await page.locator('#mode-dark').click()
    await frame.locator('html.dark').waitFor()
    assert.equal(
      await frame.locator('body').evaluate((node) => getComputedStyle(node).backgroundColor),
      'rgb(0, 0, 0)',
    )
    await page.locator('#mode-light').click()
    ok('默认明暗主题使用 MAS 相同的 Ant Design 算法')
    async function verifyDock() {
      await page.waitForFunction(() => {
        const wrap = document.querySelector<HTMLElement>('.preview-wrap')!.getBoundingClientRect()
        const viewport = (
          document.getElementById('preview-viewport') as HTMLElement
        ).getBoundingClientRect()
        return (
          wrap.width > 0 &&
          wrap.height > 0 &&
          ['left', 'right', 'top', 'bottom'].every(
            (edge) => Math.abs(wrap[edge] - viewport[edge]) <= 1,
          )
        )
      })
      const dimensions = await page.evaluate(() => {
        const bounds = (node) => {
          const r = node.getBoundingClientRect()
          return {
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
            width: r.width,
            height: r.height,
          }
        }
        const workspace = document.querySelector<HTMLElement>('.workspace')!
        return {
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          wrap: bounds(document.querySelector<HTMLElement>('.preview-wrap')!),
          viewport: bounds(document.getElementById('preview-viewport') as HTMLElement),
          frame: bounds(document.getElementById('mas-preview-frame') as HTMLIFrameElement),
          workspaceOverflow: workspace.scrollHeight - workspace.clientHeight,
          transform: getComputedStyle(
            document.getElementById('mas-preview-frame') as HTMLIFrameElement,
          ).transform,
        }
      })
      assert(dimensions.scrollWidth <= dimensions.width)
      assert(dimensions.workspaceOverflow <= 1, JSON.stringify(dimensions))
      assert.equal(dimensions.transform, 'none')
      for (const edge of ['left', 'right', 'top', 'bottom', 'width', 'height']) {
        assert(
          Math.abs(dimensions.wrap[edge] - dimensions.viewport[edge]) <= 1,
          JSON.stringify(dimensions),
        )
        assert(
          Math.abs(dimensions.frame[edge] - dimensions.viewport[edge]) <= 1,
          JSON.stringify(dimensions),
        )
      }
      const inner = await frame
        .locator('body')
        .evaluate(() => ({ width: innerWidth, height: innerHeight }))
      assert(Math.abs(inner.width - dimensions.viewport.width) <= 1)
      assert(Math.abs(inner.height - dimensions.viewport.height) <= 1)
    }
    for (const [width, height] of [
      [1000, 720],
      [1440, 940],
      [1920, 1080],
      [1920, 780],
      [1250, 780],
      [1250, 1000],
      [1680, 1000],
    ]) {
      await application.evaluate(
        ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(size[0], size[1]),
        [width, height],
      )
      await page.waitForTimeout(120)
      await verifyDock()
    }
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize())
    await page.waitForTimeout(150)
    await verifyDock()
    await page.screenshot({
      path: path.join(qa, packaged ? 'mas-portable-maximized.png' : 'mas-maximized.png'),
    })
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].unmaximize())
    await page.waitForTimeout(150)
    await verifyDock()
    for (const full of [true, false]) {
      await application.evaluate(async ({ BrowserWindow }, full) => {
        const window = BrowserWindow.getAllWindows()[0]
        await new Promise<void>((resolve) => {
          if (full) window.once('enter-full-screen', () => resolve())
          else window.once('leave-full-screen', () => resolve())
          window.setFullScreen(full)
        })
      }, full)
      await page.waitForTimeout(150)
      await verifyDock()
      if (full)
        await page.screenshot({
          path: path.join(qa, packaged ? 'mas-portable-fullscreen.png' : 'mas-fullscreen.png'),
        })
    }
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1440, 940),
    )
    ok('7 组尺寸、单独宽高变化、最大化、全屏和还原：预览四边始终铺满可用区域')
    await page.locator('[data-tab="info"]').click()
    await page.screenshot({
      path: path.join(qa, packaged ? 'mas-portable-default.png' : 'mas-default.png'),
    })
    const theme = process.env.THEME_FIXTURE || path.join(root, '示例主题-林间来信.zip')
    const expected = readPackage(fs.readFileSync(theme)).manifest
    await page.locator('#theme-file').setInputFiles(theme)
    await page.locator('#confirm-ok').click()
    await page.waitForFunction(
      (name) => (document.getElementById('name') as HTMLInputElement).value === name,
      expected.name,
    )
    await frame.locator(expected.mode === 'dark' ? 'html.dark' : 'html:not(.dark)').waitFor()
    await page.waitForTimeout(100)
    const bg = await frame
      .locator('.mas-background')
      .evaluate((node) => getComputedStyle(node).backgroundImage)
    assert(bg.startsWith('url("blob:'))
    assert.equal(await frame.locator('.mas-app canvas#preview-mascot').count(), 0)
    assert.equal(await page.locator('#desktop-mascot-preview').isVisible(), true)
    await verifyDock()
    await page.locator('[data-tab="assets"]').click()
    const newWindow = application.waitForEvent('window')
    await page.locator('#preview-current-mascot').click()
    const mascot = await newWindow
    await mascot.waitForFunction(
      (name) => (document.getElementById('name') as HTMLInputElement).textContent === name,
      expected.name,
    )
    for (const action of ['idle', 'working', 'failure', 'success', 'drag', 'look', 'static']) {
      await mascot.selectOption('#action', action)
      assert(
        await mascot
          .locator('#canvas')
          .evaluate((canvas) => (canvas as HTMLCanvasElement).width > 0),
      )
    }
    await mascot.locator('#action').selectOption('look')
    await mascot.locator('#look').selectOption('8')
    assert.equal(await mascot.locator('#cell-info').textContent(), '图集第 3 行 · 第 3 列')
    await mascot.screenshot({
      path: path.join(qa, packaged ? 'mascot-tool-portable.png' : 'mascot-tool.png'),
    })
    ok('主题背景、真实布局与独立桌宠区域；桌宠工具接收当前主题、7 种动作与九方向视线')
    const output = path.join(qa, 'toolbox-mascot.zip')
    await application.evaluate(({ dialog }, output) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: output })
    }, output)
    await page.locator('#export-mascot').click()
    await page.waitForFunction(() =>
      (document.getElementById('toast') as HTMLElement).textContent!.includes('独立桌宠包已导出'),
    )
    const standalone = readPackage(fs.readFileSync(output), 'mascot')
    const original = readPackage(fs.readFileSync(theme))
    assert.deepEqual(standalone.manifest.mascot, original.manifest.mascot)
    await mascot.locator('#file').setInputFiles(output)
    await mascot.waitForFunction(
      () => (document.getElementById('source') as HTMLElement).textContent === 'toolbox-mascot.zip',
    )
    ok('独立桌宠 ZIP 导出、官方协议校验、动画完整保留并在桌宠工具重新导入')
    await mascot.close()
    const reopen = application.waitForEvent('window')
    await page.locator('#mascot-tool').click()
    const demo = await reopen
    await demo.locator('#name').filter({ hasText: '奶油猫' }).waitFor()
    await demo.close()
    ok('顶部桌宠工具入口独立运行，内置示例可用')
    await page.locator('[data-tab="info"]').click()
    await page.evaluate(() => ((document.getElementById('toast') as HTMLElement).hidden = true))
    await page.screenshot({
      path: path.join(qa, packaged ? 'mas-portable-theme.png' : 'mas-theme.png'),
    })
    assert.deepEqual(errors, [])
    fs.writeFileSync(
      path.join(qa, packaged ? 'mas-portable-report.json' : 'mas-report.json'),
      JSON.stringify({ checks, errors }, null, 2),
    )
  } catch (error) {
    console.log('ERRORS', errors)
    await page.screenshot({ path: path.join(qa, 'mas-failure.png') })
    throw error
  } finally {
    await application.close()
  }
}
verify().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
