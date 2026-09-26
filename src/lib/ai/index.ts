/**
 * AI 能力的 barrel。
 *
 * ⚠️ **在首屏路径上的组件不要从这个文件引**，只从具体模块引（`@/lib/ai/config` 等）。
 * 原因很实在：第 1 行的 `./deepseek` import 了 zod，而 `./mineru` / `./summary` 又各自带一坨；
 * barrel 一被引用，打包器就得把**全部**这些拉进调用者的 chunk。
 *
 * 这不是理论担忧，是实测过的：`components/layout/NavActions.tsx` 只需要一个 `hasAiConfig()`
 * 布尔判断，却从这里引 —— 而 NavActions 在 Header 里、Header 由 AppLayout 急切加载，
 * 于是**整套 AI SDK + zod** 进了首屏。改成 `@/lib/ai/config` 之后：
 * 首屏 JS 570.4 → 438.5KB gzip（−132KB），请求数 40 → 31，`schemas-*.js`（zod）
 * 与两个 AI 的 `dist-*.js` 全部离开首屏。
 *
 * 懒加载页面（admin 的 AI 导入、设置页等）从这里引没问题 —— 它们本来就不在首屏。
 * 判断标准是"这个调用者会不会在首屏被求值"，不是"它是不是 AI 功能"。
 */
export { DeepSeekParser, generateKeyPoints, suggestExamConfig, suggestPlan, generateQuestions, generateFromDocument, generateFromText } from './deepseek'
export { MinerUClient } from './mineru'
export { generateDailySummary } from './summary'
export type { SummaryData } from './summary'
export { chatWithLittleQ } from './assistant'
export type { AssistantTurn } from './assistant'
export { getAiConfig, hasAiConfig, getMinerUToken, setMinerUToken, getMinerUModelVersion, setMinerUModelVersion, hasMinerUToken, canUseMinerU, probeMinerU } from './config'
export type { AiConfig, ParsedQuestion, AiParseResult, DocumentParseResult, MinerUModelVersion, MinerUPrecisionOptions, MinerUTaskResult, MinerUBatchFileResult } from './types'
