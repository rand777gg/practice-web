import { Fragment, useState, type ReactNode } from 'react'
import {
  ArrowRight,
  BarChart3,
  Braces,
  Calculator,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Cpu,
  Database,
  FileCode2,
  FileText,
  Flag,
  Flame,
  Keyboard,
  Landmark,
  Languages,
  Layers,
  ListChecks,
  Network,
  NotebookPen,
  PenLine,
  Route,
  Server,
  Sigma,
  Sparkles,
  SquarePen,
  Star,
  Timer,
  TrendingUp,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const mockBar = 'flex items-center justify-between border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground'

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-2xl border bg-card shadow-xl shadow-primary/5', className)}>
      {children}
    </div>
  )
}

function Tag({ active, children }: { active?: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        'rounded-md border px-2.5 py-1 text-xs transition-colors',
        active
          ? 'border-primary bg-primary/10 font-medium text-primary'
          : 'border-border bg-background text-muted-foreground',
      )}
    >
      {children}
    </span>
  )
}

const FILTER_GROUPS: { label: string; options: string[]; active: number[] }[] = [
  { label: '学科', options: ['数据结构', '操作系统', '计算机网络', '数据库'], active: [0] },
  { label: '题型', options: ['单选', '多选', '判断', '填空', '编程'], active: [0, 2] },
]

export function PracticeSetupMock() {
  const modes = ['随机混合', '新题优先', '错题优先', '顺序刷题']
  return (
    <Panel>
      <div className={mockBar}>
        <span>练习配置 · 顺序刷题</span>
        <span>示例</span>
      </div>
      <div className="space-y-4 p-5">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">刷题模式</p>
          <div className="flex flex-wrap gap-1.5">
            {modes.map((mode, i) => (
              <Tag key={mode} active={i === 3}>
                {mode}
              </Tag>
            ))}
          </div>
        </div>
        {FILTER_GROUPS.map((group) => (
          <div key={group.label} className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">{group.label}</p>
            <div className="flex flex-wrap gap-1.5">
              {group.options.map((option, i) => (
                <Tag key={option} active={group.active.includes(i)}>
                  {option}
                </Tag>
              ))}
            </div>
          </div>
        ))}
        <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
          <span>命中 128 题</span>
          <span className="text-rose-500">含 12 道错题</span>
        </div>
        <Button size="sm" className="w-full gap-1.5">
          开始顺序刷题
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </Panel>
  )
}

const EXAM_CELLS = [
  'a', 'a', 'f', 'a', '',
  'a', 'f', '', 'a', 'a',
  'f', 'a', '', 'a', '',
  'f', 'a', 'a', '', 'a',
]

const cellCls: Record<string, string> = {
  a: 'bg-primary text-primary-foreground',
  f: 'bg-amber-400 text-amber-950',
  '': 'bg-muted text-muted-foreground/50',
}

