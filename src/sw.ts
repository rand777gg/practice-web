import { clientsClaim } from 'workbox-core'
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<string | { url: string; revision: string | null }>
}

// 开发态立即激活便于调试推送; 生产保留 registerType=prompt 的更新提示语义
if (import.meta.env.DEV) {
  self.skipWaiting()
}
clientsClaim()

precacheAndRoute(self.__WB_MANIFEST)

if (!import.meta.env.DEV) {
  cleanupOutdatedCaches()

  // SPA 导航兜底: 刷新/直达深层路由都回 index.html
  registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))

  // Supabase API —— NetworkFirst, 失败回退缓存(与原 generateSW 配置一致)
  registerRoute(
    ({ url }) => url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in'),
    new NetworkFirst({
      cacheName: 'api-cache',
      networkTimeoutSeconds: 5,
      plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 })],
    }),
  )

  // 静态资源 JS/CSS —— CacheFirst(构建产物带 hash)
  registerRoute(
    ({ request }) => request.destination === 'script' || request.destination === 'style',
    new CacheFirst({ cacheName: 'static-assets', plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 })] }),
  )

  // 字体与图片 —— StaleWhileRevalidate
  registerRoute(
    ({ request }) => request.destination === 'font' || request.destination === 'image',
    new StaleWhileRevalidate({
      cacheName: 'static-media',
      plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 90 })],
    }),
  )
}

// Web Push: 页面/浏览器关闭后也能弹系统通知
self.addEventListener('push', (event: PushEvent) => {
  let title = '预约考试'
  let body = ''
  let url = '/exam'
  try {
    const data = event.data ? event.data.json() : null
    if (data) {
      if (typeof data.title === 'string' && data.title) title = data.title
      if (typeof data.body === 'string') body = data.body
      if (typeof data.url === 'string') url = data.url
    }
  } catch {
    /* 非 JSON 载荷: 沿用默认文案 */
  }
  const options: NotificationOptions = {
    body,
    icon: '/logo-192.png',
    badge: '/logo-192.png',
    tag: 'exam-schedule-push',
    renotify: false,
    data: { url },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  const targetUrl =
    event.notification.data && typeof event.notification.data.url === 'string'
      ? event.notification.data.url
      : '/exam'
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client && 'navigate' in client) {
            try {
              client.navigate(targetUrl)
              return client.focus()
            } catch {
              /* 跨域等场景走兜底 openWindow */
            }
          }
        }
        return self.clients.openWindow(targetUrl)
      })
      .then((win) => win && win.focus()),
  )
})
