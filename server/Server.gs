// ===== Умари Хайём — СЕРВЕР «Server» (весь код в одном файле) =====
// Файл «Не трогать» оставить как есть. Все остальные старые файлы удалить, этот — вставить целиком.

// ==================== Умари Хайём · Чат — Сервер: чат, кто в сети, аккаунты клиентов, бонусы, курьеры, маркетплейс, счётчик. ⚠ Только в проект «Server» (чат), не в основной сервер сайта. Файлы держать в этом порядке.
var MAIN_API = "https://script.google.com/macros/s/AKfycbxGssdYbn5tGiCuyyphhqVggnTh8htbdRkQBB-LB68DVWPCN54gveCYn5ysgWrSzNeM0g/exec";
var CHAT_ROLES = { operator: "Оператор", admin: "Администратор", director: "Руководитель" };
var ALL_ROLES = { operator: "Оператор", admin: "Администратор", accountant: "Бухгалтер", director: "Руководитель", content: "Контент-менеджер", partner: "Партнёр" };
var ONLINE_MS = 75000, MAX_TXT = 1000, MAX_CELL = 45000;
var BONUS_PCT = 2; // % от суммы товаров, начисляется после доставки

function doGet(e) { return out({ ok: true, chat: 1, name: "umari-chat" }); }
// doPost — ниже, в разделе «Поставки»
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function route(p) {
  var a = String(p.a || "");
  if (a === "c_hit") return hit(p);
  if (a === "c_pst") return { ok: true, st: pstFor(p.nos) };
  if (a === "c_promo") return { ok: true, list: promos() };
  if (a.indexOf("k_") === 0) return courier(a, p);
  if (a.indexOf("c_") === 0) return client(a, p);
  if (a.indexOf("u_") === 0) return account(a, p);
  if (a.indexOf("s_") === 0) { var me = staff(p); if (!me) return { ok: false, error: "auth" }; return staffAct(a, p, me); }
  return { ok: false, error: "action" };
}

// ---------- хранение ----------
function book() {
  var pr = PropertiesService.getScriptProperties(), id = pr.getProperty("ssid"), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (x) { ss = null; } }
  if (!ss) { ss = SpreadsheetApp.create("Умари Хайём — чат"); pr.setProperty("ssid", ss.getId()); }
  var sh = ss.getSheetByName("dlg");
  if (!sh) { sh = ss.insertSheet("dlg"); sh.appendRow(["cid", "sec", "meta", "msgs"]); }
  return sh;
}
function sheet(name, head) {
  book(); var ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("ssid"));
  var sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(head); }
  return sh;
}
function C() { return CacheService.getScriptCache(); }
function rowOf(sh, cid) {
  var c = C().get("r:" + cid); if (c) { var r = +c; if (r > 1 && sh.getRange(r, 1).getValue() === cid) return r; }
  var n = sh.getLastRow(); if (n < 2) return 0;
  var v = sh.getRange(2, 1, n - 1, 1).getValues();
  for (var i = v.length - 1; i >= 0; i--) if (v[i][0] === cid) { C().put("r:" + cid, String(i + 2), 21600); return i + 2; }
  return 0;
}
function load(cid) {
  var hit = C().get("d:" + cid); if (hit) return JSON.parse(hit);
  var sh = book(), r = rowOf(sh, cid); if (!r) return null;
  var v = sh.getRange(r, 1, 1, 4).getValues()[0];
  var d = { cid: v[0], sec: v[1], m: JSON.parse(v[2] || "{}"), msgs: JSON.parse(v[3] || "[]") };
  cacheD(d); return d;
}
function cacheD(d) { try { C().put("d:" + d.cid, JSON.stringify(d), 21600); } catch (x) {} }
function save(d) {
  var j = JSON.stringify(d.msgs);
  while (j.length > MAX_CELL && d.msgs.length > 20) { d.msgs.splice(0, 10); j = JSON.stringify(d.msgs); }
  var sh = book(), r = rowOf(sh, d.cid), row = [d.cid, d.sec, JSON.stringify(d.m), j];
  if (r) sh.getRange(r, 1, 1, 4).setValues([row]); else { sh.appendRow(row); C().put("r:" + d.cid, String(sh.getLastRow()), 21600); }
  cacheD(d); bump();
}
function bump() { var v = String(Date.now()); C().put("gv", v, 21600); PropertiesService.getScriptProperties().setProperty("gv", v); }
function gv() { return C().get("gv") || PropertiesService.getScriptProperties().getProperty("gv") || "0"; }
function locked(fn) { var L = LockService.getScriptLock(); L.waitLock(20000); try { return fn(); } finally { L.releaseLock(); } }
function add(d, from, role, who, text) {
  var id = (d.m.last || 0) + 1; d.m.last = id; d.m.ts = Date.now();
  var msg = { id: id, ts: d.m.ts, f: from, t: String(text).slice(0, MAX_TXT) };
  if (role) msg.r = role; if (who) msg.w = who;
  d.msgs.push(msg);
  if (from === "c") { d.m.cl = id; d.m.st = "open"; }
  return msg;
}
function since(d, after) { after = +after || 0; return d.msgs.filter(function (x) { return x.id > after; }); }
function agentOf(d) { return d.m.ag ? { w: d.m.ag.w, r: d.m.ag.r, rn: ALL_ROLES[d.m.ag.r] || "" } : null; }
function clean(s, n) { return String(s || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n); }

// ---------- клиент ----------
function client(a, p) {
  var cid = clean(p.cid, 40), sec = clean(p.sec, 60);
  if (!/^[a-z0-9]{12,40}$/i.test(cid) || sec.length < 16) return { ok: false, error: "id" };
  if (a === "c_send") {
    var text = clean(p.text, MAX_TXT); if (!text) return { ok: false, error: "empty" };
    var rl = C().get("rl:" + cid) || "0"; if (+rl > 25) return { ok: false, error: "slow" };
    C().put("rl:" + cid, String(+rl + 1), 60);
    return locked(function () {
      var d = load(cid);
      if (d && d.sec !== sec) return { ok: false, error: "id" };
      if (!d) d = { cid: cid, sec: sec, m: { c: Date.now(), q: "operator", st: "open", last: 0 }, msgs: [] };
      if (p.nm) d.m.nm = clean(p.nm, 60); if (p.ph) d.m.ph = clean(p.ph, 30);
      if (d.m.st === "closed") { d.m.q = "operator"; d.m.ag = null; }
      var first = !d.msgs.length;
      var msg = add(d, "c", "", "", text);
      if (first) add(d, "s", "system", "", "Спасибо! Оператор скоро ответит. Обычно это занимает пару минут.");
      save(d);
      return { ok: true, id: msg.id, v: d.m.last, msgs: since(d, (+p.after || 0)), ag: agentOf(d), st: d.m.st };
    });
  }
  if (a === "c_get") {
    var d = load(cid); if (!d) return { ok: true, none: 1 };
    if (d.sec !== sec) return { ok: false, error: "id" };
    if ((+p.after || 0) >= (d.m.last || 0)) return { ok: true, same: 1, ag: agentOf(d), st: d.m.st, sr: d.m.sr || 0 };
    return { ok: true, v: d.m.last, msgs: since(d, p.after), ag: agentOf(d), st: d.m.st, sr: d.m.sr || 0 };
  }
  return { ok: false, error: "action" };
}

// ---------- сотрудники ----------
function staff(p) {
  var role = clean(p.role, 20), who = clean(p.who, 60), key = String(p.key || "");
  if (!ALL_ROLES[role] || !who || !key) return null;
  var h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, key + "|" + role + "|" + who.toLowerCase()));
  if (C().get("au:" + h) === "1") return { role: role, who: who };
  var act = role === "content" || role === "partner" ? "admin_cat" : "admin_list", ok = false;
  try {
    var r = UrlFetchApp.fetch(MAIN_API, { method: "post", contentType: "text/plain;charset=utf-8", payload: JSON.stringify({ a: act, key: key, role: role, who: who }), muteHttpExceptions: true, followRedirects: true });
    var j = JSON.parse(r.getContentText() || "{}"); ok = !!(j && j.ok);
  } catch (x) { ok = false; }
  if (!ok) return null;
  C().put("au:" + h, "1", 21600);
  return { role: role, who: who };
}
function pres(me, st) {
  var raw = C().get("pres"), P = raw ? JSON.parse(raw) : {}, now = Date.now();
  if (me && st) {
    var k = me.role + "|" + me.who.toLowerCase(), old = P[k];
    if (st === "off") delete P[k];
    else P[k] = { w: me.who, r: me.role, ts: now, st: st === "brk" ? "brk" : "work", since: old && now - old.ts < ONLINE_MS ? old.since : now };
  }
  Object.keys(P).forEach(function (x) { if (now - P[x].ts > 6 * ONLINE_MS) delete P[x]; });
  if (me && st) C().put("pres", JSON.stringify(P), 21600);
  return Object.keys(P).map(function (x) { return P[x]; }).filter(function (u) { return now - u.ts < ONLINE_MS; });
}
function allD() {
  var sh = book(), n = sh.getLastRow(); if (n < 2) return [];
  var v = sh.getRange(2, 1, n - 1, 3).getValues(), L = [];
  v.forEach(function (r) { if (!r[0]) return; var m = JSON.parse(r[2] || "{}"); m.cid = r[0]; L.push(m); });
  return L;
}
function sum(m, me) {
  return { cid: m.cid, nm: m.nm || "Гость", ph: m.ph || "", ts: m.ts || m.c, st: m.st, q: m.q, ag: m.ag || null, last: m.last || 0, cl: m.cl || 0, sr: m.sr || 0, unr: Math.max(0, (m.cl || 0) - (m.sr || 0)) };
}
function staffAct(a, p, me) {
  if (a === "s_sync") {
    var on = locked(function () { return pres(me, p.st || "work"); });
    var g = gv(), res = { ok: true, me: me, pres: on, gv: g };
    if (String(p.gv || "") !== g && CHAT_ROLES[me.role]) {
      res.list = allD().filter(function (m) { return m.st !== "closed" || Date.now() - (m.ts || 0) < 3 * 864e5; })
      .map(function (m) { return sum(m, me); }).sort(function (x, y) { return y.ts - x.ts; }).slice(0, 80);
    }
    return res;
  }
  if (a === "s_stats") return { ok: true, st: stats(+p.days || 30) };
  if (a === "s_pord") { if (me.role === "partner" || me.role === "content") return { ok: false, error: "role" }; return { ok: true, r: locked(function () { return pordSync(p.list); }) }; }
  if (a === "s_pmine") { if (me.role !== "partner") return { ok: false, error: "role" }; return { ok: true, list: pordList(me.who) }; }
  if (a === "s_pall") { if (me.role === "partner" || me.role === "content") return { ok: false, error: "role" }; return { ok: true, list: pordList(null, p.nos) }; }
  if (a === "s_pset") return locked(function () { return pordSet(me, p); });
  if (a === "s_pcfg") { if (me.role !== "partner" && !p.own) return { ok: false, error: "role" }; var own0 = me.role === "partner" ? me.who : p.own; if (p.set && me.role === "partner") return locked(function () { return { ok: true, cfg: pcfgSet(own0, p.set) }; }); return { ok: true, cfg: pcfgGet(own0) }; }
  if (a === "s_dlv") { if (me.role === "partner" || me.role === "content") return { ok: false, error: "role" }; return { ok: true, r: locked(function () { return dlvSync(p.list); }) }; }
  if (a === "s_dlvst") { if (me.role === "partner" || me.role === "content") return { ok: false, error: "role" }; return { ok: true, list: jobsFor(p.nos) }; }
  if (a === "s_jobs") { if (me.role === "partner" || me.role === "content") return { ok: false, error: "role" }; return { ok: true, list: jobsRecent(+p.days || 3), cour: courList() }; }
  if (a === "s_cadd" || a === "s_ctog" || a === "s_cpw") { if (me.role !== "director" && me.role !== "admin") return { ok: false, error: "role" }; return locked(function () { return courAdmin(a, p); }); }
  if (a === "s_fget" || a === "s_fset" || a === "s_fdel") { if (["director", "admin", "accountant"].indexOf(me.role) < 0) return { ok: false, error: "role" }; return a === "s_fget" ? { ok: true, d: finGet() } : locked(function () { return a === "s_fset" ? finSet(me, p) : finDel(p); }); }
  if (a === "s_promo") { if (me.role !== "director" && me.role !== "admin") return { ok: false, error: "role" }; return locked(function () { return promoAdd(me, p); }); }
  if (a === "s_bonus") return { ok: true, r: locked(function () { return bonusSync(p.list); }) };
  if (a === "s_acc") { var ao = accGet(k9(p.ph)); return { ok: true, acc: ao ? { nm: ao.nm, ph: ao.ph, bal: ao.bal || 0, reg: !!ao.h, led: (ao.led || []).slice(-20).reverse() } : null }; }
  if (a === "s_pwreset") {
    if (me.role !== "admin" && me.role !== "director" && me.role !== "operator") return { ok: false, error: "role" };
    var nk = k9(p.ph), npw = String(p.pw || ""); if (!nk || npw.length < 6) return { ok: false, error: "pw" };
    return locked(function () { var o = accGet(nk); if (!o || !o.h) return { ok: false, error: "none" }; o.s = rnd(16); o.h = hashPw(npw, o.s); o.toks = []; accPut(o); return { ok: true }; });
  }
  if (!CHAT_ROLES[me.role]) return { ok: false, error: "role" };
  var cid = clean(p.cid, 40);
  if (a === "s_get") {
    var d = load(cid); if (!d) return { ok: false, error: "none" };
    var r = { ok: true, m: sum(Object.assign({ cid: cid }, d.m), me), msgs: since(d, p.after) };
    if (p.read && (d.m.sr || 0) < (d.m.cl || 0)) locked(function () { var d2 = load(cid); d2.m.sr = d2.m.cl; save(d2); });
    return r;
  }
  return locked(function () {
    var d = load(cid); if (!d) return { ok: false, error: "none" };
    var rn = CHAT_ROLES[me.role];
    var join = function () {
      if (!d.m.ag || d.m.ag.w.toLowerCase() !== me.who.toLowerCase() || d.m.ag.r !== me.role) {
        d.m.ag = { w: me.who, r: me.role }; d.m.q = me.role;
        add(d, "s", "system", "", "К чату подключился сотрудник: " + me.who + " (" + rn + ")");
      }
    };
    if (a === "s_join") { join(); }
    else if (a === "s_send") {
      var t = clean(p.text, MAX_TXT); if (!t) return { ok: false, error: "empty" };
      join(); add(d, "s", me.role, me.who, t); d.m.sr = d.m.cl; d.m.st = "open";
    }
    else if (a === "s_xfer") {
      var to = clean(p.to, 20); if (!CHAT_ROLES[to]) return { ok: false, error: "role" };
      var on = pres(null, null).filter(function (u) { return u.r === to && u.st === "work"; });
      if (!on.length) return { ok: false, error: "offline" };
      d.m.q = to; d.m.ag = null;
      add(d, "s", "system", "", me.who + " (" + rn + ") передал(а) ваш вопрос: " + CHAT_ROLES[to] + ". Сейчас подключится.");
    }
    else if (a === "s_close") {
      d.m.st = "closed"; d.m.ag = null; d.m.q = "operator";
      add(d, "s", "system", "", "Диалог завершён. Если появятся вопросы — просто напишите сюда.");
    }
    else return { ok: false, error: "action" };
    save(d);
    return { ok: true, m: sum(Object.assign({ cid: cid }, d.m), me), msgs: since(d, p.after) };
  });
}

