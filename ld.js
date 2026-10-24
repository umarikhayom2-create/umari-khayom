/* Умари Хайём — красивая заставка загрузки вместо пустого экрана.
   Подключается сразу после <div id="app"></div>: <script src="ld.js" data-kind="team"></script>
   Как только страница нарисует свои данные в #app, заставка исчезает сама. */
(function () {
  var me = document.currentScript, kind = (me && me.dataset.kind) || "team", app = document.getElementById("app");
  if (!app || app.children.length) return;
  var C = { team: ["#8b5cf6", "#6d28d9", "👥", "Рабочий персонал"], courier: ["#0ea5e9", "#0369a1", "🚚", "Курьеры"], top: ["#f59e0b", "#b45309", "🏆", "Доска достижений"] }[kind] || ["#8b5cf6", "#6d28d9", "👥", "Умари Хайём"];
  var TIPS = [
    "🏆 Сделали что-то классное? Поделитесь на Доске достижений — коллеги проголосуют",
    "📋 В заявке на сборку товар можно просто сфотографировать — название писать не нужно",
    "👍 Дизлайк ставится только с причиной: так критика помогает, а не обижает",
    "⏱ Смена учитывается с 08:00 до 23:00 и закрывается сама",
    "💎 Оценка «Гениально» от руководства даёт сразу +40 очков",
    "🚚 Собрали заявку — одна кнопка, и курьер уже едет",
    "📷 Фото «до» и «после» — лучший способ показать свою работу",
    "🥇 Лучший по очкам за месяц получает звание «Сотрудник месяца»"
  ];
  var tip = TIPS[Math.floor(Math.random() * TIPS.length)];
  var st = document.createElement("style");
  st.textContent =
    "#uhld{min-height:100vh;display:flex;flex-direction:column}" +
    "#uhld .uq-hd{background:linear-gradient(135deg," + C[0] + "," + C[1] + ");padding:calc(18px + env(safe-area-inset-top,0px)) 18px 26px;color:#fff;position:relative;overflow:hidden}" +
    "#uhld .uq-hd:after{content:'';position:absolute;inset:0;background:linear-gradient(110deg,transparent 30%,rgba(255,255,255,.18) 50%,transparent 70%);animation:uhsw 1.8s infinite}" +
    "#uhld .uq-lg{display:flex;align-items:center;gap:12px}#uhld .uq-lg img{width:46px;height:46px;border-radius:14px;background:#fff;padding:4px;animation:uhpl 1.6s ease-in-out infinite}" +
    "#uhld .uq-lg b{font:800 19px system-ui;display:block}#uhld .uq-lg small{opacity:.85;font:500 13px system-ui}" +
    "#uhld .uq-mn{flex:1;padding:14px;max-width:640px;width:100%;margin:-14px auto 0;box-sizing:border-box}" +
    "#uhld .uq-sk{background:var(--sf,#fff);border:1px solid var(--bd,#e5e7eb);border-radius:18px;padding:14px;margin-bottom:12px}" +
    "#uhld .uq-ln{height:12px;border-radius:8px;margin:8px 0;background:linear-gradient(90deg,var(--sf2,#eef0f4) 25%,color-mix(in srgb,var(--sf2,#eef0f4) 55%,#fff) 50%,var(--sf2,#eef0f4) 75%);background-size:200% 100%;animation:uhsh 1.3s infinite linear}" +
    "#uhld .uq-rw{display:flex;gap:10px;align-items:center}#uhld .uq-ci{width:42px;height:42px;border-radius:50%;flex:none}" +
    "#uhld .uq-tip{margin:6px 0 14px;padding:14px;border-radius:16px;background:color-mix(in srgb," + C[0] + " 12%,transparent);color:var(--tx,#111);font:600 14.5px/1.45 system-ui}" +
    "#uhld .uq-tip small{display:block;font:700 11px system-ui;letter-spacing:.08em;text-transform:uppercase;color:" + C[1] + ";margin-bottom:4px}" +
    "#uhld .uq-msg{text-align:center;color:var(--mut,#667085);font:500 13.5px system-ui;padding:6px 0 18px;min-height:20px}" +
    "#uhld .uq-msg button{margin-top:10px;border:0;border-radius:12px;padding:11px 18px;font:700 14px system-ui;color:#fff;background:linear-gradient(135deg," + C[0] + "," + C[1] + ")}" +
    "#uhld .uq-dots i{display:inline-block;width:6px;height:6px;border-radius:50%;background:currentColor;margin:0 2px;animation:uhdt 1.2s infinite}#uhld .uq-dots i:nth-child(2){animation-delay:.2s}#uhld .uq-dots i:nth-child(3){animation-delay:.4s}" +
    "@keyframes uhsh{to{background-position:-200% 0}}@keyframes uhsw{from{transform:translateX(-100%)}to{transform:translateX(100%)}}" +
    "@keyframes uhpl{50%{transform:scale(1.08)}}@keyframes uhdt{0%,80%,100%{opacity:.25}40%{opacity:1}}" +
    "@media (prefers-reduced-motion:reduce){#uhld *{animation:none!important}}";
  document.head.appendChild(st);
  function card(lines, avatar) {
    var h = '<div class="uq-sk">' + (avatar ? '<div class="uq-rw"><span class="uq-ln uq-ci"></span><div style="flex:1"><div class="uq-ln" style="width:55%"></div><div class="uq-ln" style="width:35%;height:10px"></div></div></div>' : "");
    lines.forEach(function (w, i) { h += '<div class="uq-ln" style="width:' + w + '%' + (i === 0 && !avatar ? ';height:16px' : '') + '"></div>'; });
    return h + "</div>";
  }
  var body = kind === "top" ? card([92, 80, 60], 1) + card([88, 70], 1) + card([90, 50], 1) : card([45, 90, 70]) + card([60, 85, 40]) + card([50, 75]);
  app.innerHTML = '<div id="uhld"><div class="uq-hd"><div class="uq-lg"><img src="icon-192.png" alt=""><div><b>' + C[2] + " " + C[3] + "</b><small>Умари Хайём</small></div></div></div><div class='uq-mn'>" +
    '<div class="uq-tip"><small>Знаете ли вы?</small>' + tip + "</div>" + body + '<div class="uq-msg" id="uhldm"><span class="uq-dots"><i></i><i></i><i></i></span></div></div></div>';
  setTimeout(function () { var m = document.getElementById("uhldm"); if (m) m.innerHTML = '<span class="uq-dots"><i></i><i></i><i></i></span><br>Сервер просыпается, ещё пару секунд…'; }, 6000);
  setTimeout(function () { var m = document.getElementById("uhldm"); if (m) m.innerHTML = "Долго нет ответа. Проверьте интернет.<br><button onclick=\"location.reload()\">🔄 Повторить</button>"; }, 20000);
})();
