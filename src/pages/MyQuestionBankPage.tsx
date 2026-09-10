import { useState } from 'react'
import {
  Box, Check, CheckCircle2, CircleSlash, Copy, Database, FileCode, Globe, HardDrive,
  Info, Pencil, Plus, Server, ShieldCheck, Trash2, TriangleAlert, Upload,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { DemoBadge } from '@/components/topics/TopicSidebar'
import { topicAccent } from '@/components/topics/topic-sections'
import {
  ADAPTER_INTERFACE, BANK_CONNECTIONS, BANK_SCHEMA_SQL, DOCKER_STEPS, LOCAL_QUESTIONS,
  PLATFORM_LIMITS, SHARE_ENDPOINT,
  type BankConnectionKind, type LocalQuestion,
} from '@/lib/my-bank-demo'
import { DEMO_TOPICS, getDemoTopic, topicIndexOf } from '@/lib/topics-demo'
import { cn } from '@/lib/utils'

const CONNECTION_ICONS: Record<BankConnectionKind, typeof Box> = {
  docker: Box,
  remote: Server,
  browser: HardDrive,
}

const STATUS_META: Record<LocalQuestion['status'], { label: string; className: string }> = {
  local: { label: '仅本机', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  'shared-pending': { label: '待上传', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  'shared-done': { label: '已上传', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
}

function CodeBlock({ title, code, note }: { title?: string; code: string; note?: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      // 剪贴板不可用时也给反馈，避免按钮像没反应
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      {title && (
        <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5">
          <FileCode className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{title}</span>
          <button
            type="button"
            onClick={copy}
            className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? '已复制' : '复制'}
          </button>
        </div>
      )}
      <pre className="overflow-x-auto p-3 text-[11px] leading-relaxed">{code}</pre>
      {note && <p className="border-t bg-muted/30 px-3 py-1.5 text-[10px] text-muted-foreground">{note}</p>}
    </div>
  )
}

function QuestionEditor({
  draft,
  onChange,
  onClose,
  onSave,
  isNew,
}: {
  draft: LocalQuestion
  onChange: (question: LocalQuestion) => void
  onClose: () => void
  onSave: () => void
  isNew: boolean
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[86vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4 text-primary" />
            {isNew ? '新增题目' : '编辑题目'}
          </DialogTitle>
          <DialogDescription>
            这里编辑的是你<b className="font-medium text-foreground">自己数据库</b>里的记录，保存会直接写回你的库，平台不留副本。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="q-topic" className="text-xs">
                专业课
              </Label>
              <select
                id="q-topic"
                value={draft.topicId}
                onChange={(event) => onChange({ ...draft, topicId: event.target.value })}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                {DEMO_TOPICS.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="q-type" className="text-xs">
                题型
              </Label>
              <Input
                id="q-type"
                value={draft.type}
                onChange={(event) => onChange({ ...draft, type: event.target.value })}
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="q-stem" className="text-xs">
              题干
            </Label>
            <Textarea
              id="q-stem"
              rows={3}
              value={draft.stem}
              onChange={(event) => onChange({ ...draft, stem: event.target.value })}
              className="text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="q-answer" className="text-xs">
              答案与解析
            </Label>
            <Textarea
              id="q-answer"
              rows={3}
              value={draft.answer}
              onChange={(event) => onChange({ ...draft, answer: event.target.value })}
              className="text-sm"
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div className="min-w-0">
              <p className="text-sm">共享到平台</p>
              <p className="text-[11px] text-muted-foreground">
                勾选后进入待上传队列，需要再点一次「上传」才会真正提交
              </p>
            </div>
            <Checkbox
              checked={draft.shared}
              onCheckedChange={(value) =>
                onChange({
                  ...draft,
                  shared: Boolean(value),
                  status: value ? (draft.status === 'shared-done' ? 'shared-done' : 'shared-pending') : 'local',
                })
              }
            />
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={onSave}>
              <Check className="mr-1.5 h-3.5 w-3.5" />
              保存到我的库
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              取消
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function Component() {
  const [connectionKind, setConnectionKind] = useState<BankConnectionKind>('docker')
  const [config, setConfig] = useState<Record<string, string>>({})
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [schemaReady, setSchemaReady] = useState(false)

  const [questions, setQuestions] = useState<LocalQuestion[]>(LOCAL_QUESTIONS)
  const [draft, setDraft] = useState<LocalQuestion | null>(null)
  const [draftIsNew, setDraftIsNew] = useState(false)

  const connection = BANK_CONNECTIONS.find((item) => item.kind === connectionKind) ?? BANK_CONNECTIONS[0]
  const Icon = CONNECTION_ICONS[connectionKind]

  const pending = questions.filter((question) => question.status === 'shared-pending')
  const uploaded = questions.filter((question) => question.status === 'shared-done')

  function testConnection() {
    const missing = connection.fields.filter((field) => !config[field.key]?.trim())
    if (missing.length > 0) {
      setTestResult({ ok: false, message: `还差 ${missing.map((field) => field.label).join('、')} 没填` })
      return
    }
    if (connectionKind === 'browser') {
      setTestResult({ ok: true, message: '浏览器本地存储可用，题目会写入 IndexedDB' })
      return
    }
    setTestResult({ ok: true, message: '连接成功（DEMO 模拟，未发起真实请求）· 已发现表 questions' })
  }

  function openNew() {
    setDraftIsNew(true)
    setDraft({
      id: '',
      topicId: DEMO_TOPICS[0].id,
      type: '单项选择',
      stem: '',
      answer: '',
      shared: false,
      status: 'local',
      updatedAt: '2026-09-11',
    })
  }

  function saveDraft() {
    if (!draft) return
    if (draftIsNew) {
      setQuestions((prev) => [{ ...draft, id: `lq-${prev.length + 1}` }, ...prev])
    } else {
      setQuestions((prev) => prev.map((item) => (item.id === draft.id ? draft : item)))
    }
    setDraft(null)
  }

  function toggleShared(id: string, value: boolean) {
    setQuestions((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, shared: value, status: value ? (item.status === 'shared-done' ? 'shared-done' : 'shared-pending') : 'local' }
          : item,
      ),
    )
  }

  function upload() {
    setQuestions((prev) =>
      prev.map((item) => (item.status === 'shared-pending' ? { ...item, status: 'shared-done' } : item)),
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
          <Database className="h-5 w-5 text-primary" />
          我的题库
          <DemoBadge />
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          把题目放在你自己的数据库里，平台只负责渲染和练习。你可以用 Docker 起一套 Supabase 开源版，也可以接自建库。
        </p>
      </div>

      <Card className="border-emerald-300/60 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/20">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            平台不存储「我的题库」中的内容
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-1">
          <p className="text-xs leading-relaxed text-foreground/85">
            你在本页看到、新增、修改的所有题目，都只写入
            <b className="font-semibold">你自己配置的数据库</b>（本地 Docker 起的 Supabase 开源版、你自建的库，或浏览器本地存储）。
            平台不接收、不保存、不备份这些内容，也不把它们计入排行榜与成绩统计。
          </p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {PLATFORM_LIMITS.map((item) => (
              <p key={item} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                <CircleSlash className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                {item}
              </p>
            ))}
          </div>
          <p className="flex items-start gap-1.5 rounded-lg bg-background/70 px-2.5 py-2 text-[11px] leading-relaxed text-foreground/80">
            <Upload className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
            唯一会把内容交给平台的方式是：你自己勾选某道题的「共享」，再点一次「上传到平台」。上传后平台库会保留来源标注，你也可以随时申请撤回。
          </p>
        </CardContent>
      </Card>

      <div className="space-y-2.5">
        <h2 className="text-sm font-semibold">1. 选择题目存放方式</h2>
        <div className="grid gap-3 lg:grid-cols-3">
          {BANK_CONNECTIONS.map((item) => {
            const ItemIcon = CONNECTION_ICONS[item.kind]
            const active = connectionKind === item.kind
            return (
              <button
                key={item.kind}
                type="button"
                onClick={() => {
                  setConnectionKind(item.kind)
                  setTestResult(null)
                }}
                className={cn(
                  'rounded-xl border p-3.5 text-left transition-colors',
                  active ? 'border-primary bg-primary/5' : 'hover:bg-accent',
                )}
              >
                <div className="flex items-center gap-2">
                  <ItemIcon className={cn('h-4 w-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
                  <span className="text-xs font-medium">{item.label}</span>
                  {item.recommended && (
                    <Badge variant="secondary" className="border-transparent bg-primary/10 text-[9px] font-normal text-primary">
                      推荐
                    </Badge>
                  )}
                  {!item.recommended && item.tagline !== '零配置' && (
                    <Badge variant="secondary" className="text-[9px] font-normal">
                      {item.tagline}
                    </Badge>
                  )}
                  {active && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />}
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{item.desc}</p>
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Icon className="h-4 w-4 text-primary" />
              2. 填写连接信息
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">
              凭据只保存在你本机浏览器里，不会随任何请求发送到平台。
            </p>
          </CardHeader>
          <CardContent className="space-y-3 pt-1">
            {connection.fields.length === 0 ? (
              <p className="rounded-lg bg-muted px-3 py-2 text-[11px] text-muted-foreground">
                该方式无需填写任何连接信息，题目直接写入浏览器 IndexedDB。
              </p>
            ) : (
              <div className="space-y-3">
                {connection.fields.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <Label htmlFor={`field-${field.key}`} className="text-xs">
                      {field.label}
                    </Label>
                    <Input
                      id={`field-${field.key}`}
                      type={field.secret ? 'password' : 'text'}
                      value={config[field.key] ?? ''}
                      onChange={(event) => {
                        setConfig((prev) => ({ ...prev, [field.key]: event.target.value }))
                        setTestResult(null)
                      }}
                      placeholder={field.placeholder}
                      className="h-9 font-mono text-xs"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={testConnection}>
                测试连接
              </Button>
              {connectionKind !== 'browser' && (
                <Button size="sm" variant="outline" onClick={() => setSchemaReady(true)}>
                  初始化表结构
                </Button>
              )}
            </div>

            {testResult && (
              <p
                className={cn(
                  'flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-[11px] leading-relaxed',
                  testResult.ok
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
                )}
              >
                {testResult.ok ? (
                  <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
                ) : (
                  <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                )}
                {testResult.message}
              </p>
            )}

            {schemaReady && (
              <div className="space-y-2">
                <p className="text-[11px] text-muted-foreground">
                  复制下面这段 SQL 到你的库里执行（平台不会代你执行）：
                </p>
                <CodeBlock title="my_question_bank · questions" code={BANK_SCHEMA_SQL} />
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {connectionKind === 'docker' && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Box className="h-4 w-4 text-primary" />
                  Docker 启动 Supabase 开源版
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-1">
                {DOCKER_STEPS.map((step) => (
                  <CodeBlock key={step.title} title={step.title} code={step.code} note={step.note} />
                ))}
              </CardContent>
            </Card>
          )}

          {connectionKind === 'remote' && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Globe className="h-4 w-4 text-primary" />
                  自建库适配说明
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-1 text-[11px] leading-relaxed text-muted-foreground">
                <p>· 直连数据库时，平台只用只读账号拉题；写入与删除通过你的服务端接口完成。</p>
                <p>· 如果你的库暴露 REST / GraphQL，请实现下面「预留接口」中的四个方法。</p>
                <p>· 跨域：浏览器直连需要你的服务端允许平台域名，或在你的服务端做一层代理。</p>
                <p className="rounded-lg bg-muted px-2.5 py-2">
                  DEMO 阶段仅校验表单是否填全，不会真正建立连接。
                </p>
              </CardContent>
            </Card>
          )}

          {connectionKind === 'browser' && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <HardDrive className="h-4 w-4 text-primary" />
                  浏览器本地存储
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-1 text-[11px] leading-relaxed text-muted-foreground">
                <p>· 题目写入 IndexedDB，平台服务器完全接触不到。</p>
                <p>· 清缓存、换浏览器、换设备都会丢数据，建议只用于试用。</p>
                <p>· 想长期保留，随时可以切到上面两种方式，再把题目导出 / 导入。</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">
            3. 我的题目
            <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
              {questions.length} 道 · 待上传 {pending.length} · 已上传 {uploaded.length}
            </span>
          </h2>
          <Button size="sm" variant="outline" className="ml-auto h-7" onClick={openNew}>
            <Plus className="mr-1 h-3 w-3" />
            新增题目
          </Button>
        </div>

        <div className="space-y-2">
          {questions.map((question) => {
            const topic = getDemoTopic(question.topicId)
            const meta = STATUS_META[question.status]
            return (
              <Card key={question.id}>
                <CardContent className="flex flex-wrap items-start gap-3 p-3.5">
                  <Checkbox
                    checked={question.shared}
                    onCheckedChange={(value) => toggleShared(question.id, Boolean(value))}
                    className="mt-0.5"
                  />
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded text-[10px] font-bold',
                      topicAccent(topicIndexOf(question.topicId)),
                    )}
                  >
                    {topic.short}
                  </span>

                  <div className="min-w-[220px] flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {question.type}
                      </Badge>
                      <Badge variant="secondary" className={cn('border-transparent text-[10px] font-normal', meta.className)}>
                        {meta.label}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">更新于 {question.updatedAt}</span>
                    </div>
                    <p className="line-clamp-2 text-xs leading-relaxed">{question.stem}</p>
                    <p className="line-clamp-1 text-[11px] text-muted-foreground">答案：{question.answer}</p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7"
                      onClick={() => {
                        setDraftIsNew(false)
                        setDraft({ ...question })
                      }}
                    >
                      <Pencil className="mr-1 h-3 w-3" />
                      编辑
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-rose-600 hover:text-rose-600 dark:text-rose-400"
                      onClick={() => setQuestions((prev) => prev.filter((item) => item.id !== question.id))}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <p className="flex items-start gap-1.5 px-1 text-[11px] leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          勾选左侧复选框只是标记「愿意共享」，不会立即上传；需要下面第 4 步再点一次确认。
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Upload className="h-4 w-4 text-primary" />
            4. 共享与上传
            <span className="text-[11px] font-normal text-muted-foreground">
              待上传 {pending.length} 道
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-1">
          {pending.length === 0 ? (
            <p className="rounded-lg bg-muted px-3 py-2 text-[11px] text-muted-foreground">
              待上传队列为空。在上方勾选想共享的题目后会出现在这里。
            </p>
          ) : (
            <div className="space-y-2">
              {pending.map((question) => (
                <div key={question.id} className="flex items-center gap-2 rounded-lg border p-2.5">
                  <Upload className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span className="min-w-0 flex-1 truncate text-[11px]">{question.stem}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 shrink-0 px-2 text-[10px]"
                    onClick={() => toggleShared(question.id, false)}
                  >
                    移出队列
                  </Button>
                </div>
              ))}
            </div>
          )}

          <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
            点击上传后，这些题目的题干、答案与解析会被提交到平台数据库并进入平台审核队列。平台会标注「来自用户自建题库」，你也可以随时申请撤回。
          </p>

          <Button size="sm" disabled={pending.length === 0} onClick={upload}>
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            上传到平台（{pending.length}）
          </Button>

          {uploaded.length > 0 && (
            <p className="flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              已上传 {uploaded.length} 道，平台侧已保留来源标注。
            </p>
          )}

          <Separator />

          <CodeBlock title="平台接收接口（仅接收用户主动共享的题目）" code={SHARE_ENDPOINT} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <FileCode className="h-4 w-4 text-muted-foreground" />
            预留接口：接入任意数据库
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">
            平台只依赖这四个方法。你的库是 Postgres、MySQL 还是自建 REST 服务都可以，实现其中之一即可。
          </p>
        </CardHeader>
        <CardContent className="pt-1">
          <CodeBlock title="QuestionBankAdapter.d.ts" code={ADAPTER_INTERFACE} />
        </CardContent>
      </Card>

      <p className="flex items-start gap-1.5 px-1 text-[11px] leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        本页为 DEMO 演示：连接测试、表结构初始化、上传流程均为本地模拟，不会连接你的数据库，也不会向平台提交任何内容。
      </p>

      {draft && (
        <QuestionEditor
          draft={draft}
          isNew={draftIsNew}
          onChange={setDraft}
          onClose={() => setDraft(null)}
          onSave={saveDraft}
        />
      )}
    </div>
  )
}
