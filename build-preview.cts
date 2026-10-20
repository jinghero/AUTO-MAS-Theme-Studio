const path = require('node:path') as typeof import('node:path')
const fs = require('node:fs') as typeof import('node:fs')
const { createRequire } = require('node:module') as typeof import('node:module')
const { pathToFileURL } = require('node:url') as typeof import('node:url')
const dep = createRequire(path.join(__dirname, 'package.json'))
async function build() {
  const { createStage, publishGenerated, discardStage } = await import('./tools/build-output.mts')
  const output = createStage(__dirname, 'preview')
  try {
    const { build } = await import(pathToFileURL(dep.resolve('vite')).href)
    const vue = (await import(pathToFileURL(dep.resolve('@vitejs/plugin-vue')).href)).default
    const packages = ['vue', 'vue-router', 'vue-i18n', 'ant-design-vue', '@ant-design/icons-vue']
    const aliases = Object.fromEntries(
      packages.map((name) => [name, path.dirname(dep.resolve(`${name}/package.json`))]),
    )
    aliases['@'] = path.join(__dirname, 'preview-src')
    await build({
      configFile: false,
      root: path.join(__dirname, 'preview-src'),
      plugins: [vue()],
      define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
        __VUE_OPTIONS_API__: true,
        __VUE_PROD_DEVTOOLS__: false,
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
      },
      resolve: { alias: aliases, dedupe: ['vue'] },
      build: {
        outDir: output,
        emptyOutDir: true,
        lib: {
          entry: path.join(__dirname, 'preview-src/main.ts'),
          name: 'MASPreview',
          formats: ['iife'],
          fileName: () => 'runtime.js',
          cssFileName: 'runtime',
        },
        chunkSizeWarningLimit: 2500,
      },
    })
    fs.copyFileSync(path.join(__dirname, 'preview-src/frame.html'), path.join(output, 'index.html'))
    const licensePath = path.join(output, 'licenses')
    fs.mkdirSync(licensePath, { recursive: true })
    for (const name of packages) {
      const directory = path.dirname(dep.resolve(`${name}/package.json`))
      for (const filename of ['LICENSE', 'LICENSE.txt', 'LICENSE.md'])
        if (fs.existsSync(path.join(directory, filename))) {
          fs.copyFileSync(
            path.join(directory, filename),
            path.join(licensePath, `${name.replaceAll('/', '-')}.txt`),
          )
          break
        }
    }
    publishGenerated(__dirname, output, path.join(__dirname, '.build/app/mas-preview'))
  } catch (error) {
    discardStage(__dirname, output)
    throw error
  }
}
build().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
