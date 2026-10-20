const path = require('node:path')
const { createRequire } = require('node:module')
const { spawn } = require('node:child_process')
const dependency = createRequire(path.join(__dirname, 'package.json'))
const environment = { ...process.env }
delete environment.ELECTRON_RUN_AS_NODE
const child = spawn(dependency('electron'), [path.join(__dirname, 'app')], { stdio: 'inherit', env: environment, windowsHide: true })
child.on('error', error => { console.error(error.message); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
