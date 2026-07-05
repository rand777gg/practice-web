import { useState, useEffect } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useLangStore } from '@/stores/lang-store'
import { useAiStore } from '@/stores/ai-store'
import { useSettingsStore, EYE_CARE_PALETTES, FONT_OPTIONS, FONT_WEIGHTS, BOTTOM_NAV_TABS } from '@/stores/settings-store'
import { useThemeStore } from '@/stores/theme-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'

import { Badge } from '@radix-ui/themes'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
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
 DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu'
import { ProviderIcon } from '@/components/ui/provider-icon'
import { Icon } from '@iconify/react'
import { ArrowLeft, ExternalLink, Languages, LogOut, Sparkles, Dice6, Check, Trash2, Unlink, Pencil, X, ChevronDown, Code2, RotateCcw } from 'lucide-react'
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

function preloadAllFonts() {
 FONT_OPTIONS.forEach((opt) => {
  if (!opt.google) return
  const id = `font-preview-${opt.value.replace(/\s+/g, '-')}`
  if (document.getElementById(id)) return
  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${opt.google}:wght@${opt.weights}&display=swap`
  document.head.appendChild(link)
 })
}

export function Component() {
 const { t } = useT()
 const { user, profile, signOut, refreshProfile } = useAuthStore()
 const { lang, setLang } = useLangStore()
 const { flags, setFlag, offlineMode, setOfflineMode, eyeCare, setEyeCare, darkCodeTheme, lightCodeTheme, setCodeTheme, fontFamily, setFontFamily, fontSize, setFontSize, fontWeight, setFontWeight, noteRecognitionMode, setNoteRecognitionMode, bottomNavTabs, setBottomNavTabs } = useSettingsStore()
 const providers = useAiStore((s) => s.providers)
 const activeProvider = providers.find((p) => p.enabled && p.models.some((m) => m.enabled))
 const currentPalette = EYE_CARE_PALETTES.find((p) => p.value === eyeCare) ?? EYE_CARE_PALETTES[0]
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
 const [resetDataOpen, setResetDataOpen] = useState(false)
 const [resettingData, setResettingData] = useState(false)
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
  { key: 'analysis' as const, label: t('settings.aiAnalysis'), desc: t('settings.aiAnalysisDesc'), available: aiConfigured },
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
  <div className="space-y-6">
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
       <CardTitle className="text-sm">界面设置</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
       {/* Eye care — top */}
       <div className="flex items-center justify-between">
        <div className="min-w-0 mr-2">
         <p className="text-sm">{t('settings.eyeCare')}</p>
         <p className="text-xs text-muted-foreground">{t('settings.eyeCareDesc')}</p>
        </div>
        <DropdownMenu>
         <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs shrink-0" disabled={siteTheme === 'dark'}>
           <span className="w-3.5 h-3.5 rounded-full border border-border/50 shrink-0" style={{ background: currentPalette.preview }} />
           {currentPalette.label}
           <ChevronDown className="h-3 w-3 opacity-50" />
          </Button>
         </DropdownMenuTrigger>
         <DropdownMenuContent align="end">
          {EYE_CARE_PALETTES.map((p) => (
           <DropdownMenuItem key={p.value} onClick={() => setEyeCare(p.value)}>
            <span className="w-4 h-4 rounded-full border border-border/50 mr-2 shrink-0" style={{ background: p.preview }} />
            {p.label}
            {eyeCare === p.value && <Check className="h-4 w-4 ml-auto" />}
           </DropdownMenuItem>
          ))}
         </DropdownMenuContent>
        </DropdownMenu>
       </div>

       <div className="border-t pt-4" />

       {/* Font family + weight row */}
       <div className="flex gap-4">
        <div className="flex-1">
         <p className="text-xs text-muted-foreground mb-2">字体</p>
         <DropdownMenu onOpenChange={(open) => { if (open) preloadAllFonts() }}>
          <DropdownMenuTrigger asChild>
           <Button variant="outline" size="sm" className="gap-1.5 text-xs w-full justify-between">
            <span style={{ fontFamily: fontFamily === 'system' ? undefined : `'${fontFamily}', system-ui, sans-serif` }}>
             {FONT_OPTIONS.find((f) => f.value === fontFamily)?.label ?? fontFamily}
            </span>
            <ChevronDown className="h-3 w-3 opacity-50" />
           </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
           {FONT_OPTIONS.map((f) => (
            <DropdownMenuItem
             key={f.value}
             onClick={() => setFontFamily(f.value)}
             style={{ fontFamily: f.value === 'system' ? undefined : `'${f.value}', system-ui, sans-serif` }}
            >
             {f.label}
             {fontFamily === f.value && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
           ))}
          </DropdownMenuContent>
         </DropdownMenu>
        </div>
        <div className="flex-1">
         <p className="text-xs text-muted-foreground mb-2">粗细</p>
         <DropdownMenu>
          <DropdownMenuTrigger asChild>
           <Button variant="outline" size="sm" className="gap-1.5 text-xs w-full justify-between">
            <span style={{ fontWeight }}>
             {FONT_WEIGHTS.find((w) => w.value === fontWeight)?.label ?? '常规'}
            </span>
            <ChevronDown className="h-3 w-3 opacity-50" />
           </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
           {FONT_WEIGHTS.map((w) => (
            <DropdownMenuItem
             key={w.value}
             onClick={() => setFontWeight(w.value)}
             style={{ fontWeight: w.value }}
            >
             {w.label}
             {fontWeight === w.value && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
           ))}
          </DropdownMenuContent>
         </DropdownMenu>
        </div>
       </div>

       {/* Font size slider */}
       <div>
        <p className="text-xs text-muted-foreground mb-2">字号 <span className="tabular-nums font-medium text-foreground">{fontSize}px</span></p>
        <Slider min={13} max={22} step={1} value={fontSize} onChange={setFontSize} />
       </div>

       {/* Font preview */}
       <div
        className="rounded-lg border bg-muted/20 p-3 text-sm leading-relaxed"
        style={{
         fontFamily: fontFamily === 'system' ? undefined : `'${fontFamily}', system-ui, sans-serif`,
         fontSize: `${fontSize}px`,
         fontWeight,
        }}
       >
        敏捷的棕色狐狸跳过懒狗。<br />
        The quick brown fox jumps over the lazy dog.<br />
        0123456789 · 敏捷的棕色狐狸
       </div>

       <div className="border-t pt-4" />

       {/* Code theme */}
       <div>
        <p className="text-xs text-muted-foreground mb-2">代码高亮主题</p>
        <CodePreview theme={codeTheme} lang={previewLang} />
        <div className="flex gap-2 flex-wrap justify-end mt-2">
         <DropdownMenu>
          <DropdownMenuTrigger asChild>
           <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7">
            <Code2 className="h-3.5 w-3.5" />
            {codeTheme}
            <ChevronDown className="h-3 w-3 ml-1 opacity-50" />
           </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
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
          <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
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
        <p className="text-xs text-muted-foreground mb-2">笔记图片识别方式</p>
        <div className="flex rounded-md border border-input bg-background w-fit">
         {(['mineru', 'ai'] as const).map((mode) => (
          <button
           key={mode}
           type="button"
           onClick={() => setNoteRecognitionMode(mode)}
           className={`px-3 py-1.5 text-xs font-medium transition-colors first:rounded-l-md last:rounded-r-md ${
            noteRecognitionMode === mode
             ? 'bg-primary text-primary-foreground'
             : 'text-muted-foreground hover:text-foreground'
           }`}
          >
           {mode === 'mineru' ? 'MinerU 精准' : 'AI 多模态'}
          </button>
         ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
         {noteRecognitionMode === 'mineru' ? '使用 MinerU VLM 模型，支持公式、表格、OCR' : '使用自配置的多模态大模型进行识别'}
        </p>
        {noteRecognitionMode === 'ai' && (
         <div className="mt-2 p-3 rounded-lg border bg-muted/30 flex items-center gap-3">
          {activeProvider ? (
           <>
            <ProviderIcon provider={activeProvider.id} size={28} type="avatar" />
            <div className="min-w-0">
             <p className="text-sm font-medium">{activeProvider.name}</p>
             <p className="text-[10px] text-muted-foreground truncate">
              {activeProvider.models.filter((m) => m.enabled).map((m) => m.name).join('、') || '未启用模型'}
             </p>
            </div>
            <Button variant="ghost" size="sm" className="shrink-0 text-xs" asChild>
             <Link to="/admin/ai">管理</Link>
            </Button>
           </>
          ) : (
           <div className="flex items-center gap-3 w-full">
            <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center">
             <Sparkles className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground flex-1">未启用多模态 AI 模型</p>
            <Button variant="outline" size="sm" className="shrink-0 text-xs" asChild>
             <Link to="/admin/ai">前往配置</Link>
            </Button>
           </div>
          )}
         </div>
        )}
       </div>
       <div className="flex items-center justify-between">
        <div>
         <p className="text-sm">{t('settings.offlineMode')}</p>
         <p className="text-xs text-muted-foreground">{t('settings.offlineModeDesc')}</p>
        </div>
        <Switch checked={offlineMode} onCheckedChange={setOfflineMode} />
       </div>
       <div className="pt-2 border-t">
        <p className="text-sm mb-1">{t('settings.bottomNav')}</p>
        <p className="text-xs text-muted-foreground mb-3">{t('settings.bottomNavDesc')}</p>
        <div className="space-y-2">
         {BOTTOM_NAV_TABS.map((tab) => {
          const checked = bottomNavTabs.includes(tab.key)
          return (
           <div key={tab.key} className="flex items-center justify-between">
            <span className="text-sm">{lang === 'en' ? tab.labelEn : tab.labelZh}</span>
            <Switch
             checked={checked}
             disabled={bottomNavTabs.length <= 1 && checked}
             onCheckedChange={() => {
              if (checked) {
               setBottomNavTabs(bottomNavTabs.filter((k) => k !== tab.key))
              } else {
               setBottomNavTabs([...bottomNavTabs, tab.key])
              }
             }}
            />
           </div>
          )
         })}
        </div>
       </div>
      </CardContent>
     </Card>

     <Card className="border-destructive/30">
      <CardHeader className="pb-2">
       <CardTitle className="text-sm text-destructive">危险区域</CardTitle>
      </CardHeader>
      <CardContent>
       <div className="flex gap-2">
        <div>
         <AlertDialog open={resetDataOpen} onOpenChange={(open) => {
          if (resettingData && !open) return
          setResetDataOpen(open)
         }}>
          <AlertDialogTrigger asChild>
           <Button variant="outline" size="sm" className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30">
            <RotateCcw className="h-3.5 w-3.5" />
            重置做题数据
           </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
           <AlertDialogTitle>确认重置做题数据</AlertDialogTitle>
           <AlertDialogDescription>
            此操作将删除你的所有答题记录、考试记录和笔记，且无法恢复。收藏和账号信息不受影响。确定要继续吗？
           </AlertDialogDescription>
           <div className="flex gap-3 mt-4 justify-end">
            <AlertDialogCancel asChild>
             <Button variant="outline" size="sm" disabled={resettingData}>取消</Button>
            </AlertDialogCancel>
            <Button
             variant="destructive"
             size="sm"
             disabled={resettingData}
             onClick={async () => {
              setResettingData(true)
              try {
               await supabase.from('user_answers').delete().eq('user_id', user!.id)
               await supabase.from('exam_sessions').delete().eq('user_id', user!.id)
              } catch { /* ignore */ }
              setResettingData(false)
              setResetDataOpen(false)
             }}
            >
             {resettingData ? '重置中...' : '确认重置'}
            </Button>
           </div>
          </AlertDialogContent>
         </AlertDialog>
        </div>
        <div>
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
        </div>
       </div>
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
     await hl.loadTheme(theme as any)
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

const PREVIEW_LANGS = [
 'javascript', 'typescript', 'python', 'java', 'cpp', 'c',
 'go', 'rust',
 'sql', 'css', 'html', 'bash',
 'json', 'yaml', 'xml', 'markdown', 'latex',
 'dockerfile', 'graphql', 'ini', 'toml', 'makefile', 'nginx', 'diff',
]

const LANGS: Record<string, string> = {
 javascript: `function fibonacci(n) {\n if (n <= 1) return n\n return fibonacci(n - 1) + fibonacci(n - 2)\n}\nconsole.log(fibonacci(10)) // 55`,
 typescript: `interface User {\n name: string\n age: number\n}\nfunction greet(u: User): string {\n return \`Hello, \${u.name}!\`\n}`,
 python: `def fibonacci(n: int) -> int:\n  if n <= 1:\n    return n\n  return fibonacci(n - 1) + fibonacci(n - 2)\n\nprint(fibonacci(10))`,
 java: `public class Main {\n static int fib(int n) {\n  if (n <= 1) return n;\n  return fib(n - 1) + fib(n - 2);\n }\n public static void main(String[] a) {\n  System.out.println(fib(10));\n }\n}`,
 cpp: `#include <iostream>\nusing namespace std;\nint fib(int n) {\n if (n <= 1) return n;\n return fib(n-1)+fib(n-2);\n}\nint main() {\n cout << fib(10) << endl;\n}`,
 c: `#include <stdio.h>\nint fib(int n) {\n if (n <= 1) return n;\n return fib(n-1)+fib(n-2);\n}\nint main() {\n printf("%d\\n", fib(10));\n return 0;\n}`,
 csharp: `class Program {\n static int Fib(int n) {\n  if (n <= 1) return n;\n  return Fib(n-1)+Fib(n-2);\n }\n static void Main() {\n  Console.WriteLine(Fib(10));\n }\n}`,
 go: `package main\nimport "fmt"\nfunc fib(n int) int {\n if n <= 1 { return n }\n return fib(n-1) + fib(n-2)\n}\nfunc main() {\n fmt.Println(fib(10))\n}`,
 rust: `fn fib(n: u32) -> u32 {\n  if n <= 1 { n } else { fib(n-1) + fib(n-2) }\n}\nfn main() {\n  println!("{}", fib(10));\n}`,
 swift: `func fib(_ n: Int) -> Int {\n  n <= 1 ? n : fib(n-1) + fib(n-2)\n}\nprint(fib(10))`,
 kotlin: `fun fib(n: Int): Int = if (n <= 1) n else fib(n-1) + fib(n-2)\nfun main() = println(fib(10))`,
 dart: `int fib(int n) => n <= 1 ? n : fib(n-1) + fib(n-2);\nvoid main() => print(fib(10));`,
 ruby: `def fib(n)\n n <= 1 ? n : fib(n-1) + fib(n-2)\nend\nputs fib(10)`,
 php: `<?php\nfunction fib($n) {\n return $n <= 1 ? $n : fib($n-1) + fib($n-2);\n}\necho fib(10);`,
 scala: `def fib(n: Int): Int = if n <= 1 then n else fib(n-1) + fib(n-2)\n@main def run() = println(fib(10))`,
 haskell: `fib :: Int -> Int\nfib n | n <= 1  = n\n   | otherwise = fib (n-1) + fib (n-2)\nmain = print (fib 10)`,
 lua: `function fib(n)\n if n <= 1 then return n end\n return fib(n-1) + fib(n-2)\nend\nprint(fib(10))`,
 sql: `SELECT u.name, COUNT(o.id) AS orders\nFROM users u\nJOIN orders o ON o.user_id = u.id\nWHERE u.created_at > '2024-01-01'\nGROUP BY u.name\nHAVING COUNT(o.id) > 5\nORDER BY orders DESC\nLIMIT 10;`,
 css: `.card {\n border-radius: 8px;\n padding: 1rem;\n background: var(--bg);\n transition: box-shadow 0.2s;\n}\n.card:hover {\n box-shadow: 0 2px 12px rgba(0,0,0,0.12);\n}`,
 html: `<!DOCTYPE html>\n<html lang="zh">\n<head>\n <meta charset="UTF-8">\n <title>示例</title>\n</head>\n<body>\n <h1>Hello World</h1>\n</body>\n</html>`,
 bash: `#!/bin/bash\necho "Building..."\nnpm run build\necho "Done!"`,
 powershell: `function Get-Fib($n) {\n if ($n -le 1) { return $n }\n return (Get-Fib ($n-1)) + (Get-Fib ($n-2))\n}\nGet-Fib 10`,
 json: `{\n "name": "practice-web",\n "version": "1.10.1",\n "scripts": {\n  "dev": "vite",\n  "build": "tsc -b && vite build"\n }\n}`,
 yaml: `name: practice-web\nversion: 1.10.1\nscripts:\n dev: vite\n build: tsc -b && vite build`,
 xml: `<?xml version="1.0" encoding="UTF-8"?>\n<project>\n <name>practice-web</name>\n <version>1.10.1</version>\n</project>`,
 markdown: `# Practice Web\n\n刷题网站，支持：\n- 练习模式\n- 考试模式\n- **AI 智能解析**\n\n> 代码高亮由 Shiki 提供`,
 latex: `\\documentclass{article}\n\\begin{document}\n\\title{示例}\n\\author{刷题网}\n\\maketitle\n\\section{介绍}\n这是 \\LaTeX 示例。\n\\end{document}`,
 r: `fib <- function(n) {\n if (n <= 1) n else fib(n-1) + fib(n-2)\n}\ncat(fib(10))`,
 dockerfile: `FROM node:20-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nRUN npm run build\nEXPOSE 3000\nCMD ["node", "dist/server.js"]`,
 graphql: `query GetUser($id: ID!) {\n user(id: $id) {\n  name\n  email\n  posts(first: 10) {\n   title\n  }\n }\n}`,
 ini: `[server]\nhost = 0.0.0.0\nport = 3000\n\n[database]\nurl = postgres://localhost:5432/db`,
 toml: `[package]\nname = "practice-web"\nversion = "1.10.1"\n\n[dependencies]\nreact = "^19.0"\nshiki = "^4.0"`,
 makefile: `build:\n\tnpm run build\n\ndev:\n\tnpm run dev\n\nclean:\n\trm -rf dist node_modules`,
 nginx: `server {\n listen 80;\n server_name practice.rand777.com;\n root /var/www/html;\n index index.html;\n location / {\n  try_files $uri /index.html;\n }\n}`,
 diff: `diff --git a/src/index.ts b/src/index.ts\n@@ -1,5 +1,5 @@\n-import { oldLib } from './old'\n+import { newLib } from './new'\n \n export function main() {\n- return oldLib()\n+ return newLib()\n }`,
 viml: `" Vim configuration\nset number\nset expandtab\nset shiftwidth=2\nset tabstop=2\ncolorscheme tokyo-night`,
}

function LangIcon({ id, className }: { id: string; className?: string }) {
 const icon = LANG_ICONS[id]
 if (!icon) return <Code2 className={className} />
 return <Icon icon={icon} className={className} />
}

