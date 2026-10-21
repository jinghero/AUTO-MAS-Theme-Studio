import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { createStage, discardStage, publishGenerated } from '../tools/build-output.mts'

const require = createRequire(import.meta.url)
const { parseDraft, serializeDraft, parseLibraryEntry } =
  require('../.build/app/state.cjs') as typeof import('../src/state.cjs')
const { newState, refPaths, prune, asset } =
  require('../.build/app/editor-state.js') as typeof import('../src/editor-state.js')
const { iconPrompt, assetPrompt, defaults, targetKeys, rememberTargetPrompt } =
  require('../.build/app/generation.js') as typeof import('../src/generation.js')
const { parsePromptPlan } =
  require('../.build/app/prompt-plan.js') as typeof import('../src/prompt-plan.js')
const { iconSet } = require('../.build/app/icons.js') as typeof import('../src/icons.js')
const { cursorSet } = require('../.build/app/cursors.js') as typeof import('../src/cursors.js')
const { createDraftQueue } =
  require('../.build/app/draft-queue.js') as typeof import('../src/draft-queue.js')
const { uiTask } = require('../.build/app/async-ui.js') as typeof import('../src/async-ui.js')
const qa = process.env.STUDIO_QA_DIR
if (!qa) throw new Error('Run through npm run check:quality')
const png = `data:image/png;base64,${fs.readFileSync(path.join(qa, 'cursor.png')).toString('base64')}`

test('versionless drafts retain incomplete edits and migrate generator defaults without saving keys', () => {
  const state = newState(1)
  state.manifest.id = ''
  state.manifest.name = ''
  const legacy = {
    ...state,
    generator: { prompt: '保留原提示词', target: 'background', apiKey: 'do-not-save' },
    aiResult: { target: 'background', url: png, width: 32, height: 32, bytes: 20 },
  }
  const parsed = parseDraft(legacy)
  assert.equal(parsed.manifest.id, '')
  assert.equal(parsed.manifest.name, '')
  assert.deepEqual(parsed.manifest, state.manifest)
  assert.equal(Object.hasOwn(parsed.manifest.tokens, 'colorPageTitle'), false)
  assert.equal(parsed.generator?.prompt, '保留原提示词')
  assert.equal(parsed.generator?.visionSeparate, false)
  assert(parsed.aiResult && parsed.aiResult.kind === undefined)
  assert.equal(parsed.aiResult.libraryId, undefined)
  assert(!serializeDraft(legacy).includes('do-not-save'))
  assert.equal(JSON.parse(serializeDraft(legacy)).draftVersion, 1)
  assert.equal(parsed.aiResult.prompt, undefined)
})

test('draft parsing rejects corrupt structures and unknown versions', () => {
  const valid = newState(1)
  for (const invalid of [
    null,
    [],
    { ...valid, assets: [] },
    { ...valid, draftVersion: 2 },
    { ...valid, manifest: { ...valid.manifest, tokens: { colorPrimary: 42 } } },
    { ...valid, generator: { target: 'invalid' } },
    { ...valid, assets: { 'assets/x.png': 'file:///private' } },
    { ...valid, aiResult: { kind: 'unexpected' } },
  ])
    assert.throws(() => parseDraft(invalid))
})

test('legacy library records retain their reference semantics; corrupt records are rejected', () => {
  const id = 'a'.repeat(64)
  const legacy = {
    id,
    target: 'cover',
    width: 32,
    height: 32,
    bytes: 20,
    extension: 'png',
    createdAt: '2026-10-20T00:00:00Z',
  }
  const parsed = parseLibraryEntry(legacy, id)
  assert.equal(parsed.referencesStored, false)
  assert.deepEqual(parsed.references, [])
  for (const invalid of [
    { ...legacy, bytes: -1 },
    { ...legacy, width: 1.5 },
    { ...legacy, extension: '../draft' },
    { ...legacy, references: [{}] },
    { ...legacy, createdAt: [] },
  ])
    assert.throws(() => parseLibraryEntry(invalid, id))
})

test('asset pruning preserves every animation and menu/cursor asset with case-insensitive lookup', () => {
  const state = newState(1)
  state.manifest.mascot = {
    path: 'assets/pet.png',
    animation: {
      path: 'assets/main.png',
      columns: 8,
      frameCount: 120,
      resultPath: 'assets/result.png',
      dragPath: 'assets/drag.png',
      lookPath: 'assets/look.png',
    },
  }
  state.manifest.menuIcons = { home: 'assets/HOME.png' }
  state.manifest.cursors = { default: { path: 'assets/cursor.png' } }
  for (const file of [...refPaths(state.manifest), 'assets/unused.png'])
    state.assets[file.toLowerCase()] = png
  prune(state)
  assert.equal(Object.keys(state.assets).length, 7)
  assert.equal(asset(state, 'ASSETS/HoMe.PNG'), png)
  assert.equal(state.manifest.mascot.animation?.frameCount, 120)
})

test('icon prompts keep per-icon intent and do not mutate generation settings', () => {
  const config = { ...defaults, prompt: '共同风格', iconPrompts: { home: '专属房屋' } }
  const before = structuredClone(config)
  assert(iconPrompt(config, 'home').includes('专属房屋'))
  assert(iconPrompt(config, 'plans').includes('日历'))
  assert.deepEqual(config, before)
})

