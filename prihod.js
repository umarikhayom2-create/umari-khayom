/* Умари Хайём — 📥 Приход товаров и цены.
   Себестоимость = цена × курс на дату прихода + доля доставки (м³ и кг на 1 шт.) × тарифы.
   Курс сохраняется в каждом приходе: старые приходы не меняются, новые считаются по новому курсу. */
(function () {
var U = window.UHB, esc = U.esc, toast = U.toast;
var CUR = { CNY: "¥ юань", USD: "$ доллар", RUB: "₽ рубль", EUR: "€ евро", TJS: "сомони" };
var S = { v: "new", cfg: null, rates: {}, list: null, ed: false, f: null, doc: null, price: null, hist: null, q: "", busy: 0, box: null };
function today() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
function dN(s) { var p = String(s || "").split("-"); return p.length === 3 ? p[2] + "." + p[1] + "." + p[0] : s || ""; }
function nf(v, d) { v = +v || 0; return v.toLocaleString("ru-RU", { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }).replace(/ /g, " "); }
function nv(x) { var v = parseFloat(String(x == null ? "" : x).replace(/\s/g, "").replace(",", ".")); return isFinite(v) ? v : 0; }
function pc(v) { return Math.round((+v || 0) * 1000) / 10; }
function api(a, o) { return U.api(a, o || {}); }
function draw() { if (S.box && document.body.contains(S.box)) S.box.innerHTML = html(); }

/* ---------- расчёт (то же, что на сервере) ---------- */
function calc(it, h) {
  var box = +it.box || 0, qpb = +it.qpb || 0, qty = box * qpb, tr = h.tcur === "TJS" ? 1 : (+h.trate || 0);
  var m3 = (+it.m3b || 0) * box, kg = (+it.kgb || 0) * box;
  var log = qty > 0 ? (m3 / qty) * (+h.m3t || 0) * tr + (kg / qty) * (+h.kgt || 0) * tr : 0;
  var fx = +it.fx || 0, cost = fx > 0 ? fx : (+it.pr || 0) * (h.cur === "TJS" ? 1 : (+h.rate || 0)) + log, opt = cost * (1 + (+it.po || 0));
  return { qty: qty, m3: m3, kg: kg, log: log, cost: cost, opt: opt, rozn: opt * (1 + (+it.prr || 0)), ofis: opt * (1 + (+it.pf || 0)), sum: cost * qty };
}
function rateOf(cur) { var r = S.rates[cur]; return cur === "TJS" ? 1 : r ? r.v : 0; }
function blankItem() { var c = S.cfg || {}; return { nm: "", code: "", bc: "", pr: "", fx: "", box: 1, qpb: "", m3b: "", kgb: "", po: c.po != null ? c.po : 0.5, prr: c.pr != null ? c.pr : 0.4, pf: c.pf != null ? c.pf : 0.2 }; }
function newForm(src) {
  var c = S.cfg || {}, cur = (src && src.cur) || c.cur || "CNY", tcur = (src && src.tcur) || c.tcur || "TJS";
  var f = { d: today(), sup: src ? src.sup : "Китай", note: "", cur: cur, rate: rateOf(cur) || "", tcur: tcur, trate: rateOf(tcur) || "", m3t: src ? src.m3t : c.m3t, kgt: src ? src.kgt : c.kgt, rsrc: (S.rates[cur] || {}).src || "", items: [] };
  if (src && src.items) f.items = src.items.map(function (it) { var b = +it.box || 0; return { nm: it.nm, code: it.code, bc: it.bc, grp: it.grp, pr: it.pr, fx: it.fx || "", box: it.box, qpb: it.qpb, m3b: b ? it.m3 / b : 0, kgb: b ? it.kg / b : 0, po: it.po, prr: it.prr, pf: it.pf, note: it.note }; });
  if (!f.items.length) f.items = [blankItem()];
  return f;
}

/* ---------- загрузка ---------- */
function load(nbt) {
  S.busy = 1; draw();
  return api("pr_get", { nbt: nbt ? 1 : 0, d: today() }).then(function (j) {
    S.busy = 0; if (!j || !j.ok) { S.err = j && j.error === "role" ? "Нет доступа" : "Не удалось загрузить"; draw(); return; }
    S.err = ""; S.cfg = j.cfg; S.rates = j.rates || {}; S.list = j.list || []; S.ed = j.ed; S.nbt = j.nbt || {};
    if (!S.f) S.f = newForm(); draw();
  }).catch(function () { S.busy = 0; S.err = "Нет связи"; draw(); });
}

/* ---------- экраны ---------- */
function tabs() {
  var T = [["new", "📥 Новый приход"], ["list", "📚 Приходы"], ["price", "🏷 Себестоимость и цены"], ["kurs", "💱 Курсы и тарифы"]];
  return '<div class="ftab">' + T.map(function (t) { return '<button data-pr="v" data-v="' + t[0] + '" class="' + (S.v === t[0] ? "on" : "") + '">' + t[1] + "</button>"; }).join("") + "</div>";
}
function rateLine() {
  var a = ["CNY", "USD", "RUB", "EUR"].filter(function (k) { return S.rates[k]; }).map(function (k) { var r = S.rates[k]; return "<b>1 " + k + " = " + nf(r.v, 4) + " сом.</b> <small class=\"note\">(" + esc(r.src || "") + ", " + dN(r.d) + ")</small>"; });
  return '<div class="pq" style="display:flex;gap:14px;flex-wrap:wrap;align-items:center">💱 ' + (a.length ? a.join(" · ") : '<span class="note">Курсы ещё не заданы — откройте «Курсы и тарифы»</span>') + "</div>";
}
function html() {
  if (S.err) return '<div class="emp">' + esc(S.err) + '</div>';
  if (!S.cfg) return '<div class="emp">Загружаем…</div>';
  var h = tabs() + rateLine();
  if (S.v === "list") return h + listHtml();
  if (S.v === "doc") return h + docHtml();
  if (S.v === "price") return h + priceHtml();
  if (S.v === "kurs") return h + kursHtml();
  return h + formHtml();
}
function inp(id, v, o) { o = o || {}; return '<input class="pin" data-pf="' + id + '" value="' + esc(v == null ? "" : v) + '"' + (o.t ? ' type="' + o.t + '"' : "") + (o.num ? ' inputmode="decimal"' : "") + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : "") + (o.st ? ' style="' + o.st + '"' : "") + ">"; }
function curSel(id, v, withTj) { return '<select class="pin" data-pf="' + id + '">' + Object.keys(CUR).filter(function (k) { return withTj || k !== "TJS"; }).map(function (k) { return '<option value="' + k + '"' + (k === v ? " selected" : "") + ">" + k + " — " + CUR[k] + "</option>"; }).join("") + "</select>"; }
function formHtml() {
  var f = S.f, tot = { q: 0, s: 0 }, C = f.items.map(function (it) { var c = calc(it, f); tot.q += c.qty; tot.s += c.sum; return c; });
  var rw = f.items.map(function (it, i) {
    var c = C[i], cell = function (k, w, num) { return '<td><input class="pin pri" data-pi="' + i + '" data-k="' + k + '" value="' + esc(it[k] == null ? "" : it[k]) + '"' + (num ? ' inputmode="decimal"' : "") + ' style="min-width:' + w + 'px"></td>'; };
    var pct = function (k) { return '<td><input class="pin pri" data-pi="' + i + '" data-k="' + k + '" data-pct="1" value="' + pc(it[k]) + '" inputmode="decimal" style="min-width:52px"></td>'; };
    return '<tr><td class="n">' + (i + 1) + "</td>" + cell("nm", 150) + cell("code", 70) + cell("bc", 100) + cell("pr", 70, 1) + cell("box", 52, 1) + cell("qpb", 60, 1) + cell("kgb", 60, 1) + cell("m3b", 64, 1) + cell("fx", 70, 1) +
      '<td class="n" data-pc="q' + i + '">' + nf(c.qty, 0) + '</td><td class="n" data-pc="c' + i + '"><b>' + nf(c.cost) + "</b></td>" + pct("po") + '<td class="n" data-pc="o' + i + '">' + nf(c.opt) + "</td>" + pct("prr") + '<td class="n" data-pc="r' + i + '">' + nf(c.rozn) + "</td>" + pct("pf") + '<td class="n" data-pc="f' + i + '">' + nf(c.ofis) + '</td><td class="n" data-pc="s' + i + '">' + nf(c.sum) + '</td><td><button class="fdl" data-pr="rm" data-i="' + i + '" title="Удалить строку">✕</button></td></tr>';
  }).join("");
  var nb = S.nbt && S.nbt[f.cur] ? '<small class="note">НБТ сегодня: ' + nf(S.nbt[f.cur], 4) + ' <a href="#" data-pr="usenbt">подставить</a></small>' : '<small class="note"><a href="#" data-pr="nbt">узнать курс НБТ на дату</a></small>';
  return '<div class="pq fform"><b>' + (f.id ? "Изменить приход " + esc(f.no || "") : "Новый приход товаров") + '</b>' +
    '<div class="row"><div class="fl" style="flex:1;min-width:130px"><label>Дата прихода</label>' + inp("d", f.d, { t: "date" }) + '</div><div class="fl" style="flex:2;min-width:160px"><label>Поставщик / откуда</label>' + inp("sup", f.sup, { ph: "Китай, Иу — поставщик" }) + "</div></div>" +
    '<div class="row"><div class="fl" style="flex:1;min-width:150px"><label>Валюта закупки</label>' + curSel("cur", f.cur, 1) + '</div><div class="fl" style="flex:1;min-width:150px"><label>Курс на дату прихода: 1 ' + f.cur + " = ? сом.</label>" + inp("rate", f.cur === "TJS" ? 1 : f.rate, { num: 1, ph: "1.41" }) + nb + "</div></div>" +
    '<div class="row"><div class="fl" style="flex:1;min-width:120px"><label>Доставка за 1 м³</label>' + inp("m3t", f.m3t, { num: 1 }) + '</div><div class="fl" style="flex:1;min-width:120px"><label>Доставка за 1 кг</label>' + inp("kgt", f.kgt, { num: 1 }) + '</div><div class="fl" style="flex:1;min-width:140px"><label>Тарифы в валюте</label>' + curSel("tcur", f.tcur, 1) + "</div>" + (f.tcur !== "TJS" ? '<div class="fl" style="flex:1;min-width:120px"><label>Курс 1 ' + f.tcur + " = ? сом.</label>" + inp("trate", f.trate, { num: 1 }) + "</div>" : "") + "</div>" +
    '<div class="fl"><label>Примечание</label>' + inp("note", f.note, { ph: "контейнер, накладная, карго" }) + "</div>" +
    '<p class="note" style="margin:4px 0 8px">Себестоимость 1 шт. = цена × курс + (кг ÷ штук) × тариф за кг + (м³ ÷ штук) × тариф за м³. Оптовая = себестоимость + % опт; розничная и офисная считаются от оптовой.</p></div>' +
    '<div class="row" style="margin:0 0 8px"><button class="btn sm o" data-pr="add">+ Строка</button><label class="btn sm o" style="cursor:pointer">📥 Загрузить из Excel<input type="file" accept=".xlsx,.xls" data-pr-file="1" hidden></label>' + (f.items.length > 1 ? '<button class="btn sm o" data-pr="clr">Очистить</button>' : "") + "</div>" +
    '<div class="tw"><table class="tb ftb prt"><tr><th>№</th><th>Наименование</th><th>Код</th><th>Штрихкод</th><th>Цена, ' + f.cur + '</th><th>Коробок</th><th>Шт. в кор.</th><th>кг в 1 кор.</th><th>м³ в 1 кор.</th><th title="Если товар куплен на месте в сомони — впишите себестоимость, курс и доставка не применяются">Себест. вручную</th><th>Всего шт.</th><th>Себест., сом.</th><th>% опт</th><th>Оптовая</th><th>% розн.</th><th>Розничная</th><th>% офис</th><th>Офисная</th><th>Сумма по себест.</th><th></th></tr>' + rw +
    '<tr><td></td><td colspan="9"><b>Итого</b></td><td class="n"><b data-pc="tq">' + nf(tot.q, 0) + '</b></td><td colspan="8"></td><td class="n"><b data-pc="ts">' + nf(tot.s) + "</b></td><td></td></tr></table></div>" +
    '<div class="row" style="margin:10px 0"><button class="btn" data-pr="save"' + (S.busy ? " disabled" : "") + ">💾 " + (f.id ? "Сохранить изменения" : "Оприходовать") + "</button>" + (f.id ? '<button class="btn o" data-pr="cancel">Отмена</button>' : "") + "</div>";
}
function listHtml() {
  if (!S.list.length) return '<div class="emp">Приходов пока нет. Создайте первый во вкладке «Новый приход» или загрузите таблицу из Excel.</div>';
  return '<div class="tw"><table class="tb ftb"><tr><th>№</th><th>Дата</th><th>Поставщик</th><th>Курс</th><th>Позиций</th><th>Штук</th><th>Сумма по себест., сом.</th><th>Внёс</th></tr>' + S.list.map(function (h) {
    return '<tr data-pr="open" data-id="' + esc(h.id) + '" style="cursor:pointer"><td><b>' + esc(h.no) + "</b></td><td>" + dN(h.d) + "</td><td>" + esc(h.sup || "") + "</td><td>" + (h.cur === "TJS" ? "сомони" : "1 " + h.cur + " = " + nf(h.rate, 4)) + '</td><td class="n">' + (h.n || 0) + '</td><td class="n">' + nf(h.qty, 0) + '</td><td class="n"><b>' + nf(h.sum) + "</b></td><td>" + esc(h.w || "") + "</td></tr>";
  }).join("") + "</table></div>";
}
function docHtml() {
  var h = S.doc; if (!h) return '<div class="emp">Загружаем приход…</div>';
  return '<div class="row" style="margin:0 0 8px"><button class="btn sm o" data-pr="v" data-v="list">← Все приходы</button><button class="btn sm o" data-pr="xls">📊 Скачать Excel</button><button class="btn sm o" data-pr="copy" title="Тот же товар, но по сегодняшнему курсу">🔁 Повторить по текущему курсу</button>' + (S.ed ? '<button class="btn sm o" data-pr="edit">✏️ Изменить</button>' : "") + (U.A().role === "director" ? '<button class="btn sm o" data-pr="del" style="color:#dc2626">Удалить</button>' : "") + "</div>" +
    '<div class="pq"><b style="font-size:18px">Приход ' + esc(h.no) + " от " + dN(h.d) + '</b><div class="note" style="margin:4px 0 0">' + esc(h.sup || "") + " · курс: " + (h.cur === "TJS" ? "в сомони" : "1 " + h.cur + " = " + nf(h.rate, 4) + " сом.") + " · доставка: " + nf(h.m3t) + " за м³, " + nf(h.kgt) + " за кг" + (h.tcur !== "TJS" ? " (" + h.tcur + ", курс " + nf(h.trate, 4) + ")" : " (сом.)") + " · внёс: " + esc(h.w || "") + (h.ew ? " · изменил: " + esc(h.ew) : "") + (h.note ? "<br>" + esc(h.note) : "") + "</div></div>" +
    '<div class="tw"><table class="tb ftb"><tr><th>№</th><th>Наименование</th><th>Код</th><th>Цена, ' + h.cur + '</th><th>Шт.</th><th>кг</th><th>м³</th><th>Себест.</th><th>Оптовая</th><th>Розничная</th><th>Офисная</th><th>Сумма</th></tr>' + (h.items || []).map(function (it, i) {
      return "<tr><td class=\"n\">" + (i + 1) + "</td><td>" + esc(it.nm) + "</td><td>" + esc(it.code) + '</td><td class="n">' + (it.fx > 0 ? "<small>вручную</small>" : nf(it.pr, 2)) + '</td><td class="n">' + nf(it.qty, 0) + '</td><td class="n">' + nf(it.kg, 2) + '</td><td class="n">' + nf(it.m3, 3) + '</td><td class="n"><b>' + nf(it.cost) + '</b></td><td class="n">' + nf(it.opt) + '</td><td class="n">' + nf(it.rozn) + '</td><td class="n">' + nf(it.ofis) + '</td><td class="n">' + nf(it.sum) + "</td></tr>";
    }).join("") + '<tr><td></td><td colspan="3"><b>Итого</b></td><td class="n"><b>' + nf(h.qty, 0) + '</b></td><td colspan="6"></td><td class="n"><b>' + nf(h.sum) + "</b></td></tr></table></div>";
}
function catMatch(it) {
  var D = U.cat ? U.cat() : null; if (!D || !it.code && !it.bc) return null; var c = String(it.code || "").toLowerCase(), b = String(it.bc || "");
  for (var i = 0; i < D.length; i++) { var p = D[i]; if (!p) continue; if (c && String(p.art || "").toLowerCase() === c) return p; if (b && (p.bc || []).indexOf(b) > -1) return p; }
  return null;
}
function priceHtml() {
  if (!S.price) { setTimeout(loadPrice, 0); return '<div class="emp">Собираем цены по всем приходам…</div>'; }
  var q = S.q.toLowerCase(), L = S.price.filter(function (x) { return !q || (x.nm + " " + x.code + " " + (x.bc || "")).toLowerCase().indexOf(q) > -1; }).sort(function (a, b) { return (a.nm || "").localeCompare(b.nm || "", "ru") || String(a.code).localeCompare(String(b.code), "ru", { numeric: true }); });
  return '<p class="note" style="margin:0 0 8px">Действующие цены = по последнему приходу каждого товара (по его курсу). Если товар пришёл повторно по другому курсу — показано, на сколько изменилась себестоимость.</p><div class="row" style="margin:0 0 8px"><input class="pin" data-pr-q="1" value="' + esc(S.q) + '" placeholder="Поиск: название, код, штрихкод" style="flex:1;min-width:200px"><button class="btn sm o" data-pr="pxls">📊 Excel «Установка цен»</button><button class="btn sm o" data-pr="pre">⟳ Обновить</button></div>' +
    '<div class="tw"><table class="tb ftb"><tr><th>Наименование</th><th>Код</th><th>Себест.</th><th>Оптовая</th><th>Розничная</th><th>Офисная</th><th>Приход</th><th>Изм. себест.</th><th>На сайте</th></tr>' + L.slice(0, 600).map(function (x) {
      var dl = x.prev && x.prev.cost ? (x.cost - x.prev.cost) / x.prev.cost * 100 : null, m = catMatch(x), site = m && U.bp ? U.bp(m) : null;
      return "<tr><td>" + esc(x.nm) + "</td><td>" + esc(x.code) + '</td><td class="n"><b>' + nf(x.cost) + '</b></td><td class="n">' + nf(x.opt) + '</td><td class="n">' + nf(x.rozn) + '</td><td class="n">' + nf(x.ofis) + "</td><td><small>" + esc(x.no) + " · " + dN(x.d) + (x.cur !== "TJS" ? "<br>1 " + x.cur + " = " + nf(x.rate, 4) : "") + '</small></td><td class="n">' + (dl == null ? "—" : '<span style="color:' + (dl > 0 ? "#dc2626" : "#16a34a") + '">' + (dl > 0 ? "▲ +" : "▼ ") + nf(dl, 1) + "%</span>") + '</td><td class="n">' + (site != null ? nf(site) + (Math.abs(site - x.rozn) > 0.01 ? ' <small class="note">(≠ розн.)</small>' : "") : "—") + "</td></tr>";
    }).join("") + "</table></div>" + (L.length > 600 ? '<p class="note">Показаны первые 600 из ' + L.length + " — уточните поиск или скачайте Excel.</p>" : "");
}
function kursHtml() {
  var c = S.cfg, R = S.rates, nb = S.nbt || {};
  var rr = ["CNY", "USD", "RUB", "EUR"].map(function (k) {
    var r = R[k]; return '<tr><td><b>' + k + "</b> " + CUR[k] + '</td><td class="n">' + (r ? "<b>" + nf(r.v, 4) + "</b>" : "—") + "</td><td><small>" + (r ? esc(r.src) + ", " + dN(r.d) + (r.w ? " · " + esc(r.w) : "") : "") + '</small></td><td class="n">' + (nb[k] ? nf(nb[k], 4) : "—") + '</td><td><div class="row" style="gap:4px;flex-wrap:nowrap"><input class="pin" data-rate="' + k + '" inputmode="decimal" placeholder="новый курс" style="width:110px">' + '<button class="btn sm" data-pr="rset" data-c="' + k + '">Сохранить</button>' + (nb[k] ? '<button class="btn sm o" data-pr="rnbt" data-c="' + k + '">= НБТ</button>' : "") + "</div></td></tr>";
  }).join("");
  return '<div class="pq"><b>Курсы валют</b><p class="note" style="margin:4px 0 8px">Курс подставляется в новый приход автоматически. В каждом приходе он сохраняется навсегда: если через год курс станет другим, новые приходы считаются по новому курсу, а прошлые остаются как были. Можно вводить реальный курс покупки валюты (он может отличаться от курса НБТ).</p><div class="tw"><table class="tb ftb"><tr><th>Валюта</th><th>Текущий, сом.</th><th>Откуда</th><th>НБТ сегодня</th><th></th></tr>' + rr + '</table></div><button class="btn sm o" data-pr="nbt" style="margin-top:8px">⟳ Запросить курс НБТ</button></div>' +
    '<div class="pq fform"><b>Тарифы доставки и наценки по умолчанию</b>' + (S.ed ? "" : '<p class="note">Менять может руководитель или администратор.</p>') +
    '<div class="row"><div class="fl" style="flex:1;min-width:120px"><label>Доставка за 1 м³</label><input class="pin" data-cf="m3t" value="' + c.m3t + '" inputmode="decimal"></div><div class="fl" style="flex:1;min-width:120px"><label>Доставка за 1 кг</label><input class="pin" data-cf="kgt" value="' + c.kgt + '" inputmode="decimal"></div><div class="fl" style="flex:1;min-width:140px"><label>Тарифы в валюте</label><select class="pin" data-cf="tcur">' + Object.keys(CUR).map(function (k) { return '<option value="' + k + '"' + (k === c.tcur ? " selected" : "") + ">" + k + "</option>"; }).join("") + '</select></div><div class="fl" style="flex:1;min-width:140px"><label>Валюта закупки</label><select class="pin" data-cf="cur">' + Object.keys(CUR).map(function (k) { return '<option value="' + k + '"' + (k === c.cur ? " selected" : "") + ">" + k + "</option>"; }).join("") + "</select></div></div>" +
    '<div class="row"><div class="fl" style="flex:1"><label>% опт</label><input class="pin" data-cf="po" value="' + pc(c.po) + '" inputmode="decimal"></div><div class="fl" style="flex:1"><label>% розница (от опта)</label><input class="pin" data-cf="pr" value="' + pc(c.pr) + '" inputmode="decimal"></div><div class="fl" style="flex:1"><label>% офис (от опта)</label><input class="pin" data-cf="pf" value="' + pc(c.pf) + '" inputmode="decimal"></div></div>' +
    (S.ed ? '<button class="btn" data-pr="cfg">Сохранить тарифы</button>' : "") + '<p class="note" style="margin:8px 0 0">Если карго считает в долларах — поставьте «USD»: тариф пересчитается по курсу доллара на дату каждого прихода.</p></div>' +
    '<div class="pq"><b>История курсов</b>' + (S.hist ? '<div class="tw"><table class="tb ftb"><tr><th>Дата</th><th>Валюта</th><th>Курс</th><th>Источник</th><th>Кто</th></tr>' + S.hist.slice(0, 120).map(function (x) { return "<tr><td>" + dN(x.d) + "</td><td>" + esc(x.cur) + '</td><td class="n">' + nf(x.v, 4) + "</td><td>" + esc(x.src) + "</td><td>" + esc(x.w || "") + "</td></tr>"; }).join("") + "</table></div>" : ' <button class="btn sm o" data-pr="hist">Показать</button>') + "</div>";
}

/* ---------- Excel ---------- */
function needXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise(function (res, rej) { var s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; s.onload = function () { res(window.XLSX); }; s.onerror = rej; document.head.appendChild(s); });
}
var HMAP = [["nm", /наимен/], ["code", /^код/], ["bc", /штрих/], ["pr", /стоимость товара|^цена/], ["m3", /объ[её]м|куб/], ["kg", /^кг|вес/], ["qpb", /в одной коробке|в коробке|кол-?во/], ["box", /^короб/], ["cost", /себесто/], ["prr", /процент по розн/], ["pf", /процент по офис/], ["po", /процент по опт/], ["note", /примеч/]];
function readRows(file) {
  return needXLSX().then(function (X) { return file.arrayBuffer().then(function (b) { var wb = X.read(b, { type: "array" }), ws = wb.Sheets[wb.SheetNames[0]]; return X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }); }); });
}
function fracPct(v, def) { if (v == null || v === "") return def; v = nv(v); return v > 3 ? v / 100 : v; }
function importItems(rows) {
  var hi = -1, M = {};
  for (var r = 0; r < Math.min(rows.length, 15); r++) if ((rows[r] || []).some(function (c) { return /наимен/i.test(String(c || "")); })) { hi = r; break; }
  if (hi < 0) throw new Error("Не нашли строку с заголовком «Наименование товара»");
  rows[hi].forEach(function (c, i) { var s = String(c || "").toLowerCase().replace(/\s+/g, " ").trim(); HMAP.forEach(function (m) { if (M[m[0]] == null && m[1].test(s)) M[m[0]] = i; }); });
  if (M.pr == null) throw new Error("Нет столбца «Стоимость товара»");
  var c = S.cfg, out = [], last = "", g = function (row, k) { return M[k] == null ? null : row[M[k]]; };
  rows.slice(hi + 1).forEach(function (row) {
    if (!row) return; var nm = g(row, "nm"), pr = g(row, "pr"), nmS = nm == null ? "" : String(nm).trim();
    if (/^итого/i.test(nmS)) return;
    if (nmS) last = nmS.replace(/\s+/g, " ");
    var cst = g(row, "cost"), fx = 0;
    if (pr == null || pr === "" || !isFinite(nv(pr))) { if (typeof cst === "number" && cst > 0) { fx = cst; pr = 0; } else return; }
    var box = nv(g(row, "box")) || 1, kg = nv(g(row, "kg")), m3 = nv(g(row, "m3"));
    out.push({ fx: fx || "", nm: last, code: g(row, "code") == null ? "" : String(g(row, "code")).trim(), bc: g(row, "bc") == null ? "" : String(g(row, "bc")).trim(), pr: nv(pr), box: box, qpb: nv(g(row, "qpb")), kgb: box ? Math.round(kg / box * 10000) / 10000 : 0, m3b: box ? Math.round(m3 / box * 1e6) / 1e6 : 0, po: fracPct(g(row, "po"), c.po), prr: fracPct(g(row, "prr"), c.pr), pf: fracPct(g(row, "pf"), c.pf), note: g(row, "note") == null ? "" : String(g(row, "note")) });
  });
  return out;
}
function xl(name, rows, wd) { U.saveAny(name, U.xlsxBytes([{ name: "Лист1", rows: rows, wd: wd }]), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); }
function docXls(h) {
  var R = [["Приход " + h.no + " от " + dN(h.d) + " · " + (h.sup || "") + " · курс 1 " + h.cur + " = " + h.rate + " сом. · доставка " + h.m3t + " за м³, " + h.kgt + " за кг (" + h.tcur + ")"], ["№", "Наименование товара", "Код", "Штрихкод", "Стоимость товара, " + h.cur, "Объём в кубе (всего)", "кг (всего)", "Коробка", "Кол-во в одной коробке", "Себестоимость", "Процент по рознице", "Розничная цена", "Процент по офисной", "Офисная цена", "Процент по оптому", "Оптовая цена", "Сумма по себестоимости", "Примечание"]];
  (h.items || []).forEach(function (it, i) { R.push([i + 1, it.nm, it.code, it.bc, it.pr, it.m3 || "", it.kg, it.box, it.qpb, Math.round(it.cost * 100) / 100, pc(it.prr) + "%", it.rozn, pc(it.pf) + "%", it.ofis, pc(it.po) + "%", it.opt, it.sum, it.note || ""]); });
  R.push(["", "Итого", "", "", "", "", "", "", h.qty, "", "", "", "", "", "", "", h.sum, ""]);
  xl("Приход_" + h.no.replace(/[^\wа-я0-9-]+/gi, "_") + "_" + h.d + ".xlsx", R, [5, 34, 10, 14, 12, 10, 9, 8, 10, 12, 10, 12, 10, 12, 10, 12, 14, 20]);
}
function priceXls() {
  var R = [["Установка и обновление цен · по последнему приходу каждого товара · " + dN(today())], ["№", "Наименование товара", "Код", "Штрихкод", "Себестоимость", "Оптовая цена", "Розничная цена", "Офисная цена", "Приход", "Дата прихода", "Курс", "Прошлая себестоимость"]];
  S.price.slice().sort(function (a, b) { return (a.nm || "").localeCompare(b.nm || "", "ru"); }).forEach(function (x, i) { R.push([i + 1, x.nm, x.code, x.bc || "", Math.round(x.cost * 100) / 100, x.opt, x.rozn, x.ofis, x.no, dN(x.d), x.cur === "TJS" ? "" : "1 " + x.cur + " = " + x.rate, x.prev ? Math.round(x.prev.cost * 100) / 100 : ""]); });
  xl("Установка_цен_" + today() + ".xlsx", R, [5, 36, 10, 14, 12, 12, 12, 12, 10, 12, 16, 14]);
}
function loadPrice() { api("pr_price", {}).then(function (j) { S.price = j && j.ok ? j.list : []; draw(); }).catch(function () { S.price = []; toast("Нет связи"); draw(); }); }

