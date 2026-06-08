import { useAuthStore } from '@/stores/auth-store'
import { useLangStore } from '@/stores/lang-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, Languages, LogOut, CheckCircle, XCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { hasAiConfig, hasMinerUToken, getMinerUModelVersion } from '@/lib/ai'
import { useT } from '@/i18n/use-t'

export function Component() {
  const { t } = useT()
  const { user, profile, signOut } = useAuthStore()
  const { lang, setLang } = useLangStore()
  const navigate = useNavigate()

  if (!user) return null

  const aiEnabled = hasAiConfig()
  const mineruEnabled = hasMinerUToken()
  const mineruModel = getMinerUModelVersion()

  const aiFeatures = [
    { key: 'exam', label: t('settings.aiExam'), desc: t('settings.aiExamDesc'), ok: aiEnabled },
    { key: 'summary', label: t('settings.aiSummary'), desc: t('settings.aiSummaryDesc'), ok: aiEnabled },
    { key: 'suggestions', label: t('settings.aiSuggestions'), desc: t('settings.aiSuggestionsDesc'), ok: aiEnabled },
    { key: 'mineru', label: t('settings.aiMineru'), desc: t('settings.aiMineruDesc').replace('{model}', mineruModel), ok: mineruEnabled },
  ]

  return (
    <div className="space-y-6 max-w-xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold">{t('settings.title')}</h1>
      </div>

      {/* User info */}
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

      {/* Language */}
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

      {/* AI features */}
      <Card className="border-0 shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t('settings.aiFeatures')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">{t('settings.aiDesc')}</p>
          <div className="space-y-2">
            {aiFeatures.map((f) => (
              <div key={f.key} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm">{f.label}</p>
                  <p className="text-xs text-muted-foreground">{f.desc}</p>
                </div>
                {f.ok ? (
                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Logout */}
      <Button variant="outline" size="sm" onClick={signOut} className="w-full">
        <LogOut className="h-4 w-4" />
        {t('auth.logout')}
      </Button>
    </div>
  )
}
