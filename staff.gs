// Сотрудники филиалов: любые должности (админ филиала, менеджер, продавец-консультант, кассир, кладовщик, мерчандайзер, свои),
// привязка к филиалу, поручения от админа филиала своим людям. Отдельный файл Staff.gs в проекте ЧАТА — самым последним.
var ST_ROLES = { badmin: ["Администратор филиала", 3], manager: ["Менеджер", 2], seller: ["Продавец-консультант", 1], cashier: ["Кассир", 1], store: ["Кладовщик", 1], merch: ["Мерчандайзер", 1] };
function stCustom() { var v = PropertiesService.getScriptProperties().getProperty("roles"); return v ? JSON.parse(v) : {}; }
(function () {
  var all = {}; Object.keys(ST_ROLES).forEach(function (k) { all[k] = ST_ROLES[k]; });
  var cu = stCustom(); Object.keys(cu).forEach(function (k) { all[k] = [cu[k].t, cu[k].r || 1]; });
  Object.keys(all).forEach(function (k) { M_ROLES[k] = all[k][0]; Q.RANK[k] = all[k][1]; Q.RN[k] = all[k][0]; });
})();
function stRank(r) { return Q.RANK[r] || 1; }
function stBrSet(u, brId) {
  var L = brGet(), key = shKey(u);
  L.forEach(function (b) { b.mem = (b.mem || []).filter(function (m) { return m.pk !== key; }); });
  var b = L.filter(function (x) { return x.id === brId; })[0];
  if (b) b.mem.push({ pk: key, w: u.w, r: u.r });
  brSet(L);
}
var ST_ROUTE0 = route;
route = function (p) {
  var a = String(p.a || "");
  if (a === "t_eadd" || a === "t_eset") {
    var me = staff(p); if (!me) return { ok: false, error: "auth" };
    if (me.role !== "director" && me.role !== "admin") return { ok: false, error: "role" };
    return locked(function () { return stAdmin(a, p, me); });
  }
  if (a === "m_qnew" || a === "m_brteam") {
    var mm = mTok(p.tok); if (!mm) return { ok: false, error: "tok" };
    var u = { k: "merch", w: mm.nm, r: mm.role || "merch", lg: mm.login };
    if (a === "m_brteam") return stBrTeam(u);
    return stTaskNew(u, p);
  }
  var r = ST_ROUTE0(p);
  if (a === "m_qlist" && r && r.ok) { var m2 = mTok(p.tok); if (m2 && stRank(m2.role || "merch") >= 2) r.allow = Object.keys(M_ROLES).filter(function (x) { return stRank(x) <= stRank(m2.role); }); r.rn = Q.RN; }
  if (a === "m_me" && r && r.ok && r.me) { r.me.rn = M_ROLES[r.me.role] || r.me.rn; r.me.rank = stRank(r.me.role); }
  if (a === "m_login" && r && r.ok && r.me) { r.me.rn = M_ROLES[r.me.role] || "Сотрудник"; }
  return r;
};
function stAdmin(a, p, me) {
  var role = String(p.er || ""); // er — должность сотрудника (role занят ролью того, кто добавляет)
  if (role === "custom") {
    var t = clean(p.title, 40); if (!t) return { ok: false, error: "title" };
    var cu = stCustom(), key = "";
    Object.keys(cu).forEach(function (k) { if (cu[k].t.toLowerCase() === t.toLowerCase()) key = k; });
    if (!key) { key = "x" + rnd(5).toLowerCase(); cu[key] = { t: t, r: Math.max(1, Math.min(3, +p.rank || 1)) }; PropertiesService.getScriptProperties().setProperty("roles", JSON.stringify(cu)); }
    role = key; M_ROLES[key] = t; Q.RANK[key] = cu[key].r; Q.RN[key] = t;
  }
  if (role && !M_ROLES[role]) return { ok: false, error: "role" };
  if (role === "badmin" && me.role !== "director") return { ok: false, error: "role" };
  var login = String(p.login || "").toLowerCase().replace(/[^a-z0-9_.-]/g, ""); if (!login) return { ok: false, error: "login" };
  var o = mGet(login);
  if (a === "t_eadd") {
    if (o || courGet(login)) return { ok: false, error: "exists" };
    if (String(p.pw || "").length < 6) return { ok: false, error: "pw" };
    o = { login: login, nm: clean(p.nm, 60), ph: clean(p.ph, 30), role: role || "merch", s: rnd(16), on: true }; o.h = hashPw(String(p.pw), o.s);
    mPut(o);
  } else {
    if (!o) return { ok: false, error: "none" };
    if (role) o.role = role; if (p.nm) o.nm = clean(p.nm, 60); if (p.ph != null) o.ph = clean(p.ph, 30);
    mPut(o);
  }
  if (p.br != null) stBrSet({ k: "merch", w: o.nm, r: o.role, lg: login }, String(p.br));
  return { ok: true, merch: mList(), br: brGet(), roles: M_ROLES };
}
function stBrTeam(u) {
  var bid = brOf(u), b = brGet().filter(function (x) { return x.id === bid; })[0];
  if (!b) return { ok: true, br: null, mem: [] };
  var A = shAll(), open = {}; A.L.forEach(function (s) { if (!s.out) open[s.pk] = s.in; });
  return { ok: true, br: { id: b.id, nm: b.nm, ad: b.ad }, mem: (b.mem || []).map(function (m) { return { w: m.w, r: m.r, rn: M_ROLES[m.r] || Q.RN[m.r] || m.r, on: open[m.pk] || 0 }; }) };
}
// поручение от сотрудника филиала (админ филиала, менеджер): только своему филиалу, равным и ниже по должности
function stTaskNew(u, p) {
  if (stRank(u.r) < 2) return { ok: false, error: "role" };
  var bid = brOf(u); if (!bid) return { ok: false, error: "nobranch" };
  var t = clean(p.t, 1500); if (t.length < 3) return { ok: false, error: "text" };
  var to = (p.to || []).filter(function (r) { return M_ROLES[r] && stRank(r) <= stRank(u.r); }); if (!to.length) return { ok: false, error: "to" };
  var now = Date.now(), est = qEst(t), dl = est, man = 0;
  if (u.r === "badmin" && +p.dl > 0) { dl = Math.max(5, Math.min(30 * 1440, Math.round(+p.dl))); man = 1; }
  var b = brGet().filter(function (x) { return x.id === bid; })[0] || {};
  var o = { id: "Q" + now + rnd(4), t: t, to: to, br: bid, brn: b.nm || "", ph: !!p.ph, dl: dl, est: est, man: man, ts: now, st: "open", by: { pk: qKey(u), w: u.w, r: u.r }, log: [{ ts: now, e: "new", w: u.w }] };
  return locked(function () { var A = qAll(); qPut(A.sh, o); return { ok: true, o: qView(o) }; });
}
