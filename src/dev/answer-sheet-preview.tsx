/**
 * 免登录的临时预览入口，只用来手工验收答题卡模板。
 *
 * 渲染的是真页面 TemplatesPage（同一个组件、同一套样式、同一个交互），
 * 只是用 MemoryRouter 直接落到 /templates/answer-sheet，绕开 RootGate 的登录判断。
 * 验收完可以连同根目录的 answer-sheet-preview.html 一起删掉，不影响正式构建
 * （vite build 的入口只有 index.html）。
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import '@/index.css'
import { Component as TemplatesPage } from '@/pages/TemplatesPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemoryRouter initialEntries={['/templates/answer-sheet']}>
      <Routes>
        <Route path="/templates/:tab" element={<TemplatesPage />} />
      </Routes>
    </MemoryRouter>
  </StrictMode>,
)
