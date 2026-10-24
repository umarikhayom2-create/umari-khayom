// Умари Хайём — ДОСКА ДОСТИЖЕНИЙ: сотрудники делятся лучшими результатами, все голосуют, руководство ставит оценку.
// Отдельный файл «Достижения» в проекте «Server» — САМЫМ ПОСЛЕДНИМ в списке файлов.
// Установка: «+» → «Скрипт» → имя «Достижения» → вставить → Сохранить → «Начать развёртывание» →
// «Управление развёртываниями» → ✏️ → «Новая версия» → «Начать развёртывание».
//
// Очки: каждый 👍 = +1, каждый 👎 = −1 (не ниже нуля); оценка руководства: 👌 Удовлетворительно +5, ⭐ Отлично +15, 💎 Гениально +40.
// Звёзды поста: ★ от 5 очков, ★★ от 15, ★★★ от 30, ★★★★ от 50, ★★★★★ от 80.
// Рейтинг месяца: сумма очков всех постов сотрудника за месяц.

var DS = { BOSS: { director: 1, admin: 1, badmin: 1 }, BP: [0, 5, 15, 40], STARS: [5, 15, 30, 50, 80], PER_DAY: 3,
  RN: { director: "Руководитель", admin: "Администратор", accountant: "Бухгалтер", operator: "Оператор", sales: "Торговый представитель", content: "Контент-менеджер", courier: "Курьер", merch: "Мерчандайзер", badmin: "Администратор филиала", manager: "Менеджер", seller: "Продавец-консультант", cashier: "Кассир", store: "Кладовщик" } };

var DS_ROUTE0 = route;
route = function (p) {
  var a = String(p.a || ""), u = null, pre = a.slice(0, 5);
  if (pre === "t_ds_") { var me = staff(p); if (!me) return { ok: false, error: "auth" }; if (me.role === "partner") return { ok: false, error: "role" }; u = { k: "staff", w: me.who, r: me.role }; }
  else if (pre === "k_ds_") { var c = courTok(p.tok); if (!c) return { ok: false, error: "tok" }; u = { k: "cour", w: c.nm, r: "courier", lg: c.login }; }
  else if (pre === "m_ds_") { var m = mTok(p.tok); if (!m) return { ok: false, error: "tok" }; u = { k: "merch", w: m.nm, r: m.role || "merch", lg: m.login }; }
  else return DS_ROUTE0(p);
  return dsAct(a.slice(5), u, p);
};

function dsSh() { return sheet("dost", ["id", "json", "ts"]); }
function dsAll() {
  var sh = dsSh(), n = sh.getLastRow(), L = [];
  if (n < 2) return { sh: sh, L: L };
  sh.getRange(2, 1, n - 1, 2).getValues().forEach(function (r, i) {
    if (!r[0]) return;
    try { var o = JSON.parse(r[1]); o.row = i + 2; L.push(o); } catch (x) {}
  });
  return { sh: sh, L: L };
}
function dsPut(sh, o) { var row = o.row; delete o.row; var v = ["'" + o.id, JSON.stringify(o), o.c]; if (row) sh.getRange(row, 1, 1, 3).setValues([v]); else sh.appendRow(v); o.row = row; }
function dsKey(u) { return u.k + "|" + (u.lg || u.r + ":" + String(u.w).toLowerCase()); }
function dsBr(u) { try { var id = brOf(u), b = brGet().filter(function (x) { return x.id === id; })[0]; return b ? b.nm : ""; } catch (x) { return ""; } }
function dsPts(o) {
  var up = 0, dn = 0; Object.keys(o.v || {}).forEach(function (k) { if (o.v[k] > 0) up++; else if (o.v[k] < 0) dn++; });
  var pts = Math.max(0, up - dn) + DS.BP[(o.boss && o.boss.lvl) || 0];
  var st = 0; DS.STARS.forEach(function (t) { if (pts >= t) st++; });
  return { up: up, dn: dn, pts: pts, st: st };
}
function dsMonth(ts) { return Utilities.formatDate(new Date(ts), "Asia/Dushanbe", "yyyy-MM"); }
function dsView(o, pk) {
  var s = dsPts(o);
  return { id: o.id, c: o.c, by: { w: o.by.w, rn: o.by.rn, br: o.by.br, me: o.by.pk === pk }, t: o.t, ph: o.ph || [], task: o.task || null,
    up: s.up, dn: s.dn, pts: s.pts, st: s.st, my: (o.v || {})[pk] || 0, why: o.why || [], boss: o.boss || null };
}

