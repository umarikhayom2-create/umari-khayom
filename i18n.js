/* Умари Хайём — перевод сайта: русский · English · Тоҷикӣ.
   1) готовый словарь (i18n-dict.js) — ручной, выверенный перевод интерфейса;
   2) всё остальное (названия товаров, новые тексты) переводит ИИ на сервере, перевод сохраняется и больше не запрашивается;
   3) числа и коды в тексте не трогаются: «1,60 сом.» и «1,25 сом.» — один и тот же перевод.
   Не переводится: панель сотрудников, текст заказа для магазина, то, что вводит пользователь. */
(function () {
  var SRV = "https://script.google.com/macros/s/AKfycbzxbho2rc1WmpPRcsMGcKcbxdjH4AgJzxaOU_4R8PvEi5_x45vfRO2vP2nXRR5QKojg/exec";
  var LANGS = { ru: "Русский", en: "English", tg: "Тоҷикӣ" }, SHORT = { ru: "RU", en: "EN", tg: "TJ" };
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (x) { return null; } }
  var q = (location.search.match(/[?&]lang=(ru|en|tg)/) || [])[1];
  if (q) ls("uh_lang", q);
  var L = ls("uh_lang");
  if (!L) { var nl = (navigator.language || "ru").toLowerCase(); L = /^tg/.test(nl) ? "tg" : /^ru|^uz|^ky|^kk/.test(nl) ? "ru" : /^en/.test(nl) ? "en" : "ru"; }
  if (!LANGS[L]) L = "ru";
  var I = window.I18N = { lang: L, LANGS: LANGS, SHORT: SHORT, set: function (l) { if (!LANGS[l] || l === L) return; ls("uh_lang", l); location.reload(); } };
  document.documentElement.lang = L === "tg" ? "tg" : L;
  if (L === "ru") return;

  /* ---------- словари ---------- */
  var NUM = /[−\-+]?\d+(?:[\d   ]*\d)?(?:[.,]\d+)?/g;
  function norm(s) { return String(s).replace(/[\s ]+/g, " ").trim(); }
  function tpl(s) { var nums = []; var t = norm(s).replace(NUM, function (m) { nums.push(m); return "{" + (nums.length - 1) + "}"; }); return { t: t, n: nums }; }
  function fill(t, nums) { return t.replace(/\{(\d+)\}/g, function (m, i) { return nums[+i] != null ? nums[+i] : m; }); }
  var DICT = {}, CACHE = {}, OUT = {};
  var src = (window.I18N_DICT || {});
  Object.keys(src).forEach(function (ru) { var v = src[ru]; if (!v) return; var tr = L === "en" ? v[0] : v[1]; if (!tr) return; var k = tpl(ru); var o = tpl(tr); DICT[k.t] = o.t; OUT[norm(tr)] = 1; });
  try { CACHE = JSON.parse(ls("uh_tr_" + L) || "{}"); } catch (x) { CACHE = {}; }
  Object.keys(CACHE).forEach(function (k) { OUT[CACHE[k]] = 1; });
  // фразы для составных и «живых» строк (цены, количества): если вся строка покрыта ими — перевод без сервера
  function esc(x) { return x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  var PH = (window.I18N_PHRASES || []).map(function (p) { return [p[0], L === "en" ? p[1] : p[2], new RegExp("(^|[^А-Яа-яЁё])" + esc(p[0]) + "(?![А-Яа-яЁё])", "g")]; }).filter(function (p) { return p[1] != null; }).sort(function (a, b) { return b[0].length - a[0].length; });
  var CYR = /[А-Яа-яЁё]/;
  function byPhrases(t) {
    var parts = [], s = t;
    PH.forEach(function (p, i) { if (s.indexOf(p[0]) < 0) return; s = s.replace(p[2], function (m, a) { return a + "\u0001" + i + "\u0002"; }); });
    if (CYR.test(s.replace(/\u0001\d+\u0002/g, ""))) return null;
    return s.replace(/\u0001(\d+)\u0002/g, function (m, i) { return PH[+i][1]; });
  }
  var WAIT = {}, QUEUE = [], qt = 0;
  function lookup(raw) {
    var n = norm(raw); if (!n || !CYR.test(n) || OUT[n]) return null;
    var k = tpl(n), hit = DICT[k.t] || CACHE[k.t];
    if (hit == null) { var ph = byPhrases(k.t); if (ph != null) hit = ph; }
    if (hit == null) { if (!WAIT[k.t] && k.t.length <= 1500) { WAIT[k.t] = 1; QUEUE.push(k.t); clearTimeout(qt); qt = setTimeout(flush, 250); } return null; }
    var out = fill(hit, k.n); OUT[norm(out)] = 1;
    // сохраняем пробелы по краям, чтобы не «склеивать» слова в строке
    var lead = (String(raw).match(/^\s*/) || [""])[0], tail = (String(raw).match(/\s*$/) || [""])[0];
    return lead + out + tail;
  }
  I.t = function (s) { var r = lookup(s); return r == null ? s : r; };

  /* ---------- перевод страницы ---------- */
  var SKIP_SEL = "#adm,#c3,#ot,[data-noi18n],script,style,textarea,code,pre,.adm";
  var ATTR = ["placeholder", "title", "aria-label", "alt"];
  var ORIG = new WeakMap();
  function skip(el) { return !el || (el.closest && el.closest(SKIP_SEL)); }
  function doText(n) {
    var p = n.parentNode; if (!p || skip(p)) return;
    var cur = n.data, o = ORIG.get(n);
    if (o && o.out === cur) return;
    var r = lookup(cur);
    if (r != null && r !== cur) {
      // у <option> без value значение берётся из текста — сохраняем русское, чтобы заказ уходил магазину как раньше
      if (p.tagName === "OPTION" && !p.hasAttribute("value")) p.setAttribute("value", cur);
      ORIG.set(n, { ru: cur, out: r }); n.data = r;
    }
    else ORIG.set(n, { ru: cur, out: null });
  }
  function doEl(el) {
    if (skip(el)) return;
    ATTR.forEach(function (a) { var v = el.getAttribute(a); if (!v || !CYR.test(v)) return; var r = lookup(v); if (r != null && r !== v) el.setAttribute(a, r); });
    if ((el.tagName === "INPUT" && (el.type === "button" || el.type === "submit")) && CYR.test(el.value)) { var r2 = lookup(el.value); if (r2 != null) el.value = r2; }
  }
  function walk(root) {
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1 || skip(root)) return;
    doEl(root);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, { acceptNode: function (n) { if (n.nodeType === 1 && skip(n)) return NodeFilter.FILTER_REJECT; return NodeFilter.FILTER_ACCEPT; } });
    var n; while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else doEl(n); }
  }
  function all() { if (document.body) walk(document.body); var t = lookup(document.title); if (t) document.title = t; }
  var mo = new MutationObserver(function (ms) {
    ms.forEach(function (m) {
      if (m.type === "characterData") doText(m.target);
      else if (m.type === "attributes") doEl(m.target);
      else m.addedNodes.forEach(function (n) { walk(n); });
    });
  });
  function start() { all(); mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTR }); bar(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  // окна подтверждения тоже на выбранном языке
  ["alert", "confirm", "prompt"].forEach(function (f) { var o = window[f]; if (!o) return; window[f] = function (m, d) { return o.call(window, I.t(m), d); }; });

  /* ---------- ИИ-перевод на сервере (результат кэшируется) ---------- */
  function flush() {
    var L0 = QUEUE.splice(0, 40); if (!L0.length) return;
    fetch(SRV, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ a: "c_tr", to: L, list: L0 }) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) return;
        var got = 0;
        Object.keys(j.tr || {}).forEach(function (k) { var v = j.tr[k]; if (v) { CACHE[k] = v; OUT[v] = 1; got++; } delete WAIT[k]; });
        if (got) { try { ls("uh_tr_" + L, JSON.stringify(CACHE)); } catch (x) {} all(); }
      })
      .catch(function () { L0.forEach(function (k) { delete WAIT[k]; }); })
      .then(function () { if (QUEUE.length) setTimeout(flush, 300); });
  }
  // раз в сутки забираем все готовые переводы одним запросом — чтобы страница сразу была на нужном языке
  (function () {
    var last = +(ls("uh_tr_at_" + L) || 0); if (Date.now() - last < 6 * 36e5) return;
    fetch(SRV, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ a: "c_trall", to: L }) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j || !j.ok) return; Object.keys(j.tr || {}).forEach(function (k) { CACHE[k] = j.tr[k]; OUT[j.tr[k]] = 1; }); ls("uh_tr_" + L, JSON.stringify(CACHE)); ls("uh_tr_at_" + L, String(Date.now())); all(); })
      .catch(function () {});
  })();
  function bar() {}
})();

