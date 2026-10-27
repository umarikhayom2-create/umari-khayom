// Умари Хайём — сервис-воркер.
// Страница: всегда пытаемся взять свежую из сети; если сеть не ответила за 3 секунды — показываем сохранённую копию.
// Фото, миниатюры, иконки, шрифты: качаются один раз и дальше берутся из памяти телефона.
var CACHE = "uh-app-v14", IMG = "uh-img-v1";
var CORE = ["manifest.json", "favicon.ico", "icon-32.png", "icon-16.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png", "logo.png"];
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).catch(function () {}).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE && k !== IMG; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
// «Чистая» копия ответа: браузер не принимает для открытия страницы ответы, полученные через перенаправление
function cleanCopy(r) { return r.blob().then(function (b) { return new Response(b, { status: r.status, statusText: r.statusText, headers: r.headers }); }); }
function pageKey(url) { var u = new URL(url); u.hash = ""; u.search = ""; if (/\/$/.test(u.pathname)) u.pathname += "index.html"; return u.href; }
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
  if (/\.apk$/.test(url.pathname) || /\/\.well-known\//.test(url.pathname)) return; // файл приложения всегда свежий, не кэшируем
  if (req.mode === "navigate" || /\.html$/.test(url.pathname) || /\/$/.test(url.pathname)) {
    var key = pageKey(req.url);
    var net = fetch(req.url, { cache: "no-cache", credentials: "same-origin" }).then(function (r) {
      if (!r || !r.ok) return r;
      return cleanCopy(r).then(function (clean) { var cp = clean.clone(); caches.open(CACHE).then(function (c) { c.put(key, cp); }); return clean; });
    });
    e.respondWith(new Promise(function (resolve) {
      var done = false, give = function (r) { if (!done && r) { done = true; resolve(r); } };
      net.then(give, function () { caches.match(key).then(function (c) { if (c) give(c); else if (!done) { done = true; resolve(Response.error()); } }); });
      setTimeout(function () { caches.match(key).then(function (c) { if (c) give(c); }); }, 3000);
    }));
    return;
  }
  if (/\/img\//.test(url.pathname)) { e.respondWith(imgFirst(req)); return; }
  e.respondWith(caches.match(req).then(function (r) { return r || fetch(req).then(function (n) { if (n && n.ok && !n.redirected) { var cp = n.clone(); caches.open(CACHE).then(function (c) { c.put(req, cp); }); } return n; }); }));
});