export function ExamGridMock() {
  const answered = EXAM_CELLS.filter((c) => c === 'a').length
  const flagged = EXAM_CELLS.filter((c) => c === 'f').length
  return (
    <Panel>
      <div className={mockBar}>
        <span>模拟考试 · 高等数学（一）</span>
        <span className="inline-flex items-center gap-1 font-medium text-red-500">
          <Timer className="h-3.5 w-3.5" />
          32:47
        </span>
      </div>
      <div className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">题目导航</p>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <i className="h-2 w-2 rounded-sm bg-primary" /> 已答 {answered}
            </span>
            <span className="inline-flex items-center gap-1">
              <i className="h-2 w-2 rounded-sm bg-amber-400" /> 标记 {flagged}
            </span>
            <span className="inline-flex items-center gap-1">
              <i className="h-2 w-2 rounded-sm bg-muted ring-1 ring-inset ring-border" /> 未答{' '}
              {EXAM_CELLS.length - answered - flagged}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {EXAM_CELLS.map((cell, i) => (
            <span
              key={i}
              className={cn(
                'flex h-8 items-center justify-center rounded-md text-[11px] font-medium',
                cellCls[cell],
              )}
            >
              {i + 1}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between border-t pt-3">
          <p className="text-xs text-muted-foreground">断点续考：上次做到第 13 题</p>
          <Button size="sm" variant="outline">
            保存并交卷
          </Button>
        </div>
      </div>
    </Panel>
  )
}

export function IdeRunMock() {
  return (
    <Panel>
      <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2 text-xs">
        <span className="rounded-t bg-background px-2 py-1 font-medium text-foreground shadow-sm">
          two_sum.py
        </span>
        <span className="rounded px-2 py-1 text-muted-foreground">用例</span>
        <span className="ml-auto rounded-md border px-1.5 py-0.5 text-muted-foreground">Python 3</span>
      </div>
      <div className="bg-slate-950 px-5 py-4 font-mono text-xs leading-6 text-slate-300">
        <div>
          <span className="text-purple-400">def</span> <span className="text-sky-300">two_sum</span>(
          <span className="text-orange-300">nums</span>, <span className="text-orange-300">target</span>):
        </div>
        <div className="pl-4">
          seen = {}
        </div>
        <div className="pl-4">
          <span className="text-purple-400">for</span> i, n <span className="text-purple-400">in</span>{' '}
          <span className="text-purple-400">enumerate</span>(nums):
        </div>
        <div className="pl-8">
          <span className="text-purple-400">if</span> target - n <span className="text-purple-400">in</span> seen:
        </div>
        <div className="pl-12">
          <span className="text-purple-400">return</span> [seen[target - n], i]
        </div>
        <div className="pl-8">seen[n] = i</div>
        <div className="pl-4">
          <span className="text-purple-400">return</span> []
        </div>
      </div>
      <div className="flex items-center justify-between border-t px-4 py-2.5 text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-500">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Accepted · 通过 3 / 3 个用例
        </span>
        <span className="text-muted-foreground">耗时 12 ms · 内存 3.2 MB</span>
      </div>
    </Panel>
  )
}

export function AiChatMock() {
  return (
    <Panel>
      <div className={mockBar}>
        <span>AI 讲解 · 学习助手</span>
        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-500">
          <CheckCircle2 className="h-3 w-3" /> 今日已总结
        </span>
      </div>
      <div className="space-y-4 p-5">
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
            快速排序为什么不稳定？能给我一个记忆口诀吗
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="max-w-[85%] space-y-2 rounded-2xl rounded-tl-sm border bg-muted/50 px-4 py-3">
            <p className="text-sm">
              分区交换时，等值元素可能<span className="font-medium text-foreground">互换位置</span>，所以不稳定。
              记口诀：<span className="font-medium text-foreground">「一换顺序就乱」</span>。
            </p>
            <p className="text-xs text-muted-foreground">
              建议重做「数组中的第 K 个最大元素」，巩固对分区的理解。
            </p>
            <div className="flex gap-1.5 pt-0.5">
              <Tag>再看一遍解析</Tag>
              <Tag active>加入错题本</Tag>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  )
}

const WEEK = [
  { day: '一', ok: 26, bad: 4 },
  { day: '二', ok: 18, bad: 9 },
  { day: '三', ok: 30, bad: 2 },
  { day: '四', ok: 16, bad: 6 },
  { day: '五', ok: 24, bad: 3 },
  { day: '六', ok: 34, bad: 7 },
  { day: '日', ok: 22, bad: 2 },
]

export function StatsMock() {
  return (
    <Panel>
      <div className={mockBar}>
        <span>数据看板 · 数据结构</span>
        <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-500">
          <TrendingUp className="h-3.5 w-3.5" /> 正确率 82%
        </span>
      </div>
      <div className="space-y-4 p-5">
        <div className="flex items-end justify-between gap-3">
          {WEEK.map((d) => (
            <div key={d.day} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="flex items-end gap-0.5">
                <span
                  className="w-2.5 rounded-t-sm bg-emerald-500/80"
                  style={{ height: `${d.ok}px` }}
                />
                <span
                  className="w-2.5 rounded-t-sm bg-rose-400/80"
                  style={{ height: `${d.bad}px` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">{d.day}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <i className="h-2 w-2 rounded-sm bg-emerald-500/80" /> 答对
            </span>
            <span className="inline-flex items-center gap-1">
              <i className="h-2 w-2 rounded-sm bg-rose-400/80" /> 答错
            </span>
          </span>
          <span>本周 170 题 · 追平历史最佳</span>
        </div>
      </div>
    </Panel>
  )
}

const PHASES = [
  { name: '基础', state: 'done' },
  { name: '强化', state: 'active' },
  { name: '冲刺', state: 'todo' },
] as const

export function RouteStudyMock() {
  return (
    <Panel>
      <div className="p-5">
        <div className="flex items-center justify-between">
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold">
            <Route className="h-4 w-4 text-primary" />
            学习路线
          </p>
          <span className="text-xs text-muted-foreground">已完成 2 / 3 阶段</span>
        </div>
        <div className="mt-5 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center">
          {PHASES.map((phase, i) => (
            <Fragment key={phase.name}>
              <div className="flex justify-center">
                <div
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold',
                    phase.state === 'done' && 'bg-emerald-500 text-white',
                    phase.state === 'active' && 'bg-primary text-primary-foreground ring-4 ring-primary/20',
                    phase.state === 'todo' && 'border border-dashed bg-background text-muted-foreground',
                  )}
                >
                  {phase.state === 'done' ? <Check className="h-4 w-4" /> : i + 1}
                </div>
              </div>
              {i < PHASES.length - 1 && (
                <div
                  className={cn(
                    'mx-1 h-1 w-8 rounded-full sm:w-14',
                    phase.state === 'done' ? 'bg-emerald-500' : 'bg-border',
                  )}
                />
              )}
            </Fragment>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-[1fr_auto_1fr_auto_1fr]">
          {PHASES.map((phase, i) => (
            <Fragment key={phase.name}>
              <span className="text-center text-[11px] text-muted-foreground">{phase.name}</span>
              {i < PHASES.length - 1 && <span aria-hidden className="mx-1 w-8 sm:w-14" />}
            </Fragment>
          ))}
        </div>
      </div>
      <div className="border-t p-5">
        <div className="flex items-center justify-between">
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold">
            <Users className="h-4 w-4 text-primary" />
            星空自习室
          </p>
          <Button size="sm" className="gap-1">
            <Flame className="h-3.5 w-3.5" />
            已打卡
          </Button>
        </div>
        <div className="mt-4 flex items-center gap-1.5">
          {['早', '然', '木', '星'].map((name, i) => (
            <span
              key={name}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-medium text-white ring-2 ring-card',
                ['bg-sky-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-400'][i],
              )}
            >
              {name}
            </span>
          ))}
          <span className="flex h-7 items-center rounded-full bg-muted px-2 text-[10px] font-medium text-muted-foreground">
            +2 在线
          </span>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          今日 12 人打卡 · 连续 7 天 · 每日 20:00 开始
        </p>
      </div>
    </Panel>
  )
}

export function ExamPaperMock() {
  const notices = [
    '答题前，考生须在答题卡指定位置上填写考生编号和考生姓名，并涂写考生编号信息点。',
    '选择题的答案必须涂写在答题卡相应题号的选项上，非选择题的答案必须书写在答题卡指定位置的边框区域内，超出区域作答无效。',
    '填（书）写部分必须使用黑色字迹签字笔书写；涂写部分必须使用 2B 铅笔填涂。',
    '考试结束，将答题卡和试题册按规定交回。',
  ]
  return (
    <Panel>
      <div className={mockBar}>
        <span>试卷预览 · 硕士研究生通用模板</span>
        <span className="inline-flex items-center gap-1.5">绝密★启用前</span>
      </div>
      <div className="bg-muted/60 p-4 sm:p-6">
        <div className="mx-auto max-w-md rounded-lg bg-card p-5 shadow-sm ring-1 ring-border sm:p-6">
          <p className="rounded-md border border-dashed border-primary/50 px-2 py-1 text-center text-[11px] font-medium tracking-wide text-primary">
            绝密★启用前
          </p>
          <div className="mt-4 text-center">
            <p className="text-[13px] font-medium">2027 年全国硕士研究生招生考试</p>
            <p className="mt-1 text-[11px] text-muted-foreground">（科目代码：408）</p>
            <div className="mx-auto mt-3 h-9 w-fit border border-card-foreground px-4 text-sm font-bold leading-9">
              计算机学科专业基础
            </div>
          </div>
          <div className="mt-4 space-y-1.5">
            <p className="text-center text-[10px] text-muted-foreground">（以下信息考生必须认真填写）</p>
            <div className="space-y-1.5 text-[10px] text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="w-12 shrink-0">考生编号</span>
                <span className="flex gap-[3px]">
                  {Array.from({ length: 14 }).map((_, i) => (
                    <i key={i} className="h-4 w-4 rounded-[2px] border border-border" />
                  ))}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-12 shrink-0">考生姓名</span>
                <span className="flex gap-[3px]">
                  <i className="h-4 w-4 rounded-[2px] border border-border" />
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4 space-y-1.5">
            <p className="text-[11px] font-semibold">考生注意事项</p>
            <ol className="list-decimal space-y-1 pl-4 text-[10px] text-muted-foreground">
              {notices.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ol>
          </div>
          <div className="mt-4 flex items-center justify-between border-t pt-3 text-[10px] text-muted-foreground">
            <span>第 1 页 · 通用模板封面</span>
            <span className="inline-flex items-center gap-1 text-primary">
              预览完整试卷 <ArrowRight className="h-3 w-3" />
            </span>
          </div>
        </div>
      </div>
    </Panel>
  )
}

type BrandItem = { icon: ReactNode; name: string }

const BRAND_ROWS: BrandItem[][] = [
  [
    { icon: <Sigma className="h-4 w-4" />, name: '高等数学' },
    { icon: <Calculator className="h-4 w-4" />, name: '线性代数' },
    { icon: <BarChart3 className="h-4 w-4" />, name: '概率论与数理统计' },
    { icon: <Layers className="h-4 w-4" />, name: '数据结构' },
    { icon: <Cpu className="h-4 w-4" />, name: '操作系统' },
    { icon: <Network className="h-4 w-4" />, name: '计算机网络' },
  ],
  [
    { icon: <Server className="h-4 w-4" />, name: '计算机组成原理' },
    { icon: <Database className="h-4 w-4" />, name: '数据库系统' },
    { icon: <Languages className="h-4 w-4" />, name: '考研英语' },
    { icon: <Landmark className="h-4 w-4" />, name: '政治理论' },
    { icon: <Braces className="h-4 w-4" />, name: 'Python 编程' },
    { icon: <FileCode2 className="h-4 w-4" />, name: 'C / C++ 编程' },
  ],
]

function LogoRow({ items, reverse }: { items: BrandItem[]; reverse?: boolean }) {
  return (
    <div className="relative overflow-hidden py-1">
      <div
        className={cn(
          'flex w-max items-center gap-10',
          reverse ? 'animate-marquee-right' : 'animate-marquee-left',
        )}
      >
        {[...items, ...items].map((item, i) => (
          <span key={i} className="flex shrink-0 items-center gap-2 text-muted-foreground/80">
            {item.icon}
            <span className="whitespace-nowrap text-sm font-semibold tracking-tight">{item.name}</span>
          </span>
        ))}
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-background to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-background to-transparent" />
    </div>
  )
}

export function FeaturedLogos() {
  return (
    <div className="space-y-6">
      <p className="text-center text-sm font-semibold tracking-widest text-muted-foreground">
        题库覆盖多个学科专题
      </p>
      <div className="space-y-5">
        {BRAND_ROWS.map((row, i) => (
          <LogoRow key={i} items={row} reverse={i % 2 === 1} />
        ))}
      </div>
    </div>
  )
}

export function StatsGrid() {
  const stats = [
    { value: '846', label: '408 真题' },
    { value: '1833', label: '知识点巩固题' },
    { value: '247', label: '交互可视化' },
    { value: '100%', label: '完全免费' },
  ]
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="rounded-2xl border bg-card px-6 py-8 text-center shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-md">
          <p className="text-3xl font-bold text-blue-600 sm:text-4xl dark:text-blue-400">{s.value}</p>
          <p className="mt-2 text-sm text-muted-foreground">{s.label}</p>
        </div>
      ))}
    </div>
  )
}

export function PracticeSessionMock() {
  const options = [
    { key: 'A', text: '双指针', correct: true },
    { key: 'B', text: '递归' },
    { key: 'C', text: '贪心' },
    { key: 'D', text: '动态规划' },
  ]
  const syllabus = [
    { name: '顺序表', state: 'done' },
    { name: '链表', state: 'done' },
    { name: '栈与队列', state: 'active' },
    { name: '串', state: 'todo' },
    { name: '树与二叉树', state: 'todo' },
  ]
  return (
    <Panel>
      <div className={mockBar}>
        <span className="inline-flex items-center gap-1.5">
          <ListChecks className="h-3.5 w-3.5 text-primary" />
          顺序刷题 · 数据结构
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="font-medium">第 7 / 128 题</span>
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-600 dark:text-emerald-500">
            正确率 92%
          </span>
        </span>
      </div>
      <div className="grid sm:grid-cols-[1fr_150px]">
        <div className="space-y-4 border-b p-5 sm:border-b-0 sm:border-r">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-medium text-primary">单选题</span>
            <span className="rounded-md border px-1.5 py-0.5 text-muted-foreground">数据结构</span>
            <span className="rounded-md border px-1.5 py-0.5 text-muted-foreground">简单</span>
          </div>
          <p className="text-sm font-medium">
            判断两个字符串是否为「同构字符串」时，下列哪种思想最合适？
          </p>
          <div className="grid gap-2">
            {options.map((option) => (
              <div
                key={option.key}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm',
                  option.correct
                    ? 'border-primary bg-primary/10 font-medium text-primary'
                    : 'bg-background',
                )}
              >
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs',
                    option.correct ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {option.correct ? <CheckCircle2 className="h-3.5 w-3.5" /> : option.key}
                </span>
                {option.text}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button size="sm" variant="outline" className="gap-1">
              <ChevronLeft className="h-3.5 w-3.5" />
              上一题
            </Button>
            <Button size="sm" variant="ghost" className="gap-1">
              <Star className="h-3.5 w-3.5" />
              收藏
            </Button>
            <Button size="sm" variant="ghost" className="gap-1">
              <Flag className="h-3.5 w-3.5" />
              存疑
            </Button>
            <Button size="sm" className="ml-auto gap-1">
              下一题
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Keyboard className="h-3 w-3" />
            快捷键：← 上一题 · → 下一题 · 1-4 选择 · S 存疑
          </div>
        </div>
        <div className="hidden p-5 sm:block">
          <p className="text-xs font-medium text-muted-foreground">本组目录</p>
          <ul className="mt-3 space-y-2.5">
            {syllabus.map((item) => (
              <li
                key={item.name}
                className={cn(
                  'flex items-center gap-2 text-xs',
                  item.state === 'active' ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                <span
                  className={cn(
                    'h-2 w-2 shrink-0 rounded-full',
                    item.state === 'done' ? 'bg-emerald-500' : item.state === 'active' ? 'bg-primary' : 'bg-border',
                  )}
                />
                {item.name}
                {item.state === 'done' && <Check className="ml-auto h-3 w-3 text-emerald-500" />}
              </li>
            ))}
          </ul>
          <div className="mt-4 space-y-1.5">
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>本组进度</span>
              <span>3 / 5</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-[60%] rounded-full bg-primary" />
            </div>
          </div>
        </div>
      </div>
    </Panel>
  )
}

export function AiAnalysisMock() {
  const formats = ['PDF', 'Word', '图片']
  return (
    <Panel>
      <div className={mockBar}>
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          AI 智能解析 · 文档 → 题目
        </span>
        <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-500">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
          解析中
        </span>
      </div>
      <div className="flex items-center gap-3 bg-muted/40 p-4 sm:p-6">
        <div className="min-w-0 flex-1 rounded-xl border bg-card p-3 shadow-sm">
          <div className="flex items-center justify-between border-b pb-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
              <FileText className="h-3.5 w-3.5 text-primary" />
              原始文档
            </span>
            <span>上传即解析</span>
          </div>
          <div className="mt-2.5 space-y-1.5">
            <div className="h-2 w-[92%] rounded bg-muted" />
            <div className="h-2 w-[78%] rounded bg-muted" />
            <div className="h-2 w-[86%] rounded bg-muted" />
            <div className="h-2 w-[62%] rounded bg-muted" />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {formats.map((f) => (
              <span key={f} className="rounded-md border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {f}
              </span>
            ))}
          </div>
        </div>
        <svg viewBox="0 0 48 24" className="h-6 w-12 shrink-0 text-primary" role="img" aria-label="提取解析">
          <path d="M1 12 H36" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3">
            <animate attributeName="stroke-dashoffset" from="0" to="-14" dur="0.6s" repeatCount="indefinite" />
          </path>
          <path d="M37 7 L45 12 L37 17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <circle r="2.6" fill="currentColor">
            <animateMotion dur="1.4s" repeatCount="indefinite" path="M1 12 L36 12" />
          </circle>
        </svg>
        <div className="min-w-0 flex-1 rounded-xl border bg-card p-3 shadow-sm">
          <div className="flex items-center justify-between border-b pb-2 text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground">结构化题目</span>
            <span>试卷展示</span>
          </div>
          <p className="mt-2 text-[11px] font-medium">《计算机学科专业基础》</p>
          <ol className="mt-1.5 space-y-1 text-[11px] text-muted-foreground">
            <li>1. 关于数据结构的说法，正确的是（  ）</li>
            <li>2. …………………………………………</li>
            <li>3. 简述关系型数据库的三大范式</li>
          </ol>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">单选题</span>
            <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">简答题</span>
          </div>
        </div>
      </div>
    </Panel>
  )
}

type QuestionTypeId = 'single' | 'true_false' | 'judge_correct' | 'fill_blank' | 'short_answer' | 'case_analysis' | 'coding'

const questionTypes: { id: QuestionTypeId; label: string; icon: ReactNode; desc: string }[] = [
  { id: 'single', label: '单选题', icon: <CircleDot className="h-4 w-4" />, desc: '四选一' },
  { id: 'true_false', label: '判断题', icon: <CheckCircle2 className="h-4 w-4" />, desc: '对与错' },
  { id: 'judge_correct', label: '判断改错题', icon: <SquarePen className="h-4 w-4" />, desc: '判断并改正' },
  { id: 'fill_blank', label: '填空题', icon: <PenLine className="h-4 w-4" />, desc: '补全答案' },
  { id: 'short_answer', label: '简答题', icon: <NotebookPen className="h-4 w-4" />, desc: '要点作答' },
  { id: 'case_analysis', label: '案例分析题', icon: <FileText className="h-4 w-4" />, desc: '案例情境' },
  { id: 'coding', label: '编程题', icon: <FileCode2 className="h-4 w-4" />, desc: '判题运行' },
]

function SingleExample() {
  const options = ['巴黎', '伦敦', '纽约', '北京']
  const correct = 0
  const [sel, setSel] = useState<number | null>(null)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-medium text-primary">单选题</span>
        <span className="rounded-md border px-1.5 py-0.5 text-muted-foreground">地理</span>
      </div>
      <p className="text-sm font-medium">法国首都位于下列哪座城市？</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o, i) => (
          <button
            key={o}
            onClick={() => setSel(i)}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
              sel !== null && i === correct
                ? 'border-emerald-500 bg-emerald-500/10 font-medium text-emerald-700 dark:text-emerald-400'
                : sel === i
                  ? 'border-rose-400 bg-rose-400/10 text-rose-600 dark:text-rose-300'
                  : 'bg-background hover:border-primary/40',
            )}
          >
            <span
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs',
                sel !== null && i === correct
                  ? 'bg-emerald-500 text-white'
                  : sel === i
                    ? 'bg-rose-400 text-white'
                    : 'bg-muted text-muted-foreground',
              )}
            >
              {String.fromCharCode(65 + i)}
            </span>
            {o}
          </button>
        ))}
      </div>
      {sel !== null && (
        <p className={cn('text-xs', sel === correct ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500')}>
          {sel === correct ? '回答正确，+1 分' : `回答错误，正确答案：${options[correct]}`}
        </p>
      )}
    </div>
  )
}

function JudgeCorrectExample() {
  const [sel, setSel] = useState<'right' | 'wrong' | null>(null)
  const answered = sel !== null
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-medium text-primary">判断改错题</span>
        <span className="rounded-md border px-1.5 py-0.5 text-muted-foreground">计算机组成原理</span>
      </div>
      <p className="text-sm font-medium">
        冯·诺依曼结构把「程序指令」和「数据」都预先存放在存储器中，由 CPU 逐条取出执行。
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => setSel('right')}
          className={cn(
            'flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
            answered
              ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              : 'bg-background hover:border-primary/40',
          )}
        >
          正确
        </button>
        <button
          onClick={() => setSel('wrong')}
          className={cn(
            'flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
            sel === 'wrong'
              ? 'border-rose-400 bg-rose-400/10 text-rose-600 dark:text-rose-300'
              : 'bg-background hover:border-primary/40',
          )}
        >
          错误
        </button>
      </div>
      {answered && sel === 'right' && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">回答正确</p>
      )}
      {answered && sel === 'wrong' && (
        <div className="space-y-1 rounded-lg border bg-background p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">改正：</p>
          <p>冯·诺依曼结构把「程序指令」与「数据」都预先存放在存储器中，由 CPU 逐条取出执行……（此处补充规范表述）</p>
        </div>
      )}
    </div>
  )
}

