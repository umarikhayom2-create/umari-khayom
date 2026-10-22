// Умари Хайём — ПОСТАВКИ (склад / рынок / партнёр → магазин).
// Это ОТДЕЛЬНЫЙ файл в проекте «Server» (сервер чата). Файл «Чат.gs» НЕ удалять и НЕ менять.
// Установка: в проекте «Server» нажмите «+» рядом с «Файлы» → «Скрипт» → имя «Поставки» →
// вставьте этот текст → Сохранить → «Начать развёртывание» → «Управление развёртываниями» → ✏️ →
// Версия: «Новая версия» → «Начать развёртывание».
// Этот файл перехватывает только запросы, начинающиеся на "sp_"; всё остальное уходит в чат как раньше.

var SUP_SEE = { operator: 1, admin: 1, director: 1, accountant: 1 };
var SUP_EDIT = { operator: 1, admin: 1, director: 1 };
var SUP_ST = { plan: 1, go: 1, done: 1, cancel: 1 };

function doPost(e) {
  var p = {};
  try { p = JSON.parse(e.postData.contents || "{}"); } catch (x) { return out({ ok: false, error: "json" }); }
  try {
    if (String(p.a || "").indexOf("sp_") === 0) return out(supAct(p));
    return out(route(p));
  } catch (x) { return out({ ok: false, error: String(x && x.message || x).slice(0, 150) }); }
}

function supSh() { return sheet("sup", ["id", "no", "json", "ts", "st"]); }
function supAll() {
  var sh = supSh(), n = sh.getLastRow(), L = [];
  if (n < 2) return { sh: sh, L: L };
  sh.getRange(2, 1, n - 1, 3).getValues().forEach(function (r, i) {
    if (!r[0]) return;
    try { var o = JSON.parse(r[2]); o.row = i + 2; L.push(o); } catch (x) {}
  });
  return { sh: sh, L: L };
}
function supPut(sh, o) {
  var row = o.row; delete o.row;
  var v = ["'" + o.id, "'" + o.no, JSON.stringify(o), o.ts || Date.now(), o.st];
  if (row) sh.getRange(row, 1, 1, 5).setValues([v]); else sh.appendRow(v);
}
function supClean(s) {
  s = s || {};
  var fk = ["wh", "mkt", "part", "oth"].indexOf(String((s.from || {}).k)) > -1 ? s.from.k : "wh";
  var items = (Array.isArray(s.items) ? s.items : []).slice(0, 200).map(function (it) {
    var o = { n: clean(it && it.n, 120), q: Math.max(0, Math.round((+it.q || 0) * 1000) / 1000), u: ["u", "p", "b"].indexOf(it.u) > -1 ? it.u : "u" };
    if (it.i != null && isFinite(+it.i)) o.i = +it.i;
    if (it.m) o.m = 1;
    return o;
  }).filter(function (it) { return it.n && it.q > 0; });
  return { from: { k: fk, t: fk === "wh" ? "" : clean(s.from.t, 150) }, to: { t: clean((s.to || {}).t, 150) || "Магазин" },
    when: +s.when || 0, resp: clean(s.resp, 60), cm: clean(s.cm, 300), items: items };
}
function supLog(o, me, x) { o.log = o.log || []; o.log.push({ t: Date.now(), w: me.who, r: me.role, x: clean(x, 300) }); if (o.log.length > 60) o.log = o.log.slice(-60); }
function supNo() {
  var pr = PropertiesService.getScriptProperties(), y = Utilities.formatDate(new Date(), "Asia/Dushanbe", "yyyy"), k = "supn:" + y, n = (+pr.getProperty(k) || 0) + 1;
  pr.setProperty(k, String(n)); return y + "/" + n;
}
function supAct(p) {
  var me = staff(p);
  if (!me) return { ok: false, error: "auth" };
  if (!SUP_SEE[me.role]) return { ok: false, error: "role" };
  var a = p.a;
  if (a === "sp_list") {
    var lim = Date.now() - Math.min(365, Math.max(1, +p.days || 90)) * 864e5;
    var L = supAll().L.filter(function (o) { return o.st === "plan" || o.st === "go" || (o.ts || 0) > lim; });
    L.forEach(function (o) { delete o.row; });
    return { ok: true, list: L };
  }
  if (!SUP_EDIT[me.role]) return { ok: false, error: "role" };
  if (a === "sp_save") return locked(function () {
    var s = supClean(p.s);
    if (!s.items.length) return { ok: false, error: "items" };
    var A = supAll(), id = String((p.s || {}).id || ""), o = id ? A.L.filter(function (x) { return x.id === id; })[0] : null;
    if (id && !o) return { ok: false, error: "none" };
    if (o) {
      if (o.st !== "plan") return { ok: false, error: "st" };
      Object.keys(s).forEach(function (k) { o[k] = s[k]; });
      o.ts = Date.now(); supLog(o, me, "Изменил поставку");
    } else {
      o = s; o.id = "s" + Date.now() + Math.floor(Math.random() * 1000); o.no = supNo(); o.st = "plan"; o.c = Date.now(); o.ts = o.c; o.by = me.who; o.log = [];
      supLog(o, me, "Запланировал поставку");
    }
    supPut(A.sh, o);
    return { ok: true, id: o.id, no: o.no };
  });
  if (a === "sp_st") return locked(function () {
    var st = String(p.st || ""); if (!SUP_ST[st] || st === "plan") return { ok: false, error: "bad" };
    var A = supAll(), o = A.L.filter(function (x) { return x.id === String(p.id || ""); })[0];
    if (!o) return { ok: false, error: "none" };
    var okMove = (o.st === "plan" && (st === "go" || st === "cancel")) || (o.st === "go" && (st === "done" || st === "cancel"));
    if (!okMove) return { ok: false, error: "st" };
    o.st = st; o.ts = Date.now();
    if (st === "go") { if (!o.resp) o.resp = me.who; o.goAt = o.ts; supLog(o, me, "Забрал товар, везёт в магазин"); }
    if (st === "cancel") supLog(o, me, "Отменил поставку");
    if (st === "done") {
      var r = Array.isArray(p.r) ? p.r : [], diff = [];
      (o.items || []).forEach(function (it, i) {
        var v = r[i] != null && isFinite(+r[i]) ? Math.max(0, +r[i]) : it.q; it.r = v;
        if (v !== it.q) diff.push(it.n + ": " + v + " из " + it.q);
      });
      o.rc = clean(p.rc, 300); o.doneAt = o.ts;
      supLog(o, me, "Принял в магазине" + (diff.length ? ". Расхождение — " + diff.join("; ") : ", всё сходится") + (o.rc ? ". " + o.rc : ""));
    }
    supPut(A.sh, o);
    return { ok: true };
  });
  return { ok: false, error: "action" };
}
