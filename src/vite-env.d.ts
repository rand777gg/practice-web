/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Web Push VAPID 公钥(URL-safe base64), 前端订阅必需 */
  readonly VITE_VAPID_PUBLIC_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
