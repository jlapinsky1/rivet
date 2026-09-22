import { registerSW } from 'virtual:pwa-register'

const RELOAD_AT = 'rivet-pwa-reloaded-at'

export function registerAppUpdates() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  let hadController = !!navigator.serviceWorker.controller
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true
      return
    }
    reloadOnce()
  })

  registerSW({
    immediate: true,
    onNeedReload() {
      reloadOnce()
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return
      const check = () => {
        if (document.visibilityState === 'hidden') return
        registration.update().catch(() => {})
      }
      document.addEventListener('visibilitychange', check)
      window.addEventListener('pageshow', check)
      window.setInterval(check, 60 * 60 * 1000)
    },
  })
}

function reloadOnce() {
  const now = Date.now()
  try {
    const previous = Number(sessionStorage.getItem(RELOAD_AT) || 0)
    if (now - previous < 10000) return
    sessionStorage.setItem(RELOAD_AT, String(now))
  } catch {
    // sessionStorage can throw in private mode; still reload
  }
  window.location.reload()
}
