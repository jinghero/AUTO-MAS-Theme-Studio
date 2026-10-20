const fs = require('node:fs')
const path = require('node:path')
const cp = require('node:child_process')
const { createRequire } = require('node:module')
const repo = process.env.AUTO_MAS_REPO || path.resolve(__dirname, '../AUTO-MAS')
const dep = createRequire(path.join(__dirname, 'package.json'))
const ts = dep('typescript')
const app = path.join(__dirname, 'app')
const revision = cp.execFileSync('git', ['rev-parse', 'upstream/dev'], { cwd: repo, encoding: 'utf8' }).trim()
for (const name of ['assetPackageService', 'appearanceService', 'mascotManifest', 'mascotMenuDefinition']) {
  const sourcePath = `frontend/electron/services/${name}.ts`
  const source = cp.execFileSync('git', ['show', `${revision}:${sourcePath}`], { cwd: repo, encoding: 'utf8' })
  fs.writeFileSync(path.join(app, 'compat', `${name}.js`), ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText)
  fs.writeFileSync(path.join(app, 'compat', `${name}.ts`), source)
}
fs.copyFileSync(path.join(repo, 'LICENSE'), path.join(app, 'LICENSE'))
fs.writeFileSync(path.join(app, 'compat', 'SOURCE.txt'), `AUTO-MAS-Project/AUTO-MAS\nCommit: ${revision}\nSource: frontend/electron/services\nLicense: AGPL-3.0\nCompiled from the included TypeScript files with TypeScript ${ts.version}.\n`)
const vendor = path.join(app, 'node_modules', 'adm-zip')
fs.mkdirSync(path.dirname(vendor), { recursive: true })
fs.cpSync(path.dirname(dep.resolve('adm-zip')), vendor, { recursive: true })
console.log(`Compatibility snapshot: ${revision}`)
