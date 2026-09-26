/**
 * 甘特图的配色常量。
 *
 * 为什么单独一个文件（看着像过度拆分，其实不是）：`PlanGanttChart` 要**懒加载**，
 * 因为它是入口包里唯一拉进 echarts 的地方 —— 而调用方要静态 import 这两个颜色值。
 * 常量留在组件文件里的话，`import { PLAN_BLUE } from './PlanGanttChart'` 这一句
 * 就足以把整个 echarts 留在入口 chunk 里，懒加载白做。
 *
 * 教训写在这里免得下次有人"顺手"把它挪回去：**值导出和组件导出不能放同一个模块，
 * 只要有一方要懒加载。**
 */
export const PLAN_BLUE = '#3b82f6'
export const CUSTOM_PINK = '#ec4899'
