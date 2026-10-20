const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { readPackage, buildPackage, buildMascotPackage, decodeImage } = require('./package-service.cjs')
const { generateImage, imageURL } = require('./image-api.cjs')
const { describeReferences } = require('./prompt-api.cjs')
const { loadBytes } = require('./mascot-tool/package-loader.cjs')
const { createImageLibrary } = require('./image-library.cjs')

app.setName('MAS 主题工坊')
const portableData = path.join(app.isPackaged ? path.dirname(app.getPath('exe')) : path.dirname(__dirname), 'data')
let dataPath = portableData
try { fs.mkdirSync(dataPath, { recursive: true }); fs.accessSync(dataPath, fs.constants.W_OK) }
catch { dataPath = app.getPath('userData'); fs.mkdirSync(dataPath, { recursive: true }) }
app.setPath('userData', dataPath)
app.setPath('sessionData', path.join(dataPath, 'session'))
const draftPath = path.join(dataPath, 'draft.json')
const imageLibrary = createImageLibrary(path.join(dataPath, 'generated-images'))
app.disableHardwareAcceleration()
let window, readyToClose = false
let generationController
let descriptionController
let mascotWindow
const rendererURL = pathToFileURL(path.join(__dirname, 'index.html')).href
const mascotURL = pathToFileURL(path.join(__dirname, 'mascot-tool/index.html')).href
function handler(channel, callback) {
  ipcMain.handle(channel, async (event, input) => {
    if (!window || event.sender !== window.webContents || event.senderFrame?.url !== rendererURL)
      return { success: false, error: '请求来源无效' }
    try { return { success: true, ...await callback(input) } }
    catch (error) { return { success: false, error: error.message || '操作失败' } }
  })
}
function imageInfo(url) {
  const data = decodeImage(url)
  const info = imageURL(data)
  if (!url.startsWith(`data:${info.mime};`)) throw new Error('图片内容与文件扩展名不一致')
  return { bytes: data.length }
}
handler('studio:image', input => ({ info: imageInfo(input.url) }))
handler('studio:library-save', input => imageLibrary.save(input))
handler('studio:library-list', input => imageLibrary.list(input))
handler('studio:library-read', input => imageLibrary.read(input?.id))
handler('studio:library-folder', async () => {
  fs.mkdirSync(imageLibrary.directory, {recursive:true})
  const error = await shell.openPath(imageLibrary.directory)
  if (error) throw new Error(error)
  return {}
})
handler('studio:generate', async input => {
  if (generationController || descriptionController) throw new Error('已有 AI 请求正在进行，请等待或取消后重试')
  const controller = new AbortController()
  generationController = controller
  const timer = setTimeout(() => controller.abort('timeout'), 300000)
  try {
    const image = await generateImage(input, controller.signal)
    return { image: { ...image, ...imageInfo(image.url) } }
  } finally { clearTimeout(timer); if (generationController === controller) generationController = null }
})
handler('studio:generate-cancel', () => { generationController?.abort('user'); return {} })
handler('studio:describe', async input => {
  if (descriptionController || generationController) throw new Error('已有 AI 请求正在进行，请等待或取消后重试')
  const controller = new AbortController()
  descriptionController = controller
  const timer = setTimeout(() => controller.abort('timeout'), 120000)
  try { return { prompt:await describeReferences(input, controller.signal) } }
  finally { clearTimeout(timer); if (descriptionController === controller) descriptionController = null }
})
handler('studio:describe-cancel', () => { descriptionController?.abort('user'); return {} })
handler('studio:image-save', async input => {
  const info = imageInfo(input.url)
  const data = decodeImage(input.url)
  const extension = input.url.startsWith('data:image/png') ? 'png' : input.url.startsWith('data:image/webp') ? 'webp' : 'jpg'
  const selected = await dialog.showSaveDialog(window, { title: '保存生成的图片', defaultPath: `theme-image.${extension}`,
    filters: [{ name: '图片', extensions: [extension] }] })
  if (selected.canceled || !selected.filePath) return { canceled: true }
  fs.writeFileSync(selected.filePath, data)
  return { filePath: selected.filePath, ...info }
})
handler('studio:open', input => {
  if (!(input.bytes instanceof Uint8Array)) throw new Error('无法读取 ZIP 文件')
  const state = readPackage(Buffer.from(input.bytes), input.kind)
  return { state }
})
function openMascotTool(pack) {
  if (mascotWindow && !mascotWindow.isDestroyed()) {
    if (pack) mascotWindow.webContents.send('mascot:load', pack)
    mascotWindow.show(); mascotWindow.focus(); return
  }
  mascotWindow = new BrowserWindow({ width:1120, height:830, minWidth:720, minHeight:650,
    title:'桌宠工具 · MAS 主题工坊', autoHideMenuBar:true, show:false,
    webPreferences:{ preload:path.join(__dirname,'mascot-tool/preload.cjs'), nodeIntegration:false,contextIsolation:true,sandbox:true,spellcheck:false,devTools:!app.isPackaged } })
  mascotWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}))
  mascotWindow.webContents.on('will-navigate',(event,url)=>{if(url!==mascotURL)event.preventDefault()})
  mascotWindow.webContents.once('did-finish-load',()=>{if(pack)mascotWindow.webContents.send('mascot:load',pack)})
  mascotWindow.once('ready-to-show',()=>mascotWindow.show())
  mascotWindow.on('closed',()=>{mascotWindow=null})
  mascotWindow.loadFile(path.join(__dirname,'mascot-tool/index.html'))
}
handler('studio:mascot-tool', input => {
  const pack = input ? loadBytes('current-theme.zip', buildPackage(input).bytes) : undefined
  openMascotTool(pack); return {}
})
handler('studio:mascot-export', async input => {
  const result = buildMascotPackage(input)
  const selected = await dialog.showSaveDialog(window,{title:'导出独立桌宠包',defaultPath:`${result.manifest.id}.zip`,filters:[{name:'MAS 桌宠包',extensions:['zip']}]})
  if(selected.canceled||!selected.filePath)return{canceled:true}
  fs.writeFileSync(selected.filePath,result.bytes)
  return{filePath:selected.filePath,count:result.count}
})
ipcMain.handle('preview:load',(event,input)=>{
  if(!mascotWindow||event.sender!==mascotWindow.webContents||event.senderFrame?.url!==mascotURL)return{success:false,error:'请求来源无效'}
  try {
    if(!input||typeof input.name!=='string'||!(input.bytes instanceof Uint8Array))throw new Error('无法读取所选资源')
    return{success:true,pack:loadBytes(input.name,Buffer.from(input.bytes))}
  }catch(error){return{success:false,error:error.message}}
})
handler('studio:validate', input => {
  const result = buildPackage(input)
  return { count: result.count, bytes: result.bytes.length }
})
handler('studio:export', async input => {
  const result = buildPackage(input)
  const selected = await dialog.showSaveDialog(window, {
    title: '导出 AUTO-MAS 主题包', defaultPath: `${result.manifest.id}.zip`,
    filters: [{ name: 'AUTO-MAS 主题包', extensions: ['zip'] }],
  })
  if (selected.canceled || !selected.filePath) return { canceled: true }
  const temporary = path.join(path.dirname(selected.filePath), `.mas-theme-${require('node:crypto').randomUUID()}.tmp`)
  try {
    fs.writeFileSync(temporary, result.bytes, { flag: 'wx' })
    fs.renameSync(temporary, selected.filePath)
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary) }
  return { filePath: selected.filePath, count: result.count, bytes: result.bytes.length }
})
handler('studio:draft-load', () => {
  if (!fs.existsSync(draftPath)) return { state: null }
  if (fs.statSync(draftPath).size > 48 * 1024 * 1024) throw new Error('草稿过大，请重新导入已保存的主题 ZIP')
  return { state: JSON.parse(fs.readFileSync(draftPath, 'utf8')) }
})
handler('studio:draft-save', input => {
  const text = JSON.stringify(input)
  if (Buffer.byteLength(text) > 48 * 1024 * 1024) throw new Error('草稿超过 48 MB，请减少素材后重试')
  const temporary = draftPath + '.tmp'
  fs.writeFileSync(temporary, text)
  fs.renameSync(temporary, draftPath)
  return {}
})
handler('studio:close', () => { generationController?.abort('user'); descriptionController?.abort('user'); mascotWindow?.close(); readyToClose = true; window.close(); return {} })
app.whenReady().then(() => {
  window = new BrowserWindow({
    width: 1440, height: 940, minWidth: 1000, minHeight: 720,
    title: 'MAS 主题工坊', backgroundColor: '#f5f5f2', autoHideMenuBar: true,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false,
      contextIsolation: true, sandbox: true, spellcheck: false, devTools: !app.isPackaged },
  })
  Menu.setApplicationMenu(null)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, url) => { if (url !== rendererURL) event.preventDefault() })
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  window.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !['file:', 'data:', 'blob:'].some(prefix => details.url.startsWith(prefix)) })
  })
  window.once('ready-to-show', () => window.show())
  window.on('close', event => {
    if (!readyToClose) { event.preventDefault(); window.webContents.send('studio:before-close') }
  })
  window.loadFile(path.join(__dirname, 'index.html'))
})
app.on('window-all-closed', () => app.quit())
