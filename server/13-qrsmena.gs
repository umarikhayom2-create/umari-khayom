// Умари Хайём · QRSmena — Смена по QR: код на экране филиала меняется каждые 20 секунд; без QR — обязательно фото. Файлы держать в этом порядке.
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