/* ---------- переключатель языка (на всех языках, в том числе на русском) ---------- */
(function () {
  var I = window.I18N; if (!I) return;
  var SW = (document.currentScript && document.currentScript.getAttribute("data-sw")) || "";
  function mk() {
    if (document.getElementById("langsw")) return;
    var host = document.querySelector(".hd .acts") || document.querySelector("header") || document.body;
    var w = document.createElement("div"); w.id = "langsw"; w.setAttribute("data-noi18n", "1");
    w.innerHTML = '<button type="button" class="lsb" aria-label="Язык / Language / Забон">🌐 ' + I.SHORT[I.lang] + '</button><div class="lsm" hidden>' + Object.keys(I.LANGS).map(function (k) { return '<button type="button" data-lang="' + k + '"' + (k === I.lang ? ' class="on"' : "") + ">" + I.SHORT[k] + " · " + I.LANGS[k] + "</button>"; }).join("") + "</div>";
    if (SW !== "float" && host.classList && host.classList.contains("acts")) host.insertBefore(w, host.firstChild);
    else { w.className = "lsf"; document.body.appendChild(w); }
    var st = document.createElement("style");
    st.textContent = "#langsw{position:relative;display:inline-flex}#langsw .lsb{height:44px;min-width:58px;padding:0 10px;border-radius:14px;border:1px solid var(--bd,#e5e1da);background:var(--sf,#fff);color:var(--tx,#1d1d1f);font:700 13.5px system-ui,sans-serif;cursor:pointer;white-space:nowrap}#langsw .lsm{position:absolute;right:0;top:50px;z-index:1000;background:var(--sf,#fff);border:1px solid var(--bd,#e5e1da);border-radius:14px;box-shadow:0 12px 30px rgba(0,0,0,.15);padding:6px;min-width:170px}#langsw .lsm[hidden]{display:none}#langsw .lsm button{display:block;width:100%;text-align:left;border:0;background:none;padding:10px 12px;border-radius:10px;font:600 14.5px system-ui,sans-serif;color:var(--tx,#1d1d1f);cursor:pointer}#langsw .lsm button:hover,#langsw .lsm button.on{background:var(--sf2,#f3efe9)}#langsw.lsf{position:fixed;left:10px;bottom:calc(10px + env(safe-area-inset-bottom));z-index:999}#langsw.lsf .lsb{height:36px;min-width:52px;opacity:.9;box-shadow:0 4px 14px rgba(0,0,0,.15)}#langsw.lsf .lsm{top:auto;bottom:44px;left:0;right:auto}";
    document.head.appendChild(st);
    w.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; e.stopPropagation(); if (b.dataset.lang) { I.set(b.dataset.lang); return; } var m = w.querySelector(".lsm"); m.hidden = !m.hidden; });
    document.addEventListener("click", function () { var m = w.querySelector(".lsm"); if (m) m.hidden = true; });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mk); else mk();
})();
