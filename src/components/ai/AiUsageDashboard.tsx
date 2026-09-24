import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity, ArrowDownRight, ArrowUpRight, ChevronDown, ChevronRight, CircleAlert, Clock3,
  Database, Gauge, Key, Loader2, MessagesSquare, RefreshCw, Server, TrendingUp, Wallet, Wifi, Zap,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { AiUsageShare } from '@/components/charts/AiUsageShare'
import { AiUsageTrend } from '@/components/charts/AiUsageTrend'
import {
  aiSourceLabel, deltaRatio, formatCost, formatCount, formatLatency, formatLogTime, formatTokens,
  loadAiPrices, loadAiUsage, loadAiUsageLogs,
  type AiModelPrice, type AiUsageLog, type AiUsageOverview,
} from '@/lib/ai-usage'
import { getAiConfig } from '@/lib/ai/config'
import { useAiStore } from '@/stores/ai-store'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'

export type AiTabKey = 'providers' | 'errors' | 'relay' | 'layers'

interface Props {
  /** 快捷操作与模型行的「配置」要跳到下面那几个页签 */
  onOpenTab: (tab: AiTabKey) => void
}

const RANGES = [
  { days: 7, label: '近 7 天' },
  { days: 30, label: '近 30 天' },
  { days: 90, label: '近 90 天' },
]

/**
 * 模型能力与提供商。
 *
 * 为什么写死在这儿: 这份清单本身就是本项目的静态目录(见 stores/ai-store 的 DEFAULT_PROVIDERS),
 * 模型名和厂商不会自己变。真接了动态模型清单时, 这张表跟着目录一起换掉即可。
 */
const MODEL_META: Record<string, { vendor: string; caps: string }> = {
  'deepseek-chat': { vendor: 'DeepSeek', caps: '文本' },
  'deepseek-reasoner': { vendor: 'DeepSeek', caps: '文本 · 推理' },
  'gpt-4o': { vendor: 'OpenAI', caps: '文本 / 图像' },
  'gpt-4o-mini': { vendor: 'OpenAI', caps: '文本 / 图像' },
  'o3-mini': { vendor: 'OpenAI', caps: '文本 · 推理' },
  'gpt-4-turbo': { vendor: 'OpenAI', caps: '文本 / 图像' },
  'claude-sonnet-5': { vendor: 'Anthropic', caps: '文本 / 图像' },
  'claude-opus-5': { vendor: 'Anthropic', caps: '文本 / 图像' },
  'claude-haiku-4-5': { vendor: 'Anthropic', caps: '文本 / 图像' },
  'qwen-vl-plus': { vendor: '阿里云', caps: '文本 / 图像' },
  'qwen3.7-plus': { vendor: '阿里云', caps: '文本 / 图像' },
}

function deltaBadge(current: number, previous: number) {
  const ratio = deltaRatio(current, previous)
  if (ratio === null) {
    return current > 0
      ? <span className="text-muted-foreground">上一周期无数据</span>
      : <span className="text-muted-foreground">—</span>
  }
  const up = ratio >= 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cn('inline-flex items-center gap-0.5', up ? 'text-emerald-600 dark:text-emerald-400' : 'text-sky-600 dark:text-sky-400')}>
      <Icon className="h-3 w-3" />
      {Math.abs(ratio * 100).toFixed(0)}% 较前一周期
    </span>
  )
}

