import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Don't inject manifest into every HTML page — only /dispatch needs PWA
      // but vite-plugin-pwa injects globally; that's fine, non-dispatch pages ignore it
      manifest: {
        name: 'Rivet',
        short_name: 'Rivet',
        description: 'Better jobs. Better margins.',
        theme_color: '#142a20',
        background_color: '#142a20',
        display: 'standalone',
        start_url: '/dispatch',
        scope: '/',
        icons: [
          {
            src: '/pwa-icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // Precache all build assets (app shell)
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
        // Don't let the service worker intercept auth-sensitive routes
        navigateFallbackDenylist: [/^\/login/, /^\/admin/],
        runtimeCaching: [
          {
            // NetworkFirst for Netlify Function API calls
            urlPattern: /\/api\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
              networkTimeoutSeconds: 10,
            },
          },
        ],
        // Never cache Supabase auth requests
        navigateFallback: null,
      },
    }),
  ],
  build: {
    // react-snap bundles Chromium ~69; transpile modern syntax (e.g. ?.) for prerender
    target: 'es2015',
  },
})