function CaseAnalysisExample() {
  const [show, setShow] = useState(false)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-medium text-primary">案例分析题</span>
        <span className="rounded-md border px-1.5 py-0.5 text-muted-foreground">管理学</span>
      </div>
      <div className="space-y-2 rounded-lg border bg-background p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">案例：某公司连续三年销售下滑，管理层决定削减广告与研发预算以压缩成本。</p>
        <p>请结合所学分析其经营困境的可能原因，并提出两条对策。</p>
      </div>
      <Button size="sm" variant="outline" onClick={() => setShow((s) => !s)}>
        {show ? '收起参考解析' : '查看参考解析'}
      </Button>
      {show && (
        <div className="space-y-1 rounded-lg border bg-background p-3 text-xs text-muted-foreground">
          <p>· 原因：外部竞争加剧 + 内部投入不足，陷入「投入减少 → 竞争力下降」的循环。</p>
          <p>· 对策：保住核心研发投入、聚焦高毛利细分市场、优化渠道结构。</p>
        </div>
      )}
    </div>
  )
}

function JudgeExample() {
  const [sel, setSel] = useState<'right' | 'wrong' | null>(null)
  const answered = sel !== null
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-medium text-primary">判断题</span>
        <span className="rounded-md border px-1.5 py-0.5 text-muted-foreground">计算机网络</span>
      </div>
      <p className="text-sm font-medium">TCP 是面向连接的可靠传输协议。</p>
      <div className="flex gap-2">
        <button
          onClick={() => setSel('right')}
          className={cn(
            'flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
            answered
              ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              : 'bg-background hover:border-primary/40',
          )}
        >
          正确
        </button>
        <button
          onClick={() => setSel('wrong')}
          className={cn(
            'flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
            sel === 'wrong'
              ? 'border-rose-400 bg-rose-400/10 text-rose-600 dark:text-rose-300'
              : 'bg-background hover:border-primary/40',
          )}
        >
          错误
        </button>
      </div>
      {answered && (
        <p className={cn('text-xs', sel === 'right' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500')}>
          {sel === 'right' ? '回答正确' : '回答错误，正确答案：正确'}
        </p>
      )}
    </div>
  )
}

function BlankExample() {
  const [show, setShow] = useState(false)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-medium text-primary">填空题</span>
        <span className="rounded-md border px-1.5 py-0.5 text-muted-foreground">计算机组成</span>
      </div>
      <p className="text-sm font-medium">衡量计算机运算速度的主要指标是 ______。</p>
      <div className="flex items-center gap-2">
        <span className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground">
          {show ? '主频（时钟频率）' : '点击右侧查看参考答案'}
        </span>
        <Button size="sm" variant="outline" onClick={() => setShow((s) => !s)}>
          {show ? '收起答案' : '查看答案'}
        </Button>
      </div>
    </div>
  )
}

