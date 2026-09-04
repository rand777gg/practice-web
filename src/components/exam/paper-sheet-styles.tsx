/**
 * 试卷版式: 纸张尺寸/分页/打印样式集中放在这里, PaperPreview(真卷) 与 PaperOutline(骨架卷) 共用一份。
 * 排版结构与作答交互是普通 DOM, 不依赖 PDF 或 WASM —— 交互层要能点击、能高亮、能响应式, 位图渲染做不到。
 *
 * 排版 token (PaperLayout) 通过 inline CSS 变量注入到 paper-sheet 根节点, 这里所有可调值都 var(--paper-*) 化。
 */
export function PaperSheetStyles() {
  return (
    <style>{`
      /* ===== 基础纸张 (尺寸/边距/字号/分栏 全部由 --paper-* 变量驱动) ===== */
      .paper-sheet {
        width: var(--paper-width, 210mm);
        min-height: var(--paper-min-height, 297mm);
        padding: var(--paper-padding-top, 16mm) var(--paper-padding-right, 15mm) var(--paper-padding-bottom, 16mm) var(--paper-padding-left, 15mm);
        background: hsl(var(--card));
        color: hsl(var(--card-foreground));
        border: 1px solid hsl(var(--border));
        font-size: var(--paper-font-size, 15px);
        line-height: var(--paper-line-height, 1.9);
        box-shadow: 0 1px 3px rgba(0,0,0,.12), 0 8px 24px rgba(0,0,0,.08);
        position: relative;
      }
      .paper-sheet-spread {
        width: 100%;
        max-width: none;
        min-height: 0;
        padding: 10mm;
        border: 1px solid hsl(var(--border));
        box-shadow: none;
        font-size: var(--paper-font-size, 14px);
        line-height: var(--paper-line-height, 1.8);
      }
      .paper-sheet .paper-md > * { margin: 0; }
      .paper-q { break-inside: avoid; page-break-inside: avoid; }
      .paper-sec { break-after: auto; }
      .paper-sec-head { break-after: avoid; }
      /* 多栏摊开: 栏数来自 --paper-columns; 窄屏回落单栏 */
      .paper-columns {
        columns: var(--paper-columns, 1);
        column-gap: var(--paper-column-gap, 9mm);
        column-fill: balance;
      }
      .paper-columns .paper-sec { break-inside: avoid; }
      .paper-columns .paper-q { break-inside: avoid; }
      @media (max-width: 1023px) {
        .paper-columns { columns: 1 !important; }
      }
      /* 试卷内统一随主题的描线/悬浮, 覆盖组件里不方便用 tailwind 语义类的地方 */
      .paper-sheet .paper-inline-rule { border-color: hsl(var(--border)); }
      .paper-md table, .paper-md pre, .paper-md blockquote { border-color: hsl(var(--border)); }

      /* ===== 整卷字族 (--paper-font-family) ===== */
      .paper-sheet, .paper-cover { font-family: var(--paper-font-family, inherit); }

      /* 封面独占页: 有封面 && coverOwnPage 时, 让封面占满整张纸, 正文另起一页 */
      .paper-cover-ownpage {
        min-height: calc(var(--paper-min-height, 297mm) - var(--paper-padding-top, 16mm) - var(--paper-padding-bottom, 16mm));
        display: flex;
        flex-direction: column;
        page-break-after: always;
        break-after: page;
      }
      .paper-cover-inline {
        page-break-after: auto;
        break-after: auto;
      }
      /* 骨架卷(模板编辑预览)的占位条 */
      .paper-sk { background: hsl(var(--muted)); border-radius: 2px; }
      /* 编辑器侧栏里的缩排卷: 不吃 210mm, 单栏, 仍是 A4 观感 */
      .paper-sheet-compact {
        width: 100%;
        max-width: none;
        min-height: 0;
        padding: 5mm 6mm;
        font-size: 12px;
        line-height: 1.7;
        box-shadow: none;
      }

      /* ===== 装订线 (binderLine): 由 --paper-binder-* 控制位置和粗细 ===== */
      .paper-binder-line {
        position: absolute;
        background: hsl(var(--foreground));
        opacity: 0.55;
        pointer-events: none;
      }
      .paper-binder-left {
        top: 0; bottom: 0;
        left: calc(var(--paper-padding-left, 15mm) - var(--paper-binder-offset, 10mm) - var(--paper-binder-width, 1mm));
        width: var(--paper-binder-width, 1mm);
      }
      .paper-binder-right {
        top: 0; bottom: 0;
        right: calc(var(--paper-padding-right, 15mm) - var(--paper-binder-offset, 10mm) - var(--paper-binder-width, 1mm));
        width: var(--paper-binder-width, 1mm);
      }
      .paper-binder-top {
        left: 0; right: 0;
        top: calc(var(--paper-padding-top, 16mm) - var(--paper-binder-offset, 10mm) - var(--paper-binder-width, 1mm));
        height: var(--paper-binder-width, 1mm);
      }

      /* ===== 密封条 (sealBand): 顶部居中/左上的横条 ===== */
      .paper-seal-band {
        position: absolute;
        background: hsl(var(--card));
        color: hsl(var(--foreground));
        border: 1.5px solid hsl(var(--foreground));
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        font-weight: 600;
        letter-spacing: 0.05em;
        font-size: var(--paper-seal-font-size, 9pt);
        height: var(--paper-seal-height, 6mm);
        z-index: 2;
      }
      .paper-seal-band-top-center {
        top: calc(var(--paper-padding-top, 16mm) - var(--paper-seal-height, 6mm) / 2 - 1mm);
        left: 50%;
        transform: translateX(-50%);
        padding: 0 6mm;
        white-space: nowrap;
      }
      .paper-seal-band-top-left {
        top: calc(var(--paper-padding-top, 16mm) - var(--paper-seal-height, 6mm) / 2 - 1mm);
        left: calc(var(--paper-padding-left, 15mm) - var(--paper-seal-height, 6mm) / 2 - 1mm);
        padding: 0 4mm;
        writing-mode: vertical-rl;
        text-orientation: upright;
        line-height: 1.1;
        white-space: nowrap;
      }

      /* ===== 水印 (watermark): 全屏固定, 旋转, 半透明 ===== */
      .paper-watermark {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        z-index: 1;
        overflow: hidden;
      }
      .paper-watermark-text {
        color: var(--paper-watermark-color, hsl(var(--foreground)));
        opacity: var(--paper-watermark-opacity, 0);
        transform: rotate(var(--paper-watermark-rotation, -30deg));
        font-size: var(--paper-watermark-size, 60pt);
        font-weight: 700;
        letter-spacing: 0.2em;
        white-space: nowrap;
        user-select: none;
      }
      /* 重复填满纸张, 让水印盖整页 */
      .paper-watermark-grid {
        position: absolute;
        inset: 0;
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        grid-template-rows: repeat(4, 1fr);
      }
      .paper-watermark-grid > span {
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--paper-watermark-color, hsl(var(--foreground)));
        opacity: var(--paper-watermark-opacity, 0);
        transform: rotate(var(--paper-watermark-rotation, -30deg));
        font-size: var(--paper-watermark-size, 60pt);
        font-weight: 700;
        letter-spacing: 0.15em;
        white-space: nowrap;
      }

      /* ===== 页脚 (footer) + 页码 ===== */
      .paper-footer {
        margin-top: 6mm;
        padding-top: 2mm;
        border-top: 1px solid hsl(var(--border));
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 10px;
        color: hsl(var(--muted-foreground));
      }
      .paper-page-num {
        font-variant-numeric: tabular-nums;
      }

      /* ===== 得分框: always/optional/none 三种模式 ===== */
      .paper-score-box-optional {
        border: 1px solid hsl(var(--foreground) / 0.35);
        padding: 0 0.5em;
        font-size: 0.7em;
        line-height: 1.6;
        color: hsl(var(--muted-foreground));
      }
      .paper-score-box-always {
        border: 1.5px solid hsl(var(--foreground));
        padding: 0 0.5em;
        font-size: 0.75em;
        font-weight: 600;
        min-width: 3em;
        text-align: center;
      }
      .paper-score-box-none { display: none; }

      /* ===== 打印 ===== */
      @media print {
        .paper-sheet { width: auto; min-height: 0; padding: 0; box-shadow: none; font-size: 12pt;
          background: #fff !important; color: #000 !important; border: none; }
        .paper-sheet-spread { width: auto; padding: 0; border: none; }
        .paper-columns { columns: auto; }
        .paper-no-print { display: none !important; }
        .paper-cover { page-break-after: always; }
        .paper-watermark, .paper-watermark-grid, .paper-seal-band, .paper-binder-line { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        @page { size: A4; margin: 16mm 15mm; }
      }

      /* ---------- 封面排版 (PaperCover 消费同套 --paper-* 变量) ---------- */
      .paper-cover-sheet {
        padding: var(--paper-padding-top, 16mm) var(--paper-padding-right, 15mm) var(--paper-padding-bottom, 16mm) var(--paper-padding-left, 15mm);
        position: relative;
      }
      .paper-cover-spread, .paper-cover-compact {
        padding: 10mm;
      }
      .paper-cover-compact {
        padding: 5mm 6mm;
        font-size: 12px;
        line-height: 1.7;
      }
      .paper-cover-banner {
        font-size: 0.75em;
        color: hsl(var(--foreground));
        margin-bottom: 4mm;
      }
      .paper-cover-head {
        text-align: center;
        margin-bottom: 6mm;
      }
      .paper-cover-exam-name {
        font-size: 0.95em;
        margin-bottom: 3mm;
        letter-spacing: 0.05em;
      }
      .paper-cover-title {
        font-size: 1.85em;
        font-weight: 700;
        letter-spacing: 0.08em;
        margin-bottom: 3mm;
        line-height: 1.4;
      }
      .paper-cover-compact .paper-cover-title { font-size: 1.4em; }
      .paper-cover-spread .paper-cover-title { font-size: 1.5em; }
      .paper-cover-code {
        font-size: 0.95em;
        color: hsl(var(--foreground));
        margin-top: 2mm;
      }
      .paper-cover-notice-title {
        text-align: center;
        font-size: 1em;
        font-weight: 600;
        letter-spacing: 0.1em;
        margin-top: 8mm;
        margin-bottom: 5mm;
      }
      .paper-cover-compact .paper-cover-notice-title { font-size: 0.85em; margin-top: 4mm; margin-bottom: 3mm; }
      .paper-cover-spread .paper-cover-notice-title { font-size: 0.9em; margin-top: 5mm; margin-bottom: 3mm; }
      .paper-cover-notices {
        list-style: none;
        padding: 0;
        margin: 0 0 6mm 0;
        padding-left: 5mm;
        counter-reset: notice;
      }
      .paper-cover-compact .paper-cover-notices { padding-left: 3mm; margin-bottom: 3mm; }
      .paper-cover-spread .paper-cover-notices { padding-left: 3mm; margin-bottom: 4mm; }
      .paper-cover-notice-item {
        margin-bottom: 3mm;
        text-indent: 0;
        display: flex;
        gap: 0.4em;
        align-items: baseline;
      }
      .paper-cover-compact .paper-cover-notice-item { margin-bottom: 2mm; font-size: 0.9em; }
      .paper-cover-notice-no {
        flex-shrink: 0;
        font-weight: 400;
      }
      .paper-cover-info-hint {
        text-align: center;
        font-size: 0.9em;
        margin-top: 4mm;
        margin-bottom: 2mm;
      }
      .paper-cover-compact .paper-cover-info-hint { font-size: 0.8em; margin-top: 2mm; }
      .paper-cover-info-table {
        margin-top: 1mm;
        width: 100%;
      }
      .paper-cover-info-row {
        display: flex;
        align-items: stretch;
        border: 1.5px solid hsl(var(--foreground));
        height: 8mm;
        margin-bottom: -1.5px;
      }
      .paper-cover-compact .paper-cover-info-row { height: 6mm; }
      .paper-cover-info-label {
        flex: 0 0 auto;
        padding: 0 6mm;
        display: flex;
        align-items: center;
        border-right: 1.5px solid hsl(var(--foreground));
        font-size: 0.9em;
      }
      .paper-cover-compact .paper-cover-info-label { padding: 0 3mm; font-size: 0.8em; }
      .paper-cover-info-cells {
        flex: 1 1 auto;
        display: flex;
        align-items: stretch;
      }
      .paper-cover-info-box {
        flex: 1 1 0;
        border-right: 1.5px solid hsl(var(--foreground));
      }
      .paper-cover-info-box:last-child { border-right: none; }
      .paper-cover-info-row:has(.paper-cover-info-cells:not(:has(.paper-cover-info-box))) .paper-cover-info-cells {
        background: repeating-linear-gradient(90deg, hsl(var(--foreground)) 0 1px, transparent 1px 4mm);
      }
      .paper-cover-custom {
        margin-top: 6mm;
        display: flex;
        flex-direction: column;
        gap: 2mm;
      }
      .paper-cover-rule {
        border: none;
        border-top: 1px solid hsl(var(--foreground));
        margin: 4mm 0;
      }

      /* ===== 直调编辑态 (TemplatePaperPreview): 命中高亮 / 边距热区 ===== */
      .paper-sheet-direct { position: relative; }
      .paper-sheet-direct [data-paper-hit] { cursor: pointer; }
      .paper-sheet-direct [data-paper-hit]:hover { box-shadow: 0 0 0 1px hsl(var(--primary) / 0.5); }
      .paper-sheet-direct [data-paper-hit].pe-sel { box-shadow: 0 0 0 1.5px hsl(var(--primary)); }
      .paper-sheet-direct .pe-margin { position: absolute; background: transparent; touch-action: none; user-select: none; -webkit-user-select: none; }
      .paper-sheet-direct .pe-margin:hover { background: hsl(var(--primary) / 0.12); }
      .paper-sheet-direct .pe-margin.pe-sel { background: hsl(var(--primary) / 0.18); box-shadow: none; }
      .paper-sheet-direct .pe-margin-top { top: 0; left: 0; right: 0; height: var(--paper-padding-top, 16mm); cursor: ns-resize; }
      .paper-sheet-direct .pe-margin-bottom { bottom: 0; left: 0; right: 0; height: var(--paper-padding-bottom, 16mm); cursor: ns-resize; }
      .paper-sheet-direct .pe-margin-left { top: 0; left: 0; bottom: 0; width: var(--paper-padding-left, 15mm); cursor: ew-resize; }
      .paper-sheet-direct .pe-margin-right { top: 0; right: 0; bottom: 0; width: var(--paper-padding-right, 15mm); cursor: ew-resize; }
    `}</style>
  )
}