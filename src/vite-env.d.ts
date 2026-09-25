/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Web Push VAPID 公钥(URL-safe base64), 前端订阅必需 */
  readonly VITE_VAPID_PUBLIC_KEY?: string
  /**
   * 网络探针的可选对照组入口(一个仍经 Cloudflare 的同源域名)。
   * 留空则只测生产路径。切勿填 supabase.pguide.dev —— 它已切直连,不再是 CF,
   * 请求 /cdn-cgi/trace 会 404 且无 CORS 头,浏览器每次会话多 2 条控制台错误。
   */
  readonly VITE_NET_PROBE_CONTROL_HOST?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
