if (!process.env.STUDIO_QA_DIR || !process.env.STUDIO_DATA_DIR)
  throw new Error('请通过 npm run check 或对应的 check:* 命令运行验证')
const fs = require('node:fs') as typeof import('node:fs')
const path = require('node:path') as typeof import('node:path')
const http = require('node:http') as typeof import('node:http')
const assert: typeof import('node:assert/strict') = require('node:assert/strict')
const { createRequire } = require('node:module') as typeof import('node:module')
const dep = createRequire(path.join(__dirname, 'package.json'))
const electron = {
  launch: async (options: Parameters<typeof import('@playwright/test')._electron.launch>[0]) =>
    (await import('./tools/verification.mts')).launch(options),
}
const { readAppearancePackage } =
  require('./.build/app/compat/appearanceService') as typeof import('./src/compat/appearanceService.js')
const { endpointAddress, generateImage } =
  require('./.build/app/image-api.cjs') as typeof import('./src/image-api.cjs')
const { apiAddress } = require('./.build/app/image-api.cjs') as typeof import('./src/image-api.cjs')
const { describeReferences } =
  require('./.build/app/prompt-api.cjs') as typeof import('./src/prompt-api.cjs')
const root = __dirname,
  qa = process.env.STUDIO_QA_DIR!
const packaged = process.argv.includes('--packaged')
const executable = packaged
  ? path.join(root, 'dist/MAS创作工具箱/MAS主题工坊.exe')
  : dep('electron')
const png = fs.readFileSync(path.join(qa, 'background.png'))
const key = 'local-test-credential-for-fixture-only'
const visionKey = 'local-vision-credential-for-fixture-only'
const visionPrompt =
  '柔和手绘的森林背景，紫色与浅黄色的配色，主体放在画面右侧，左侧留白，低对比光线，无文字、无标志、无水印。'
const { targetKeys } = require('./.build/app/generation.js') as typeof import('./src/generation')
const { iconSet } = require('./.build/app/icons.js') as typeof import('./src/icons')
const { cursorSet } = require('./.build/app/cursors.js') as typeof import('./src/cursors')
const visionPlan: import('./src/types/studio').PromptPlan = {
  targets: Object.fromEntries(
    targetKeys.map((target) => [
      target,
      {
        style: `${target} 专属参考图风格`,
        prompt:
          target === 'background' ? visionPrompt : `${target} 专属完整提示词，沿用参考图配色与主体`,
      },
    ]),
  ) as import('./src/types/studio').PromptPlan['targets'],
  iconPrompts: Object.fromEntries(
    iconSet.map((icon) => [icon.key, `${icon.label}参考图专属提示词`]),
  ),
  cursorPrompts: Object.fromEntries(
    cursorSet.map((cursor) => [cursor.key, `${cursor.label}参考图专属提示词`]),
  ),
}
const requests: any[] = [],
  imageRequests: any[] = [],
  checks: string[] = [],
  errors: string[] = []
