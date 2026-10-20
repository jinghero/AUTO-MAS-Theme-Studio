import { computed, ref, shallowRef } from 'vue'
import { theme } from 'ant-design-vue'
import formatToken from 'ant-design-vue/es/theme/util/alias'
export const current = shallowRef<any>({ manifest: { mode: 'light', tokens: { colorPrimary: '#1677ff' } }, assets: {} })
export const findAsset = (name?: string) => name ? current.value.assets[name] || current.value.assets[Object.keys(current.value.assets).find(key => key.toLowerCase() === name.toLowerCase()) || ''] : ''
export const config = (manifest: any) => ({
  algorithm: manifest.mode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
  token: { colorPrimary: '#1677ff', ...manifest.tokens },
  components: { InputNumber: { handleVisible: true as const } },
})
export const resolveTokens = (manifest: any) => {
  const options = config(manifest)
  const derived = options.algorithm({ ...theme.defaultSeed, ...options.token })
  return formatToken({ ...derived, override: options.token })
}
export function useTheme() {
  return {
    isDark: computed(() => current.value.manifest.mode === 'dark'),
    activeAppearance: computed(() => ({ ...current.value.manifest, menuIconUrls: Object.fromEntries(Object.entries(current.value.manifest.menuIcons || {}).map(([key, value]) => [key, findAsset(value as string)])) })),
    themeColor: ref('custom'), themeColors: { get custom() { return current.value.manifest.tokens.colorPrimary } },
  }
}
