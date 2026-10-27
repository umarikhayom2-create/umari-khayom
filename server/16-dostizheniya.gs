// Умари Хайём · Достижения — Доска достижений, очки за работу, итоги месяца в Telegram. Файлы держать в этом порядке.

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
    up: s.up, dn: s.dn, pts: s.pts, st: s.st, my: (o.v || {})[pk] || 0, why: (o.why || []).map(function (x) { return { w: x.w, t: x.t }; }), boss: o.boss || null };
}

function dsAct(act, u, p) {
  var pk = dsKey(u), boss = !!DS.BOSS[u.r];
  if (act === "list") {
    var A = dsAll(), mon = /^\d{4}-\d{2}$/.test(String(p.m || "")) ? p.m : dsMonth(Date.now());
    var feed = A.L.filter(function (o) { return o.st !== "hide" && o.c > Date.now() - 62 * 864e5; }).sort(function (a, b) { return b.c - a.c; }).slice(0, 120).map(function (o) { return dsView(o, pk); });
    var T = dsTop(mon, pk, A);
    return { ok: true, feed: feed, top: T.top, best: T.best, m: mon, me: { w: u.w, boss: boss, pk: pk } };
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
  if (act === "digest") {
    if (!boss) return { ok: false, error: "role" };
    if (typeof puReg !== "function" || !puTok()) return { ok: false, error: "notg" };
    var me2 = puReg()[pk]; if (!me2) return { ok: false, error: "nolink" };
    var mon2 = dsMonth(Date.now()); puSend(me2.c, dsDigestText(mon2, pk, true)); return { ok: true };
  }
  if (act === "sync") {
    if (u.k !== "staff" || !(u.r === "director" || u.r === "admin")) return { ok: false, error: "role" };
    var mm = /^\d{4}-\d{2}$/.test(String(p.m || "")) ? p.m : dsMonth(Date.now());
    var rows = (Array.isArray(p.rows) ? p.rows : []).slice(0, 80).map(function (x) {
      return { k: clean(x.k, 90), w: clean(x.w, 60), r: clean(x.r, 20), c: clean(x.c, 20), t: clean(x.t, 40), p: Math.max(0, Math.min(5000, Math.round(+x.p || 0))), l: clean(x.l, 200) };
    }).filter(function (x) { return x.k && x.w; });
    var js = JSON.stringify({ ts: Date.now(), rows: rows }); while (js.length > 8900 && rows.length) { rows.pop(); js = JSON.stringify({ ts: Date.now(), rows: rows }); }
    PropertiesService.getScriptProperties().setProperty("dsync:" + mm, js);
    C().remove("dswork:" + mm); return { ok: true, n: rows.length };
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

// ---------- очки за работу (считаются сами) ----------
function dsRange(mon) {
  var y = +mon.slice(0, 4), m = +mon.slice(5, 7) - 1;
  var a = Date.UTC(y, m, 1, -5), b = Date.UTC(y, m + 1, 1, -5);
  return [a, Math.min(b, Date.now())];
}
function dsHM(s) { var x = String(s || "").match(/(\d{1,2})[:.](\d{2})/); return x ? (+x[1]) * 60 + (+x[2]) : null; }
function dsWork(mon) {
  var ck = "dswork:" + mon, hit = C().get(ck); if (hit) { try { return JSON.parse(hit); } catch (x) {} }
  var R = dsRange(mon), a = R[0], b = R[1], W = {};
  var add = function (k, w, rn, br, cat, title, pts, line) {
    if (!k || !w || !(pts > 0 || line)) return;
    var x = W[k] || (W[k] = { w: w, rn: rn || "", br: br || "", pts: 0, lines: [], cat: [] });
    pts = Math.max(0, Math.round(pts)); x.pts += pts; x.lines.push({ t: title, l: line, p: pts }); x.cat.push({ k: cat, t: title, p: pts });
  };
  try {
    var S = setGet(), sh = shAll().L.filter(function (o) { return o.in >= a && o.in < b; }), per = {};
    sh.forEach(function (o) {
      var p = per[o.pk] || (per[o.pk] = { w: o.w, r: o.r, br: o.br || "", min: 0, days: {}, on: {}, late: {} });
      p.min += tClip(o.in, o.out || Date.now()) / 6e4;
      var day = Utilities.formatDate(new Date(o.in), "Asia/Dushanbe", "yyyy-MM-dd"); p.days[day] = 1;
      var st = dsHM((S[o.pk] || {}).plan);
      if (st != null && !p.on[day] && !p.late[day]) {
        var hm = +Utilities.formatDate(new Date(o.in), "Asia/Dushanbe", "H") * 60 + (+Utilities.formatDate(new Date(o.in), "Asia/Dushanbe", "m"));
        if (hm <= st + 10) p.on[day] = 1; else p.late[day] = 1;
      }
    });
    Object.keys(per).forEach(function (k) {
      var p = per[k], h = p.min / 60, d = Object.keys(p.days).length, on = Object.keys(p.on).length, lt = Object.keys(p.late).length;
      var pts = h / 2 + on * 2 - lt * 2;
      add(k, p.w, DS.RN[p.r] || p.r, p.br, "time", "⏱ Время на работе", pts,
      Math.round(h) + " ч за " + d + " дн." + (on + lt ? ", вовремя " + on + " из " + (on + lt) + " дн." : ""));
    });
  } catch (x) {}
  try {
    qRating(a, b).forEach(function (r) {
      if (!r.n) return;
      add(r.pk, r.w, DS.RN[r.r] || r.r, "", "tasks", "📋 Поручения", r.earned / 4,
      "выполнено " + r.done + " из " + r.n + (r.ontime ? ", вовремя " + r.ontime : "") + (r.late ? ", просрочено " + r.late : ""));
    });
  } catch (x) {}
  try {
    var J = jobAll().L;
    courList().forEach(function (c) {
      var s = kScore(J, { login: c.login, nm: c.nm }, a, b); if (!s.n && !s.fail) return;
      add("cour|" + c.login, c.nm, "Курьер", "", "dlv", "🚚 Доставки", s.earned / 3,
      "доставил " + s.n + (s.ontime ? ", вовремя " + s.ontime : "") + (s.photo ? ", с фото " + s.photo : "") + (s.late ? ", опоздал " + s.late : "") + (s.pct != null ? " · качество " + s.pct + "%" : ""));
    });
  } catch (x) {}
  try {
    if (typeof zvAll === "function") {
      var Z = {}, ms = typeof mList === "function" ? mList() : [], nm2 = {};
      ms.forEach(function (m) { nm2[String(m.nm || "").toLowerCase()] = m; });
      zvAll().L.forEach(function (o) { (o.items || []).forEach(function (it) { (it.g || []).forEach(function (g) {
            if (!g.t || g.t < a || g.t >= b || !g.w) return; var z = Z[g.w] || (Z[g.w] = { n: 0, q: 0, br: g.bn }); z.n++; z.q += +g.q || 0; }); }); });
      Object.keys(Z).forEach(function (w) {
        var m = nm2[w.toLowerCase()], k = m ? "merch|" + m.login : "merch|?:" + w.toLowerCase();
        add(k, w, m ? (DS.RN[m.role] || m.role) : "", Z[w].br, "pick", "🧺 Сборка заявок", Z[w].n, "собрал " + Z[w].n + " поз. (" + Math.round(Z[w].q) + " шт)");
      });
    }
  } catch (x) {}
  try {
    var sy = JSON.parse(PropertiesService.getScriptProperties().getProperty("dsync:" + mon) || "null");
    (sy && sy.rows || []).forEach(function (r) { add(r.k, r.w, DS.RN[r.r] || r.r, "", r.c, r.t, r.p, r.l); });
  } catch (x) {}
  try { C().put(ck, JSON.stringify(W), 300); } catch (x) {}
  return W;
}

// ---------- рейтинг месяца (общий для страницы и рассылки) ----------
function dsTop(mon, pk, A) {
  A = A || dsAll(); var by = {};
  A.L.forEach(function (o) {
    if (o.st === "hide" || dsMonth(o.c) !== mon) return;
    var s = dsPts(o), r = by[o.by.pk] || (by[o.by.pk] = { w: o.by.w, rn: o.by.rn, br: o.by.br, pts: 0, n: 0, st: 0, top: 0, me: o.by.pk === pk, pk: o.by.pk });
    r.pts += s.pts; r.n++; r.st += s.st; if (o.boss && o.boss.lvl === 3) r.top++;
  });
  Object.keys(by).forEach(function (k) { by[k].pp = by[k].pts; by[k].wp = 0; by[k].lines = []; });
  var W = dsWork(mon);
  Object.keys(W).forEach(function (k) {
    var x = W[k], r = by[k] || (by[k] = { w: x.w, rn: x.rn, br: x.br || "", pts: 0, pp: 0, wp: 0, n: 0, st: 0, top: 0, lines: [], me: k === pk, pk: k });
    if (!r.rn) r.rn = x.rn; r.wp = x.pts; r.pts += x.pts; r.lines = x.lines; r.cat = x.cat;
  });
  var all = Object.keys(by).map(function (k) { return by[k]; }).filter(function (r) { return r.pts > 0 || r.me; }).sort(function (a, b) { return b.pts - a.pts || b.st - a.st || b.n - a.n; });
  var best = {}; all.forEach(function (r) { (r.cat || []).forEach(function (c) { if (c.p > 0 && !best[c.k] || c.p > 0 && best[c.k] && c.p > best[c.k].p) best[c.k] = { k: c.k, t: c.t, w: r.w, p: c.p }; }); });
  var top = all.slice(0, 60).map(function (r) { var x = JSON.parse(JSON.stringify(r)); delete x.pk; return x; });
  return { top: top, all: all, best: Object.keys(best).map(function (k) { return best[k]; }) };
}

// ---------- рассылка итогов месяца в Telegram ----------
var DS_MON = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
var DS_URL = "https://umari-khayom.vercel.app/top.html";
function dsDigestText(mon, pk, preview) {
  var T = dsTop(mon, pk), L = T.all, md = ["🥇", "🥈", "🥉"], name = DS_MON[+mon.slice(5, 7) - 1] + " " + mon.slice(0, 4);
  var t = (preview ? "👀 Так будет выглядеть рассылка (данные на сегодня)\n\n" : "") + "🏆 Итоги месяца: " + name + "\n";
  if (!L.length) return t + "\nВ этом месяце пока нет очков.";
  t += "\n" + L.slice(0, 3).map(function (r, i) { return md[i] + " " + r.w + " — " + r.pts + " очк." + (r.rn ? " (" + r.rn + (r.br ? ", " + r.br : "") + ")" : ""); }).join("\n");
  t += "\n\n👑 Сотрудник месяца — " + L[0].w + "! Поздравляем!";
  if (T.best.length) t += "\n\n🏅 Лучшие по направлениям:\n" + T.best.map(function (b) { return b.t + " — " + b.w; }).join("\n");
  var i = -1; L.forEach(function (r, j) { if (r.pk === pk) i = j; });
  if (pk) t += i > -1 ? "\n\n📊 Ваш результат: " + (i + 1) + " место из " + L.length + ", " + L[i].pts + " очк." : "\n\n📊 В этом месяце у вас пока нет очков — всё впереди!";
  return t + "\n\nПодробно: " + DS_URL;
}
function dsDigest() {
  if (typeof puReg !== "function" || !puTok()) return;
  var now = new Date(), day = +Utilities.formatDate(now, "Asia/Dushanbe", "d"), h = +Utilities.formatDate(now, "Asia/Dushanbe", "H");
  if (day !== 1 || h < 10) return;
  var y = +Utilities.formatDate(now, "Asia/Dushanbe", "yyyy"), m = +Utilities.formatDate(now, "Asia/Dushanbe", "M") - 1;
  if (m === 0) { m = 12; y--; }
  var mon = y + "-" + ("0" + m).slice(-2), pr = PropertiesService.getScriptProperties(), key = "dsdig:" + mon;
  if (pr.getProperty(key)) return; pr.setProperty(key, String(Date.now()));
  C().remove("dswork:" + mon);
  var R = puReg(); Object.keys(R).forEach(function (pk) { try { puSend(R[pk].c, dsDigestText(mon, pk, false)); } catch (x) {} });
}
if (typeof pushTick === "function") { var DS_TICK0 = pushTick; pushTick = function () { DS_TICK0(); try { dsDigest(); } catch (x) {} }; }
