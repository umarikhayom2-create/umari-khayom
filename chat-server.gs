// Умари Хайём — сервер чата, «кто в сети», аккаунты клиентов, бонусы и счётчик посетителей.
// Отдельный проект Apps Script. Установка:
// 1) script.google.com → «Новый проект» → удалите всё → вставьте этот файл целиком → Сохранить.
// 2) «Начать развёртывание» → «Новое развёртывание» → тип «Веб-приложение»:
// «Запуск от имени» — Я, «У кого есть доступ» — Все → Развернуть → разрешить доступ.
// 3) Скопируйте ссылку веб-приложения (…/exec) и пришлите её Claude.
// Таблица для переписки создаётся сама при первом сообщении (в вашем Google Диске: «Умари Хайём — чат»).
//
var MAIN_API = "https://script.google.com/macros/s/AKfycbxGssdYbn5tGiCuyyphhqVggnTh8htbdRkQBB-LB68DVWPCN54gveCYn5ysgWrSzNeM0g/exec";
var CHAT_ROLES = { operator: "Оператор", admin: "Администратор", director: "Руководитель" };
var ALL_ROLES = { operator: "Оператор", admin: "Администратор", accountant: "Бухгалтер", director: "Руководитель", content: "Контент-менеджер" };
var ONLINE_MS = 75000, MAX_TXT = 1000, MAX_CELL = 45000;
var BONUS_PCT = 2; // % от суммы товаров, начисляется после доставки

function doGet(e) { return out({ ok: true, chat: 1 }); }
function doPost(e) {
  var p = {};
  try { p = JSON.parse(e.postData.contents || "{}"); } catch (x) { return out({ ok: false, error: "json" }); }
  try { return out(route(p)); } catch (x) { return out({ ok: false, error: String(x && x.message || x).slice(0, 150) }); }
}
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function route(p) {
  var a = String(p.a || "");
  if (a === "c_hit") return hit(p);
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
  var act = role === "content" ? "admin_cat" : "admin_list", ok = false;
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
