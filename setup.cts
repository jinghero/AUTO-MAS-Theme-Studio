const fs = require('node:fs') as typeof import('node:fs')
const path = require('node:path') as typeof import('node:path')
const cp = require('node:child_process') as typeof import('node:child_process')
const repo = process.env.AUTO_MAS_REPO || path.resolve(__dirname, '../AUTO-MAS')
const app = path.join(__dirname, 'src')
const revision = cp
  .execFileSync('git', ['rev-parse', 'upstream/dev'], { cwd: repo, encoding: 'utf8' })
  .trim()
for (const name of [
  'assetPackageService',
  'appearanceService',
  'mascotManifest',
  'mascotMenuDefinition',
]) {
  const sourcePath = `frontend/electron/services/${name}.ts`
  const source = cp.execFileSync('git', ['show', `${revision}:${sourcePath}`], {
    cwd: repo,
    encoding: 'utf8',
  })
  fs.writeFileSync(path.join(app, 'compat', `${name}.ts`), source)
}
fs.copyFileSync(path.join(repo, 'LICENSE'), path.join(__dirname, 'app/LICENSE'))
fs.writeFileSync(
  path.join(app, 'compat', 'SOURCE.txt'),
  `AUTO-MAS-Project/AUTO-MAS\nCommit: ${revision}\nSource: frontend/electron/services\nTypes: frontend/src/types/mascotPack.d.ts\nLicense: AGPL-3.0\nRuntime JavaScript is built from this TypeScript snapshot by npm run build:app.\n`,
)
fs.writeFileSync(
  path.join(app, 'types/mascotPack.d.ts'),
  cp.execFileSync('git', ['show', `${revision}:frontend/src/types/mascotPack.d.ts`], { cwd: repo }),
)
console.log(`Updated TS compatibility snapshot: ${revision}. Run npm run build:app to compile.`)
