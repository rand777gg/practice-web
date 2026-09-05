import { useRef } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  /** 拖动回调; dx > 0 表示鼠标向右移动 */
  onDrag: (dx: number) => void
  /** 双击分隔条触发(用于复位两侧比例) */
  onReset?: () => void
  className?: string
}

/** 垂直可拖分隔条: pointer 捕获拖动, 拖动过程中不丢事件、不选中文本 */
export function PanelDivider({ onDrag, onReset, className }: Props) {
  const dragging = useRef(false)
  const lastX = useRef(0)

  const end = () => {
    if (!dragging.current) return
    dragging.current = false
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      title="拖动调整两侧宽度（双击复位）"
      onPointerDown={(e) => {
        dragging.current = true
        lastX.current = e.clientX
        e.currentTarget.setPointerCapture(e.pointerId)
        document.body.style.userSelect = 'none'
        document.body.style.cursor = 'col-resize'
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return
        onDrag(e.clientX - lastX.current)
        lastX.current = e.clientX
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => onReset?.()}
      className={cn(
        'group relative z-10 w-2.5 flex-none cursor-col-resize touch-none select-none',
        className,
      )}
    >
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:bg-primary group-active:bg-primary" />
      <div className="absolute inset-y-0 left-1/2 hidden w-0 -translate-x-1/2 bg-primary/10 group-hover:block group-hover:w-[3px]" />
    </div>
  )
}
