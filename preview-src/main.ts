import { createApp, computed, defineComponent, h, watch } from 'vue'
import Antd, { ConfigProvider } from 'ant-design-vue'
import { createI18n } from 'vue-i18n'
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import AppLayout from './components/AppLayout.vue'
import { current, config, findAsset, resolveTokens } from './theme'
import { router } from './router'
import messages from './messages.json'
import logo from './assets/AUTO-MAS.ico'
import { createAppearanceBackgroundApplier } from './appearanceBackground'
import './styles/appearanceSurfaces.css'
import './preview.css'
export { resolveTokens }
const applyBackground = createAppearanceBackgroundApplier()

function syncVariables() {
  const manifest = current.value.manifest,
    tokens = resolveTokens(manifest)
  const root = document.documentElement
  applyBackground(root.style, manifest.background ? findAsset(manifest.background.path) : undefined)
  root.classList.toggle('dark', manifest.mode === 'dark')
  root.classList.toggle('appearance-background-custom', !!manifest.background)
  if (manifest.tokens.colorPageTitle)
    root.style.setProperty('--app-page-title-color', manifest.tokens.colorPageTitle)
  else root.style.removeProperty('--app-page-title-color')
  for (const [key, value] of Object.entries(tokens))
    if (key.startsWith('color') && typeof value === 'string') {
      root.style.setProperty(
        `--ant-${key.replace(/[A-Z]/g, (value) => '-' + value.toLowerCase())}`,
        value,
      )
    }
  const opacity = manifest.background ? (manifest.background.surfaceOpacity ?? 0.72) : undefined
  root.style.setProperty(
    '--app-appearance-surface-bg',
    opacity === undefined
      ? tokens.colorBgContainer
      : `color-mix(in srgb, ${tokens.colorBgContainer} ${opacity * 100}%, transparent)`,
  )
  root.style.setProperty(
    '--app-appearance-elevated-surface-bg',
    opacity === undefined
      ? tokens.colorBgElevated
      : `color-mix(in srgb, ${tokens.colorBgElevated} ${opacity * 100}%, transparent)`,
  )
  document.body.style.backgroundColor = tokens.colorBgLayout
  for (const key of ['default', 'pointer', 'text'] as const) {
    const cursor = manifest.cursors?.[key]
    root.style.setProperty(
      `--cursor-${key}`,
      cursor
        ? `url("${findAsset(cursor.path)}") ${cursor.hotspotX ?? 0} ${cursor.hotspotY ?? 0}, ${key}`
        : key,
    )
  }
}
if (document.getElementById('app') && location.pathname.endsWith('/mas-preview/index.html')) {
  const Root = defineComponent({
    setup() {
      const activeConfig = computed(() => config(current.value.manifest))
      const background = computed(() => ({
        backgroundImage: 'var(--app-appearance-background-image)',
        opacity: current.value.manifest.background?.opacity ?? 1,
        backgroundPosition: current.value.manifest.background?.position ?? 'right bottom',
        backgroundSize: current.value.manifest.background?.size ?? 'cover',
      }))
      watch(current, syncVariables, { immediate: true, flush: 'sync' })
      return () =>
        h(
          ConfigProvider,
          { theme: activeConfig.value, locale: zhCN },
          {
            default: () => [
              h('div', { class: 'mas-background', style: background.value }),
              h('div', { class: 'mas-app' }, [
                h('div', { class: 'title-bar' }, [
                  h('div', { class: 'title-bar-left' }, [
                    h('span', { class: 'logo-glow' }),
                    h('img', { src: logo, width: 20, height: 20 }),
                    h('strong', 'AUTO-MAS'),
                    h('span', { class: 'version-text' }, '主题预览'),
                  ]),
                  h('span', { class: 'window-controls' }, '─　□　×'),
                ]),
                h(AppLayout),
              ]),
            ],
          },
        )
    },
  })
  const app = createApp(Root)
  app
    .use(Antd)
    .use(router)
    .use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': messages } }))
  void router
    .push('/home')
    .then(() => app.mount('#app'))
    .catch((error) => console.error(error))
  watch(
    () => router.currentRoute.value.path,
    (page) => parent.postMessage({ type: 'mas-preview-page', page }, '*'),
  )
  window.addEventListener('message', (event) => {
    if (event.source !== parent || event.data?.type !== 'mas-theme-preview') return
    current.value = event.data.state
    if (event.data.page && router.currentRoute.value.path !== event.data.page)
      void router.push(event.data.page).catch((error) => console.error(error))
  })
  parent.postMessage({ type: 'mas-preview-ready' }, '*')
}
