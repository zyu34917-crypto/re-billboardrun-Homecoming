// ============================================================
//  viewport-fit.js — 讓 #viewport 永遠維持 1206:2622 的設計比例
//  (比例對不上螢幕時，上下或左右自動出現黑邊，不裁切、不變形)
//
//  另外處理新版主選單 (#menu-layer) 的響應式行為：
//  - 螢幕比 16:9(2880:1620) 更寬 → CSS 已用青色色塊補滿兩側
//  - 螢幕比 16:9 更窄（更瘦長）→ CSS 已用等高裁切左右
//  - menu-hero.png 隨螢幕變窄往左位移，最多 424px(設計稿基準)，
//    在畫面比例到達 9:16 時封頂，由這裡計算並寫入 CSS 變數 --menu-hero-shift
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

  // 🎯 主選單 hero 位移計算
  var MENU_DESIGN_ASPECT = 2880 / 1620;      // 16:9 ≈ 1.7778，此比例(含更寬)時位移為 0
  var MENU_MIN_ASPECT = 9 / 16;              // 0.5625，此比例(含更窄)時位移封頂
  var MENU_MAX_SHIFT_VH = 424 * (100 / 1620); // 424px(設計稿基準) 換算成 vh ≈ 26.173vh

  function fitMenuHero() {
    var aspect = window.innerWidth / window.innerHeight;
    var t = (MENU_DESIGN_ASPECT - aspect) / (MENU_DESIGN_ASPECT - MENU_MIN_ASPECT);
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    var shiftVh = -(MENU_MAX_SHIFT_VH * t);
    document.documentElement.style.setProperty('--menu-hero-shift', shiftVh + 'vh');
  }

  function fitAll() {
    fitViewport();
    fitMenuHero();
  }

  window.addEventListener('resize', fitAll);
  window.addEventListener('orientationchange', fitAll);

  // 此 script 標籤放在 #viewport 之後，DOM 已存在，可直接執行
  fitAll();
})();
