/**
 * R2 公共访问域名。
 *
 * 这个域名原本硬编码在 8 个地方(AI 解析页 5 处 + 缩略图 + 历史记录 + Markdown 编辑器),
 * 域名一过期就整片静默坏掉: 所有页图和 PDF 都变成 Cloudflare 的域名停放页,
 * 前端只表现为图片不显示、解析失败, 没有任何报错指向真正原因。所以收敛到这一处。
 *
 * 配置: 前端 VITE_R2_PUBLIC_HOST, Edge Function 侧用 R2_PUBLIC_HOST secret, 两边要填同一个域名。
 */
const FALLBACK_HOST = 'r2-rpw.pguide.dev'

const RAW_HOST = ((import.meta.env.VITE_R2_PUBLIC_HOST as string | undefined) ?? '').trim()

// 前端不抛异常白屏(见 lib/supabase.ts 的同款取舍), 但要吵出来:
// 域名配错的表现是"图片不显示", 不报错的话极难排查。
if (!RAW_HOST) {
  console.error(
    `[r2] 未配置 VITE_R2_PUBLIC_HOST, 回退到 ${FALLBACK_HOST}。` +
    '请在 .env 里设置 VITE_R2_PUBLIC_HOST(不带协议), 并与 Supabase 的 R2_PUBLIC_HOST secret 保持一致。',
  )
}

export const R2_PUBLIC_HOST = (RAW_HOST || FALLBACK_HOST)
  .replace(/^https?:\/\//, '')
  .replace(/\/+$/, '')

export const R2_PUBLIC_ORIGIN = `https://${R2_PUBLIC_HOST}`

export function r2PublicUrl(key: string): string {
  return `${R2_PUBLIC_ORIGIN}/${key.replace(/^\/+/, '')}`
}

/**
 * 这个 URL 是不是我们自己的存储(Supabase Storage 或 R2)。
 * 自家的可以直接喂给 PDF 查看器 / pdfjs; 外部的要走 mineru-proxy 代理绕开 CORS。
 */
export function isOwnStorageUrl(url: string): boolean {
  return url.includes('/storage/v1/object/')
    || url.includes('/r2/')
    || url.includes('r2.dev')
    || url.includes(R2_PUBLIC_HOST)
}
