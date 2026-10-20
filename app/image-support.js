// 使用 Chromium 解码，与主题实际显示时保持一致，兼容 PNG / JPEG / WebP。
window.themeImages = {
  async inspect(url, name = '所选图片') {
    const checked = await window.studio.image({ url })
    if (!checked.success) throw new Error(`${name}：${checked.error}`)
    const image = new Image()
    image.src = url
    try { await image.decode() }
    catch { throw new Error(`${name}：无法解码图片，图片内容可能已损坏`) }
    const width = image.naturalWidth, height = image.naturalHeight
    if (!width || !height) throw new Error(`${name}：图片尺寸无效`)
    if (width > 8192 || height > 8192) throw new Error(`${name}：图片宽高均不能超过 8192 像素`)
    return { width, height, bytes: checked.info.bytes }
  },
}
