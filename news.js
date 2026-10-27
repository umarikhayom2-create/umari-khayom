/* 📢 Лента новостей для сотрудников — общий блок для «Рабочего персонала», курьеров и панели офиса.
   Подключение: <script src="news.js"></script>, затем NEWS.init({url, auth: function(){return {...}}, box: function(){return элемент}}) */
(function () {
  var CSS = '.nw{background:var(--card,var(--sf,var(--bg,#fff)));border:1px solid var(--bd,#2c2c33);border-left:5px solid #0ea5e9;border-radius:18px;padding:12px 14px;margin:0 0 12px;color:var(--tx,inherit)}' +
    '.nw .nwt{display:flex;justify-content:space-between;align-items:center;gap:8px}.nw .nwt b{font-size:17px}' +
    '.nw .nwn{background:#e11d48;color:#fff;border-radius:999px;padding:1px 8px;font:700 12px system-ui;margin-left:6px}' +
    '.nw .nwi{border-top:1px dashed var(--bd,#2c2c33);padding:9px 0;font-size:15px;line-height:1.4}.nw .nwi.new{background:color-mix(in srgb,#0ea5e9 12%,transparent);margin:0 -8px;padding:9px 8px;border-radius:10px}' +
    '.nw .nwi small{display:block;opacity:.7;font-size:12px;margin-top:3px}.nw .nwi img{display:block;width:100%;max-height:320px;object-fit:cover;border-radius:12px;margin-top:6px;background:#0002}' +
    '.nw .nwb{border:0;border-radius:12px;padding:9px 12px;font:600 14px system-ui;cursor:pointer;background:#0ea5e9;color:#fff;text-transform:none;letter-spacing:0}.nw .nwb.o{background:transparent;color:inherit;border:1px solid var(--bd,#2c2c33)}' +
    '.nw .nwx{background:none;border:0;color:#e11d48;font:600 12px system-ui;cursor:pointer;padding:0;margin-left:8px}' +
    '.nwf{position:fixed;inset:0;background:#0009;z-index:9999;display:flex;align-items:flex-end;justify-content:center}.nwf>div{background:var(--card,var(--sf,var(--bg,#fff)));color:inherit;width:100%;max-width:520px;border-radius:20px 20px 0 0;padding:16px;box-sizing:border-box;color:var(--tx,inherit)}' +
    '.nwf textarea{width:100%;box-sizing:border-box;border:1px solid var(--bd,#2c2c33);border-radius:12px;padding:12px;font:16px system-ui;background:transparent;color:inherit;margin:8px 0}.nwf img{max-width:100%;max-height:200px;border-radius:12px;display:block;margin:6px 0}';
  var C = null, L = [], at = 0, all = false, busy = false, KEY = "uh_nw_seen";
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function seen() { try { return +localStorage.getItem(KEY) || 0; } catch (e) { return 0; } }
  function setSeen(v) { try { localStorage.setItem(KEY, String(v)); } catch (e) {} }
  function when(ts) { var d = new Date(ts), t = new Date(), hm = ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); if (d.toDateString() === t.toDateString()) return "сегодня " + hm; var y = new Date(t - 864e5); if (d.toDateString() === y.toDateString()) return "вчера " + hm; return d.getDate() + "." + ("0" + (d.getMonth() + 1)).slice(-2) + " " + hm; }
  function pic(id, w) { return "https://drive.google.com/thumbnail?id=" + encodeURIComponent(id) + "&sz=w" + (w || 640); }
  function api(pl) { var a = C.auth() || {}; Object.keys(a).forEach(function (k) { pl[k] = a[k]; }); return fetch(C.url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(pl) }).then(function (r) { return r.json(); }); }
  function toast(t) { if (typeof window.toast === "function") window.toast(t); else alert(t); }
  function html() {
    if (!at) return "";
    var s = seen(), nw = L.filter(function (o) { return o.ts > s; }).length, show = all ? L : L.slice(0, 3);
    var h = '<div class="nw"><div class="nwt"><b>📢 Новости' + (nw ? '<span class="nwn">' + nw + '</span>' : "") + '</b><button class="nwb" data-nw="add">+ Написать</button></div>';
    h += show.length ? show.map(function (o) {
      return '<div class="nwi' + (o.ts > s ? " new" : "") + '">' + esc(o.t).replace(/\n/g, "<br>") + (o.ph ? '<img src="' + pic(o.ph) + '" data-nwph="' + esc(o.ph) + '" alt="" loading="lazy">' : "") +
        '<small>' + esc(o.w) + " · " + esc(o.r) + " · " + when(o.ts) + (o.mine ? '<button class="nwx" data-nw="del" data-id="' + esc(o.id) + '">Удалить</button>' : "") + "</small></div>";
    }).join("") : '<div class="nwi" style="opacity:.7">Пока новостей нет. Напишите первую: например, «Дорога на Рудаки перекрыта — объезжайте через Айни».</div>';
    if (L.length > 3) h += '<button class="nwb o" data-nw="all" style="width:100%;margin-top:6px">' + (all ? "Свернуть ▴" : "Все новости (" + L.length + ") ▾") + "</button>";
    return h + "</div>";
  }
  function draw() { var b = C && C.box(); if (b) b.innerHTML = html(); }
  function load() {
    if (busy || !C || !C.auth()) return; busy = true;
    api({ a: "n_list" }).then(function (j) {
      busy = false; if (!j || !j.ok) return;
      var s = seen(), fresh = at && (j.list || []).filter(function (o) { return o.ts > s && !L.some(function (x) { return x.id === o.id; }); });
      L = j.list || []; at = Date.now(); draw();
      if (fresh && fresh.length && typeof C.ping === "function") C.ping(fresh[0]);
    }).catch(function () { busy = false; });
  }
  function form() {
    var ph = "", d = document.createElement("div"); d.className = "nwf";
    d.innerHTML = '<div><b style="font-size:19px">📢 Новость для всех сотрудников</b><textarea id="nwt" rows="4" maxlength="600" placeholder="Например: дорога у Зелёного базара перекрыта до 18:00, курьерам — объезд через Шотемур"></textarea><img id="nwi" hidden alt=""><div style="display:flex;gap:8px;flex-wrap:wrap"><label class="nwb o" style="border:1px solid var(--bd,#2c2c33);border-radius:12px;padding:9px 12px;cursor:pointer">📷 Фото<input type="file" accept="image/*" id="nwp" hidden></label><button class="nwb" id="nwgo" style="flex:1">Опубликовать</button></div><button class="nwb o" id="nwcx" style="width:100%;margin-top:8px;border:1px solid var(--bd,#2c2c33)">Отмена</button><p style="font-size:12px;opacity:.7;margin:8px 0 0">Новость увидят все: рабочий персонал, курьеры, офис. У кого подключён Telegram — получат уведомление.</p></div>';
    document.body.appendChild(d);
    d.querySelector("#nwcx").onclick = function () { d.remove(); };
    d.querySelector("#nwp").onchange = function () {
      var f = this.files && this.files[0]; if (!f) return;
      shrinkNw(f).then(function (u) { ph = u; var i = d.querySelector("#nwi"); i.src = u; i.hidden = false; });
    };
    d.querySelector("#nwgo").onclick = function () {
      var t = d.querySelector("#nwt").value.trim(), x = this; if (t.length < 3 && !ph) { toast("Напишите текст новости"); return; }
      x.disabled = true; x.textContent = "⏳ Публикуем…";
      api({ a: "n_add", t: t, ph: ph }).then(function (j) {
        if (j && j.ok) { d.remove(); toast("Новость опубликована ✓"); load(); }
        else { x.disabled = false; x.textContent = "Опубликовать"; toast(j && j.error === "action" ? "Сервер ещё не обновлён — сообщите руководителю" : j && j.error === "slow" ? "Подождите немного" : "Не получилось: " + ((j && j.error) || "")); }
      }).catch(function () { x.disabled = false; x.textContent = "Опубликовать"; toast("Нет связи"); });
    };
    setTimeout(function () { d.querySelector("#nwt").focus(); }, 50);
  }
  // фото: до 1000 px, ~100 КБ — грузится быстро и не ест трафик
  function shrinkNw(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader(); fr.onload = function () {
        var im = new Image(); im.onload = function () {
          var M = 1000, k = Math.min(1, M / Math.max(im.width, im.height)), c = document.createElement("canvas");
          c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); var g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
          var q = .6, d = c.toDataURL("image/jpeg", q); while (d.length > 140000 && q > .3) { q -= .1; d = c.toDataURL("image/jpeg", q); } res(d);
        }; im.onerror = rej; im.src = fr.result;
      }; fr.onerror = rej; fr.readAsDataURL(file);
    });
  }
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("[data-nw],[data-nwph]"); if (!t || !C) return;
    if (t.dataset.nwph) { var v = document.createElement("div"); v.className = "nwf"; v.style.alignItems = "center"; v.innerHTML = '<img src="' + pic(t.dataset.nwph, 1400) + '" style="max-width:96vw;max-height:90vh;border-radius:14px">'; v.onclick = function () { v.remove(); }; document.body.appendChild(v); return; }
    var k = t.dataset.nw;
    if (k === "add") { form(); return; }
    if (k === "all") { all = !all; if (all && L[0]) setSeen(L[0].ts); draw(); return; }
    if (k === "del") { if (!confirm("Удалить новость?")) return; api({ a: "n_del", id: t.dataset.id }).then(function () { load(); }); return; }
  });
  // отмечаем прочитанным, когда блок увидели на экране
  setInterval(function () { var b = C && C.box(); if (b && L[0] && L[0].ts > seen() && !document.hidden) { var r = b.getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0) { setTimeout(function () { setSeen(L[0].ts); }, 8000); } } }, 4000);
  window.NEWS = {
    init: function (cfg) {
      C = cfg; var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
      load(); setInterval(function () { if (!document.hidden) load(); }, 60000);
      document.addEventListener("visibilitychange", function () { if (!document.hidden && Date.now() - at > 20000) load(); });
    },
    draw: draw, load: load, html: html, shrink: shrinkNw
  };
})();
