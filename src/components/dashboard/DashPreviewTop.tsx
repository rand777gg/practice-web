import { useChartPalette, CATEGORY_COLORS } from '@/lib/chart-theme'

/* ---------- 学科构成:环形图(纯 SVG,随主题 token) ---------- */

interface SubjectRow { subject: string }

export function SubjectCompositionDonut({ rows }: { rows: SubjectRow[] }) {
  const pal = useChartPalette()
  const count = new Map<string, number>()
  for (const r of rows) {
    const key = r.subject || '未分类'
    count.set(key, (count.get(key) ?? 0) + 1)
  }
  const entries = [...count.entries()].sort((a, b) => b[1] - a[1])
  const total = entries.reduce((s, [, v]) => s + v, 0)
  if (!total) {
    return <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">暂无数据</div>
  }

  const R = 42, C = 2 * Math.PI * R, cx = 50, cy = 50
  const top = entries.slice(0, 10)
  const arcsData = top.reduce<{ name: string; v: number; len: number; offset: number }[]>((acc, [name, v]) => {
    const prev = acc.length > 0 ? acc[acc.length - 1].offset + acc[acc.length - 1].len : 0
    acc.push({ name, v, len: (v / total) * C, offset: prev })
    return acc
  }, [])
  const arcs = arcsData.map(({ name, v, len, offset }, i) => (
    <circle
      key={name}
      cx={cx}
      cy={cy}
      r={R}
      fill="none"
      stroke={CATEGORY_COLORS[i % CATEGORY_COLORS.length]}
      strokeWidth={14}
      strokeDasharray={`${len} ${C - len}`}
      strokeDashoffset={-offset}
      opacity={1}
    >
      <title>{`${name} ${v} 题(${Math.round((v / total) * 100)}%)`}</title>
    </circle>
  ))

  return (
    <div className="flex flex-wrap items-center justify-center gap-5">
      <div style={{ position: 'relative', width: 200, height: 200 }}>
        <svg viewBox="0 0 100 100" width="200" height="200">
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--chart-line)" strokeWidth={14} />
          {arcs}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums">{total}</span>
          <span className="text-xs" style={{ color: pal.label }}>道题目</span>
        </div>
      </div>
      <ul className="min-w-[150px] space-y-1.5">
        {entries.slice(0, 8).map(([name, v], i) => (
          <li key={name} className="flex items-center gap-2 text-xs">
            <i className="h-2.5 w-2.5 flex-none rounded-[3px]" style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
            <span className="truncate text-foreground">{name}</span>
            <span className="ml-auto tabular-nums text-muted-foreground">{Math.round((v / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ---------- 题型能力雷达(五题型正确率,纯 SVG) ---------- */

const TYPE_NAME: Record<string, string> = {
  single_choice: '单选', multi_select: '多选', true_false: '判断',
  fill_blank: '填空', short_answer: '简答',
}

interface HeatCell { questionType: string; correctRate: number; total: number }

export function TypeRadarChart({ cells }: { cells: HeatCell[] }) {
  const weight = new Map<string, { rate: number; total: number }>()
  for (const c of cells) {
    const key = c.questionType
    const w = weight.get(key) ?? { rate: 0, total: 0 }
    w.rate += c.correctRate * Math.max(c.total, 1)
    w.total += Math.max(c.total, 1)
    weight.set(key, w)
  }
  const axes = Object.entries(TYPE_NAME)
    .map(([key, label]) => {
      const w = weight.get(key)
      return { label, value: w && w.total > 0 ? Math.round((w.rate / w.total) * 100) : 100 }
    })
    .filter((a) => a.value != null && a.label)
  if (axes.length === 0) {
    return <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">暂无数据</div>
  }

  const W = 300, H = 240, cx = W / 2, cy = H / 2 - 6, R = 84
  const pt = (i: number, r: number) => {
    const a = -Math.PI / 2 + (i / axes.length) * Math.PI * 2
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const
  }
  const ring = [0.33, 0.66, 1].map((f) =>
    axes.map((_, i) => pt(i, R * f).join(',')).join(' '),
  )
  const poly = axes.map((a, i) => pt(i, (R * a.value) / 100).join(',')).join(' ')
  const dots = axes.map((a, i) => {
    const [x, y] = pt(i, (R * a.value) / 100)
    return { x, y, label: a.label, value: a.value }
  })

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="mx-auto" style={{ maxWidth: 300 }}>
      {axes.map((_, i) => {
        const [x, y] = pt(i, R)
        return (
          <g key={i}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke="var(--chart-line)" strokeWidth={0.5} />
          </g>
        )
      })}
      {ring.map((r, i) => <polygon key={i} points={r} fill="none" stroke="var(--chart-line)" strokeWidth={0.5} />)}
      <polygon points={poly} fill="var(--chart-brand)" opacity={0.16} stroke="var(--chart-brand)" strokeWidth={1.5} />
      {dots.map((d) => (
        <g key={d.label}>
          <circle cx={d.x} cy={d.y} r={3} fill="var(--chart-brand)" />
          <text x={d.x} y={d.y - 8} textAnchor="middle" fontSize={10} fill="var(--chart-ink)">{d.value}%</text>
        </g>
      ))}
      {axes.map((a, i) => {
        const [x, y] = pt(i, R + 22)
        return (
          <text key={a.label} x={x} y={y + 3} textAnchor="middle" fontSize={10} fill="var(--chart-label)">
            {a.label}
          </text>
        )
      })}
    </svg>
  )
}

/* ---------- 一周 × 24 小时热力网格(纯 CSS/SVG 方格) ---------- */

export function WeekHourHeat({ data }: { data: number[][] }) {
  const pal = useChartPalette()
  const dow = ['一', '二', '三', '四', '五', '六', '日']
  const max = Math.max(...data.flat(), 1)

  const color = (v: number) => {
    if (v <= 0) return 'var(--chart-line)'
    const t = v / max
    return `color-mix(in srgb, var(--chart-brand) ${Math.round(14 + t * 86)}%, var(--chart-panel))`
  }

  return (
    <div className="flex gap-2">
      <div className="flex flex-col gap-[3px] text-[10px]" style={{ color: pal.label }}>
        {dow.map((d, i) => (
          <span key={d} className="grid h-3.5 place-items-center" style={{ height: 15 }}>{i % 2 === 0 ? d : ''}</span>
        ))}
      </div>
      <div className="grid auto-rows-[15px] grid-flow-col gap-[3px] overflow-x-auto pb-1">
        {data.map((row, di) =>
          row.map((v, h) => (
            <i
              key={`${di}-${h}`}
              className="h-[15px] w-[15px] rounded-[2px]"
              style={{ background: color(v) }}
              title={`周${dow[di]} ${h}:00 · ${v} 次`}
            />
          )),
        )}
      </div>
    </div>
  )
}
