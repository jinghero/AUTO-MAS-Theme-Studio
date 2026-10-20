// 使用 Chromium 解码，与主题实际显示时保持一致，兼容 PNG / JPEG / WebP。
export const themeImages = {
  async fit(url: string, max: number) {
    const image = new Image()
    image.src = url
    await image.decode()
    const ratio = Math.min(1, max / image.naturalWidth, max / image.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio))
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  },
  async inspect(url: string, name = '所选图片') {
    const checked = await window.studio.image({ url })
    if (!checked.success) throw new Error(`${name}：${checked.error}`)
    const image = new Image()
    image.src = url
    try {
      await image.decode()
    } catch {
      throw new Error(`${name}：无法解码图片，图片内容可能已损坏`)
    }
    const width = image.naturalWidth,
      height = image.naturalHeight
    if (!width || !height) throw new Error(`${name}：图片尺寸无效`)
    if (width > 8192 || height > 8192) throw new Error(`${name}：图片宽高均不能超过 8192 像素`)
    return { width, height, bytes: checked.info.bytes }
  },
}

export {}
