// Умари Хайём — сервис-воркер: сайт открывается мгновенно даже при слабом интернете.
// Страница: сразу показываем сохранённую копию, свежую версию качаем в фоне и сообщаем «Сайт обновился».
// Фото товаров, миниатюры, иконки и шрифты: качаются один раз и дальше берутся из памяти телефона.
var CACHE = "uh-app-v5", IMG = "uh-img-v1";
var CORE = ["./", "manifest.json", "favicon.ico", "icon-32.png", "icon-16.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"];
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).catch(function () {}).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE && k !== IMG; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
function sig(r) { return r ? (r.headers.get("etag") || r.headers.get("last-modified") || r.headers.get("content-length") || "") : ""; }
function tell(msg) { self.clients.matchAll({ type: "window" }).then(function (L) { L.forEach(function (c) { c.postMessage(msg); }); }); }
function fresh(req, cached) {
  return fetch(new Request(req.url, { cache: "no-cache", credentials: "same-origin" })).then(function (r) {
    if (r && r.ok) {
      var cp = r.clone();
      caches.open(CACHE).then(function (c) { c.put("./", cp); });
      if (cached && sig(cached) && sig(r) && sig(cached) !== sig(r)) tell({ t: "upd" });
    }
    return r;
  });
}
function imgFirst(req) {
  return caches.open(IMG).then(function (c) {
    return c.match(req).then(function (r) {
      return r || fetch(req).then(function (n) { if (n && (n.ok || n.type === "opaque")) c.put(req, n.clone()); return n; });
    });
  });
}
self.addEventListener("message", function (e) {
  var d = e.data || {};
  if (d.t !== "warm" || !d.u) return;
  // прогрев миниатюр по одной, без спешки — чтобы каталог потом открывался мгновенно
  e.waitUntil(caches.open(IMG).then(function (c) {
    var list = d.u.slice(0, 600), i = 0;
    function next() {
      if (i >= list.length) return;
      var u = new URL(list[i++], self.registration.scope).href;
      return c.match(u).then(function (hit) { if (hit) return; return fetch(u).then(function (r) { if (r.ok) return c.put(u, r); }).catch(function () {}); }).then(next);
    }
    return next();
  }));
});
self.addEventListener("fetch", function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) { e.respondWith(imgFirst(req)); return; }
  if (url.origin !== self.location.origin) return;
  var page = req.mode === "navigate" || /\/(index\.html)?$/.test(url.pathname);
  if (page) {
    e.respondWith(caches.match("./").then(function (cached) {
      var net = fresh(req, cached);
      if (cached) { e.waitUntil(net.catch(function () {})); return cached; }
      return net.catch(function () { return caches.match(req); });
    }));
    return;
  }
  if (/\/img\//.test(url.pathname)) { e.respondWith(imgFirst(req)); return; }
  e.respondWith(caches.match(req).then(function (r) { return r || fetch(req).then(function (n) { if (n && n.ok) { var cp = n.clone(); caches.open(CACHE).then(function (c) { c.put(req, cp); }); } return n; }); }));
});
