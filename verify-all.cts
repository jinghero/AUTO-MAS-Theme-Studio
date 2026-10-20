const fs = require('node:fs') as typeof import('node:fs')
const path = require('node:path') as typeof import('node:path')
const { spawnSync } = require('node:child_process') as typeof import('node:child_process')
const { readPackage } =
  require('./.build/app/package-service.cjs') as typeof import('./src/package-service.cjs')

fs.mkdirSync(path.join(__dirname, 'qa'), { recursive: true })
const run = fs.mkdtempSync(path.join(__dirname, 'qa', 'verify-run-'))
const packaged = process.argv.includes('--packaged')
const suites = [
  'quality',
  'verify',
  'verify-mas',
  'verify-ai',
  'verify-icons',
  'verify-theme',
  'verify-extra',
  'verify-titles',
  'verify-drafts',
]
const selected = process.argv
  .find((argument) => argument.startsWith('--suite='))
  ?.slice('--suite='.length)
if (selected && !suites.includes(selected))
  throw new Error(`Unknown verification suite: ${selected}`)
const fixtures = readPackage(fs.readFileSync(path.join(__dirname, '示例主题-林间来信.zip')))
const images = {
  background: fixtures.manifest.background?.path,
  icon: fixtures.manifest.menuIcons?.default,
  mascot: fixtures.manifest.mascot?.path,
  cursor: fixtures.manifest.cursors?.default?.path,
}
for (const suite of selected
  ? [selected]
  : suites.filter((suite) => !packaged || !['quality', 'verify-extra'].includes(suite))) {
  const qa = path.join(run, suite),
    data = path.join(qa, 'data')
  fs.mkdirSync(data, { recursive: true })
  fs.writeFileSync(path.join(data, 'draft.json'), JSON.stringify(fixtures))
  for (const [name, asset] of Object.entries(images)) {
    if (!asset || !fixtures.assets[asset]) throw new Error(`Example fixture is missing ${name}`)
    fs.writeFileSync(
      path.join(qa, `${name}.png`),
      Buffer.from(fixtures.assets[asset].split(',')[1], 'base64'),
    )
  }
  const script = suite === 'quality' ? 'tests/quality.mts' : `${suite}.cts`
  const result = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      path.join(__dirname, script),
      ...(packaged ? ['--packaged'] : []),
    ],
    {
      stdio: 'inherit',
      windowsHide: true,
      env: {
        ...process.env,
        STUDIO_QA_DIR: qa,
        STUDIO_DATA_DIR: data,
        ELECTRON_RUN_AS_NODE: undefined,
      },
    },
  )
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
console.log(`Verification reports: ${run}`)
