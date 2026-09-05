import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n/use-t'
import type { TestCase } from '@/types'
import { Play, Loader2, Plus, Trash2 } from 'lucide-react'

const SUPPORTED_LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'cpp', label: 'C++' },
  { value: 'java', label: 'Java' },
]

const FUNCTION_TEMPLATES: Record<string, string> = {
  javascript: 'function solution() {\n  \n}',
  typescript: 'function solution(): any {\n  \n}',
  python: 'def solution():\n    pass',
}

interface Props {
  initialCode?: string
  initialLanguage?: string
  executionMode?: 'stdio' | 'function'
  loading?: boolean
  disabled?: boolean
  testCases: TestCase[]
  onTestCasesChange?: (testCases: TestCase[]) => void
  onSubmit: (code: string, language: string) => void
}

export function CodeEditor({
  initialCode = '',
  initialLanguage = 'javascript',
  executionMode = 'stdio',
  loading,
  disabled,
  testCases,
  onTestCasesChange,
  onSubmit,
}: Props) {
  const { t } = useT()
  const [code, setCode] = useState(initialCode || (executionMode === 'function' ? (FUNCTION_TEMPLATES[initialLanguage] || FUNCTION_TEMPLATES.javascript) : ''))
  const [language, setLanguage] = useState(initialLanguage)

  const handleLanguageChange = (lang: string) => {
    setLanguage(lang)
    if (executionMode === 'function' && (!code || FUNCTION_TEMPLATES[initialLanguage]?.trim() === code.trim())) {
      setCode(FUNCTION_TEMPLATES[lang] || FUNCTION_TEMPLATES.javascript)
    }
  }

  const updateTestCase = (index: number, field: 'input' | 'expected', value: string) => {
    if (!onTestCasesChange) return
    const next = [...testCases]
    next[index] = { ...next[index], [field]: value }
    onTestCasesChange(next)
  }

  const removeTestCase = (index: number) => {
    if (!onTestCasesChange || testCases.length <= 1) return
    onTestCasesChange(testCases.filter((_, i) => i !== index))
  }

  const addTestCase = () => {
    if (!onTestCasesChange) return
    onTestCasesChange([...testCases, { input: executionMode === 'function' ? '[]' : '', expected: '' }])
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select value={language} onValueChange={handleLanguageChange} disabled={disabled || loading}>
          <SelectTrigger size="sm" className="w-36 shrink-0" aria-label="编程语言">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUPPORTED_LANGUAGES.map((lang) => (
              <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          className="h-8 gap-1.5"
          onClick={() => onSubmit(code, language)}
          disabled={disabled || loading || !code.trim()}
        >
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Play className="size-3.5" />
          )}
          {loading ? (t('practice.codeEditor.running') ?? '运行中...') : (t('practice.codeEditor.run') ?? '运行代码')}
        </Button>
      </div>

      <Textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={
          executionMode === 'function'
            ? 'function solution(...) { ... }'
            : (t('practice.codeEditor.placeholder') ?? '在此编写代码...')
        }
        disabled={disabled || loading}
        rows={executionMode === 'function' ? 8 : 10}
        className={cn(
          'font-mono text-sm resize-y min-h-[160px]',
          'bg-zinc-950 text-zinc-50 dark:bg-zinc-900 dark:text-zinc-100',
          'border-zinc-700 focus-visible:ring-teal-500',
        )}
        spellCheck={false}
      />

      {/* Editable test cases */}
      {onTestCasesChange && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {executionMode === 'function' ? '测试用例（JSON 参数数组 → 期望返回值）' : '测试用例（stdin → stdout）'}
            </span>
            <Button type="button" variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={addTestCase} disabled={disabled || loading}>
              <Plus className="size-3" />
              添加
            </Button>
          </div>
          {testCases.map((tc, i) => (
            <div key={i} className="flex gap-1.5 items-start">
              <span className="text-[10px] text-muted-foreground pt-2 w-5 shrink-0">#{i + 1}</span>
              <Input
                value={tc.input}
                onChange={(e) => updateTestCase(i, 'input', e.target.value)}
                disabled={disabled || loading}
                placeholder={executionMode === 'function' ? 'JSON 参数，如 [1,2]' : 'stdin 输入'}
                className="h-7 text-xs font-mono flex-1"
              />
              <span className="text-[10px] text-muted-foreground pt-2 shrink-0">→</span>
              <Input
                value={tc.expected}
                onChange={(e) => updateTestCase(i, 'expected', e.target.value)}
                disabled={disabled || loading}
                placeholder="期望输出"
                className="h-7 text-xs font-mono flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                onClick={() => removeTestCase(i)}
                disabled={disabled || loading || testCases.length <= 1}
              >
                <Trash2 className="size-3 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
