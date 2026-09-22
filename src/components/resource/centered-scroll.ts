/**
 * 把某个元素滚到容器的正中。
 *
 * 点目录/检索结果/PDF 热区时要"跳过去", 顶对齐会让目标贴着上边缘、上面一点上下文都不剩;
 * 居中则上下留出等量内容, 好读得多。
 *
 * 元素比容器还高时**退回顶对齐**: 那种情况居中会把开头推到屏幕外面, 只看到中段 ——
 * 反而看不见"从哪开始"(实测 1280×700 时正文面板 489px, 而最长的一段有 745px)。
 */
export function scrollElementToCenter(
  container: HTMLElement,
  el: HTMLElement,
  behavior: ScrollBehavior = 'smooth',
): void {
  const cRect = container.getBoundingClientRect()
  const eRect = el.getBoundingClientRect()
  // 元素在内容坐标系里的位置(不受当前滚动影响)
  const offset = eRect.top - cRect.top + container.scrollTop
  const fits = el.offsetHeight <= container.clientHeight
  const top = fits ? offset - (container.clientHeight - el.offsetHeight) / 2 : offset
  const max = Math.max(0, container.scrollHeight - container.clientHeight)
  container.scrollTo({ top: Math.min(Math.max(0, top), max), behavior })
}
