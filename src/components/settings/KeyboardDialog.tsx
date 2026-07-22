import { useState, useEffect, useCallback, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { useThemeStore } from '@/stores/theme-store'
import type { ShortcutAction } from '@/stores/settings-store'
import {
  type KeyDef,
  getLayout, getKeyLabel, keyCodeToShortcutPart,
} from './keyboard-layout'
import { cn } from '@/lib/utils'

const LABELS: Record<ShortcutAction, string> = { prev: '上一题', next: '下一题', submit: '提交答案' }

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  action: ShortcutAction | null
  currentKeys: string
  onConfirm: (keys: string) => void
}

const BASE_KEY_W = 42
const GAP = 3

function keyStyle(w: number, h: number) {
  return { width: BASE_KEY_W * w + GAP * (w - 1), height: h === 2 ? 85 : 40 }
}

export function KeyboardDialog({ open, onOpenChange, action, currentKeys, onConfirm }: Props) {
  const [recorded, setRecorded] = useState<string[]>([])
  const theme = useThemeStore((s) => s.theme)
  const isDark = theme === 'dark'

  useEffect(() => { if (open) setRecorded(currentKeys ? currentKeys.split('+').filter(Boolean) : []) }, [open, currentKeys])

  const layout = useMemo(() => getLayout(), [])
  const gridCols = 19
  const totalW = gridCols * BASE_KEY_W + (gridCols - 1) * GAP

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!open) return
    e.preventDefault(); e.stopPropagation()
    if (e.key === 'Escape') { recorded.length === 0 ? onOpenChange(false) : setRecorded([]); return }
    if (e.key === 'Backspace' || e.key === 'Delete') { onConfirm(''); onOpenChange(false); return }
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return
    const parts: string[] = []
    if (e.ctrlKey) parts.push('Control')
    if (e.shiftKey) parts.push('Shift')
    if (e.altKey) parts.push('Alt')
    if (e.metaKey) parts.push('Meta')
    parts.push(e.key === ' ' ? 'Space' : e.key)
    setRecorded(parts.slice(0, 3))
  }, [open, recorded, onConfirm, onOpenChange])

  const [activeCodes, setActiveCodes] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!open) return
    const onDown = (e: KeyboardEvent) => {
      const codes = new Set<string>()
      if (e.ctrlKey) codes.add('ControlLeft')
      if (e.shiftKey) codes.add('ShiftLeft')
      if (e.altKey) codes.add('AltLeft')
      if (e.metaKey) codes.add('MetaLeft')
      if (!['ControlLeft', 'ShiftLeft', 'AltLeft', 'MetaLeft'].includes(e.code)) codes.add(e.code)
      setActiveCodes(codes)
    }
    const onUp = () => setActiveCodes(new Set())
    window.addEventListener('keydown', onDown, true)
    window.addEventListener('keyup', onUp, true)
    return () => { window.removeEventListener('keydown', onDown, true); window.removeEventListener('keyup', onUp, true) }
  }, [open])

  useEffect(() => {
    if (!open) return
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [open, handleKeyDown])

  const recordedCodes = useMemo(() => {
    const set = new Set<string>()
    for (const part of recorded) {
      for (const row of layout.main) for (const key of row) { if (keyCodeToShortcutPart(key.code) === part) set.add(key.code) }
      for (const key of layout.nav) { if (keyCodeToShortcutPart(key.code) === part) set.add(key.code) }
      if (part === 'Control') set.add('ControlLeft')
      if (part === 'Shift') set.add('ShiftLeft')
      if (part === 'Alt') set.add('AltLeft')
      if (part === 'Meta') set.add('MetaLeft')
    }
    return set
  }, [recorded, layout])

  // Merge all keys by row
  const allRows = useMemo(() => {
    const rowMap = new Map<number, KeyDef[]>()
    const add = (keys: KeyDef[]) => { for (const k of keys) { if (!rowMap.has(k.row)) rowMap.set(k.row, []); rowMap.get(k.row)!.push(k) } }
    for (const r of layout.main) add(r)
    add(layout.nav)
    const maxRow = Math.max(...rowMap.keys(), 0)
    const result: KeyDef[][] = []
    for (let ri = 0; ri <= maxRow; ri++) {
      result.push((rowMap.get(ri) || []).sort((a, b) => a.col - b.col))
    }
    return result
  }, [layout])

  const renderKeyEl = (k: KeyDef, active: boolean) => {
    const h = k.h ?? 1
    return (
      <div
        key={k.code}
        className={cn(
          'flex items-center justify-center rounded-[4px] text-[10px] font-medium select-none cursor-pointer transition-colors duration-75',
          active
            ? 'bg-[rgba(5,25,70,0.53)] text-white'
            : isDark ? 'bg-[#3a3a4a] text-[#d0d0d8] border-b border-[#555] shadow-[0_1px_0_#555]' : 'bg-white text-[#333] border-b border-[#b5b5b5] shadow-[0_0_2px_rgba(0,0,0,0.15)]',
        )}
        style={keyStyle(k.w, h)}
      >
        {getKeyLabel(k.code)}
      </div>
    )
  }

  // Split rows: left main area (col 0-13), right area (col 14+)
  const splitCol = 14

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[98vw] p-0 gap-0" style={{ maxWidth: Math.min(window.innerWidth * 0.98, 1100) }}>
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-sm flex items-center gap-2">
            {action && LABELS[action]}
            {recorded.length > 0 && <span className="text-xs text-muted-foreground font-normal">— Esc 清除 · ← 删除，确认请点按钮</span>}
          </DialogTitle>
          <DialogDescription className="sr-only">录制快捷键</DialogDescription>
        </DialogHeader>

        <div className="flex gap-0">
          <div className="w-[100px] shrink-0 border-r px-3 py-3">
            {recorded.length > 0 && (
              <div>
                <p className="text-[10px] text-muted-foreground mb-1.5">当前</p>
                <KbdGroup>
                  {recorded.map((k, i) => {
                    const d = k === 'Control' ? 'Ctrl' : k === 'Shift' ? 'Shift' : k === 'Alt' ? 'Alt' : k === 'Meta' ? 'Win' : k
                    return <Kbd key={i}>{d}</Kbd>
                  })}
                </KbdGroup>
              </div>
            )}
          </div>

          <div className="flex-1 p-4 select-none overflow-x-auto" style={{ backgroundColor: isDark ? '#1a1a2a' : '#ececec' }}>
            <div className="flex flex-col mx-auto" style={{ gap: GAP, width: totalW, minWidth: totalW }}>
              {allRows.map((keys, ri) => {
                if (keys.length === 0) return null
                const leftKeys = keys.filter(k => k.col < splitCol)
                const rightKeys = keys.filter(k => k.col >= splitCol)
                const leftEls = leftKeys.map(k => renderKeyEl(k, activeCodes.has(k.code) || recordedCodes.has(k.code)))
                const rightEls = rightKeys.map(k => renderKeyEl(k, activeCodes.has(k.code) || recordedCodes.has(k.code)))
                const gapW = rightKeys.length > 0 ? GAP * 4 : 0
                return (
                  <div key={ri} className="flex" style={{ gap: GAP }}>
                    <div className="flex" style={{ gap: GAP }}>{leftEls}</div>
                    <div style={{ width: gapW, flexShrink: 0 }} />
                    <div className="flex" style={{ gap: GAP }}>{rightEls}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-2 border-t">
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => { onConfirm(''); onOpenChange(false) }}>清除</Button>
          <Button variant="default" size="sm" className="text-xs h-7" disabled={recorded.length === 0} onClick={() => { onConfirm(recorded.join('+')); onOpenChange(false) }}>确认</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
