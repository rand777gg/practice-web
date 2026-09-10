import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import echarts from '@/lib/echarts'
import { useThemeStore } from '@/stores/theme-store'
import { useLangStore } from '@/stores/lang-store'
import { SEAT_STATUS_META, type CandidateSeat, type ExamVenue } from '@/lib/exam-seat-map'

interface Props {
  venue: ExamVenue
  selectedSeatNo?: string | null
  onSelect?: (seat: CandidateSeat | null) => void
}

/** 座位状态 → 语义色（浅色 / 深色各一套） */
function statusColor(status: CandidateSeat['status'], isDark: boolean): string {
  switch (status) {
    case 'present':
      return isDark ? '#38bdf8' : '#2563eb'
    case 'late':
      return isDark ? '#f59e0b' : '#d97706'
    case 'absent':
      return isDark ? '#64748b' : '#94a3b8'
  }
}

export function ExamSeatMap({ venue, selectedSeatNo, onSelect }: Props) {
  const theme = useThemeStore((s) => s.theme)
  const { lang } = useLangStore()
  const isDark = theme === 'dark'

  const option = useMemo(() => {
    const ink = isDark ? '#e5e7eb' : '#1f2937'
    const label = isDark ? '#9ca3af' : '#6b7280'
    const line = isDark ? 'rgba(255,255,255,.08)' : 'rgba(15,23,42,.08)'
    const panel = isDark ? '#1f2937' : '#ffffff'
    const panelLine = isDark ? '#374151' : '#e5e7eb'

    // 过道列下标：座位 col >= aisleCol 时 x 右移一格，留出过道
    const aisleCol = venue.aisleCol
    const xOf = (col: number) => (aisleCol >= 0 && col >= aisleCol ? col + 1 : col)
    // 行号从上到下：第 0 行在最上方 → y = rows - 1 - row
    const yOf = (row: number) => venue.rows - 1 - row

    // 有人座位
    const occupied = venue.seats.map((s) => {
      const isSelected = s.seatNo === selectedSeatNo
      return {
        value: [xOf(s.col), yOf(s.row), s.seatNo],
        itemStyle: {
          color: statusColor(s.status, isDark),
          ...(isSelected
            ? { borderColor: isDark ? '#f59e0b' : '#f59e0b', borderWidth: 3, shadowBlur: 12, shadowColor: 'rgba(245,158,11,.6)' }
            : {}),
        },
        seat: s,
      }
    })
    // 空座位（座位格总数为 rows * (cols + (有过道?1:0))，减去已占用的）
    const totalCols = venue.cols + (aisleCol >= 0 ? 1 : 0)
    const empty: { value: [number, number] }[] = []
    const seatByPos = new Map<string, boolean>(venue.seats.map((s) => [`${xOf(s.col)},${yOf(s.row)}`, true]))
    for (let r = 0; r < venue.rows; r++) {
      for (let c = 0; c < totalCols; c++) {
        if (aisleCol >= 0 && c === aisleCol) continue
        const key = `${c},${yOf(r)}`
        if (!seatByPos.has(key)) empty.push({ value: [c, yOf(r)] })
      }
    }

    // 行号标签（A/B/C...）
    const rowLabels = Array.from({ length: venue.rows }, (_, i) =>
      String.fromCharCode(65 + i),
    )

    const zh = lang === 'zh'

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: panel,
        borderColor: panelLine,
        textStyle: { color: ink, fontSize: 12 },
        formatter: (p: { data?: { seat?: CandidateSeat } }) => {
          const seat = p.data?.seat
          if (!seat) return ''
          const status = zh ? SEAT_STATUS_META[seat.status].labelZh : SEAT_STATUS_META[seat.status].labelEn
          const sub = seat.submitted ? (zh ? '已交卷' : 'Submitted') : (zh ? '未交卷' : 'In progress')
          return [
            `<div style="font-weight:600;margin-bottom:2px">${seat.name}</div>`,
            `<div>${zh ? '座位' : 'Seat'}: ${seat.seatNo} · ${seat.studentId}</div>`,
            `<div>${status} · ${sub}${seat.time ? ` · ${seat.time}` : ''}</div>`,
          ].join('')
        },
      },
      grid: { left: 40, right: 20, top: 70, bottom: 40, containLabel: false },
      xAxis: {
        type: 'value',
        min: -0.5,
        max: totalCols - 0.5,
        interval: 1,
        axisLabel: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        min: -0.5,
        max: venue.rows - 0.5,
        interval: 1,
        axisLabel: {
          show: true,
          color: label,
          fontSize: 11,
          formatter: (v: number) => rowLabels[venue.rows - 1 - v] ?? '',
        },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
      },
      series: [
        // 空座位：虚线空框
        {
          type: 'scatter',
          symbolSize: 40,
          data: empty,
          symbol: 'roundRect',
          itemStyle: {
            color: 'transparent',
            borderColor: line,
            borderWidth: 1.5,
            borderType: 'dashed',
          },
          emphasis: { scale: false },
          silent: true,
        },
        // 有人座位
        {
          type: 'scatter',
          symbolSize: 40,
          symbol: 'roundRect',
          data: occupied,
          itemStyle: {
            borderColor: isDark ? 'rgba(255,255,255,.25)' : 'rgba(255,255,255,.7)',
            borderWidth: 1.5,
          },
          label: {
            show: true,
            position: 'inside',
            color: '#fff',
            fontSize: 10,
            fontWeight: 600,
            formatter: (p: { data?: { seat?: CandidateSeat } }) => p.data?.seat?.name.slice(0, 1) ?? '',
          },
          emphasis: {
            scale: 1.25,
            itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,.3)' },
          },
        },
      ],
      graphic: [
        // 讲台
        {
          type: 'rect',
          left: 'center',
          top: 8,
          shape: { width: 220, height: 30, r: 6 },
          style: {
            fill: isDark ? 'rgba(56,189,248,.12)' : 'rgba(37,99,235,.08)',
            stroke: isDark ? '#38bdf8' : '#2563eb',
            lineWidth: 1,
          },
        },
        {
          type: 'text',
          left: 'center',
          top: 17,
          style: {
            text: zh ? '讲 台' : 'Podium',
            fill: isDark ? '#38bdf8' : '#2563eb',
            fontSize: 12,
            fontWeight: 600,
          },
        },
      ],
    }
  }, [venue, isDark, lang, selectedSeatNo])

  const onEvents = useMemo(() => {
    return {
      click: (params: { data?: { seat?: CandidateSeat } }) => {
        onSelect?.(params.data?.seat ?? null)
      },
    }
  }, [onSelect])

  return (
    <ReactECharts
      echarts={echarts}
      option={option}
      onEvents={onEvents}
      style={{ height: 420, width: '100%' }}
      notMerge
    />
  )
}