export function AiUsageDashboard({ onOpenTab }: Props) {
  const profile = useAuthStore((s) => s.profile)
  const isAdmin = profile?.role === 'admin'
  const providers = useAiStore((s) => s.providers)
  const toggleModel = useAiStore((s) => s.toggleModel)

  const [days, setDays] = useState(7)
  const [overview, setOverview] = useState<AiUsageOverview | null>(null)
  const [prices, setPrices] = useState<AiModelPrice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modelFilter, setModelFilter] = useState<'all' | 'on' | 'off'>('all')
  const [logsExpanded, setLogsExpanded] = useState(false)
  const [extraLogs, setExtraLogs] = useState<AiUsageLog[] | null>(null)
  const [probe, setProbe] = useState<{ state: 'idle' | 'running' | 'ok' | 'fail'; text?: string }>({ state: 'idle' })
  const [nonce, setNonce] = useState(0)

  // 初次加载与换周期都走这里; 用 alive 标记是因为连点两个周期会并发两次请求
  useEffect(() => {
    let alive = true
    loadAiUsage(days)
      .then((data) => { if (alive) { setOverview(data); setError(null) } })
      .catch((err: unknown) => { if (alive) setError(err instanceof Error ? err.message : String(err)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [days, nonce])

  useEffect(() => {
    loadAiPrices().then(setPrices).catch(() => setPrices([]))
  }, [])

  useEffect(() => {
    if (!logsExpanded) return
    loadAiUsageLogs(50).then(setExtraLogs).catch(() => setExtraLogs(null))
  }, [logsExpanded, nonce])

  const refresh = () => {
    setLoading(true)
    setNonce((n) => n + 1)
  }

  const catalog = useMemo(() => providers.flatMap((p) => p.models.map((m) => ({
    providerId: p.id,
    provider: p.name,
    id: m.id,
    name: m.name,
    enabled: p.enabled && m.enabled,
  }))), [providers])

  const usageByModel = useMemo(
    () => new Map((overview?.models ?? []).map((m) => [m.model, m])),
    [overview],
  )

  const visibleModels = catalog.filter((m) => {
    if (modelFilter === 'on') return m.enabled
    if (modelFilter === 'off') return !m.enabled
    return true
  })

  const keyedProviders = providers.filter((p) => p.apiKey.trim().length > 0)
  const enabledModels = catalog.filter((m) => m.enabled)
  const totals = overview?.totals
  const logs = logsExpanded ? (extraLogs ?? overview?.recent ?? []) : (overview?.recent ?? []).slice(0, 6)

  const runProbe = async () => {
    setProbe({ state: 'running' })
    const started = Date.now()
    try {
      const [{ createDeepSeek }, { generateText }] = await Promise.all([
        import('@ai-sdk/deepseek'),
        import('ai'),
      ])
      const config = getAiConfig('probe')
      const client = createDeepSeek({ apiKey: config.apiKey, baseURL: config.baseURL, fetch: config.fetch })
      await generateText({
        model: client(config.model || 'deepseek-chat'),
        prompt: 'ping',
        maxOutputTokens: 1,
      })
      setProbe({ state: 'ok', text: `${Date.now() - started}ms 往返` })
      refresh()
    } catch (err) {
      setProbe({ state: 'fail', text: err instanceof Error ? err.message : '未知错误' })
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Activity className="h-3.5 w-3.5" />近 {days} 天调用次数
            </div>
            <p className="mt-1.5 text-2xl font-semibold tabular-nums">
              {totals ? formatCount(totals.calls) : '—'}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
              {overview && deltaBadge(totals?.calls ?? 0, overview.prev.calls)}
              {(totals?.failed ?? 0) > 0 && (
                <span className="text-destructive">失败 {totals?.failed} 次</span>
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" />近 {days} 天 Tokens
            </div>
            <p className="mt-1.5 text-2xl font-semibold tabular-nums">
              {totals ? formatTokens(totals.tokens) : '—'}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              输入 {formatTokens(totals?.promptTokens ?? 0)} · 输出 {formatTokens(totals?.completionTokens ?? 0)}
              {(totals?.avgLatencyMs ?? 0) > 0 && ` · 平均 ${formatLatency(totals?.avgLatencyMs ?? 0)}`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Wallet className="h-3.5 w-3.5" />近 {days} 天成本
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" className="ml-auto text-muted-foreground hover:text-foreground" title="按什么单价算的">
                    <CircleAlert className="h-3.5 w-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 space-y-2 p-3 text-[11px]">
                  <p className="font-medium">成本按 ai_model_prices 表里的单价折算（元 / 百万 tokens）</p>
                  {prices.length === 0 ? (
                    <p className="text-muted-foreground">表里还没有单价，成本显示为 0。</p>
                  ) : (
                    <div className="space-y-1">
                      {prices.map((p) => (
                        <div key={p.model} className="flex items-center justify-between gap-2">
                          <span className="truncate">{p.model}</span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            入 {p.inputPer1m} · 出 {p.outputPer1m}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {(totals?.unpricedCalls ?? 0) > 0 && (
                    <p className="text-amber-600 dark:text-amber-400">
                      有 {totals?.unpricedCalls} 次调用没有对应单价，未计入成本。
                    </p>
                  )}
                  <p className="text-muted-foreground">单价是初值，按你的实际结算价改这张表即可（SQL 或后台）。</p>
                </PopoverContent>
              </Popover>
            </div>
            <p className="mt-1.5 text-2xl font-semibold tabular-nums">
              {totals ? formatCost(totals.cost) : '—'}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
              {overview && deltaBadge(totals?.cost ?? 0, overview.prev.cost)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Database className="h-3.5 w-3.5" />本机接入配置
            </div>
            <p className="mt-1.5 text-2xl font-semibold tabular-nums">
              {enabledModels.length}
              <span className="text-sm font-normal text-muted-foreground">/{catalog.length} 模型已启用</span>
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {keyedProviders.length} / {providers.length} 个供应商填了 Key（只存本机）
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Activity className="h-4 w-4 text-primary" />调用趋势
                </CardTitle>
                <div className="flex items-center gap-1">
                  {RANGES.map((r) => (
                    <button
                      key={r.days}
                      type="button"
                      onClick={() => setDays(r.days)}
                      className={cn(
                        'rounded-full border px-2.5 py-0.5 text-[11px] transition-colors',
                        days === r.days
                          ? 'border-primary bg-primary/10 font-medium text-primary'
                          : 'text-muted-foreground hover:bg-accent/60',
                      )}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="pt-1">
                <AiUsageTrend daily={overview?.daily ?? []} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Gauge className="h-4 w-4 text-primary" />模型使用占比
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-1">
                <AiUsageShare models={overview?.models ?? []} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Server className="h-4 w-4 text-primary" />模型管理
              </CardTitle>
              <div className="flex items-center gap-1">
                {([['all', `全部(${catalog.length})`], ['on', `已启用(${enabledModels.length})`], ['off', `未启用(${catalog.length - enabledModels.length})`]] as const).map(
                  ([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setModelFilter(key)}
                      className={cn(
                        'rounded-full border px-2.5 py-0.5 text-[11px] transition-colors',
                        modelFilter === key
                          ? 'border-primary bg-primary/10 font-medium text-primary'
                          : 'text-muted-foreground hover:bg-accent/60',
                      )}
                    >
                      {label}
                    </button>
                  ),
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-1">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>模型</TableHead>
                    <TableHead className="w-28">提供商</TableHead>
                    <TableHead className="w-24">状态</TableHead>
                    <TableHead className="w-28">支持能力</TableHead>
                    <TableHead className="w-24">接入方式</TableHead>
                    <TableHead className="w-28 text-right">近 {days} 天调用</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleModels.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-20 text-center text-xs text-muted-foreground">
                        没有符合条件的模型
                      </TableCell>
                    </TableRow>
                  ) : visibleModels.map((m) => {
                    const meta = MODEL_META[m.id] ?? { vendor: m.provider, caps: '文本' }
                    const usage = usageByModel.get(m.id)
                    return (
                      <TableRow key={`${m.providerId}-${m.id}`}>
                        <TableCell>
                          <span className="text-xs font-medium">{m.name}</span>
                          <span className="ml-1.5 text-[10px] text-muted-foreground">{m.id}</span>
                        </TableCell>
                        <TableCell className="text-[11px] text-muted-foreground">{meta.vendor}</TableCell>
                        <TableCell>
                          <span className={cn(
                            'rounded px-1.5 py-0.5 text-[10px] font-medium',
                            m.enabled
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                              : 'bg-muted text-muted-foreground',
                          )}>
                            {m.enabled ? '已启用' : '未启用'}
                          </span>
                        </TableCell>
                        <TableCell className="text-[11px] text-muted-foreground">{meta.caps}</TableCell>
                        <TableCell className="text-[11px] text-muted-foreground">平台代理</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {usage ? (
                            <span title={`${formatCount(usage.tokens)} tokens · 平均 ${formatLatency(usage.avgLatencyMs)}`}>
                              {formatCount(usage.calls)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-[11px]"
                              onClick={() => onOpenTab('providers')}
                            >
                              配置
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                  <ChevronDown className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuItem
                                  className="text-xs"
                                  onClick={() => toggleModel(m.providerId, m.id)}
                                >
                                  {m.enabled ? '停用这个模型' : '启用这个模型'}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-xs"
                                  onClick={() => void navigator.clipboard?.writeText(m.id)}
                                >
                                  复制模型 ID
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>

              <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                平台所有模型调用都走服务端代理（supabase/functions/ai），代理出口当前接的是 DeepSeek；
                这里的启用开关只是本机的目录标记，真正换模型要改服务端 secret —— 详见「配置层级」页签。
                上表「近 {days} 天调用」是服务端真实记录。
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Clock3 className="h-4 w-4 text-primary" />最近调用日志
              </CardTitle>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" disabled={loading} onClick={refresh}>
                <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
              </Button>
            </CardHeader>
            <CardContent className="pt-1">
              {error && (
                <p className="mb-2 rounded border border-destructive/40 bg-destructive/5 p-2 text-[11px] text-destructive">
                  {error}
                </p>
              )}
              {!error && logs.length === 0 && (
                <p className="py-6 text-center text-[11px] text-muted-foreground">
                  还没有调用记录。{isAdmin ? '（管理员看到的是全站用量）' : '（这里显示你自己的用量）'}
                </p>
              )}
              <div className={cn('space-y-2', logsExpanded && 'max-h-[420px] overflow-y-auto pr-1')}>
                {logs.map((log) => (
                  <div key={log.id} className="rounded-md border p-2">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[11px] font-medium">{log.model || '未知模型'}</span>
                      <Badge
                        variant={log.ok ? 'secondary' : 'destructive'}
                        className="px-1 py-0 text-[9px] leading-none"
                      >
                        {log.ok ? '成功' : `失败${log.statusCode ? ` ${log.statusCode}` : ''}`}
                      </Badge>
                      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                        {formatLogTime(log.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{aiSourceLabel(log.source)}</span>
                      <span className="tabular-nums">耗时 {formatLatency(log.latencyMs)}</span>
                      <span className="tabular-nums">{log.tokens > 0 ? `${formatTokens(log.tokens)} tokens` : '未记录 tokens'}</span>
                    </p>
                  </div>
                ))}
              </div>
              {(logs.length > 0 || logsExpanded) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 w-full gap-1 text-[11px]"
                  onClick={() => setLogsExpanded((v) => !v)}
                >
                  {logsExpanded ? '收起' : '查看更多'}
                  <ChevronRight className={cn('h-3 w-3 transition-transform', logsExpanded && 'rotate-90')} />
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <MessagesSquare className="h-4 w-4 text-primary" />小Q 会话用量
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-1">
              {(overview?.conversations.length ?? 0) === 0 ? (
                <p className="py-6 text-center text-[11px] leading-relaxed text-muted-foreground">
                  近 {days} 天还没有带会话的调用。
                  <br />
                  小Q 对话会带上会话 id，出题、批改这些没有会话归属。
                </p>
              ) : (
                <div className="space-y-2">
                  {overview?.conversations.map((c) => {
                    const body = (
                      <>
                        <p className="truncate text-[11px] font-medium">
                          {c.title ?? <span className="text-muted-foreground">其他用户的会话 / 已删除</span>}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] tabular-nums text-muted-foreground">
                          <span>{c.calls} 轮</span>
                          <span>{formatTokens(c.tokens)} tokens</span>
                          <span>{formatCost(c.cost)}</span>
                          <span className="ml-auto shrink-0">{formatLogTime(c.lastAt)}</span>
                        </p>
                      </>
                    )
                    // 只有本人的会话才给跳转: 别人的会话没有标题, 点过去也只会落到自己的对话上
                    return c.owned ? (
                      <Link
                        key={c.conversationId}
                        to={`/assistant?conversation=${c.conversationId}`}
                        className="block rounded-md border p-2 transition-colors hover:border-primary/50 hover:bg-accent/40"
                      >
                        {body}
                      </Link>
                    ) : (
                      <div key={c.conversationId} className="rounded-md border p-2">{body}</div>
                    )
                  })}
                  <p className="text-[10px] leading-relaxed text-muted-foreground">
                    只统计小Q 对话（出题、批改这些没有会话归属）。每行点进去就是那条会话，
                    每条回答下面写着的 tokens 与金额加起来就是这个数。
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Zap className="h-4 w-4 text-primary" />快捷操作
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 pt-1">
              <Button variant="outline" size="sm" className="h-auto flex-col items-start gap-1 px-2.5 py-2 text-left" onClick={runProbe} disabled={probe.state === 'running'}>
                <span className="flex items-center gap-1.5 text-[11px] font-medium">
                  {probe.state === 'running' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />}
                  测试平台连接
                </span>
                <span className="text-[10px] font-normal text-muted-foreground">
                  {probe.state === 'ok' ? `连通 · ${probe.text}`
                    : probe.state === 'fail' ? '失败，看下面日志'
                      : '真实发一次最小请求'}
                </span>
              </Button>
              <Button variant="outline" size="sm" className="h-auto flex-col items-start gap-1 px-2.5 py-2 text-left" onClick={() => onOpenTab('relay')}>
                <span className="flex items-center gap-1.5 text-[11px] font-medium">
                  <Server className="h-3.5 w-3.5" />中转与接口
                </span>
                <span className="text-[10px] font-normal text-muted-foreground">代理出口与路径</span>
              </Button>
              <Button variant="outline" size="sm" className="h-auto flex-col items-start gap-1 px-2.5 py-2 text-left" onClick={() => onOpenTab('providers')}>
                <span className="flex items-center gap-1.5 text-[11px] font-medium">
                  <Key className="h-3.5 w-3.5" />供应商配置
                </span>
                <span className="text-[10px] font-normal text-muted-foreground">Key 与模型开关</span>
              </Button>
              <Button variant="outline" size="sm" className="h-auto flex-col items-start gap-1 px-2.5 py-2 text-left" onClick={() => onOpenTab('errors')}>
                <span className="flex items-center gap-1.5 text-[11px] font-medium">
                  <CircleAlert className="h-3.5 w-3.5" />错误码对照
                </span>
                <span className="text-[10px] font-normal text-muted-foreground">402 / 429 / 529 是什么</span>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">用量是怎么记的</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-[11px] leading-relaxed text-muted-foreground">
              <p>
                平台模型全部经 <code className="rounded bg-muted px-1">/functions/v1/ai</code> 转发，
                代理函数在那里记下 调用者、模型、耗时、状态码与上游返回的 tokens（流式请求会补一个
                <code className="rounded bg-muted px-1">stream_options.include_usage</code> 拿用量）。
              </p>
              <p>
                {isAdmin
                  ? '你是管理员：这里看到的是全站用量。'
                  : '这里显示的是你自己的用量；管理员能看到全站。'}
                成本按 <code className="rounded bg-muted px-1">ai_model_prices</code> 的单价折算，
                没有单价的模型不计入成本。
              </p>
              <Separator />
              <button
                type="button"
                className="flex items-center gap-1 text-primary hover:underline"
                onClick={() => onOpenTab('layers')}
              >
                看配置层级与权限 <ChevronRight className="h-3 w-3" />
              </button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
