// Команда: смены 08:00–23:00 с фото, филиалы, мерчандайзеры, оклады. Отдельный файл Team.gs в проекте ЧАТА (после Kurer.gs).
var T = { FROM: 8, TO: 23, TZ: 5 };          // смена учитывается с 08:00 до 23:00 (Душанбе, UTC+5)
var T_ROUTE0 = route;
route = function (p) {
  var a = String(p.a || "");
  if (a.indexOf("t_") === 0) { var me = staff(p); if (!me) return { ok: false, error: "auth" }; return team(a, p, me); }
  if (a.indexOf("m_") === 0) return merch(a, p);
  if (a === "k_shin" || a === "k_shout" || a === "k_shst") { var c = courTok(p.tok); if (!c) return { ok: false, error: "tok" }; return shAct(a.slice(2), { k: "cour", w: c.nm, r: "courier", lg: c.login }, p); }
  return T_ROUTE0(p);
};
var T_BOSS = { director: 1, admin: 1 }, T_SEE = { director: 1, admin: 1, accountant: 1 };

// ---------- время ----------
function tDay(ts) { var d = 864e5, o = T.TZ * 36e5; return Math.floor((ts + o) / d) * d - o; }
function tClip(s, e) { var d0 = tDay(s), a = Math.max(s, d0 + T.FROM * 36e5), b = Math.min(e, d0 + T.TO * 36e5); return Math.max(0, b - a); }

// ---------- смены ----------
function shSh() { return sheet("smena", ["id", "who", "json", "ts"]); }
function shAll() {
  var sh = shSh(), n = sh.getLastRow(), L = [];
  if (n > 1) sh.getRange(2, 1, n - 1, 3).getValues().forEach(function (r, i) { if (!r[0]) return; try { var o = JSON.parse(r[2]); o.row = i + 2; L.push(o); } catch (x) {} });
  var now = Date.now();
  L.forEach(function (o) { if (!o.out) { var end = tDay(o.in) + T.TO * 36e5; if (now > end) { o.out = Math.max(o.in, end); o.auto = 1; shPut(sh, o); } } });
  return { sh: sh, L: L };
}
function shPut(sh, o) { var row = o.row; delete o.row; var v = [o.id, o.pk, JSON.stringify(o), o.in]; if (row) sh.getRange(row, 1, 1, 4).setValues([v]); else sh.appendRow(v); o.row = row; }
function shKey(u) { return u.k + "|" + (u.lg || u.r + ":" + String(u.w).toLowerCase()); }
function shOpen(L, pk) { for (var i = L.length - 1; i >= 0; i--) if (L[i].pk === pk && !L[i].out) return L[i]; return null; }
function shView(o) { if (!o) return null; return { id: o.id, in: o.in, out: o.out || 0, w: o.w, r: o.r, k: o.k, phIn: o.phIn || "", phOut: o.phOut || "", auto: o.auto || 0, br: o.br || "" }; }
function shAct(act, u, p) {
  var pk = shKey(u);
  if (act === "shst" || act === "me") { var A0 = shAll(); return { ok: true, sh: shView(shOpen(A0.L, pk)), today: shToday(A0.L, pk), cfg: T }; }
  var ph = "";
  if (p.photo) { try { ph = kSavePhoto(p.photo, "smena_" + String(u.w).replace(/\W/g, "_") + "_" + Date.now()); } catch (x) { ph = ""; } }
  return locked(function () {
    var A = shAll(), o = shOpen(A.L, pk), now = Date.now();
    if (act === "shin" || act === "in") {
      if (o) return { ok: true, sh: shView(o), already: 1 };
      var h = (now + T.TZ * 36e5) % 864e5 / 36e5;
      o = { id: "S" + now + rnd(4), pk: pk, k: u.k, w: u.w, r: u.r, lg: u.lg || "", in: now, phIn: ph, br: brOf(u) };
      shPut(A.sh, o);
      return { ok: true, sh: shView(o), early: h < T.FROM, late: h >= T.TO };
    }
    if (!o) return { ok: false, error: "noshift" };
    o.out = now; o.phOut = ph; shPut(A.sh, o);
    return { ok: true, sh: shView(o), min: Math.round(tClip(o.in, o.out) / 6e4) };
  });
}
function shToday(L, pk) { var d0 = tDay(Date.now()), m = 0; L.forEach(function (o) { if (o.pk === pk && o.in >= d0) m += tClip(o.in, o.out || Date.now()); }); return Math.round(m / 6e4); }
function shReport(from, to) {
  var A = shAll(), now = Date.now(), by = {};
  A.L.forEach(function (o) {
    if (o.in < from || o.in >= to) return;
    var b = by[o.pk] || (by[o.pk] = { pk: o.pk, w: o.w, r: o.r, k: o.k, min: 0, days: {}, n: 0, auto: 0, ph: 0, br: o.br || "" });
    var ms = tClip(o.in, o.out || now); b.min += ms / 6e4; b.n++; if (o.auto) b.auto++; if (o.phIn) b.ph++;
    b.days[Utilities.formatDate(new Date(o.in), "Asia/Dushanbe", "yyyy-MM-dd")] = 1;
  });
  var S = setGet();
  return Object.keys(by).map(function (k) { var b = by[k]; b.min = Math.round(b.min); b.days = Object.keys(b.days).length; b.sal = (S[k] || {}).sal || 0; b.plan = (S[k] || {}).plan || ""; return b; });
}

