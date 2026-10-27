// Умари Хайём · Push2 — Telegram: кнопки «Открыть в приложении» и «Беру в работу». Один раз: pushSetup2 → «Выполнить». Файлы держать в этом порядке.
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
