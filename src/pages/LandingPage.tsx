import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Brain,
  CalendarClock,
  CheckCircle2,
  FileCode2,
  Languages,
  ListChecks,
  Moon,
  QrCode,
  RefreshCw,
  Route,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PixelGridBackground } from '@/components/ui/pixel-grid-background'
import { BrandLogo } from '@/components/layout/BrandLogo'
import { LoginForm } from '@/components/login-form'
import { RegisterForm } from '@/components/register-form'
import { useThemeStore } from '@/stores/theme-store'
import {
  AiAnalysisMock,
  AiChatMock,
  ExamPaperMock,
  FeaturedLogos,
  IdeRunMock,
  QuestionDeckMock,
  PracticeSetupMock,
  QuestionTypes,
  RouteStudyMock,
  StatsMock,
} from './LandingMocks'
import { cn } from '@/lib/utils'

const containerCls = 'mx-auto w-full max-w-6xl px-4 sm:px-6'

const featureRows: { icon: ReactNode; title: string; desc: string; points: string[] }[] = [
  {
    icon: <ListChecks className="h-5 w-5" />,
    title: '智能练习',
    desc: '按你的节奏挑题：错得多的多练，还没见过的先学，真正会做的少做。',
    points: [
      '顺序刷题、错题优先、新题优先、随机混合',
      '按学科 / 分类 / 题型 / 知识点多维筛选',
      '收藏、笔记与错题回顾，进度自动保存',
    ],
  },
  {
    icon: <CalendarClock className="h-5 w-5" />,
    title: '模拟考试',
    desc: '像真实考场一样训练节奏，考场上才不会慌。',
    points: [
      '自定题数、时长与出题范围',
      '所见即所得试卷模板，支持定时预约考试',
      '断点续考、倒计时自动交卷与成绩分析报告',
    ],
  },
  {
    icon: <FileCode2 className="h-5 w-5" />,
    title: '编程判题',
    desc: 'LeetCode 风格的在线 IDE，写代码、跑用例、看判定一气呵成。',
    points: [
      '支持 Python / JavaScript / TypeScript / C / C++ / Java',
      '示例与自定义用例即时运行、逐用例判定',
      '平台判题计成绩 + 本地 Judge0 离线自测',
    ],
  },
  {
    icon: <Brain className="h-5 w-5" />,
    title: 'AI 助教',
    desc: '看不懂的题、记不住的知识点，直接问 AI，像有个懂行的学长陪练。',
    points: [
      'PDF / Word / 图片 OCR 智能导入题库',
      '知识点与题目一键 AI 解析',
      '每日学习总结、智能出题与复习计划',
      '真实上岸学长学姐经验分享，正如哈利波特「混血王子」的小小批注，让你少走弯路。',
    ],
  },
  {
    icon: <Sparkles className="h-5 w-5" />,
    title: 'AI 智能解析',
    desc: '上传 PDF / Word / 图片，AI 直接帮你把题目提取成结构化的题，降低录入门槛。',
    points: [
      '支持 PDF / Word / 图片等常见格式',
      '自动识别题目、选项与标准答案',
      '一键生成结构化题目，直接开练',
    ],
  },
  {
    icon: <BarChart3 className="h-5 w-5" />,
    title: '数据看板',
    desc: '努力不会被辜负：刷了多少、错在哪里、该补什么，图表一眼讲清。',
    points: [
      '每日热力图、时间分布、学科正确率',
      '艾宾浩斯遗忘曲线与复习紧迫度',
      '十余种图表全景复盘学习成果',
    ],
  },
  {
    icon: <Route className="h-5 w-5" />,
    title: '学习路线与自习室',
    desc: '有人帮你铺好路，也有人陪你一起走，备考不孤单。',
    points: [
      '分阶段学习路线，路线图实时着色进度',
      '自习室邀请码加入、每日打卡与在线伙伴',
      '精选题库合集，随时组卷开练',
    ],
  },
]

const featureMocks = [
  PracticeSetupMock,
  ExamPaperMock,
  IdeRunMock,
  AiChatMock,
  AiAnalysisMock,
  StatsMock,
  RouteStudyMock,
]

const extraFeatures: { icon: ReactNode; label: string }[] = [
  { icon: <QrCode className="h-4 w-4" />, label: '扫码登录' },
  { icon: <ShieldCheck className="h-4 w-4" />, label: '2FA / Passkey 安全认证' },
  { icon: <Smartphone className="h-4 w-4" />, label: 'PWA 可安装' },
  { icon: <Moon className="h-4 w-4" />, label: '深色 / 护眼模式' },
  { icon: <Languages className="h-4 w-4" />, label: '中英双语' },
  { icon: <RefreshCw className="h-4 w-4" />, label: '跨设备同步' },
]

