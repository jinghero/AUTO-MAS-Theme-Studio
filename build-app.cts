const fs = require('node:fs') as typeof import('node:fs')
const path = require('node:path') as typeof import('node:path')
const { buildSync } = require('esbuild') as typeof import('esbuild')

async function build() {
  const root = __dirname
  const { createStage, publishGenerated, discardStage } = await import('./tools/build-output.mts')
  const output = createStage(root, 'app')
  try {
    fs.mkdirSync(output, { recursive: true })
    fs.cpSync(path.join(root, 'app'), output, {
      recursive: true,
      filter: (file) =>
        !path.relative(path.join(root, 'app'), file).split(path.sep).includes('node_modules'),
    })
    const nodeEntries = fs
      .readdirSync(path.join(root, 'src'), { recursive: true })
      .map(String)
      .filter((name) => name.endsWith('.cts') && !name.endsWith('preload.cts'))
    buildSync({
      entryPoints: nodeEntries.map((name) => path.join(root, 'src', name)),
      outbase: path.join(root, 'src'),
      outdir: output,
      platform: 'node',
      format: 'cjs',
      target: 'node22',
      outExtension: { '.js': '.cjs' },
    })
    buildSync({
      entryPoints: [
        'errors',
        'generation',
        'prompt-plan',
        'icons',
        'cursors',
        'ipc',
        'editor-state',
        'draft-queue',
        'async-ui',
      ].map((name) => path.join(root, 'src', `${name}.ts`)),
      outdir: output,
      platform: 'node',
      format: 'cjs',
      target: 'node22',
    })
    // Compatibility JS is always compiled from the included TS snapshot.
    buildSync({
      entryPoints: fs
        .readdirSync(path.join(root, 'src/compat'))
        .filter((name) => name.endsWith('.ts'))
        .map((name) => path.join(root, 'src/compat', name)),
      outdir: path.join(output, 'compat'),
      platform: 'node',
      format: 'cjs',
      target: 'node22',
    })
    fs.copyFileSync(
      path.join(root, 'src/compat/SOURCE.txt'),
      path.join(output, 'compat/SOURCE.txt'),
    )
    buildSync({
      entryPoints: ['preload.cts', 'mascot-tool/preload.cts'].map((name) =>
        path.join(root, 'src', name),
      ),
      outbase: path.join(root, 'src'),
      outdir: output,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      external: ['electron'],
      target: 'node22',
      outExtension: { '.js': '.cjs' },
    })
    const renderers = ['renderer', 'mascot-tool/renderer']
    buildSync({
      entryPoints: renderers.map((name) => path.join(root, 'src', `${name}.ts`)),
      outbase: path.join(root, 'src'),
      outdir: output,
      bundle: true,
      platform: 'browser',
      format: 'iife',
      target: 'chrome138',
    })
    const vendor = path.join(output, 'node_modules/adm-zip')
    fs.mkdirSync(path.dirname(vendor), { recursive: true })
    fs.cpSync(path.dirname(require.resolve('adm-zip')), vendor, { recursive: true })
    const { buildGuide } = await import('./tools/guide.mts')
    buildGuide(root)
    publishGenerated(root, output, path.join(root, '.build/app'))
    console.log('Built application and compatibility snapshot in .build/app')
  } catch (error) {
    discardStage(root, output)
    throw error
  }
}
build().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
