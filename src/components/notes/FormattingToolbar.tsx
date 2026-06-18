import { useRef, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import {
  Bold, Italic, Underline, Strikethrough, Highlighter, Smile,
  List, ListOrdered, AlignLeft, AlignCenter, AlignRight, Indent, Undo2, Sigma,
} from 'lucide-react'
import { EmojiPickerContent } from './EmojiPickerContent'

function wrapSelection(value: string, ta: HTMLTextAreaElement, open: string, close: string): string {
  const s = ta.selectionStart, e = ta.selectionEnd
  if (s === e) return value
  const before = value.slice(0, s)
  const selected = value.slice(s, e)
  const after = value.slice(e)
  const newValue = before + open + selected + close + after
  requestAnimationFrame(() => {
    ta.focus()
    ta.setSelectionRange(s + open.length, e + open.length)
  })
  return newValue
}

const MAX_UNDO = 50

interface Props {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  value: string
  onChange: (value: string) => void
  extraButtons?: React.ReactNode
}

export function FormattingToolbar({ textareaRef, value, onChange, extraButtons }: Props) {
  const undoStackRef = useRef<string[]>([])

  const pushUndo = () => {
    const ta = textareaRef.current
    if (!ta) return
    const stack = undoStackRef.current
    if (stack.length >= MAX_UNDO) stack.shift()
    stack.push(ta.value)
  }

  const handleUndo = useCallback(() => {
    const ta = textareaRef.current
    const stack = undoStackRef.current
    if (!ta || stack.length === 0) return
    const prev = stack.pop()!
    ta.value = prev
    ta.focus()
    onChange(prev)
  }, [onChange])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      }
    }
    el.addEventListener('keydown', onKey)
    return () => el.removeEventListener('keydown', onKey)
  }, [handleUndo, textareaRef])

  const applyFormat = (open: string, close: string) => {
    const ta = textareaRef.current
    if (!ta) return
    pushUndo()
    const v = wrapSelection(ta.value, ta, open, close)
    ta.value = v
    onChange(v)
  }

  const applyLinePrefix = (prefix: string) => {
    const ta = textareaRef.current
    if (!ta) return
    pushUndo()
    const s = ta.selectionStart; const e = ta.selectionEnd
    const before = ta.value.slice(0, s)
    const selected = ta.value.slice(s, e)
    const lines = selected ? selected.split('\n') : ['']
    const formatted = lines.map(l => prefix + l).join('\n')
    ta.value = before + formatted + ta.value.slice(e)
    const newEnd = s + formatted.length
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s, newEnd) })
    onChange(ta.value)
  }

  const handleEmoji = (emoji: string) => {
    const ta = textareaRef.current
    if (!ta) { onChange(value + emoji); return }
    pushUndo()
    const s = ta.selectionStart
    const before = ta.value.slice(0, s)
    const after = ta.value.slice(s)
    ta.value = before + emoji + after
    const pos = s + emoji.length
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(pos, pos) })
    onChange(ta.value)
  }

  const insertMarkdown = (template: string) => {
    const ta = textareaRef.current
    if (!ta) { onChange(value + template); return }
    pushUndo()
    const s = ta.selectionStart; const e = ta.selectionEnd
    const before = ta.value.slice(0, s); const after = ta.value.slice(e)
    ta.value = before + template + after
    ta.selectionStart = ta.selectionEnd = s + template.length
    ta.focus()
    onChange(ta.value)
  }

  const handleLineHeight = (lh: string) => applyFormat(`<span style="line-height:${lh}">`, '</span>')
  const handleAlign = (align: string) => applyFormat(`<div align="${align}">`, '</div>')

  return (
    <div className="flex gap-1 flex-wrap items-center">
      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="撤销 (Ctrl+Z)" onClick={handleUndo}>
        <Undo2 className="h-3.5 w-3.5" />
      </Button>
      <span className="w-px h-4 bg-border mx-0.5 self-center" />
      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="加粗" onClick={() => applyFormat('**', '**')}>
        <Bold className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="斜体" onClick={() => applyFormat('*', '*')}>
        <Italic className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="下划线" onClick={() => applyFormat('<u>', '</u>')}>
        <Underline className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="删除线" onClick={() => applyFormat('<s>', '</s>')}>
        <Strikethrough className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="高亮" onClick={() => applyFormat('<mark>', '</mark>')}>
        <Highlighter className="h-3.5 w-3.5" />
      </Button>
      <span className="w-px h-4 bg-border mx-0.5 self-center" />
      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="有序列表" onClick={() => applyLinePrefix('1. ')}>
        <ListOrdered className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="无序列表" onClick={() => applyLinePrefix('- ')}>
        <List className="h-3.5 w-3.5" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="行高">
            <span className="text-[11px] font-mono">1.5</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {['1.0', '1.25', '1.5', '1.75', '2.0'].map(lh => (
            <DropdownMenuItem key={lh} onClick={() => handleLineHeight(lh)}>
              <span className="text-xs">{lh}x</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="对齐方式">
            <AlignLeft className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => handleAlign('left')}>
            <AlignLeft className="h-3.5 w-3.5 mr-1" /><span className="text-xs">左对齐</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleAlign('center')}>
            <AlignCenter className="h-3.5 w-3.5 mr-1" /><span className="text-xs">居中</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleAlign('right')}>
            <AlignRight className="h-3.5 w-3.5 mr-1" /><span className="text-xs">右对齐</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="增加缩进" onClick={() => applyFormat('<blockquote>', '</blockquote>')}>
        <Indent className="h-3.5 w-3.5" />
      </Button>
      <span className="w-px h-4 bg-border mx-0.5 self-center" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="插入 Emoji">
            <Smile className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <EmojiPickerContent onSelect={handleEmoji} />
      </DropdownMenu>
      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="插入公式"
        onClick={() => insertMarkdown('$E=mc^2$')}>
        <Sigma className="h-3.5 w-3.5" />
      </Button>
      {extraButtons}
    </div>
  )
}