const ok = (label) => {
  checks.push(label)
  console.log('PASS', label)
}
let address, pendingVision
const server = http.createServer(async (request, response) => {
  if (request.url === '/generated.png') {
    imageRequests.push(request.headers)
    response.writeHead(200, { 'Content-Type': 'image/png' })
    response.end(png)
    return
  }
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk)
  const raw = Buffer.concat(chunks),
    images: any[] = []
  let data
  if (request.headers['content-type']?.startsWith('multipart/form-data;')) {
    const form = await new Request(address + request.url, {
      method: 'POST',
      headers: request.headers as HeadersInit,
      body: raw,
    }).formData()
    data = {}
    for (const [name, value] of form) {
      if (typeof value === 'string') data[name] = value
      else
        images.push({
          field: name,
          name: value.name,
          type: value.type,
          bytes: Buffer.from(await value.arrayBuffer()),
        })
    }
  } else data = JSON.parse(raw.toString())
  requests.push({ path: request.url, headers: request.headers as HeadersInit, data, images })
  if (request.url!.endsWith('/chat/completions')) {
    if (data.model === 'vision-wait') {
      pendingVision = response
      return
    }
    if (data.model === 'vision-auth-error') {
      response.writeHead(401, { 'Content-Type': 'application/json' })
      response.end(
        JSON.stringify({ error: { message: `Invalid key ${request.headers.authorization}` } }),
      )
      return
    }
    if (data.model === 'vision-unsupported') {
      response.writeHead(400, { 'Content-Type': 'application/json' })
      response.end('{}')
      return
    }
    const planText =
      data.model === 'vision-plain'
        ? visionPrompt
        : data.model === 'vision-incomplete'
          ? JSON.stringify({ ...visionPlan, cursorPrompts: {} })
          : JSON.stringify(visionPlan)
    const content =
      data.model === 'vision-empty'
        ? null
        : data.model === 'vision-leak'
          ? request.headers.authorization!.slice(7)
          : data.model === 'vision-parts'
            ? [
                { type: 'text', text: planText.slice(0, planText.indexOf('参考图风格') + 1) },
                { type: 'text', text: planText.slice(planText.indexOf('参考图风格') + 1) },
              ]
            : planText
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(
      JSON.stringify({
        choices: [
          {
            finish_reason: data.model === 'vision-length' ? 'length' : 'stop',
            message: { content },
          },
        ],
      }),
    )
    return
  }
  if (data.model === 'unsupported-reference') {
    response.writeHead(404, { 'Content-Type': 'application/json' })
    response.end('{}')
    return
  }
  if (data.model === 'auth-error') {
    response.writeHead(401, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ error: { message: `Invalid key ${key}` } }))
    return
  }
  if (data.model === 'wait-model') {
    response.on('close', () => {})
    return
  }
  if (data.model === 'invalid-image') {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(
      JSON.stringify({ data: [{ b64_json: Buffer.from('invalid').toString('base64') }] }),
    )
    return
  }
  response.writeHead(200, { 'Content-Type': 'application/json' })
  response.end(
    JSON.stringify({
      data: [
        data.model === 'url-model'
          ? { url: `${address}/generated.png` }
          : { b64_json: png.toString('base64') },
      ],
    }),
  )
})
async function verify() {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  address = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`
  assert.equal(
    endpointAddress('https://example.com/v1/'),
    'https://example.com/v1/images/generations',
  )
  assert.equal(
    endpointAddress('https://example.com/v2/images/generations'),
    'https://example.com/v2/images/generations',
  )
  assert.equal(
    endpointAddress('https://example.com/v1/', true),
    'https://example.com/v1/images/edits',
  )
  assert.equal(
    endpointAddress('https://example.com/v2/images/generations', true),
    'https://example.com/v2/images/edits',
  )
  assert.equal(
    endpointAddress('https://example.com/v2/images/edits', true),
    'https://example.com/v2/images/edits',
  )
  assert.equal(
    endpointAddress('https://example.com/v2/images/edits'),
    'https://example.com/v2/images/generations',
  )
  assert.throws(() => endpointAddress('http://remote.example/v1'))
  assert.throws(() => endpointAddress('https://username:password@example.com/v1'))
  ok('兼容基础地址、完整接口路径与地址约束')
  assert.equal(
    apiAddress('https://example.com/v2/images/edits', 'chat/completions'),
    'https://example.com/v2/chat/completions',
  )
  assert.equal(
    apiAddress('https://example.com/v2/chat/completions', 'chat/completions'),
    'https://example.com/v2/chat/completions',
  )
  const input = {
    baseURL: address + '/v1',
    apiKey: key,
    model: 'fixture-model',
    prompt: 'fixture prompt',
  }
  let invalidCalls = 0
  const noFetch = async () => {
    invalidCalls++
    throw new Error('Invalid references must not reach network')
  }
  for (const [referenceImages, message] of [
    [{}, /最多 4 张/],
    [Array(5).fill({ url: 'data:image/png;base64,YmFk' }), /最多 4 张/],
    [[{ url: 'https://example.com/reference.png' }], /参考图需为/],
    [[{ url: 'data:image/jpeg;base64,' + png.toString('base64') }], /格式不一致/],
    [
      [{ url: 'data:image/png;base64,' + 'A'.repeat(Math.ceil((8 * 1024 * 1024) / 3) * 4 + 4) }],
      /单张不超过 8 MB/,
    ],
  ])
    await assert.rejects(
      generateImage(
        {
          ...input,
          referenceImages:
            referenceImages as import('./src/types/studio').ImageRequest['referenceImages'],
        },
        undefined,
        noFetch,
      ),
      message as RegExp,
    )
  const large = Buffer.alloc(6 * 1024 * 1024)
  png.copy(large, 0, 0, 8)
  await assert.rejects(
    generateImage(
      {
        ...input,
        referenceImages: Array(3).fill({
          url: 'data:image/png;base64,' + large.toString('base64'),
        }),
      },
      undefined,
      noFetch,
    ),
    /总大小不能超过 16 MB/,
  )
  assert.equal(invalidCalls, 0)
  ok('参考图数量、格式、单张大小与总大小校验，非法输入不发送请求')
  await assert.rejects(
    describeReferences(
      { ...input, instructions: '主题背景', referenceImages: [] },
      undefined,
      noFetch,
    ),
    /至少 1 张/,
  )
  await assert.rejects(
    describeReferences({ ...input, model: '', instructions: '主题背景' }, undefined, noFetch),
    /看图模型名/,
  )
  assert.equal(invalidCalls, 0)
  const application = await electron.launch({
    executablePath: executable,
    args: packaged ? [] : [path.join(root, '.build/app')],
    timeout: 30000,
  })
  const page = await application.firstWindow()
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  try {
    await page.waitForFunction(() =>
      Boolean((document.getElementById('name') as HTMLInputElement)?.value),
    )
    await page.locator('[data-tab="ai"]').click()
    await page.locator('#ai-base-url').fill(`${address}/v1`)
    await page.locator('#ai-key').fill(key)
    await page.locator('#ai-model').fill('fixture-model')
    await page.locator('.ai-vision-settings summary').click()
    await page.locator('#ai-vision-model').fill('')
    await page.locator('#ai-vision-separate').uncheck()
    await page.selectOption('#ai-target', 'background')
    const prompt = await page.locator('#ai-prompt').inputValue()
    assert(prompt.includes('左侧') && prompt.includes('无文字'))
    await page.selectOption('#ai-target', 'mascot')
    assert((await page.locator('#ai-prompt').inputValue()).includes('不要动画图集'))
    await page.selectOption('#ai-target', 'background')
    await page.locator('#ai-style').fill('雨后竹林、青绿色、简洁插画')
    await page.locator('#ai-reset-prompt').click()
    assert((await page.locator('#ai-prompt').inputValue()).includes('雨后竹林'))
    ok('5 类内置提示词、风格替换与用途切换')
    const before = await page.locator('#manifest-json').textContent()
    await page.locator('#ai-generate').click()
    await page.waitForFunction(() =>
      (document.getElementById('ai-status') as HTMLElement).textContent!.includes('生成完成'),
    )
    assert.equal(requests.at(-1).headers.authorization, `Bearer ${key}`)
    assert.equal(requests.at(-1).path, '/v1/images/generations')
    assert.equal(requests.at(-1).data.n, 1)
    assert.equal(requests.at(-1).data.response_format, undefined)
    assert.equal(await page.locator('#manifest-json').textContent(), before)
    ok('实际 HTTP 请求、鉴权、base64 图片预览与应用前不改主题')
    await page.locator('#ai-apply').click()
    await page.waitForFunction(() => !(document.getElementById('tab-design') as HTMLElement).hidden)
    await page.locator('[data-tab="check"]').click()
    await page.locator('#validate').click()
    await page.waitForFunction(() =>
      (document.getElementById('validation') as HTMLElement).textContent!.includes('校验通过'),
    )
    ok('生成背景应用到主题，并通过 AUTO-MAS 校验')
    await page.locator('[data-tab="ai"]').click()
    const referenceUrls = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 87
      canvas.height = 61
      const context = canvas.getContext('2d')!
      context.fillStyle = '#6b3589'
      context.fillRect(0, 0, 87, 61)
      context.fillStyle = '#f8de72'
      context.fillRect(8, 8, 39, 39)
      return [canvas.toDataURL('image/png'), canvas.toDataURL('image/webp')]
    })
    const referencePaths = ['reference-private-1.png', 'reference-private-2.webp'].map((name) =>
      path.join(qa, name),
    )
    referencePaths.forEach((name, index) =>
      fs.writeFileSync(name, Buffer.from(referenceUrls[index].split(',')[1], 'base64')),
    )
    const chooserPromise = page.waitForEvent('filechooser')
    await page.locator('#ai-reference-add').click()
    await (await chooserPromise).setFiles(referencePaths)
    await page.waitForFunction(
      () => (document.getElementById('ai-reference-count') as HTMLElement).textContent === '2 / 4',
    )
    assert.equal(await page.locator('#ai-reference-list img').count(), 2)
    assert(
      await page
        .locator('#ai-reference-list img')
        .first()
        .evaluate((image) => (image as HTMLImageElement).naturalWidth === 87),
    )
    const brokenReference = path.join(qa, 'broken-reference.png')
    fs.writeFileSync(brokenReference, 'not an image')
    await page.locator('#ai-reference-file').setInputFiles(brokenReference)
    await page.waitForFunction(() =>
      (document.getElementById('toast') as HTMLElement).textContent!.includes('不是 PNG'),
    )
    assert.equal(await page.locator('#ai-reference-count').textContent(), '2 / 4')
    await page.locator('#ai-reference-file').setInputFiles([...referencePaths, referencePaths[0]])
    await page.waitForFunction(() =>
      (document.getElementById('toast') as HTMLElement).textContent!.includes('最多 4 张'),
    )
    assert.equal(await page.locator('#ai-reference-count').textContent(), '2 / 4')
    await page.locator('#ai-base-url').fill(`${address}/v1/images/generations`)
    await page.locator('#ai-generate').click()
    await page.waitForFunction(() =>
      (document.getElementById('ai-status') as HTMLElement).textContent!.includes('生成完成'),
    )
    const multiReference = requests.at(-1)
    assert.equal(multiReference.path, '/v1/images/edits')
    assert.equal(multiReference.headers.authorization, `Bearer ${key}`)
    assert.equal(
      multiReference.data.prompt.replaceAll('\r\n', '\n'),
      await page.locator('#ai-prompt').inputValue(),
    )
    assert.equal(multiReference.data.size, '1536x1024')
    assert.equal(multiReference.images.length, 2)
    multiReference.images.forEach((image, index) => {
      assert.equal(image.field, 'image[]')
      assert(image.bytes.equals(fs.readFileSync(referencePaths[index])))
    })
    assert.equal(multiReference.images[0].type, 'image/png')
    assert.equal(multiReference.images[1].type, 'image/webp')
    ok('参考图上传与预览、无效文件保留原图、多图真实 multipart 请求与原始字节完整保留')
    await page.locator('#ai-describe').click()
    await page.waitForFunction(() =>
      (document.getElementById('toast') as HTMLElement).textContent!.includes('看图模型名'),
    )
    await page.locator('#ai-vision-model').fill('vision-model')
    const originalPrompt = await page.locator('#ai-prompt').inputValue()
    await page.locator('#ai-describe').click()
    await page.waitForFunction(
      () => !(document.getElementById('ai-prompt-suggestion') as HTMLElement).hidden,
    )
    assert.equal(await page.locator('#ai-prompt').inputValue(), originalPrompt)
    assert.equal(await page.locator('#ai-suggested-prompt').inputValue(), visionPrompt)
    const visionRequest = requests.at(-1)
    assert.equal(visionRequest.path, '/v1/chat/completions')
    assert.equal(visionRequest.headers.authorization, `Bearer ${key}`)
    assert.equal(visionRequest.data.model, 'vision-model')
    const visionContent = visionRequest.data.messages.find(
      (message) => message.role === 'user',
    ).content
    assert(visionContent[0].text.includes('五类用途') && visionContent[0].text.includes('雨后竹林'))
    const systemInstruction = visionRequest.data.messages.find(
      (message) => message.role === 'system',
    ).content
    for (const target of targetKeys) assert(systemInstruction.includes(target))
    assert(systemInstruction.includes('cursorPrompts') && systemInstruction.includes('pointer'))
    assert.deepEqual(
      visionContent.slice(1).map((part) => part.image_url.url),
      referenceUrls,
    )
    await page.selectOption('#ai-target', 'cover')
    assert(await page.locator('#ai-prompt-suggestion').isVisible())
    await page.selectOption('#ai-target', 'background')
    assert(await page.locator('#ai-prompt-suggestion').isVisible())
    for (const target of targetKeys) {
      await page.selectOption('#ai-suggested-target', target)
      assert.equal(
        await page.locator('#ai-suggested-style').inputValue(),
        visionPlan.targets[target].style,
      )
      assert.equal(
        await page.locator('#ai-suggested-prompt').inputValue(),
        visionPlan.targets[target].prompt,
      )
    }
    await page.selectOption('#ai-suggested-target', 'icon')
    await page.locator('#ai-suggested-icons summary').click()
    await page.getByLabel('主页候选专属提示词', { exact: true }).fill('叶片屋顶的小屋图标')
    await page.selectOption('#ai-suggested-target', 'cursor')
    await page.locator('#ai-suggested-cursors summary').click()
    await page
      .getByLabel('手形指针候选专属提示词', { exact: true })
      .fill('奶油绿叶片装饰的手形指针')
    await page.selectOption('#ai-suggested-target', 'background')
    await page.locator('#ai-suggested-style').fill('背景候选风格已编辑')
    await page.locator('#ai-suggested-prompt').fill(visionPrompt + ' 不画软件界面。')
    await page.screenshot({
      path: path.join(qa, packaged ? 'ai-prompt-portable.png' : 'ai-prompt.png'),
    })
    await page.locator('#ai-use-prompt').click()
    assert.equal(await page.locator('#ai-prompt').inputValue(), visionPrompt + ' 不画软件界面。')
    for (const target of targetKeys) {
      await page.selectOption('#ai-target', target)
      assert.equal(
        await page.locator('#ai-style').inputValue(),
        target === 'background' ? '背景候选风格已编辑' : visionPlan.targets[target].style,
      )
      assert.equal(
        await page.locator('#ai-prompt').inputValue(),
        target === 'background'
          ? visionPrompt + ' 不画软件界面。'
          : visionPlan.targets[target].prompt,
      )
    }
    assert.equal(
      await page.locator('#ai-cursor-prompt-pointer').inputValue(),
      '奶油绿叶片装饰的手形指针',
    )
    await page.selectOption('#ai-target', 'icon')
    assert.equal(await page.locator('#ai-icon-prompt-home').inputValue(), '叶片屋顶的小屋图标')
    await page.selectOption('#ai-target', 'background')
    pendingVision = null
    await page.locator('#ai-vision-model').fill('vision-wait')
    await page.locator('#ai-describe').click()
    for (let count = 0; !pendingVision && count < 100; count++) await page.waitForTimeout(10)
    assert(pendingVision)
    await page.selectOption('#ai-target', 'cursor')
    pendingVision.writeHead(200, { 'Content-Type': 'application/json' })
    pendingVision.end(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(visionPlan) } }] }),
    )
    await page.waitForFunction(
      () => !(document.getElementById('ai-prompt-suggestion') as HTMLElement).hidden,
    )
    assert.equal(await page.locator('#ai-suggested-target').inputValue(), 'cursor')
    await page.locator('#ai-discard-prompt').click()
    await page.selectOption('#ai-target', 'background')
    ok(
      '一次看图生成五类风格与提示词、11 个图标和 3 个光标专属提示词，候选可编辑，统一应用并按用途独立保留',
    )
    await page.locator('#ai-vision-separate').check()
    await page.locator('#ai-vision-url').fill(`${address}/separate/chat/completions`)
    await page.locator('#ai-vision-key').fill(visionKey)
    await page.locator('#ai-vision-model').fill('vision-parts')
    await page.locator('#ai-describe').click()
    await page.waitForFunction(
      () => !(document.getElementById('ai-prompt-suggestion') as HTMLElement).hidden,
    )
    assert.equal(requests.at(-1).path, '/separate/chat/completions')
    assert.equal(requests.at(-1).headers.authorization, `Bearer ${visionKey}`)
    assert.equal(await page.locator('#ai-suggested-prompt').inputValue(), visionPrompt)
    await page.locator('#ai-discard-prompt').click()
    const keptPrompt = await page.locator('#ai-prompt').inputValue()
    for (const [model, message] of [
      ['vision-auth-error', 'API Key 无效'],
      ['vision-unsupported', '模型支持图片输入'],
      ['vision-empty', '没有返回可用提示词'],
      ['vision-length', '未完整返回提示词'],
      ['vision-leak', '返回内容包含密钥'],
      ['vision-plain', '未返回完整的整套提示词'],
      ['vision-incomplete', '专属提示词'],
    ]) {
      await page.locator('#ai-vision-model').fill(model)
      await page.locator('#ai-describe').click()
      await page.waitForFunction(
        (message) =>
          (document.getElementById('ai-describe-status') as HTMLElement).textContent!.includes(
            message,
          ),
        message,
      )
      assert.equal(await page.locator('#ai-prompt').inputValue(), keptPrompt)
      assert(!(await page.locator('#ai-describe-status').textContent())!.includes(visionKey))
      assert.equal(await page.locator('#ai-prompt-suggestion').isVisible(), false)
    }
    await page.locator('#ai-vision-model').fill('vision-wait')
    await page.locator('#ai-describe').click()
    await page.locator('#ai-describe-cancel').click()
    await page.waitForFunction(() =>
      (document.getElementById('ai-describe-status') as HTMLElement).textContent!.includes(
        '已取消',
      ),
    )
    assert.equal(await page.locator('#ai-prompt').inputValue(), keptPrompt)
    await page.locator('#ai-vision-model').fill('vision-model')
    ok('独立看图服务与密钥、文本分段响应、鉴权与能力错误、空结果、截断、密钥脱敏和取消')
    await page.getByRole('button', { name: '移除参考图 1', exact: true }).click()
    await page.locator('#ai-generate').click()
    await page.waitForFunction(() =>
      (document.getElementById('ai-status') as HTMLElement).textContent!.includes('生成完成'),
    )
    assert.equal(requests.at(-1).images[0].field, 'image')
    assert(requests.at(-1).images[0].bytes.equals(fs.readFileSync(referencePaths[1])))
    const previousResult = await page.locator('#ai-result-image').getAttribute('src')
    await page.locator('#ai-model').fill('unsupported-reference')
    await page.locator('#ai-generate').click()
    await page.waitForFunction(() =>
      (document.getElementById('ai-status') as HTMLElement).textContent!.includes('/images/edits'),
    )
    assert.equal(await page.locator('#ai-result-image').getAttribute('src'), previousResult)
    await page.getByRole('button', { name: '移除参考图 1', exact: true }).click()
    await page.locator('#ai-model').fill('fixture-model')
    await page.locator('#ai-generate').click()
    await page.waitForFunction(() =>
      (document.getElementById('ai-status') as HTMLElement).textContent!.includes('生成完成'),
    )
    assert.equal(requests.at(-1).path, '/v1/images/generations')
    assert(requests.at(-1).headers['content-type'].includes('application/json'))
    await page.locator('#ai-reference-file').setInputFiles(referencePaths)
    await page.waitForFunction(
      () => (document.getElementById('ai-reference-count') as HTMLElement).textContent === '2 / 4',
    )
    ok('单图上传、单独移除、不支持参考图的提示与清空后恢复文字生图')
    await page.selectOption('#ai-target', 'cursor')
    await page.locator('#ai-model').fill('url-model')
    await page.locator('.ai-advanced summary').click()
    await page.locator('#ai-transparent').check()
    await page.selectOption('#ai-quality', 'high')
    await page.selectOption('#ai-response-format', 'url')
    await page.locator('#ai-generate').click()
    await page.waitForFunction(() =>
      (document.getElementById('ai-status') as HTMLElement).textContent!.includes('生成完成'),
    )
    assert.equal(imageRequests.at(-1).authorization, undefined)
    assert.equal(requests.at(-1).data.background, 'transparent')
    assert.equal(requests.at(-1).data.output_format, 'png')
    assert.equal(requests.at(-1).data.quality, 'high')
    assert.equal(requests.at(-1).data.response_format, 'url')
    await page.locator('#ai-apply').click()
    await page.waitForFunction(() => !(document.getElementById('tab-assets') as HTMLElement).hidden)
    const cursorDimensions = await page.locator('#cursor-slot img').evaluate((image) => ({
      width: (image as HTMLImageElement).naturalWidth,
      height: (image as HTMLImageElement).naturalHeight,
    }))
    assert(cursorDimensions.width <= 64 && cursorDimensions.height <= 64)
    ok('URL 图片下载不带密钥、高级参数、光标自动缩小')
    await page.locator('[data-tab="ai"]').click()
    await page.locator('#ai-model').fill('auth-error')
    await page.locator('#ai-generate').click()
    await page.waitForFunction(() =>
      (document.getElementById('ai-status') as HTMLElement).textContent!.includes('API Key 无效'),
    )
    assert(!(await page.locator('#ai-status').textContent())!.includes(key))
    ok('鉴权失败提示与回显密钥脱敏')
    await page.locator('#ai-model').fill('wait-model')
    await page.locator('#ai-generate').click()
    await page.locator('#ai-cancel').click()
    await page.waitForFunction(() =>
      (document.getElementById('ai-status') as HTMLElement).textContent!.includes('已取消'),
    )
    ok('取消生成并恢复可用状态')
    await page.locator('#ai-model').fill('invalid-image')
    await page.locator('#ai-generate').click()
    await page.waitForFunction(() =>
      (document.getElementById('ai-status') as HTMLElement).textContent!.includes('不是 PNG'),
    )
    ok('接口返回无效图片时保留上一次结果')
    const imagePath = path.join(qa, 'ai-saved.png')
    await application.evaluate(({ dialog }, imagePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: imagePath })
    }, imagePath)
    await page.locator('#ai-save-image').click()
    await page.waitForFunction(() =>
      (document.getElementById('toast') as HTMLElement).textContent!.includes('图片已保存'),
    )
    assert(fs.readFileSync(imagePath).equals(png))
    const output = path.join(qa, 'ai-theme.zip')
    await application.evaluate(({ dialog }, output) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: output })
    }, output)
    await page.locator('#export').click()
    await page.waitForFunction(
      () => !(document.getElementById('export') as HTMLButtonElement).disabled,
    )
    const checked = readAppearancePackage(output)
    assert(checked.manifest.cursors!.default!)
    assert(!JSON.stringify(checked).includes(key))
    const dataPath = await application.evaluate(({ app }) => app.getPath('userData'))
    const draft = fs.readFileSync(path.join(dataPath, 'draft.json'), 'utf8')
    assert(!draft.includes(key))
    assert(!draft.includes(visionKey))
    assert(!draft.includes('apiKey'))
    for (const url of referenceUrls) assert(!draft.includes(url))
    assert(!draft.includes('"referenceImages"'))
    assert(!JSON.stringify(checked).includes('reference-private-'))
    const exportedFiles = new (dep('adm-zip') as typeof import('adm-zip'))(output)
      .getEntries()
      .filter((entry) => !entry.isDirectory)
      .map((entry) => entry.getData())
    for (const referencePath of referencePaths)
      assert(!exportedFiles.some((bytes) => bytes.equals(fs.readFileSync(referencePath))))
    assert(!fs.readFileSync(output).includes(Buffer.from(key)))
    assert(!fs.readFileSync(output).includes(Buffer.from(visionKey)))
    ok('原图保存与素材打包、草稿不嵌入参考图字节，主题包不含参考图与密钥')
    await page.locator('#ai-base-url').fill('https://api.openai.com/v1')
    await page.locator('#ai-model').fill('gpt-image-2')
    await page.locator('#ai-key').fill('')
    await page.selectOption('#ai-target', 'background')
    await page.locator('#ai-transparent').uncheck()
    await page.selectOption('#ai-quality', '')
    await page.selectOption('#ai-response-format', '')
    await page.locator('#ai-vision-url').fill('https://api.openai.com/v1')
    await page.locator('#ai-vision-key').fill('')
    await page.locator('#ai-vision-separate').uncheck()
    await page.locator('#ai-settings summary').click()
    await page.evaluate(() => {
      ;(document.getElementById('toast') as HTMLElement).hidden = true
      document.querySelector<HTMLElement>('.workspace')!.scrollTop = 0
    })
    await page.screenshot({ path: path.join(qa, packaged ? 'ai-portable.png' : 'ai.png') })
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1000, 720),
    )
    await page.waitForTimeout(100)
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.locator('#ai-vision-model').fill('vision-wait')
    await page.locator('#ai-settings summary').click()
    await page.locator('#ai-base-url').fill(`${address}/v1`)
    await page.locator('#ai-key').fill(key)
    pendingVision = null
    await page.locator('#ai-describe').click()
    await page.waitForFunction(
      () => !(document.getElementById('ai-describe-cancel') as HTMLButtonElement).hidden,
    )
    for (let count = 0; !pendingVision && count < 100; count++) await page.waitForTimeout(10)
    assert(pendingVision)
    await page.locator('#new').click()
    await page.locator('#confirm-ok').click()
    pendingVision.writeHead(200, { 'Content-Type': 'application/json' })
    pendingVision.end(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(visionPlan) } }] }),
    )
    await page.waitForFunction(() =>
      (document.getElementById('ai-describe-status') as HTMLElement).textContent!.includes(
        '已改变',
      ),
    )
    await page.locator('[data-tab="ai"]').click()
    assert.equal(await page.locator('#ai-reference-count').textContent(), '0 / 4')
    assert.equal(await page.locator('#ai-prompt-suggestion').isVisible(), false)
    assert.notEqual(await page.locator('#ai-prompt').inputValue(), visionPrompt)
    assert.deepEqual(errors, [])
    ok('AI 界面最小窗口与无脚本/资源错误')
    fs.writeFileSync(
      path.join(qa, packaged ? 'ai-portable-report.json' : 'ai-report.json'),
      JSON.stringify({ packaged, mockedService: true, checks, errors }, null, 2),
    )
  } finally {
    await application.close()
    server.closeAllConnections()
    server.close()
  }
}
verify().catch((error) => {
  console.error(error)
  server.closeAllConnections()
  server.close()
  process.exitCode = 1
})
