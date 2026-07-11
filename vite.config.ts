import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { visualizer } from 'rollup-plugin-visualizer'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      devOptions: { enabled: true },
      includeAssets: ['favicon.svg', 'icons.svg'],
      manifest: {
        name: '刷题练习',
        short_name: '刷题',
        description: '在线刷题练习工具',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        clientsClaim: true,
        skipWaiting: false,
        // ponytail: only precache small chunks + main entry; large lazy chunks (>100KB) cached on first use
        manifestTransforms: [
          (manifest) => ({
            manifest: manifest.filter((entry) => {
              if (!entry.url.endsWith('.js')) return true
              // Keep small UI chunks for instant offline
              if (!entry.size || entry.size < 100_000) return true
              // Keep main entry chunk
              if (/\/index-/.test(entry.url)) return true
              return false
            }),
            warnings: [],
          }),
        ],
        runtimeCaching: [
          {
            // Supabase API — network first, stale-while-revalidate cache
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
              networkTimeoutSeconds: 5,
            },
          },
          {
            // Static assets (JS/CSS chunks) — CacheFirst for instant repeat loads
            urlPattern: /\.(?:js|css)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'static-assets',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // Fonts and images — stale-while-revalidate
            urlPattern: /\.(?:woff2?|png|svg|jpg|jpeg|gif|ico)$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'static-media',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 90 },
            },
          },
        ],
      },
    }),
    // Bundle analyzer — open stats.html after build
    visualizer({
      open: false,
      gzipSize: true,
      brotliSize: true,
      filename: 'stats.html',
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
