import fs from 'node:fs'
import path from 'node:path'

function inside(parent: string, target: string): boolean {
  const relative = path.relative(parent, target)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}
function checked(root: string, target: string): string {
  const build = path.join(fs.realpathSync(root), '.build')
  const resolved = path.resolve(target)
  if (
    !inside(build, resolved) ||
    !inside(build, path.join(fs.realpathSync(path.dirname(resolved)), path.basename(resolved)))
  )
    throw new Error('Build output must stay inside the workspace .build directory')
  if (fs.existsSync(resolved) && fs.lstatSync(resolved).isSymbolicLink())
    throw new Error('Build output cannot be a symbolic link')
  return resolved
}
export function createStage(root: string, name: string): string {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error('Invalid build stage name')
  const build = path.join(fs.realpathSync(root), '.build')
  fs.mkdirSync(build, { recursive: true })
  if (fs.realpathSync(build) !== build)
    throw new Error('The .build directory cannot redirect outside the workspace')
  return fs.mkdtempSync(path.join(build, `${name}-`))
}
export function discardStage(root: string, directory: string): void {
  fs.rmSync(checked(root, directory), { recursive: true, force: true })
}
export function publishGenerated(root: string, stage: string, destination: string): void {
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  const source = checked(root, stage),
    target = checked(root, destination)
  fs.rmSync(target, { recursive: true, force: true })
  fs.renameSync(source, target)
}
