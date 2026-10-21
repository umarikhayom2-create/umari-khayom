// Умари Хайём — сервис-воркер: сайт открывается мгновенно даже при слабом интернете.
// Страница: показываем сохранённую версию сразу, свежую скачиваем в фоне (если сеть быстрая — сразу свежую).
// Фото товаров и иконки: берём из памяти телефона, качаем только один раз.
var CACHE = "uh-app-v3", IMG = "uh-img-v1";
var CORE = ["./", "manifest.json", "favicon.ico", "icon-32.png", "icon-16.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"];
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).catch(function () {}).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE && k !== IMG; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
function put(name, key, r) { if (r && r.ok) { var cp = r.clone(); caches.open(name).then(function (c) { c.put(key, cp); }); } return r; }
self.addEventListener("fetch", function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  // шрифты Google — из памяти, если уже скачаны
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.open(IMG).then(function (c) { return c.match(req).then(function (r) { return r || fetch(req).then(function (n) { if (n && (n.ok || n.type === "opaque")) c.put(req, n.clone()); return n; }); }); }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  var page = req.mode === "navigate" || /\/(index\.html)?$/.test(url.pathname);
  if (page) {
    var net = fetch(req, { cache: "no-cache" }).then(function (r) { return put(CACHE, "./", r); });
    e.respondWith(caches.match("./").then(function (cached) {
      if (!cached) return net;
      // ждём свежую версию не дольше 2,5 секунды, иначе показываем сохранённую
      return Promise.race([net.catch(function () { return cached; }), new Promise(function (ok) { setTimeout(function () { ok(cached); }, 2500); })]);
    }));
    e.waitUntil(net.catch(function () {}));
    return;
  }
  if (/\/img\//.test(url.pathname)) {
    e.respondWith(caches.open(IMG).then(function (c) { return c.match(req).then(function (r) { return r || fetch(req).then(function (n) { if (n && n.ok) c.put(req, n.clone()); return n; }); }); }));
    return;
  }
  e.respondWith(caches.match(req).then(function (r) { return r || fetch(req).then(function (n) { return put(CACHE, req, n); }); }));
});
