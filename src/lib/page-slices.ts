/**
 * 页码区间计算 —— 纯函数, 不碰 DOM/pdfjs, 所以能直接单测。
 *
 * 单独一个文件是因为这里有几个必须算对的地方: MinerU 单次最多 200 页,
 * 超长文献要按这个上限切片; 而切片后 MinerU 返回的页码是相对的, 偏移量也算在这一层。
 */

/**
 * 单次解析请求允许的最大页数。
 *
 * 实测(2026-09, vlm 模型): 请求 200 页被拒, 报
 *   "number of pages exceeds limit (200 pages), please split the file and try again"
 * 但同一份 295 页文件请求 199 页可以正常解析 —— 也就是说 MinerU 宣称 200, 实际判定是
 * `页数 < 200`, 199 是安全上界。用 200 会让每一卷都被拒, 例如 400 页的书切出来两卷全废。
 *
 * 另外实测限制只看**本次请求的页数**, 与文件总页数无关:
 * 在 295 页文件上请求 "1-2" 照样成功, 所以 page_ranges 是可行的分卷手段。
 */
export const MINERU_PAGE_LIMIT = 199

export interface PageSlice {
  from: number
  to: number
}

export function parsePageNumbers(ranges: string | undefined, totalPages: number): number[] {
  if (!ranges || !ranges.trim()) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }
  const set = new Set<number>()
  for (const part of ranges.split(',')) {
    const trimmed = part.trim()
    if (trimmed.includes('-')) {
      const [start, end] = trimmed.split('-').map(Number)
      for (let i = Math.max(1, start); i <= Math.min(totalPages, end || start); i++) {
        set.add(i)
      }
    } else {
      const n = Number(trimmed)
      if (n >= 1 && n <= totalPages) set.add(n)
    }
  }
  return set.size > 0 ? Array.from(set).sort((a, b) => a - b) : Array.from({ length: totalPages }, (_, i) => i + 1)
}

/** 这次实际会送去解析的页数: 填了页码范围就是选中的页数, 否则是全文 */
export function selectedPageCount(totalPages: number, pageRanges?: string): number {
  return parsePageNumbers(pageRanges, totalPages).length
}

/**
 * 按单次解析的页数上限自动切卷。295 页 → [{1,199}, {200,295}]。
 * 只有一卷时返回单卷, 调用方可以不传 page_ranges, 拿到完整的解析质量。
 */
export function slicePageRanges(totalPages: number, limit = MINERU_PAGE_LIMIT): PageSlice[] {
  const total = Math.max(1, Math.floor(totalPages))
  const per = Math.max(1, Math.floor(limit))
  const slices: PageSlice[] = []
  for (let from = 1; from <= total; from += per) {
    slices.push({ from, to: Math.min(total, from + per - 1) })
  }
  return slices
}

export function sliceToRange(slice: PageSlice): string {
  return `${slice.from}-${slice.to}`
}

/**
 * 切卷计划。
 * 没显式指定页码范围时按单次解析的页数上限自动切片; 显式指定时整段作为一卷。
 */
export function planParts(totalPages: number, pageRanges?: string): PageSlice[] {
  const explicit = (pageRanges ?? '').trim()
  if (!explicit) return slicePageRanges(totalPages)
  const pages = parsePageNumbers(explicit, totalPages)
  if (pages.length === 0) return []
  return [{ from: pages[0], to: pages[pages.length - 1] }]
}

/**
 * 每一卷实际要发给 MinerU 的页码范围。
 *
 * 只有这一卷覆盖了整篇时才返回 undefined(不传 range, MinerU 能拿到完整版面信息);
 * **多卷文档的每一卷都必须显式带 range**。
 *
 * 这里踩过坑: 原来的判据是「从第 1 页开始且不超过上限就不传」, 结果多卷文档的第一卷
 * 也满足这个条件 → 实际请求变成整本书 → MinerU 报 "number of pages exceeds limit
 * (200 pages)"。错误信息里的页码区间标签还写着 1-199, 极具误导性。
 */
export function rangeForSlice(
  slices: PageSlice[],
  index: number,
  totalPages: number,
  explicitRanges?: string,
): string | undefined {
  const explicit = (explicitRanges ?? '').trim()
  if (explicit) return explicit
  const slice = slices[index]
  if (!slice) return undefined
  if (slices.length === 1 && slice.from === 1 && slice.to === totalPages) return undefined
  return sliceToRange(slice)
}
