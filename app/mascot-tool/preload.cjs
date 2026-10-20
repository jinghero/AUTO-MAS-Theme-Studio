const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('preview', {
  load: (name, bytes) => ipcRenderer.invoke('preview:load', { name, bytes }),
  onLoad: callback => ipcRenderer.on('mascot:load', (_event, pack) => callback(pack)),
})
