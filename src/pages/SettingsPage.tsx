import { useState, useEffect } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useLangStore } from '@/stores/lang-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useThemeStore } from '@/stores/theme-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'

import { Badge } from '@radix-ui/themes'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Icon } from '@iconify/react'
import { ArrowLeft, ExternalLink, Languages, LogOut, Sparkles, Dice6, Check, Trash2, Unlink, Pencil, X, ChevronDown, Code2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { hasAiConfig, hasMinerUToken, getMinerUModelVersion } from '@/lib/ai'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n/use-t'
import { langDisplay, LANG_ICONS } from '@/lib/lang-names'

const ADJECTIVES = ['勤奋的', '勇敢的', '机智的', '冷静的', '乐观的', '执着的', '专注的', '敏捷的', '沉稳的', '好奇的']
const NOUNS = ['学者', '探索者', '思考者', '求知者', '攀登者', '追光者', '行者', '旅人', '书虫', '夜猫']
function randomNickname() {
  return `${ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]}${NOUNS[Math.floor(Math.random() * NOUNS.length)]}${Math.floor(Math.random() * 1000)}`
}

export function Component() {
  const { t } = useT()
  const { user, profile, signOut, refreshProfile } = useAuthStore()
  const { lang, setLang } = useLangStore()
  const { flags, setFlag, offlineMode, setOfflineMode, darkCodeTheme, lightCodeTheme, setCodeTheme } = useSettingsStore()
  const siteTheme = useThemeStore((s) => s.theme)
  const codeTheme = siteTheme === 'dark' ? darkCodeTheme : lightCodeTheme
  const navigate = useNavigate()
  const [previewLang, setPreviewLang] = useState('javascript')
  const [aiGlow, setAiGlow] = useState(false)
  const [nickEditing, setNickEditing] = useState(false)
  const [nickValue, setNickValue] = useState(profile?.nickname || '')
  const [nickSaving, setNickSaving] = useState(false)
  const [aiNickLoading, setAiNickLoading] = useState(false)
  const [linkingGitHub, setLinkingGitHub] = useState(false)
  const [githubLinkError, setGithubLinkError] = useState('')
  const [unlinkingGitHub, setUnlinkingGitHub] = useState(false)
  const [linkSuccess, setLinkSuccess] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const isGitHubLinked = user?.app_metadata?.provider === 'github' || user?.identities?.some((i: any) => i.provider === 'github')
  const hasMultipleIdentities = user?.identities && user.identities.length > 1

  // Detect OAuth redirect result
  useEffect(() => {
    const storedId = sessionStorage.getItem('pre_oauth_user_id')
    const hash = window.location.hash

    if (hash) {
      const params = new URLSearchParams(hash.replace(/^#/, ''))
      const error = params.get('error')
      const desc = params.get('error_description')
      if (error) {
        const raw = (desc || error).toLowerCase()
        setGithubLinkError(
          raw.includes('already linked') || raw.includes('already registered')
            ? t('auth.githubAlreadyRegistered')
            : (desc || error)
        )
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      }
      sessionStorage.removeItem('pre_oauth_user_id')
      return
    }

    // Detect post-redirect: either linked successfully or account switched
    if (storedId && user) {
      sessionStorage.removeItem('pre_oauth_user_id')
      if (storedId !== user.id) {
        setGithubLinkError(t('auth.githubAlreadyBound'))
      } else if (isGitHubLinked) {
        setLinkSuccess(true)
        setTimeout(() => setLinkSuccess(false), 4000)
      }
    }
  }, [user?.id, isGitHubLinked])

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
              <div className="flex items-center justify-between gap-3 mb-3">
                <p className="text-xs text-muted-foreground">{t('settings.accountDesc')}</p>
                <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 text-xs shrink-0">
                      <LogOut className="h-3.5 w-3.5" />
                      {t('auth.logout')}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogTitle>确认退出</AlertDialogTitle>
                    <AlertDialogDescription>
                      确定要退出登录吗？
                    </AlertDialogDescription>
                    <div className="flex gap-3 mt-4 justify-end">
                      <AlertDialogCancel asChild>
                        <Button variant="outline" size="sm">取消</Button>
                      </AlertDialogCancel>
                      <Button variant="default" size="sm" onClick={() => {
                        setLogoutOpen(false)
                        navigate('/farewell')
                      }}>
                        确认退出
                      </Button>
                    </div>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
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
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setNickEditing(false)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span
                            className="cursor-pointer hover:underline underline-offset-2"
                            onClick={() => { setNickValue(profile?.nickname || ''); setNickEditing(true) }}
                          >
                            {profile?.nickname || <span className="text-muted-foreground italic">{t('settings.nicknamePlaceholder')}</span>}
                          </span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            onClick={() => { setNickValue(profile?.nickname || ''); setNickEditing(true) }}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </div>
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
                        <div className="flex items-center gap-2">
                          <Badge color="green" variant="soft" radius="full">{t('auth.githubBound')}</Badge>
                          {hasMultipleIdentities && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[10px] text-muted-foreground hover:text-destructive"
                              disabled={unlinkingGitHub}
                              onClick={async () => {
                                setUnlinkingGitHub(true)
                                setGithubLinkError('')
                                const { error } = await supabase.rpc('unlink_oauth_identity', {
                                  p_provider: 'github',
                                  p_user_id: user!.id,
                                })
                                if (error) {
                                  setGithubLinkError(error.message || '解绑失败')
                                } else {
                                  const { data: { session } } = await supabase.auth.getSession()
                                  if (session) {
                                    await supabase.auth.refreshSession({ refresh_token: session.refresh_token })
                                  }
                                  window.location.reload()
                                }
                                setUnlinkingGitHub(false)
                              }}
                            >
                              <Unlink className="h-3 w-3 mr-0.5" />
                              解绑
                            </Button>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            disabled={linkingGitHub}
                            onClick={async () => {
                              setGithubLinkError('')
                              setLinkSuccess(false)
                              setLinkingGitHub(true)
                              sessionStorage.setItem('pre_oauth_user_id', user!.id)
                              const { error } = await supabase.auth.linkIdentity({
                                provider: 'github',
                                options: { redirectTo: window.location.origin + '/settings' },
                              })
                              if (error) {
                                setGithubLinkError(error.message?.includes('already registered') || error.message?.includes('already linked')
                                  ? t('auth.githubAlreadyRegistered')
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
                          {linkSuccess && (
                            <p className="text-xs text-green-600 dark:text-green-400">{t('auth.githubBindSuccess')}</p>
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
              <CardTitle className="text-sm">{t('settings.preferences')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground mb-2">{t('settings.language')}</p>
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
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2">代码高亮主题</p>
                <div className="mb-2">
                  <CodePreview theme={codeTheme} lang={previewLang} />
                </div>
                <div className="flex gap-2 flex-wrap">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7">
                        <Code2 className="h-3.5 w-3.5" />
                        {codeTheme}
                        <ChevronDown className="h-3 w-3 ml-1 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>◼ 深色主题</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
                          {DARK_THEMES.map((id) => (
                            <DropdownMenuItem key={id} onClick={() => setCodeTheme(id)}>
                              {id}
                              {codeTheme === id && <Check className="h-4 w-4 ml-auto" />}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>◻ 浅色主题</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
                          {LIGHT_THEMES.map((id) => (
                            <DropdownMenuItem key={id} onClick={() => setCodeTheme(id)}>
                              {id}
                              {codeTheme === id && <Check className="h-4 w-4 ml-auto" />}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1 text-xs h-7">
                        <LangIcon id={previewLang} className="h-3.5 w-3.5" />
                        {langDisplay(previewLang)}
                        <ChevronDown className="h-3 w-3 ml-1 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                      {PREVIEW_LANGS.map((l) => (
                        <DropdownMenuItem key={l} onClick={() => setPreviewLang(l)}>
                          <LangIcon id={l} className="h-3.5 w-3.5 mr-1.5" />
                          {langDisplay(l)}
                          {previewLang === l && <Check className="h-4 w-4 ml-auto" />}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
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

          <Card className="border-destructive/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-destructive">危险区域</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                注销账号后，你的所有数据（包括答题记录、收藏、笔记等）将被永久删除且无法恢复。请谨慎操作。
              </p>
              <AlertDialog open={deleteOpen} onOpenChange={(open) => {
                if (deleting && !open) return
                setDeleteOpen(open)
              }}>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30">
                    <Trash2 className="h-3.5 w-3.5" />
                    注销账号
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogTitle>确认注销账号</AlertDialogTitle>
                  <AlertDialogDescription>
                    此操作将永久删除你的账号及所有数据（包括答题记录、收藏、笔记等），且无法恢复。确定要继续吗？
                  </AlertDialogDescription>
                  <div className="flex gap-3 mt-4 justify-end">
                    <AlertDialogCancel asChild>
                      <Button variant="outline" size="sm" disabled={deleting}>取消</Button>
                    </AlertDialogCancel>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={deleting}
                      onClick={async () => {
                        setDeleting(true)
                        try { await supabase.functions.invoke('delete-account') } catch { /* ignore */ }
                        setDeleteOpen(false)
                        signOut()
                      }}
                    >
                      {deleting ? '注销中...' : '确认注销'}
                    </Button>
                  </div>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

const DARK_THEMES = [
  'andromeeda', 'aurora-x', 'ayu-dark', 'ayu-mirage', 'catppuccin-frappe',
  'catppuccin-macchiato', 'catppuccin-mocha', 'dark-plus', 'dracula', 'dracula-soft',
  'everforest-dark', 'github-dark', 'github-dark-default', 'github-dark-dimmed',
  'github-dark-high-contrast', 'gruvbox-dark-hard', 'gruvbox-dark-medium',
  'gruvbox-dark-soft', 'horizon', 'horizon-bright', 'houston', 'kanagawa-dragon',
  'kanagawa-wave', 'laserwave', 'material-theme', 'material-theme-darker',
  'material-theme-ocean', 'material-theme-palenight', 'min-dark', 'monokai',
  'night-owl', 'nord', 'one-dark-pro', 'plastic', 'poimandres', 'red',
  'rose-pine', 'rose-pine-moon', 'slack-dark', 'slack-ochin', 'solarized-dark',
  'synthwave-84', 'tokyo-night', 'vesper', 'vitesse-black', 'vitesse-dark',
]

const LIGHT_THEMES = [
  'ayu-light', 'catppuccin-latte', 'everforest-light', 'github-light',
  'github-light-default', 'github-light-high-contrast', 'gruvbox-light-hard',
  'gruvbox-light-medium', 'gruvbox-light-soft', 'kanagawa-lotus', 'light-plus',
  'material-theme-lighter', 'min-light', 'night-owl-light', 'one-light',
  'rose-pine-dawn', 'snazzy-light', 'solarized-light', 'vitesse-light',
]

function CodePreview({ theme, lang }: { theme: string; lang: string }) {
  const [html, setHtml] = useState<string | null>(null)

  const code = LANGS[lang] || LANGS['javascript']

  useEffect(() => {
    let cancelled = false
    import('shiki').then(async ({ createHighlighter }) => {
      const hl = await createHighlighter({
        themes: ['github-dark', 'github-light'],
        langs: ['javascript'],
      })
      if (cancelled) return
      try {
        const loadedLangs = await hl.getLoadedLanguages()
        if (!loadedLangs.includes(lang)) {
          await hl.loadLanguage(lang as any)
        }
        const loadedThemes = await hl.getLoadedThemes()
        if (!loadedThemes.includes(theme)) {
          await hl.loadTheme(theme)
        }
        const h = hl.codeToHtml(code, { lang, theme })
        setHtml(h)
      } catch {
        setHtml(`<pre><code>${code}</code></pre>`)
      }
    })
    return () => { cancelled = true }
  }, [theme, lang, code])

  return (
    <div className="relative rounded-lg overflow-hidden text-[11px] leading-relaxed [&_pre]:!bg-muted/50 [&_pre]:p-2.5 [&_pre]:pt-7 [&_pre]:overflow-x-auto [&_pre]:!border [&_pre]:!rounded-lg [&_code]:!text-[11px]">
      <span className="absolute top-2 right-2.5 text-[10px] text-muted-foreground/60 font-mono z-10 pointer-events-none">
        {langDisplay(lang)}
      </span>
      {html ? (
        <div dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre className="p-2.5 pt-7 bg-muted/50 rounded-lg border"><code>{code}</code></pre>
      )}
    </div>
  )
}

const PREVIEW_LANGS = ['javascript', 'typescript', 'python', 'java', 'cpp', 'sql', 'css', 'html', 'bash', 'json']

const LANGS: Record<string, string> = {
  javascript: `function fibonacci(n) {
  if (n <= 1) return n
  return fibonacci(n - 1) + fibonacci(n - 2)
}
console.log(fibonacci(10)) // 55`,

  typescript: `interface User {
  name: string
  age: number
}
function greet(u: User): string {
  return \`Hello, \${u.name}!\`
}
console.log(greet({ name: 'Alice', age: 30 }))`,

  python: `def fibonacci(n: int) -> int:
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

print(fibonacci(10))  # 55`,

  java: `public class Main {
  static int fib(int n) {
    if (n <= 1) return n;
    return fib(n - 1) + fib(n - 2);
  }
  public static void main(String[] args) {
    System.out.println(fib(10)); // 55
  }
}`,

  cpp: `#include <iostream>
using namespace std;

int fib(int n) {
  if (n <= 1) return n;
  return fib(n - 1) + fib(n - 2);
}

int main() {
  cout << fib(10) << endl; // 55
  return 0;
}`,

  sql: `SELECT u.name, COUNT(o.id) AS orders
FROM users u
JOIN orders o ON o.user_id = u.id
WHERE u.created_at > '2024-01-01'
GROUP BY u.name
HAVING COUNT(o.id) > 5
ORDER BY orders DESC
LIMIT 10;`,

  css: `.card {
  border-radius: 8px;
  padding: 1rem;
  background: var(--bg);
  transition: box-shadow 0.2s;
}
.card:hover {
  box-shadow: 0 2px 12px rgba(0,0,0,0.12);
}`,

  html: `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <title>示例</title>
</head>
<body>
  <h1>Hello World</h1>
</body>
</html>`,

  bash: `#!/bin/bash
echo "Building..."
npm run build
echo "Deploying..."
aws s3 sync dist/ s3://bucket/ \\
  --endpoint-url \$R2_ENDPOINT`,

  json: `{
  "name": "practice-web",
  "version": "1.10.1",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build"
  }
}`,
}

function LangIcon({ id, className }: { id: string; className?: string }) {
  const icon = LANG_ICONS[id]
  if (!icon) return <Code2 className={className} />
  return <Icon icon={icon} className={className} />
}

const SAMPLE_CODE = `def function(x):
return x * 2`
