// Умари Хайём — сервис-воркер: приложение открывается быстро и без интернета показывает последнюю версию.
var CACHE = "uh-app-v1";
var CORE = ["./", "manifest.json", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"];
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).catch(function () {}).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
function fromNet(req, key) {
  return fetch(req).then(function (r) {
    if (r && r.ok) { var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put(key || req, cp); }); }
    return r;
  });
}
self.addEventListener("fetch", function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  var page = req.mode === "navigate" || /\/(index\.html)?$/.test(url.pathname);
  if (page) {
    // Сначала свежая версия из сети, если сети нет — сохранённая.
    e.respondWith(fromNet(req, "./").catch(function () {
      return caches.match("./").then(function (r) { return r || caches.match(req); });
    }));
    return;
  }
  e.respondWith(caches.match(req).then(function (r) { return r || fromNet(req); }));
});
