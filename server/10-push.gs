// Умари Хайём · Push — Telegram-уведомления. Один раз: функция pushSetup → «Выполнить» (напоминания каждые 5 мин). Файлы держать в этом порядке.
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