// ---------- счётчик посетителей ----------
function dkey(ts) { return Utilities.formatDate(new Date(ts || Date.now()), "Asia/Dushanbe", "yyyy-MM-dd"); }
function hit(p) {
  var P = PropertiesService.getScriptProperties(), k = "st:" + dkey();
  return locked(function () {
    var v = (P.getProperty(k) || "0,0,0").split(",").map(Number); // просмотры, посетители за день, новые
    v[0]++; if (p.day) v[1]++; if (p.nw) v[2]++;
    P.setProperty(k, v.join(","));
    if (p.nw) P.setProperty("st:all", String(+(P.getProperty("st:all") || 0) + 1));
    P.setProperty("st:views", String(+(P.getProperty("st:views") || 0) + 1));
    return { ok: true };
  });
}
function stats(days) {
  var P = PropertiesService.getScriptProperties(), L = [], now = Date.now();
  for (var i = days - 1; i >= 0; i--) { var d = dkey(now - i * 864e5), v = (P.getProperty("st:" + d) || "0,0,0").split(",").map(Number); L.push({ d: d, v: v[0], u: v[1], n: v[2] }); }
  return { days: L, all: +(P.getProperty("st:all") || 0), views: +(P.getProperty("st:views") || 0) };
}

// ---------- аккаунты клиентов ----------
function k9(ph) { var d = String(ph || "").replace(/\D/g, ""); return d.length >= 9 ? d.slice(-9) : ""; }
function hashPw(pw, salt) { var h = salt + "|" + pw; for (var i = 0; i < 300; i++) h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + salt)); return h; }
function rnd(n) { var a = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789", s = ""; for (var i = 0; i < n; i++) s += a.charAt(Math.floor(Math.random() * a.length)); return s; }
function accSh() { return sheet("acc", ["phone9", "json"]); }
function accRow(sh, k) {
  var c = C().get("ar:" + k); if (c && sh.getRange(+c, 1).getValue() == k) return +c;
  var n = sh.getLastRow(); if (n < 2) return 0;
  var v = sh.getRange(2, 1, n - 1, 1).getValues();
  for (var i = 0; i < v.length; i++) if (String(v[i][0]) === k) { C().put("ar:" + k, String(i + 2), 21600); return i + 2; }
  return 0;
}
function accGet(k) { var sh = accSh(), r = accRow(sh, k); if (!r) return null; var o = JSON.parse(sh.getRange(r, 2).getValue() || "{}"); o.k = k; return o; }
function accPut(o) {
  var sh = accSh(), r = accRow(sh, o.k), row = ["'" + o.k, JSON.stringify(o)];
  if (r) sh.getRange(r, 1, 1, 2).setValues([row]); else { sh.appendRow(row); C().put("ar:" + o.k, String(sh.getLastRow()), 21600); }
  C().remove("acc:" + o.k);
}
function tokAcc(tok) {
  tok = String(tok || ""); if (tok.length < 20) return null;
  var k = C().get("tk:" + tok) || PropertiesService.getScriptProperties().getProperty("tk:" + tok);
  if (!k) return null; var o = accGet(k); if (!o || (o.toks || []).indexOf(tok) < 0) return null; return o;
}
function newTok(o) {
  var t = rnd(40); o.toks = (o.toks || []).concat([t]);
  var P = PropertiesService.getScriptProperties();
  while (o.toks.length > 8) { var old = o.toks.shift(); P.deleteProperty("tk:" + old); C().remove("tk:" + old); }
  P.setProperty("tk:" + t, o.k); C().put("tk:" + t, o.k, 21600); return t;
}
function mainGet(q) {
  try { var r = UrlFetchApp.fetch(MAIN_API + "?" + q, { muteHttpExceptions: true, followRedirects: true }); return JSON.parse(r.getContentText() || "{}"); } catch (x) { return null; }
}
function otpOn() { var c = C().get("otpon"); if (c) return c === "1"; var j = mainGet("a=cfg"); var on = !!(j && j.otp); C().put("otpon", on ? "1" : "0", 600); return on; }
function phoneOk(ph, tk) { if (!otpOn()) return true; if (!tk) return false; var j = mainGet("a=my&ph=" + encodeURIComponent(ph) + "&tk=" + encodeURIComponent(tk)); return !!(j && j.ok); }
function pub(o) { return { nm: o.nm || "", ph: o.ph || "", bal: Math.round((o.bal || 0) * 100) / 100, led: (o.led || []).slice(-30).reverse(), pct: BONUS_PCT }; }
function ordSh() { return sheet("ord", ["no", "phone9", "json", "ts"]); }
function accOrders(k) {
  var sh = ordSh(), n = sh.getLastRow(); if (n < 2) return [];
  var v = sh.getRange(2, 1, n - 1, 3).getValues(), L = [];
  v.forEach(function (r) { if (String(r[1]) === k) { try { L.push(JSON.parse(r[2])); } catch (x) {} } });
  return L.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); }).slice(0, 300);
}
function saveOrders(k, list) {
  var sh = ordSh(), n = sh.getLastRow(), v = n >= 2 ? sh.getRange(2, 1, n - 1, 2).getValues() : [], idx = {};
  v.forEach(function (r, i) { idx[String(r[0])] = { row: i + 2, k: String(r[1]) }; });
  var c = 0;
  (list || []).slice(0, 40).forEach(function (o) {
    if (!o || !o.no || !o.cust || k9(o.cust.ph) !== k) return;
    var j = JSON.stringify(o); if (j.length > 40000) return;
    var ex = idx[String(o.no)];
    if (ex) { if (ex.k !== k) return; sh.getRange(ex.row, 3, 1, 2).setValues([[j, o.ts || Date.now()]]); }
    else { sh.appendRow(["'" + o.no, "'" + k, j, o.ts || Date.now()]); idx[String(o.no)] = { row: sh.getLastRow(), k: k }; }
    c++;
  });
  return c;
}
function addLed(o, t, amt, no, note) { o.bal = Math.round(((o.bal || 0) + amt) * 100) / 100; if (o.bal < 0) o.bal = 0; o.led = (o.led || []).concat([{ ts: Date.now(), t: t, a: Math.round(amt * 100) / 100, no: no || "", n: note || "" }]).slice(-200); }
function expireHolds(o) {
  var now = Date.now(), ch = false;
  (o.holds || []).forEach(function (h) { if (!h.no && !h.done && now - h.ts > 3600000) { h.done = 1; addLed(o, "refund", h.a, "", "Бонусы вернулись: заказ не был оформлен"); ch = true; } });
  o.holds = (o.holds || []).filter(function (h) { return now - h.ts < 90 * 864e5; });
  return ch;
}
function account(a, p) {
  var k = k9(p.ph);
  if (a === "u_reg") {
    var pw = String(p.pw || ""), nm = clean(p.nm, 60);
    if (!k) return { ok: false, error: "ph" }; if (pw.length < 6) return { ok: false, error: "pw" }; if (!nm) return { ok: false, error: "nm" };
    if (!phoneOk(p.ph, p.tk)) return { ok: false, error: "otp" };
    return locked(function () {
      var o = accGet(k);
      if (o && o.h) return { ok: false, error: "exists" };
      o = o || { k: k, bal: 0, led: [] };
      o.nm = nm; o.ph = clean(p.ph, 30); o.s = rnd(16); o.h = hashPw(pw, o.s); o.c = Date.now();
      var t = newTok(o); accPut(o);
      return { ok: true, tok: t, me: pub(o), orders: accOrders(k) };
    });
  }
  if (a === "u_login") {
    if (!k) return { ok: false, error: "ph" };
    var tries = +(C().get("lg:" + k) || 0); if (tries >= 6) return { ok: false, error: "slow" };
    var o = accGet(k);
    if (!o || !o.h || hashPw(String(p.pw || ""), o.s) !== o.h) { C().put("lg:" + k, String(tries + 1), 600); return { ok: false, error: o && o.h ? "pw" : "none" }; }
    return locked(function () { var o2 = accGet(k), t = newTok(o2); expireHolds(o2); accPut(o2); return { ok: true, tok: t, me: pub(o2), orders: accOrders(k) }; });
  }
  if (a === "u_reset") {
    if (!k) return { ok: false, error: "ph" }; if (String(p.pw || "").length < 6) return { ok: false, error: "pw" };
    if (!otpOn()) return { ok: false, error: "nootp" };
    if (!phoneOk(p.ph, p.tk)) return { ok: false, error: "otp" };
    return locked(function () { var o = accGet(k); if (!o || !o.h) return { ok: false, error: "none" }; o.s = rnd(16); o.h = hashPw(String(p.pw), o.s); o.toks = []; var t = newTok(o); accPut(o); return { ok: true, tok: t, me: pub(o), orders: accOrders(k) }; });
  }
  var me = tokAcc(p.tok); if (!me) return { ok: false, error: "tok" };
  if (a === "u_me") {
    if (expireHolds(me)) locked(function () { var o = accGet(me.k); expireHolds(o); accPut(o); });
    return { ok: true, me: pub(me), orders: p.lite ? undefined : accOrders(me.k) };
  }
  if (a === "u_save") { var n = locked(function () { return saveOrders(me.k, p.orders); }); return { ok: true, n: n }; }
  if (a === "u_out") { return locked(function () { var o = accGet(me.k); o.toks = (o.toks || []).filter(function (t) { return t !== p.tok; }); PropertiesService.getScriptProperties().deleteProperty("tk:" + p.tok); C().remove("tk:" + p.tok); accPut(o); return { ok: true }; }); }
  if (a === "u_hold") {
    var amt = Math.round((+p.amt || 0) * 100) / 100; if (!(amt > 0)) return { ok: false, error: "amt" };
    return locked(function () {
      var o = accGet(me.k); expireHolds(o);
      if ((o.bal || 0) + 0.001 < amt) { accPut(o); return { ok: false, error: "bal", me: pub(o) }; }
      var id = rnd(12); o.holds = (o.holds || []).concat([{ id: id, a: amt, ts: Date.now() }]);
      addLed(o, "spend", -amt, "", "Оплата заказа бонусами"); accPut(o);
      return { ok: true, id: id, me: pub(o) };
    });
  }
  if (a === "u_link") {
    return locked(function () { var o = accGet(me.k); (o.holds || []).forEach(function (h) { if (h.id === p.id && !h.no) { h.no = String(p.no || "").slice(0, 30); (o.led || []).forEach(function (l) { if (l.t === "spend" && !l.no && Math.abs(l.a + h.a) < 0.001) l.no = h.no; }); } }); accPut(o); return { ok: true, me: pub(o) }; });
  }
  return { ok: false, error: "action" };
}
// ---------- бонусы: начисление и возврат по данным панели сотрудников ----------
function bonusSync(list) {
  var sh = sheet("bon", ["no", "phone9", "kind", "amount", "ts"]), n = sh.getLastRow(), done = {};
  if (n >= 2) sh.getRange(2, 1, n - 1, 3).getValues().forEach(function (r) { done[String(r[0]) + "|" + r[2]] = 1; });
  var res = { earn: 0, refund: 0, rev: 0 }, accs = {};
  function acc(k) { if (!accs[k]) accs[k] = accGet(k) || { k: k, bal: 0, led: [] }; return accs[k]; }
  (list || []).slice(0, 400).forEach(function (x) {
    var k = k9(x.ph), no = String(x.no || ""); if (!k || !no) return;
    var st = String(x.st || ""), base = Math.max(0, +x.base || 0);
    if ((st === "done" || st === "recv") && x.r && !done[no + "|earn"]) {
      var amt = Math.round(base * BONUS_PCT) / 100; if (amt <= 0) return;
      addLed(acc(k), "earn", amt, no, "Бонус " + BONUS_PCT + "% за заказ"); sh.appendRow(["'" + no, "'" + k, "earn", amt, Date.now()]); done[no + "|earn"] = 1; res.earn++;
    }
    if (st === "cancel") {
      var o = acc(k);
      if (x.bid && !done[no + "|refund"]) {
        var h = (o.holds || []).filter(function (h) { return h.id === x.bid && !h.done; })[0];
        if (h) { h.done = 1; addLed(o, "refund", h.a, no, "Возврат бонусов: заказ отменён"); sh.appendRow(["'" + no, "'" + k, "refund", h.a, Date.now()]); done[no + "|refund"] = 1; res.refund++; }
      }
      if (done[no + "|earn"] && !done[no + "|rev"]) {
        var e = (o.led || []).filter(function (l) { return l.t === "earn" && l.no === no; })[0];
        if (e) { addLed(o, "rev", -e.a, no, "Списан бонус: заказ отменён"); sh.appendRow(["'" + no, "'" + k, "rev", -e.a, Date.now()]); done[no + "|rev"] = 1; res.rev++; }
      }
    }
  });
  Object.keys(accs).forEach(function (k) { accPut(accs[k]); });
  return res;
}

