import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BrandLogo } from '@/components/layout/BrandLogo'
import { useThemeStore } from '@/stores/theme-store'
import {
  AiAnalysisMock,
  AiChatMock,
  ExamPaperMock,
  FeaturedLogos,
  IdeRunMock,
  PracticeSessionMock,
  PracticeSetupMock,
  QuestionTypes,
  RouteStudyMock,
  StatsGrid,
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
}: {
  row: (typeof featureRows)[number]
  Mock: () => ReactNode
}) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div className="space-y-4">
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
      <div className="h-[420px] overflow-y-auto">
        <Mock />
      </div>
    </div>
  )
}

function Reveal({ children }: { children: ReactNode }) {
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
            <Button asChild variant="ghost" size="sm">
              <Link to="/login">登录</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/register">
                免费注册
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.10),transparent_65%)]"
          />
          <div className={cn(containerCls, 'grid items-center gap-12 pb-20 pt-16 sm:pb-24 sm:pt-20 lg:grid-cols-2 lg:gap-16')}>
            <div className="space-y-7 text-left">
              <Badge variant="outline" className="gap-1.5 rounded-full px-3 py-1 text-xs font-normal">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                AI 驱动的全题型刷题平台
              </Badge>
              <div className="space-y-3">
                <h1 className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
                  Because mountain just
                  <br />
                  <span className="inline-block bg-foreground px-2 text-background">stands there.</span>
                </h1>
                <p className="max-w-md text-sm text-muted-foreground sm:text-base">
                  Open-source, online practice system for humans with AI abilities.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button asChild size="lg" className="gap-2">
                  <Link to="/register">
                    免费开始刷题
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/login">已有账号，直接登录</Link>
                </Button>
              </div>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                免下载 · 免费使用 · 手机与桌面端皆可 · 进度自动同步
              </p>
            </div>
            <div className="mx-auto w-full max-w-xl lg:mx-0">
              <PracticeSessionMock />
            </div>
          </div>
        </section>

        <section className="border-t bg-muted/30">
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
                <Reveal key={row.title}>
                  <FeatureBlock row={row} Mock={featureMocks[i]} />
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
            <StatsGrid />
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
            <Link to="/login" className="hover:text-foreground">登录</Link>
            <Link to="/register" className="hover:text-foreground">注册</Link>
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
