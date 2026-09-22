const MAX_DIM = 2000
const WEBP_QUALITY = 0.8

export async function compressImage(file: File): Promise<File> {
  if (!['image/jpeg', 'image/png'].includes(file.type)) return file
  try {
    const img = await createImageBitmap(file)
    let { width, height } = img
    if (width > MAX_DIM || height > MAX_DIM) {
      const ratio = Math.min(MAX_DIM / width, MAX_DIM / height)
      width = Math.round(width * ratio)
      height = Math.round(height * ratio)
    }
    const cvs = document.createElement('canvas')
    cvs.width = width
    cvs.height = height
    const ctx = cvs.getContext('2d')!
    ctx.drawImage(img, 0, 0, width, height)
    img.close()
    const blob = await new Promise<Blob | null>(resolve => cvs.toBlob(resolve, 'image/webp', WEBP_QUALITY))
    if (!blob || blob.size >= file.size) return file
    const name = file.name.replace(/\.\w+$/, '.webp')
    return new File([blob], name, { type: 'image/webp' })
  } catch {
    return file
  }
}

export async function handleClipboardPaste(e: ClipboardEvent): Promise<File | null> {
  const items = e.clipboardData?.items
  if (!items) return null
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault()
      return item.getAsFile()
    }
  }
  return null
}

/** MinerU 的 image_suffixes 里没有 svg/avif(它用 PIL 开图, 这两种直接报错) */
const PARSE_UNSUPPORTED = ['image/svg+xml', 'image/avif']
/** 送去做版面分析的图: 不限制的话一张 8000px 的扫描图会让上传和解析都很久 */
const MAX_PARSE_DIM = 2400
/** svg 只有 viewBox、量不到自然尺寸时的兜底(A4 200dpi, 它是矢量, 放大不糊) */
const FALLBACK_SIZE = { width: 1654, height: 2339 }

/**
 * 把浏览器能解、MinerU 不能解的图先点阵化成 PNG 再送去解析。
 *
 * 为什么不让服务端自己处理: MinerU 收图片时走 PIL(Image.open), svg 直接抛错、avif 要看 Pillow 版本;
 * 而浏览器这边解码 svg/avif 都没问题, 画进 canvas 导成 png 就变成一张它认识的普通图片。
 * 认不出来的(或解码失败的)原样返回 —— 让 MinerU 去报它自己的错, 比在这里静默换成别的格式好。
 */
export async function rasterizeForParse(file: File): Promise<File> {
  if (!PARSE_UNSUPPORTED.includes(file.type)) return file
  const url = URL.createObjectURL(file)
  try {
    const img = document.createElement('img')
    img.src = url
    await img.decode()
    const natural = img.naturalWidth > 0 && img.naturalHeight > 0
      ? { width: img.naturalWidth, height: img.naturalHeight }
      : FALLBACK_SIZE
    const ratio = Math.min(1, MAX_PARSE_DIM / Math.max(natural.width, natural.height))
    const width = Math.max(1, Math.round(natural.width * ratio))
    const height = Math.max(1, Math.round(natural.height * ratio))

    const cvs = document.createElement('canvas')
    cvs.width = width
    cvs.height = height
    const ctx = cvs.getContext('2d')
    if (!ctx) return file
    // 白底: svg/avif 可能带透明, 直接导 png 的话解析器会把透明当黑底, 图上的字就看不见了
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) => cvs.toBlob(resolve, 'image/png'))
    if (!blob) return file
    return new File([blob], file.name.replace(/\.\w+$/, '.png'), { type: 'image/png' })
  } catch {
    return file
  } finally {
    URL.revokeObjectURL(url)
  }
}
