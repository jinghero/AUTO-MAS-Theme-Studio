import type { StudioAPI, PreviewAPI } from '../ipc'
import type {
  StudioState,
  Manifest,
  IconDefinition,
  EditorHooks,
  LibraryHooks,
  GeneratedImage,
} from './studio'

declare global {
  interface Window {
    studio: StudioAPI
    preview: PreviewAPI
    MASPreview: {
      resolveTokens(manifest: Manifest): import('ant-design-vue/es/theme/interface').AliasToken
    }
    themeImages: {
      fit(url: string, max: number): Promise<string>
      inspect(url: string, name?: string): Promise<{ width: number; height: number; bytes: number }>
    }
    themeIconSet: readonly IconDefinition[]
    themePreview: {
      init(): void
      render(state: StudioState): void
      toggle(): void
      resize(): void
      showPage(value: string): void
    }
    themeAI: {
      init(hooks: EditorHooks): void
      render(): void
      selectTab(tab: string): void
      restoreLibrary(): Promise<void>
    }
    themeLibrary: {
      init(hooks: LibraryHooks): void
      save(image: GeneratedImage): Promise<boolean>
      refresh(reset?: boolean): Promise<void>
    }
  }
}