// ---------- маркетплейс: заказы на товары партнёров ----------
// Шаги части заказа у партнёра: new → acc (принят) → pack (собран) → go (в пути: везёт курьер или сам продавец) → done (доставлен)
var PSTEPS = ["new", "acc", "pack", "go", "done"], OLDST = { ship: "go", sc: "done" };
var FEE_PCT = 1, FEE_MIN = 10, STORE = { t: "Склад «Умари Хайём»", addr: "г. Душанбе, ул. А. Дониш, 5/3", ph: "+992986868662" };
function pordSh() { return sheet("pord", ["key", "no", "own", "json", "ts"]); }
function pordAll() {
  var sh = pordSh(), n = sh.getLastRow(), L = [];
  if (n < 2) return { sh: sh, L: L };
  sh.getRange(2, 1, n - 1, 4).getValues().forEach(function (r, i) { if (!r[0]) return; try { var o = JSON.parse(r[3]); if (OLDST[o.pst]) o.pst = OLDST[o.pst]; o.row = i + 2; L.push(o); } catch (x) {} });
  return { sh: sh, L: L };
}
function pordPut(sh, o) {
  var row = o.row; delete o.row; var j = JSON.stringify(o), v = ["'" + o.no + "|" + o.own, "'" + o.no, "'" + o.own, j, o.ts || Date.now()];
  if (row) sh.getRange(row, 1, 1, 5).setValues([v]); else { sh.appendRow(v); }
  C().remove("pst:" + o.no);
}
function cleanTo(t) { t = t || {}; var g = t.geo && isFinite(+t.geo.la) && isFinite(+t.geo.lo) ? { la: +t.geo.la, lo: +t.geo.lo } : null; return { nm: clean(t.nm, 60), ph: clean(t.ph, 30), cty: clean(t.cty, 60), ad: clean(t.ad, 200), cm: clean(t.cm, 300), tm: clean(t.tm, 60), pay: clean(t.pay, 60), dm: t.dm === "p" ? "p" : "d", geo: g }; }
function pordSync(list) {
  var A = pordAll(), by = {}, res = { add: 0, upd: 0 };
  A.L.forEach(function (o) { by[o.no + "|" + o.own] = o; });
  (list || []).slice(0, 300).forEach(function (x) {
    var no = String(x.no || ""), own = String(x.own || "").toLowerCase(); if (!no || !own) return;
    var o = by[no + "|" + own], items = (x.items || []).slice(0, 50).map(function (it) { return { n: String(it.n || "").slice(0, 160), q: +it.q || 0, l: String(it.l || "шт.").slice(0, 12), s: Math.round((+it.s || 0) * 100) / 100 }; });
    var to = cleanTo(x.to), extra = { rest: Math.round((+x.rest || 0) * 100) / 100, shop: !!x.shop };
    if (!o) { o = { no: no, own: own, ts: +x.ts || Date.now(), items: items, ost: x.st || "new", pst: x.st === "cancel" ? "cancel" : "new", log: [{ ts: Date.now(), st: "new" }], to: to, rest: extra.rest, shop: extra.shop }; pordPut(A.sh, o); by[no + "|" + own] = o; res.add++; return; }
    var ch = false;
    if (x.st && o.ost !== x.st) { o.ost = x.st; ch = true; if (x.st === "cancel" && o.pst !== "cancel") { o.pst = "cancel"; o.log.push({ ts: Date.now(), st: "cancel" }); jobCancel("P|" + no + "|" + own); } }
    if (JSON.stringify(items) !== JSON.stringify(o.items) || JSON.stringify(to) !== JSON.stringify(o.to) || o.rest !== extra.rest || o.shop !== extra.shop) { o.items = items; o.to = to; o.rest = extra.rest; o.shop = extra.shop; ch = true; }
    if (ch) { pordPut(A.sh, o); res.upd++; }
  });
  return res;
}
function partSum(o) { var s = 0; (o.items || []).forEach(function (it) { s += +it.s || 0; }); return Math.round(s * 100) / 100; }
function feeOf(o) { return Math.max(FEE_MIN, Math.round(partSum(o) * FEE_PCT) / 100); }
function pordList(own, nos) {
  var lim = Date.now() - 90 * 864e5, want = nos ? {} : null, cfg = own ? pcfgGet(own) : null;
  if (nos) (nos || []).forEach(function (n) { want[String(n)] = 1; });
  return pordAll().L.filter(function (o) { if (want) return want[o.no]; return (!own || o.own === String(own).toLowerCase()) && o.ts > lim; })
  .map(function (o) { delete o.row; if (own && cfg && cfg.mode !== "self" && o.to) o.to = { dm: o.to.dm, cty: o.to.cty }; return o; }).sort(function (a, b) { return b.ts - a.ts; }).slice(0, 300);
}
function pordSet(me, p) {
  var no = String(p.no || ""), st = String(p.st || ""), own = me.role === "partner" ? me.who.toLowerCase() : String(p.own || "").toLowerCase();
  var A = pordAll(), o = A.L.filter(function (x) { return x.no === no && x.own === own; })[0];
  if (!o) return { ok: false, error: "none" };
  if (o.pst === "cancel") return { ok: false, error: "cancel" };
  var cfg = pcfgGet(own), cour = cfg.mode !== "self" && o.to && o.to.dm === "d";
  var cur = PSTEPS.indexOf(o.pst), nx = PSTEPS.indexOf(st);
  if (nx < 0) return { ok: false, error: "st" };
  if (me.role === "partner") { if (nx !== cur + 1) return { ok: false, error: "order" }; if (cour && nx > 2) return { ok: false, error: "courier" }; }
  o.pst = st; o.mode = cour ? "cour" : "self"; o.log.push({ ts: Date.now(), st: st, w: me.who, r: me.role });
  if (st === "pack" && cour) jobPut({ key: "P|" + no + "|" + own, no: no, kind: "part", own: own, from: { t: cfg.nm || ("Партнёр " + own), addr: cfg.addr || "", ph: cfg.ph || "" }, to: o.to, sum: partSum(o), cod: o.shop ? 0 : o.rest, n: o.items.length, items: o.items });
  if (st === "done" && cour) o.fee = feeOf(o);
  pordPut(A.sh, o); delete o.row;
  return { ok: true, o: o };
}
function pstFor(nos) {
  var out = {}, need = [];
  (nos || []).slice(0, 60).forEach(function (n) { n = String(n); var c = C().get("pst:" + n); if (c) out[n] = JSON.parse(c); else need.push(n); });
  if (need.length) {
    var w = {}; need.forEach(function (n) { w[n] = 1; out[n] = []; });
    pordAll().L.forEach(function (o) { if (w[o.no]) { var t = {}; o.log.forEach(function (l) { t[OLDST[l.st] || l.st] = l.ts; }); out[o.no].push({ st: o.pst, t: t, n: o.items.length, m: o.mode || "" }); } });
    need.forEach(function (n) { C().put("pst:" + n, JSON.stringify(out[n]), 120); });
  }
  return out;
}
// ---------- настройки партнёра ----------
function pcfgGet(own) { own = String(own || "").toLowerCase(); var v = PropertiesService.getScriptProperties().getProperty("pc:" + own); var o = v ? JSON.parse(v) : {}; o.mode = o.mode === "self" ? "self" : "cour"; o.fee = { pct: FEE_PCT, min: FEE_MIN }; return o; }
function pcfgSet(own, x) { own = String(own || "").toLowerCase(); var o = { mode: x.mode === "self" ? "self" : "cour", addr: clean(x.addr, 200), ph: clean(x.ph, 30), nm: clean(x.nm, 80) }; PropertiesService.getScriptProperties().setProperty("pc:" + own, JSON.stringify(o)); return pcfgGet(own); }
// ---------- доставка: задания для курьеров ----------
function jobSh() { return sheet("dlv", ["key", "no", "json", "ts"]); }
function jobAll() {
  var sh = jobSh(), n = sh.getLastRow(), L = [];
  if (n >= 2) sh.getRange(2, 1, n - 1, 3).getValues().forEach(function (r, i) { if (!r[0]) return; try { var o = JSON.parse(r[2]); o.row = i + 2; L.push(o); } catch (x) {} });
  return { sh: sh, L: L };
}
function jobSave(sh, o) { var row = o.row; delete o.row; var v = ["'" + o.key, "'" + o.no, JSON.stringify(o), o.ts || Date.now()]; if (row) sh.getRange(row, 1, 1, 4).setValues([v]); else sh.appendRow(v); C().put("jv", String(Date.now()), 21600); }
function jobPut(x) {
  var J = jobAll(), o = J.L.filter(function (j) { return j.key === x.key; })[0];
  if (o) { if (o.st === "done" || o.st === "cancel") return o; ["from", "to", "sum", "cod", "n", "items"].forEach(function (k) { if (x[k] !== undefined) o[k] = x[k]; }); jobSave(J.sh, o); return o; }
  o = { key: x.key, no: x.no, kind: x.kind, own: x.own || "", from: x.from, to: cleanTo(x.to), sum: x.sum || 0, cod: x.cod || 0, n: x.n || 0, items: (x.items || []).slice(0, 30), st: "ready", ts: Date.now(), log: [{ ts: Date.now(), st: "ready" }] };
  jobSave(J.sh, o); return o;
}
function jobCancel(key) { var J = jobAll(), o = J.L.filter(function (j) { return j.key === key; })[0]; if (o && o.st !== "done" && o.st !== "cancel") { o.st = "cancel"; o.log.push({ ts: Date.now(), st: "cancel" }); jobSave(J.sh, o); } }
function dlvSync(list) {
  var J = jobAll(), by = {}, res = { add: 0, upd: 0 };
  J.L.forEach(function (o) { by[o.key] = o; });
  (list || []).slice(0, 200).forEach(function (x) {
    var key = "S|" + x.no, o = by[key];
    if (!o) { if (x.st !== "ready" && x.st !== "courier") return; jobPut({ key: key, no: x.no, kind: "shop", from: STORE, to: x.to, sum: +x.sum || 0, cod: +x.rest || 0, n: +x.n || 0, items: x.items }); res.add++; return; }
    var ch = false;
    if ((x.st === "cancel") && o.st !== "cancel" && o.st !== "done") { o.st = "cancel"; o.log.push({ ts: Date.now(), st: "cancel" }); ch = true; }
    if ((x.st === "done" || x.st === "recv") && o.st !== "done" && o.st !== "cancel") { o.st = "done"; o.log.push({ ts: Date.now(), st: "done", w: "магазин" }); ch = true; }
    if (o.st === "ready" || o.st === "taken") { var t2 = cleanTo(x.to); if (JSON.stringify(t2) !== JSON.stringify(o.to) || o.cod !== (+x.rest || 0)) { o.to = t2; o.cod = +x.rest || 0; ch = true; } }
    if (ch) { jobSave(J.sh, o); res.upd++; }
  });
  return res;
}
function jobsFor(nos) { var w = {}; (nos || []).forEach(function (n) { w[String(n)] = 1; }); return jobAll().L.filter(function (o) { return w[o.no]; }).map(function (o) { delete o.row; return o; }); }
function jobsRecent(days) { var lim = Date.now() - days * 864e5; return jobAll().L.filter(function (o) { return o.ts > lim || o.st === "ready" || o.st === "taken"; }).map(function (o) { delete o.row; return o; }).sort(function (a, b) { return b.ts - a.ts; }).slice(0, 300); }
// ---------- курьеры ----------
function courSh() { return sheet("cour", ["login", "json"]); }
function courGet(login) { login = String(login || "").toLowerCase(); var sh = courSh(), n = sh.getLastRow(); if (n < 2) return null; var v = sh.getRange(2, 1, n - 1, 2).getValues(); for (var i = 0; i < v.length; i++) if (String(v[i][0]) === login) { var o = JSON.parse(v[i][1]); o.login = login; o.row = i + 2; return o; } return null; }
function courPut(o) { var sh = courSh(), row = o.row; delete o.row; var v = [o.login, JSON.stringify(o)]; if (row) sh.getRange(row, 1, 1, 2).setValues([v]); else sh.appendRow(v); }
function courList() { var sh = courSh(), n = sh.getLastRow(); if (n < 2) return []; return sh.getRange(2, 1, n - 1, 2).getValues().filter(function (r) { return r[0]; }).map(function (r) { var o = JSON.parse(r[1]); return { login: String(r[0]), nm: o.nm, ph: o.ph, on: o.on !== false }; }); }
function courAdmin(a, p) {
  var login = String(p.login || "").toLowerCase().replace(/[^a-z0-9_.-]/g, "");
  if (!login) return { ok: false, error: "login" };
  var o = courGet(login);
  if (a === "s_cadd") { if (o) return { ok: false, error: "exists" }; if (String(p.pw || "").length < 6) return { ok: false, error: "pw" }; o = { login: login, nm: clean(p.nm, 60), ph: clean(p.ph, 30), s: rnd(16), on: true }; o.h = hashPw(String(p.pw), o.s); courPut(o); return { ok: true, list: courList() }; }
  if (!o) return { ok: false, error: "none" };
  if (a === "s_ctog") { o.on = !!p.on; if (!o.on) o.toks = []; courPut(o); return { ok: true, list: courList() }; }
  if (a === "s_cpw") { if (String(p.pw || "").length < 6) return { ok: false, error: "pw" }; o.s = rnd(16); o.h = hashPw(String(p.pw), o.s); o.toks = []; courPut(o); return { ok: true }; }
}
function courTok(tok) { tok = String(tok || ""); if (tok.length < 20) return null; var login = C().get("kt:" + tok) || PropertiesService.getScriptProperties().getProperty("kt:" + tok); if (!login) return null; var o = courGet(login); if (!o || o.on === false || (o.toks || []).indexOf(tok) < 0) return null; return o; }
function courier(a, p) {
  if (a === "k_login") {
    var login = String(p.login || "").toLowerCase(), tries = +(C().get("kl:" + login) || 0); if (tries >= 6) return { ok: false, error: "slow" };
    var o = courGet(login);
    if (!o || o.on === false || hashPw(String(p.pw || ""), o.s) !== o.h) { C().put("kl:" + login, String(tries + 1), 600); return { ok: false, error: "pw" }; }
    return locked(function () { var o2 = courGet(login), t = rnd(40); o2.toks = (o2.toks || []).concat([t]).slice(-5); PropertiesService.getScriptProperties().setProperty("kt:" + t, login); C().put("kt:" + t, login, 21600); courPut(o2); return { ok: true, tok: t, me: { login: login, nm: o2.nm } }; });
  }
  var me = courTok(p.tok); if (!me) return { ok: false, error: "tok" };
  if (a === "k_list") {
    var L = jobAll().L, day = Date.now() - 864e5;
    var ready = L.filter(function (o) { return o.st === "ready"; }), mine = L.filter(function (o) { return o.cour && o.cour.login === me.login && (o.st === "taken" || (o.st !== "ready" && o.ts > day) || (o.log[o.log.length - 1] || {}).ts > day); });
    [ready, mine].forEach(function (X) { X.forEach(function (o) { delete o.row; }); });
    return { ok: true, me: { login: me.login, nm: me.nm }, ready: ready, mine: mine, jv: C().get("jv") || "" };
  }
  return locked(function () {
    var J = jobAll(), o = J.L.filter(function (x) { return x.key === p.key; })[0]; if (!o) return { ok: false, error: "none" };
    if (a === "k_take") { if (o.st !== "ready") return { ok: false, error: "taken" }; o.st = "taken"; o.cour = { login: me.login, nm: me.nm, ph: me.ph }; o.log.push({ ts: Date.now(), st: "taken", w: me.nm }); }
    else if (a === "k_done" || a === "k_fail" || a === "k_drop") {
      if (o.st !== "taken" || !o.cour || o.cour.login !== me.login) return { ok: false, error: "notyours" };
      if (a === "k_done") { o.st = "done"; o.cash = Math.round((+p.cash || 0) * 100) / 100; o.log.push({ ts: Date.now(), st: "done", w: me.nm, cash: o.cash, note: clean(p.note, 200) }); }
      else if (a === "k_fail") { o.st = "ready"; o.log.push({ ts: Date.now(), st: "fail", w: me.nm, note: clean(p.why, 200) }); o.fails = (o.fails || 0) + 1; o.cour = null; }
      else { o.st = "ready"; o.log.push({ ts: Date.now(), st: "drop", w: me.nm }); o.cour = null; }
    } else return { ok: false, error: "action" };
    jobSave(J.sh, o); delete o.row;
    if (o.kind === "part") { var A = pordAll(), po = A.L.filter(function (x) { return x.no === o.no && x.own === o.own; })[0]; if (po && po.pst !== "cancel") { var st2 = o.st === "taken" ? "go" : o.st === "done" ? "done" : "pack"; if (po.pst !== st2) { po.pst = st2; po.log.push({ ts: Date.now(), st: st2, w: me.nm, r: "courier" }); if (st2 === "done") po.fee = feeOf(po); pordPut(A.sh, po); } } }
    return { ok: true, job: o };
  });
}
// ---------- рассылка акций клиентам ----------
function promos() { var v = PropertiesService.getScriptProperties().getProperty("promo"), L = v ? JSON.parse(v) : [], lim = Date.now() - 30 * 864e5; return L.filter(function (x) { return x.ts > lim; }).slice(-5); }
function promoAdd(me, p) { var t = clean(p.t, 80), x = clean(p.x, 300); if (!t) return { ok: false, error: "empty" }; var v = PropertiesService.getScriptProperties().getProperty("promo"), L = v ? JSON.parse(v) : []; L.push({ id: rnd(8), ts: Date.now(), t: t, x: x, w: me.who }); L = L.slice(-20); PropertiesService.getScriptProperties().setProperty("promo", JSON.stringify(L)); return { ok: true, list: L }; }
// ---------- финансы: компании (акт сверки), записи по ним, расходы ----------
var FIN_KINDS = { co: 1, en: 1, ex: 1 };
function finSh() { return sheet("fin", ["key", "kind", "json", "ts"]); }
function finGet() {
  var sh = finSh(), n = sh.getLastRow(), d = { co: [], en: [], ex: [] };
  if (n >= 2) sh.getRange(2, 1, n - 1, 3).getValues().forEach(function (r) { if (!r[0] || !FIN_KINDS[r[1]]) return; try { d[r[1]].push(JSON.parse(r[2])); } catch (x) {} });
  return d;
}
function finRow(sh, key) { var n = sh.getLastRow(); if (n < 2) return 0; var v = sh.getRange(2, 1, n - 1, 1).getValues(); for (var i = 0; i < v.length; i++) if (String(v[i][0]) === key) return i + 2; return 0; }
function finSet(me, p) {
  var k = String(p.kind || ""); if (!FIN_KINDS[k]) return { ok: false, error: "kind" };
  var o = p.obj || {}; if (!o.id) o.id = k + rnd(10);
  var js = JSON.stringify(o); if (js.length > 40000) return { ok: false, error: "big" };
  o.w = me.who; o.r = me.role; o.ut = Date.now(); if (!o.ts) o.ts = Date.now();
  var sh = finSh(), key = k + "|" + o.id, row = finRow(sh, key), v = [key, k, JSON.stringify(o), o.ts];
  if (row) sh.getRange(row, 1, 1, 4).setValues([v]); else sh.appendRow(v);
  return { ok: true, obj: o };
}
function finDel(p) { var k = String(p.kind || ""), sh = finSh(), row = finRow(sh, k + "|" + p.id); if (!row) return { ok: false, error: "none" }; sh.deleteRow(row); return { ok: true }; }

