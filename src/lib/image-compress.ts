const MAX_DIM = 2000
const WEBP_QUALITY = 0.8
const COMPRESS_THRESHOLD = 300 * 1024  // 300KB

export async function compressImage(file: File): Promise<File> {
  if (!['image/jpeg', 'image/png'].includes(file.type) || file.size <= COMPRESS_THRESHOLD) {
    return file
  }
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