function FeatureBlock({
  row,
  Mock,
  flip,
}: {
  row: (typeof featureRows)[number]
  Mock: () => ReactNode
  flip: boolean
}) {
  return (
    <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-16">
      <div className={cn('space-y-4', flip && 'lg:order-2')}>
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {row.icon}
          </div>
          <h3 className="text-xl font-bold tracking-tight sm:text-2xl">{row.title}</h3>
        </div>
        <p className="text-sm text-muted-foreground sm:text-base">{row.desc}</p>
        <ul className="space-y-2.5">
          {row.points.map((point) => (
            <li key={point} className="flex gap-2.5 text-sm text-muted-foreground">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={cn('transition-transform duration-300 hover:-translate-y-1', flip && 'lg:order-1')}>
        <Mock />
      </div>
    </div>
  )
}

function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) {
          setShown(true)
          io.disconnect()
        }
      }),
      { threshold: 0.1 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div
      ref={ref}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn(
        'transition-all duration-700 ease-out',
        shown ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-[0.98]',
      )}
    >
      {children}
    </div>
  )
}

export function LandingPage() {
  const { theme, toggle } = useThemeStore()
  const heroBgRef = useRef<HTMLDivElement>(null)
  const [authView, setAuthView] = useState<'hero' | 'login' | 'register'>('hero')
  const [formVisible, setFormVisible] = useState(false)
  const [loginStep, setLoginStep] = useState<'credentials' | 'mfa'>('credentials')
  const [pixelReveal, setPixelReveal] = useState(false)

  const openAuth = (mode: 'login' | 'register') => {
    if (authView !== mode) {
      setAuthView(mode)
      setFormVisible(false)
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  useEffect(() => {
    if (authView === 'hero') return
    const t = setTimeout(() => setFormVisible(true), 60)
    return () => clearTimeout(t)
  }, [authView])

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const el = heroBgRef.current
    if (!el) return
    let raf = 0
    const update = () => {
      el.style.transform = `translate3d(0, ${window.scrollY * 0.35}px, 0)`
    }
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  useEffect(() => {
    if (!pixelReveal) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPixelReveal(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pixelReveal])

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className={cn(containerCls, 'flex h-16 items-center justify-between')}>
          <Link to="/" className="flex items-center gap-2.5">
            <BrandLogo size={30} />
            <span className="text-lg font-bold tracking-tight">刷题网</span>
          </Link>
          <nav className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggle}
              aria-label="切换深浅色模式"
              title={theme === 'light' ? '切换为深色' : '切换为浅色'}
            >
              {theme === 'light' ? (
                <Moon className="h-[18px] w-[18px]" />
              ) : (
                <Sun className="h-[18px] w-[18px]" />
              )}
            </Button>
            {!(authView === 'login' && loginStep === 'mfa') && (
              <>
                <Button variant="ghost" size="sm" onClick={() => openAuth('login')}>
                  登录
                </Button>
                <Button size="sm" onClick={() => openAuth('register')}>
                  免费注册
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section
          className={cn('relative overflow-hidden', pixelReveal && 'cursor-pointer')}
          onClick={pixelReveal ? () => setPixelReveal(false) : undefined}
        >
          <PixelGridBackground
            variant="interactive"
            reveal={pixelReveal}
            revealText="PGuide Dev"
            className="absolute inset-0 z-0"
          />
          <div
            aria-hidden
            ref={heroBgRef}
            className="pointer-events-none absolute inset-0 -z-10 will-change-transform"
          >
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.10),transparent_65%)]" />
            <div className="animate-aurora absolute -left-16 top-24 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />
            <div className="animate-aurora-slow absolute right-0 top-10 h-80 w-80 rounded-full bg-violet-500/10 blur-3xl" />
          </div>
          <div
            inert={pixelReveal}
            className={cn(
              containerCls,
              'relative z-10 grid items-center gap-12 pb-20 pt-16 transition-[opacity,transform] duration-500 sm:pb-24 sm:pt-20 lg:grid-cols-2 lg:gap-16',
              pixelReveal && 'pointer-events-none scale-[0.97] opacity-0',
            )}
          >
            {authView === 'hero' ? (
              <div className="space-y-7 text-left">
                <span className="relative inline-flex rounded-full">
                  <span
                    aria-hidden
                    className="ai-ring pointer-events-none absolute -inset-[3px] rounded-full opacity-45 blur-[6px]"
                  />
                  <span className="ai-ring relative inline-flex rounded-full p-[2px]">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-background px-3 py-1 text-xs font-normal">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      AI 驱动的全题型刷题平台
                    </span>
                  </span>
                </span>
                <div className="space-y-3">
                  <h1 className="font-mono text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
                    Because the mountain just
                    <br />
                    <span className="inline-block bg-foreground px-2 text-background">stands there.</span>
                  </h1>
                  <p className="font-mono max-w-md text-sm text-muted-foreground sm:text-base">
                    Open-source, online practice system for humans with AI abilities.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="lg" className="gap-2" onClick={() => openAuth('register')}>
                    免费开始刷题
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button size="lg" variant="outline" onClick={() => openAuth('login')}>
                    已有账号，直接登录
                  </Button>
                </div>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  免下载 · 免费使用 · 手机与桌面端皆可 · 进度自动同步
                </p>
              </div>
            ) : (
              <div className="mx-auto w-full max-w-sm">
                {!(authView === 'login' && loginStep === 'mfa') && (
                  <button
                    type="button"
                    onClick={() => setAuthView('hero')}
                    className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    返回
                  </button>
                )}
                {authView === 'login' ? (
                  <LoginForm visible={formVisible} onSwitchMode={openAuth} onStepChange={setLoginStep} />
                ) : (
                  <RegisterForm visible={formVisible} onSwitchMode={openAuth} />
                )}
              </div>
            )}
            <div className="mx-auto w-full max-w-xl lg:mx-0">
              <div className="relative">
                <div className="animate-float">
                  <QuestionDeckMock />
                </div>
                <button
                  type="button"
                  onClick={() => setPixelReveal(true)}
                  aria-label="显示 PGuide Dev 像素文字"
                  title="点我看看"
                  className="absolute -bottom-5 -right-3 w-20 cursor-pointer transition-transform duration-300 hover:scale-110 active:scale-95 sm:w-28"
                >
                  <img
                    src="https://r2-rpw.pguide.dev/nailong.webp"
                    alt="奶龙"
                    loading="lazy"
                    className="w-full drop-shadow-xl"
                  />
                </button>
              </div>
            </div>
          </div>
          {pixelReveal && (
            <p className="animate-in fade-in pointer-events-none absolute inset-x-0 bottom-6 z-10 text-center font-mono text-xs text-muted-foreground duration-700">
              点击任意处 / 按 Esc 返回
            </p>
          )}
        </section>

        <section className="relative overflow-hidden border-t bg-muted/30">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
            <div className="animate-aurora absolute right-[-4rem] top-28 h-80 w-80 rounded-full bg-blue-500/5 blur-3xl" />
            <div className="animate-aurora-slow absolute left-[-4rem] bottom-16 h-72 w-72 rounded-full bg-primary/5 blur-3xl" />
          </div>
          <div className={cn(containerCls, 'pt-16 sm:pt-20')}>
            <div className="mx-auto max-w-2xl space-y-3 pb-12 text-center sm:pb-16">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                从练习到上岸，一条路径全搞定
              </h2>
              <p className="text-sm text-muted-foreground sm:text-base">
                不空谈，每个功能都配真实界面示例：一边讲怎么用，一边就是它长什么样。
              </p>
            </div>

            <div className="space-y-16 sm:space-y-20">
              {featureRows.map((row, i) => (
                <Reveal key={row.title} delay={i * 90}>
                  <FeatureBlock row={row} Mock={featureMocks[i]} flip={i % 2 === 1} />
                </Reveal>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 border-t pb-16 pt-10 sm:pb-20">
              {extraFeatures.map((extra) => (
                <span
                  key={extra.label}
                  className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-xs text-muted-foreground"
                >
                  <span className="text-primary">{extra.icon}</span>
                  {extra.label}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20">
          <div className={cn(containerCls, 'space-y-8')}>
            <div className="mx-auto max-w-2xl space-y-3 text-center">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">支持的题型</h2>
              <p className="text-sm text-muted-foreground sm:text-base">
                点击左侧题型，实时切换对应的作答示例。
              </p>
            </div>
            <div className="mx-auto w-full max-w-3xl">
              <QuestionTypes />
            </div>
          </div>
        </section>

        <section className="border-t bg-muted/30 py-16 sm:py-20">
          <div className={cn(containerCls, 'space-y-14')}>
            <FeaturedLogos />
          </div>
        </section>
      </main>

      <footer className="border-t bg-muted/40">
        <div className={cn(containerCls, 'flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between')}>
          <div className="flex flex-col gap-2">
            <Link to="/" className="flex items-center gap-2.5">
              <BrandLogo size={26} />
              <span className="font-bold">刷题网</span>
            </Link>
            <p className="text-xs text-muted-foreground">坚持每天练习，用数据看见进步。</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <button type="button" onClick={() => openAuth('login')} className="hover:text-foreground">登录</button>
            <button type="button" onClick={() => openAuth('register')} className="hover:text-foreground">注册</button>
            <Link to="/terms" className="hover:text-foreground">服务条款</Link>
            <Link to="/privacy" className="hover:text-foreground">隐私政策</Link>
          </div>
        </div>
        <div className="border-t">
          <div className={cn(containerCls, 'py-4 text-center text-xs text-muted-foreground')}>
            © {new Date().getFullYear()} 刷题网 · Practice Web
          </div>
        </div>
      </footer>
    </div>
  )
}
