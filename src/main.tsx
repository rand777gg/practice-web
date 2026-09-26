import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { runNetProbe } from './lib/net-probe'
import { installErrorReporting } from './lib/client-events'

// 生产环境的错误出口：`logError` 在生产是空操作，这里把它的输出接到 client_events
// （落库走 report-client-event 这个 Edge Function）。必须在渲染前装好，否则首屏的错误会漏掉。
installErrorReporting()

// 网络路径对照探针（只上报不改行为）：在渲染前启动，不 await，失败静默。
// 结论出来后会删掉这一段。
void runNetProbe()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
