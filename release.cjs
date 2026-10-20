const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')

const tag = process.argv[2]
const version = require('./package.json').version
const appVersion = require('./app/package.json').version
const lock = require('./package-lock.json')
if (tag !== `v${version}` || appVersion !== version || lock.version !== version || lock.packages[''].version !== version) {
  throw new Error(`Release tag ${tag} must match package, app and lockfile version v${version}`)
}
console.log(`Verified release version ${tag}`)

if (process.argv[3]) {
  const directory = path.resolve(process.argv[3])
  const name = 'MAS创作工具箱-便携版.zip'
  const archive = path.join(directory, name)
  if (!fs.statSync(archive).size) throw new Error('Portable ZIP is empty')
  const checksum = createHash('sha256').update(fs.readFileSync(archive)).digest('hex')
  fs.writeFileSync(path.join(directory, 'SHA256SUMS.txt'), `${checksum}  ${name}\n`, 'utf8')
  console.log(`SHA-256 ${checksum}`)
}
