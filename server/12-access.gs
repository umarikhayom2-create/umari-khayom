// Умари Хайём · Access — Доступы сотрудников филиалов. Файлы держать в этом порядке.
var AC_TW = ["Полный день", "Сменный график", "Неполный день", "Выездной", "Удалённо", "Разовые задания"];
function acDef(role) {
  var rk = stRank(role), ed = !!BR_EDIT[role];
  return { sh: 1, tk: 1, ex: 1, tq: rk >= 2 ? 1 : 0, br: rk >= 2 ? 1 : 0, sp: ed ? 2 : 1, dl: ed ? 2 : 1, cash: role === "badmin" ? 1 : 0 };
}
function acOf(o) { var d = acDef(o.role || "merch"), p = o.perm || {}; Object.keys(d).forEach(function (k) { if (p[k] != null) d[k] = +p[k]; }); return d; }
function acAll() { var sh = mSh(), n = sh.getLastRow(), m = {}; if (n > 1) sh.getRange(2, 1, n - 1, 2).getValues().forEach(function (r) { if (!r[0]) return; try { var o = JSON.parse(r[1]); m[String(r[0])] = { perm: acOf(o), tw: o.tw || "", def: acDef(o.role || "merch") }; } catch (x) {} }); return m; }
function acEnrich(r) { if (r && r.ok && r.merch) { var m = acAll(); r.merch.forEach(function (e) { var x = m[e.login] || {}; e.perm = x.perm; e.tw = x.tw || ""; e.def = x.def; }); r.tws = AC_TW; } return r; }
var AC_ROUTE0 = route;
route = function (p) {
  var a = String(p.a || "");
  if (a === "t_eadd" || a === "t_eset") {
    var r = AC_ROUTE0(p);
    if (r && r.ok && (p.perm || p.tw != null)) {
      var me = staff(p);
      if (me && (me.role === "director" || me.role === "admin")) locked(function () {
        var o = mGet(String(p.login || "").toLowerCase().replace(/[^a-z0-9_.-]/g, "")); if (!o) return;
        if (p.tw != null) o.tw = AC_TW.indexOf(p.tw) > -1 ? p.tw : "";
        if (p.perm) { var d = acDef(o.role || "merch"), q = {}; Object.keys(d).forEach(function (k) { if (p.perm[k] != null) q[k] = Math.max(0, Math.min(k === "sp" || k === "dl" ? 2 : 1, +p.perm[k] || 0)); }); o.perm = q; }
        mPut(o);
      });
      r.merch = mList();
    }
    return acEnrich(r);
  }
  if (a === "t_all") return acEnrich(AC_ROUTE0(p));
  if (a.indexOf("m_") === 0 && a !== "m_login") {
    var mm = mTok(p.tok); if (!mm) return AC_ROUTE0(p);
    var pm = acOf(mm), deny = { ok: false, error: "perm" };
    if ((a === "m_in" || a === "m_out") && !pm.sh) return deny;
    if (/^m_q(take|done|drop)$/.test(a) && !pm.tk) return deny;
    if (a === "m_qnew" && !pm.tq) return deny;
    if (a === "m_qnew") { var rr = mm.role || "merch", rk0 = stRank(rr); p.to = (p.to || []).filter(function (x) { return stRank(x) <= rk0; }); if (rk0 < 2) { Q.RANK[rr] = 2; try { return AC_ROUTE0(p); } finally { Q.RANK[rr] = rk0; } } }
    if (a === "m_brteam" && !pm.br) return deny;
    if (a === "m_exadd" && !pm.ex) return deny;
    if (a.indexOf("m_sp_") === 0 || a.indexOf("m_dl_") === 0) {
      var lv = a.indexOf("m_sp_") === 0 ? pm.sp : pm.dl, isList = /_list$/.test(a);
      if (a === "m_dl_cashok") { if (!pm.cash) return deny; }
      else if (isList ? lv < 1 : lv < 2) return deny;
      var role = mm.role || "merch", had = BR_EDIT[role];
      BR_EDIT[role] = lv >= 2 || (a === "m_dl_cashok" && pm.cash) ? 1 : 0;
      try { var res = AC_ROUTE0(p); } finally { if (had) BR_EDIT[role] = had; else delete BR_EDIT[role]; }
      if (res && res.ok && isList) res.can = lv >= 2; if (res && res.ok && a === "m_dl_list") res.cash = !!pm.cash;
      return res;
    }
    var r2 = AC_ROUTE0(p);
    if (a === "m_me" && r2 && r2.ok) { r2.perm = pm; r2.tw = mm.tw || ""; }
    if (a === "m_qlist" && r2 && r2.ok) { if (!pm.tq) r2.allow = []; else if (!(r2.allow || []).length) { var rk1 = stRank(mm.role || "merch"); r2.allow = Object.keys(M_ROLES).filter(function (x) { return stRank(x) <= rk1; }); r2.rn = Q.RN; } if (!pm.tk) r2.L = (r2.L || []).filter(function (o) { return o.by && o.by.pk === "merch|" + mm.login; }); }
    return r2;
  }
  return AC_ROUTE0(p);
};
