import type { AnswerSheetTemplate } from '@/lib/answer-sheet-demo'
import { KIND_LABEL } from '@/lib/answer-sheet-demo'

/**
 * 答题卡预览。
 * 刻意用纯白底 + 黑线，并且不做圆角 —— 与项目里「试卷纸张必须直角」的约定保持一致，
 * 深浅色模式下都按真实纸张呈现。
 */
export function AnswerSheetPreview({ template }: { template: AnswerSheetTemplate }) {
  const options = Array.from({ length: template.optionCount }, (_, index) =>
    String.fromCharCode(65 + index),
  )

  return (
    <div className="overflow-hidden rounded-none border-2 border-neutral-800 bg-white text-neutral-900">
      {template.includesHeader && (
        <div className="border-b-2 border-neutral-800 px-4 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] font-bold tracking-wide">答题卡</p>
            <p className="text-[9px] text-neutral-500">
              {KIND_LABEL[template.kind]} · {template.paperSize}
            </p>
          </div>
          {template.includesSeatInfo && (
            <div className="mt-2 flex flex-wrap gap-3 text-[9px]">
              {['姓名', '准考证号', '座位号'].map((label) => (
                <span key={label} className="inline-flex items-baseline gap-1">
                  {label}
                  <span className="inline-block w-20 border-b border-neutral-400" />
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {template.includesScoreBox && template.subjectiveCount > 0 && (
        <div className="border-b border-neutral-300 px-4 py-1.5">
          <table className="w-full border-collapse text-[9px]">
            <tbody>
              <tr>
                <td className="w-14 border border-neutral-400 px-1 py-0.5 text-neutral-500">题号</td>
                {Array.from({ length: Math.min(template.subjectiveCount, 8) }, (_, index) => (
                  <td key={index} className="border border-neutral-400 px-1 py-0.5 text-center tabular-nums">
                    {index + 1}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="border border-neutral-400 px-1 py-0.5 text-neutral-500">得分</td>
                {Array.from({ length: Math.min(template.subjectiveCount, 8) }, (_, index) => (
                  <td key={index} className="h-5 border border-neutral-400" />
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {template.objectiveCount > 0 && (
        <div className="px-4 py-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[10px] font-semibold text-neutral-700">客观题 · 涂卡区</span>
            <span className="text-[8px] text-neutral-400">
              共 {template.objectiveCount} 题 · 每题 {template.optionCount} 选项 · {template.columns} 栏
            </span>
          </div>
          <div
            className="grid gap-x-4 gap-y-1.5"
            style={{ gridTemplateColumns: `repeat(${template.columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: template.objectiveCount }, (_, index) => (
              <div key={index} className="flex items-center gap-1">
                <span className="w-5 shrink-0 text-right text-[8px] tabular-nums text-neutral-500">
                  {index + 1}
                </span>
                <span className="flex gap-[3px]">
                  {options.map((option) => (
                    <span
                      key={option}
                      className="flex h-2.5 w-2.5 items-center justify-center rounded-full border border-neutral-500 text-[5px] leading-none text-neutral-500"
                    >
                      {option}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {template.subjectiveCount > 0 && (
        <div className="space-y-3 border-t border-neutral-300 px-4 py-3">
          <p className="text-[10px] font-semibold text-neutral-700">主观题 · 答题区</p>
          {Array.from({ length: template.subjectiveCount }, (_, index) => (
            <div key={index}>
              <p className="text-[9px] font-medium text-neutral-600">第 {index + 1} 题</p>
              <div className="mt-1 space-y-[7px]">
                {Array.from({ length: template.linesPerQuestion }, (_, line) => (
                  <div key={line} className="border-b border-neutral-300" />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="border-t-2 border-neutral-800 px-4 py-1.5 text-[8px] text-neutral-400">
        刷题网 · 答题卡模板预览（DEMO）
      </div>
    </div>
  )
}
