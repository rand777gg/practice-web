import { useState, useCallback } from 'react'
import { useAiStore } from '@/stores/ai-store'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useT } from '@/i18n/use-t'
import { Zap, Globe, Key, Link, ChevronDown, ChevronUp, Wifi, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { ProviderIcon } from '@lobehub/icons'
import type { AiProviderConfig } from '@/types'

export function Component() {
  const { t } = useT()
  const { providers, toggleProvider, toggleModel, setApiKey, setBaseUrl } = useAiStore()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const official = providers.filter((p) => p.type === 'official')
  const community = providers.filter((p) => p.type === 'community')
  const enabledCount = providers.filter((p) => p.enabled).length
  const disabledCount = providers.filter((p) => !p.enabled).length

  const toggleExpanded = (id: string) => {
    setExpandedId(expandedId === id ? null : id)
  }

  // Connectivity test
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const activeProviders = providers.filter(p => p.enabled && p.apiKey)

  const runTest = useCallback(async () => {
    if (activeProviders.length === 0) return
    setTesting(true)
    setTestResult(null)
    try {
      const p = activeProviders[0]
      const model = p.models.find(m => m.enabled)?.id ?? p.models[0].id
      const res = await fetch(`${p.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 }),
        signal: AbortSignal.timeout(10000),
      })
      if (res.ok) {
        setTestResult({ ok: true, msg: `${p.name} (${model}) 连通正常` })
      } else {
        const err = await res.text().catch(() => '')
        setTestResult({ ok: false, msg: `HTTP ${res.status}${err ? ': ' + err.slice(0, 200) : ''}` })
      }
    } catch (e) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : '连接失败' })
    }
    setTesting(false)
  }, [activeProviders])

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold flex items-center gap-2">
          {t('ai.title')}
          <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 rounded">BETA</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t('ai.description')}</p>
      </div>

      {/* Env var status */}
      <Card className="border-0 shadow-none">
        <CardContent className="py-4 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">DeepSeek API Key:</span>
              {import.meta.env.VITE_DEEPSEEK_API_KEY ? (
                <Badge variant="secondary" className="gap-1 text-xs"><CheckCircle className="h-3 w-3 text-green-500" />已配置</Badge>
              ) : (
                <Badge variant="outline" className="gap-1 text-xs text-muted-foreground"><XCircle className="h-3 w-3" />未配置</Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">MinerU Token:</span>
              {import.meta.env.VITE_MINERU_TOKEN ? (
                <Badge variant="secondary" className="gap-1 text-xs"><CheckCircle className="h-3 w-3 text-green-500" />已配置</Badge>
              ) : (
                <Badge variant="outline" className="gap-1 text-xs text-muted-foreground"><XCircle className="h-3 w-3" />未配置</Badge>
              )}
            </div>
          </div>
          {activeProviders.length > 0 && (
            <Button variant="outline" size="sm" onClick={runTest} disabled={testing} className="gap-1.5">
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />}
              连通性测试
            </Button>
          )}
          {testResult && (
            <div className={`flex items-center gap-1.5 text-xs ${testResult.ok ? 'text-green-600' : 'text-red-500'}`}>
              {testResult.ok ? <CheckCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
              {testResult.msg}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Enabled Section */}
      {enabledCount > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">{t('ai.enabledProviders')}</h2>
            <Badge variant="secondary" className="text-[10px] h-5">{enabledCount}</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {providers.filter((p) => p.enabled).map((p) => (
              <ProviderCard
                key={p.id}
                provider={p}
                expanded={expandedId === p.id}
                onToggleExpand={() => toggleExpanded(p.id)}
                onToggle={() => toggleProvider(p.id)}
                onToggleModel={(mid) => toggleModel(p.id, mid)}
                onApiKeyChange={(key) => setApiKey(p.id, key)}
                onBaseUrlChange={(url) => setBaseUrl(p.id, url)}
              />
            ))}
          </div>
        </section>
      )}

      {enabledCount > 0 && disabledCount > 0 && <Separator />}

      {/* Disabled Section */}
      {disabledCount > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">{t('ai.disabledProviders')}</h2>
            <Badge variant="secondary" className="text-[10px] h-5">{disabledCount}</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {providers.filter((p) => !p.enabled).map((p) => (
              <ProviderCard
                key={p.id}
                provider={p}
                expanded={expandedId === p.id}
                onToggleExpand={() => toggleExpanded(p.id)}
                onToggle={() => toggleProvider(p.id)}
                onToggleModel={(mid) => toggleModel(p.id, mid)}
                onApiKeyChange={(key) => setApiKey(p.id, key)}
                onBaseUrlChange={(url) => setBaseUrl(p.id, url)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Official / Community grouping when no providers are enabled yet */}
      {enabledCount === 0 && disabledCount === providers.length && (
        <>
          <ProviderGroup
            icon={<Zap className="h-4 w-4 text-yellow-500" />}
            label={t('ai.official')}
            providers={official}
            expandedId={expandedId}
            onToggleExpand={toggleExpanded}
            onToggle={toggleProvider}
            onToggleModel={toggleModel}
            onApiKeyChange={setApiKey}
            onBaseUrlChange={setBaseUrl}
          />

          <Separator />

          <ProviderGroup
            icon={<Globe className="h-4 w-4 text-blue-500" />}
            label={t('ai.community')}
            providers={community}
            expandedId={expandedId}
            onToggleExpand={toggleExpanded}
            onToggle={toggleProvider}
            onToggleModel={toggleModel}
            onApiKeyChange={setApiKey}
            onBaseUrlChange={setBaseUrl}
          />
        </>
      )}
    </div>
  )
}

interface ProviderGroupProps {
  icon: React.ReactNode
  label: string
  providers: AiProviderConfig[]
  expandedId: string | null
  onToggleExpand: (id: string) => void
  onToggle: (id: string) => void
  onToggleModel: (providerId: string, modelId: string) => void
  onApiKeyChange: (providerId: string, key: string) => void
  onBaseUrlChange: (providerId: string, url: string) => void
}

function ProviderGroup({
  icon, label, providers, expandedId,
  onToggleExpand, onToggle, onToggleModel, onApiKeyChange, onBaseUrlChange,
}: ProviderGroupProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold">{label}</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {providers.map((p) => (
          <ProviderCard
            key={p.id}
            provider={p}
            expanded={expandedId === p.id}
            onToggleExpand={() => onToggleExpand(p.id)}
            onToggle={() => onToggle(p.id)}
            onToggleModel={(mid) => onToggleModel(p.id, mid)}
            onApiKeyChange={(key) => onApiKeyChange(p.id, key)}
            onBaseUrlChange={(url) => onBaseUrlChange(p.id, url)}
          />
        ))}
      </div>
    </section>
  )
}

interface ProviderCardProps {
  provider: AiProviderConfig
  expanded: boolean
  onToggleExpand: () => void
  onToggle: () => void
  onToggleModel: (modelId: string) => void
  onApiKeyChange: (key: string) => void
  onBaseUrlChange: (url: string) => void
}

function ProviderCard({ provider, expanded, onToggleExpand, onToggle, onToggleModel, onApiKeyChange, onBaseUrlChange }: ProviderCardProps) {
  const { t } = useT()
  const enabledCount = provider.models.filter((m) => m.enabled).length

  return (
    <Card className={provider.enabled ? 'border-primary/30' : 'opacity-70'}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <ProviderIcon provider={provider.id} size={20} type="avatar" />
              <CardTitle className="text-sm">{provider.name}</CardTitle>
            </div>
            <CardDescription className="text-xs mt-1 line-clamp-2">
              {provider.description}
            </CardDescription>
          </div>
          <Switch checked={provider.enabled} onCheckedChange={onToggle} />
        </div>
      </CardHeader>

      {provider.enabled && (
        <>
          <div
            className="flex items-center justify-center gap-1 py-1 cursor-pointer hover:bg-accent/50 transition-colors text-xs text-muted-foreground"
            onClick={onToggleExpand}
          >
            {enabledCount > 0 && (
              <span className="text-[10px]">{t('ai.models')}: {enabledCount}/{provider.models.length}</span>
            )}
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </div>

          {expanded && (
            <CardContent className="space-y-4 pt-0">
              {/* API Key */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Key className="h-3 w-3" />
                  API Key
                </label>
                <Input
                  type="password"
                  value={provider.apiKey}
                  onChange={(e) => onApiKeyChange(e.target.value)}
                  placeholder="sk-..."
                  className="h-8 text-xs"
                />
              </div>

              {/* Base URL */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Link className="h-3 w-3" />
                  Base URL
                </label>
                <Input
                  value={provider.baseUrl}
                  onChange={(e) => onBaseUrlChange(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              {/* Models */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">{t('ai.models')}</p>
                  {enabledCount > 0 && (
                    <span className="text-[10px] text-muted-foreground">{enabledCount}/{provider.models.length}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {provider.models.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onToggleModel(m.id)}
                      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-all border
                        ${m.enabled
                          ? 'bg-primary/10 border-primary/40 text-primary shadow-sm'
                          : 'bg-muted/50 border-border text-muted-foreground hover:border-primary/20 hover:bg-muted'}`}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          )}
        </>
      )}
    </Card>
  )
}
