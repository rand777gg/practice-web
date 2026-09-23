import { useEffect, useMemo, useState } from 'react'
import {
  Check, Copy, Download, FlaskConical, Info, Loader2, Plus, RotateCcw, Save, Trash2, Wand2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import {
  PROMPT_DEFS, PROMPT_GROUP_LABELS, extractVariables, getPromptDefault, getPromptDef,
  isBuiltinPrompt, type PromptGroup,
} from '@/lib/ai/prompt-catalog'
import { hasAiConfig } from '@/lib/ai/config'
import { usePromptStore, getPrompt } from '@/stores/prompt-store'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n/use-t'

const GROUP_ORDER: PromptGroup[] = ['import', 'generate', 'analyze', 'format', 'misc']

function slugify(text: string): string {
  const ascii = text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return ascii || `prompt-${Date.now().toString(36)}`
}

export function Component() {
  const { lang } = useT()
  const zh = lang === 'zh'

  const rows = usePromptStore((s) => s.rows)
  const save = usePromptStore((s) => s.save)
  const remove = usePromptStore((s) => s.remove)

  const [selected, setSelected] = useState<string>(PROMPT_DEFS[0].key)
  // 草稿按 key 分开存:没写过草稿的条目直接用当前生效值,所以切条目不需要 effect 来同步
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [titleDrafts, setTitleDrafts] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const [testInput, setTestInput] = useState('')
  const [testOutput, setTestOutput] = useState('')
  const [testing, setTesting] = useState(false)

  // 进页面先把「我的提示词」补齐:内置的按默认值落库,这样站内与 MCP 两边读到的都是同一份
  useEffect(() => {
    const run = async () => {
      const store = usePromptStore.getState()
      if (!store.loaded) await store.load()
      await usePromptStore.getState().seedBuiltins()
    }
    void run()
  }, [])

  const customKeys = useMemo(() => Object.keys(rows).filter((key) => !isBuiltinPrompt(key)).sort(), [rows])
  const customizedCount = useMemo(
    () => PROMPT_DEFS.filter((def) => rows[def.key] && rows[def.key].body !== def.default).length,
    [rows],
  )

  const def = getPromptDef(selected)
  const effective = getPrompt(selected)
  const draft = drafts[selected] ?? effective
  const dirty = drafts[selected] !== undefined && drafts[selected] !== effective
  const variables = extractVariables(draft)
  const titleDraft = titleDrafts[selected] ?? rows[selected]?.title ?? ''

  const setDraft = (value: string) => setDrafts((prev) => ({ ...prev, [selected]: value }))
  const setTitleDraft = (value: string) => setTitleDrafts((prev) => ({ ...prev, [selected]: value }))
  const clearDraft = (key: string) => {
    setDrafts((prev) => { const next = { ...prev }; delete next[key]; return next })
    setTitleDrafts((prev) => { const next = { ...prev }; delete next[key]; return next })
  }
  const selectKey = (key: string) => {
    setSelected(key)
    setStatus(null)
    setTestOutput('')
  }

  async function handleSave() {
    if (!draft.trim()) {
      setStatus({ kind: 'err', text: zh ? '提示词不能为空' : 'The prompt cannot be empty' })
      return
    }
    setBusy(true)
    try {
      await save(selected, draft, def ? null : titleDraft, true)
      clearDraft(selected)
      setStatus({ kind: 'ok', text: zh ? '已保存到你的账号' : 'Saved to your account' })
    } catch (err) {
      setStatus({ kind: 'err', text: err instanceof Error ? err.message : String(err) })
    }
    setBusy(false)
  }

  async function handleReset() {
    setBusy(true)
    try {
      // 还原 = 写回默认值(而不是删行):行在,MCP 那边才取得到
      const fallback = getPromptDefault(selected)
      await save(selected, fallback, null, true)
      clearDraft(selected)
      setStatus({ kind: 'ok', text: zh ? '已还原为内置默认' : 'Restored the built-in default' })
    } catch (err) {
      setStatus({ kind: 'err', text: err instanceof Error ? err.message : String(err) })
    }
    setBusy(false)
  }

  async function handleDeleteCustom() {
    setBusy(true)
    try {
      const deleted = selected
      await remove(deleted)
      clearDraft(deleted)
      selectKey(PROMPT_DEFS[0].key)
    } catch (err) {
      setStatus({ kind: 'err', text: err instanceof Error ? err.message : String(err) })
    }
    setBusy(false)
  }

  function handleNew() {
    const key = slugify(zh ? '我的新提示词' : 'my new prompt')
    let unique = key
    let n = 2
    while (rows[unique] || isBuiltinPrompt(unique)) unique = `${key}-${n++}`
    setTitleDrafts((prev) => ({ ...prev, [unique]: zh ? '未命名提示词' : 'Untitled prompt' }))
    selectKey(unique)
  }

  async function handleTest() {
    if (!hasAiConfig()) {
      setStatus({ kind: 'err', text: zh ? '没有配置 AI Key，无法试跑' : 'No AI key configured — cannot run a test' })
      return
    }
    setTesting(true)
    setTestOutput('')
    try {
      const [{ createDeepSeek }, { generateText }, { getAiConfig }] = await Promise.all([
        import('@ai-sdk/deepseek'),
        import('ai'),
        import('@/lib/ai/config'),
      ])
      const cfg = getAiConfig()
      const model = createDeepSeek({ apiKey: cfg.apiKey, baseURL: cfg.baseURL, fetch: cfg.fetch })
      const isUserRole = def?.role === 'user'
      const { text } = await generateText({
        model: model(cfg.model || 'deepseek-chat'),
        ...(isUserRole
          ? { prompt: testInput ? `${draft}\n\n${testInput}` : draft }
          : { system: draft, prompt: testInput || (zh ? '（没填输入，请简单回应）' : '(no input given — respond briefly)') }),
        temperature: 0.3,
      })
      setTestOutput(text.trim())
    } catch (err) {
      setTestOutput(err instanceof Error ? err.message : String(err))
    }
    setTesting(false)
  }

  function exportSkill() {
    const blocks: string[] = []
    for (const item of PROMPT_DEFS) {
      const body = getPrompt(item.key)
      if (!body) continue
      blocks.push(`## ${item.titleZh}（${item.key}）\n\n${item.usedByZh}\n\n\`\`\`text\n${body}\n\`\`\``)
    }
    for (const key of customKeys) {
      const row = rows[key]
      blocks.push(`## ${row.title ?? key}（${key}）\n\n\`\`\`text\n${row.body}\n\`\`\``)
    }
    const doc = [
      '---',
      'name: practice-web-prompts',
      'description: 我在刷题网站配置的提示词。做题解、出题、整理材料时按这些规矩来。',
      '---',
      '',
      '# 我的提示词',
      '',
      '这些是我在刷题网站「提示词」页里确认过的规矩，请按它们工作。',
      '',
      blocks.join('\n\n'),
      '',
    ].join('\n')
    const url = URL.createObjectURL(new Blob([doc], { type: 'text/markdown;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'practice-web-prompts.SKILL.md'
    link.click()
    URL.revokeObjectURL(url)
  }

  const rowButton = (key: string, title: string, meta: string, active: boolean) => (
    <button
      key={key}
      type="button"
      onClick={() => selectKey(key)}
      className={cn(
        'w-full rounded-lg border px-3 py-2 text-left transition-colors',
        active ? 'border-primary bg-primary/5' : 'hover:bg-accent',
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{title}</span>
        {isBuiltinPrompt(key) && rows[key] && rows[key].body !== getPromptDefault(key) && (
          <Badge variant="secondary" className="shrink-0 text-[9px] font-normal">
            {zh ? '已自定义' : 'custom'}
          </Badge>
        )}
      </div>
      <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{meta}</p>
    </button>
  )

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            <Wand2 className="h-5 w-5 text-primary" />
            {zh ? '提示词' : 'Prompts'}
            <Badge variant="secondary" className="font-normal">
              {PROMPT_DEFS.length}{zh ? ' 条内置' : ' built-in'}<Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />{zh ? <>已改 {customizedCount}</> : <>{customizedCount} customized</>}
            </Badge>
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {zh
              ? '平台里每一处 AI 调用用的「规矩」都在这里，可以按你的习惯改。改完立刻对全站生效，也只影响你自己的账号。'
              : 'Every AI call in the platform uses one of these prompts. Tune them to your taste — changes apply immediately and only to your own account.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleNew}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {zh ? '新建提示词' : 'New prompt'}
          </Button>
          <Button size="sm" variant="outline" onClick={exportSkill}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {zh ? '导出为 SKILL.md' : 'Export as SKILL.md'}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="space-y-3">
          {GROUP_ORDER.map((group) => {
            const items = PROMPT_DEFS.filter((item) => item.group === group)
            if (!items.length) return null
            return (
              <div key={group} className="space-y-1.5">
                <p className="px-1 text-[11px] font-medium text-muted-foreground">
                  {zh ? PROMPT_GROUP_LABELS[group].zh : PROMPT_GROUP_LABELS[group].en}
                </p>
                {items.map((item) => rowButton(item.key, zh ? item.titleZh : item.titleEn, item.key, selected === item.key))}
              </div>
            )
          })}

          <div className="space-y-1.5">
            <p className="px-1 text-[11px] font-medium text-muted-foreground">
              {zh ? '我自建的' : 'My own'}
            </p>
            {customKeys.length === 0 ? (
              <p className="px-1 text-[10px] leading-relaxed text-muted-foreground">
                {zh ? '还没有自建提示词。点右上角「新建提示词」加一条。' : 'None yet — use “New prompt” above.'}
              </p>
            ) : (
              customKeys.map((key) => rowButton(key, rows[key].title ?? key, key, selected === key))
            )}
          </div>
        </div>

        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                {def ? (zh ? def.titleZh : def.titleEn) : (titleDraft || selected)}
                <Badge variant="secondary" className="font-mono text-[10px] font-normal">{selected}</Badge>
                {def && (
                  <Badge variant="outline" className="text-[10px] font-normal">
                    {def.role === 'system' ? (zh ? '填入 system' : 'system slot') : (zh ? '填入提问' : 'user slot')}
                  </Badge>
                )}
                {dirty && (
                  <Badge variant="secondary" className="bg-amber-100 text-[10px] font-normal text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                    {zh ? '未保存' : 'unsaved'}
                  </Badge>
                )}
              </CardTitle>
              {def && (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {zh ? def.usedByZh : def.usedByEn}
                  <span className="ml-1 font-mono text-[10px] opacity-70">{def.usedAt}</span>
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-3 pt-1">
              {!def && (
                <div className="space-y-1.5">
                  <Label htmlFor="prompt-title" className="text-xs">{zh ? '标题' : 'Title'}</Label>
                  <Input
                    id="prompt-title"
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    className="h-9 text-sm"
                    placeholder={zh ? '例如：我的讲题口吻' : 'e.g. My tutoring voice'}
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="prompt-body" className="text-xs">{zh ? '内容' : 'Body'}</Label>
                <Textarea
                  id="prompt-body"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={14}
                  className="font-mono text-xs leading-relaxed"
                />
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
                  <span>{zh ? `${draft.length} 字` : `${draft.length} chars`}</span>
                  {variables.length > 0 && (
                    <span>
                      {zh ? '变量：' : 'Variables: '}
                      {variables.map((v) => (
                        <code key={v} className="mr-1 rounded bg-muted px-1 py-0.5 font-mono">{`{{${v}}}`}</code>
                      ))}
                    </span>
                  )}
                  {!def && variables.length === 0 && (
                    <span>{zh ? '可以写 {{变量}} 占位，交给 AI 时自己替换。' : 'You may use {{placeholders}}; they are filled in when the prompt is used.'}</span>
                  )}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => void handleSave()} disabled={busy || !dirty}>
                  {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                  {zh ? '保存' : 'Save'}
                </Button>
                {def ? (
                  <Button size="sm" variant="outline" onClick={() => void handleReset()} disabled={busy || !rows[selected]}>
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    {zh ? '还原内置默认' : 'Reset to default'}
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" className="text-rose-600 hover:text-rose-600 dark:text-rose-400" onClick={() => void handleDeleteCustom()} disabled={busy}>
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    {zh ? '删除' : 'Delete'}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void navigator.clipboard.writeText(draft).catch(() => {})}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  {zh ? '复制' : 'Copy'}
                </Button>
              </div>

              {status && (
                <p className={cn('flex items-center gap-1.5 text-[11px]', status.kind === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500')}>
                  {status.kind === 'ok' ? <Check className="h-3 w-3" /> : <Info className="h-3 w-3" />}
                  {status.text}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <FlaskConical className="h-4 w-4 text-primary" />
                {zh ? '试跑（用当前草稿，不用先保存）' : 'Try it (uses the draft, no need to save)'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-1">
              <Textarea
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                rows={4}
                className="text-xs"
                placeholder={zh ? '给点输入材料，例如一小段题目文本' : 'Paste some input, e.g. a short question'}
              />
              <Button size="sm" variant="outline" onClick={() => void handleTest()} disabled={testing}>
                {testing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="mr-1.5 h-3.5 w-3.5" />}
                {zh ? '跑一遍' : 'Run'}
              </Button>
              {testOutput && (
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-[11px] leading-relaxed">{testOutput}</pre>
              )}
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                {zh
                  ? '试跑直接调用你自己的 AI Key，会消耗额度；输出的只是一次采样，满意了再保存。'
                  : 'The test calls your own AI key and consumes quota. Output is one sample — save once you like it.'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Info className="h-4 w-4 text-muted-foreground" />
                {zh ? '提示词去哪儿' : 'Where prompts travel'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 pt-1 text-[11px] leading-relaxed text-muted-foreground">
              <p>· {zh ? '站内：所有 AI 功能立刻按你改后的版本工作（导入提取、出题、知识点、图表解读、换行修复等）。' : 'In the app: every AI feature immediately uses your edited version (import, generation, key points, chart insight, line-break fix…).'}</p>
              <p>· {zh ? '站外：接上平台的 MCP 端点后，你的 AI 助手可以用 list_prompts / get_prompt 直接取走这些提示词 —— 见「MCP 服务」页。' : 'Outside: with the platform MCP endpoint connected, your AI assistant can pull these via list_prompts / get_prompt — see the MCP Server page.'}</p>
              <p>· {zh ? '文件：右上角「导出为 SKILL.md」会把当前生效的提示词打包成一份说明文档，丢进 AI 的 skills 目录即可。' : 'Files: “Export as SKILL.md” bundles the effective prompts into one document for your AI’s skills folder.'}</p>
            </CardContent>
          </Card>

          <Separator />
          <p className="px-1 text-[10px] leading-relaxed text-muted-foreground">
            {zh
              ? '内置提示词的默认值写在代码里（src/lib/ai/prompt-catalog.ts），这里改的是你自己的覆盖，不会影响其他用户。第一次打开本页会把内置提示词按其默认值存进你的账号 —— 这样 MCP 端点和站内读到的才是同一份。'
              : 'Built-in defaults live in code (src/lib/ai/prompt-catalog.ts); edits here are your own overrides and never affect other users. Opening this page once stores the built-ins into your account at their default values, so the MCP endpoint and the app read the same thing.'}
          </p>
        </div>
      </div>
    </div>
  )
}