// ==================== Умари Хайём · Поставки — Поставки: склад / рынок / партнёр → магазин. Файлы держать в этом порядке.
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

// ==================== Умари Хайём · QR — Оплата по единому QR. Файлы держать в этом порядке.
var QR_ROUTE0 = route;
route = function (p) {
  var a = String(p.a || "");
  if (a === "c_qrpay") return qrClaim(p);
  if (a === "c_qrst") return { ok: true, st: qrSt(p.nos) };
  if (a === "s_qr" || a === "s_qrset") {
    var me = staff(p); if (!me) return { ok: false, error: "auth" };
    if (me.role === "partner" || me.role === "content") return { ok: false, error: "role" };
    if (a === "s_qr") return { ok: true, L: qrAll().L.filter(function (o) { return o.st === "wait" || Date.now() - (o.ts || 0) < 14 * 864e5; }) };
    return locked(function () { return qrSet(me, p); });
  }
  return QR_ROUTE0(p);
};
function qrSh() { return sheet("qrpay", ["no", "json", "ts"]); }
function qrAll() {
  var sh = qrSh(), n = sh.getLastRow(), L = [];
  if (n > 1) sh.getRange(2, 1, n - 1, 2).getValues().forEach(function (r, i) { if (!r[0]) return; try { var o = JSON.parse(r[1] || "{}"); o.no = String(r[0]); o.row = i + 2; L.push(o); } catch (x) {} });
  return { sh: sh, L: L };
}
function qrPut(sh, o) { var row = o.row; delete o.row; var v = [o.no, JSON.stringify(o), o.ts || Date.now()]; if (row) sh.getRange(row, 1, 1, 3).setValues([v]); else sh.appendRow(v); }
function qrClaim(p) {
  var no = clean(p.no, 20), amt = Math.round((+p.amt || 0) * 100) / 100;
  if (!/^[\w\-\/]{1,20}$/.test(no)) return { ok: false, error: "no" };
  if (!(amt > 0) || amt > 1000000) return { ok: false, error: "amt" };
  var ph = clean(p.ph, 30), rk = "qrl:" + (ph.replace(/\D/g, "").slice(-9) || no), rl = +(C().get(rk) || 0);
  if (rl > 10) return { ok: false, error: "slow" };
  C().put(rk, String(rl + 1), 600);
  return locked(function () {
    var A = qrAll(), o = A.L.filter(function (x) { return x.no === no; })[0];
    if (o && o.st === "ok") return { ok: true, st: "ok" };
    if (!o) o = { no: no, log: [] };
    o.amt = amt; o.sum = +p.sum || 0; o.nm = clean(p.nm, 60); o.ph = ph; o.bank = clean(p.bank, 40); o.cm = clean(p.cm, 200);
    o.st = "wait"; o.ts = Date.now(); o.log = (o.log || []).slice(-20); o.log.push({ ts: o.ts, t: "Клиент сообщил об оплате " + amt + " сом." });
    qrPut(A.sh, o);
    return { ok: true, st: "wait" };
  });
}
function qrSt(nos) {
  var want = {}; (Array.isArray(nos) ? nos : String(nos || "").split(",")).slice(0, 200).forEach(function (n) { want[String(n)] = 1; });
  var r = {}; qrAll().L.forEach(function (o) { if (want[o.no]) r[o.no] = { st: o.st, amt: o.amt, ts: o.ts, why: o.why || "" }; });
  return r;
}
function qrSet(me, p) {
  var no = clean(p.no, 20), st = String(p.st || "");
  if (["ok", "rej", "wait"].indexOf(st) < 0) return { ok: false, error: "st" };
  var A = qrAll(), o = A.L.filter(function (x) { return x.no === no; })[0];
  if (!o) { if (st !== "ok") return { ok: false, error: "none" }; o = { no: no, log: [], amt: +p.amt || 0 }; }
  o.st = st; o.why = clean(p.why, 200); o.by = me.who; o.done = Date.now();
  o.log = (o.log || []).slice(-20); o.log.push({ ts: o.done, t: (st === "ok" ? "Оплата найдена в Алиф" : st === "rej" ? "Оплата не найдена" : "На проверке") + " — " + me.who });
  qrPut(A.sh, o);
  return { ok: true, o: o };
}

// ==================== Умари Хайём · Kurer — Курьеры: фотоотчёт, деньги у курьера, рейтинг, уровни, купон. Настройки ниже можно менять. Файлы держать в этом порядке.
var K = {
  TAKE_MIN: 15,        // взял за 15 мин — «гениально»
  TAKE_LIM: 60,        // не взяли за 60 мин — нарушение
  DLV_LIM: 150,        // 2,5 часа на вручение
  EXC_PCT: 85,         // «отличный» месяц: рейтинг от 85%
  EXC_MIN: 5,          // и не меньше 5 доставок за месяц
  CPN_AMT: 100,        // купон, сомони
  CPN_DAYS: 30,        // купон действует 30 дней
  LEVELS: ["Стандарт", "Бронза", "Серебро", "Золото", "Платина"]
};
var K_COUR0 = courier;
courier = function (a, p) {
  if (a === "k_done") return kDone(p);
  if (a === "k_me") { var me = courTok(p.tok); if (!me) return { ok: false, error: "tok" }; return { ok: true, me: { login: me.login, nm: me.nm }, rt: kCard(me) }; }
  var r = K_COUR0(a, p);
  if (a === "k_list" && r && r.ok) { var me2 = courTok(p.tok); if (me2) r.rt = kCard(me2); }
  return r;
};
var K_ROUTE0 = route;
route = function (p) {
  var a = String(p.a || "");
  if (a === "c_cpnchk" || a === "c_cpnuse") return kCpnClient(a, p);
  if (a === "s_kcash" || a === "s_kcashok" || a === "s_krate") { // jk — ключ задания (key занят паролем сотрудника)
    var me = staff(p); if (!me) return { ok: false, error: "auth" };
    if (me.role === "partner" || me.role === "content") return { ok: false, error: "role" };
    if (a === "s_kcash") return { ok: true, L: jobAll().L.filter(function (o) { return o.hand && o.hand.st === "hand"; }).map(function (o) { return { key: o.key, no: o.no, hand: o.hand }; }) };
    if (a === "s_krate") return { ok: true, L: courList().map(function (c) { var o = courGet(c.login); var x = kCard(o); x.login = c.login; x.nm = c.nm; x.on = c.on; return x; }) };
    return locked(function () {
      var J = jobAll(), o = J.L.filter(function (x) { return x.key === p.jk; })[0];
      if (!o || !o.hand || o.hand.st !== "hand") return { ok: false, error: "none" };
      o.hand.st = "ok"; o.hand.ok = { ts: Date.now(), w: me.who };
      o.log.push({ ts: Date.now(), st: "cash", w: me.who, cash: o.hand.amt });
      jobSave(J.sh, o); C().remove("krt:" + (o.hand.login || ""));
      return { ok: true };
    });
  }
  return K_ROUTE0(p);
};

// ---------- фото в Google Диск ----------
function kFolder() {
  var pr = PropertiesService.getScriptProperties(), id = pr.getProperty("kphf"), f = null;
  if (id) { try { f = DriveApp.getFolderById(id); } catch (x) { f = null; } }
  if (!f) { f = DriveApp.createFolder("Умари Хайём — фотоотчёты"); pr.setProperty("kphf", f.getId()); }
  return f;
}
function kSavePhoto(dataUrl, name) {
  var m = String(dataUrl || "").match(/^data:(image\/[a-z]+);base64,(.+)$/);
  if (!m) return "";
  var b64 = m[2]; if (b64.length > 1400000) return "";
  var blob = Utilities.newBlob(Utilities.base64Decode(b64), m[1], name + ".jpg");
  var file = kFolder().createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (x) {}
  return file.getId();
}

// ---------- вручение: фото обязательно, деньги не больше суммы заказа ----------
function kDone(p) {
  var me = courTok(p.tok); if (!me) return { ok: false, error: "tok" };
  if (!p.photo) return { ok: false, error: "photo" };
  var pre = jobAll().L.filter(function (x) { return x.key === p.key; })[0];
  if (!pre) return { ok: false, error: "none" };
  if (pre.st !== "taken" || !pre.cour || pre.cour.login !== me.login) return { ok: false, error: "notyours" };
  var cash = Math.round((+p.cash || 0) * 100) / 100; if (cash < 0) cash = 0;
  if (cash > (+pre.cod || 0) + 0.004) return { ok: false, error: "cash_over", max: +pre.cod || 0 };
  var fid = "";
  try { fid = kSavePhoto(p.photo, String(pre.no).replace(/\W/g, "_") + "_" + Date.now()); } catch (x) { fid = ""; }
  if (!fid) return { ok: false, error: "photo_save" };
  return locked(function () {
    var J = jobAll(), o = J.L.filter(function (x) { return x.key === p.key; })[0];
    if (!o || o.st !== "taken" || !o.cour || o.cour.login !== me.login) return { ok: false, error: "notyours" };
    var now = Date.now();
    o.st = "done"; o.cash = cash; o.ph = fid;
    if (cash > 0) o.hand = { amt: cash, st: "hand", ts: now, w: me.nm, login: me.login, part: cash < (+o.cod || 0) - 0.004 };
    o.log.push({ ts: now, st: "done", w: me.nm, l: me.login, cash: cash, note: clean(p.note, 200), ph: fid });
    jobSave(J.sh, o); delete o.row; C().remove("krt:" + me.login);
    if (o.kind === "part") { var A = pordAll(), po = A.L.filter(function (x) { return x.no === o.no && x.own === o.own; })[0]; if (po && po.pst !== "cancel" && po.pst !== "done") { po.pst = "done"; po.log.push({ ts: now, st: "done", w: me.nm, r: "courier" }); po.fee = feeOf(po); pordPut(A.sh, po); } }
    return { ok: true, job: o };
  });
}