/* ---------- события ---------- */
function onInput(e) {
  var t = e.target; if (!S.box || !S.box.contains(t)) return;
  if (t.dataset.prQ) { S.q = t.value; clearTimeout(S.qt); S.qt = setTimeout(function () { var pos = t.selectionStart; draw(); var n = S.box.querySelector("[data-pr-q]"); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) {} } }, 250); return; }
  if (!S.f) return;
  if (t.dataset.pf) { var k = t.dataset.pf; S.f[k] = t.value; if (k === "cur" || k === "tcur") { if (k === "cur") { S.f.rate = rateOf(t.value) || ""; S.f.rsrc = (S.rates[t.value] || {}).src || ""; } else S.f.trate = rateOf(t.value) || ""; draw(); return; } if (k === "rate") S.f.rsrc = "вручную"; if (/^(rate|trate|m3t|kgt)$/.test(k)) live(); return; }
  if (t.dataset.pi != null) { var it = S.f.items[+t.dataset.pi]; if (!it) return; it[t.dataset.k] = t.dataset.pct ? nv(t.value) / 100 : t.value; live(); }
}
function live() {
  var f = S.f, q = 0, s = 0, set = function (k, v) { var n = S.box.querySelector('[data-pc="' + k + '"]'); if (n) n.innerHTML = v; };
  f.items.forEach(function (it, i) { var c = calc(it, f); q += c.qty; s += c.sum; set("q" + i, nf(c.qty, 0)); set("c" + i, "<b>" + nf(c.cost) + "</b>"); set("o" + i, nf(c.opt)); set("r" + i, nf(c.rozn)); set("f" + i, nf(c.ofis)); set("s" + i, nf(c.sum)); });
  set("tq", nf(q, 0)); set("ts", nf(s));
}
function onClick(e) {
  var t = e.target.closest("[data-pr]"); if (!t || !S.box || !S.box.contains(t)) return; var a = t.dataset.pr; e.preventDefault();
  if (a === "v") { S.v = t.dataset.v; if (S.v === "price") S.price = null; draw(); return; }
  if (a === "add") { S.f.items.push(blankItem()); draw(); return; }
  if (a === "rm") { S.f.items.splice(+t.dataset.i, 1); if (!S.f.items.length) S.f.items.push(blankItem()); draw(); return; }
  if (a === "clr") { if (confirm("Очистить все строки?")) { S.f.items = [blankItem()]; draw(); } return; }
  if (a === "cancel") { S.f = newForm(); S.v = "list"; draw(); return; }
  if (a === "usenbt") { S.f.rate = S.nbt[S.f.cur]; S.f.rsrc = "НБТ"; draw(); return; }
  if (a === "nbt") { var d = S.f && S.v === "new" ? S.f.d : today(); toast("Запрашиваем курс НБТ…"); api("pr_nbt", { d: d }).then(function (j) { if (j && j.ok && Object.keys(j.nbt || {}).length) { S.nbt = j.nbt; toast("Курс НБТ на " + dN(j.d) + " получен"); } else toast("Сайт НБТ не ответил — введите курс вручную"); draw(); }); return; }
  if (a === "rset" || a === "rnbt") { var cur = t.dataset.c, v = a === "rnbt" ? S.nbt[cur] : nv((S.box.querySelector('[data-rate="' + cur + '"]') || {}).value); if (!(v > 0)) { toast("Введите курс"); return; } api("pr_rate", { cur: cur, v: v, src: a === "rnbt" ? "nbt" : "", d: today() }).then(function (j) { if (j && j.ok) { S.rates = j.rates; S.hist = null; if (S.f && !S.f.id && S.f.cur === cur) { S.f.rate = v; S.f.rsrc = a === "rnbt" ? "НБТ" : "вручную"; } toast("Курс " + cur + " = " + nf(v, 4) + " ✓"); draw(); } else toast("Не удалось сохранить"); }); return; }
  if (a === "hist") { api("pr_hist", {}).then(function (j) { S.hist = j && j.ok ? j.list : []; draw(); }); return; }
  if (a === "cfg") { var q = {}; S.box.querySelectorAll("[data-cf]").forEach(function (n) { var k = n.dataset.cf; q[k] = /^(po|pr|pf)$/.test(k) ? nv(n.value) / 100 : /cur$/.test(k) ? n.value : nv(n.value); }); api("pr_cfg", { cfg: q }).then(function (j) { if (j && j.ok) { S.cfg = j.cfg; toast("Тарифы сохранены ✓"); draw(); } else toast("Нет прав или нет связи"); }); return; }
  if (a === "save") return save();
  if (a === "open") { S.v = "doc"; S.doc = null; draw(); api("pr_one", { id: t.dataset.id }).then(function (j) { S.doc = j && j.ok ? j.doc : null; if (!S.doc) { toast("Не найдено"); S.v = "list"; } draw(); }); return; }
  if (a === "xls") { docXls(S.doc); return; }
  if (a === "copy") { S.f = newForm(S.doc); S.v = "new"; toast("Скопировано по текущему курсу — проверьте количество и цены"); draw(); return; }
  if (a === "edit") { var h = S.doc, f = newForm(h); f.id = h.id; f.no = h.no; f.d = h.d; f.sup = h.sup; f.note = h.note; f.cur = h.cur; f.rate = h.rate; f.tcur = h.tcur; f.trate = h.trate; f.m3t = h.m3t; f.kgt = h.kgt; f.rsrc = h.rsrc; S.f = f; S.v = "new"; draw(); return; }
  if (a === "del") { if (!confirm("Удалить приход " + S.doc.no + "? Это нельзя отменить.")) return; api("pr_del", { id: S.doc.id }).then(function (j) { if (j && j.ok) { toast("Удалено"); S.v = "list"; S.doc = null; load(); } }); return; }
  if (a === "pxls") { priceXls(); return; }
  if (a === "pre") { S.price = null; draw(); return; }
}
function onChange(e) {
  var t = e.target; if (!S.box || !S.box.contains(t)) return;
  if (!t.dataset.prFile || !t.files || !t.files[0]) return;
  var fl = t.files[0]; toast("Читаем таблицу…");
  readRows(fl).then(function (rows) {
    var L = importItems(rows); if (!L.length) { toast("В файле не нашли товаров с ценой"); return; }
    var keep = S.f.items.filter(function (it) { return it.nm || it.code || it.pr; });
    if (keep.length && !confirm("Добавить " + L.length + " строк к уже заполненным (" + keep.length + ")? «Отмена» — заменить ими.")) keep = [];
    S.f.items = keep.concat(L); toast("Загружено строк: " + L.length + ". Проверьте курс и нажмите «Оприходовать»"); draw();
  }).catch(function (x) { toast(x && x.message ? x.message : "Не удалось прочитать файл"); });
  t.value = "";
}
function save() {
  var f = S.f, rate = f.cur === "TJS" ? 1 : nv(f.rate), trate = f.tcur === "TJS" ? 1 : nv(f.trate);
  if (!(rate > 0)) { toast("Укажите курс " + f.cur + " на дату прихода"); return; }
  if (!(trate > 0)) { toast("Укажите курс " + f.tcur + " для тарифов"); return; }
  var items = f.items.filter(function (it) { return (it.nm || it.code) && (nv(it.pr) > 0 || nv(it.fx) > 0); });
  var bad = items.filter(function (it) { return !(nv(it.box) * nv(it.qpb) > 0); });
  if (!items.length) { toast("Добавьте товары: наименование и цену"); return; }
  if (bad.length && !confirm("У " + bad.length + " строк не указано количество (например «" + (bad[0].nm || bad[0].code) + "»).\nДля них себестоимость посчитается без доставки, и в сумму прихода они не войдут.\n\nСохранить так? («Отмена» — вернуться и дописать)")) return;
  var send = items.map(function (it) { var box = nv(it.box); return { nm: String(it.nm || "").trim(), code: String(it.code || "").trim(), bc: String(it.bc || "").trim(), grp: it.grp || "", note: it.note || "", pr: nv(it.pr), fx: nv(it.fx), box: box, qpb: nv(it.qpb), kg: nv(it.kgb) * box, m3: nv(it.m3b) * box, po: +it.po || 0, prr: +it.prr || 0, pf: +it.pf || 0 }; });
  S.busy = 1; draw();
  api("pr_save", { h: { id: f.id || "", d: f.d, sup: f.sup, note: f.note, cur: f.cur, rate: rate, tcur: f.tcur, trate: trate, m3t: nv(f.m3t), kgt: nv(f.kgt), rsrc: f.rsrc }, items: send }).then(function (j) {
    S.busy = 0; if (!j || !j.ok) { toast(j && j.error === "role" ? "Нет прав" : j && j.error === "rate" ? "Проверьте курс" : "Не удалось сохранить"); draw(); return; }
    toast("Оприходовано: " + j.doc.no + " ✓"); S.doc = j.doc; S.v = "doc"; S.f = newForm(); S.price = null; load();
  }).catch(function () { S.busy = 0; toast("Нет связи — данные остались в форме"); draw(); });
}
var bound = 0;
(function () { var st = document.createElement("style"); st.textContent = ".prt td{padding:3px 4px;vertical-align:middle}.prt .pin{padding:5px 8px;height:34px;min-height:0;font-size:14px;border-radius:8px;margin:0;width:100%;box-sizing:border-box}.prt th{font-size:12px;line-height:1.2;vertical-align:bottom}.prt tr:hover td{background:rgba(0,0,0,.02)}"; document.head.appendChild(st); })();
function mount(box) {
  S.box = box; if (!bound) { bound = 1; document.addEventListener("input", onInput, true); document.addEventListener("change", onChange, true); document.addEventListener("click", onClick, true); }
  if (!S.cfg && !S.busy) { box.innerHTML = '<div class="emp">Загружаем…</div>'; load(true); } else draw();
}
window.PRIHOD = { mount: mount, calc: calc, importItems: importItems, S: S };
})();
