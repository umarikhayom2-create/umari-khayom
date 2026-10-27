// Умари Хайём · Branch — Филиал: поставки и доставки из приложения сотрудника. Файлы держать в этом порядке.
var BR_EDIT = { badmin: 1, manager: 1, store: 1 };        // кто в филиале оформляет поставки и доставки
var BR_ROUTE0 = route;
route = function (p) {
  var a = String(p.a || "");
  if (a.indexOf("m_sp_") === 0 || a.indexOf("m_dl_") === 0) {
    var mm = mTok(p.tok); if (!mm) return { ok: false, error: "tok" };
    var u = { k: "merch", w: mm.nm, r: mm.role || "merch", lg: mm.login, ph: mm.ph || "" };
    var bid = brOf(u), b = brGet().filter(function (x) { return x.id === bid; })[0];
    if (!b) return { ok: false, error: "nobranch" };
    var can = !!BR_EDIT[u.r];
    if (a.indexOf("m_sp_") === 0) return brSup(a.slice(5), u, b, can, p);
    return brDlv(a.slice(5), u, b, can, p);
  }
  return BR_ROUTE0(p);
};
// ---------- поставки филиала ----------
function brSup(act, u, b, can, p) {
  var me = { who: u.w + " (" + b.nm + ")", role: u.r };
  if (act === "list") {
    var lim = Date.now() - 60 * 864e5;
    var L = supAll().L.filter(function (o) { return o.br === b.id && (o.st === "plan" || o.st === "go" || (o.ts || 0) > lim); }).map(function (o) { delete o.row; return o; }).sort(function (x, y) { return y.ts - x.ts; });
    return { ok: true, list: L, can: can };
  }
  if (!can) return { ok: false, error: "role" };
  return locked(function () {
    var A = supAll();
    if (act === "save") {
      var s = supClean(p.s); if (!s.items.length) return { ok: false, error: "items" };
      s.to = { t: b.nm + (b.ad ? ", " + b.ad : "") };
      var o = s; o.id = "s" + Date.now() + Math.floor(Math.random() * 1000); o.no = supNo(); o.st = "plan"; o.c = Date.now(); o.ts = o.c; o.by = me.who; o.br = b.id; o.log = [];
      supLog(o, me, "Запланировал поставку в филиал");
      supPut(A.sh, o); return { ok: true, id: o.id, no: o.no };
    }
    if (act === "st") {
      var st = String(p.st || ""), x = A.L.filter(function (z) { return z.id === String(p.id || ""); })[0];
      if (!x || x.br !== b.id) return { ok: false, error: "none" };
      var okMove = (x.st === "plan" && (st === "go" || st === "cancel")) || (x.st === "go" && (st === "done" || st === "cancel"));
      if (!okMove) return { ok: false, error: "st" };
      x.st = st; x.ts = Date.now();
      if (st === "go") { if (!x.resp) x.resp = me.who; x.goAt = x.ts; supLog(x, me, "Забрал товар, везёт в филиал"); }
      if (st === "cancel") supLog(x, me, "Отменил поставку");
      if (st === "done") {
        var r = Array.isArray(p.r) ? p.r : [], diff = [];
        (x.items || []).forEach(function (it, i) { var v = r[i] != null && isFinite(+r[i]) ? Math.max(0, +r[i]) : it.q; it.r = v; if (v !== it.q) diff.push(it.n + ": " + v + " из " + it.q); });
        x.rc = clean(p.rc, 300); x.doneAt = x.ts;
        supLog(x, me, "Принял в филиале" + (diff.length ? ". Расхождение — " + diff.join("; ") : ", всё сходится") + (x.rc ? ". " + x.rc : ""));
      }
      supPut(A.sh, x); return { ok: true };
    }
    return { ok: false, error: "action" };
  });
}
// ---------- доставки из филиала (через курьеров) ----------
function brDlv(act, u, b, can, p) {
  if (act === "list") {
    var lim = Date.now() - 14 * 864e5;
    return { ok: true, can: can, list: jobAll().L.filter(function (o) { return o.kind === "branch" && o.br === b.id && (o.st === "ready" || o.st === "taken" || o.ts > lim || (o.hand && o.hand.st === "hand")); }).map(function (o) { delete o.row; return o; }).sort(function (x, y) { return y.ts - x.ts; }) };
  }
  if (!can) return { ok: false, error: "role" };
  return locked(function () {
    if (act === "new") {
      var to = p.to || {}; if (!clean(to.ad, 200) || !clean(to.ph, 30)) return { ok: false, error: "to" };
      var sum = Math.max(0, Math.round((+p.sum || 0) * 100) / 100), cod = Math.max(0, Math.min(sum || 1e9, Math.round((+p.cod || 0) * 100) / 100));
      var its = String(p.items || "").split(/\n|;/).map(function (x) { return clean(x, 120); }).filter(String).slice(0, 30).map(function (x) { return { n: x, q: 1, l: "" }; });
      var pr = PropertiesService.getScriptProperties(), k = "brn:" + b.id, n = (+pr.getProperty(k) || 0) + 1; pr.setProperty(k, String(n));
      var no = "Ф" + (brGet().map(function (x) { return x.id; }).indexOf(b.id) + 1) + "-" + n;
      var o = jobPut({ key: "B|" + b.id + "|" + n, no: no, kind: "branch", from: { t: "Филиал «" + b.nm + "»", addr: b.ad || "", ph: u.ph || "" }, to: to, sum: sum, cod: cod, n: its.length, items: its });
      var J = jobAll(), x = J.L.filter(function (z) { return z.key === o.key; })[0]; if (x) { x.br = b.id; x.by = u.w; jobSave(J.sh, x); }
      return { ok: true, no: no };
    }
    var J2 = jobAll(), j = J2.L.filter(function (z) { return z.key === String(p.key || ""); })[0];
    if (!j || j.kind !== "branch" || j.br !== b.id) return { ok: false, error: "none" };
    if (act === "cancel") { if (j.st !== "ready") return { ok: false, error: "st" }; j.st = "cancel"; j.log.push({ ts: Date.now(), st: "cancel", w: u.w }); jobSave(J2.sh, j); return { ok: true }; }
    if (act === "cashok") { if (!j.hand || j.hand.st !== "hand") return { ok: false, error: "none" }; j.hand.st = "ok"; j.hand.ok = { ts: Date.now(), w: u.w + " (" + b.nm + ")" }; j.log.push({ ts: Date.now(), st: "cash", w: u.w, cash: j.hand.amt }); jobSave(J2.sh, j); C().remove("krt:" + (j.hand.login || "")); return { ok: true }; }
    return { ok: false, error: "action" };
  });
}