// ---------- рейтинг ----------
function kMonth(ts) { return Utilities.formatDate(new Date(ts), "Asia/Dushanbe", "yyyy-MM"); }
function kMonthStart(off) { var d = new Date(); var y = +Utilities.formatDate(d, "Asia/Dushanbe", "yyyy"), m = +Utilities.formatDate(d, "Asia/Dushanbe", "MM") - 1 + off; var x = new Date(Date.UTC(y, m, 1, -5)); return x.getTime(); }
function kScore(jobs, me, from, to) {
  var s = { n: 0, late: 0, ontime: 0, genius: 0, slow: 0, photo: 0, fail: 0, drop: 0, earned: 0, max: 0, mins: 0 };
  var mine = function (l) { return l && (l.l === me.login || (me.nm && l.w === me.nm)); };
  jobs.forEach(function (o) {
    var L = o.log || [], ready = o.ts || (L[0] || {}).ts, tk = null;
    L.forEach(function (l) {
      if (l.st === "ready") ready = l.ts;
      if (l.st === "taken") tk = l;
      if (l.ts < from || l.ts >= to || !mine(l)) return;
      if (l.st === "fail") { s.fail++; s.max += 10; s.earned += 3; }
      if (l.st === "drop") { s.drop++; s.max += 10; }
      if (l.st === "done" && tk && mine(tk)) {
        s.n++; s.max += 23; var pts = 10;
        var wt = (tk.ts - ready) / 6e4, dt = (l.ts - tk.ts) / 6e4; s.mins += dt;
        if (wt <= K.TAKE_MIN) { pts += 5; s.genius++; } else if (wt <= K.TAKE_LIM) pts += 2; else { pts -= 5; s.slow++; }
        if (dt <= K.DLV_LIM) { pts += 5; s.ontime++; } else { pts -= 15; s.late++; }
        if (l.ph) { pts += 3; s.photo++; }
        s.earned += pts;
      }
    });
  });
  s.pct = s.max ? Math.max(0, Math.min(100, Math.round(s.earned / s.max * 100))) : null;
  s.avg = s.n ? Math.round(s.mins / s.n) : 0;
  return s;
}
function kCard(me) {
  var ck = C().get("krt:" + me.login); if (ck) { try { var c0 = JSON.parse(ck); kCpnIssue(me, c0); c0.cpn = kCpnView(me); return c0; } catch (x) {} }
  var jobs = jobAll().L, now = Date.now() + 1000, m0 = kMonthStart(0);
  var cur = kScore(jobs, me, m0, now), wk = kScore(jobs, me, now - 7 * 864e5, now), pw = kScore(jobs, me, now - 14 * 864e5, now - 7 * 864e5);
  var months = [], lvl = 0;
  for (var i = 1; i <= 4; i++) { var a = kMonthStart(-i), b = kMonthStart(-i + 1), sc = kScore(jobs, me, a, b); months.push({ m: kMonth(a + 864e5), pct: sc.pct, n: sc.n, exc: sc.pct != null && sc.pct >= K.EXC_PCT && sc.n >= K.EXC_MIN }); }
  for (var k = 0; k < months.length && months[k].exc; k++) lvl++;
  var res = { cur: cur, wk: wk.pct, pwk: pw.pct, drop: wk.pct != null && pw.pct != null && wk.pct < pw.pct - 4, lvl: lvl, lvn: K.LEVELS[Math.min(lvl, 4)], months: months, last: months[0], cfg: { exc: K.EXC_PCT, min: K.EXC_MIN, amt: K.CPN_AMT, take: K.TAKE_LIM, dlv: K.DLV_LIM } };
  C().put("krt:" + me.login, JSON.stringify(res), 300);
  kCpnIssue(me, res); res.cpn = kCpnView(me);
  return res;
}

// ---------- купон 100 сомони ----------
function kCpnIssue(me, rt) {
  if (!rt || !rt.last || !rt.last.exc) return;
  var o = courGet(me.login); if (!o) return;
  var mk = rt.last.m; o.cpn = o.cpn || [];
  if (o.cpn.some(function (c) { return c.m === mk; })) return;
  var now = Date.now(), code = "K" + rnd(6).toUpperCase();
  o.cpn.push({ m: mk, code: code, amt: K.CPN_AMT, ts: now, exp: now + K.CPN_DAYS * 864e5, used: 0 });
  o.cpn = o.cpn.slice(-6); courPut(o);
  PropertiesService.getScriptProperties().setProperty("kc:" + code, me.login);
}
function kCpnView(me) {
  var o = courGet(me.login); if (!o || !o.cpn) return [];
  var now = Date.now();
  return o.cpn.filter(function (c) { return c.used || c.exp > now; }).map(function (c) { return { code: c.code, amt: c.amt, exp: c.exp, used: c.used, no: c.no || "", act: !c.used && c.exp > now }; });
}
function kCpnFind(code) {
  code = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  var login = PropertiesService.getScriptProperties().getProperty("kc:" + code); if (!login) return null;
  var o = courGet(login); if (!o || o.on === false) return null;
  var c = (o.cpn || []).filter(function (x) { return x.code === code; })[0];
  return c ? { o: o, c: c } : null;
}
function kCpnClient(a, p) {
  var rl = +(C().get("kcr") || 0); if (rl > 60) return { ok: false, error: "slow" }; C().put("kcr", String(rl + 1), 60);
  var f = kCpnFind(p.code); if (!f) return { ok: false, error: "none" };
  var now = Date.now();
  if (f.c.used) return { ok: false, error: "used" };
  if (f.c.exp < now) return { ok: false, error: "exp" };
  var mUsed = (f.o.cpn || []).some(function (x) { return x.used && kMonth(x.used) === kMonth(now); });
  if (mUsed) return { ok: false, error: "month" };
  if (a === "c_cpnchk") return { ok: true, amt: f.c.amt, nm: f.o.nm, exp: f.c.exp };
  return locked(function () {
    var g = kCpnFind(p.code); if (!g || g.c.used) return { ok: false, error: "used" };
    g.c.used = Date.now(); g.c.no = clean(p.no, 20); courPut(g.o);
    return { ok: true };
  });
}

// ==================== Умари Хайём · Team — Команда: смены 08:00–23:00, филиалы, сотрудники, оклады. Файлы держать в этом порядке.
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

// ==================== Умари Хайём · Tasks — Поручения: по должности, срок, фотоотчёт, рейтинг. Файлы держать в этом порядке.
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

// ==================== Умари Хайём · Expenses — Расходы сотрудников (фото чека, копия на почту) + журнал ошибок и скорости сайта. Файлы держать в этом порядке.
var EX = {
  MAIL: "umari.khayom.contract@gmail.com",
  CATS: ["Закупка товара", "Аренда", "Зарплата", "Доставка и транспорт", "Топливо", "Реклама", "Коммунальные услуги", "Налоги и сборы", "Связь и интернет", "Хозяйственные нужды", "Банк и комиссии", "Прочее"]
};
// Запустите эту функцию один раз кнопкой «Выполнить», чтобы разрешить отправку писем.
function exAuth() { Logger.log("Писем можно отправить сегодня: " + MailApp.getRemainingDailyQuota()); }
var EX_ROUTE0 = route;
route = function (p) {
  var a = String(p.a || "");
  if (a === "t_exadd" || a === "t_exmine") { var me = staff(p); if (!me) return { ok: false, error: "auth" }; if (me.role === "partner") return { ok: false, error: "role" }; return exAct(a.slice(2), { k: "staff", w: me.who, r: me.role }, p); }
  if (a === "k_exadd" || a === "k_exmine") { var c = courTok(p.tok); if (!c) return { ok: false, error: "tok" }; return exAct(a.slice(2), { k: "cour", w: c.nm, r: "courier", lg: c.login }, p); }
  if (a === "m_exadd" || a === "m_exmine") { var m = mTok(p.tok); if (!m) return { ok: false, error: "tok" }; return exAct(a.slice(2), { k: "merch", w: m.nm, r: m.role || "merch", lg: m.login }, p); }
  return EX_ROUTE0(p);
};
function exAct(act, u, p) {
  var pk = u.k + "|" + (u.lg || u.r + ":" + String(u.w).toLowerCase());
  if (act === "exmine") {
    var lim = Date.now() - 31 * 864e5;
    return { ok: true, cats: EX.CATS, L: finGet().ex.filter(function (e) { return e.pk === pk && (e.ts || 0) > lim; }).sort(function (a, b) { return b.ts - a.ts; }).slice(0, 50) };
  }
  var v = Math.round((+p.v || 0) * 100) / 100; if (!(v > 0) || v > 1000000) return { ok: false, error: "sum" };
  var cat = EX.CATS.indexOf(p.cat) > -1 ? p.cat : "Прочее";
  var d = /^\d{4}-\d{2}-\d{2}$/.test(String(p.d || "")) ? p.d : Utilities.formatDate(new Date(), "Asia/Dushanbe", "yyyy-MM-dd");
  var fid = "", blob = null;
  if (p.photo) {
    try { fid = kSavePhoto(p.photo, "chek_" + d + "_" + String(u.w).replace(/\W/g, "_") + "_" + Date.now()); } catch (x) { fid = ""; }
    try { var m0 = String(p.photo).match(/^data:(image\/[a-z]+);base64,(.+)$/); if (m0) blob = Utilities.newBlob(Utilities.base64Decode(m0[2]), m0[1], "chek_" + d + ".jpg"); } catch (x) { blob = null; }
  }
  var RN = (typeof Q !== "undefined" && Q.RN) || {};
  var o = { id: "ex" + rnd(10), d: d, cat: cat, v: v, pay: clean(p.pay, 40) || "Наличными", note: clean(p.note, 200), ph: fid, w: u.w, r: u.r, k: u.k, pk: pk, ts: Date.now(), ut: Date.now(), src: "app" };
  locked(function () { var sh = finSh(); sh.appendRow(["ex|" + o.id, "ex", JSON.stringify(o), o.ts]); });
  var mailed = false;
  try {
    var who = u.w + " (" + (RN[u.r] || u.r) + ")";
    var html = "<h2>Расход: " + v.toFixed(2) + " сом.</h2><p><b>Статья:</b> " + cat + "<br><b>Дата:</b> " + d + "<br><b>Оплата:</b> " + o.pay + "<br><b>Внёс:</b> " + who + (o.note ? "<br><b>Комментарий:</b> " + o.note : "") + (fid ? "<br><b>Фото в Google Диске:</b> https://drive.google.com/file/d/" + fid + "/view" : "<br><i>Без фото чека</i>") + "</p><p style='color:#888'>Умари Хайём — резервная копия расходов</p>";
    var opt = { to: EX.MAIL, subject: "Расход " + v.toFixed(2) + " сом. — " + cat + " — " + u.w + " — " + d, htmlBody: html, name: "Умари Хайём — расходы" };
    if (blob) opt.attachments = [blob];
    MailApp.sendEmail(opt); mailed = true;
  } catch (x) { mailed = false; }
  return { ok: true, obj: o, mailed: mailed };
}

// ---------- 🩺 состояние сайта: ошибки и скорость (сайт сам присылает) ----------
var HL_ROUTE0 = route;
route = function (p) {
  var a = String(p.a || "");
  if (a === "c_log") {
    var rl = +(C().get("hlr") || 0); if (rl > 120) return { ok: true }; C().put("hlr", String(rl + 1), 60);
    var sh = sheet("health", ["ts", "kind", "page", "msg", "ms", "ua"]);
    if (sh.getLastRow() > 3000) sh.deleteRows(2, 1000);
    sh.appendRow([Date.now(), clean(p.k, 10), clean(p.pg, 60), clean(p.m, 300), Math.max(0, Math.min(120000, +p.ms || 0)), clean(p.ua, 120)]);
    return { ok: true };
  }
  if (a === "t_health") {
    var me = staff(p); if (!me) return { ok: false, error: "auth" }; if (me.role !== "director" && me.role !== "admin") return { ok: false, error: "role" };
    var s2 = sheet("health", ["ts", "kind", "page", "msg", "ms", "ua"]), n = s2.getLastRow(), lim = Date.now() - 7 * 864e5, er = {}, sp = [];
    if (n > 1) s2.getRange(Math.max(2, n - 1500), 1, Math.min(n - 1, 1500), 6).getValues().forEach(function (r) {
      if (+r[0] < lim) return;
      if (r[1] === "speed") sp.push(+r[4]); else { var k = r[2] + " · " + r[3]; var e = er[k] || (er[k] = { pg: r[2], m: r[3], n: 0, last: 0 }); e.n++; e.last = Math.max(e.last, +r[0]); }
    });
    sp.sort(function (x, y) { return x - y; });
    return { ok: true, err: Object.keys(er).map(function (k) { return er[k]; }).sort(function (x, y) { return y.last - x.last; }).slice(0, 30), spN: sp.length, spMed: sp.length ? sp[Math.floor(sp.length / 2)] : 0, spP90: sp.length ? sp[Math.floor(sp.length * 0.9)] : 0 };
  }
  return HL_ROUTE0(p);
};

// ==================== Умари Хайём · Staff — Сотрудники филиалов: должности, привязка к филиалу, поручения от админа филиала. Файлы держать в этом порядке.
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

