/**
 * 把 id 列表切成小批, 供 `.in()` 查询使用。
 *
 * 为什么必须切: supabase-js 的 `.in('col', ids)` 是把所有 id 拼进 URL 查询串的。
 * 一个 700 题的大考卷就是 26KB 的 URL, 而链路上有硬限制:
 *   · 我们 nginx 的 large_client_header_buffers 是 4 16k —— 请求行放不进就 414
 *   · EdgeOne(国内节点) 的 URL 上限实测约 16KB(14.9KB 通 / 18.6KB 414), 比 Cloudflare 更严
 * 超限时源站回 414, 经 CDN 表现为 520 / net::ERR_FAILED, 前端只看到"请求失败", 极难定位。
 *
 * 200 个 uuid ≈ 7.6KB, 实测两条链路都稳过, 所以取 200 作为默认批大小。
 */
export const IN_CHUNK = 200

export function chunkIds<T>(ids: T[], size = IN_CHUNK): T[][] {
  if (ids.length <= size) return [ids]
  const out: T[][] = []
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size))
  return out
}
