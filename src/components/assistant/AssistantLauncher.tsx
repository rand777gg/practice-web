/**
 * 小Q 的悬浮入口。面板收起时才有它 —— 面板展开时再挂一个按钮, 除了挡住正文没有别的用。
 *
 * 交互:
 *   左键单击     打开面板
 *   左键长按     出现手掌光标, 进入拖动, 松手后记住位置
 *   右键         隐藏 (设置页「小Q 悬浮入口」可以再打开)
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useAssistantStore } from '@/stores/assistant-store'
import { useSettingsStore } from '@/stores/settings-store'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/** 长按多久算「要拖」而不是「要开」 */
const HOLD_MS = 320
/** 指针挪动超过这个距离就取消长按, 当作误触/滑动 */
const MOVE_TOLERANCE = 6
/** 对话框尺寸与贴边留给 */
const SIZE = 104
const EDGE = 8
/** 底部让开移动端底栏 */
const BOTTOM_OFFSET = 96

const POS_KEY = 'assistant_launcher_pos'

interface Pos { x: number; y: number }

function readPos(): Pos | null {
  try {
    const raw = localStorage.getItem(POS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Pos
    return typeof parsed?.x === 'number' && typeof parsed?.y === 'number' ? parsed : null
  } catch {
    return null
  }
}

function defaultPos(): Pos {
  return {
    x: window.innerWidth - SIZE - EDGE * 3,
    y: window.innerHeight - SIZE - BOTTOM_OFFSET,
  }
}

function clamp(p: Pos): Pos {
  return {
    x: Math.min(Math.max(p.x, EDGE), Math.max(EDGE, window.innerWidth - SIZE - EDGE)),
    y: Math.min(Math.max(p.y, EDGE), Math.max(EDGE, window.innerHeight - SIZE - EDGE)),
  }
}

export function AssistantLauncher() {
  const open = useAssistantStore((s) => s.open)
  const setOpen = useAssistantStore((s) => s.setOpen)
  const hidden = useSettingsStore((s) => s.assistantLauncherHidden)
  const setHidden = useSettingsStore((s) => s.setAssistantLauncherHidden)

  const [pos, setPos] = useState<Pos>(() => clamp(readPos() ?? defaultPos()))
  const [grabbing, setGrabbing] = useState(false)
  /** 长按已生效: 手掌光标已出现, 可以拖了 */
  const [armed, setArmed] = useState(false)

  const holdTimer = useRef<number | null>(null)
  const dragOrigin = useRef<Pos>({ x: 0, y: 0 })
  const startPoint = useRef<Pos>({ x: 0, y: 0 })
  const moved = useRef(false)
  const posRef = useRef(pos)
  posRef.current = pos

  const clearHold = () => {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
  }

  // 视口变化后把位置拉回可见区域, 免得窗口缩小后按钮跑到屏幕外
  useEffect(() => {
    const onResize = () => setPos((p) => clamp(p))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => clearHold, [])

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    moved.current = false
    startPoint.current = { x: e.clientX, y: e.clientY }
    dragOrigin.current = posRef.current
    e.currentTarget.setPointerCapture(e.pointerId)
    clearHold()
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null
      setArmed(true)
    }, HOLD_MS)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!armed) {
      if (Math.hypot(e.clientX - startPoint.current.x, e.clientY - startPoint.current.y) > MOVE_TOLERANCE) {
        moved.current = true
        clearHold()
      }
      return
    }
    e.preventDefault()
    moved.current = true
    if (!grabbing) setGrabbing(true)
    setPos(clamp({
      x: dragOrigin.current.x + (e.clientX - startPoint.current.x),
      y: dragOrigin.current.y + (e.clientY - startPoint.current.y),
    }))
  }

  const endPointer = useCallback(() => {
    clearHold()
    if (armed) {
      setArmed(false)
      setGrabbing(false)
      try { localStorage.setItem(POS_KEY, JSON.stringify(posRef.current)) } catch { /* ignore */ }
      return
    }
    if (!moved.current) setOpen(true)
  }, [armed, setOpen])

  if (open || hidden) return null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="问问小Q"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onContextMenu={(e) => {
            e.preventDefault()
            setHidden(true)
          }}
          style={{ left: pos.x, top: pos.y, width: SIZE, height: SIZE }}
          className={cn(
            'fixed z-30 select-none touch-none p-0 transition-transform',
            armed ? 'cursor-grab scale-105' : 'cursor-pointer hover:scale-[1.04]',
            grabbing && 'cursor-grabbing',
          )}
        >
          <img
            src="/chatQ.webp"
            alt="小Q"
            draggable={false}
            className="h-full w-full object-contain drop-shadow-xl"
          />
        </button>
      </TooltipTrigger>
      {!armed && <TooltipContent side="left">单击开面板 · 长按拖动 · 右键隐藏</TooltipContent>}
    </Tooltip>
  )
}