// ---------- филиалы ----------
function brGet() { var v = PropertiesService.getScriptProperties().getProperty("branches"); return v ? JSON.parse(v) : []; }
function brSet(L) { PropertiesService.getScriptProperties().setProperty("branches", JSON.stringify(L)); C().remove("brmap"); }
function brOf(u) { var key = shKey(u), r = ""; brGet().forEach(function (b) { if ((b.mem || []).some(function (m) { return m.pk === key; })) r = b.id; }); return r; }

// ---------- оклады и план смен (заполняется позже) ----------
function setGet() { var v = PropertiesService.getScriptProperties().getProperty("tmset"); return v ? JSON.parse(v) : {}; }

// ---------- мерчандайзеры (и другие полевые сотрудники) ----------
var M_ROLES = { merch: "Мерчандайзер" };
function mSh() { return sheet("team", ["login", "json"]); }
function mGet(login) { login = String(login || "").toLowerCase(); var sh = mSh(), n = sh.getLastRow(); if (n < 2) return null; var v = sh.getRange(2, 1, n - 1, 2).getValues(); for (var i = 0; i < v.length; i++) if (String(v[i][0]) === login) { var o = JSON.parse(v[i][1]); o.login = login; o.row = i + 2; return o; } return null; }
function mPut(o) { var sh = mSh(), row = o.row; delete o.row; var v = [o.login, JSON.stringify(o)]; if (row) sh.getRange(row, 1, 1, 2).setValues([v]); else sh.appendRow(v); }
function mList() { var sh = mSh(), n = sh.getLastRow(); if (n < 2) return []; return sh.getRange(2, 1, n - 1, 2).getValues().filter(function (r) { return r[0]; }).map(function (r) { var o = JSON.parse(r[1]); return { login: String(r[0]), nm: o.nm, ph: o.ph, role: o.role || "merch", on: o.on !== false }; }); }
function mTok(tok) { tok = String(tok || ""); if (tok.length < 20) return null; var login = C().get("mt:" + tok) || PropertiesService.getScriptProperties().getProperty("mt:" + tok); if (!login) return null; var o = mGet(login); if (!o || o.on === false || (o.toks || []).indexOf(tok) < 0) return null; return o; }
function merch(a, p) {
  if (a === "m_login") {
    var login = String(p.login || "").toLowerCase(), tries = +(C().get("ml:" + login) || 0); if (tries >= 6) return { ok: false, error: "slow" };
    var o = mGet(login);
    if (!o || o.on === false || hashPw(String(p.pw || ""), o.s) !== o.h) { C().put("ml:" + login, String(tries + 1), 600); return { ok: false, error: "pw" }; }
    return locked(function () { var o2 = mGet(login), t = rnd(40); o2.toks = (o2.toks || []).concat([t]).slice(-5); PropertiesService.getScriptProperties().setProperty("mt:" + t, login); C().put("mt:" + t, login, 21600); mPut(o2); return { ok: true, tok: t, me: { login: login, nm: o2.nm, role: o2.role || "merch", rn: M_ROLES[o2.role || "merch"] } }; });
  }
  var me = mTok(p.tok); if (!me) return { ok: false, error: "tok" };
  var u = { k: "merch", w: me.nm, r: me.role || "merch", lg: me.login };
  if (a === "m_me") { var s = shAct("me", u, p); s.me = { login: me.login, nm: me.nm, role: u.r, rn: M_ROLES[u.r] }; var b = brGet().filter(function (x) { return x.id === brOf(u); })[0]; s.br = b ? b.nm : ""; return s; }
  if (a === "m_in") return shAct("in", u, p);
  if (a === "m_out") return shAct("out", u, p);
  return { ok: false, error: "action" };
}

