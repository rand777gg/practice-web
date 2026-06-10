let pdfjsLibPromise: Promise<typeof import('pdfjs-dist')> | null = null

async function getPdfjsLib() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = (async () => {
      const pdfjsLib = await import('pdfjs-dist')
      const workerModule = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default
      return pdfjsLib
    })()
  }
  return pdfjsLibPromise
}

export async function extractPdfText(file: File): Promise<string> {
  const pdfjsLib = await getPdfjsLib()
  const buf = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise
  const parts: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item) => ('str' in item ? (item as { str: string }).str : ''))
      .join(' ')
    parts.push(pageText)
  }
  return parts.join('\n')
}

export async function extractDocxText(file: File): Promise<string> {
  const mammoth = await import('mammoth')
  const buf = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer: buf })
  return result.value
}

export async function extractFileText(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf')) return extractPdfText(file)
  if (name.endsWith('.docx')) return extractDocxText(file)
  if (name.endsWith('.doc')) {
    throw new Error('.doc 格式暂不支持，请转换为 .docx 后上传')
  }
  if (name.endsWith('.txt') || name.endsWith('.md')) return file.text()
  // For images, try reading as text (won't work well but won't crash)
  return file.text()
}
