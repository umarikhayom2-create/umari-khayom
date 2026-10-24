// Умари Хайём — ДОСТАВКА ИЗ ФИЛИАЛА (новая): клиенту, в другие филиалы (можно сразу в несколько) или другому получателю.
// Фото товара/накладной, сумма и оплата — необязательно.
// Отдельный файл «Доставки» в проекте «Server» — САМЫМ ПОСЛЕДНИМ в списке файлов (после Branch).
// Перехватывает только запрос "m_dl_new2"; всё остальное идёт дальше как раньше.

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
  // куда везём — список получателей; для филиалов каждый филиал = отдельная доставка
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
  // фото сохраняем до блокировки
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
