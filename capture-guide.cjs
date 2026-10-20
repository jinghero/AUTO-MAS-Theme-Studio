// 用隔离的本地演示实例拍摄真实界面；不读取个人草稿、不调用付费模型。
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { _electron:electron } = require('@playwright/test')
const { readPackage } = require('./app/package-service.cjs')
const root = __dirname, qa = path.join(root,'qa'), output = path.join(root,'docs/images')
fs.mkdirSync(qa,{recursive:true}); fs.mkdirSync(output,{recursive:true})
const sandbox = fs.mkdtempSync(path.join(qa,'guide-app-')), appPath = path.join(sandbox,'app')
fs.cpSync(path.join(root,'app'),appPath,{recursive:true})
const fixture = readPackage(fs.readFileSync(path.join(root,'示例主题-林间来信.zip')),'theme')
const background = fixture.assets[fixture.manifest.background.path]
const referenceFiles = [background,fixture.assets[fixture.manifest.mascot.path]].map((url,index) => {
  const extension = url.startsWith('data:image/png') ? 'png' : url.startsWith('data:image/webp') ? 'webp' : 'jpg'
  const file = path.join(sandbox,`${index ? '角色造型' : '森林配色'}.${extension}`)
  fs.writeFileSync(file,Buffer.from(url.split(',')[1],'base64')); return file
})
const prompt = '宁静的森林与柔和远山，以鼠尾草绿、奶油白为主色，温暖的手绘质感。主体在右侧，左侧与中间留出干净空间，适合覆盖导航与卡片。参考角色造型的圆润轮廓与森林配色，保持整体协调。无文字、标志、水印。'
let address, icons = [], application
const server = http.createServer(async (request,response) => {
  const chunks=[]; for await (const chunk of request) chunks.push(chunk)
  const raw=Buffer.concat(chunks); let data
  if (request.headers['content-type']?.startsWith('multipart/form-data;')) {
    const form=await new Request(address+request.url,{method:'POST',headers:request.headers,body:raw}).formData(); data=Object.fromEntries(form)
  } else data=JSON.parse(raw.toString())
  response.writeHead(200,{'Content-Type':'application/json'})
  if (request.url.endsWith('/chat/completions')) response.end(JSON.stringify({choices:[{message:{content:prompt},finish_reason:'stop'}]}))
  else {
    const icon=icons.find(icon => data.prompt.includes(`「${icon.label}」`))
    response.end(JSON.stringify({data:[{b64_json:(icon?.url || background).split(',')[1]}]}))
  }
})
async function capture() {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve)); address=`http://127.0.0.1:${server.address().port}/v1`
  application=await electron.launch({executablePath:require('electron'),args:[appPath]})
  await application.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].setSize(1600,940))
  const page=await application.firstWindow(), errors=[]
  page.on('pageerror',error => errors.push(error.message))
  await page.waitForFunction(() => Boolean(document.getElementById('name')?.value))
  icons=await page.evaluate(() => window.themeIconSet.map((icon,index) => {
    const glyphs=['✦','⌂','▷','▦','▣','☷','⌘','✓','◴','◈','⚙']
    const canvas=document.createElement('canvas'); canvas.width=128; canvas.height=128
    const ctx=canvas.getContext('2d'); ctx.fillStyle='#477960';ctx.font='82px "Segoe UI Symbol"';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(glyphs[index],64,68)
    return {...icon,url:canvas.toDataURL('image/png')}
  }))
  async function snap(name) {
    await page.waitForFunction(() => document.getElementById('draft-status').textContent.includes('草稿已保存'))
    await page.evaluate(() => {
      document.getElementById('toast').hidden=true
      // 仅隐藏本机绝对路径，截图中的其他控件和状态均来自实际操作。
      document.getElementById('ai-library-path').style.visibility='hidden'
    })
    await page.screenshot({path:path.join(output,name)})
  }
  async function titleScreenshot() {
    await page.locator('[data-tab="design"]').click()
    await page.locator('#page-title-enabled').check()
    await page.locator('#text-page-title').fill('#244a38'); await page.locator('#text-page-title').press('Tab')
    await page.locator('#preview-page-title').click()
    await page.frameLocator('#mas-preview-frame').locator('.page-title').waitFor()
    await page.locator('#preview-page-title').scrollIntoViewIfNeeded()
    await snap('guide-07-title-color.png')
  }
  await page.locator('#theme-file').setInputFiles(path.join(root,'示例主题-林间来信.zip'))
  await page.locator('#confirm-ok').click()
  await page.locator('#name').fill('林间来信')
  if (process.argv.includes('--titles-only')) { await titleScreenshot(); console.log(`Saved title screenshot to ${output}`); return }
  await snap('guide-01-theme.png')
  await page.locator('[data-tab="ai"]').click()
  await page.locator('#ai-base-url').fill('https://api.example.com/v1')
  await page.locator('#ai-model').fill('your-image-model')
  await page.locator('#ai-key').fill('demo-not-a-real-api-key')
  await snap('guide-02-api.png')
  await page.locator('#ai-base-url').fill(address)
  await page.locator('#ai-model').fill('demo-image-model')
  await page.locator('#ai-reference-file').setInputFiles(referenceFiles)
  await page.waitForFunction(() => document.getElementById('ai-reference-count').textContent==='2 / 4')
  await page.evaluate(() => document.querySelector('.ai-vision-settings').open=true)
  await page.locator('#ai-vision-model').fill('demo-vision-model')
  await page.locator('#ai-describe').click()
  await page.waitForFunction(() => !document.getElementById('ai-prompt-suggestion').hidden)
  await page.locator('#ai-use-prompt').click()
  await page.locator('#ai-generate').click()
  await page.waitForFunction(() => document.getElementById('ai-status').textContent.includes('生成完成'))
  await page.locator('#ai-base-url').fill('https://api.example.com/v1')
  await page.evaluate(() => {document.getElementById('ai-settings').open=false;document.querySelector('.ai-vision-settings').open=false;document.querySelector('.editor').scrollTop=0;document.querySelector('.workspace').scrollTop=0})
  await snap('guide-03-reference.png')
  await page.locator('#ai-apply').click()
  await page.waitForFunction(() => !document.getElementById('tab-design').hidden)
  await page.locator('[data-tab="ai"]').click()
  await page.evaluate(() => document.getElementById('ai-settings').open=true)
  await page.locator('#ai-base-url').fill(address)
  await page.locator('#ai-model').fill('demo-icons')
  await page.selectOption('#ai-target','icon'); await page.locator('#ai-icon-batch').check()
  await page.locator('#ai-generate').click()
  await page.waitForFunction(() => document.getElementById('ai-cancel').hidden && document.querySelectorAll('#ai-icon-grid img').length===11)
  await page.locator('#ai-base-url').fill('https://api.example.com/v1')
  await page.evaluate(() => {document.getElementById('ai-settings').open=false;document.getElementById('ai-icon-prompts').open=true;document.querySelector('.editor').scrollTop=0;document.querySelector('.workspace').scrollTop=0})
  await snap('guide-04-icons.png')
  await page.locator('#ai-apply-icons').click()
  await page.waitForFunction(() => !document.getElementById('tab-assets').hidden)
  await page.locator('[data-tab="ai"]').click()
  await page.getByRole('button',{name:'移除参考图 2',exact:true}).click()
  await page.getByRole('button',{name:'移除参考图 1',exact:true}).click()
  await page.locator('#ai-library-jump').click()
  await page.locator('#ai-library-grid article').first().getByRole('button',{name:'复用提示词',exact:true}).click()
  await page.waitForFunction(() => document.getElementById('ai-reference-count').textContent==='2 / 4')
  await page.evaluate(() => {document.getElementById('ai-icon-prompts').open=false;document.querySelector('.editor').scrollTop=0;document.getElementById('ai-library').scrollIntoView({block:'start'})})
  await snap('guide-05-library.png')
  await page.locator('[data-tab="check"]').click(); await page.locator('#validate').click()
  await page.waitForFunction(() => document.getElementById('validation').textContent.includes('校验通过'))
  await snap('guide-06-export.png')
  await titleScreenshot()
  if (errors.length) throw new Error(errors.join('\n'))
  console.log(`Saved 7 guide screenshots to ${output}`)
}
capture().catch(error => {console.error(error);process.exitCode=1}).finally(async () => {if(application)await application.close();server.closeAllConnections();server.close()})
