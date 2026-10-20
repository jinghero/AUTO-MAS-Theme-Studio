const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('studio', {
  image: input => ipcRenderer.invoke('studio:image', input),
  generate: input => ipcRenderer.invoke('studio:generate', input),
  cancelGeneration: () => ipcRenderer.invoke('studio:generate-cancel'),
  saveImage: input => ipcRenderer.invoke('studio:image-save', input),
  openMascotTool: state => ipcRenderer.invoke('studio:mascot-tool', state),
  exportMascot: state => ipcRenderer.invoke('studio:mascot-export', state),
  open: input => ipcRenderer.invoke('studio:open', input),
  validate: state => ipcRenderer.invoke('studio:validate', state),
  export: state => ipcRenderer.invoke('studio:export', state),
  loadDraft: () => ipcRenderer.invoke('studio:draft-load'),
  saveDraft: state => ipcRenderer.invoke('studio:draft-save', state),
  beforeClose: callback => ipcRenderer.on('studio:before-close', () => callback()),
  close: () => ipcRenderer.invoke('studio:close'),
})
