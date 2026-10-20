const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { _electron:electron } = require('@playwright/test')
const { readPackage, buildPackage } = require('./app/package-service.cjs')
const { readAppearancePackage } = require('./app/compat/appearanceService')
const { createImageLibrary } = require('./app/image-library.cjs')
const root = __dirname, qa = path.join(root, 'qa'), packaged = process.argv.includes('--packaged')
const executablePath = packaged ? path.join(root, 'dist/MAS创作工具箱/MAS主题工坊.exe') : require('electron')
const key = 'fixture-secret-icons-only', marker = `本地图标验证-${Date.now()}`
const requests = [], checks = [], errors = []
const ok = label => { checks.push(label); console.log('PASS', label) }
let application, page, address, png, failAt = 0, holdAt = 0, blockArchive, blockedFile
const server = http.createServer(async (request, response) => {
  const chunks = []; for await (const chunk of request) chunks.push(chunk)
  const raw = Buffer.concat(chunks), images = []; let data
  if (request.headers['content-type']?.startsWith('multipart/form-data;')) {
    const form = await new Request(address + request.url, {method:'POST', headers:request.headers, body:raw}).formData(); data = {}
    for (const [name, value] of form) {
      if (typeof value === 'string') data[name] = value
      else images.push({type:value.type, bytes:Buffer.from(await value.arrayBuffer())})
    }
  } else data = JSON.parse(raw.toString())
  requests.push({path:request.url, headers:request.headers, data, images})
  if (blockArchive) {
    const {directory,...info} = blockArchive
    const id = createHash('sha256').update(png).update(JSON.stringify({...info,prompt:data.prompt.replace(/\r\n/g,'\n')})).digest('hex')
    blockedFile = path.join(directory,id+'.png'); fs.mkdirSync(blockedFile); blockArchive = null
  }
  if (requests.length === holdAt) return
  response.writeHead(requests.length === failAt ? 500 : 200, {'Content-Type':'application/json'})
  response.end(requests.length === failAt ? JSON.stringify({error:{message:'fixture generation failed'}}) : JSON.stringify({data:[{b64_json:png.toString('base64')}]}))
})
async function launch() {
  application = await electron.launch({executablePath, args:packaged ? [] : [path.join(root, 'app')], timeout:30000})
  page = await application.firstWindow()
  page.on('pageerror', error => errors.push(error.message))
  await page.waitForFunction(() => Boolean(document.getElementById('name')?.value))
}
async function idle() { await page.waitForFunction(() => document.getElementById('ai-cancel').hidden && !document.getElementById('ai-generate').disabled) }
async function reached(count) {
  for (let attempt = 0; requests.length < count && attempt < 200; attempt++) await page.waitForTimeout(20)
  assert.equal(requests.length, count)
}
async function newTheme() { await page.locator('#new').click(); await page.locator('#confirm-ok').click(); await page.locator('[data-tab="ai"]').click() }
async function configure(prompt) {
  await page.evaluate(() => { document.getElementById('ai-settings').open = true })
  await page.locator('#ai-base-url').fill(address + '/v1')
  await page.locator('#ai-key').fill(key); await page.locator('#ai-model').fill('fixture-icons')
  await page.selectOption('#ai-target', 'icon'); await page.locator('#ai-icon-batch').check()
  await page.locator('#ai-prompt').fill(prompt)
}
async function listing() { return page.evaluate(() => window.studio.listLibraryImages({offset:0})) }
async function verify() {
  fs.mkdirSync(qa, {recursive:true})
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); address = `http://127.0.0.1:${server.address().port}`
  await launch()
  try {
    const urls = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 384
      const ctx = canvas.getContext('2d'), gradient = ctx.createLinearGradient(0,0,512,384)
      gradient.addColorStop(0,'#8fa3d8'); gradient.addColorStop(1,'#faf1c6'); ctx.fillStyle = gradient; ctx.fillRect(0,0,512,384)
      const output = canvas.toDataURL('image/png')
      canvas.width = 81; canvas.height = 61; ctx.fillStyle = '#d58eaa'; ctx.fillRect(0,0,81,61)
      const first = canvas.toDataURL('image/png'); ctx.fillStyle = '#77b8c3'; ctx.fillRect(0,0,81,61)
      return [output, first, canvas.toDataURL('image/webp')]
    })
    png = Buffer.from(urls[0].split(',')[1], 'base64')
    const refPaths = urls.slice(1).map((url, index) => {
      const file = path.join(qa, `icon-original-reference-${index}.${index ? 'webp' : 'png'}`)
      fs.writeFileSync(file, Buffer.from(url.split(',')[1],'base64')); return file
    })
    const source = readPackage(fs.readFileSync(path.join(root,'示例主题-林间来信.zip')), 'theme')
    const hidden = ['testRouter','ocrDev','overlayMaskDev','updateDownloadDev','tools']
    const hiddenPath = source.manifest.menuIcons.default
    for (const key of hidden) source.manifest.menuIcons[key] = hiddenPath
    const fixture = path.join(qa,'icons-hidden-source.zip'); fs.writeFileSync(fixture, buildPackage(source).bytes)
    await page.locator('#theme-file').setInputFiles(fixture); await page.locator('#confirm-ok').click()
    await page.locator('[data-tab="ai"]').click(); await configure(marker)
    const catalog = await page.evaluate(() => window.themeIconSet)
    assert.equal(catalog.length, 11)
    for (const id of ['icon-key','ai-icon-target','ai-icon-key']) {
      const values = await page.locator(`#${id} option`).evaluateAll(options => options.map(option => option.value))
      assert.deepEqual(values, catalog.map(icon => icon.key)); assert(!values.some(key => hidden.includes(key)))
    }
    await page.locator('#ai-icon-prompts summary').click()
    await page.locator('#ai-icon-prompt-home').fill('一座圆顶小屋，屋顶有一片叶子')
    await page.locator('#ai-reference-file').setInputFiles(refPaths)
    await page.waitForFunction(() => document.getElementById('ai-reference-count').textContent === '2 / 4')
    const before = JSON.parse(await page.locator('#manifest-json').textContent())
    await page.locator('#ai-generate').click(); await idle()
    assert.equal(requests.length, 11)
    assert.equal(await page.locator('#ai-icon-grid img').count(), 11)
    assert.deepEqual(JSON.parse(await page.locator('#manifest-json').textContent()), before)
    for (const [index, request] of requests.entries()) {
      const icon = catalog[index]
      assert.equal(request.path, '/v1/images/edits'); assert.equal(request.headers.authorization, `Bearer ${key}`)
      assert(request.data.prompt.includes(`「${icon.label}」`)); assert(request.data.prompt.includes(icon.purpose))
      assert(request.data.prompt.includes(icon.key === 'home' ? '圆顶小屋' : icon.subject))
      assert(request.data.prompt.includes(marker)); assert.equal(request.images.length, 2)
      for (let i = 0; i < 2; i++) assert(request.images[i].bytes.equals(fs.readFileSync(refPaths[i])))
    }
    assert.equal(new Set(requests.map(request => request.data.prompt)).size, 11)
    ok('仅显示正式菜单和默认图标，每项独立用途提示词且保留两张原参考图，预览前不改主题')
    let library = await listing(); assert(library.success)
    const all = []
    for (let offset = 0; offset < library.total; offset += 12) all.push(...(await page.evaluate(offset => window.studio.listLibraryImages({offset}), offset)).entries)
    const archived = all.filter(entry => entry.basePrompt === marker)
    assert.equal(archived.length, 11)
    for (const entry of archived) {
      assert.equal(entry.width,512); assert.equal(entry.height,384)
      const read = await page.evaluate(id => window.studio.readLibraryImage(id), entry.id)
      assert(read.success); assert(Buffer.from(read.image.url.split(',')[1],'base64').equals(png))
      assert(!JSON.stringify(entry).includes(key)); assert(!Object.hasOwn(entry, 'apiKey'))
      for (const url of urls.slice(1)) assert(!JSON.stringify(entry).includes(url))
    }
    assert.equal((await page.evaluate(() => window.studio.readLibraryImage('../draft'))).success, false)
    ok('11 张原图与提示词独立归档，保留原始字节和尺寸，不保存密钥或输入参考图')
    await page.getByRole('checkbox',{name:'使用主页图标',exact:true}).uncheck()
    await page.locator('#ai-apply-icons').click()
    await page.waitForFunction(() => document.getElementById('toast').textContent.includes('已应用 10'))
    const applied = JSON.parse(await page.locator('#manifest-json').textContent())
    for (const name of hidden) assert.equal(applied.menuIcons[name], hiddenPath)
    assert.equal(applied.menuIcons.home, before.menuIcons.home)
    for (const icon of catalog.filter(icon => icon.key !== 'home')) assert.notEqual(applied.menuIcons[icon.key], before.menuIcons[icon.key])
    const output = path.join(qa, 'ai-batch-icons.zip')
    await application.evaluate(({dialog},file) => {dialog.showSaveDialog = async () => ({canceled:false,filePath:file})}, output)
    await page.locator('#export').click(); await page.waitForFunction(() => !document.getElementById('export').disabled)
    const checked = readAppearancePackage(output)
    for (const name of hidden) assert.equal(checked.manifest.menuIcons[name], hiddenPath)
    const packageData = readPackage(fs.readFileSync(output),'theme')
    for (const icon of catalog.filter(icon => icon.key !== 'home')) {
      const url = packageData.assets[packageData.manifest.menuIcons[icon.key]]
      const dimensions = await page.evaluate(url => window.themeImages.inspect(url), url)
      assert(dimensions.width <= 128 && dimensions.height <= 128)
    }
    ok('勾选的 10 个图标统一应用并通过 MAS 实际导入校验，旧包隐藏图标完整保留')
    await page.locator('[data-tab="ai"]').click()
    let start = requests.length; failAt = start + 1
    const homeCard = page.locator('#ai-icon-grid [data-icon="home"]'), previous = await homeCard.locator('img').getAttribute('src')
    await homeCard.getByRole('button',{name:'重新生成主页图标',exact:true}).click(); await idle()
    assert.equal(requests.length, start + 1); assert.equal(await homeCard.locator('img').getAttribute('src'),previous)
    assert((await homeCard.textContent()).includes('fixture generation failed')); failAt = 0
    ok('单独重生成仅请求所选图标，失败后保留上一张结果和已归档图片')
    start = requests.length; holdAt = start + 2
    await page.locator('#ai-prompt').fill(marker + '-取消')
    await page.locator('#ai-generate').click(); await reached(holdAt)
    await page.locator('#ai-cancel').click(); await idle(); holdAt = 0
    assert.equal(await page.locator('#ai-icon-grid img').count(),1)
    await page.locator('#ai-continue-icons').click(); await idle()
    assert.equal(requests.length - start,12); assert.equal(await page.locator('#ai-icon-grid img').count(),11)
    assert.equal(requests.slice(start).filter(request => request.data.prompt.includes('「默认图标」')).length,1)
    ok('取消批量请求保留已完成项，继续时只生成未完成图标')
    start = requests.length; failAt = start + 3
    await page.locator('#ai-prompt').fill(marker + '-失败')
    await page.locator('#ai-generate').click(); await idle()
    assert.equal(requests.length - start,3); assert.equal(await page.locator('#ai-icon-grid img').count(),2)
    failAt = 0; await page.locator('#ai-continue-icons').click(); await idle()
    assert.equal(requests.length - start,12); assert.equal(await page.locator('#ai-icon-grid img').count(),11)
    ok('接口失败暂停整批且不自动重试收费请求，支持继续剩余项目')
    library = await listing()
    const diskPrompt = marker + '-磁盘故障'
    blockArchive = {directory:library.directory, target:'icon',iconKey:'default',prompt:'',basePrompt:diskPrompt,iconSubject:catalog[0].subject,model:'fixture-icons',
      style:await page.locator('#ai-style').inputValue(),width:512,height:384}
    // 用空目录占住仅本次验证的原图路径，真实触发写入失败；不改动任何已有文件。
    start = requests.length; await page.locator('#ai-prompt').fill(diskPrompt)
    await page.locator('#ai-generate').click(); await idle()
    assert.equal(requests.length,start+1); assert.equal(await page.locator('#ai-icon-grid img').count(),1)
    assert((await page.locator('#ai-status').textContent()).includes('素材库保存失败'))
    assert(await page.locator('#ai-continue-icons').isDisabled())
    fs.rmdirSync(blockedFile); blockedFile = null
    await page.locator('#ai-archive-icons').click()
    await page.waitForFunction(() => document.getElementById('ai-archive-icons').hidden)
    assert.equal(requests.length,start+1)
    await page.locator('#ai-continue-icons').click(); await idle()
    assert.equal(requests.length,start+11)
    ok('原图写入失败会暂停批量请求，恢复后原字节可重试归档，不重复调用生图接口')
    start = requests.length; holdAt = start + 1
    await page.locator('#ai-generate').click(); await reached(holdAt)
    await newTheme(); await idle(); holdAt = 0
    assert.equal(await page.locator('#ai-icon-results').isVisible(),false)
    assert.equal(await page.locator('#ai-reference-count').textContent(),'0 / 4')
    assert.equal(requests.length,start + 1)
    await page.locator('#ai-library-refresh').click()
    library = await listing()
    const entry = library.entries.find(entry => entry.basePrompt === marker + '-失败'); assert(entry)
    const card = page.locator(`[data-library-id="${entry.id}"]`)
    await card.getByRole('button',{name:'选用图片',exact:true}).click()
    await page.waitForFunction(() => !document.getElementById('ai-result').hidden)
    assert.equal(await page.locator('#ai-result-image').getAttribute('src'),urls[0])
    assert.equal(await page.locator('#ai-icon-key').inputValue(),entry.iconKey)
    await page.locator('#ai-reference-file').setInputFiles(refPaths)
    await page.waitForFunction(() => document.getElementById('ai-reference-count').textContent === '2 / 4')
    await card.getByRole('button',{name:'复用提示词',exact:true}).click()
    assert.equal(await page.locator('#ai-prompt').inputValue(),entry.basePrompt)
    assert.equal(await page.locator('#ai-target').inputValue(),'icon')
    assert.equal(await page.locator('#ai-icon-target').inputValue(),entry.iconKey)
    assert.equal(await page.locator('#ai-reference-count').textContent(),'2 / 4')
    assert.equal(requests.length,start + 1)
    await page.locator('#ai-apply').click()
    await page.waitForFunction(key => JSON.parse(document.getElementById('manifest-json').textContent).menuIcons?.[key],entry.iconKey)
    ok('切换主题停止旧批次，素材库可离线复用原图和专属提示词，保留当前参考图')
    const libraryPath = library.directory
    const diskRecord = JSON.parse(fs.readFileSync(path.join(libraryPath,entry.id+'.json'),'utf8'))
    assert.equal(diskRecord.prompt,entry.prompt); assert(!JSON.stringify(diskRecord).includes(key))
    assert(fs.readFileSync(path.join(libraryPath,`${entry.id}.png`)).equals(png))
    await application.evaluate(({shell}) => {shell.openPath = async () => ''})
    assert((await page.evaluate(() => window.studio.openLibraryFolder())).success)
    await page.waitForTimeout(400); await application.close(); application = null; await launch()
    await page.locator('[data-tab="ai"]').click(); await page.locator('#ai-library-refresh').click()
    assert((await listing()).total >= library.total)
    const recovered = await page.evaluate(id => window.studio.readLibraryImage(id),entry.id)
    assert(recovered.success); assert.equal(recovered.image.url,urls[0]); assert.equal(recovered.entry.prompt,entry.prompt)
    assert.equal(await page.locator('#ai-key').inputValue(),'')
    assert.equal(await page.locator('#ai-reference-count').textContent(),'0 / 4')
    assert.deepEqual(errors,[])
    ok('重启仍能读取独立原图、用途和提示词，密钥与输入参考图不恢复')
    const dataPath = await application.evaluate(({app}) => app.getPath('userData'))
    await application.close(); application = null
    const draftPath = path.join(dataPath,'draft.json'), legacy = JSON.parse(fs.readFileSync(draftPath,'utf8'))
    const legacyManifest = structuredClone(legacy.manifest)
    legacy.aiResult = {target:'background',url:urls[0],width:512,height:384,bytes:png.length}
    legacy.generator.prompt = '这是之后修改的提示词，不能当作旧图的实际提示词'
    fs.writeFileSync(draftPath,JSON.stringify(legacy)); await launch()
    let migrated
    for (let attempt = 0; attempt < 100; attempt++) {
      migrated = await page.evaluate(() => window.studio.loadDraft())
      if (migrated.state.aiResult.libraryId) break
      await page.waitForTimeout(25)
    }
    assert(migrated.state.aiResult.libraryId)
    const migratedImage = await page.evaluate(id => window.studio.readLibraryImage(id),migrated.state.aiResult.libraryId)
    assert(migratedImage.success,migratedImage.error); assert.equal(migratedImage.image.url,urls[0]); assert.equal(migratedImage.entry.prompt,'')
    assert.deepEqual(migrated.state.manifest,legacyManifest)
    await page.locator('[data-tab="ai"]').click()
    ok('旧版草稿最后一张生成结果自动补存，不误记后来修改的提示词或自动应用主题')
    const isolated = fs.mkdtempSync(path.join(qa,'library-unit-')), service = createImageLibrary(isolated)
    const input = {...entry, url:urls[0], thumbnail:entry.thumbnail, apiKey:key, referenceImages:[{url:urls[1]}]}
    const saved = service.save(input); assert.equal(service.save(input).entry.id,saved.entry.id)
    assert.equal(service.list().total,1)
    assert(!JSON.stringify(service.read(saved.entry.id).entry).includes(key))
    fs.writeFileSync(path.join(isolated,'a'.repeat(64)+'.json'),'{broken')
    assert.equal(service.list().skipped,1); assert.equal(service.list().total,1)
    assert.throws(() => service.read('../draft'))
    const blocked = path.join(isolated,'blocked'); fs.writeFileSync(blocked,'fixture')
    assert.throws(() => createImageLibrary(blocked).save(input))
    for (let index = 0; index < 14; index++) service.save({...input,prompt:`${marker}-${index}`})
    assert.equal(service.list().entries.length,12); assert.equal(service.list({offset:12}).entries.length,3)
    const jpeg = await page.evaluate(() => { const canvas=document.createElement('canvas'); canvas.width=81;canvas.height=61;return canvas.toDataURL('image/jpeg') })
    for (const url of [urls[2],jpeg]) {
      const saved = service.save({...input,url,target:'cover',width:81,height:61})
      assert.equal(service.read(saved.entry.id).image.url,url)
    }
    ok('归档去重、分页、损坏记录隔离、写入失败与路径限制')
    await application.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].setSize(1000,720))
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await application.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].setSize(1440,940))
    await page.locator('#ai-library-jump').click()
    await page.waitForTimeout(300)
    await page.evaluate(() => {document.getElementById('toast').hidden=true})
    await page.screenshot({path:path.join(qa,packaged ? 'icons-library-portable.png' : 'icons-library.png')})
    fs.writeFileSync(path.join(qa,packaged ? 'icons-portable-report.json' : 'icons-report.json'),JSON.stringify({packaged,mockedService:true,checks,errors},null,2))
  } finally { if (application) await application.close(); if (blockedFile && fs.existsSync(blockedFile)) fs.rmdirSync(blockedFile); server.closeAllConnections(); server.close() }
}
verify().catch(error => {console.error(error); server.closeAllConnections(); server.close(); process.exitCode=1})
