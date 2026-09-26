import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { runNetProbe } from './lib/net-probe'
import { reportClientEvent, installErrorReporting } from './lib/client-events'
import { setSlowRequestReporter, getApiStats } from './lib/api-metrics'

// 开发环境挂到 window 上，控制台里 `__apiStats()` 就能看每个 context 的调用数/失败数/耗时。
// 生产不挂：那里没有控制台可用，而慢请求已经以 slow_request 事件上报了。
if (import.meta.env.DEV) {
  (window as unknown as { __apiStats: typeof getApiStats }).__apiStats = getApiStats
}

// 生产环境的错误出口：`logError` 在生产是空操作，这里把它的输出接到 client_events
// （落库走 report-client-event 这个 Edge Function）。必须在渲染前装好，否则首屏的错误会漏掉。
installErrorReporting()

// 慢请求也报一条：用户说"卡"的时候，至少知道是哪类查询慢。
// 带上这个 context 当前的调用数与失败数 —— 一条事件就能看出是偶发还是这类查询一直在慢。
setSlowRequestReporter((info) => {
  reportClientEvent({
    kind: 'slow_request',
    name: info.context,
    detail: { ms: info.ms, calls: info.calls, failures: info.failures, maxMs: info.maxMs },
  })
})

// 网络路径对照探针（只上报不改行为）：在渲染前启动，不 await，失败静默。
// 结论出来后会删掉这一段。
void runNetProbe()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
