// Фонд «Амонат» — работает и без интернета: страница берётся свежей из сети, а если сети нет — сохранённая копия.
var C = "amonat-v4";
var CORE = ["./", "index.html", "manifest.json", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];
self.addEventListener("install", function (e) { e.waitUntil(caches.open(C).then(function (c) { return c.addAll(CORE); }).catch(function () {}).then(function () { return self.skipWaiting(); })); });
self.addEventListener("activate", function (e) { e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf("amonat-") === 0 && k !== C; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });
self.addEventListener("fetch", function (e) {
  var r = e.request; if (r.method !== "GET") return;
  var u = new URL(r.url);
  if (u.origin === location.origin && (r.mode === "navigate" || /\.html$/.test(u.pathname))) {
    e.respondWith(fetch(r).then(function (n) { if (n.ok) { var cp = n.clone(); caches.open(C).then(function (c) { c.put("index.html", cp); }); } return n; }).catch(function () { return caches.match("index.html"); }));
    return;
  }
  e.respondWith(caches.match(r).then(function (h) { return h || fetch(r).then(function (n) { if (n && (n.ok || n.type === "opaque")) { var cp = n.clone(); caches.open(C).then(function (c) { c.put(r, cp); }); } return n; }); }));
});
