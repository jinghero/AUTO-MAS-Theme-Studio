import type { Channel, Input, Output, StudioAPI } from './ipc'
import type { Result } from './types/studio'
import { studioChannels } from './ipc'
import { contextBridge, ipcRenderer } from 'electron'
function invoke<K extends Channel>(channel: K, input: Input<K>): Promise<Result<Output<K>>> {
  return ipcRenderer.invoke(channel, input) as Promise<Result<Output<K>>>
}
const studio: StudioAPI = {
  image: (input) => invoke(studioChannels.image, input),
  generate: (input) => invoke(studioChannels.generate, input),
  cancelGeneration: () => invoke(studioChannels.cancelGeneration, undefined),
  describe: (input) => invoke(studioChannels.describe, input),
  cancelDescription: () => invoke(studioChannels.cancelDescription, undefined),
  saveImage: (input) => invoke(studioChannels.saveImage, input),
  saveLibraryImage: (input) => invoke(studioChannels.saveLibraryImage, input),
  listLibraryImages: (input) => invoke(studioChannels.listLibraryImages, input),
  readLibraryImage: (id) => invoke(studioChannels.readLibraryImage, { id }),
  readLibraryReferences: (id) => invoke(studioChannels.readLibraryReferences, { id }),
  openLibraryFolder: () => invoke(studioChannels.openLibraryFolder, undefined),
  openGuide: () => invoke(studioChannels.openGuide, undefined),
  openMascotTool: (state) => invoke(studioChannels.openMascotTool, state),
  exportMascot: (state) => invoke(studioChannels.exportMascot, state),
  open: (input) => invoke(studioChannels.open, input),
  validate: (state) => invoke(studioChannels.validate, state),
  export: (state) => invoke(studioChannels.export, state),
  loadDraft: () => invoke(studioChannels.loadDraft, undefined),
  saveDraft: (state) => invoke(studioChannels.saveDraft, state),
  beforeClose: (callback) => ipcRenderer.on('studio:before-close', () => callback()),
  close: () => invoke(studioChannels.close, undefined),
}
contextBridge.exposeInMainWorld('studio', studio)