// ==================== Умари Хайём · Branch — Филиал: поставки и доставки из приложения сотрудника. Файлы держать в этом порядке.
var BR_EDIT = { badmin: 1, manager: 1, store: 1 };        // кто в филиале оформляет поставки и доставки
var BR_ROUTE0 = route;
route = function (p) {
  var a = String(p.a || "");
  if (a.indexOf("m_sp_") === 0 || a.indexOf("m_dl_") === 0) {
    var mm = mTok(p.tok); if (!mm) return { ok: false, error: "tok" };
    var u = { k: "merch", w: mm.nm, r: mm.role || "merch", lg: mm.login, ph: mm.ph || "" };
    var bid = brOf(u), b = brGet().filter(function (x) { return x.id === bid; })[0];
    if (!b) return { ok: false, error: "nobranch" };
    var can = !!BR_EDIT[u.r];
    if (a.indexOf("m_sp_") === 0) return brSup(a.slice(5), u, b, can, p);
    return brDlv(a.slice(5), u, b, can, p);
  }
  return BR_ROUTE0(p);
};
// ---------- поставки филиала ----------
function brSup(act, u, b, can, p) {
  var me = { who: u.w + " (" + b.nm + ")", role: u.r };
  if (act === "list") {
    var lim = Date.now() - 60 * 864e5;
    var L = supAll().L.filter(function (o) { return o.br === b.id && (o.st === "plan" || o.st === "go" || (o.ts || 0) > lim); }).map(function (o) { delete o.row; return o; }).sort(function (x, y) { return y.ts - x.ts; });
    return { ok: true, list: L, can: can };
  }
  if (!can) return { ok: false, error: "role" };
  return locked(function () {
    var A = supAll();
    if (act === "save") {
      var s = supClean(p.s); if (!s.items.length) return { ok: false, error: "items" };
      s.to = { t: b.nm + (b.ad ? ", " + b.ad : "") };
      var o = s; o.id = "s" + Date.now() + Math.floor(Math.random() * 1000); o.no = supNo(); o.st = "plan"; o.c = Date.now(); o.ts = o.c; o.by = me.who; o.br = b.id; o.log = [];
      supLog(o, me, "Запланировал поставку в филиал");
      supPut(A.sh, o); return { ok: true, id: o.id, no: o.no };
    }
    if (act === "st") {
      var st = String(p.st || ""), x = A.L.filter(function (z) { return z.id === String(p.id || ""); })[0];
      if (!x || x.br !== b.id) return { ok: false, error: "none" };
      var okMove = (x.st === "plan" && (st === "go" || st === "cancel")) || (x.st === "go" && (st === "done" || st === "cancel"));
      if (!okMove) return { ok: false, error: "st" };
      x.st = st; x.ts = Date.now();
      if (st === "go") { if (!x.resp) x.resp = me.who; x.goAt = x.ts; supLog(x, me, "Забрал товар, везёт в филиал"); }
      if (st === "cancel") supLog(x, me, "Отменил поставку");
      if (st === "done") {
        var r = Array.isArray(p.r) ? p.r : [], diff = [];
        (x.items || []).forEach(function (it, i) { var v = r[i] != null && isFinite(+r[i]) ? Math.max(0, +r[i]) : it.q; it.r = v; if (v !== it.q) diff.push(it.n + ": " + v + " из " + it.q); });
        x.rc = clean(p.rc, 300); x.doneAt = x.ts;
        supLog(x, me, "Принял в филиале" + (diff.length ? ". Расхождение — " + diff.join("; ") : ", всё сходится") + (x.rc ? ". " + x.rc : ""));
      }
      supPut(A.sh, x); return { ok: true };
    }
    return { ok: false, error: "action" };
  });
}
// ---------- доставки из филиала (через курьеров) ----------
function brDlv(act, u, b, can, p) {
  if (act === "list") {
    var lim = Date.now() - 14 * 864e5;
    return { ok: true, can: can, list: jobAll().L.filter(function (o) { return o.kind === "branch" && o.br === b.id && (o.st === "ready" || o.st === "taken" || o.ts > lim || (o.hand && o.hand.st === "hand")); }).map(function (o) { delete o.row; return o; }).sort(function (x, y) { return y.ts - x.ts; }) };
  }
  if (!can) return { ok: false, error: "role" };
  return locked(function () {
    if (act === "new") {
      var to = p.to || {}; if (!clean(to.ad, 200) || !clean(to.ph, 30)) return { ok: false, error: "to" };
      var sum = Math.max(0, Math.round((+p.sum || 0) * 100) / 100), cod = Math.max(0, Math.min(sum || 1e9, Math.round((+p.cod || 0) * 100) / 100));
      var its = String(p.items || "").split(/\n|;/).map(function (x) { return clean(x, 120); }).filter(String).slice(0, 30).map(function (x) { return { n: x, q: 1, l: "" }; });
      var pr = PropertiesService.getScriptProperties(), k = "brn:" + b.id, n = (+pr.getProperty(k) || 0) + 1; pr.setProperty(k, String(n));
      var no = "Ф" + (brGet().map(function (x) { return x.id; }).indexOf(b.id) + 1) + "-" + n;
      var o = jobPut({ key: "B|" + b.id + "|" + n, no: no, kind: "branch", from: { t: "Филиал «" + b.nm + "»", addr: b.ad || "", ph: u.ph || "" }, to: to, sum: sum, cod: cod, n: its.length, items: its });
      var J = jobAll(), x = J.L.filter(function (z) { return z.key === o.key; })[0]; if (x) { x.br = b.id; x.by = u.w; jobSave(J.sh, x); }
      return { ok: true, no: no };
    }
    var J2 = jobAll(), j = J2.L.filter(function (z) { return z.key === String(p.key || ""); })[0];
    if (!j || j.kind !== "branch" || j.br !== b.id) return { ok: false, error: "none" };
    if (act === "cancel") { if (j.st !== "ready") return { ok: false, error: "st" }; j.st = "cancel"; j.log.push({ ts: Date.now(), st: "cancel", w: u.w }); jobSave(J2.sh, j); return { ok: true }; }
    if (act === "cashok") { if (!j.hand || j.hand.st !== "hand") return { ok: false, error: "none" }; j.hand.st = "ok"; j.hand.ok = { ts: Date.now(), w: u.w + " (" + b.nm + ")" }; j.log.push({ ts: Date.now(), st: "cash", w: u.w, cash: j.hand.amt }); jobSave(J2.sh, j); C().remove("krt:" + (j.hand.login || "")); return { ok: true }; }
    return { ok: false, error: "action" };
  });
}

// ==================== Умари Хайём · Push — Telegram-уведомления. Один раз: функция pushSetup → «Выполнить» (напоминания каждые 5 мин). Файлы держать в этом порядке.
var PU = { OFFICE: { operator: 1, admin: 1, director: 1 }, BOSS: { admin: 1, director: 1 } };
function puProp() { return PropertiesService.getScriptProperties(); }
function puTok() { return puProp().getProperty("tgtok") || ""; }
function puReg() { var v = puProp().getProperty("preg"); return v ? JSON.parse(v) : {}; }
function puRegSet(R) { puProp().setProperty("preg", JSON.stringify(R)); }
function tg(method, body) {
  var t = puTok(); if (!t) return null;
  try { var r = UrlFetchApp.fetch("https://api.telegram.org/bot" + t + "/" + method, { method: "post", contentType: "application/json", payload: JSON.stringify(body || {}), muteHttpExceptions: true }); return JSON.parse(r.getContentText() || "{}"); } catch (x) { return null; }
}
// puSend — в файле Push2
// кто сейчас на смене
function puOnShift() { var on = {}; try { shAll().L.forEach(function (s) { if (!s.out) on[s.pk] = 1; }); } catch (x) {} return on; }
// отправить тем, кто подходит под фильтр; onlyShift — только тем, кто на смене (если таких нет — всем подходящим)
function puTo(filter, text, onlyShift) {
  if (!puTok()) return 0;
  var R = puReg(), on = onlyShift ? puOnShift() : null, L = Object.keys(R).filter(function (pk) { return filter(R[pk], pk); });
  if (onlyShift) { var L2 = L.filter(function (pk) { return on[pk]; }); if (L2.length) L = L2; }
  L.forEach(function (pk) { puSend(R[pk].c, text); });
  return L.length;
}
function puOnce(key, sec) { var c = CacheService.getScriptCache(); if (c.get("pn:" + key)) return false; c.put("pn:" + key, "1", sec || 21600); return true; }
function puWho(u) { return { pk: u.k + "|" + (u.lg || u.r + ":" + String(u.w).toLowerCase()), k: u.k, r: u.r, w: u.w, lg: u.lg || "" }; }
function puBr(pk) { var r = ""; try { brGet().forEach(function (b) { if ((b.mem || []).some(function (m) { return m.pk === pk; })) r = b.id; }); } catch (x) {} return r; }

// ---------- привязка Telegram ----------
function puLink(u) {
  if (!puTok()) return { ok: false, error: "notoken" };
  var me = tg("getMe", {}), bot = me && me.ok ? me.result.username : ""; if (!bot) return { ok: false, error: "token" };
  var code = rnd(10), w = puWho(u); puProp().setProperty("pl:" + code, JSON.stringify(w));
  return { ok: true, url: "https://t.me/" + bot + "?start=" + code, bot: bot };
}
// puPoll — в файле Push2
function puState(u) { var w = puWho(u), R = puReg(); return { ok: true, on: !!R[w.pk], has: !!puTok() }; }
function puAct(act, u, p) {
  if (act === "link") return puLink(u);
  if (act === "check") { return locked(function () { puPoll(); return puState(u); }); }
  if (act === "off") { return locked(function () { var w = puWho(u), R = puReg(); if (R[w.pk]) { puSend(R[w.pk].c, "🔕 Уведомления отключены."); delete R[w.pk]; puRegSet(R); } return { ok: true, on: false }; }); }
  if (act === "test") { var R2 = puReg(), w2 = puWho(u); if (!R2[w2.pk]) return { ok: false, error: "off" }; puSend(R2[w2.pk].c, "🔔 Проверка: уведомления работают."); return { ok: true }; }
  return puState(u);
}

// ---------- маршруты ----------
var PU_ROUTE0 = route;
route = function (p) {
  var a = String(p.a || "");
  // привязка: t_p* (панель), k_p* (курьер), m_p* (сотрудник)
  var mm = a.match(/^([tkm])_p(me|link|check|off|test)$/);
  if (mm) {
    var u = null;
    if (mm[1] === "t") { var s = staff(p); if (s) u = { k: "staff", w: s.who, r: s.role }; }
    if (mm[1] === "k") { var c = courTok(p.tok); if (c) u = { k: "cour", w: c.nm, r: "courier", lg: c.login }; }
    if (mm[1] === "m") { var e = mTok(p.tok); if (e) u = { k: "merch", w: e.nm, r: e.role || "merch", lg: e.login }; }
    if (!u) return { ok: false, error: "auth" };
    return puAct(mm[2], u, p);
  }
  if (a === "t_pcfg") {
    var me = staff(p); if (!me || me.role !== "director") return { ok: false, error: "role" };
    var tok = String(p.tok2 || "").trim();
    if (tok) { var x = UrlFetchApp.fetch("https://api.telegram.org/bot" + tok + "/getMe", { muteHttpExceptions: true }), j = {}; try { j = JSON.parse(x.getContentText()); } catch (z) {} if (!j.ok) return { ok: false, error: "token" }; puProp().setProperty("tgtok", tok); puProp().deleteProperty("tgoff"); try { UrlFetchApp.fetch("https://api.telegram.org/bot" + tok + "/deleteWebhook", { muteHttpExceptions: true }); } catch (z) {} }
    var R = puReg(), meB = tg("getMe", {});
    return { ok: true, has: !!puTok(), bot: meB && meB.ok ? meB.result.username : "", list: Object.keys(R).map(function (k) { return { w: R[k].w, r: R[k].r, k: R[k].k }; }) };
  }
  if (a === "c_neword") {
    if (!puOnce("ord:" + clean(p.no, 20), 3600)) return { ok: true };
    puTo(function (x) { return x.k === "staff" && PU.OFFICE[x.r]; }, "🛒 Новый заказ " + clean(p.no, 20) + " — " + clean(p.nm, 40) + ", " + (+p.sum || 0).toFixed(2) + " сом.\n" + clean(p.dm, 20), true);
    return { ok: true };
  }
  var r = PU_ROUTE0(p);
  try { if (r && r.ok) puAfter(a, p, r); } catch (x) {}
  return r;
};
function puAfter(a, p, r) {
  if (a === "t_qnew" || a === "m_qnew") {
    var o = r.o; if (!o) return;
    puTo(function (x, pk) { return (o.to || []).indexOf(x.r) > -1 && (!o.br || puBr(pk) === o.br) && pk !== (o.by || {}).pk; }, "📋 Новое поручение от " + o.by.w + (o.brn ? " (" + o.brn + ")" : "") + ":\n" + o.t.slice(0, 300) + "\n⏱ Срок после принятия: " + Math.round(o.dl) + " мин", true);
  }
  if ((a === "t_qdone" || a === "k_qdone" || a === "m_qdone") && r.o && r.o.by) {
    var R = puReg(), c = R[r.o.by.pk]; if (c) puSend(c.c, "✅ " + (r.o.tk || {}).w + " выполнил поручение" + (r.o.done && r.o.done.late ? " (с опозданием)" : "") + ":\n" + r.o.t.slice(0, 200));
  }
  if (a === "c_qrpay") puTo(function (x) { return x.k === "staff" && PU.OFFICE[x.r]; }, "💳 Клиент сообщил об оплате по QR: заказ " + clean(p.no, 20) + ", " + (+p.amt || 0).toFixed(2) + " сом. Проверьте в кабинете Алиф.", true);
  if (a === "c_send" && puOnce("chat:" + clean(p.cid, 40), 600)) puTo(function (x) { return x.k === "staff" && PU.OFFICE[x.r]; }, "💬 Новое сообщение в чате от " + (clean(p.nm, 40) || "клиента") + ":\n" + clean(p.text, 200), true);
  if (a === "m_dl_new") puTo(function (x) { return x.k === "cour"; }, "🚚 Новая доставка " + r.no + " из филиала. Откройте приложение курьера.", true);
  if (a === "k_done" && r.job && r.job.hand && r.job.hand.st === "hand") puTo(function (x) { return x.k === "staff" && PU.BOSS[x.r]; }, "💵 Курьер " + r.job.hand.w + " получил " + r.job.hand.amt.toFixed(2) + " сом. по заказу " + r.job.no + " — примите в кассу.", false);
}
// новые задания курьерам (со склада — из панели, из филиала — выше)
var PU_JOBPUT0 = jobPut;
jobPut = function (x) {
  var had = jobAll().L.some(function (j) { return j.key === x.key; });
  var o = PU_JOBPUT0(x);
  if (!had && x.kind !== "branch") { try { puTo(function (z) { return z.k === "cour"; }, "🚚 Новый заказ к доставке " + x.no + ": " + ((x.to || {}).ad || "") + (x.cod ? "\n💵 Взять с клиента " + (+x.cod).toFixed(2) + " сом." : ""), true); } catch (e) {} }
  return o;
};

