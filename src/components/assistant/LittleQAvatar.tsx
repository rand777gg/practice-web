import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import type { LittleQEmotion } from '@/lib/assistant-demo'

interface Props {
  className?: string
  /** 决定立绘色温、呼吸节奏与静息姿态 */
  emotion?: LittleQEmotion
  /** 回复生成中: 轻微前倾 + 呼吸变浅 */
  typing?: boolean
}

/**
 * 情绪 → 静息姿态。幅度刻意压得很小 (2px / 1deg 量级):
 * 素材是单张全身立绘, 只能整幅位移, 大了就会看出是图片在动而不是人在动。
 */
const POSE: Record<LittleQEmotion, { y: number; rz: number }> = {
  neutral: { y: 0, rz: 0 },
  happy: { y: -2, rz: 0 },
  concerned: { y: 2, rz: 0 },
  thinking: { y: 0, rz: -1.1 },
}

const GAZE_X = 8
const GAZE_Y = 5
const TURN_X = 2.2
const TURN_Y = 1.4
const LERP = 0.06
const IDLE_MS = 1400

const clamp = (value: number) => Math.max(-1, Math.min(1, value))

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function LittleQAvatar({ className, emotion = 'neutral', typing = false }: Props) {
  const gazeRef = useRef<HTMLDivElement>(null)
  const poseRef = useRef(POSE[emotion])
  const typingRef = useRef(typing)
  const wakeRef = useRef<() => void>(() => {})

  useEffect(() => {
    poseRef.current = POSE[emotion]
    wakeRef.current()
  }, [emotion])

  useEffect(() => {
    typingRef.current = typing
    wakeRef.current()
  }, [typing])

  useEffect(() => {
    const node = gazeRef.current
    if (!node || prefersReducedMotion()) return

    // 指针静止后停掉 rAF: 只留 CSS 层的呼吸与微动, 不常驻占用电量
    const state = {
      nx: 0,
      ny: 0,
      cur: { x: 0, y: 0, rx: 0, ry: 0, rz: 0, scale: 1 },
      wakeUntil: 0,
      raf: 0,
    }

    const wake = (ms = IDLE_MS) => {
      state.wakeUntil = performance.now() + ms
      if (!state.raf) state.raf = requestAnimationFrame(frame)
    }
    wakeRef.current = () => wake()

    const frame = (now: number) => {
      state.raf = 0
      const pose = poseRef.current
      const pulse = typingRef.current ? 0.5 + 0.5 * Math.sin(now / 420) : 0
      const cur = state.cur

      cur.x += (state.nx * GAZE_X - cur.x) * LERP
      cur.y += (state.ny * GAZE_Y + pose.y - cur.y) * LERP
      cur.rx += (-state.ny * TURN_Y + pulse * 0.6 - cur.rx) * LERP
      cur.ry += (-state.nx * TURN_X - cur.ry) * LERP
      cur.rz += (pose.rz - cur.rz) * LERP
      cur.scale += (1 + pulse * 0.006 - cur.scale) * LERP

      node.style.transform =
        `translate3d(${cur.x.toFixed(2)}px, ${cur.y.toFixed(2)}px, 0)` +
        ` rotateY(${cur.ry.toFixed(3)}deg) rotateX(${cur.rx.toFixed(3)}deg)` +
        ` rotateZ(${cur.rz.toFixed(3)}deg) scale(${cur.scale.toFixed(4)})`

      if (typingRef.current || now < state.wakeUntil) state.raf = requestAnimationFrame(frame)
    }

    const onPointerMove = (event: PointerEvent) => {
      const rect = node.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      state.nx = clamp((event.clientX - (rect.left + rect.width / 2)) / (rect.width * 0.8))
      state.ny = clamp((event.clientY - (rect.top + rect.height / 2)) / (rect.height * 0.8))
      wake()
    }
    const onLookAway = () => {
      state.nx = 0
      state.ny = 0
      wake()
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('blur', onLookAway)
    wake(600)

    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('blur', onLookAway)
      if (state.raf) cancelAnimationFrame(state.raf)
      wakeRef.current = () => {}
    }
  }, [])

  return (
    <div className={cn('lq-stage relative', className)} data-emotion={emotion}>
      <div ref={gazeRef} className="lq-gaze h-full w-full">
        <div className="lq-idle h-full w-full">
          <div className="lq-breathe h-full w-full">
            <img
              src="/chatQ.webp"
              alt="小Q"
              draggable={false}
              className="h-full w-full select-none object-contain"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
