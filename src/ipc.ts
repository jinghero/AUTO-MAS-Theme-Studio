import type {
  GeneratedImage,
  ImageRequest,
  LibraryEntry,
  LibrarySaveInput,
  MascotPack,
  MascotState,
  Result,
  StudioState,
} from './types/studio'

type Call<Input, Output> = { input: Input; output: Output }
export type Saved<T> = { canceled: true } | ({ canceled: false; filePath: string } & T)
export type Opened = { kind: 'theme'; state: StudioState } | { kind: 'mascot'; state: MascotState }
export interface StudioContract {
  'preview:load': Call<{ name: string; bytes: Uint8Array }, { pack: MascotPack }>
  'studio:image': Call<{ url: string }, { info: { bytes: number } }>
  'studio:generate': Call<ImageRequest, { image: { url: string; mime: string; bytes: number } }>
  'studio:generate-cancel': Call<undefined, object>
  'studio:describe': Call<ImageRequest, { prompt: string }>
  'studio:describe-cancel': Call<undefined, object>
  'studio:image-save': Call<{ url: string }, Saved<{ bytes: number }>>
  'studio:library-save': Call<LibrarySaveInput, { entry: LibraryEntry }>
  'studio:library-list': Call<
    { offset?: number },
    { entries: LibraryEntry[]; offset: number; total: number; skipped: number; directory: string }
  >
  'studio:library-read': Call<
    { id: string },
    { entry: LibraryEntry; image: Pick<GeneratedImage, 'url' | 'bytes'> & { mime: string } }
  >
  'studio:library-references': Call<
    { id: string },
    { referenceImages: import('./types/studio').ReferenceImage[]; referencesStored: boolean }
  >
  'studio:library-folder': Call<undefined, object>
  'studio:mascot-tool': Call<StudioState | undefined, object>
  'studio:mascot-export': Call<StudioState, Saved<{ count: number }>>
  'studio:open': Call<{ bytes: Uint8Array; kind: 'theme' | 'mascot' }, Opened>
  'studio:validate': Call<StudioState, { count: number; bytes: number }>
  'studio:export': Call<StudioState, Saved<{ count: number; bytes: number }>>
  'studio:draft-load': Call<undefined, { state: StudioState | null }>
  'studio:draft-save': Call<StudioState, object>
  'studio:close': Call<undefined, object>
}
export type Channel = keyof StudioContract
export type Input<K extends Channel> = StudioContract[K]['input']
export type Output<K extends Channel> = StudioContract[K]['output']
export type Handler<K extends Channel> = (input: Input<K>) => Output<K> | Promise<Output<K>>
export type RegisterHandler = <K extends Channel>(channel: K, callback: Handler<K>) => void

export const studioChannels = {
  image: 'studio:image',
  generate: 'studio:generate',
  cancelGeneration: 'studio:generate-cancel',
  describe: 'studio:describe',
  cancelDescription: 'studio:describe-cancel',
  saveImage: 'studio:image-save',
  saveLibraryImage: 'studio:library-save',
  listLibraryImages: 'studio:library-list',
  readLibraryImage: 'studio:library-read',
  readLibraryReferences: 'studio:library-references',
  openLibraryFolder: 'studio:library-folder',
  openMascotTool: 'studio:mascot-tool',
  exportMascot: 'studio:mascot-export',
  open: 'studio:open',
  validate: 'studio:validate',
  export: 'studio:export',
  loadDraft: 'studio:draft-load',
  saveDraft: 'studio:draft-save',
  close: 'studio:close',
} as const satisfies Record<string, Channel>
type Arguments<T> = undefined extends T ? [input?: T] : [input: T]
type Method<K extends Channel> = (...args: Arguments<Input<K>>) => Promise<Result<Output<K>>>
type Methods = { [M in keyof typeof studioChannels]: Method<(typeof studioChannels)[M]> }
export type StudioAPI = Omit<Methods, 'readLibraryImage' | 'readLibraryReferences'> & {
  readLibraryImage(id: string): ReturnType<Methods['readLibraryImage']>
  readLibraryReferences(id: string): ReturnType<Methods['readLibraryReferences']>
  beforeClose(callback: () => void): void
}
export type PreviewAPI = {
  load(name: string, bytes: Uint8Array): Promise<Result<Output<'preview:load'>>>
  onLoad(callback: (pack: MascotPack) => void): void
}
