// Умари Хайём · Expenses — Расходы сотрудников (фото чека, копия на почту) + журнал ошибок и скорости сайта. Файлы держать в этом порядке.
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
