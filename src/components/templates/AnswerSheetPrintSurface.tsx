import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * 答题卡打印视图：Portal 到 body，只留答题卡本体，进入即 window.print()。
 * 与 ExamExportPanel 的打印视图同一套路，避免应用外壳参与分页。
 * 纸张尺寸与断页选择器由调用方给，自命题 B4 与统考 A3 共用这一份。
 */
export function AnswerSheetPrintSurface({
  pageWidthMm,
  pageHeightMm,
  sheetSelector,
  onClose,
  children,
}: {
  pageWidthMm: number
  pageHeightMm: number
  sheetSelector: string
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    const timer = window.setTimeout(() => window.print(), 300)
    return () => window.clearTimeout(timer)
  }, [])
  useEffect(() => {
    window.addEventListener('afterprint', onClose)
    return () => window.removeEventListener('afterprint', onClose)
  }, [onClose])

  return createPortal(
    <>
      <style>{`
        @media print {
          @page { size: ${pageWidthMm}mm ${pageHeightMm}mm; margin: 0; }
          body > #root, body > :not(.answer-sheet-print-surface) { display: none !important; }
          html, body { background: #fff !important; }
          .answer-sheet-print-surface { position: static !important; inset: auto !important; overflow: visible !important; background: #fff !important; }
          .answer-sheet-print-closebar { display: none !important; }
          ${sheetSelector} { break-after: page; page-break-after: always; }
          ${sheetSelector}:last-child { break-after: auto; page-break-after: auto; }
        }
      `}</style>
      <div className="answer-sheet-print-surface fixed inset-0 z-[100] overflow-auto bg-white">
        <div className="answer-sheet-print-closebar sticky top-0 z-10 flex justify-end border-b bg-white px-3 py-2">
          <Button size="sm" variant="outline" onClick={onClose}>
            <X className="mr-1 h-3.5 w-3.5" />
            关闭
          </Button>
        </div>
        <div className="mx-auto w-fit p-4 print:p-0">{children}</div>
      </div>
    </>,
    document.body,
  )
}
