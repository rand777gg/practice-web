import { useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useLangStore } from '@/stores/lang-store'
import { useSettingsStore } from '@/stores/settings-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@radix-ui/themes'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Input } from '@/components/ui/input'
import { ArrowLeft, ExternalLink, Languages, LogOut, Sparkles, Dice6, Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { hasAiConfig, hasMinerUToken, getMinerUModelVersion } from '@/lib/ai'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n/use-t'

const ADJECTIVES = ['勤奋的', '勇敢的', '机智的', '冷静的', '乐观的', '执着的', '专注的', '敏捷的', '沉稳的', '好奇的']
const NOUNS = ['学者', '探索者', '思考者', '求知者', '攀登者', '追光者', '行者', '旅人', '书虫', '夜猫']
function randomNickname() {
  return `${ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]}${NOUNS[Math.floor(Math.random() * NOUNS.length)]}${Math.floor(Math.random() * 1000)}`
}

export function Component() {
  const { t } = useT()
  const { user, profile, signOut, refreshProfile } = useAuthStore()
  const { lang, setLang } = useLangStore()
  const { flags, setFlag, offlineMode, setOfflineMode } = useSettingsStore()
  const navigate = useNavigate()
  const [aiGlow, setAiGlow] = useState(false)
  const [nickEditing, setNickEditing] = useState(false)
  const [nickValue, setNickValue] = useState(profile?.nickname || '')
  const [nickSaving, setNickSaving] = useState(false)
  const [aiNickLoading, setAiNickLoading] = useState(false)

  const saveNickname = async (name: string) => {
    if (!name.trim()) return
    setNickSaving(true)
    await supabase.from('profiles').update({ nickname: name.trim() }).eq('id', user!.id)
    await refreshProfile()
    setNickSaving(false)
    setNickEditing(false)
  }

  const aiNickname = async () => {
    if (hasAiConfig()) {
      setAiNickLoading(true)
      try {
        const { createDeepSeek } = await import('@ai-sdk/deepseek')
        const { generateText } = await import('ai')
        const model = createDeepSeek({
          apiKey: import.meta.env.VITE_DEEPSEEK_API_KEY,
          baseURL: import.meta.env.VITE_DEEPSEEK_BASE_URL || undefined,
        })
        const result = await generateText({
          model: model(import.meta.env.VITE_DEEPSEEK_MODEL || 'deepseek-chat'),
          prompt: '生成一个中文学习者的昵称，2-6个字，有创意、有趣、不死板。只输出昵称，不要多余内容。',
          temperature: 1.2,
        })
        const aiName = result.text?.trim()
        if (aiName) { setNickValue(aiName); await saveNickname(aiName) }
      } catch { setNickValue(randomNickname()) }
      setAiNickLoading(false)
    } else {
      setNickValue(randomNickname())
    }
  }

  if (!user) return null

  const aiConfigured = hasAiConfig()
  const mineruConfigured = hasMinerUToken()
  const mineruModel = getMinerUModelVersion()

  const aiFeatures = [
    { key: 'exam' as const, label: t('settings.aiExam'), desc: t('settings.aiExamDesc'), available: aiConfigured },
    { key: 'summary' as const, label: t('settings.aiSummary'), desc: t('settings.aiSummaryDesc'), available: aiConfigured },
    { key: 'suggestions' as const, label: t('settings.aiSuggestions'), desc: t('settings.aiSuggestionsDesc'), available: aiConfigured },
    { key: 'keypoints' as const, label: t('settings.aiKeypoints'), desc: t('settings.aiKeypointsDesc'), available: aiConfigured },
    { key: 'mineru' as const, label: t('settings.aiMineru'), desc: t('settings.aiMineruDesc').replace('{model}', mineruModel), available: mineruConfigured },
  ]

  const handleSetFlag = (key: string, v: boolean) => {
    setFlag(key as any, v)
    if (v) {
      setAiGlow(true)
      setTimeout(() => setAiGlow(false), 2000)
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold">{t('settings.title')}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t('settings.account')}</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <tbody>
                  <tr>
                    <td className="py-1.5 pr-4 text-muted-foreground w-[80px]">{t('settings.nickname')}</td>
                    <td className="py-1.5">
                      {nickEditing ? (
                        <div className="flex gap-1.5">
                          <Input
                            value={nickValue}
                            onChange={(e) => setNickValue(e.target.value)}
                            className="h-7 text-xs w-32"
                            onKeyDown={(e) => { if (e.key === 'Enter') saveNickname(nickValue) }}
                            autoFocus
                          />
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => saveNickname(nickValue)} disabled={nickSaving}>
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={aiNickname} disabled={aiNickLoading} title={t('settings.nicknameRandom')}>
                            <Dice6 className={`h-3.5 w-3.5 ${aiNickLoading ? 'animate-spin' : ''}`} />
                          </Button>
                        </div>
                      ) : (
                        <span
                          className="cursor-pointer hover:underline underline-offset-2"
                          onClick={() => { setNickValue(profile?.nickname || ''); setNickEditing(true) }}
                        >
                          {profile?.nickname || <span className="text-muted-foreground italic">{t('settings.nicknamePlaceholder')}</span>}
                        </span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 pr-4 text-muted-foreground">{t('auth.email')}</td>
                    <td className="py-1.5">{user.email}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 pr-4 text-muted-foreground">ID</td>
                    <td className="py-1.5 font-mono text-xs text-muted-foreground">{user.id}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 pr-4 text-muted-foreground">{t('users.role')}</td>
                    <td className="py-1.5">
                      <Badge color={profile?.role === 'admin' ? 'blue' : 'gray'} variant="soft" radius="full">
                        {profile?.role === 'admin' ? t('users.admin') : t('users.user')}
                      </Badge>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 pr-4 text-muted-foreground">{t('users.status')}</td>
                    <td className="py-1.5">
                      <Badge color="green" variant="soft" radius="full">Active</Badge>
                    </td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t('settings.language')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Button
                  variant={lang === 'zh' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setLang('zh')}
                >
                  <Languages className="h-3.5 w-3.5" />
                  中文
                </Button>
                <Button
                  variant={lang === 'en' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setLang('en')}
                >
                  <Languages className="h-3.5 w-3.5" />
                  English
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t('settings.offline')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm">{t('settings.offlineMode')}</p>
                  <p className="text-xs text-muted-foreground">{t('settings.offlineModeDesc')}</p>
                </div>
                <Switch checked={offlineMode} onCheckedChange={setOfflineMode} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <Card className={cn(
            aiGlow && '[animation:colorWheel_3s_linear_infinite,geminiBorderGlow_3s_ease-in-out_infinite]',
          )}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-blue-400" />
                {t('settings.aiFeatures')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">{t('settings.aiDesc')}</p>
                {profile?.role === 'admin' && (
                  <Button variant="outline" size="sm" asChild className="gap-1.5 shrink-0">
                    <Link to="/admin/ai">
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{t('settings.aiManagement')}</span>
                    </Link>
                  </Button>
                )}
              </div>
              <div className="space-y-3">
                {aiFeatures.map((f) => (
                  <div key={f.key} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div>
                        <p className="text-sm">{f.label}</p>
                        <p className="text-xs text-muted-foreground">{f.desc}</p>
                      </div>
                    </div>
                    <Switch
                      checked={f.available && flags[f.key]}
                      disabled={!f.available}
                      onCheckedChange={(v) => handleSetFlag(f.key, v)}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Separator />

      <Button variant="outline" size="sm" onClick={signOut} className="w-full">
        <LogOut className="h-4 w-4" />
        {t('auth.logout')}
      </Button>
    </div>
  )
}
