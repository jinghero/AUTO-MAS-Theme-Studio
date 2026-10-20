if (!process.env.STUDIO_QA_DIR || !process.env.STUDIO_DATA_DIR)
  throw new Error('请通过 npm run check:drafts 运行验证')
const fs = require('node:fs') as typeof import('node:fs')
const path = require('node:path') as typeof import('node:path')
const assert: typeof import('node:assert/strict') = require('node:assert/strict')
const electron = {
  launch: async (options: Parameters<typeof import('@playwright/test')._electron.launch>[0]) =>
    (await import('./tools/verification.mts')).launch(options),
}
const data = process.env.STUDIO_DATA_DIR,
  qa = process.env.STUDIO_QA_DIR
const draft = path.join(data, 'draft.json'),
  original = '{invalid-json-for-recovery'
fs.writeFileSync(draft, original)
const packaged = process.argv.includes('--packaged')
async function verify() {
  const application = await electron.launch({
    executablePath: packaged
      ? path.join(__dirname, 'dist/MAS创作工具箱/MAS主题工坊.exe')
      : require('electron'),
    args: packaged ? [] : [path.join(__dirname, '.build/app')],
  })
  try {
    const page = await application.firstWindow()
    await page.waitForFunction(() =>
      document.getElementById('toast')?.textContent?.includes('草稿读取失败'),
    )
    assert.equal(fs.readFileSync(draft, 'utf8'), original)
    await page.locator('#name').fill('恢复后的主题')
    await page.waitForFunction(() =>
      document.getElementById('draft-status')?.textContent?.startsWith('草稿已保存'),
    )
    assert.equal(JSON.parse(fs.readFileSync(draft, 'utf8')).manifest.name, '恢复后的主题')
    const backups = fs.readdirSync(path.join(data, 'draft-backups'))
    assert.equal(backups.length, 1)
    assert.equal(fs.readFileSync(path.join(data, 'draft-backups', backups[0]), 'utf8'), original)
    // Transport rejection must be caught and the cancel control restored.
    await application.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('studio:describe-cancel')
      ipcMain.handle('studio:describe-cancel', () => {
        throw new Error('fixture transport failure')
      })
    })
    await page.locator('[data-tab="ai"]').click()
    await page.evaluate(() => {
      document.getElementById('ai-describe-cancel')!.hidden = false
    })
    await page.locator('#ai-describe-cancel').click()
    await page.waitForFunction(
      () => !(document.getElementById('ai-describe-cancel') as HTMLButtonElement).disabled,
    )
    await page.waitForFunction(() =>
      document.getElementById('toast')?.textContent?.includes('fixture transport failure'),
    )
    fs.writeFileSync(
      path.join(qa, 'draft-recovery-report.json'),
      JSON.stringify({ backups: backups.length, transportFailureHandled: true }),
    )
    console.log('PASS 损坏草稿读取保留原文、后续保存先备份、IPC 拒绝后取消按钮恢复')
  } finally {
    await application.close()
  }
}
verify().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
