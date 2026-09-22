/* Runs inside the service worker. The copy already on a phone does not
   listen for updates, so when this worker takes control it reloads open
   Rivet screens. Later launches use the in-app check in src/pwaUpdates.js. */
self.addEventListener('activate', function (event) {
  event.waitUntil(reloadOpenAppWindows())
})

function isAppScreen(url) {
  try {
    var path = new URL(url).pathname
    return path === '/dispatch'
      || path === '/login'
      || path === '/signup'
      || path === '/admin'
      || path.indexOf('/admin/') === 0
  } catch (e) {
    return false
  }
}

function reloadOpenAppWindows() {
  return self.clients.claim().then(function () {
    return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  }).then(function (windowClients) {
    return Promise.all(windowClients.map(function (client) {
      if (!isAppScreen(client.url) || typeof client.navigate !== 'function') return null
      return client.navigate(client.url)
    }))
  })
}
