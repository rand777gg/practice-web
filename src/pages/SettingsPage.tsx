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
import { AlertDialog, Button as RadixButton, Flex } from '@radix-ui/themes'
import { ArrowLeft, ExternalLink, Languages, LogOut, Sparkles, Dice6, Check, Trash2 } from 'lucide-react'
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
  const [linkingGitHub, setLinkingGitHub] = useState(false)
  const [githubLinkError, setGithubLinkError] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const isGitHubLinked = user?.app_metadata?.provider === 'github' || user?.identities?.some((i: any) => i.provider === 'github')

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
                    <td className="py-1.5 pr-4 text-muted-foreground">GitHub</td>
                    <td className="py-1.5">
                      {isGitHubLinked ? (
                        <Badge color="green" variant="soft" radius="full">{t('auth.githubBound')}</Badge>
                      ) : (
                        <div className="space-y-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            disabled={linkingGitHub}
                            onClick={async () => {
                              setGithubLinkError('')
                              setLinkingGitHub(true)
                              const { error } = await supabase.auth.signInWithOAuth({
                                provider: 'github',
                                options: { redirectTo: window.location.origin + '/settings' },
                              })
                              if (error) {
                                setGithubLinkError(error.message?.includes('already registered') || error.message?.includes('already linked')
                                  ? '该 GitHub 账号已注册，请先登录该账号再解绑后重试，或联系管理员'
                                  : error.message)
                              }
                              setLinkingGitHub(false)
                            }}
                          >
                            {linkingGitHub ? (
                              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                            ) : (
                              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
                            )}
                            {t('auth.githubBind')}
                          </Button>
                          {githubLinkError && (
                            <p className="text-xs text-destructive">{githubLinkError}</p>
                          )}
                        </div>
                      )}
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

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={signOut} className="h-8 text-xs flex-1">
          <LogOut className="h-3.5 w-3.5" />
          {t('auth.logout')}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)} className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30">
          <Trash2 className="h-3.5 w-3.5" />
          注销账号
        </Button>
      </div>

      <AlertDialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialog.Content maxWidth="400px">
          <AlertDialog.Title>确认注销账号</AlertDialog.Title>
          <AlertDialog.Description size="2">
            此操作将永久删除你的账号及所有数据（包括答题记录、收藏、笔记等），且无法恢复。确定要继续吗？
          </AlertDialog.Description>
          <Flex gap="3" mt="4" justify="end">
            <AlertDialog.Cancel>
              <RadixButton variant="soft" color="gray" disabled={deleting}>取消</RadixButton>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <RadixButton
                variant="solid"
                color="red"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true)
                  const { error } = await supabase.functions.invoke('delete-account', { body: { user_id: user?.id } })
                  if (error) await signOut()
                  else await signOut()
                  setDeleting(false)
                }}
              >
                {deleting ? '注销中...' : '确认注销'}
              </RadixButton>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </div>
  )
}