// ---------- напоминания каждые 5 минут ----------
function pushSetup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === "pushTick") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("pushTick").timeBased().everyMinutes(5).create();
  Logger.log("Напоминания включены: каждые 5 минут");
}
function pushTick() {
  if (!puTok()) return;
  var now = Date.now(), H = 36e5;
  try { puPoll(); } catch (x) {}
  try {
    jobAll().L.forEach(function (o) {
      var ready = o.ts; (o.log || []).forEach(function (l) { if (l.st === "ready" || l.st === "fail" || l.st === "drop") ready = l.ts; });
      if (o.st === "ready") {
        var age = (now - ready) / 6e4;
        var step = age >= 20 ? 3 : age >= 10 ? 2 : 0; if (step && age < 60 && puOnce("jr" + step + ":" + o.key + ":" + ready)) { if (step === 3) puOnce("jr2:" + o.key + ":" + ready); puTo(function (z) { return z.k === "cour"; }, "⏰ Напоминание " + step + " из 3: заказ " + o.no + " ждёт курьера " + Math.round(age) + " мин.\n" + ((o.to || {}).ad || ""), true); }
        if (age >= 60 && puOnce("jv:" + o.key + ":" + ready)) { puTo(function (z) { return z.k === "cour"; }, "🔴 Нарушение: заказ " + o.no + " ждёт курьера больше часа!", true); puTo(function (z) { return z.k === "staff" && PU.BOSS[z.r]; }, "🔴 Заказ " + o.no + " больше часа без курьера.", false); }
      }
      if (o.st === "taken" && o.cour) {
        var tk = 0; (o.log || []).forEach(function (l) { if (l.st === "taken") tk = l.ts; });
        var left = (tk + 2.5 * H - now) / 6e4, R = puReg(), me = R["cour|" + o.cour.login];
        if (left <= 30 && left > 0 && me && puOnce("jd30:" + o.key + ":" + tk)) puSend(me.c, "⏱ Осталось " + Math.round(left) + " мин, чтобы вручить заказ " + o.no + ".");
        if (left <= 0 && puOnce("jdl:" + o.key + ":" + tk)) { if (me) puSend(me.c, "⚠ Опоздание по заказу " + o.no + ". Вручите как можно скорее."); puTo(function (z) { return z.k === "staff" && PU.BOSS[z.r]; }, "⚠ Курьер " + o.cour.nm + " опаздывает с заказом " + o.no + ".", false); }
      }
    });
  } catch (x) {}
  try {
    var R2 = puReg();
    qAll().L.forEach(function (o) {
      if (o.st === "open" && now - o.ts > H && puOnce("qo:" + o.id)) { var c = R2[(o.by || {}).pk]; if (c) puSend(c.c, "⚠ Поручение никто не взял больше часа:\n" + o.t.slice(0, 150)); }
      if (o.st === "taken" && o.due && now > o.due && puOnce("qd:" + o.id)) { var a1 = R2[(o.tk || {}).pk], a2 = R2[(o.by || {}).pk]; if (a1) a1 && puSend(a1.c, "⏰ Срок поручения истёк:\n" + o.t.slice(0, 150)); if (a2) puSend(a2.c, "⏰ " + o.tk.w + " не успел выполнить поручение в срок:\n" + o.t.slice(0, 150)); }
    });
  } catch (x) {}
  try {
    var h = (now + 5 * H) % 864e5 / H;
    if (h >= 22.7 && h < 23) { var R3 = puReg(); shAll().L.forEach(function (s) { if (!s.out && R3[s.pk] && puOnce("sh23:" + s.id)) puSend(R3[s.pk].c, "🌙 Скоро 23:00 — не забудьте завершить смену в приложении."); }); }
  } catch (x) {}
}

// ==================== Умари Хайём · Push2 — Telegram: кнопки «Открыть в приложении» и «Беру в работу». Один раз: pushSetup2 → «Выполнить». Файлы держать в этом порядке.
var P2 = { SITE: "https://umarikhayom2-create.github.io/umari-khayom/" };
function p2App(k) { return P2.SITE + (k === "cour" ? "courier.html" : k === "staff" ? "index.html#admin" : "team.html"); }
function p2ByChat(chat) { var R = puReg(), f = null; Object.keys(R).forEach(function (pk) { if (String(R[pk].c) === String(chat)) f = { pk: pk, e: R[pk] }; }); return f; }
// каждое уведомление — с кнопкой «Открыть в приложении»
function puSend(chat, text, kb) {
  var who = p2ByChat(chat), url = p2App(who ? who.e.k : "merch");
  var mk = kb || { inline_keyboard: [[{ text: "📲 Открыть в приложении", url: url }]] };
  return tg("sendMessage", { chat_id: chat, text: text, disable_web_page_preview: true, reply_markup: mk });
};
// новое поручение — с кнопкой «Беру в работу»
var P2_AFTER0 = puAfter;
puAfter = function (a, p, r) {
  if ((a === "t_qnew" || a === "m_qnew") && r && r.o) {
    var o = r.o, R = puReg(), on = puOnShift();
    var L = Object.keys(R).filter(function (pk) { return (o.to || []).indexOf(R[pk].r) > -1 && (!o.br || puBr(pk) === o.br) && pk !== (o.by || {}).pk; });
    var L2 = L.filter(function (pk) { return on[pk]; }); if (L2.length) L = L2;
    var text = "📋 Новое поручение от " + o.by.w + (o.brn ? " (" + o.brn + ")" : "") + ":\n" + o.t.slice(0, 300) + "\n⏱ Срок после принятия: " + Math.round(o.dl) + " мин" + (o.ph ? "\n📷 Нужен фотоотчёт" : "");
    L.forEach(function (pk) { puSend(R[pk].c, text, { inline_keyboard: [[{ text: "✅ Беру в работу", callback_data: "qt|" + o.id }], [{ text: "📲 Открыть в приложении", url: p2App(R[pk].k) }]] }); });
    return;
  }
  return P2_AFTER0(a, p, r);
};
// приём нажатий и /start
function puPoll() {
  var mx = CacheService.getScriptCache(); if (mx.get("tgpoll")) return; mx.put("tgpoll", "1", 30);
  try { p2Poll(); } finally { mx.remove("tgpoll"); }
};
function p2Poll() {
  var off = +(puProp().getProperty("tgoff") || 0), r = tg("getUpdates", { offset: off, timeout: 0, allowed_updates: ["message", "callback_query"] });
  if (!r || !r.ok) return;
  var R = null, cbs = [];
  (r.result || []).forEach(function (up) {
    off = Math.max(off, up.update_id + 1);
    if (up.callback_query) { cbs.push(up.callback_query); return; }
    var m = up.message; if (!m || !m.text) return;
    var mt = String(m.text).match(/^\/start\s+([A-Za-z0-9]+)/);
    if (!mt) { if (/^\/start/.test(m.text)) tg("sendMessage", { chat_id: m.chat.id, text: "Здравствуйте! Чтобы получать уведомления, нажмите «🔔 Подключить Telegram» в приложении Умари Хайём." }); return; }
    var v = puProp().getProperty("pl:" + mt[1]); if (!v) { tg("sendMessage", { chat_id: m.chat.id, text: "Ссылка устарела. Нажмите «Подключить Telegram» в приложении ещё раз." }); return; }
    var w = JSON.parse(v); puProp().deleteProperty("pl:" + mt[1]);
    R = R || puReg(); R[w.pk] = { c: m.chat.id, k: w.k, r: w.r, w: w.w, lg: w.lg, ts: Date.now() };
    tg("sendMessage", { chat_id: m.chat.id, text: "✅ " + w.w + ", уведомления Умари Хайём подключены.\nСюда будут приходить новые заказы, доставки, поручения и напоминания.", reply_markup: { inline_keyboard: [[{ text: "📲 Открыть приложение", url: p2App(w.k) }]] } });
  });
  puProp().setProperty("tgoff", String(off));
  if (R) puRegSet(R);
  cbs.forEach(p2Callback);
}
function p2Callback(q) {
  var d = String(q.data || ""), chat = q.message && q.message.chat && q.message.chat.id, who = p2ByChat(chat);
  if (!who) { tg("answerCallbackQuery", { callback_query_id: q.id, text: "Сначала подключите уведомления в приложении", show_alert: true }); return; }
  var m = d.match(/^qt\|(.+)$/); if (!m) { tg("answerCallbackQuery", { callback_query_id: q.id }); return; }
  var u = { k: who.e.k, w: who.e.w, r: who.e.r, lg: who.e.lg }, res = null;
  try { res = qAct("take", u, { id: m[1] }); } catch (x) { res = { ok: false, error: "err" }; }
  if (res && res.error === "taken") { var t0 = qAll().L.filter(function (x) { return x.id === m[1]; })[0]; if (t0 && t0.tk && t0.tk.pk === who.pk) res = { ok: true, o: t0, mine: 1 }; }
  var msg = res && res.ok ? (res && res.mine ? "Оно уже у вас в работе. " : "") + "✅ Поручение ваше! Срок: " + Math.round(res.o.dl) + " мин. Отчёт с фото — в приложении." : ({ taken: "Его уже взял другой сотрудник", notfor: "Это поручение не для вашей должности или филиала", none: "Поручение отменено" }[res && res.error] || "Не получилось, откройте приложение");
  tg("answerCallbackQuery", { callback_query_id: q.id, text: msg, show_alert: true });
  try {
    tg("editMessageReplyMarkup", { chat_id: chat, message_id: q.message.message_id, reply_markup: { inline_keyboard: [[{ text: res && res.ok ? "✅ Взято вами" : "— уже недоступно", callback_data: "x" }], [{ text: "📲 Открыть в приложении", url: p2App(u.k) }]] } });
    if (res && res.ok && !res.mine && res.o.by) { var c = puReg()[res.o.by.pk]; if (c) puSend(c.c, "👍 " + u.w + " взял поручение в работу:\n" + res.o.t.slice(0, 150)); }
  } catch (x) {}
}
// «Проверить» в приложении — без двойной блокировки
var P2_ACT0 = puAct;
puAct = function (act, u, p) { if (act === "check") { puPoll(); return puState(u); } return P2_ACT0(act, u, p); };
// лёгкая проверка нажатий каждую минуту
function tgTick() { if (puTok()) try { puPoll(); } catch (x) {} }
function pushSetup2() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === "tgTick") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("tgTick").timeBased().everyMinutes(1).create();
  Logger.log("Кнопки в Telegram включены: проверка каждую минуту");
}

// ==================== Умари Хайём · Access — Доступы сотрудников филиалов. Файлы держать в этом порядке.
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