function dsAct(act, u, p) {
  var pk = dsKey(u), boss = !!DS.BOSS[u.r];
  if (act === "list") {
    var A = dsAll(), mon = /^\d{4}-\d{2}$/.test(String(p.m || "")) ? p.m : dsMonth(Date.now());
    var feed = A.L.filter(function (o) { return o.st !== "hide" && o.c > Date.now() - 62 * 864e5; }).sort(function (a, b) { return b.c - a.c; }).slice(0, 120).map(function (o) { return dsView(o, pk); });
    var by = {};
    A.L.forEach(function (o) {
      if (o.st === "hide" || dsMonth(o.c) !== mon) return;
      var s = dsPts(o), r = by[o.by.pk] || (by[o.by.pk] = { w: o.by.w, rn: o.by.rn, br: o.by.br, pts: 0, n: 0, st: 0, top: 0, me: o.by.pk === pk });
      r.pts += s.pts; r.n++; r.st += s.st; if (o.boss && o.boss.lvl === 3) r.top++;
    });
    var top = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return b.pts - a.pts || b.st - a.st || b.n - a.n; }).slice(0, 50);
    return { ok: true, feed: feed, top: top, m: mon, me: { w: u.w, boss: boss, pk: pk } };
  }
  if (act === "new") {
    var t = clean(p.t, 600); if (t.length < 5) return { ok: false, error: "text" };
    var d0 = Date.now() - 864e5, mine = dsAll().L.filter(function (o) { return o.by.pk === pk && o.c > d0; }).length;
    if (mine >= DS.PER_DAY) return { ok: false, error: "limit" };
    var ph = (Array.isArray(p.ph) ? p.ph : []).slice(0, 3).map(function (d, i) { try { return kSavePhoto(d, "dost_" + Date.now() + "_" + i); } catch (x) { return ""; } }).filter(String);
    var task = p.task && p.task.id ? { id: clean(p.task.id, 40), t: clean(p.task.t, 160) } : null;
    return locked(function () {
      var A = dsAll(), o = { id: "d" + Date.now() + Math.floor(Math.random() * 1000), c: Date.now(), by: { pk: pk, w: u.w, r: u.r, rn: DS.RN[u.r] || u.r, br: dsBr(u) }, t: t, ph: ph, task: task, v: {}, why: [], boss: null, st: "ok" };
      dsPut(A.sh, o); return { ok: true, post: dsView(o, pk) };
    });
  }
  return locked(function () {
    var A = dsAll(), o = A.L.filter(function (z) { return z.id === String(p.id || ""); })[0];
    if (!o || o.st === "hide") return { ok: false, error: "none" };
    if (act === "vote") {
      if (o.by.pk === pk) return { ok: false, error: "own" };
      var v = +p.v > 0 ? 1 : +p.v < 0 ? -1 : 0;
      o.v = o.v || {}; o.why = (o.why || []).filter(function (x) { return x.pk !== pk; });
      if (v < 0) { var why = clean(p.why, 200); if (why.length < 3) return { ok: false, error: "why" }; o.why.push({ pk: pk, w: u.w, t: why }); }
      if (v) o.v[pk] = v; else delete o.v[pk];
      dsPut(A.sh, o); return { ok: true, post: dsView(o, pk) };
    }
    if (act === "boss") {
      if (!boss) return { ok: false, error: "role" };
      if (o.by.pk === pk) return { ok: false, error: "own" };
      var lvl = Math.max(0, Math.min(3, Math.round(+p.lvl || 0)));
      o.boss = lvl ? { lvl: lvl, w: u.w, rn: DS.RN[u.r] || u.r, c: clean(p.c, 200), t: Date.now() } : null;
      dsPut(A.sh, o); return { ok: true, post: dsView(o, pk) };
    }
    if (act === "del") {
      if (o.by.pk !== pk && !boss) return { ok: false, error: "role" };
      o.st = "hide"; o.hideBy = u.w; dsPut(A.sh, o); return { ok: true };
    }
    return { ok: false, error: "action" };
  });
}
