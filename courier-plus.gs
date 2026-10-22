// Курьеры+: фотоотчёт, деньги у курьера, рейтинг, уровни, купон. Отдельный файл Kurer.gs в проекте ЧАТА.
// Чат.gs и QR.gs не трогать. Настройки ниже можно менять.
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
