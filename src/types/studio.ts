import type { MascotDefinition, MascotManifest } from './mascotPack'

export type Target = 'background' | 'cover' | 'icon' | 'mascot' | 'cursor'
export type MenuIconKey =
  | 'default'
  | 'home'
  | 'scripts'
  | 'plans'
  | 'emulators'
  | 'queue'
  | 'scheduler'
  | 'gameSign'
  | 'history'
  | 'tools'
  | 'themeStore'
  | 'settings'
  | 'testRouter'
  | 'ocrDev'
  | 'overlayMaskDev'
  | 'updateDownloadDev'
export interface Manifest {
  formatVersion: 1
  id: string
  name: string
  description?: string
  mode: 'light' | 'dark'
  tokens: {
    colorPrimary: string
    colorPageTitle?: string
    colorBgLayout?: string
    colorBgContainer?: string
    colorBgElevated?: string
    colorText?: string
    colorTextSecondary?: string
    colorBorder?: string
    colorBorderSecondary?: string
    borderRadius?: number
  }
  background?: {
    path: string
    opacity?: number
    surfaceOpacity?: number
    position?: string
    size?: 'cover' | 'contain' | 'auto'
  }
  preview?: string
  mascot?: MascotDefinition
  menuIcons?: Partial<Record<MenuIconKey, string>>
  cursors?: Partial<
    Record<'default' | 'pointer' | 'text', { path: string; hotspotX?: number; hotspotY?: number }>
  >
}
export interface ImageInfo {
  width: number
  height: number
  bytes: number
}
export interface ReferenceImage extends ImageInfo {
  name: string
  url: string
}
export interface ReferenceMetadata extends ImageInfo {
  id: string
  extension: string
  name: string
}
export interface ImageMetadata extends ImageInfo {
  target: Target
  iconKey?: string
  prompt?: string
  basePrompt?: string
  iconSubject?: string
  cursorKey?: string
  cursorSubject?: string
  model?: string
  style?: string
}
export type LibrarySaveInput = Omit<GeneratedImage, 'bytes'> & { thumbnail: string; bytes?: number }
export interface LibraryEntry extends ImageMetadata {
  id: string
  createdAt: string
  extension: string
  references: ReferenceMetadata[]
  referencesStored: boolean
  thumbnail?: string
}
export interface GeneratedImage extends ImageMetadata {
  kind?: undefined
  url: string
  mime?: string
  libraryId?: string
  libraryError?: string
  referenceImages?: ReferenceImage[]
  references?: ReferenceMetadata[]
  referencesStored?: boolean
  items?: undefined
  archiveSource?: undefined
  key?: string
}
export interface IconResult {
  key: string
  label: string
  status: 'pending' | 'generating' | 'ready' | 'error'
  selected: boolean
  width?: number
  height?: number
  bytes?: number
  url?: string
  error?: string
  libraryId?: string
  archiveSource?: GeneratedImage
  libraryError?: string
  referenceImages?: ReferenceImage[]
  target?: Target
  iconKey?: string
  cursorKey?: string
}
export interface AssetBatch {
  kind: 'icon-batch' | 'cursor-batch'
  target: 'icon' | 'cursor'
  referenceCount: number
  items: IconResult[]
  libraryError?: undefined
}
export interface TargetPrompt {
  style: string
  prompt: string
}
export interface PromptPlan {
  targets: Record<Target, TargetPrompt>
  iconPrompts: Record<string, string>
  cursorPrompts: Record<string, string>
}
export interface GeneratorSettings {
  baseURL: string
  model: string
  target: Target
  style: string
  size: string
  quality: string
  responseFormat: string
  transparent: boolean
  visionModel: string
  visionSeparate: boolean
  visionBaseURL: string
  iconBatch: boolean
  iconKey: string
  cursorBatch: boolean
  cursorKey: string
  prompt?: string
  iconPrompts?: Record<string, string>
  cursorPrompts?: Record<string, string>
  targetPrompts?: Partial<Record<Target, TargetPrompt>>
}
export interface StudioState {
  manifest: Manifest
  assets: Record<string, string>
  generator?: GeneratorSettings
  aiResult?: GeneratedImage | AssetBatch
}
export interface MascotState {
  manifest: MascotManifest
  assets: Record<string, string>
}
export interface EditorHooks {
  getState(): StudioState
  changed(): void
  toast(message: string, error?: boolean): void
  importImage(file: File, slot: Target): Promise<void>
  importIcons(entries: { key: string; url: string }[]): Promise<void>
  importCursors(entries: { key: string; url: string }[]): Promise<void>
  selectTab(tab: string): void
}
export interface LibraryHooks extends EditorHooks {
  busy(): boolean
  useImage(image: GeneratedImage): void
  usePrompt(entry: LibraryEntry): void
}
export interface IconDefinition {
  key: string
  label: string
  purpose: string
  subject: string
}
export interface ImageRequest {
  target?: Target
  apiKey: string
  baseURL: string
  model: string
  prompt?: string
  instructions?: string
  size?: string
  quality?: string
  responseFormat?: string
  transparent?: boolean
  referenceImages?: Pick<ReferenceImage, 'url'>[]
}
export interface MascotPack<Image = string> {
  name: string
  source: string
  raw: boolean
  demo?: boolean
  columns: number
  frameCount: number
  idleFps: number
  workingFps: number
  width: number
  opacity: number
  images: { static: Image; main?: Image; result?: Image; drag?: Image; look?: Image }
}
export type Result<T = object> = ({ success: true } & T) | { success: false; error: string }
