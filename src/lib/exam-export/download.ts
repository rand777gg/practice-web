/** 浏览器侧下载 / 打印辅助 */

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 延迟回收, 确保下载已开始
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/** 在独立窗口里打开自包含 HTML 并触发打印(用户可选另存为 PDF) */
export function printHtml(html: string): void {
  const win = window.open('', '_blank')
  if (!win) {
    alert('浏览器拦截了打印窗口，请允许弹窗后重试。')
    return
  }
  win.document.open()
  win.document.write(html)
  win.document.close()
  // 等 MathJax / 资源就绪后打印
  win.addEventListener('load', () => {
    setTimeout(() => {
      try {
        win.focus()
        win.print()
      } catch {
        /* 忽略 */
      }
    }, 350)
  })
  // 部分浏览器 load 早已触发, 兜底
  setTimeout(() => {
    try {
      win.focus()
      win.print()
    } catch {
      /* 忽略 */
    }
  }, 1200)
}
