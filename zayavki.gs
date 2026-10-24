// Умари Хайём — ЗАЯВКИ НА СБОРКУ между филиалами и складами (пополнение полок).
// Отдельный файл «Заявки» в проекте «Server» (сервер чата) — САМЫМ ПОСЛЕДНИМ в списке файлов (после Branch.gs).
// Установка: «+» рядом с «Файлы» → «Скрипт» → имя «Заявки» → вставить этот текст → Сохранить →
// «Начать развёртывание» → «Управление развёртываниями» → ✏️ → Версия: «Новая версия» → «Начать развёртывание».
// Перехватывает только запросы "m_zv_…"; всё остальное идёт дальше как раньше.
//
// Как работает:
//  • любой сотрудник филиала (или склада, заведённого как филиал) создаёт заявку: позиции текстом и/или фото + количество;
//  • заявку видят выбранные филиалы, а если она «общая» — все филиалы;
//  • сборщик ставит галочку и, если нужно, меняет количество («собрано 8 из 10»); собранное видно всем серым;
//  • «Готово — вызвать курьера» создаёт доставку курьерам: из филиала-сборщика в филиал-заказчик.

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
    // фото сохраняем ДО блокировки — это самое долгое
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

    // галочка: сколько собрал мой филиал по позиции i (q = 0 — снять галочку)
    if (act === "pick") {
      if (o.st !== "open") return { ok: false, error: "st" };
      var it = o.items[+p.i]; if (!it) return { ok: false, error: "none" };
      it.g = it.g || [];
      var mine = it.g.filter(function (g) { return g.b === b.id && !g.s; })[0];
      var q = Math.max(0, Math.round((+p.q || 0) * 1000) / 1000);
      if (mine) { if (q > 0) { mine.q = q; mine.w = who; mine.t = Date.now(); } else it.g.splice(it.g.indexOf(mine), 1); }
      else if (q > 0) it.g.push({ b: b.id, bn: b.nm, q: q, w: who, t: Date.now() });
      o.ts = Date.now(); zvPut(A.sh, o); return { ok: true, item: it };
    }

    // сборка готова → доставка курьерам из моего филиала в филиал-заказчик
    if (act === "send") {
      var lines = [];
      o.items.forEach(function (it) { (it.g || []).forEach(function (g) { if (g.b === b.id && !g.s && g.q > 0) lines.push({ it: it, g: g }); }); });
      if (!lines.length) return { ok: false, error: "empty" };
      var dst = B.filter(function (x) { return x.id === o.by.b; })[0] || { nm: o.by.bn, ad: "" };
      if (dst.id === b.id) {               // собрали у себя же — курьер не нужен
        lines.forEach(function (l) { l.g.s = 1; });
        o.packs.push({ b: b.id, bn: b.nm, t: Date.now(), w: who, self: 1, n: lines.length });
      } else {
        var k = o.packs.length + 1, no = o.no + "/" + k;
        var its = lines.slice(0, 30).map(function (l) { return { n: l.it.n, q: l.g.q, l: "" }; });
        var job = jobPut({ key: "Z|" + o.id + "|" + k, no: no, kind: "branch",
          from: { t: "Филиал «" + b.nm + "»", addr: b.ad || "", ph: u.ph || "" },
          to: { nm: "Филиал «" + dst.nm + "»", ph: o.by.ph || "", ad: dst.ad || dst.nm, cty: "Душанбе", pay: "Без оплаты", cm: "Поставка по заявке " + o.no + " (" + o.by.w + ")" },
          sum: 0, cod: 0, n: its.length, items: its });
        var J = jobAll(), x = J.L.filter(function (z) { return z.key === job.key; })[0];
        if (x) { x.br = b.id; x.by = who; x.zv = o.id; jobSave(J.sh, x); }
        lines.forEach(function (l) { l.g.s = 1; });
        o.packs.push({ b: b.id, bn: b.nm, t: Date.now(), w: who, no: no, key: job.key, n: lines.length });
      }
      var left = o.items.some(function (it) { return zvGot(it) < it.q; });
      if (!left) o.st = "done";
      o.ts = Date.now(); zvPut(A.sh, o); return { ok: true, no: (o.packs[o.packs.length - 1] || {}).no || "" };
    }

    // заказчик закрывает заявку (больше не нужно) или открывает снова
    if (act === "close" || act === "open") {
      if (o.by.b !== b.id) return { ok: false, error: "role" };
      o.st = act === "close" ? "cancel" : "open"; o.ts = Date.now(); zvPut(A.sh, o); return { ok: true };
    }
    return { ok: false, error: "action" };
  });
}