// ---------- действия из панели сотрудников ----------
function team(a, p, me) {
  var u = { k: "staff", w: me.who, r: me.role };
  if (a === "t_me") { var s = shAct("me", u, p); s.br = brGet(); return s; }
  if (a === "t_in") return shAct("in", u, p);
  if (a === "t_out") return shAct("out", u, p);
  if (!T_SEE[me.role]) return { ok: false, error: "role" };
  if (a === "t_all") {
    var A = shAll(), now = Date.now(), open = A.L.filter(function (o) { return !o.out; }).map(shView);
    var from = +p.from || tDay(now) - 30 * 864e5, to = +p.to || now + 1;
    return { ok: true, now: open, rep: shReport(from, to), br: brGet(), merch: mList(), cour: courList(), set: setGet(), roles: M_ROLES };
  }
  if (!T_BOSS[me.role]) return { ok: false, error: "role" };
  if (a === "t_brset") {
    if (me.role !== "director") return { ok: false, error: "role" };
    var L = (p.list || []).slice(0, 50).map(function (b) { return { id: clean(b.id, 20) || ("B" + rnd(6)), nm: clean(b.nm, 80), ad: clean(b.ad, 150), mem: (b.mem || []).slice(0, 200).map(function (m) { return { pk: clean(m.pk, 120), w: clean(m.w, 60), r: clean(m.r, 30) }; }) }; }).filter(function (b) { return b.nm; });
    return locked(function () { brSet(L); return { ok: true, br: L }; });
  }
  if (a === "t_set") {
    if (me.role !== "director") return { ok: false, error: "role" };
    return locked(function () { var S = setGet(), k = clean(p.pk, 120); if (!k) return { ok: false, error: "pk" }; S[k] = { sal: Math.max(0, +p.sal || 0), plan: clean(p.plan, 120) }; PropertiesService.getScriptProperties().setProperty("tmset", JSON.stringify(S)); return { ok: true, set: S }; });
  }
  if (a === "t_madd" || a === "t_mtog" || a === "t_mpw") {
    var login = String(p.login || "").toLowerCase().replace(/[^a-z0-9_.-]/g, ""); if (!login) return { ok: false, error: "login" };
    return locked(function () {
      var o = mGet(login);
      if (a === "t_madd") { if (o || courGet(login)) return { ok: false, error: "exists" }; if (String(p.pw || "").length < 6) return { ok: false, error: "pw" }; o = { login: login, nm: clean(p.nm, 60), ph: clean(p.ph, 30), role: M_ROLES[p.role] ? p.role : "merch", s: rnd(16), on: true }; o.h = hashPw(String(p.pw), o.s); mPut(o); return { ok: true, merch: mList() }; }
      if (!o) return { ok: false, error: "none" };
      if (a === "t_mtog") { o.on = !!p.on; if (!o.on) o.toks = []; mPut(o); return { ok: true, merch: mList() }; }
      if (String(p.pw || "").length < 6) return { ok: false, error: "pw" }; o.s = rnd(16); o.h = hashPw(String(p.pw), o.s); o.toks = []; mPut(o); return { ok: true };
    });
  }
  return { ok: false, error: "action" };
}