// ==================== Умари Хайём · QRSmena — Смена по QR: код на экране филиала меняется каждые 20 секунд; без QR — обязательно фото. Файлы держать в этом порядке.
var SQ = {
  WIN: 20,                    // код меняется каждые 20 секунд
  GRACE: 10,                  // первые 10 секунд нового окна ещё принимается прошлый код (медленный интернет)
  PASS: 600,                  // после скана пропуск действует 10 минут (успеть сделать фото и нажать «Начать смену»)
  DEF: { merch: 1, cour: 0 }, // по умолчанию: сотрудники филиалов — QR обязателен, курьеры — без QR
  AB: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
};
function sqCfg() {
  var v = PropertiesService.getScriptProperties().getProperty("sqcfg"), o = v ? JSON.parse(v) : {};
  o.kio = o.kio || {}; o.rule = o.rule || {};
  if (!o.sec) { o.sec = rnd(40); sqSave(o); }
  return o;
}
function sqSave(o) { PropertiesService.getScriptProperties().setProperty("sqcfg", JSON.stringify(o)); }
function sqWin(t) { return Math.floor((t || Date.now()) / (SQ.WIN * 1000)); }
function sqCode(sec, b, w) {
  var sig = Utilities.computeHmacSha256Signature(b + ":" + w, sec), s = "";
  for (var i = 0; i < 6; i++) s += SQ.AB.charAt((sig[i] & 255) % 32);
  return s;
}
function sqReq(pk, cfg) { var r = cfg.rule[pk]; if (r === 0 || r === 1) return r; return SQ.DEF[pk.split("|")[0]] ? 1 : 0; }
// код из QR («филиал.окно.КОД») или 6 символов, набранные вручную; возвращает id филиала или ""
function sqCheck(raw, cfg) {
  raw = String(raw || "").replace(/\s/g, "");
  var hit = raw.match(/sq=([\w.\-]+)/); if (hit) raw = hit[1];
  var b = null, wn = null, c = raw, m = raw.match(/^([\w\-]{1,20})\.(\d{5,})\.([A-Za-z0-9]{6})$/);
  if (m) { b = m[1]; wn = +m[2]; c = m[3]; }
  c = c.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (c.length !== 6) return "";
  var now = Date.now(), w = sqWin(now), wins = (now / 1000) % SQ.WIN < SQ.GRACE ? [w, w - 1] : [w];
  var ids = b ? [b] : Object.keys(cfg.kio);
  for (var i = 0; i < ids.length; i++) {
    if (!cfg.kio[ids[i]]) continue;
    for (var j = 0; j < wins.length; j++) {
      if (wn != null && wn !== wins[j]) continue;
      if (sqCode(cfg.sec, ids[i], wins[j]) === c) return ids[i];
    }
  }
  return "";
}
function sqWho(p) {
  if (p.who2 === "ku") { var c = courTok(p.tok); return c ? { pk: "cour|" + c.login, nm: c.nm } : null; }
  var m = mTok(p.tok); return m ? { pk: "merch|" + m.login, nm: m.nm } : null;
}
// экран в филиале: получает текущий код
function sqKiosk(p) {
  var cfg = sqCfg(), b = String(p.b || ""), k = String(p.k || "");
  if (!b || !cfg.kio[b] || cfg.kio[b] !== k) return { ok: false, error: "kiosk" };
  var now = Date.now(), w = sqWin(now), br = brGet().filter(function (x) { return x.id === b; })[0];
  return { ok: true, b: b, nm: br ? br.nm : "", w: w, code: sqCode(cfg.sec, b, w), now: now, win: SQ.WIN };
}
// телефон сотрудника: меняет свежий код на пропуск
function sqPass(p) {
  var who = sqWho(p); if (!who) return { ok: false, error: "tok" };
  var rk = "sqr:" + who.pk, n = +(C().get(rk) || 0); if (n >= 10) return { ok: false, error: "slow" };
  var cfg = sqCfg(), b = sqCheck(p.sq, cfg);
  if (!b) { C().put(rk, String(n + 1), 600); return { ok: false, error: "qrold" }; }
  var t = rnd(24); C().put("sqp:" + t, who.pk + "~" + b, SQ.PASS);
  var br = brGet().filter(function (x) { return x.id === b; })[0];
  return { ok: true, sqp: t, b: b, bn: br ? br.nm : "", ttl: SQ.PASS };
}
// отметка в смене: каким способом (id филиала, где отсканирован QR, или «-» — без QR)
function sqMark(id, f, b) {
  locked(function () { var A = shAll(), o = A.L.filter(function (x) { return x.id === id; })[0]; if (!o) return; o[f] = b; shPut(A.sh, o); });
}
// панель руководителя
function sqAdmin(a, p) {
  var cfg = sqCfg();
  if (a === "t_sqset") {
    var pk = clean(p.pk, 120); if (!/^(merch|cour)\|/.test(pk)) return { ok: false, error: "pk" };
    if (p.v === 0 || p.v === 1) cfg.rule[pk] = p.v; else delete cfg.rule[pk];
    sqSave(cfg);
  }
  if (a === "t_sqkio") {
    var b = clean(p.b, 20); if (!brGet().some(function (x) { return x.id === b; })) return { ok: false, error: "br" };
    if (p.off) delete cfg.kio[b]; else cfg.kio[b] = rnd(24);
    sqSave(cfg);
  }
  return { ok: true, rule: cfg.rule, def: SQ.DEF, kio: cfg.kio, win: SQ.WIN };
}
var SQ_ROUTE0 = route;
route = function (p) {
  var a = String(p.a || "");
  if (a === "z_sqk") return sqKiosk(p);
  if (a === "z_sqpass") return sqPass(p);
  if (a === "t_sqget" || a === "t_sqset" || a === "t_sqkio") {
    var me = staff(p); if (!me) return { ok: false, error: "auth" };
    if (!T_BOSS[me.role]) return { ok: false, error: "role" };
    return locked(function () { return sqAdmin(a, p); });
  }
  var kind = { m_in: "merch", m_out: "merch", k_shin: "cour", k_shout: "cour" }[a];
  if (kind) {
    var who = kind === "cour" ? courTok(p.tok) : mTok(p.tok);
    if (!who) return SQ_ROUTE0(p);
    var pk = kind + "|" + who.login, b = "";
    if (p.sqp) { var v = C().get("sqp:" + p.sqp); if (v) { var x = v.split("~"); if (x[0] === pk) b = x[1]; } }
    var need = sqReq(pk, sqCfg());
    if (need && !b) return { ok: false, error: "qr" };
    if (!need && !b && String(p.photo || "").length < 2000) return { ok: false, error: "qrph" }; // без QR — тогда обязательно фото
    var r = SQ_ROUTE0(p);
    if (r && r.ok && r.sh && !r.already) {
      if (b) C().remove("sqp:" + p.sqp);
      try { sqMark(r.sh.id, /in$/.test(a) ? "qin" : "qout", b || "-"); } catch (e) {}
    }
    return r;
  }
  var r2 = SQ_ROUTE0(p);
  if ((a === "m_me" || a === "k_shst") && r2 && r2.ok) {
    var w2 = a === "m_me" ? mTok(p.tok) : courTok(p.tok);
    if (w2) r2.sq = sqReq((a === "m_me" ? "merch|" : "cour|") + w2.login, sqCfg());
  }
  return r2;
};

// ==================== Умари Хайём · Заявки — Заявки на сборку между филиалами и складами (сборка и вызов курьера — в файле «Обновление»). Файлы держать в этом порядке.

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

    if (act === "close" || act === "open") {
      if (o.by.b !== b.id) return { ok: false, error: "role" };
      o.st = act === "close" ? "cancel" : "open"; o.ts = Date.now(); zvPut(A.sh, o); return { ok: true };
    }
    return { ok: false, error: "action" };
  });
}

// ==================== Умари Хайём · Доставки — Доставка из филиала: клиенту, в филиалы, другое. Файлы держать в этом порядке.
var DL2_ROUTE0 = route;
route = function (p) {
  if (String(p.a || "") !== "m_dl_new2") return DL2_ROUTE0(p);
  var mm = mTok(p.tok); if (!mm) return { ok: false, error: "tok" };
  var u = { k: "merch", w: mm.nm, r: mm.role || "merch", lg: mm.login, ph: mm.ph || "" };
  var B = brGet(), bid = brOf(u), b = B.filter(function (x) { return x.id === bid; })[0];
  if (!b) return { ok: false, error: "nobranch" };
  if (!BR_EDIT[u.r]) return { ok: false, error: "role" };
  return dl2New(u, b, B, p);
};

function dl2Items(txt) {
  return String(txt || "").split(/\n|;/).map(function (l) { return clean(l, 120); }).filter(String).slice(0, 30).map(function (l) {
    var m = l.match(/^(.+?)[\s×xх*-]+(\d+(?:[.,]\d+)?)\s*(шт|пач|кор|уп)?\.?$/i);
    return m ? { n: m[1].trim(), q: parseFloat(m[2].replace(",", ".")), l: m[3] || "" } : { n: l, q: 1, l: "" };
  });
}

function dl2New(u, b, B, p) {
  var kind = ["client", "branch", "other"].indexOf(p.kind) > -1 ? p.kind : "client";
  var to = p.to || {}, cm = clean(to.cm, 300);
  var sum = Math.max(0, Math.round((+p.sum || 0) * 100) / 100), cod = Math.max(0, Math.min(sum || 1e9, Math.round((+p.cod || 0) * 100) / 100));
  var dests = [];
  if (kind === "branch") {
    (Array.isArray(p.brs) ? p.brs : []).slice(0, 20).forEach(function (x) {
      var d = B.filter(function (z) { return z.id === String(x && x.id); })[0];
      if (!d || d.id === b.id) return;
      var its = dl2Items(x.items || p.items);
      dests.push({ to: { nm: "Филиал «" + d.nm + "»", ph: clean(to.ph, 30), ad: d.ad || d.nm, cty: "Душанбе", pay: "Без оплаты", cm: cm }, items: its, br2: d.id });
    });
    if (!dests.length) return { ok: false, error: "brs" };
  } else {
    if (!clean(to.ad, 200)) return { ok: false, error: "ad" };
    if (kind === "other" && !clean(to.nm, 60)) return { ok: false, error: "nm" };
    dests.push({ to: { nm: clean(to.nm, 60), ph: clean(to.ph, 30), ad: clean(to.ad, 200), cty: "Душанбе", pay: clean(to.pay, 60) || (kind === "client" ? "" : "Без оплаты"), cm: cm }, items: dl2Items(p.items) });
  }
  var phs = (Array.isArray(p.ph) ? p.ph : []).slice(0, 5).map(function (d, i) { try { return kSavePhoto(d, "dlv_" + b.id + "_" + Date.now() + "_" + i); } catch (x) { return ""; } }).filter(String);
  return locked(function () {
    var pr = PropertiesService.getScriptProperties(), k = "brn:" + b.id, idx = B.map(function (x) { return x.id; }).indexOf(b.id) + 1, nos = [];
    dests.forEach(function (d) {
      var n = (+pr.getProperty(k) || 0) + 1; pr.setProperty(k, String(n));
      var no = "Ф" + idx + "-" + n;
      var o = jobPut({ key: "B|" + b.id + "|" + n, no: no, kind: "branch", from: { t: "Филиал «" + b.nm + "»", addr: b.ad || "", ph: u.ph || "" }, to: d.to,
        sum: kind === "branch" ? 0 : sum, cod: kind === "branch" ? 0 : cod, n: d.items.length, items: d.items });
      var J = jobAll(), x = J.L.filter(function (z) { return z.key === o.key; })[0];
      if (x) { x.br = b.id; x.by = u.w; x.dk = kind; if (phs.length) x.phs = phs; if (d.br2) x.br2 = d.br2; jobSave(J.sh, x); }
      nos.push(no);
    });
    return { ok: true, nos: nos };
  });
}

// ==================== Умари Хайём · Достижения — Доска достижений, очки за работу, итоги месяца в Telegram. Файлы держать в этом порядке.

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

// ==================== Умари Хайём · ПоставкиКурьер — Поставки через курьеров: курьер берёт → «Везут» → «Доставлено» → филиал принимает. Файлы держать в этом порядке.

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

// ==================== Умари Хайём · Обновление — Новости, «нет в наличии» и вызов курьера одной кнопкой, вход офиса через «Рабочий персонал». Файлы держать в этом порядке.

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
  var k = String(q.key || "");
  if (k.indexOf("D:") === 0) return devResolve(q, k.slice(2));
  if (k.indexOf("T:") !== 0) return true;
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
  if (p && (p.dev != null || (p.q && p.q.dev != null))) { delete p.dev; if (p.q) delete p.q.dev; e = { parameter: (e && e.parameter) || {}, postData: { contents: JSON.stringify(p), type: "text/plain" } }; }
  if (p && p.a === "o_px") {
    // заказы сайта для сотрудника, вошедшего через «Рабочий персонал»
    var q = p.q || {}; if (!/^[TD]:/.test(String(q.key || "")) || !upResolve(q)) return out({ ok: false, error: "auth" }); delete q.dev;
    try {
      var r = UrlFetchApp.fetch(MAIN_API, { method: "post", contentType: "text/plain;charset=utf-8", payload: JSON.stringify(q), muteHttpExceptions: true, followRedirects: true });
      return ContentService.createTextOutput(r.getContentText() || "{}").setMimeType(ContentService.MimeType.JSON);
    } catch (x) { return out({ ok: false, error: "main" }); }
  }
  if (p && /^[TD]:/.test(String(p.key || ""))) {
    if (!upResolve(p)) return out({ ok: false, error: "auth" });
    e = { parameter: (e && e.parameter) || {}, postData: { contents: JSON.stringify(p), type: "text/plain" } };
  }
  return UP_DP0(e);
};

// ==================== 19. Разработчик — вход с полными правами руководителя + инструменты обслуживания
// Пароль разработчика и пароль руководителя задаёт руководитель в панели: «Команда и смены» → «🛠 Аккаунт разработчика».
function devHash(pw) { var pr = PropertiesService.getScriptProperties(), s = pr.getProperty("devs"); if (!s) { s = rnd(16); pr.setProperty("devs", s); } return hashPw(String(pw), s); }
function devResolve(q, pw) {
  var pr = PropertiesService.getScriptProperties(), h = pr.getProperty("devh"), real = upKey("director");
  if (!h || !real || !pw) return false;
  var n = +(C().get("devtry") || 0); if (n >= 8) return false;
  var ck = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, "dv|" + pw));
  if (C().get("devok") !== ck) {
    if (devHash(pw) !== h) { C().put("devtry", String(n + 1), 900); return false; }
    C().put("devok", ck, 3600);
  }
  q.key = real; q.role = "director"; q.who = clean(q.who, 60) || "Разработчик"; q.dev = 1; return true;
}
function devState() { var pr = PropertiesService.getScriptProperties(); return { ok: true, dev: !!pr.getProperty("devh"), dkey: !!upKey("director") }; }
function devAct(a, p) {
  if (a === "t_devst" || a === "t_devset") {
    var me = staff(p); if (!me || me.role !== "director") return { ok: false, error: "role" };
    if (a === "t_devst") return devState();
    var pr = PropertiesService.getScriptProperties(), dk = String(p.dk || "").trim(), pw = String(p.pw || "");
    if (dk) {
      var ok = false;
      try { var x = UrlFetchApp.fetch(MAIN_API, { method: "post", contentType: "text/plain;charset=utf-8", payload: JSON.stringify({ a: "admin_list", key: dk, role: "director", who: "Проверка пароля" }), muteHttpExceptions: true, followRedirects: true }); var j = JSON.parse(x.getContentText() || "{}"); ok = !!(j && j.ok); } catch (e) { ok = false; }
      if (!ok) return { ok: false, error: "dk" };
      pr.setProperty("okey:director", dk);
    }
    if (p.off) { pr.deleteProperty("devh"); C().remove("devok"); return devState(); }
    if (pw) { if (pw.length < 6) return { ok: false, error: "pw" }; pr.setProperty("devh", devHash(pw)); C().remove("devok"); }
    return devState();
  }
  if (p.dev !== 1) return { ok: false, error: "role" };
  if (a === "dv_info") {
    var ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("ssid"));
    var sh = ss.getSheets().map(function (x) { return { n: x.getName(), r: Math.max(0, x.getLastRow() - 1) }; });
    var tr = []; try { tr = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); }); } catch (e) {}
    var props = PropertiesService.getScriptProperties().getKeys();
    return { ok: true, sheets: sh, trig: tr, props: props.length, url: ss.getUrl(), tg: typeof puTok === "function" && !!puTok(), now: Date.now() };
  }
  if (a === "dv_trig") {
    var done = [];
    try { if (typeof pushSetup === "function") { pushSetup(); done.push("pushTick"); } } catch (e) {}
    try { if (typeof pushSetup2 === "function") { pushSetup2(); done.push("tgTick"); } } catch (e) {}
    return { ok: true, done: done };
  }
  if (a === "dv_backup") {
    var ss2 = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("ssid")), o = {};
    ss2.getSheets().forEach(function (x) { var n = x.getLastRow(), c = x.getLastColumn(); o[x.getName()] = n && c ? x.getRange(1, 1, n, c).getValues() : []; });
    return { ok: true, at: Date.now(), data: o };
  }
  return { ok: false, error: "action" };
}
var DEV_ROUTE0 = route;
route = function (p) {
  var a = String(p.a || "");
  if (a === "t_devst" || a === "t_devset" || a.indexOf("dv_") === 0) return devAct(a, p);
  return DEV_ROUTE0(p);
};
