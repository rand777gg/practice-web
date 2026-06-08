import { useAuthStore } from '@/stores/auth-store'
import { useLangStore } from '@/stores/lang-store'
import { useSettingsStore } from '@/stores/settings-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Link } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Languages, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { hasAiConfig, hasMinerUToken, getMinerUModelVersion } from '@/lib/ai'
import { useT } from '@/i18n/use-t'

export function Component() {
  const { t } = useT()
  const { user, profile, signOut } = useAuthStore()
  const { lang, setLang } = useLangStore()
  const { flags, setFlag, offlineMode, setOfflineMode } = useSettingsStore()
  const navigate = useNavigate()

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

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold">{t('settings.title')}</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-6">

      <Card className="border-0 shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t('settings.account')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t('auth.email')}</span>
            <span className="text-sm">{user.email}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t('users.role')}</span>
            <Badge variant={profile?.role === 'admin' ? 'default' : 'secondary'} className="text-xs">
              {profile?.role === 'admin' ? t('users.admin') : t('users.user')}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-none">
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

      <Card className="border-0 shadow-none">
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

        <div className="space-y-6">
          <Card className="border-0 shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t('settings.aiFeatures')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">{t('settings.aiDesc')}</p>
          <div className="space-y-3">
            {aiFeatures.map((f) => (
              <div key={f.key} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm">{f.label}</p>
                  <p className="text-xs text-muted-foreground">{f.desc}</p>
                </div>
                <Switch
                  checked={f.available && flags[f.key]}
                  disabled={!f.available}
                  onCheckedChange={(v) => setFlag(f.key, v)}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

        </div>
      </div>

      {profile?.role === 'admin' && (
        <>
          <Separator />
          <Button variant="outline" size="sm" asChild className="w-full gap-2">
            <Link to="/admin/ai">
              <ExternalLink className="h-4 w-4" />
              {t('settings.aiManagement')}
            </Link>
          </Button>
        </>
      )}
      <Separator />

      <Button variant="outline" size="sm" onClick={signOut} className="w-full">
        <LogOut className="h-4 w-4" />
        {t('auth.logout')}
      </Button>
    </div>
  )
}