function ShortExample() {
  const [show, setShow] = useState(false)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-medium text-primary">简答题</span>
        <span className="rounded-md border px-1.5 py-0.5 text-muted-foreground">经济学</span>
      </div>
      <p className="text-sm font-medium">简述需求的价格弹性及其影响因素。</p>
      <div className="space-y-2 rounded-lg border bg-background p-3 text-xs text-muted-foreground">
        <p>作答要点：</p>
        {show && (
          <div className="space-y-1 text-foreground/80">
            <p>· 需求价格弹性 = 需求量变动率 / 价格变动率</p>
            <p>· 影响因素：替代品数量、支出占比、时间长短、商品必需程度</p>
          </div>
        )}
      </div>
      <Button size="sm" variant="outline" onClick={() => setShow((s) => !s)}>
        {show ? '收起示例答案' : '查看示例答案'}
      </Button>
    </div>
  )
}

export function QuestionTypes() {
  const [active, setActive] = useState<QuestionTypeId>('single')
  const current = questionTypes.find((q) => q.id === active)!
  return (
    <Panel>
      <div className={mockBar}>
        <span className="inline-flex items-center gap-1.5">
          <ListChecks className="h-3.5 w-3.5 text-primary" />
          支持的题型
        </span>
        <span>共 {questionTypes.length} 种 · 点击切换</span>
      </div>
      <div className="p-5">
        <div className="grid gap-5 lg:grid-cols-[200px_1fr]">
          <div className="space-y-1.5">
            {questionTypes.map((qt) => (
              <button
                key={qt.id}
                onClick={() => setActive(qt.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                  active === qt.id
                    ? 'border-primary bg-primary/10 font-medium text-primary'
                    : 'bg-background text-muted-foreground hover:border-primary/40',
                )}
              >
                {qt.icon}
                <span className="flex-1 text-left">{qt.label}</span>
                <ChevronRight className={cn('h-3.5 w-3.5', active === qt.id ? 'opacity-100' : 'opacity-40')} />
              </button>
            ))}
          </div>
          <div className="space-y-4 rounded-xl border bg-muted/30 p-4 sm:p-5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{current.label} · 作答示例</span>
              <span>{current.desc}</span>
            </div>
            {active === 'single' && <SingleExample />}
            {active === 'true_false' && <JudgeExample />}
            {active === 'judge_correct' && <JudgeCorrectExample />}
            {active === 'fill_blank' && <BlankExample />}
            {active === 'short_answer' && <ShortExample />}
            {active === 'case_analysis' && <CaseAnalysisExample />}
            {active === 'coding' && <IdeRunMock />}
          </div>
        </div>
      </div>
    </Panel>
  )
}
