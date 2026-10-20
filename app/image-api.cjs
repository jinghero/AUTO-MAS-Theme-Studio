// OpenAI Images API 兼容请求；密钥只存在于这次请求的内存中。
const MAX_IMAGE = 8 * 1024 * 1024
const MAX_RESPONSE = 14 * 1024 * 1024
function endpointAddress(value) {
  let url
  try { url = new URL(value) } catch { throw new Error('请填写完整的 API 地址，例如 https://api.openai.com/v1') }
  checkURL(url)
  const pathname = url.pathname.replace(/\/+$/, '')
  if (!pathname.endsWith('/images/generations')) url.pathname = `${pathname || '/v1'}/images/generations`
  return url.href
}
function checkURL(url) {
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new Error('API 和图片地址需使用 HTTPS；本机 localhost 服务可使用 HTTP')
  if (url.username || url.password || url.hash) throw new Error('请勿在地址中放置用户名、密码或片段')
}
function redact(value, key) {
  let message = String(value || '')
  if (key) message = message.split(key).join('[密钥已隐藏]')
  return message.replace(/Bearer\s+[^\s"',]+/gi, 'Bearer [已隐藏]').replace(/sk-[A-Za-z0-9_-]{8,}/g, '[密钥已隐藏]').slice(0, 350)
}
async function readLimited(response, max) {
  if (Number(response.headers.get('content-length')) > max) throw new Error('接口返回内容过大，请降低生成尺寸')
  const reader = response.body?.getReader()
  if (!reader) throw new Error('接口没有返回内容')
  const chunks = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > max) { await reader.cancel(); throw new Error('接口返回内容过大，请降低生成尺寸') }
      chunks.push(Buffer.from(value))
    }
  } finally { reader.releaseLock() }
  return Buffer.concat(chunks)
}
function imageURL(bytes) {
  if (!bytes.length || bytes.length > MAX_IMAGE) throw new Error('生成图片为空或超过 8 MB，请降低生成尺寸后重试')
  let mime
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) mime = 'image/png'
  else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) mime = 'image/jpeg'
  else if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') mime = 'image/webp'
  else throw new Error('接口返回的不是 PNG、JPEG 或 WebP 图片')
  return { url: `data:${mime};base64,${bytes.toString('base64')}`, mime, bytes: bytes.length }
}
async function downloadImage(value, signal, fetcher) {
  let url = new URL(value)
  for (let i = 0; i < 5; i++) {
    checkURL(url)
    // 图片链接可能属于另一个域名，下载时绝不附加 API 密钥。
    const response = await fetcher(url.href, { signal, redirect: 'manual' })
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      await response.body?.cancel()
      url = new URL(response.headers.get('location'), url)
      continue
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`生成成功，但图片下载失败（${response.status}）`) }
    return imageURL(await readLimited(response, MAX_IMAGE))
  }
  throw new Error('图片下载重定向次数过多')
}
async function generateImage(input, signal, fetcher = fetch) {
  const key = typeof input?.apiKey === 'string' ? input.apiKey.trim() : ''
  try {
    const address = endpointAddress(input?.baseURL)
    if (!key || key.length > 4096 || /[\r\n]/.test(key)) throw new Error('请填写有效的 API Key')
    const model = typeof input.model === 'string' ? input.model.trim() : ''
    const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : ''
    if (!model || model.length > 200) throw new Error('请填写服务商提供的生图模型名')
    if (!prompt || prompt.length > 16000) throw new Error('提示词需要在 1–16000 字以内')
    const size = input.size || '1024x1024'
    if (size !== 'auto' && !/^\d{2,4}x\d{2,4}$/.test(size)) throw new Error('尺寸请填写 宽x高，例如 1536x1024，或 auto')
    if (size !== 'auto' && size.split('x').some(value => +value < 64 || +value > 8192)) throw new Error('生成尺寸需在 64–8192 像素之间，并符合所选模型要求')
    const payload = { model, prompt, n: 1, size }
    if (input.quality && ['low', 'medium', 'high', 'auto', 'standard', 'hd'].includes(input.quality)) payload.quality = input.quality
    if (input.responseFormat && ['b64_json', 'url'].includes(input.responseFormat)) payload.response_format = input.responseFormat
    if (input.transparent === true) { payload.background = 'transparent'; payload.output_format = 'png' }
    const response = await fetcher(address, {
      method: 'POST', signal, redirect: 'error',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(payload),
    })
    if (!response.ok) {
      const raw = await readLimited(response, 64 * 1024)
      let detail = ''
      try { const body = JSON.parse(raw.toString('utf8')); detail = body.error?.message || body.message || '' } catch {}
      const common = { 400: '请求参数不被模型支持，请检查模型名、尺寸和高级选项', 401: 'API Key 无效或已过期',
        403: '当前密钥无权使用这个生图模型', 404: '未找到接口或模型，请检查 API 地址和模型名',
        429: '服务商限流或额度不足，请稍后重试或检查账户额度' }
      throw new Error(`${common[response.status] || `服务商请求失败（${response.status}）`}${detail ? `：${detail}` : ''}`)
    }
    const raw = await readLimited(response, MAX_RESPONSE)
    let body
    try { body = JSON.parse(raw.toString('utf8')) } catch { throw new Error('接口未返回标准 JSON，请检查是否为 Images API 兼容接口') }
    const item = body.data?.[0]
    let image
    if (typeof item?.b64_json === 'string') {
      if (!/^[A-Za-z0-9+/=\r\n]+$/.test(item.b64_json)) throw new Error('接口返回的图片编码无效')
      image = imageURL(Buffer.from(item.b64_json, 'base64'))
    } else if (typeof item?.url === 'string') {
      if (item.url.startsWith('data:')) {
        const match = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(item.url)
        if (!match) throw new Error('接口返回的图片编码无效')
        image = imageURL(Buffer.from(match[1], 'base64'))
      } else image = await downloadImage(item.url, signal, fetcher)
    } else throw new Error('没有收到图片。需要支持 data[0].b64_json 或 data[0].url 的 Images API 兼容接口')
    return image
  } catch (error) {
    if (signal?.aborted) throw new Error(signal.reason === 'timeout' ? '生图等待超过 5 分钟，请稍后重试或换一个模型' : '已取消本次生成；服务商可能已开始计费')
    if (error instanceof TypeError && /fetch|network/i.test(error.message)) throw new Error('无法连接生图服务，请检查 API 地址、网络或系统代理')
    throw new Error(redact(error.message, key))
  }
}
module.exports = { generateImage, endpointAddress, redact, imageURL }
