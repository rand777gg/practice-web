import { useMemo } from 'react'
import { useThemeStore } from '@/stores/theme-store'

/* ---------- 2026 学习热力图:preview 宫格样式(纯 CSS) ---------- */

const LIGHT = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39']
const DARK = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353']
const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
const CELL = 11
const GAP = 3
const STEP = CELL + GAP

interface DayCell {
  week: number
  row: number
  color: string
  title: string
  monthLabel?: string
}

function pad(n: number) { return String(n).padStart(2, '0') }
function levelOf(count: number, maxVal: number): number {
  if (count <= 0) return 0
  const q = maxVal / 4
  if (count <= q) return 1
  if (count <= q * 2) return 2
  if (count <= q * 3) return 3
  return 4
}

export function YearHeatPreview({ data }: { data: { date: string; count: number }[] }) {
  const theme = useThemeStore((s) => s.theme)
  const colors = theme === 'dark' ? DARK : LIGHT

  const { cells, weeks, months } = useMemo(() => {
    const byDate = new Map(data.map((d) => [d.date, d.count]))
    const year = new Date().getFullYear()
    const maxVal = Math.max(...data.map((d) => d.count), 1)

    const start = new Date(year, 0, 1)
    const off = (start.getDay() + 6) % 7 // 周一 = 0
    const dims = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

    const cells: DayCell[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    let dayOfYear = 0
    const monthWeeks: { index: number; label: string; weeks: number }[] = []

    for (let m = 0; m < 12; m++) {
      const monthStartWeek = Math.floor((dayOfYear + off) / 7)
      let daysWithData = 0
      for (let d = 1; d <= dims[m]; d++) {
        const cur = new Date(year, m, d)
        const key = `${year}-${pad(m + 1)}-${pad(d)}`
        const count = byDate.get(key) ?? 0
        if (count > 0) daysWithData++
        const row = (cur.getDay() + 6) % 7
        const week = Math.floor((dayOfYear + off) / 7)
        const future = cur.getTime() > today.getTime()
        const lvl = levelOf(count, maxVal)
        cells.push({
          week,
          row,
          color: future ? 'transparent' : colors[lvl],
          title: `${m + 1}月${d}日 · ${count} 题`,
        })
        dayOfYear++
      }
      monthWeeks.push({ index: monthStartWeek, label: MONTH_NAMES[m], weeks: daysWithData > 0 ? Math.max(1, Math.ceil(dims[m] / 7) + 1) : Math.ceil(dims[m] / 7) })
    }
    const weeks = Math.floor((dayOfYear + off) / 7)
    return { cells, weeks, months: monthWeeks }
  }, [data, colors])

  const heightPx = 7 * STEP - GAP
  const weekLabelCol = ['一', '', '三', '', '五', '', '日']

  return (
    <div>
      {/* 月份标尺 */}
      <div className="relative h-4" style={{ marginLeft: 20 }}>
        {months.map((m) => (
          <span
            key={m.label}
            className="absolute top-0 text-[10px] leading-4"
            style={{ left: m.index * STEP, color: theme === 'dark' ? '#9ca3af' : '#57606a' }}
          >
            {m.label}
          </span>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5">
        <div className="flex flex-col" style={{ height: heightPx }}>
          {weekLabelCol.map((d, i) => (
            <span key={i} className="text-[10px] leading-none" style={{ height: STEP, paddingTop: GAP + 1, color: theme === 'dark' ? '#9ca3af' : '#57606a' }}>
              {d}
            </span>
          ))}
        </div>
        <div
          className="grid overflow-x-auto"
          style={{
            gridTemplateColumns: `repeat(${weeks}, ${CELL}px)`,
            gridTemplateRows: `repeat(7, ${CELL}px)`,
            gap: GAP,
            paddingBottom: 2,
          }}
        >
          {cells.map((c, i) => (
            <i
              key={i}
              title={c.title}
              className="block rounded-[2px]"
              style={{ gridColumn: c.week + 1, gridRow: c.row + 1, background: c.color }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/* ---------- 里程碑(基于真实数据计算,与 preview 版式一致) ---------- */

interface Milestone { title: string; done: boolean; sub: string }

export function MilestonesCard({ dailyAnswers, totalAnswered }: { dailyAnswers: { date: string; count: number }[]; totalAnswered: number }) {
  const list = useMemo<Milestone[]>(() => {
    const days = dailyAnswers
      .map((d) => new Date(d.date + 'T00:00:00'))
      .sort((a, b) => a.getTime() - b.getTime())

    let longest = 0
    let run = 0
    let prev: number | null = null
    for (const d of days) {
      const t = d.getTime()
      if (prev != null && t - prev === 86400000) run += 1
      else run = 1
      prev = t
      if (run > longest) longest = run
    }
    const maxDaily = dailyAnswers.reduce((s, d) => Math.max(s, d.count), 0)

    return [
      {
        title: `连续打卡最长 ${longest} 天`,
        done: longest >= 30,
        sub: longest >= 30 ? '已达成 30 天成就' : `距 30 天成就还差 ${Math.max(30 - longest, 0)} 天`,
      },
      {
        title: `单日最高 ${maxDaily} 题`,
        done: maxDaily >= 200,
        sub: maxDaily >= 200 ? '已达成单日 200 题成就' : `距单日 200 题还差 ${Math.max(200 - maxDaily, 0)} 题`,
      },
      {
        title: `累计答题 ${totalAnswered.toLocaleString()} 次`,
        done: totalAnswered >= 6000,
        sub: totalAnswered >= 6000 ? '已达成 6000 题成就' : `距 6000 题还差 ${Math.max(6000 - totalAnswered, 0)} 次`,
      },
    ]
  }, [dailyAnswers, totalAnswered])

  return (
    <div className="space-y-1">
      {list.map((m) => (
        <div key={m.title} className="flex items-center gap-2.5 py-1.5">
          <span
            className="grid h-6 w-6 flex-none place-items-center rounded-full text-[11px]"
            style={{
              background: m.done ? 'var(--chart-correct)' : 'var(--chart-line)',
              color: m.done ? '#fff' : 'var(--chart-label)',
            }}
          >
            ★
          </span>
          <span className="min-w-0 text-[12.5px]">
            <b className="font-semibold text-foreground">{m.title}</b>
            <span className={`ml-1.5 ${m.done ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>{m.sub}</span>
          </span>
        </div>
      ))}
    </div>
  )
}
