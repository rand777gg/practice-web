import { useRef, useState } from 'react'
import { useSyncSettingsStore, ALL_SYNCED_KEYS, type SyncedKey } from '@/stores/sync-settings-store'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { useT } from '@/i18n/use-t'
import { Cloud, CloudUpload, CloudDownload, RefreshCw, Download, Upload, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const directions = [
  { key: 'none' as const, icon: Cloud },
  { key: 'upload_only' as const, icon: CloudUpload },
  { key: 'download_only' as const, icon: CloudDownload },
  { key: 'bidirectional' as const, icon: RefreshCw },
] as const

const KEY_LABELS: Record<SyncedKey, string> = {
  theme: '主题 (light/dark)',
  lang: '语言',
  ai_feature_flags: 'AI 功能开关',
  eye_care: '护眼模式',
  dark_code_theme: '深色代码主题',
  light_code_theme: '浅色代码主题',
  font_family: '字体',
  font_size: '字号',
  font_weight: '字重',
  offline_mode: '离线模式',
  note_recognition_mode: '笔记识别方式',
  bottom_nav_tabs: '底部导航栏',
}

export function SyncSettingsCard() {
  const { t } = useT()
  const {
    syncDirection, autoSync, lastSyncAt, syncing, syncedKeys,
    setSyncDirection, setAutoSync, toggleSyncedKey, selectAllKeys, deselectAllKeys,
    uploadSettings, downloadSettings, syncNow, exportToFile, importFromFile,
  } = useSyncSettingsStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importOk, setImportOk] = useState(false)
  const [importErr, setImportErr] = useState(false)
  const [open, setOpen] = useState(false)

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const ok = await importFromFile(file)
    if (ok) {
      setImportOk(true)
      setTimeout(() => setImportOk(false), 3000)
    } else {
      setImportErr(true)
      setTimeout(() => setImportErr(false), 3000)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs">
          <RefreshCw className="h-3.5 w-3.5" />
          {t('settings.sync.title')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('settings.sync.title')}</DialogTitle>
          <DialogDescription>
            {lastSyncAt
              ? `${t('settings.sync.lastSync')}: ${new Date(lastSyncAt).toLocaleString()}`
              : t('settings.sync.direction')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 max-h-[65vh] overflow-y-auto pr-1">
          {/* Sync direction */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">{t('settings.sync.direction')}</p>
            <div className="grid grid-cols-4 gap-1.5">
              {directions.map(({ key, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSyncDirection(key)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs transition-colors',
                    syncDirection === key
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t(`settings.sync.dir_${key}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Select settings to sync */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">{t('settings.sync.selectKeys')}</p>
              <div className="flex gap-2">
                <button type="button" className="text-[10px] text-muted-foreground hover:text-foreground underline" onClick={selectAllKeys}>全选</button>
                <button type="button" className="text-[10px] text-muted-foreground hover:text-foreground underline" onClick={deselectAllKeys}>取消全选</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {ALL_SYNCED_KEYS.map((key) => (
                <div key={key} className="flex items-center gap-2">
                  <Checkbox
                    id={`sync-key-${key}`}
                    checked={syncedKeys.includes(key)}
                    onCheckedChange={() => toggleSyncedKey(key)}
                  />
                  <Label htmlFor={`sync-key-${key}`} className="text-xs cursor-pointer">
                    {KEY_LABELS[key]}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Auto sync */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm">{t('settings.sync.auto')}</p>
              <p className="text-xs text-muted-foreground">{t('settings.sync.autoDesc')}</p>
            </div>
            <Switch checked={autoSync} disabled={syncDirection === 'none'} onCheckedChange={setAutoSync} />
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs" disabled={syncing || syncDirection === 'none'} onClick={() => syncNow()}>
              <RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />
              {t('settings.sync.syncNow')}
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" disabled={syncing} onClick={uploadSettings}>
              <Upload className="h-3.5 w-3.5" />
              {t('settings.sync.upload')}
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" disabled={syncing} onClick={downloadSettings}>
              <Download className="h-3.5 w-3.5" />
              {t('settings.sync.download')}
            </Button>
          </div>

          <div className="border-t pt-4" />

          {/* Export / Import */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">{t('settings.sync.exportImport')}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={exportToFile}>
                <Download className="h-3.5 w-3.5" />
                {t('settings.sync.export')}
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-3.5 w-3.5" />
                {t('settings.sync.import')}
              </Button>
              <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
            </div>
            {importOk && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-1.5 flex items-center gap-1">
                <Check className="h-3 w-3" />{t('settings.sync.importOk')}
              </p>
            )}
            {importErr && <p className="text-xs text-destructive mt-1.5">{t('settings.sync.importErr')}</p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
