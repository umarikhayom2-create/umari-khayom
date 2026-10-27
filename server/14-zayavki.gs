// Умари Хайём · Заявки — Заявки на сборку между филиалами и складами (сборка и вызов курьера — в файле «Обновление»). Файлы держать в этом порядке.

var ZV_ROUTE0 = route;
route = function (p) {
  var a = String(p.a || "");
  if (a.indexOf("m_zv_") !== 0) return ZV_ROUTE0(p);
  var mm = mTok(p.tok); if (!mm) return { ok: false, error: "tok" };
  var u = { k: "merch", w: mm.nm, r: mm.role || "merch", lg: mm.login, ph: mm.ph || "" };
  var bid = brOf(u), B = brGet(), b = B.filter(function (x) { return x.id === bid; })[0];
  if (!b) return { ok: false, error: "nobranch" };
  return zvAct(a.slice(5), u, b, B, p);
};

function zvSh() { return sheet("zv", ["id", "json", "ts"]); }
function zvAll() {
  var sh = zvSh(), n = sh.getLastRow(), L = [];
  if (n < 2) return { sh: sh, L: L };
  sh.getRange(2, 1, n - 1, 2).getValues().forEach(function (r, i) {
    if (!r[0]) return;
    try { var o = JSON.parse(r[1]); o.row = i + 2; L.push(o); } catch (x) {}
  });
  return { sh: sh, L: L };
}
function zvPut(sh, o) {
  var row = o.row; delete o.row;
  var v = ["'" + o.id, JSON.stringify(o), o.ts];
  if (row) sh.getRange(row, 1, 1, 3).setValues([v]); else sh.appendRow(v);
  C().put("zvv", String(Date.now()), 21600);
}
function zvSees(o, bid) { return o.by.b === bid || o.pub || (o.to || []).indexOf(bid) > -1; }
function zvGot(it) { var s = 0; (it.g || []).forEach(function (g) { s += +g.q || 0; }); return Math.round(s * 1000) / 1000; }
function zvView(o) { var x = JSON.parse(JSON.stringify(o)); delete x.row; return x; }

function zvAct(act, u, b, B, p) {
  var who = u.w;
  if (act === "list") {
    var lim = Date.now() - 14 * 864e5;
    var L = zvAll().L.filter(function (o) { return zvSees(o, b.id) && (o.st === "open" || o.ts > lim); })
    .sort(function (x, y) { return y.c - x.c; }).slice(0, 80).map(zvView);
    return { ok: true, list: L, me: b.id, br: B.map(function (x) { return { id: x.id, nm: x.nm }; }), v: C().get("zvv") || "" };
  }

  if (act === "new") {
    var raw = Array.isArray(p.items) ? p.items.slice(0, 60) : [];
    var items = raw.map(function (it, i) {
      var o = { n: clean(it && it.n, 120), q: Math.max(0, Math.round((+it.q || 0) * 1000) / 1000), g: [] };
      if (it && it.ph) { try { o.ph = kSavePhoto(it.ph, "zv_" + b.id + "_" + Date.now() + "_" + i); } catch (x) { o.ph = ""; } }
      if (!o.ph) delete o.ph;
      if (!o.n && o.ph) o.n = "Товар по фото";
      return o;
    }).filter(function (o) { return (o.n || o.ph) && o.q > 0; });
    if (!items.length) return { ok: false, error: "items" };
    var ids = {}; B.forEach(function (x) { ids[x.id] = 1; });
    var to = (Array.isArray(p.to) ? p.to : []).map(String).filter(function (x) { return ids[x] && x !== b.id; });
    var pub = !!p.pub || !to.length;
    return locked(function () {
      var A = zvAll(), pr = PropertiesService.getScriptProperties(), n = (+pr.getProperty("zvn") || 0) + 1;
      pr.setProperty("zvn", String(n));
      var o = { id: "z" + Date.now() + Math.floor(Math.random() * 1000), no: "З-" + n, c: Date.now(), ts: Date.now(),
        by: { w: who, b: b.id, bn: b.nm, ph: u.ph || "" }, pub: pub, to: pub ? [] : to, cm: clean(p.cm, 300), st: "open", items: items, packs: [] };
      zvPut(A.sh, o);
      return { ok: true, no: o.no };
    });
  }

  return locked(function () {
    var A = zvAll(), o = A.L.filter(function (z) { return z.id === String(p.id || ""); })[0];
    if (!o || !zvSees(o, b.id)) return { ok: false, error: "none" };

    if (act === "close" || act === "open") {
      if (o.by.b !== b.id) return { ok: false, error: "role" };
      o.st = act === "close" ? "cancel" : "open"; o.ts = Date.now(); zvPut(A.sh, o); return { ok: true };
    }
    return { ok: false, error: "action" };
  });
}
