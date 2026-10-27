// Умари Хайём · Обновление — Новости, «нет в наличии» и вызов курьера одной кнопкой, вход офиса через «Рабочий персонал». Файлы держать в этом порядке.

// ---------- новая должность «Оператор» в рабочем персонале ----------
(function () { if (!M_ROLES.op) { M_ROLES.op = "Оператор"; Q.RANK.op = 2; Q.RN.op = "Оператор"; } })();
var UP_OFF = { operator: "Оператор", admin: "Администратор", accountant: "Бухгалтер" };

// ---------- кто прислал запрос ----------
function upWho(p) {
  if (p.key && p.role) { var s = staff(p); if (s) return { w: s.who, r: ({ operator: "Оператор", admin: "Администратор", accountant: "Бухгалтер", director: "Руководитель", content: "Контент-менеджер" })[s.role] || s.role, pk: "s|" + s.role + "|" + s.who.toLowerCase(), boss: s.role === "director" || s.role === "admin" }; return null; }
  var m = mTok(p.tok); if (m) return { w: m.nm, r: M_ROLES[m.role || "merch"] || "Сотрудник", pk: "m|" + m.login, boss: m.role === "badmin" };
  var k = courTok(p.tok); if (k) return { w: k.nm, r: "Курьер", pk: "k|" + k.login, boss: false };
  return null;
}

// ================= 1. НОВОСТИ =================
function nwSh() { return sheet("news", ["id", "json", "ts"]); }
function nwAll() {
  var sh = nwSh(), n = sh.getLastRow(), L = [];
  if (n > 1) sh.getRange(Math.max(2, n - 199), 1, Math.min(200, n - 1), 2).getValues().forEach(function (r, i) { if (!r[0]) return; try { var o = JSON.parse(r[1]); o.row = Math.max(2, n - 199) + i; L.push(o); } catch (x) {} });
  return { sh: sh, L: L };
}
function nwAct(a, p) {
  var me = upWho(p); if (!me) return { ok: false, error: "tok" };
  if (a === "n_list") {
    var lim = Date.now() - 30 * 864e5;
    var L = nwAll().L.filter(function (o) { return !o.del && o.ts > lim; }).sort(function (x, y) { return y.ts - x.ts; }).slice(0, 40)
    .map(function (o) { return { id: o.id, t: o.t, ph: o.ph || "", w: o.w, r: o.r, ts: o.ts, mine: o.pk === me.pk || me.boss }; });
    return { ok: true, list: L, v: C().get("nwv") || "" };
  }
  if (a === "n_add") {
    var t = clean(p.t, 600); if (t.length < 3 && !p.ph) return { ok: false, error: "text" };
    if (C().get("nwr:" + me.pk)) return { ok: false, error: "slow" };
    var ph = ""; if (p.ph) { try { ph = kSavePhoto(p.ph, "news_" + Date.now()); } catch (x) { ph = ""; } }
    var o = { id: "n" + Date.now() + Math.floor(Math.random() * 1000), t: t, ph: ph, w: me.w, r: me.r, pk: me.pk, ts: Date.now() };
    locked(function () { var A = nwAll(); A.sh.appendRow(["'" + o.id, JSON.stringify(o), o.ts]); return {}; });
    C().put("nwr:" + me.pk, "1", 20); C().put("nwv", String(o.ts), 21600);
    try { puTo(function () { return true; }, "📢 Новость от " + me.w + " (" + me.r + "):\n" + (t || "📷 фото"), false); } catch (x) {}
    return { ok: true };
  }
  if (a === "n_del") return locked(function () {
    var A = nwAll(), o = A.L.filter(function (x) { return x.id === String(p.id || ""); })[0];
    if (!o) return { ok: false, error: "none" };
    if (o.pk !== me.pk && !me.boss) return { ok: false, error: "role" };
    var row = o.row; delete o.row; o.del = Date.now(); A.sh.getRange(row, 2).setValue(JSON.stringify(o)); C().put("nwv", String(Date.now()), 21600);
    return { ok: true };
  });
  return { ok: false, error: "action" };
}

