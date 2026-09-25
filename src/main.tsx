import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import '@radix-ui/themes/styles.css'
import { runNetProbe } from './lib/net-probe'

// 网络路径对照探针（只上报不改行为）：在渲染前启动，不 await，失败静默。
// 结论出来后会删掉这一段。
void runNetProbe()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
