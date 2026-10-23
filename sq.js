/* Смена по QR — подключается в team.html и courier.html.
   Ловит код из ссылки (#sq=…), меняет его на пропуск и добавляет блок QR в окно «Начало / конец смены». */
(function () {
  var KU = /courier\.html/.test(location.pathname), WHO = KU ? "ku" : "tm", TK = KU ? "ku_tok" : "tm_tok";
  var Q = { req: null, pass: "", bn: "", exp: 0, raw: "", busy: 0, open: 0 };
  function ls(k) { try { return localStorage.getItem(k) || "" } catch (e) { return "" } }
  function gs(k) { try { return sessionStorage.getItem(k) || "" } catch (e) { return "" } }
  function ss(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v) } catch (e) {} }
  function el(i) { return document.getElementById(i) }
  function h(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] }) }
  function say(t) { if (typeof window.toast === "function") window.toast(t) }
  function live() { return Q.pass && Q.exp > Date.now() }

  try { var sv = JSON.parse(gs("sq_pass") || "null"); if (sv && sv.exp > Date.now()) { Q.pass = sv.p; Q.bn = sv.bn; Q.exp = sv.exp } } catch (e) {}
  var m = location.hash.match(/sq=([\w.\-]+)/);
  if (m) { Q.raw = m[1]; Q.open = 1; ss("sq_raw", m[1]); ss("sq_at", String(Date.now())); try { history.replaceState(null, "", location.pathname + location.search) } catch (e) { location.hash = "" } }
  else { var r0 = gs("sq_raw"); if (r0 && Date.now() - (+gs("sq_at") || 0) < 180000) { Q.raw = r0; Q.open = 1 } }

  /* добавляем пропуск к отметке смены и понятные тексты ошибок */
  var A0 = window.api;
  if (typeof A0 !== "function") return;
  window.api = function (pl) {
    var a = pl && pl.a, shift = /^(m_in|m_out|k_shin|k_shout)$/.test(a || "");
    if (shift && live()) pl.sqp = Q.pass;
    return A0(pl).then(function (j) {
      if (j && j.ok && (a === "m_me" || a === "k_shst") && j.sq != null) { Q.req = !!j.sq; draw() }
      if (j && shift) {
        if (j.ok) { Q.pass = ""; ss("sq_pass", null) }
        else if (j.error === "qr") { Q.req = true; j.error = "нужен QR с экрана в магазине — наведите на него камеру телефона"; setTimeout(draw, 50) }
      }
      return j;
    });
  };

  /* [hidden] должен скрывать всегда (иначе видна пустая картинка «Фото») */
  try { var st0 = document.createElement("style"); st0.textContent = "[hidden]{display:none!important}"; document.head.appendChild(st0) } catch (e) {}
  /* узнаём, нужен ли этому сотруднику QR (первый запрос страницы прошёл до подключения этого файла) */
  (function ask() { var tok = ls(TK); if (!tok) return setTimeout(ask, 1500); A0(KU ? { a: "k_shst", tok: tok } : { a: "m_me", tok: tok }).then(function (j) { if (j && j.ok && j.sq != null) { Q.req = !!j.sq; draw() } }).catch(function () {}) })();

  /* код → пропуск на 10 минут */
  function trade() {
    if (!Q.raw || Q.busy) return;
    var tok = ls(TK); if (!tok) return;            // ждём, пока сотрудник войдёт
    var raw = Q.raw; Q.raw = ""; ss("sq_raw", null); Q.busy = 1; draw();
    A0({ a: "z_sqpass", tok: tok, who2: WHO, sq: raw }).then(function (j) {
      Q.busy = 0;
      if (j && j.ok) {
        Q.pass = j.sqp; Q.bn = j.bn || ""; Q.exp = Date.now() + (j.ttl || 600) * 1000 - 15000;
        ss("sq_pass", JSON.stringify({ p: Q.pass, bn: Q.bn, exp: Q.exp }));
        say("✅ QR принят" + (Q.bn ? " · " + Q.bn : ""));
        if (Q.open) { Q.open = 0; openSheet() }
      } else {
        Q.open = 0;
        var e = j && j.error;
        say(e === "slow" ? "Слишком много попыток. Подождите 10 минут" : e === "action" ? "Сервер ещё не обновлён — сообщите руководителю" : e === "tok" ? "Сначала войдите в приложение" : "QR устарел. Отсканируйте его ещё раз — код меняется каждые 30 секунд");
        if (el("sqer")) el("sqer").textContent = e === "slow" ? "Слишком много попыток. Подождите 10 минут" : "Код не подошёл. Отсканируйте QR, который сейчас на экране";
      }
      draw();
    }).catch(function () { Q.busy = 0; say("Нет связи. Отсканируйте QR ещё раз"); draw() });
  }
  setInterval(trade, 1000);

  /* после скана сразу открываем окно смены */
  function openSheet() {
    var n = 0, t = setInterval(function () {
      if (++n > 30) return clearInterval(t);
      if (el("sgo") || el("kgo2")) { clearInterval(t); draw(); return }
      var b = document.querySelector("[data-sh],[data-ksh]");
      if (b) { clearInterval(t); b.click() }
    }, 500);
  }

  /* блок QR внутри окна «Начало / конец смены» */
  function draw() {
    var go = el("sgo") || el("kgo2"); if (!go) return;
    var d = el("sqbox");
    if (!d) { d = document.createElement("div"); d.id = "sqbox"; d.style.margin = "10px 0 0"; go.parentNode.insertBefore(d, go) }
    var box = "border-radius:12px;padding:10px 12px;font:600 14.5px system-ui;";
    if (Q.busy) { d.innerHTML = '<div style="' + box + 'background:#e0f2fe;color:#075985">⏳ Проверяем QR…</div>'; go.disabled = true; return }
    if (live()) { d.innerHTML = '<div style="' + box + 'background:#dcfce7;color:#14532d">✅ QR принят' + (Q.bn ? ' · ' + h(Q.bn) : '') + '</div>'; go.disabled = false; return }
    if (Q.req !== true) { d.innerHTML = ""; go.disabled = false; return }
    go.disabled = true;
    d.innerHTML = '<div style="' + box + 'background:#fef3c7;color:#78350f">📱 Нужен QR с экрана в магазине. Нажмите «Сканировать QR» и наведите камеру на экран.</div>' +
      '<button class="btn g" id="sqcam" type="button" style="width:100%;margin-top:8px">📷 Сканировать QR</button>' +
      '<div style="display:flex;gap:8px;margin-top:8px;align-items:center"><input id="sqin" placeholder="или код с экрана" maxlength="8" autocomplete="off" autocapitalize="characters" style="margin:0;flex:1;text-transform:uppercase;letter-spacing:.12em"><button class="btn o" id="sqok" type="button" style="flex:0 0 auto;margin:0">OK</button></div>' +
      '<div class="er" id="sqer" style="color:#dc2626;font-size:14px;min-height:18px;margin-top:4px"></div>';
    el("sqcam").onclick = function () { scan() };
    el("sqok").onclick = function () { var v = el("sqin").value.trim(); if (v.replace(/\W/g, "").length < 6) { el("sqer").textContent = "В коде 6 символов"; return } Q.raw = v; trade() };
  }
  new MutationObserver(function () { if ((el("sgo") || el("kgo2")) && !el("sqbox")) draw() }).observe(document.body, { childList: true, subtree: true });


  /* живой сканер: задняя камера, распознаёт QR без снимка */
  function scan() {
    var md = navigator.mediaDevices;
    if (!md || !md.getUserMedia) return noCam("Этот браузер не даёт доступ к камере");
    var ov = document.createElement("div");
    ov.style.cssText = "position:fixed;inset:0;z-index:100;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:calc(16px + env(safe-area-inset-top,0px)) 16px calc(16px + env(safe-area-inset-bottom,0px))";
    ov.innerHTML = '<div style="position:relative;width:min(88vw,62vh);aspect-ratio:1;max-width:100%;border-radius:20px;overflow:hidden;background:#111">' +
      '<video id="sqv" playsinline muted autoplay style="width:100%;height:100%;object-fit:cover"></video>' +
      '<div style="position:absolute;inset:12%;border:3px solid #fff;border-radius:16px;box-shadow:0 0 0 999px rgba(0,0,0,.35)"></div></div>' +
      '<div id="sqvt" style="color:#fff;font:600 16px system-ui;text-align:center">Наведите камеру на QR на экране магазина</div>' +
      '<button type="button" id="sqvx" style="border:0;border-radius:14px;padding:13px 22px;font:700 15px system-ui;background:#fff;color:#111">Закрыть</button>';
    document.body.appendChild(ov);
    var v = el("sqv"), stream = null, done = 0, c = document.createElement("canvas"), x = c.getContext("2d", { willReadFrequently: true }), det = null, busy = 0;
    try { if ("BarcodeDetector" in window) det = new BarcodeDetector({ formats: ["qr_code"] }) } catch (e) { det = null }
    function stop() { done = 1; try { stream && stream.getTracks().forEach(function (t) { t.stop() }) } catch (e) {} ov.remove() }
    el("sqvx").onclick = stop;
    function hit(val) { if (done || !val) return; if (!/sq=|^[\w.\-]{6,}$/.test(val)) { el("sqvt").textContent = "Это не QR смены. Наведите на экран магазина"; return } if (navigator.vibrate) navigator.vibrate(60); stop(); Q.raw = val; trade() }
    function frame() {
      if (done) return;
      if (!busy && v.readyState >= 2 && v.videoWidth) {
        busy = 1;
        if (det) det.detect(v).then(function (r) { busy = 0; if (r && r[0]) hit(r[0].rawValue) }).catch(function () { busy = 0; det = null; loadJs().catch(function () {}) });
        else if (window.jsQR) {
          var s = Math.min(v.videoWidth, v.videoHeight), k = Math.min(1, 720 / s);
          c.width = c.height = Math.round(s * k);
          x.drawImage(v, (v.videoWidth - s) / 2, (v.videoHeight - s) / 2, s, s, 0, 0, c.width, c.height);
          var r = window.jsQR(x.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: "dontInvert" });
          busy = 0; if (r) hit(r.data);
        } else busy = 0;
      }
      setTimeout(function () { requestAnimationFrame(frame) }, 120);
    }
    var t0 = Date.now(), seen = 0;
    el("sqvt").textContent = "Включаем камеру… Если телефон спросит доступ — нажмите «Разрешить»";
    (det ? Promise.resolve() : loadJs()).catch(function () {}).then(function () {
      return md.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false }).catch(function (e) {
        if (e && (e.name === "OverconstrainedError" || e.name === "NotReadableError")) return md.getUserMedia({ video: true, audio: false });
        throw e;
      });
    }).then(function (st) {
      stream = st; if (done) return stop();
      v.muted = true; v.setAttribute("playsinline", ""); v.setAttribute("muted", "");
      v.srcObject = st;
      v.onloadedmetadata = function () { var p = v.play(); if (p && p.catch) p.catch(function () {}) };
      v.onplaying = function () { seen = 1; el("sqvt").textContent = "Наведите камеру на QR на экране магазина" };
      frame();
      setTimeout(function () { if (!done && !seen) { stop(); noCam("Камера не запустилась") } }, 8000);
    }).catch(function (e) {
      stop();
      var n = e && e.name;
      noCam(n === "NotAllowedError" ? "Нет доступа к камере. Нажмите на замок у адреса сайта → Разрешения → Камера → Разрешить" : n === "NotFoundError" ? "Камера не найдена" : "Камера не включилась (" + (n || "ошибка") + ")");
    });
  }
  function noCam(t) {
    say(t);
    if (el("sqer")) el("sqer").textContent = t + ". Введите код, который написан под QR на экране.";
  }
  /* распознавание QR на фото */
  function decode(file) {
    return new Promise(function (res, rej) {
      var img = new Image(), u = URL.createObjectURL(file);
      img.onload = function () {
        var c = document.createElement("canvas"), k = Math.min(1, 1200 / Math.max(img.width, img.height));
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        var x = c.getContext("2d"); x.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
        function js() { loadJs().then(function () { var r = window.jsQR(x.getImageData(0, 0, c.width, c.height).data, c.width, c.height); r ? res(r.data) : rej() }).catch(rej) }
        if ("BarcodeDetector" in window) { try { new BarcodeDetector({ formats: ["qr_code"] }).detect(c).then(function (r) { r && r[0] ? res(r[0].rawValue) : js() }).catch(js) } catch (e) { js() } }
        else js();
      };
      img.onerror = rej; img.src = u;
    });
  }
  function loadJs() {
    if (window.jsQR) return Promise.resolve();
    return new Promise(function (res, rej) { var s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js"; s.onload = res; s.onerror = rej; document.head.appendChild(s) });
  }
})();
