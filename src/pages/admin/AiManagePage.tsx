import { useState, useCallback } from 'react'
import { useAiStore } from '@/stores/ai-store'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useT } from '@/i18n/use-t'
import { Zap, Globe, Key, Link, ChevronUp, ChevronDown, Wifi, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { ProviderIcon } from '@lobehub/icons'
import type { AiProviderConfig } from '@/types'

export function Component() {
  const { t } = useT()
  const { providers, toggleProvider, toggleModel, setApiKey, setBaseUrl } = useAiStore()

  const official = providers.filter((p) => p.type === 'official')
  const community = providers.filter((p) => p.type === 'community')
  const enabledCount = providers.filter((p) => p.enabled).length
  const disabledCount = providers.filter((p) => !p.enabled).length

  const cardProps = { toggleProvider, toggleModel, setApiKey, setBaseUrl }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold flex items-center gap-2">
          {t('ai.title')}
          <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 rounded">BETA</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t('ai.description')}</p>
      </div>

      {enabledCount > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">{t('ai.enabledProviders')}</h2>
            <Badge variant="secondary" className="text-[10px] h-5">{enabledCount}</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {providers.filter((p) => p.enabled).map((p) => (
              <ProviderCard key={p.id} provider={p}
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

      {disabledCount > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">{t('ai.disabledProviders')}</h2>
            <Badge variant="secondary" className="text-[10px] h-5">{disabledCount}</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {providers.filter((p) => !p.enabled).map((p) => (
              <ProviderCard key={p.id} provider={p}
                onToggle={() => toggleProvider(p.id)}
                onToggleModel={(mid) => toggleModel(p.id, mid)}
                onApiKeyChange={(key) => setApiKey(p.id, key)}
                onBaseUrlChange={(url) => setBaseUrl(p.id, url)}
              />
            ))}
          </div>
        </section>
      )}

      {enabledCount === 0 && disabledCount === providers.length && (
        <>
          <ProviderGroup icon={<Zap className="h-4 w-4 text-yellow-500" />} label={t('ai.official')} providers={official} {...cardProps} />
          <Separator />
          <ProviderGroup icon={<Globe className="h-4 w-4 text-blue-500" />} label={t('ai.community')} providers={community} {...cardProps} />
        </>
      )}
    </div>
  )
}

function ProviderGroup({ icon, label, providers, ...cardProps }: {
  icon: React.ReactNode; label: string; providers: AiProviderConfig[]
  onToggle: (id: string) => void; onToggleModel: (pid: string, mid: string) => void
  onApiKeyChange: (pid: string, key: string) => void; onBaseUrlChange: (pid: string, url: string) => void
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">{icon}<h2 className="text-sm font-semibold">{label}</h2></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {providers.map((p) => (
          <ProviderCard key={p.id} provider={p}
            onToggle={() => cardProps.onToggle(p.id)}
            onToggleModel={(mid) => cardProps.onToggleModel(p.id, mid)}
            onApiKeyChange={(key) => cardProps.onApiKeyChange(p.id, key)}
            onBaseUrlChange={(url) => cardProps.onBaseUrlChange(p.id, url)}
          />
        ))}
      </div>
    </section>
  )
}

function ProviderCard({ provider, onToggle, onToggleModel, onApiKeyChange, onBaseUrlChange }: {
  provider: AiProviderConfig
  onToggle: () => void; onToggleModel: (mid: string) => void
  onApiKeyChange: (key: string) => void; onBaseUrlChange: (url: string) => void
}) {
  const { t } = useT()
  const enabledCount = provider.models.filter((m) => m.enabled).length
  const envKey = (import.meta.env as Record<string, string>)[`VITE_${provider.id.toUpperCase()}_API_KEY`]
  const effectiveKey = provider.apiKey || envKey || ''
  const hasKey = !!effectiveKey
  const hasEnvKey = !!envKey
  const [expanded, setExpanded] = useState(provider.enabled && hasKey)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [testing, setTesting] = useState(false)

  const effectiveKey = provider.apiKey || (import.meta.env as Record<string, string>)[`VITE_${provider.id.toUpperCase()}_API_KEY`] || ''

  const runTest = useCallback(async () => {
    if (!effectiveKey) return
    setTesting(true)
    setTestResult(null)
    try {
      const model = provider.models.find(m => m.enabled)?.id ?? provider.models[0].id
      const res = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${effectiveKey}` },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 }),
        signal: AbortSignal.timeout(10000),
      })
      if (res.ok) {
        setTestResult({ ok: true, msg: '连通正常' })
      } else {
        const err = await res.text().catch(() => '')
        setTestResult({ ok: false, msg: `HTTP ${res.status}${err ? ': ' + err.slice(0, 100) : ''}` })
      }
    } catch (e) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : '连接失败' })
    }
    setTesting(false)
  }, [effectiveKey, provider.baseUrl, provider.models])

  return (
    <Card
      className={`cursor-pointer transition-all duration-200 ${provider.enabled ? 'border-primary/30' : 'opacity-70 hover:opacity-90'}`}
      onClick={() => provider.enabled && setExpanded(!expanded)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <ProviderIcon provider={provider.id} size={20} type="avatar" />
              <CardTitle className="text-sm">{provider.name}</CardTitle>
              {provider.enabled && (
                expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
            </div>
            <CardDescription className="text-xs mt-1 line-clamp-2">{provider.description}</CardDescription>
          </div>
          <Switch checked={provider.enabled} onCheckedChange={onToggle} onClick={(e) => e.stopPropagation()} />
        </div>
      </CardHeader>

      {provider.enabled && (
        <>
          <div
            className="grid transition-all duration-300 ease-in-out"
            style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
          >
            <div className="overflow-hidden">
              <CardContent className="space-y-4 pt-0">
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Key className="h-3 w-3" />API Key
                  </label>
                  <Input type="password" value={provider.apiKey}
                    onChange={(e) => onApiKeyChange(e.target.value)}
                    placeholder={hasEnvKey ? '••••••••' : 'sk-...'}
                    className="h-8 text-xs" onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Link className="h-3 w-3" />Base URL
                  </label>
                  <Input value={provider.baseUrl}
                    onChange={(e) => onBaseUrlChange(e.target.value)}
                    className="h-8 text-xs" onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">{t('ai.models')}</p>
                    <span className="text-[10px] text-muted-foreground">{enabledCount}/{provider.models.length}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {provider.models.map((m) => (
                      <button key={m.id} type="button"
                        onClick={(e) => { e.stopPropagation(); onToggleModel(m.id) }}
                        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-all border
                          ${m.enabled ? 'bg-primary/10 border-primary/40 text-primary shadow-sm' : 'bg-muted/50 border-border text-muted-foreground hover:border-primary/20 hover:bg-muted'}`}
                      >{m.name}</button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </div>
          </div>

          {hasKey && (
            <CardContent className="pt-0 space-y-2">
              <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs"
                onClick={(e) => { e.stopPropagation(); runTest() }} disabled={testing || !effectiveKey}>
                {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />}
                连通性测试
              </Button>
              {testResult && (
                <div className={`flex items-center gap-1.5 text-xs ${testResult.ok ? 'text-green-600' : 'text-red-500'}`}>
                  {testResult.ok ? <CheckCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                  {testResult.msg}
                </div>
              )}
            </CardContent>
          )}
        </>
      )}
    </Card>
  )
}