test('complete prompt plans require every purpose, menu icon and cursor', () => {
  const plan = {
    targets: Object.fromEntries(
      targetKeys.map((target) => [target, { style: `${target}风格`, prompt: `${target}提示词` }]),
    ),
    iconPrompts: Object.fromEntries(iconSet.map((icon) => [icon.key, icon.subject])),
    cursorPrompts: Object.fromEntries(cursorSet.map((cursor) => [cursor.key, cursor.subject])),
  }
  assert.deepEqual(parsePromptPlan(plan), plan)
  for (const invalid of [
    { ...plan, targets: {} },
    { ...plan, iconPrompts: { ...plan.iconPrompts, home: '' } },
    { ...plan, cursorPrompts: { ...plan.cursorPrompts, text: '' } },
    { ...plan, cursorPrompts: [] },
  ])
    assert.throws(() => parsePromptPlan(invalid))
})

test('composed menu and cursor prompts reserve room for their exclusive requirements', () => {
  for (const target of ['icon', 'cursor'] as const)
    assert.throws(
      () => assetPrompt({ ...defaults, target, prompt: 'x'.repeat(16000) }, 'default'),
      /完整提示词（含专属要求）超过 16000 字/,
    )
})

test('independent purpose drafts and cursor batch metadata survive serialization without secrets', () => {
  const config = { ...defaults, prompt: '背景专属提示词' }
  rememberTargetPrompt(config)
  config.target = 'cursor'
  config.style = '光标独立风格'
  config.prompt = '光标独立提示词'
  config.cursorPrompts = { pointer: '叶片手形' }
  rememberTargetPrompt(config)
  const before = structuredClone(config)
  assert(assetPrompt(config, 'pointer').includes('叶片手形'))
  assert.deepEqual(config, before)
  const state = {
    ...newState(),
    generator: {
      ...config,
      apiKey: 'do-not-save',
      targetPrompts: {
        ...config.targetPrompts,
        cover: { style: '封面风格', prompt: '', apiKey: 'nested-private-key' },
      },
    },
    aiResult: {
      kind: 'cursor-batch',
      target: 'cursor',
      inputFingerprint: 'a'.repeat(64),
      items: [
        {
          key: 'text',
          label: '文本光标',
          status: 'error',
          previewSource: {
            target: 'cursor',
            cursorKey: 'text',
            url: png,
            width: 32,
            height: 32,
            bytes: 20,
            libraryId: 'b'.repeat(64),
          },
        },
      ],
      referenceCount: 0,
    },
  }
  const serialized = serializeDraft(state)
  const restored = parseDraft(JSON.parse(serialized) as unknown)
  assert.equal(restored.generator?.targetPrompts?.background?.prompt, '背景专属提示词')
  assert.equal(restored.generator?.targetPrompts?.cursor?.style, '光标独立风格')
  assert.equal(restored.generator?.targetPrompts?.cover?.prompt, '')
  assert.equal(restored.aiResult?.kind, 'cursor-batch')
  assert.equal(restored.aiResult?.kind && restored.aiResult.inputFingerprint, 'a'.repeat(64))
  assert.equal(
    restored.aiResult?.kind && restored.aiResult.items[0].previewSource?.libraryId,
    'b'.repeat(64),
  )
  assert(!serialized.includes('do-not-save') && !serialized.includes('nested-private-key'))
})

test('draft writes remain ordered, report only the latest save and recover after failure', async () => {
  const writes: number[] = [],
    statuses: unknown[] = []
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const queue = createDraftQueue<number>(
    async (value) => {
      writes.push(value)
      if (value === 1) await gate
      if (value === 3) throw new Error('disk full')
    },
    (error) => statuses.push(error),
  )
  const first = queue.save(1),
    second = queue.save(2)
  await setImmediate()
  assert.deepEqual(writes, [1])
  release()
  await Promise.all([first, second])
  assert.deepEqual(writes, [1, 2])
  assert.deepEqual(statuses, [undefined])
  await assert.rejects(queue.save(3), /disk full/)
  await queue.save(4)
  assert.deepEqual(writes, [1, 2, 3, 4])
  assert.equal(statuses.at(-1), undefined)
})

test('async UI actions surface transport failures and run cleanup', async () => {
  const failures: unknown[] = []
  let busy = false
  const handler = uiTask(
    async () => {
      busy = true
      try {
        throw new Error('IPC disconnected')
      } finally {
        busy = false
      }
    },
    (error) => failures.push(error),
  )
  assert.equal(handler(), undefined)
  await setImmediate()
  assert.equal(busy, false)
  assert.match(String(failures[0]), /IPC disconnected/)
})

test('publishing generated files drops stale output and refuses deleting user directories', () => {
  const root = fs.mkdtempSync(path.join(qa, 'build-test-'))
  assert.throws(() => createStage(root, '../data'), /Invalid/)
  const stage = createStage(root, 'app'),
    output = path.join(root, '.build/app')
  fs.mkdirSync(output)
  fs.writeFileSync(path.join(output, 'obsolete.js'), 'old')
  fs.writeFileSync(path.join(stage, 'current.js'), 'new')
  publishGenerated(root, stage, output)
  assert.deepEqual(fs.readdirSync(output), ['current.js'])
  const data = path.join(root, 'data')
  fs.mkdirSync(data)
  fs.writeFileSync(path.join(data, 'draft.json'), 'preserve')
  assert.throws(() => discardStage(root, data), /inside/)
  assert.equal(fs.readFileSync(path.join(data, 'draft.json'), 'utf8'), 'preserve')
})
