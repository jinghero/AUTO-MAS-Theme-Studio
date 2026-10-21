import fs from 'node:fs'
import path from 'node:path'
import { marked } from 'marked'
import { createStage, discardStage, publishGenerated } from './build-output.mts'

export function buildGuide(root: string): void {
  const output = createStage(root, 'guide')
  try {
    const content = marked.parse(fs.readFileSync(path.join(root, 'guide.md'), 'utf8'), {
      async: false,
    })
    fs.writeFileSync(
      path.join(output, 'guide.html'),
      `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>使用说明 · MAS 主题工坊</title>
<style>
:root { color-scheme: light dark; font: 16px/1.8 system-ui, sans-serif; }
body { max-width: 1040px; margin: 0 auto; padding: 32px 24px 64px; }
h1, h2, h3 { line-height: 1.4; } h2 { margin-top: 2em; }
a { color: light-dark(#25674e, #9edabb); } img { display: block; max-width: 100%; height: auto; border: 1px solid #8885; border-radius: 8px; }
table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #8885; padding: 8px 12px; text-align: left; }
code, pre { background: #8882; border-radius: 4px; } code { padding: 2px 4px; } pre { padding: 16px; overflow: auto; } pre code { padding: 0; background: none; }
li { margin: 6px 0; }
</style></head><body><main>${content}</main></body></html>`,
    )
    fs.cpSync(path.join(root, 'docs'), path.join(output, 'docs'), { recursive: true })
    publishGenerated(root, output, path.join(root, '.build/guide'))
  } catch (error) {
    discardStage(root, output)
    throw error
  }
}
