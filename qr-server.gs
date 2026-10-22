// Оплата по единому QR — отдельный файл QR.gs в проекте ЧАТА (рядом с Чат.gs). Чат.gs менять не нужно.
var QR_ROUTE0 = route;
route = function (p) {
  var a = String(p.a || "");
  if (a === "c_qrpay") return qrClaim(p);
  if (a === "c_qrst") return { ok: true, st: qrSt(p.nos) };
  if (a === "s_qr" || a === "s_qrset") {
    var me = staff(p); if (!me) return { ok: false, error: "auth" };
    if (me.role === "partner" || me.role === "content") return { ok: false, error: "role" };
    if (a === "s_qr") return { ok: true, L: qrAll().L.filter(function (o) { return o.st === "wait" || Date.now() - (o.ts || 0) < 14 * 864e5; }) };
    return locked(function () { return qrSet(me, p); });
  }
  return QR_ROUTE0(p);
};
function qrSh() { return sheet("qrpay", ["no", "json", "ts"]); }
function qrAll() {
  var sh = qrSh(), n = sh.getLastRow(), L = [];
  if (n > 1) sh.getRange(2, 1, n - 1, 2).getValues().forEach(function (r, i) { if (!r[0]) return; try { var o = JSON.parse(r[1] || "{}"); o.no = String(r[0]); o.row = i + 2; L.push(o); } catch (x) {} });
  return { sh: sh, L: L };
}
function qrPut(sh, o) { var row = o.row; delete o.row; var v = [o.no, JSON.stringify(o), o.ts || Date.now()]; if (row) sh.getRange(row, 1, 1, 3).setValues([v]); else sh.appendRow(v); }
function qrClaim(p) {
  var no = clean(p.no, 20), amt = Math.round((+p.amt || 0) * 100) / 100;
  if (!/^[\w\-\/]{1,20}$/.test(no)) return { ok: false, error: "no" };
  if (!(amt > 0) || amt > 1000000) return { ok: false, error: "amt" };
  var ph = clean(p.ph, 30), rk = "qrl:" + (ph.replace(/\D/g, "").slice(-9) || no), rl = +(C().get(rk) || 0);
  if (rl > 10) return { ok: false, error: "slow" };
  C().put(rk, String(rl + 1), 600);
  return locked(function () {
    var A = qrAll(), o = A.L.filter(function (x) { return x.no === no; })[0];
    if (o && o.st === "ok") return { ok: true, st: "ok" };
    if (!o) o = { no: no, log: [] };
    o.amt = amt; o.sum = +p.sum || 0; o.nm = clean(p.nm, 60); o.ph = ph; o.bank = clean(p.bank, 40); o.cm = clean(p.cm, 200);
    o.st = "wait"; o.ts = Date.now(); o.log = (o.log || []).slice(-20); o.log.push({ ts: o.ts, t: "Клиент сообщил об оплате " + amt + " сом." });
    qrPut(A.sh, o);
    return { ok: true, st: "wait" };
  });
}
function qrSt(nos) {
  var want = {}; (Array.isArray(nos) ? nos : String(nos || "").split(",")).slice(0, 200).forEach(function (n) { want[String(n)] = 1; });
  var r = {}; qrAll().L.forEach(function (o) { if (want[o.no]) r[o.no] = { st: o.st, amt: o.amt, ts: o.ts, why: o.why || "" }; });
  return r;
}
function qrSet(me, p) {
  var no = clean(p.no, 20), st = String(p.st || "");
  if (["ok", "rej", "wait"].indexOf(st) < 0) return { ok: false, error: "st" };
  var A = qrAll(), o = A.L.filter(function (x) { return x.no === no; })[0];
  if (!o) { if (st !== "ok") return { ok: false, error: "none" }; o = { no: no, log: [], amt: +p.amt || 0 }; }
  o.st = st; o.why = clean(p.why, 200); o.by = me.who; o.done = Date.now();
  o.log = (o.log || []).slice(-20); o.log.push({ ts: o.done, t: (st === "ok" ? "Оплата найдена в Алиф" : st === "rej" ? "Оплата не найдена" : "На проверке") + " — " + me.who });
  qrPut(A.sh, o);
  return { ok: true, o: o };
}
