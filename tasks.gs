// Поручения: создание по должности, принятие после ознакомления, срок (авто по тексту или вручную), фотоотчёт, рейтинг.
// Отдельный файл Tasks.gs в проекте ЧАТА — последним, после Team.gs.
var Q = {
  TAKE_LIM: 60,                       // поручение должны принять за 60 мин
  RANK: { director: 5, admin: 4, accountant: 3, operator: 2, sales: 2, content: 2, courier: 1, merch: 1 },
  RN: { director: "Руководитель", admin: "Администратор", accountant: "Бухгалтер", operator: "Оператор", sales: "Торговый представитель", content: "Контент-менеджер", courier: "Курьер", merch: "Мерчандайзер" }
};
var Q_ROUTE0 = route;
route = function (p) {
  var a = String(p.a || "");
  if (a.indexOf("t_q") === 0) { var me = staff(p); if (!me) return { ok: false, error: "auth" }; if (me.role === "partner") return { ok: false, error: "role" }; return qAct(a.slice(3), { k: "staff", w: me.who, r: me.role }, p); }
  if (a.indexOf("k_q") === 0) { var c = courTok(p.tok); if (!c) return { ok: false, error: "tok" }; return qAct(a.slice(3), { k: "cour", w: c.nm, r: "courier", lg: c.login }, p); }
  if (a.indexOf("m_q") === 0) { var m = mTok(p.tok); if (!m) return { ok: false, error: "tok" }; return qAct(a.slice(3), { k: "merch", w: m.nm, r: m.role || "merch", lg: m.login }, p); }
  return Q_ROUTE0(p);
};
// кому можно ставить: руководитель — всем; администратор — всем, кроме руководителя; бухгалтер — всем, кроме руководителя (в т. ч. администраторам); остальные — равным и ниже
function qCanTo(from, to) {
  if (from === "director") return true;
  if (to === "director") return false;
  if (from === "admin" || from === "accountant") return true;
  return (Q.RANK[to] || 0) <= (Q.RANK[from] || 0);
}
function qAllowed(from) { return Object.keys(Q.RANK).filter(function (r) { return qCanTo(from, r); }); }
// срок по тексту: чем длиннее и сложнее — тем больше времени
function qEst(t) {
  t = String(t || "").toLowerCase();
  var m = 30 + Math.round(t.length / 10);
  var K2 = [[/склад|пересчит|инвентар|ревизи|разобрат|разгруз|поставк|приём|прием/, 120], [/полк|выкладк|витрин|протер|пыл|убор|чист|ценник/, 45], [/отчёт|отчет|таблиц|сверк|акт |документ|счёт|счет/, 60], [/достав|отвез|съезд|забрать|купить|рынок/, 90], [/фото|карточк|описан|каталог/, 40], [/позвон|обзвон|клиент/, 30]];
  K2.forEach(function (k) { if (k[0].test(t)) m += k[1]; });
  var n = (t.match(/\n|;|•|\d+\./g) || []).length; m += n * 15;
  if (/срочно|немедленно|сейчас же|быстро/.test(t)) m = Math.min(m, 30);
  return Math.max(15, Math.min(2880, m));
}
function qSh() { return sheet("tasks", ["id", "json", "ts"]); }
function qAll() {
  var sh = qSh(), n = sh.getLastRow(), L = [];
  if (n > 1) sh.getRange(2, 1, n - 1, 2).getValues().forEach(function (r, i) { if (!r[0]) return; try { var o = JSON.parse(r[1]); o.row = i + 2; L.push(o); } catch (x) {} });
  return { sh: sh, L: L };
}
function qPut(sh, o) { var row = o.row; delete o.row; var v = [o.id, JSON.stringify(o), o.ts]; if (row) sh.getRange(row, 1, 1, 3).setValues([v]); else sh.appendRow(v); C().put("qv", String(Date.now()), 21600); o.row = row; }
function qKey(u) { return u.k + "|" + (u.lg || u.r + ":" + String(u.w).toLowerCase()); }
function qMine(o, u) { return o.tk && o.tk.pk === qKey(u); }
function qBy(o, u) { return o.by && o.by.pk === qKey(u); }
function qView(o) { var x = JSON.parse(JSON.stringify(o)); delete x.row; return x; }
function qAct(act, u, p) {
  var pk = qKey(u), boss = u.k === "staff" && (u.r === "director" || u.r === "admin");
  if (act === "est") return { ok: true, min: qEst(p.t) };
  if (act === "list") {
    var b = brOf(u), now = Date.now(), lim = now - 30 * 864e5, A = qAll();
    var vis = A.L.filter(function (o) {
      if (o.ts < lim && o.st !== "open" && o.st !== "taken") return false;
      if (qBy(o, u) || qMine(o, u)) return true;
      if (u.k === "staff" && (u.r === "director" || u.r === "admin" || u.r === "accountant") && p.all) return !o.br || !b || o.br === b || u.r === "director";
      return o.st === "open" && (o.to || []).indexOf(u.r) > -1 && (!o.br || o.br === b);
    }).map(qView).sort(function (x, y) { return y.ts - x.ts; }).slice(0, 200);
    return { ok: true, L: vis, me: { pk: pk, r: u.r, br: b }, allow: u.k === "staff" ? qAllowed(u.r) : [], rn: Q.RN, br: brGet().map(function (x) { return { id: x.id, nm: x.nm }; }), boss: boss, qv: C().get("qv") || "" };
  }
  if (act === "new") {
    if (u.k !== "staff") return { ok: false, error: "role" };
    var t = clean(p.t, 1500); if (t.length < 3) return { ok: false, error: "text" };
    var to = (p.to || []).filter(function (r) { return Q.RANK[r] && qCanTo(u.r, r); }); if (!to.length) return { ok: false, error: "to" };
    var est = qEst(t), dl = est, man = 0;
    if (+p.dl > 0) { if (!boss) return { ok: false, error: "dl" }; dl = Math.max(5, Math.min(30 * 1440, Math.round(+p.dl))); man = 1; }
    var br = clean(p.br, 20); if (br && !brGet().some(function (x) { return x.id === br; })) br = "";
    var now = Date.now();
    var o = { id: "Q" + now + rnd(4), t: t, to: to, br: br, brn: br ? (brGet().filter(function (x) { return x.id === br; })[0] || {}).nm : "", ph: !!p.ph, dl: dl, est: est, man: man, ts: now, st: "open", by: { pk: pk, w: u.w, r: u.r }, log: [{ ts: now, e: "new", w: u.w }] };
    return locked(function () { var A = qAll(); qPut(A.sh, o); return { ok: true, o: qView(o) }; });
  }
  return locked(function () {
    var A = qAll(), o = A.L.filter(function (x) { return x.id === p.id; })[0]; if (!o) return { ok: false, error: "none" };
    var now = Date.now();
    if (act === "take") {
      if (o.st !== "open") return { ok: false, error: "taken" };
      if ((o.to || []).indexOf(u.r) < 0 || (o.br && o.br !== brOf(u))) return { ok: false, error: "notfor" };
      o.st = "taken"; o.tk = { pk: pk, w: u.w, r: u.r, k: u.k, ts: now }; o.due = now + o.dl * 6e4; o.log.push({ ts: now, e: "take", w: u.w });
    } else if (act === "done") {
      if (o.st !== "taken" || !qMine(o, u)) return { ok: false, error: "notyours" };
      if (o.ph && !p.photo) return { ok: false, error: "photo" };
      var fid = "";
      if (p.photo) { try { fid = kSavePhoto(p.photo, "task_" + o.id); } catch (x) { fid = ""; } if (!fid && o.ph) return { ok: false, error: "photo_save" }; }
      o.st = "done"; o.done = { ts: now, ph: fid, note: clean(p.note, 300), late: now > o.due }; o.log.push({ ts: now, e: "done", w: u.w });
    } else if (act === "drop") {
      if (o.st !== "taken" || !qMine(o, u)) return { ok: false, error: "notyours" };
      o.log.push({ ts: now, e: "drop", w: u.w, pk: pk, note: clean(p.note, 200) }); o.st = "open"; o.tk = null; o.due = 0;
    } else if (act === "cancel") {
      if (!qBy(o, u) && !boss) return { ok: false, error: "role" };
      if (o.st === "done") return { ok: false, error: "done" };
      o.st = "cancel"; o.log.push({ ts: now, e: "cancel", w: u.w });
    } else if (act === "ok") {
      if (!qBy(o, u) && !boss) return { ok: false, error: "role" };
      o.ok = { ts: now, w: u.w, v: p.v === "bad" ? "bad" : "good", note: clean(p.note, 200) }; o.log.push({ ts: now, e: o.ok.v === "bad" ? "bad" : "ok", w: u.w });
    } else return { ok: false, error: "action" };
    qPut(A.sh, o); C().remove("qrt");
    return { ok: true, o: qView(o) };
  });
}
// ---------- рейтинг по поручениям (месяц) ----------
function qRating(from, to) {
  var by = {}, now = Date.now();
  qAll().L.forEach(function (o) {
    (o.log || []).forEach(function (l) { if (l.e === "drop" && l.ts >= from && l.ts < to && l.pk) { var b = qB(by, l.pk, l.w, ""); b.drop++; b.max += 10; } });
    if (!o.tk || o.tk.ts < from || o.tk.ts >= to) return;
    var b = qB(by, o.tk.pk, o.tk.w, o.tk.r), wt = (o.tk.ts - (qOpenTs(o) || o.ts)) / 6e4;
    b.n++;
    if (o.st !== "done") { if (o.due && now > o.due) { b.late++; b.max += 23; b.earned -= 5; } return; }
    b.max += 23; var pts = 10;
    if (wt <= 15) { pts += 5; b.fast++; } else if (wt <= Q.TAKE_LIM) pts += 2; else pts -= 3;
    if (!o.done.late) { pts += 5; b.ontime++; } else { pts -= 10; b.late++; }
    if (o.done.ph) { pts += 3; b.photo++; }
    if (o.ok && o.ok.v === "bad") pts -= 8;
    b.done++; b.earned += pts;
  });
  return Object.keys(by).map(function (k) { var b = by[k]; b.pct = b.max ? Math.max(0, Math.min(100, Math.round(b.earned / b.max * 100))) : null; return b; });
}
function qB(by, pk, w, r) { return by[pk] || (by[pk] = { pk: pk, w: w, r: r, n: 0, done: 0, fast: 0, ontime: 0, late: 0, photo: 0, drop: 0, earned: 0, max: 0 }); }
function qOpenTs(o) { var t = 0; (o.log || []).forEach(function (l) { if (l.e === "new" || l.e === "drop") t = l.ts; }); return t; }
var Q_TEAM0 = team;
team = function (a, p, me) {
  if (a === "t_rate" || a === "t_all") {
    var r = a === "t_rate" ? { ok: true } : Q_TEAM0(a, p, me);
    if (r && r.ok && (me.role === "director" || me.role === "admin" || me.role === "accountant")) { var n = Date.now(); r.qrt = qRating(+p.from || tDay(n) - 30 * 864e5, +p.to || n + 1); }
    return r;
  }
  return Q_TEAM0(a, p, me);
};
