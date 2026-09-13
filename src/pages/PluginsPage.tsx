import { useEffect, useState } from 'react'
import { Blocks, Bug, Info, PlayCircle, Puzzle, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { PLUGIN_CATEGORY_LABELS, PLUGIN_DEFS, type PluginOption } from '@/lib/plugin-catalog'
import { usePluginStore } from '@/stores/plugin-store'
import { emitPluginSignal } from '@/lib/plugin-events'
import { useT } from '@/i18n/use-t'

function OptionField({ option, value, zh, onCommit }: {
  option: PluginOption
  value: number | boolean
  zh: boolean
  onCommit: (value: number | boolean) => void
}) {
  if (option.type === 'boolean') {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
        <span className="text-xs">{zh ? option.labelZh : option.labelEn}</span>
        <Switch checked={Boolean(value)} onCheckedChange={(checked) => onCommit(checked)} />
      </div>
    )
  }
  return (
    <div className="space-y-1.5 rounded-lg border p-2.5">
      <Label htmlFor={`opt-${option.key}`} className="text-xs">
        {zh ? option.labelZh : option.labelEn}
      </Label>
      <div className="flex items-center gap-2">
        <Input
          id={`opt-${option.key}`}
          type="number"
          min={option.min}
          max={option.max}
          value={Number(value)}
          onChange={(e) => {
            const next = Number(e.target.value)
            if (!Number.isFinite(next)) return
            const clamped = Math.min(Math.max(next, option.min ?? 0), option.max ?? 9999)
            onCommit(clamped)
          }}
          className="h-8 w-24 text-sm"
        />
        <span className="text-[11px] text-muted-foreground">{zh ? option.unitZh : option.unitEn}</span>
      </div>
    </div>
  )
}

export function Component() {
  const { lang } = useT()
  const zh = lang === 'zh'

  const rows = usePluginStore((s) => s.rows)
  const setEnabled = usePluginStore((s) => s.setEnabled)
  const setConfig = usePluginStore((s) => s.setConfig)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const store = usePluginStore.getState()
    if (!store.loaded) void store.load()
  }, [])

  const enabledCount = PLUGIN_DEFS.filter((def) => rows[def.id]?.enabled).length

  async function toggle(id: string, enabled: boolean) {
    setError(null)
    try {
      await setEnabled(id, enabled)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function commit(id: string, next: Record<string, number | boolean>) {
    setError(null)
    try {
      await setConfig(id, next)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
          <Blocks className="h-5 w-5 text-primary" />
          {zh ? '插件' : 'Plugins'}
          <Badge variant="secondary" className="font-normal">
            {zh ? `${enabledCount}/${PLUGIN_DEFS.length} 已启用` : `${enabledCount}/${PLUGIN_DEFS.length} on`}
          </Badge>
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {zh
            ? '平台的可选能力都放这里：默认全关，开了才生效，开关和设置只存在你自己的账号里。'
            : 'Optional capabilities live here. Everything is off by default, only runs when you turn it on, and your switches are stored in your own account.'}
        </p>
      </div>

      {error && (
        <p className="flex items-start gap-1.5 rounded-lg bg-rose-50 px-2.5 py-2 text-[11px] text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
          <Bug className="mt-0.5 h-3 w-3 shrink-0" />
          {error}
        </p>
      )}

      {PLUGIN_DEFS.map((def) => {
        const row = rows[def.id]
        const enabled = Boolean(row?.enabled)
        const config = { ...Object.fromEntries(def.options.map((o) => [o.key, o.default])), ...(row?.config ?? {}) }
        return (
          <Card key={def.id} className={enabled ? 'border-primary/40' : undefined}>
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                <Puzzle className={enabled ? 'h-4 w-4 text-primary' : 'h-4 w-4 text-muted-foreground'} />
                {zh ? def.nameZh : def.nameEn}
                <Badge variant="outline" className="font-mono text-[10px] font-normal">v{def.version}</Badge>
                <Badge variant="secondary" className="text-[10px] font-normal">
                  {zh ? PLUGIN_CATEGORY_LABELS[def.category].zh : PLUGIN_CATEGORY_LABELS[def.category].en}
                </Badge>
                <span className="ml-auto flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">{enabled ? (zh ? '已启用' : 'On') : (zh ? '已关闭' : 'Off')}</span>
                  <Switch checked={enabled} onCheckedChange={(next) => void toggle(def.id, next)} />
                </span>
              </CardTitle>
              <p className="text-[11px] leading-relaxed text-muted-foreground">{zh ? def.descZh : def.descEn}</p>
            </CardHeader>
            <CardContent className="space-y-3 pt-1">
              <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Info className="h-3 w-3 shrink-0" />
                {zh ? def.mountZh : def.mountEn}
              </p>

              {enabled && (
                <>
                  <Separator />
                  <div className="grid gap-2 sm:grid-cols-2">
                    {def.options.map((option) => (
                      <OptionField
                        key={option.key}
                        option={option}
                        value={config[option.key]}
                        zh={zh}
                        onCommit={(value) => void commit(def.id, { ...config, [option.key]: value })}
                      />
                    ))}
                  </div>
                  {def.id === 'eye-rest' && (
                    <Button size="sm" variant="outline" onClick={() => emitPluginSignal(def.id)}>
                      <PlayCircle className="mr-1.5 h-3.5 w-3.5" />
                      {zh ? '立即试一次' : 'Preview it now'}
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )
      })}

      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            {zh ? '这里是预留位' : 'This is the reserved slot'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 pt-1 text-[11px] leading-relaxed text-muted-foreground">
          <p>· {zh ? '插件登记在 src/lib/plugin-catalog.ts，开关与配置存在 public.user_plugins。' : 'Plugins are registered in src/lib/plugin-catalog.ts; switches and config live in public.user_plugins.'}</p>
          <p>· {zh ? '加一个插件 = 在目录里加一条，再写它的运行时代码；如果它要挂全站，就在 AppLayout 里挂上。' : 'Adding one means: an entry in the catalog plus its runtime code — mount it in AppLayout if it should run app-wide.'}</p>
          <p>· {zh ? '页面、开关、配置面板都会按目录自动长出来，不用再改这里。' : 'The page, the switches and the settings panel all render from the catalog, so this file does not change.'}</p>
        </CardContent>
      </Card>
    </div>
  )
}