// ================= 2. ЗАЯВКИ: «нет в наличии», вызов курьера только когда всё собрано =================
function upZvCtx(p) {
  var mm = mTok(p.tok); if (!mm) return null;
  var u = { k: "merch", w: mm.nm, r: mm.role || "merch", lg: mm.login, ph: mm.ph || "" };
  var bid = brOf(u), B = brGet(), b = B.filter(function (x) { return x.id === bid; })[0];
  return b ? { u: u, b: b, B: B } : { nob: 1 };
}
// мой филиал прошёл всю заявку: каждая позиция либо собрана целиком, либо я её собрал/отметил «нет»
function upZvReady(o, bid) {
  var left = 0;
  o.items.forEach(function (it) { if (zvGot(it) >= it.q) return; if ((it.g || []).some(function (g) { return g.b === bid && !g.s; })) return; left++; });
  return left;
}
function upZvUnsent(o, bid) { var n = 0; o.items.forEach(function (it) { (it.g || []).forEach(function (g) { if (g.b === bid && !g.s && g.q > 0) n++; }); }); return n; }
function upZv(a, p) {
  var X = upZvCtx(p); if (!X) return { ok: false, error: "tok" }; if (X.nob) return { ok: false, error: "nobranch" };
  var b = X.b, who = X.u.w;
  return locked(function () {
    var A = zvAll();
    if (a === "m_zv_pick" || a === "m_zv_no") {
      var o = A.L.filter(function (z) { return z.id === String(p.id || ""); })[0];
      if (!o || !zvSees(o, b.id)) return { ok: false, error: "none" };
      if (o.st !== "open") return { ok: false, error: "st" };
      var it = o.items[+p.i]; if (!it) return { ok: false, error: "none" };
      it.g = (it.g || []).filter(function (g) { return !(g.b === b.id && !g.s); });
      if (a === "m_zv_no") { if (p.on !== 0 && p.on !== false) it.g.push({ b: b.id, bn: b.nm, q: 0, no: 1, w: who, t: Date.now() }); }
      else { var q = Math.max(0, Math.round((+p.q || 0) * 1000) / 1000); if (q > 0) it.g.push({ b: b.id, bn: b.nm, q: q, w: who, t: Date.now() }); }
      o.ts = Date.now(); zvPut(A.sh, o); return { ok: true, item: it };
    }
    // один вызов курьера по всем заявкам, которые мой филиал собрал полностью
    var L = A.L.filter(function (o) { return o.st !== "cancel" && zvSees(o, b.id) && o.by.b !== b.id && upZvUnsent(o, b.id) > 0; });
    if (a === "m_zv_send") L = L.filter(function (o) { return o.id === String(p.id || ""); });
    if (!L.length) return { ok: false, error: "empty" };
    var notall = L.filter(function (o) { return upZvReady(o, b.id) > 0; });
    if (a === "m_zv_sendall") L = L.filter(function (o) { return !upZvReady(o, b.id); });
    if (notall.length && !L.length || a === "m_zv_send" && notall.length) return { ok: false, error: "notall", no: notall.map(function (o) { return o.no; }), left: upZvReady(notall[0], b.id) };
    var G = {};
    L.forEach(function (o) { var k = o.by.b; (G[k] = G[k] || []).push(o); });
    var res = [];
    Object.keys(G).forEach(function (dk) {
      var Z = G[dk], dst = X.B.filter(function (x) { return x.id === dk; })[0] || { nm: Z[0].by.bn, ad: "" }, its = [], nos = [];
      Z.forEach(function (o) {
        nos.push(o.no);
        o.items.forEach(function (it) { (it.g || []).forEach(function (g) { if (g.b === b.id && !g.s && g.q > 0) its.push({ n: (Z.length > 1 ? o.no + ": " : "") + it.n, q: g.q, l: "" }); }); });
      });
      var pr = PropertiesService.getScriptProperties(), n = (+pr.getProperty("zvsn") || 0) + 1; pr.setProperty("zvsn", String(n));
      var no = "ЗС-" + n, key = "ZA|" + b.id + "|" + n;
      var job = jobPut({ key: key, no: no, kind: "branch",
        from: { t: "Филиал «" + b.nm + "»", addr: b.ad || "", ph: X.u.ph || "" },
        to: { nm: "Филиал «" + dst.nm + "»", ph: Z[0].by.ph || "", ad: dst.ad || dst.nm, cty: "Душанбе", pay: "Без оплаты", cm: "Поставка по заявкам " + nos.join(", ") },
        sum: 0, cod: 0, n: its.length, items: its.slice(0, 30) });
      var J = jobAll(), x = J.L.filter(function (z) { return z.key === job.key; })[0];
      if (x) { x.br = b.id; x.by = who; x.zv = Z.map(function (o) { return o.id; }).join(","); jobSave(J.sh, x); }
      Z.forEach(function (o) {
        var cnt = 0; o.items.forEach(function (it) { (it.g || []).forEach(function (g) { if (g.b === b.id && !g.s && g.q > 0) { g.s = 1; cnt++; } }); });
        o.packs = o.packs || []; o.packs.push({ b: b.id, bn: b.nm, t: Date.now(), w: who, no: no, key: key, n: cnt });
        if (!o.items.some(function (it) { return zvGot(it) < it.q && !(it.g || []).some(function (g) { return g.no; }); })) o.st = "done";
        o.ts = Date.now(); zvPut(A.sh, o);
      });
      res.push(no);
      try { puTo(function (z) { return z.k === "cour"; }, "🚚 Новая доставка " + no + ": забрать в филиале «" + b.nm + "», отвезти в «" + dst.nm + "» (" + its.length + " поз.)", true); } catch (e) {}
    });
    return { ok: true, no: res.join(", "), n: res.length };
  });
}

