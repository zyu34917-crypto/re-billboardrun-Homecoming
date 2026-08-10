// ============================================================
//  viewport-fit.js — 讓 #viewport 永遠維持 1206:2622 的設計比例
//  (比例對不上螢幕時，上下或左右自動出現黑邊，不裁切、不變形)
// ============================================================
(function () {
  var RATIO_W = 1206;
  var RATIO_H = 2622;

  function fitViewport() {
    var vp = document.getElementById('viewport');
    if (!vp) return;

    var ww = window.innerWidth;
    var wh = window.innerHeight;
    var targetW, targetH;

    if (ww / wh > RATIO_W / RATIO_H) {
      // 螢幕比設計還「寬」→ 用高度撐滿，寬度自動置中留黑邊
      targetH = wh;
      targetW = wh * (RATIO_W / RATIO_H);
    } else {
      // 螢幕比設計還「窄長」→ 用寬度撐滿，高度自動置中留黑邊
      targetW = ww;
      targetH = ww * (RATIO_H / RATIO_W);
    }

    vp.style.width = targetW + 'px';
    vp.style.height = targetH + 'px';
  }

  window.addEventListener('resize', fitViewport);
  window.addEventListener('orientationchange', fitViewport);

  // 此 script 標籤放在 #viewport 之後，DOM 已存在，可直接執行
  fitViewport();
})();
