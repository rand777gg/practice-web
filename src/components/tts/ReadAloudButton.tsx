import { AudioLines, Loader2, Pause, Play, Settings2, Square, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { useTts } from '@/hooks/use-tts'
import { TTS_SPEEDS, TTS_VOICES } from '@/lib/tts/config'
import { useT } from '@/i18n/use-t'
import { cn } from '@/lib/utils'

interface Props {
  /** 唯一标识，用来判断"正在响的是不是我" */
  id: string
  /** 点击时才拼朗读稿 —— 列表里每张卡都预先算一遍太浪费 */
  build: () => { prompt: string[]; answer: string[] }
  className?: string
}

export function ReadAloudButton({ id, build, className }: Props) {
  const { t } = useT()
  const tts = useTts()

  const active = tts.id === id
  const cueReady = active && tts.cue === 'answer'
  const failed = tts.errorId === id && !!tts.error
  const busy = active && tts.status === 'loading'
  const playing = active && tts.status === 'playing'
  const paused = active && tts.status === 'paused'

  const start = () => {
    const { prompt, answer } = build()
    tts.speak(id, prompt, answer)
  }

  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      {cueReady ? (
        <Button size="sm" className="h-7 gap-1 text-xs" onClick={tts.resume} title={t('tts.cueHint')}>
          <AudioLines className="h-3.5 w-3.5" />
          {t('tts.answer')}
        </Button>
      ) : active ? (
        <>
          {(playing || paused) && (
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={tts.togglePause} title={paused ? t('tts.resume') : t('tts.pause')}>
              {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-primary" onClick={tts.stop} title={t('tts.stop')}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
            {busy ? t('tts.loading') : t('tts.stop')}
          </Button>
        </>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className={cn('h-7 gap-1 text-xs', failed && 'text-destructive')}
          onClick={start}
          title={failed ? `${t('tts.failed')}：${tts.error}` : t('tts.read')}
        >
          <Volume2 className="h-3.5 w-3.5" />
          {failed ? t('tts.failed') : t('tts.read')}
        </Button>
      )}

      <SpeechSettings />
    </div>
  )
}

function SpeechSettings() {
  const { t } = useT()
  const { prefs, setPrefs } = useTts()

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-1.5 text-muted-foreground/60 hover:text-foreground" title={t('tts.settings')}>
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3 p-3">
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-muted-foreground">{t('tts.voice')}</p>
          <div className="grid grid-cols-2 gap-1">
            {TTS_VOICES.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setPrefs({ voice: v.id })}
                className={cn(
                  'rounded-md border px-2 py-1.5 text-left transition-colors',
                  prefs.voice === v.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent',
                )}
              >
                <span className="block text-xs font-medium">{v.name}</span>
                <span className="block text-[10px] text-muted-foreground">{v.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-muted-foreground">{t('tts.speed')}</p>
          <div className="flex gap-1">
            {TTS_SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setPrefs({ speed: s })}
                className={cn(
                  'flex-1 rounded-md border py-1 text-xs transition-colors',
                  prefs.speed === s ? 'border-primary bg-primary/10 font-medium' : 'border-border hover:bg-accent',
                )}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-start justify-between gap-2 border-t pt-2.5">
          <div className="min-w-0">
            <p className="text-[11px] font-medium">{t('tts.askFirst')}</p>
            <p className="text-[10px] leading-relaxed text-muted-foreground">{t('tts.askFirstDesc')}</p>
          </div>
          <Switch checked={prefs.askFirst} onCheckedChange={(v) => setPrefs({ askFirst: v })} />
        </div>
      </PopoverContent>
    </Popover>
  )
}
