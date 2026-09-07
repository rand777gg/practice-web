import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { cpp } from '@codemirror/lang-cpp'
import { java } from '@codemirror/lang-java'
import type { ViewUpdate } from '@uiw/react-codemirror'
import { cn } from '@/lib/utils'

/** 语言 key -> CodeMirror 语言扩展 */
const langExt: Record<string, ReturnType<typeof javascript>> = {
  javascript: javascript({ jsx: true }),
  typescript: javascript({ jsx: true, typescript: true }),
  python: python(),
  cpp: cpp(),
  java: java(),
}

interface Props {
  value: string
  onChange: (value: string) => void
  language?: string
  readOnly?: boolean
  className?: string
  minHeight?: string
  /** 光标/选择变化回调 */
  onCursor?: (line: number, col: number) => void
}

function posToLineCol(docText: string, pos: number): [number, number] {
  let line = 1, col = 0
  for (let i = 0; i < pos; i++) {
    if (docText.charCodeAt(i) === 10) { line++; col = 0 } else col++
  }
  return [line, col + 1]
}

export function CodeEditorCM({ value, onChange, language = 'javascript', readOnly, className, minHeight = '320px', onCursor }: Props) {
  const ext = useMemo(() => [langExt[language] || langExt.javascript], [language])
  const handleUpdate = (vu: ViewUpdate) => {
    if (!onCursor) return
    if (!vu.selectionSet) return
    const head = vu.state.selection.main.head
    const [l, c] = posToLineCol(vu.state.doc.toString(), head)
    onCursor(l, c)
  }
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      onUpdate={handleUpdate}
      theme={oneDark}
      extensions={ext}
      readOnly={readOnly}
      height="auto"
      minHeight={minHeight}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
        highlightActiveLineGutter: true,
        autocompletion: true,
        bracketMatching: true,
        closeBrackets: true,
        indentOnInput: true,
      }}
      className={cn('text-sm overflow-hidden rounded-md border border-zinc-800', className)}
    />
  )
}

