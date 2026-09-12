import { useEffect, useRef, useState } from 'react'
import { IkiPlayer } from '@ikijs/engine'
import { loadIkiModel, StandardParameter } from '@ikijs/format'
import { type LittleQEmotion } from '@/lib/assistant-demo'
import { cn } from '@/lib/utils'

export type { LittleQEmotion }

interface Props {
  /** 回复生成中: 口型随音节开合, 身体轻微起伏 */
  speaking?: boolean
  /** 用户正在输入: 微微前倾, 眼睛完全睁开 */
  listening?: boolean
  emotion?: LittleQEmotion
  /** 每次自增触发一次点头 + 眨眼的一次性反应 */
  nudge?: number
  className?: string
}

/**
 * 情绪 → 静息姿态。所有幅度都刻意压得很小 (参数单位 ≈ 1.7px / 单位):
 * 模型是「整颗头平移」的绑定方式, 幅度一大就会看出头部脱位,
 * 所以这里把生命感放在眨眼 / 呼吸 / 口型 / 微动上, 而不是大幅转头。
 */
const EMOTION_POSE: Record<LittleQEmotion, { x: number; y: number; z: number; mouthForm: number; breathRate: number }> = {
  neutral: { x: 0, y: 0, z: 0, mouthForm: 0, breathRate: 1900 },
  happy: { x: 0, y: 0.8, z: 3.2, mouthForm: 0.35, breathRate: 1700 },
  concerned: { x: 0, y: -1.2, z: -2.6, mouthForm: -0.15, breathRate: 2200 },
  thinking: { x: -1.6, y: 1.4, z: 2, mouthForm: 0, breathRate: 2100 },
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** 手部姿势参数: 模型里只有一只手 (小Q 自己的手), 沿一条弧线抬起 + 微翻转 */
const HAND_RAISE = 'ParamHandRaise'
const HAND_TILT = 'ParamHandTilt'

const HAND_POSE = {
  rest: { raise: 0, tilt: 0 },
  point: { raise: 0.75, tilt: 0.35 },
  cover: { raise: 1, tilt: 0.8 },
} as const

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export function LittleQAvatar({ speaking = false, listening = false, emotion = 'neutral', nudge = 0, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  const propsRef = useRef({ speaking, listening, emotion, nudge })
  useEffect(() => {
    propsRef.current = { speaking, listening, emotion, nudge }
  }, [speaking, listening, emotion, nudge])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let disposed = false
    let player: IkiPlayer | null = null
    let raf = 0
    let last = performance.now()
    const state = {
      blinkStart: -1000,
      blinkQueue: 0,
      nextBlink: 1500,
      mouth: 0,
      mouthAt: 0,
      mouthTarget: 0,
      angleX: 0,
      angleY: 0,
      angleZ: 0,
      nodUntil: 0,
      seenNudge: propsRef.current.nudge,
      hand: { raise: 0, tilt: 0, coverUntil: 0, seenNudge: propsRef.current.nudge },
      pointer: { x: 0, y: 0, at: -1e9 },
    }

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      state.pointer.x = clamp((event.clientX - (rect.left + rect.width / 2)) / (rect.width * 1.1), -1.2, 1.2)
      state.pointer.y = clamp((event.clientY - (rect.top + rect.height / 2)) / (rect.height * 1.1), -1.2, 1.2)
      state.pointer.at = performance.now()
    }
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    const onLeave = () => {
      state.pointer.at = -1e9
    }
    window.addEventListener('blur', onLeave)

    const step = (now: number) => {
      if (disposed || !player) return
      raf = requestAnimationFrame(step)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const { speaking: isSpeaking, listening: isListening, emotion: mood, nudge: currentNudge } = propsRef.current
      const pose = EMOTION_POSE[mood]

      if (currentNudge !== state.seenNudge) {
        state.seenNudge = currentNudge
        state.nodUntil = now + 300
        state.blinkStart = now
        state.nextBlink = now + 2600
      }

      player.setParameter(StandardParameter.Breath, 0.5 + 0.5 * Math.sin(now / pose.breathRate))

      // 眨眼: 随机间隔 + 偶尔连眨两下
      if (now >= state.nextBlink) {
        state.blinkStart = now
        state.nextBlink = now + 2600 + Math.random() * 4200
        if (state.blinkQueue === 0 && Math.random() < 0.22) state.blinkQueue = 1
      }
      const blinkAge = now - state.blinkStart
      let eyeOpen = 1
      if (blinkAge >= 0 && blinkAge < 95) eyeOpen = 1 - blinkAge / 95
      else if (blinkAge >= 95 && blinkAge < 190) eyeOpen = (blinkAge - 95) / 95
      else if (blinkAge >= 190 && state.blinkQueue > 0) {
        state.blinkQueue = 0
        state.blinkStart = now + 110
      }
      if (isListening) eyeOpen = Math.max(eyeOpen, 0.92)
      player.setParameter(StandardParameter.EyeOpenLeft, eyeOpen)
      player.setParameter(StandardParameter.EyeOpenRight, eyeOpen)

      // 头部: 静息姿态 + 跟随鼠标的微动 + 待机摇摆
      let targetX = pose.x
      let targetY = pose.y
      if (now - state.pointer.at < 4500) {
        targetX += state.pointer.x * 5
        targetY += -state.pointer.y * 3.4
      } else {
        targetX += Math.sin(now / 6400) * 1.1
        targetY += Math.sin(now / 8100) * 0.7
      }
      if (isListening) targetY += 1
      if (isSpeaking) targetY += Math.sin(now / 280) * 0.7
      if (now < state.nodUntil) targetY -= 2.6
      const ease = Math.min(1, dt * 3.2)
      state.angleX += (targetX - state.angleX) * ease
      state.angleY += (targetY - state.angleY) * ease
      state.angleZ += (pose.z - state.angleZ) * Math.min(1, dt * 2.4)
      player.setParameter(StandardParameter.AngleX, state.angleX)
      player.setParameter(StandardParameter.AngleY, state.angleY)
      player.setParameter(StandardParameter.AngleZ, state.angleZ)

      // 口型: 说话时按「音节」开合, 停止后收回
      if (isSpeaking) {
        if (now >= state.mouthAt) {
          state.mouthAt = now + 110 + Math.random() * 150
          state.mouthTarget = Math.random() < 0.25 ? 0.08 : 0.24 + Math.random() * 0.5
        }
        state.mouth += (state.mouthTarget - state.mouth) * Math.min(1, dt * 13)
      } else {
        state.mouth += (0 - state.mouth) * Math.min(1, dt * 7)
      }
      player.setParameter(StandardParameter.MouthOpen, state.mouth)
      player.setParameter(StandardParameter.MouthForm, pose.mouthForm)

      // 手: 平时放在胸前; 想事情时抬到嘴边; 刚讲完一件开心事时捂嘴笑
      const hand = state.hand
      if (currentNudge !== hand.seenNudge) {
        hand.seenNudge = currentNudge
        if (mood === 'happy') hand.coverUntil = now + 1500
      }
      const handTarget = now < hand.coverUntil ? HAND_POSE.cover : mood === 'thinking' ? HAND_POSE.point : HAND_POSE.rest
      const handEase = Math.min(1, dt * 3)
      hand.raise += (handTarget.raise - hand.raise) * handEase
      hand.tilt += (handTarget.tilt - hand.tilt) * handEase
      player.setParameter(HAND_RAISE, hand.raise)
      player.setParameter(HAND_TILT, hand.tilt)
    }

    const boot = async () => {
      const response = await fetch('/littleq.iki')
      if (!response.ok) throw new Error(`model ${response.status}`)
      const model = loadIkiModel(await response.text())
      if (disposed) return
      const instance = new IkiPlayer(canvas)
      player = instance
      const result = await instance.load(model)
      if (disposed) {
        instance.destroy()
        return
      }
      if (result.failedTextures.length > 0) throw new Error('textures failed')
      instance.setParameter(StandardParameter.EyeOpenLeft, 1)
      instance.setParameter(StandardParameter.EyeOpenRight, 1)
      instance.setParameter(StandardParameter.Breath, 0.5)
      instance.start()
      setStatus('ready')
      if (prefersReducedMotion()) {
        instance.setParameter(StandardParameter.AngleZ, 2)
        return
      }
      // 出场时先点一下头, 让「加载完成」这件事有反馈
      state.nodUntil = performance.now() + 520
      last = performance.now()
      raf = requestAnimationFrame(step)
    }

    boot().catch((error) => {
      console.error('[LittleQAvatar] boot failed', error)
      if (!disposed) setStatus('failed')
    })

    return () => {
      disposed = true
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('blur', onLeave)
      if (raf) cancelAnimationFrame(raf)
      player?.destroy()
    }
  }, [])

  return (
    <div className={cn('relative', className)}>
      <img
        src="/littleq.webp"
        alt="小Q"
        className={cn(
          'pointer-events-none absolute inset-0 h-full w-full object-contain transition-opacity duration-500',
          status === 'ready' ? 'opacity-0' : 'opacity-95',
        )}
      />
      <canvas
        ref={canvasRef}
        aria-label="小Q 角色"
        className={cn(
          'relative h-full w-full transition-opacity duration-500',
          status === 'ready' ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  )
}