// ================= 3. ОФИС ЧЕРЕЗ РАБОЧИЙ ПЕРСОНАЛ =================
function upKey(r) { return PropertiesService.getScriptProperties().getProperty("okey:" + r) || ""; }
function upKeys() { var o = {}; Object.keys(UP_OFF).forEach(function (r) { o[r] = !!upKey(r); }); return o; }
// "T:<токен сотрудника>" вместо пароля роли → настоящий пароль роли, имя сотрудника
function upResolve(q) {
  var k = String(q.key || ""); if (k.indexOf("T:") !== 0) return true;
  var mm = mTok(k.slice(2)); if (!mm || !mm.off || !UP_OFF[mm.off]) return false;
  var real = upKey(mm.off); if (!real) return false;
  q.key = real; q.role = mm.off; q.who = mm.nm; return true;
}
function upOffAll() { var sh = mSh(), n = sh.getLastRow(), m = {}; if (n > 1) sh.getRange(2, 1, n - 1, 2).getValues().forEach(function (r) { if (!r[0]) return; try { m[String(r[0])] = JSON.parse(r[1]).off || ""; } catch (x) {} }); return m; }
function upEnrich(r) { if (r && r.ok && r.merch) { var m = upOffAll(); r.merch.forEach(function (e) { e.off = m[e.login] || ""; }); r.okeys = upKeys(); } return r; }
function upOffice(a, p) {
  var me = staff(p); if (!me) return { ok: false, error: "auth" };
  if (a === "t_okey") {
    if (me.role !== "director") return { ok: false, error: "role" };
    var r = String(p.r || ""), k = String(p.k || "").trim(); if (!UP_OFF[r]) return { ok: false, error: "bad" };
    if (!k) { PropertiesService.getScriptProperties().deleteProperty("okey:" + r); return { ok: true, okeys: upKeys() }; }
    var ok = false;
    try { var x = UrlFetchApp.fetch(MAIN_API, { method: "post", contentType: "text/plain;charset=utf-8", payload: JSON.stringify({ a: "admin_list", key: k, role: r, who: "Проверка пароля" }), muteHttpExceptions: true, followRedirects: true }); var j = JSON.parse(x.getContentText() || "{}"); ok = !!(j && j.ok); } catch (e) { ok = false; }
    if (!ok) return { ok: false, error: "pw" };
    PropertiesService.getScriptProperties().setProperty("okey:" + r, k);
    return { ok: true, okeys: upKeys() };
  }
  if (a === "t_eoff") {
    if (me.role !== "director" && me.role !== "admin") return { ok: false, error: "role" };
    var off = String(p.off || ""); if (off && !UP_OFF[off]) return { ok: false, error: "bad" };
    if (me.role === "admin" && off && off !== "operator") return { ok: false, error: "role" };
    return locked(function () {
      var o = mGet(String(p.login || "").toLowerCase()); if (!o) return { ok: false, error: "none" };
      if (me.role === "admin" && o.off && o.off !== "operator") return { ok: false, error: "role" };
      o.off = off; mPut(o); return { ok: true, off: off };
    });
  }
  return { ok: false, error: "action" };
}

// ---------- подключение ----------
var UP_ROUTE0 = route;
route = function (p) {
  var a = String(p.a || "");
  if (a === "n_list" || a === "n_add" || a === "n_del") return nwAct(a, p);
  if (a === "m_zv_pick" || a === "m_zv_no" || a === "m_zv_send" || a === "m_zv_sendall") return upZv(a, p);
  if (a === "t_okey" || a === "t_eoff") return upOffice(a, p);
  var r = UP_ROUTE0(p);
  if (a === "t_all" || a === "t_eadd" || a === "t_eset") upEnrich(r);
  if ((a === "m_me" || a === "m_login") && r && r.ok && r.me) {
    var mm = a === "m_me" ? mTok(p.tok) : mGet(r.me.login);
    if (mm) { r.me.off = mm.off && UP_OFF[mm.off] && upKey(mm.off) ? mm.off : ""; r.me.offn = r.me.off ? UP_OFF[r.me.off] : ""; }
  }
  return r;
};
var UP_DP0 = doPost;
doPost = function (e) {
  var p = null;
  try { p = JSON.parse((e && e.postData && e.postData.contents) || "{}"); } catch (x) { p = null; }
  if (p && p.a === "o_px") {
    // заказы сайта для сотрудника, вошедшего через «Рабочий персонал»
    var q = p.q || {}; if (String(q.key || "").indexOf("T:") !== 0 || !upResolve(q)) return out({ ok: false, error: "auth" });
    try {
      var r = UrlFetchApp.fetch(MAIN_API, { method: "post", contentType: "text/plain;charset=utf-8", payload: JSON.stringify(q), muteHttpExceptions: true, followRedirects: true });
      return ContentService.createTextOutput(r.getContentText() || "{}").setMimeType(ContentService.MimeType.JSON);
    } catch (x) { return out({ ok: false, error: "main" }); }
  }
  if (p && String(p.key || "").indexOf("T:") === 0) {
    if (!upResolve(p)) return out({ ok: false, error: "auth" });
    e = { parameter: (e && e.parameter) || {}, postData: { contents: JSON.stringify(p), type: "text/plain" } };
  }
  return UP_DP0(e);
};
