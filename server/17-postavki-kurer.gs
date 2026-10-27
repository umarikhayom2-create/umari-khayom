// Умари Хайём · ПоставкиКурьер — Поставки через курьеров: курьер берёт → «Везут» → «Доставлено» → филиал принимает. Файлы держать в этом порядке.

var SPK = { PFX: "SP|", FROM: { wh: "Склад", mkt: "Рынок", part: "Партнёр", oth: "Другое" } };

function spkKey(id) { return SPK.PFX + id; }
function spkTo(o) {
  var b = o.br ? (brGet().filter(function (x) { return x.id === o.br; })[0] || null) : null;
  var nm = b ? "Филиал «" + b.nm + "»" : ((o.to || {}).t || "Магазин");
  return { nm: nm, ad: b ? (b.ad || b.nm) : nm, cty: "Душанбе", pay: "Без оплаты", ph: "",
    cm: "Поставка № " + o.no + (o.cm ? ". " + o.cm : "") };
}
function spkFrom(o) {
  var f = o.from || {}, t = f.t || "";
  return { t: (SPK.FROM[f.k] || "Склад") + (t ? " — " + t : ""), addr: t, ph: "" };
}
// создать (или обновить) задание курьерам по поставке
function spkJob(o) {
  var its = (o.items || []).slice(0, 30).map(function (it) { return { n: it.n, q: it.q, l: "" }; });
  var job = jobPut({ key: spkKey(o.id), no: "П" + o.no, kind: "sup", from: spkFrom(o), to: spkTo(o), sum: 0, cod: 0, n: its.length, items: its });
  var J = jobAll(), x = J.L.filter(function (z) { return z.key === job.key; })[0];
  if (x && x.sup !== o.id) { x.sup = o.id; if (o.br) x.br = o.br; jobSave(J.sh, x); }
}
// запланированные поставки без задания (например, созданные до этой доработки) — тоже курьерам
function spkSync() {
  if (C().get("spk:sync")) return; C().put("spk:sync", "1", 60);
  var have = {}; jobAll().L.forEach(function (j) { have[j.key] = 1; });
  supAll().L.forEach(function (o) { if (o.st === "plan" && !have[spkKey(o.id)]) spkJob(o); });
}

// после действий сотрудников с поставкой
function spkAfter(act, p, r) {
  if (!r || !r.ok) return;
  if (act === "save" && r.id) {
    var o = supAll().L.filter(function (x) { return x.id === r.id; })[0];
    if (o && o.st === "plan") spkJob(o);
    return;
  }
  if (act === "st") {
    var key = spkKey(String(p.id || "")), j = jobAll().L.filter(function (z) { return z.key === key; })[0];
    if (!j) return;
    // отменили поставку — снимаем у курьеров; привезли сами — задание, которое ещё никто не взял, тоже снимаем
    if (String(p.st) === "cancel" || j.st === "ready") jobCancel(key);
  }
}
var SPK_SA0 = supAct;
supAct = function (p) { var r = SPK_SA0(p); try { locked(function () { spkAfter(String(p.a || "").slice(3), p, r); return {}; }); } catch (e) {} return r; };
var SPK_BS0 = brSup;
brSup = function (act, u, b, can, p) { var r = SPK_BS0(act, u, b, can, p); try { locked(function () { spkAfter(act, p, r); return {}; }); } catch (e) {} return r; };

// действия курьера → статус поставки
function spkOnCour(a, key) {
  var j = jobAll().L.filter(function (z) { return z.key === key; })[0]; if (!j) return;
  var A = supAll(), x = A.L.filter(function (o) { return o.id === key.slice(SPK.PFX.length); })[0]; if (!x) return;
  var nm = (j.cour && j.cour.nm) || "", last = (j.log || [])[(j.log || []).length - 1] || {}, now = Date.now();
  var me = { who: (nm || last.w || "Курьер") + " (курьер)", role: "courier" };
  if (a === "k_take") {
    if (x.st !== "plan") return;
    x.st = "go"; x.goAt = now; x.resp = nm; x.cour = { nm: nm, ph: (j.cour || {}).ph || "" }; delete x.dlv;
    supLog(x, me, "Курьер забрал поставку, везёт");
  } else if (a === "k_done") {
    if (x.st !== "go") return;
    x.dlv = now; supLog(x, me, "Курьер доставил — ждёт приёма");
  } else {
    if (x.st !== "go" || x.dlv) return;
    x.st = "plan"; delete x.cour; x.resp = "";
    supLog(x, me, a === "k_fail" ? "Курьер не смог доставить" + (last.note ? ": " + last.note : "") : "Курьер отказался — снова ждёт курьера");
  }
  x.ts = now; supPut(A.sh, x);
}
var SPK_C0 = courier;
courier = function (a, p) {
  if (a === "k_list") { try { if (!C().get("spk:sync")) locked(function () { spkSync(); return {}; }); } catch (e) {} }
  var r = SPK_C0(a, p), key = String((p || {}).key || "");
  if (r && r.ok && key.indexOf(SPK.PFX) === 0 && /^k_(take|done|fail|drop)$/.test(a)) {
    try { locked(function () { spkOnCour(a, key); return {}; }); } catch (e) {}
  }
  return r;
};
