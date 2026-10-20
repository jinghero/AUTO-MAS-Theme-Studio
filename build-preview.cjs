const path = require('node:path')
const fs = require('node:fs')
const { createRequire } = require('node:module')
const { pathToFileURL } = require('node:url')
const dep = createRequire(path.join(__dirname, 'package.json'))
async function build() {
  const { build } = await import(pathToFileURL(dep.resolve('vite')).href)
  const vue = (await import(pathToFileURL(dep.resolve('@vitejs/plugin-vue')).href)).default
  const packages = ['vue', 'vue-router', 'vue-i18n', 'ant-design-vue', '@ant-design/icons-vue']
  const aliases = Object.fromEntries(packages.map(name => [name, path.dirname(dep.resolve(`${name}/package.json`))]))
  aliases['@'] = path.join(__dirname, 'preview-src')
  await build({
    configFile: false, root: path.join(__dirname, 'preview-src'), plugins: [vue()],
    define: { 'process.env.NODE_ENV': JSON.stringify('production'), __VUE_OPTIONS_API__: true, __VUE_PROD_DEVTOOLS__: false, __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false },
    resolve: { alias: aliases, dedupe: ['vue'] },
    build: { outDir: path.join(__dirname, 'app/mas-preview'), emptyOutDir: true,
      lib: { entry: path.join(__dirname, 'preview-src/main.ts'), name: 'MASPreview', formats: ['iife'], fileName: () => 'runtime.js', cssFileName: 'runtime' },
      chunkSizeWarningLimit: 2500,
    },
  })
  fs.copyFileSync(path.join(__dirname, 'preview-src/frame.html'), path.join(__dirname, 'app/mas-preview/index.html'))
  const licensePath = path.join(__dirname, 'app/mas-preview/licenses')
  fs.mkdirSync(licensePath, { recursive: true })
  for (const name of packages) {
    const directory = path.dirname(dep.resolve(`${name}/package.json`))
    for (const filename of ['LICENSE', 'LICENSE.txt', 'LICENSE.md']) if (fs.existsSync(path.join(directory, filename))) {
      fs.copyFileSync(path.join(directory, filename), path.join(licensePath, `${name.replaceAll('/', '-')}.txt`)); break
    }
  }
}
build().catch(error => { console.error(error); process.exitCode = 1 })
