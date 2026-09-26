import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import echarts from '@/lib/echarts'

/**
 * 头部计划菜单（Popover）里那张小图。
 *
 * 单独拆出来只为一件事：**懒加载**。它原来直接写在 `HeaderPlanMenu` 里，而 HeaderPlanMenu
 * 属于应用布局、是入口 chunk 的一部分 —— 于是整份 echarts + zrender（压缩前约 2.4MB）跟着进了首屏，
 * 而这张图只在用户点开那个 Popover 时才需要渲染。
 *
 * 实测（`scripts/find-eager-heavy.mjs`，判据是 stats.html 里权威的 moduleParts）：
 * 入口 chunk 里直接 import echarts 的 src 模块只有两个 —— 本组件的来源 `HeaderPlanMenu`
 * 与 `PlanGanttChart`。断开这两条边，echarts 就离开了首屏。
 */
export function PlanMenuChart({ option, height }: { option: EChartsOption; height: number }) {
  return (
    <div className="w-full" style={{ height }}>
      <ReactECharts
        echarts={echarts}
        option={option}
        notMerge
        style={{ height: '100%', width: '100%' }}
      />
    </div>
  )
}
