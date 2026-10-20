import type { PreviewAPI, Output } from '../ipc'
import type { Result } from '../types/studio'
import { contextBridge, ipcRenderer } from 'electron'
const preview: PreviewAPI = {
  load: (name, bytes) =>
    ipcRenderer.invoke('preview:load', { name, bytes }) as Promise<Result<Output<'preview:load'>>>,
  onLoad: (callback) => ipcRenderer.on('mascot:load', (_event, pack) => callback(pack)),
}
contextBridge.exposeInMainWorld('preview', preview)
