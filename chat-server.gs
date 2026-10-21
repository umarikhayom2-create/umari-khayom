// Умари Хайём — сервер чата и «кто в сети».
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

function doGet(e) { return out({ ok: true, chat: 1 }); }
function doPost(e) {
  var p = {};
  try { p = JSON.parse(e.postData.contents || "{}"); } catch (x) { return out({ ok: false, error: "json" }); }
  try { return out(route(p)); } catch (x) { return out({ ok: false, error: String(x && x.message || x).slice(0, 150) }); }
}
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function route(p) {
  var a = String(p.a || "");
  if (a.indexOf("c_") === 0) return client(a, p);
  if (a.indexOf("s_") === 0) { var me = staff(p); if (!me) return { ok: false, error: "auth" }; return staffAct(a, p, me); }
  return { ok: false, error: "action" };
}

/* ---------- хранение ---------- */
function book() {
  var pr = PropertiesService.getScriptProperties(), id = pr.getProperty("ssid"), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (x) { ss = null; } }
  if (!ss) { ss = SpreadsheetApp.create("Умари Хайём — чат"); pr.setProperty("ssid", ss.getId()); }
  var sh = ss.getSheetByName("dlg");
  if (!sh) { sh = ss.insertSheet("dlg"); sh.appendRow(["cid", "sec", "meta", "msgs"]); }
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

/* ---------- клиент ---------- */
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

/* ---------- сотрудники ---------- */
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
