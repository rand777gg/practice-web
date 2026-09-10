import { useState } from 'react'
import {
  BookOpen, Bot, Box, Check, CheckCircle2, ChevronDown, ChevronUp, Copy, ExternalLink, Globe,
  Key, Layers, Link as LinkIcon, Loader2, RotateCcw, Search, ShieldCheck, Sparkles,
  TriangleAlert, Users, Wifi, XCircle, Zap,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DemoBadge } from '@/components/topics/TopicSidebar'
import {
  ERROR_KIND_META, PROVIDER_ERROR_DOCS, describeError, lookupErrorCode, providerErrorDoc,
} from '@/lib/ai-error-codes'
import {
  CC_SWITCH, PROVIDER_ENDPOINTS, RELAY_PRESETS, parseRelayConfig,
  type AiProviderDraft, type ImportResult,
} from '@/lib/ai-endpoints'
import { useAiStore } from '@/stores/ai-store'
import { useAuthStore } from '@/stores/auth-store'
import type { AiProviderConfig } from '@/types'
import { cn } from '@/lib/utils'

const PROTOCOL_META = {
  openai: { label: 'OpenAI 格式', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', hint: 'POST {baseUrl}/chat/completions · Authorization: Bearer' },
  anthropic: { label: 'Anthropic 格式', className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300', hint: 'POST {baseUrl}/v1/messages · x-api-key + anthropic-version' },
} as const

/** 模拟管理员配置的平台默认值（DEMO，正式版来自数据库） */
const PLATFORM_DEFAULT = {
  enabledProviders: ['deepseek'],
  defaultModel: 'deepseek-chat',
  monthlyQuota: '50,000 次调用',
  usedQuota: '12,480',
}

interface TestResult {
  ok: boolean
  status?: number
  code?: string
  message: string
  docsUrl?: string
}

async function testProvider(provider: AiProviderConfig, apiKey: string): Promise<TestResult> {
  const model = provider.models.find((item) => item.enabled)?.id ?? provider.models[0]?.id ?? ''
  const doc = providerErrorDoc(provider.id)
  try {
    const isAnthropic = provider.protocol === 'anthropic'
    const url = isAnthropic
      ? `${provider.baseUrl.replace(/\/$/, '')}/v1/messages`
      : `${provider.baseUrl.replace(/\/$/, '')}/chat/completions`
    const res = await fetch(url, {
      method: 'POST',
      headers: isAnthropic
        ? {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            // 浏览器直连 Anthropic 官方接口需要显式开启
            'anthropic-dangerous-direct-browser-access': 'true',
          }
        : {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
            ...(provider.id === 'openrouter' ? { 'x-title': 'practice-web' } : {}),
          },
      body: JSON.stringify(
        isAnthropic
          ? { model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }
          : { model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] },
      ),
    })

    if (res.ok) {
      return { ok: true, status: res.status, message: '连接成功，模型可用' }
    }

    const body = await res.json().catch(() => null)
    // 各家错误体字段不同：OpenAI/DashScope 用 error.code 或 code，Anthropic 用 error.type
    const code =
      body?.error?.code ?? body?.error?.type ?? body?.code ?? body?.type ?? undefined
    return {
      ok: false,
      status: res.status,
      code: typeof code === 'string' ? code : undefined,
      message: describeError(provider.id, res.status, typeof code === 'string' ? code : undefined),
      docsUrl: doc?.docsUrl,
    }
  } catch (error) {
    return {
      ok: false,
      message: `请求未发出：${error instanceof Error ? error.message : '未知错误'}。浏览器直连可能被 CORS 拦截，正式环境请走服务端代理。`,
    }
  }
}

function ProviderCard({
  provider,
  onToggle,
  onToggleModel,
  onApiKeyChange,
  onBaseUrlChange,
}: {
  provider: AiProviderConfig
  onToggle: () => void
  onToggleModel: (modelId: string) => void
  onApiKeyChange: (value: string) => void
  onBaseUrlChange: (value: string) => void
}) {
  const envKey = (import.meta.env as Record<string, string>)[`VITE_${provider.id.toUpperCase()}_API_KEY`]
  const effectiveKey = provider.apiKey || envKey || ''
  const doc = providerErrorDoc(provider.id)
  const protocol = PROTOCOL_META[provider.protocol ?? 'openai']

  const [expanded, setExpanded] = useState(false)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)

  const enabledModelCount = provider.models.filter((model) => model.enabled).length

  async function runTest() {
    setTesting(true)
    setResult(null)
    const outcome = await testProvider(provider, effectiveKey)
    setResult(outcome)
    setTesting(false)
  }

  return (
    <Card className={cn(provider.enabled ? 'border-primary/40' : 'opacity-90')}>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="flex items-center gap-1.5 text-left"
          >
            {provider.name}
            {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
          <Badge variant="secondary" className={cn('border-transparent text-[9px] font-normal', protocol.className)}>
            {protocol.label}
          </Badge>
          <Badge variant="secondary" className="text-[9px] font-normal">
            {provider.type === 'official' ? '官方' : '社区'}
          </Badge>
          {effectiveKey && (
            <Badge variant="secondary" className="border-transparent bg-emerald-100 text-[9px] font-normal text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              已配置 Key
            </Badge>
          )}
          <span className="ml-auto flex items-center gap-2">
            <span className="text-[10px] font-normal text-muted-foreground">
              {enabledModelCount}/{provider.models.length} 模型
            </span>
            <Switch checked={provider.enabled} onCheckedChange={onToggle} />
          </span>
        </CardTitle>
        <p className="text-[11px] leading-relaxed text-muted-foreground">{provider.description}</p>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-3.5 pt-1">
          <p className="rounded-lg bg-muted px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground">
            {protocol.hint}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1 text-xs">
                <Key className="h-3 w-3" />
                API Key
              </Label>
              <Input
                type="password"
                value={provider.apiKey}
                onChange={(event) => onApiKeyChange(event.target.value)}
                placeholder={envKey ? '已从环境变量读取，可覆盖' : '粘贴你的 API Key'}
                className="h-9 font-mono text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                只保存在本机浏览器，不会上传到平台服务器。
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1 text-xs">
                <LinkIcon className="h-3 w-3" />
                Base URL
              </Label>
              <div className="flex gap-2">
                <Input
                  value={provider.baseUrl}
                  onChange={(event) => onBaseUrlChange(event.target.value)}
                  className="h-9 font-mono text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 shrink-0 px-2"
                  title="恢复为该协议的标准地址"
                  onClick={() => onBaseUrlChange(provider.id === 'anthropic' ? 'https://api.anthropic.com' : provider.baseUrl)}
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs">启用模型</p>
            <div className="flex flex-wrap gap-1.5">
              {provider.models.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => onToggleModel(model.id)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                    model.enabled
                      ? 'border-primary bg-primary/10 font-medium text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  {model.name}
                </button>
              ))}
            </div>
          </div>

          <Separator />

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={!effectiveKey || testing} onClick={runTest}>
              {testing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Wifi className="mr-1.5 h-3.5 w-3.5" />}
              测试连接
            </Button>
            {doc && (
              <a
                href={doc.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                <BookOpen className="h-3 w-3" />
                {provider.name} 官方错误码文档
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
          </div>

          {result && (
            <div
              className={cn(
                'space-y-1.5 rounded-lg border p-2.5',
                result.ok
                  ? 'border-emerald-300/60 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30'
                  : 'border-rose-300/60 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/30',
              )}
            >
              <p className={cn('flex items-start gap-1.5 text-[11px] leading-relaxed', result.ok ? 'text-emerald-800 dark:text-emerald-300' : 'text-rose-800 dark:text-rose-300')}>
                {result.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                <span>{result.message}</span>
              </p>
              {!result.ok && result.status && (
                <p className="pl-5 text-[10px] text-muted-foreground">
                  原始返回：HTTP {result.status}
                  {result.code && <> · code: <code className="font-mono">{result.code}</code></>}
                </p>
              )}
              {!result.ok && result.docsUrl && (
                <a
                  href={result.docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-5 inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                >
                  去官方文档核对 <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}

function ErrorCodeReference() {
  const [providerId, setProviderId] = useState(PROVIDER_ERROR_DOCS[0].id)
  const [query, setQuery] = useState('')
  const doc = providerErrorDoc(providerId)!
  const lookup = query.trim() ? Number(query.trim()) : null
  const match = lookup && Number.isFinite(lookup) ? lookupErrorCode(providerId, lookup) : null

  const [copied, setCopied] = useState(false)
  async function copyShape() {
    try {
      await navigator.clipboard.writeText(doc.errorShape)
    } catch {
      // 剪贴板不可用时仍然给出反馈
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
            <BookOpen className="h-4 w-4 text-primary" />
            各家官方错误码对照
            <span className="text-[11px] font-normal text-muted-foreground">
              按厂商查，不要只看状态码
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-1">
          <div className="flex flex-wrap gap-1.5">
            {PROVIDER_ERROR_DOCS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setProviderId(item.id)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                  providerId === item.id
                    ? 'border-primary bg-primary/10 font-medium text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {item.name}
              </button>
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border p-2.5">
              <p className="text-[10px] text-muted-foreground">接口协议</p>
              <Badge variant="secondary" className={cn('mt-1 border-transparent text-[10px] font-normal', PROTOCOL_META[doc.protocol].className)}>
                {PROTOCOL_META[doc.protocol].label}
              </Badge>
            </div>
            <div className="rounded-lg border p-2.5">
              <p className="text-[10px] text-muted-foreground">默认 Base URL</p>
              <p className="mt-1 break-all font-mono text-[10px]">{doc.baseUrl}</p>
            </div>
            <div className="rounded-lg border p-2.5">
              <p className="text-[10px] text-muted-foreground">限流重试依据</p>
              <p className="mt-1 text-[10px]">{doc.retryHeader ?? '—'}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted px-2.5 py-2">
            <span className="text-[10px] text-muted-foreground">错误响应体</span>
            <code className="min-w-0 flex-1 break-all font-mono text-[10px]">{doc.errorShape}</code>
            <button
              type="button"
              onClick={copyShape}
              className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? '已复制' : '复制'}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={doc.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              {doc.name} 官方错误码文档
            </a>
            <span className="text-[10px] text-muted-foreground">（核对时间 2026-09）</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
            <Search className="h-4 w-4 text-primary" />
            快速查码
            <span className="text-[11px] font-normal text-muted-foreground">
              输入状态码，立刻看到 {doc.name} 的官方解释
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-1">
          <div className="flex flex-wrap gap-1.5">
            {doc.codes.map((entry) => (
              <button
                key={`${entry.status}-${entry.code ?? entry.officialName}`}
                type="button"
                onClick={() => setQuery(String(entry.status))}
                className={cn(
                  'rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors',
                  query === String(entry.status)
                    ? 'border-primary bg-primary/10 font-medium text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {entry.status}
              </button>
            ))}
          </div>

          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value.replace(/\D/g, '').slice(0, 3))}
            placeholder="输入 HTTP 状态码，例如 402"
            className="h-9 w-48 font-mono text-sm"
          />

          {query.trim() && !match && (
            <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              {doc.name} 的官方文档里没有 {query.trim()} 这个状态码，请以文档为准：
              <a href={doc.docsUrl} target="_blank" rel="noreferrer" className="ml-1 underline">
                打开文档
              </a>
            </p>
          )}

          {match && (
            <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-mono text-[11px]">
                  HTTP {match.status}
                </Badge>
                <span className="text-sm font-medium">{match.officialName}</span>
                <Badge variant="secondary" className={cn('border-transparent text-[9px] font-normal', ERROR_KIND_META[match.kind].className)}>
                  {ERROR_KIND_META[match.kind].label}
                </Badge>
                <Badge
                  variant="secondary"
                  className={cn(
                    'border-transparent text-[9px] font-normal',
                    match.retryable
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
                  )}
                >
                  {match.retryable ? '可重试' : '重试无效'}
                </Badge>
              </div>
              {match.code && (
                <p className="font-mono text-[10px] text-muted-foreground">code: {match.code}</p>
              )}
              <p className="text-xs leading-relaxed">{match.meaning}</p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">处理：{match.fix}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            {doc.name} 完整错误码表
            <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
              {doc.codes.length} 条
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-1">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">状态码</TableHead>
                  <TableHead className="min-w-[160px]">官方名称</TableHead>
                  <TableHead className="min-w-[200px]">含义</TableHead>
                  <TableHead className="min-w-[220px]">处理办法</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>重试</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {doc.codes.map((entry) => (
                  <TableRow key={`${entry.status}-${entry.code ?? entry.officialName}`}>
                    <TableCell className="font-mono text-xs tabular-nums">{entry.status}</TableCell>
                    <TableCell>
                      <p className="text-xs font-medium">{entry.officialName}</p>
                      {entry.code && <p className="font-mono text-[10px] text-muted-foreground">{entry.code}</p>}
                    </TableCell>
                    <TableCell className="text-xs leading-relaxed">{entry.meaning}</TableCell>
                    <TableCell className="text-xs leading-relaxed text-muted-foreground">{entry.fix}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={cn('border-transparent text-[9px] font-normal', ERROR_KIND_META[entry.kind].className)}>
                        {ERROR_KIND_META[entry.kind].label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className={cn('text-[10px]', entry.retryable ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                        {entry.retryable ? '可重试' : '无效'}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <TriangleAlert className="h-4 w-4 text-amber-500" />
            最容易搞混的：402
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-1 text-[11px] leading-relaxed">
          <p className="text-muted-foreground">
            同一个 402，三家含义完全不同。平台提示必须绑定「当前用的是哪家」，否则会把「充值就能解决」误导成「检查支付方式」。
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-amber-300/50 bg-amber-50 p-2.5 dark:border-amber-900/50 dark:bg-amber-950/30">
              <p className="text-xs font-medium">DeepSeek 402</p>
              <p className="mt-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300">Insufficient Balance</p>
              <p className="mt-1 text-[11px] text-muted-foreground">账号余额不足 → 去充值</p>
            </div>
            <div className="rounded-lg border p-2.5">
              <p className="text-xs font-medium">Anthropic 402</p>
              <p className="mt-0.5 text-[11px] font-medium">billing_error</p>
              <p className="mt-1 text-[11px] text-muted-foreground">账单 / 支付信息有问题 → 检查支付方式，不是充值</p>
            </div>
            <div className="rounded-lg border p-2.5">
              <p className="text-xs font-medium">OpenRouter 402</p>
              <p className="mt-0.5 text-[11px] font-medium">Insufficient credits</p>
              <p className="mt-1 text-[11px] text-muted-foreground">余额为负，连免费模型也会 402 → 充值使余额转正</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function LayerTab({ isAdmin }: { isAdmin: boolean }) {
  const preferOwnKey = useAiStore((s) => s.preferOwnKey)
  const setPreferOwnKey = useAiStore((s) => s.setPreferOwnKey)

  const [allowUserKeys, setAllowUserKeys] = useState(true)
  const [sharePool, setSharePool] = useState(false)
  const [restrictModels, setRestrictModels] = useState(false)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Layers className="h-4 w-4 text-primary" />
            配置是两层结构
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                平台默认配置
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                由管理员维护，全站共用。没有自带 Key 的用户直接走这一层，走平台额度。
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                <Badge variant="secondary" className="text-[9px] font-normal">
                  默认供应商 {PLATFORM_DEFAULT.enabledProviders.join('、')}
                </Badge>
                <Badge variant="secondary" className="text-[9px] font-normal">
                  {PLATFORM_DEFAULT.defaultModel}
                </Badge>
                <Badge variant="secondary" className="text-[9px] font-normal">
                  本月 {PLATFORM_DEFAULT.usedQuota} / {PLATFORM_DEFAULT.monthlyQuota}
                </Badge>
              </div>
            </div>
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
                <Key className="h-3.5 w-3.5" />
                我自己的配置
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                你填的 API Key 只存在本机浏览器，不随任何请求上传到平台服务器，也不占用平台额度。
              </p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-[11px]">优先使用我自己的 Key</span>
                <Switch checked={preferOwnKey} onCheckedChange={setPreferOwnKey} />
              </div>
            </div>
          </div>

          <p className="rounded-lg bg-muted px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
            取用顺序：<b className="font-medium text-foreground">我启用的供应商</b>（且已填 Key）
            → <b className="font-medium text-foreground">平台默认供应商</b>
            → 都不可用时报错并提示去「供应商」页配置。
            上面那个开关关掉后，即使你填了 Key 也只用平台配置。
          </p>
        </CardContent>
      </Card>

      {isAdmin ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldCheck className="h-4 w-4 text-primary" />
              管理员开关
              <DemoBadge />
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">这些开关决定普通用户能做什么，DEMO 阶段仅在本地生效。</p>
          </CardHeader>
          <CardContent className="space-y-3 pt-1">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm">允许用户自带 API Key</p>
                <p className="text-[11px] text-muted-foreground">关闭后所有人的 AI 请求只走平台配置，额度由平台承担</p>
              </div>
              <Switch checked={allowUserKeys} onCheckedChange={setAllowUserKeys} />
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm">允许用户把配置共享进池子</p>
                <p className="text-[11px] text-muted-foreground">用户自愿共享的 Key 进入轮询池，缓解平台额度压力；共享者获得额度返还</p>
              </div>
              <Switch checked={sharePool} onCheckedChange={setSharePool} />
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm">限制用户可选的模型范围</p>
                <p className="text-[11px] text-muted-foreground">只允许白名单内的模型，防止误用高成本模型</p>
              </div>
              <Switch checked={restrictModels} onCheckedChange={setRestrictModels} />
            </div>
            {restrictModels && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {['deepseek-chat', 'deepseek-reasoner', 'gpt-4o-mini', 'claude-haiku-4-5', 'qwen-vl-plus'].map((model) => (
                  <Badge key={model} variant="outline" className="font-mono text-[10px] font-normal">
                    {model}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex items-start gap-2 p-4 text-[11px] leading-relaxed text-muted-foreground">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            <span>
              是否允许自带 Key、能否共享进池子这类开关由管理员在后台设置。如果「供应商」页的输入框不可用，说明管理员关闭了自带 Key。
            </span>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function CodeLine({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      // 剪贴板不可用时仍然给出反馈
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex items-center gap-2 border-b bg-muted/40 px-2.5 py-1.5">
        <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">{label ?? '示例'}</span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre className="overflow-x-auto p-2.5 text-[10px] leading-relaxed">{code}</pre>
    </div>
  )
}

function RelayTab() {
  const providers = useAiStore((s) => s.providers)
  const save = useAiStore((s) => s.save)
  const [raw, setRaw] = useState('')
  const [parsed, setParsed] = useState<ImportResult | null>(null)

  function addProvider(draft: AiProviderDraft) {
    if (providers.some((item) => item.id === draft.id)) return
    const protocol =
      draft.protocol === 'anthropic' ? 'anthropic' : draft.protocol === 'openai' ? 'openai' : 'openai'
    const provider: AiProviderConfig = {
      id: draft.id,
      name: draft.name,
      description: `由中转 / ${CC_SWITCH.name} 导入，${protocol === 'anthropic' ? 'Anthropic' : 'OpenAI'} 兼容格式`,
      type: 'community',
      protocol,
      enabled: false,
      apiKey: draft.apiKey,
      baseUrl: draft.baseUrl,
      models:
        draft.models.length > 0
          ? draft.models.map((id, index) => ({ id, name: id, enabled: index === 0 }))
          : [{ id: 'default', name: '默认模型（请在启用前补全）', enabled: true }],
    }
    save([...providers, provider])
  }

  function importAll() {
    if (!parsed) return
    const next = [...providers]
    for (const draft of parsed.drafts) {
      if (next.some((item) => item.id === draft.id)) continue
      next.push({
        id: draft.id,
        name: draft.name,
        description: `由 ${CC_SWITCH.name} 导入`,
        type: 'community',
        protocol: draft.protocol === 'anthropic' ? 'anthropic' : 'openai',
        enabled: false,
        apiKey: draft.apiKey,
        baseUrl: draft.baseUrl,
        models:
          draft.models.length > 0
            ? draft.models.map((id, index) => ({ id, name: id, enabled: index === 0 }))
            : [{ id: 'default', name: '默认模型（请在启用前补全）', enabled: true }],
      })
    }
    save(next)
    setParsed(null)
    setRaw('')
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
            <Box className="h-4 w-4 text-primary" />
            接入 {CC_SWITCH.name} 中转
            <a
              href={CC_SWITCH.repoUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] font-normal text-primary hover:underline"
            >
              <ExternalLink className="mr-0.5 inline h-3 w-3" />
              GitHub
            </a>
          </CardTitle>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            cc-switch 会在本机起一个代理（默认 {CC_SWITCH.proxyUrl}），自动做
            Anthropic ↔ OpenAI 格式转换，并带故障转移与请求日志。把下面任一方式配好，本站就能复用你在
            cc-switch 里已经维护好的供应商列表。
          </p>
        </CardHeader>
        <CardContent className="space-y-3 pt-1">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border p-2.5">
              <p className="text-[11px] font-medium">方式一：直接填本地代理地址</p>
              <p className="mt-1 font-mono text-[10px] text-muted-foreground">{CC_SWITCH.proxyUrl}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Key 填 <code className="font-mono">PROXY_MANAGED</code>，协议选 Anthropic 格式。
              </p>
            </div>
            <div className="rounded-lg border p-2.5">
              <p className="text-[11px] font-medium">方式二：导入已导出的配置</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                粘贴 cc-switch 导出的 JSON，自动识别供应商名、地址与模型。
              </p>
            </div>
          </div>

          <CodeLine label="cc-switch 启用代理后写入 ~/.claude/settings.json 的内容" code={CC_SWITCH.envSample} />

          <div className="space-y-2">
            <Label htmlFor="relay-config" className="text-xs">
              粘贴配置 JSON
            </Label>
            <textarea
              id="relay-config"
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              rows={4}
              placeholder='[{"name":"我的中转","baseUrl":"https://api.example.com/v1","apiKey":"sk-...","models":["gpt-4o-mini"]}]'
              className="w-full rounded-md border bg-background px-2 py-1.5 font-mono text-[11px]"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" disabled={!raw.trim()} onClick={() => setParsed(parseRelayConfig(raw))}>
                <Search className="mr-1.5 h-3.5 w-3.5" />
                解析
              </Button>
              <span className="text-[10px] text-muted-foreground">
                宽容匹配常见字段（name / baseUrl / apiKey / models），认不出的条目会明确列出
              </span>
            </div>
          </div>

          {parsed && (
            <div className="space-y-2 rounded-lg border p-2.5">
              <p className="text-[11px]">
                识别到 {parsed.total} 条，可导入 {parsed.drafts.length} 条
                {parsed.errors.length > 0 && `，${parsed.errors.length} 条跳过`}
              </p>
              {parsed.errors.map((message) => (
                <p key={message} className="flex items-start gap-1.5 text-[10px] text-amber-700 dark:text-amber-400">
                  <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                  {message}
                </p>
              ))}
              {parsed.drafts.length > 0 && (
                <>
                  <div className="space-y-1">
                    {parsed.drafts.map((draft) => (
                      <div key={draft.id} className="flex flex-wrap items-center gap-2 rounded bg-muted px-2 py-1.5">
                        <span className="text-[11px] font-medium">{draft.name}</span>
                        <Badge variant="secondary" className={cn('border-transparent text-[9px] font-normal', PROTOCOL_META[draft.protocol].className)}>
                          {PROTOCOL_META[draft.protocol].label}
                        </Badge>
                        <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">{draft.baseUrl}</span>
                        {draft.models.length > 0 && (
                          <span className="shrink-0 text-[10px] text-muted-foreground">{draft.models.length} 个模型</span>
                        )}
                      </div>
                    ))}
                  </div>
                  <Button size="sm" onClick={importAll}>
                    <Check className="mr-1.5 h-3.5 w-3.5" />
                    导入为供应商
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
            <Globe className="h-4 w-4 text-primary" />
            常见中转 / 聚合站
            <span className="text-[11px] font-normal text-muted-foreground">
              地址可能随服务商调整，添加后请自行核对
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-1">
          {RELAY_PRESETS.map((preset) => {
            const added = providers.some((item) => item.baseUrl === preset.baseUrl)
            return (
              <div key={preset.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5">
                <div className="min-w-[160px] flex-1">
                  <p className="text-xs font-medium">{preset.name}</p>
                  <p className="break-all font-mono text-[10px] text-muted-foreground">{preset.baseUrl}</p>
                </div>
                <Badge variant="secondary" className={cn('border-transparent text-[9px] font-normal', PROTOCOL_META[preset.protocol].className)}>
                  {PROTOCOL_META[preset.protocol].label}
                </Badge>
                <span className="min-w-[180px] flex-1 text-[10px] text-muted-foreground">{preset.note}</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0"
                  disabled={added}
                  onClick={() => addProvider({ id: `relay-${preset.id}`, name: preset.name, baseUrl: preset.baseUrl, apiKey: '', protocol: preset.protocol, models: [] })}
                >
                  {added ? '已添加' : '添加'}
                </Button>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
            <BookOpen className="h-4 w-4 text-primary" />
            获取模型列表的接口
            <span className="text-[11px] font-normal text-muted-foreground">
              供应商展开后也能看到对应的 curl
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-1">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>厂商</TableHead>
                  <TableHead>获取模型列表</TableHead>
                  <TableHead>鉴权头</TableHead>
                  <TableHead className="min-w-[240px]">响应形状</TableHead>
                  <TableHead className="min-w-[200px]">注意</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {PROVIDER_ENDPOINTS.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-nowrap text-xs font-medium">{item.name}</TableCell>
                    <TableCell>
                      <p className="font-mono text-[11px]">{item.models.method} {item.models.path}</p>
                      <a
                        href={item.docsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline"
                      >
                        官方文档 <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    </TableCell>
                    <TableCell>
                      <p className="font-mono text-[10px]">{item.authHeader}</p>
                      {item.extraHeaders?.map((header) => (
                        <p key={header} className="font-mono text-[10px] text-muted-foreground">{header}</p>
                      ))}
                    </TableCell>
                    <TableCell className="break-all font-mono text-[10px] text-muted-foreground">{item.models.shape}</TableCell>
                    <TableCell className="text-[11px] leading-relaxed text-muted-foreground">{item.models.notes}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-[10px] text-muted-foreground">
            路径以各家官方文档为准（核对时间 2026-09）。中转站一般沿用 OpenAI 兼容的 <code className="font-mono">/v1/models</code>；
            浏览器直连可能被 CORS 拦截，正式环境建议由服务端代理拉取。
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export function Component() {
  const profile = useAuthStore((s) => s.profile)
  const isAdmin = profile?.role === 'admin'
  const { providers, toggleProvider, toggleModel, setApiKey, setBaseUrl } = useAiStore()

  const official = providers.filter((item) => item.type === 'official')
  const community = providers.filter((item) => item.type === 'community')
  const enabledCount = providers.filter((item) => item.enabled).length

  function renderGroup(title: string, GroupIcon: typeof Zap, list: AiProviderConfig[]) {
    return (
      <div className="space-y-2.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <GroupIcon className="h-4 w-4 text-primary" />
          {title}
          <span className="text-[11px] font-normal text-muted-foreground">
            {list.filter((item) => item.enabled).length}/{list.length} 已启用
          </span>
        </h2>
        <div className="space-y-3">
          {list.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              onToggle={() => toggleProvider(provider.id)}
              onToggleModel={(modelId) => toggleModel(provider.id, modelId)}
              onApiKeyChange={(value) => setApiKey(provider.id, value)}
              onBaseUrlChange={(value) => setBaseUrl(provider.id, value)}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
          <Bot className="h-5 w-5 text-primary" />
          AI 设置
          <DemoBadge />
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          普通用户和管理员都能在这里配置 AI：填自己的 API Key 就能直接用，不需要等平台开通。
          支持 OpenAI 与 Anthropic 两种主流协议，报错会按厂商官方文档给出解释。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-muted-foreground">
          <Sparkles className="h-3 w-3 text-primary" />
          已启用 {enabledCount} / {providers.length} 个供应商
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-muted-foreground">
          <Globe className="h-3 w-3 text-primary" />
          OpenAI 格式 / Anthropic 格式
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-muted-foreground">
          <Key className="h-3 w-3 text-primary" />
          Key 只存本机
        </span>
      </div>

      <Tabs defaultValue="providers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="providers">
            <Zap className="mr-1.5 h-3.5 w-3.5" />
            供应商
          </TabsTrigger>
          <TabsTrigger value="errors">
            <BookOpen className="mr-1.5 h-3.5 w-3.5" />
            错误码对照
          </TabsTrigger>
          <TabsTrigger value="relay">
            <Globe className="mr-1.5 h-3.5 w-3.5" />
            中转与接口
          </TabsTrigger>
          <TabsTrigger value="layers">
            <Layers className="mr-1.5 h-3.5 w-3.5" />
            配置层级{isAdmin ? '与权限' : ''}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="providers" className="space-y-5">
          {renderGroup('官方供应商', Zap, official)}
          {renderGroup('社区 / 聚合', Globe, community)}
          <p className="flex items-start gap-1.5 px-1 text-[11px] leading-relaxed text-muted-foreground">
            <XCircle className="mt-0.5 h-3 w-3 shrink-0" />
            DEMO：测试连接会真实发起一次请求，可能因浏览器 CORS 或额度不足失败——这正好可以用来验证右侧的错误码解释是否准确。
            其余配置只写入本机 localStorage。
          </p>
        </TabsContent>

        <TabsContent value="errors">
          <ErrorCodeReference />
        </TabsContent>

        <TabsContent value="relay">
          <RelayTab />
        </TabsContent>

        <TabsContent value="layers">
          <LayerTab isAdmin={isAdmin} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
