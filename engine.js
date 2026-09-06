// ============================================================
//  BILLBOARD RUN — 核心引擎 (整合上傳 + 畫板 + 最終鑲嵌版)
// ============================================================

let pageIndex = 0;
let currentPages = [];
let historyStack = []; 
const state = { 
  current: "start", 
  branch: null, 
  route: null,   // 🎯 記錄玩家走的路線 (diner / pray / cactus)
  userArt: null  // 存放玩家創作或上傳的 Base64 圖片
};
let typer = { full: "", false: false, timer: null, el: null, pos: 0 };
let isMenuOpen = false; 

// ── ▶️ AUTO 自動播放 ──
let autoPlay = false;
let autoPlayTimer = null;
function stopAutoPlay() {
  autoPlay = false;
  if (autoPlayTimer) { clearTimeout(autoPlayTimer); autoPlayTimer = null; }
  const autoBtn = document.querySelector('.bb-auto');
  if (autoBtn) autoBtn.classList.remove('active');
}
function autoPlayTick() {
  if (!autoPlay) return;
  if (!typer.done) { autoPlayTimer = setTimeout(autoPlayTick, 200); return; }
  const card = document.getElementById('scene-card');
  // 用「合成點擊」觸發目前綁定的 card.onclick，這樣邏輯永遠吃到最新場景的狀態，不會有殘留的舊場景閉包
  if (card) card.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  if (autoPlay) autoPlayTimer = setTimeout(autoPlayTick, 1200);
}
function startAutoPlay() {
  stopSkip();
  autoPlay = true;
  const autoBtn = document.querySelector('.bb-auto');
  if (autoBtn) autoBtn.classList.add('active');
  autoPlayTick();
}

// ── ⏩ SKIP 快進到選項處（途中每個 deathChance 場景一樣照 1/2 機率判定，不會跳過死亡）──
let skipTimer = null;
function stopSkip() {
  if (skipTimer) { clearTimeout(skipTimer); skipTimer = null; }
  const skipBtn = document.querySelector('.bb-skip');
  if (skipBtn) skipBtn.classList.remove('active');
}
function skipToChoice() {
  stopSkip();
  stopAutoPlay();
  const skipBtn = document.querySelector('.bb-skip');
  if (skipBtn) skipBtn.classList.add('active');
  let guard = 0;
  function step() {
    if (guard++ > 800) { stopSkip(); return; } // 安全防呆，避免萬一卡住無限跑下去
    // 🎯 每個場景都是重新 render 出來的，SKIP 按鈕也是新的元素，要每次都重新套用 active 樣式
    const curSkipBtn = document.querySelector('.bb-skip');
    if (curSkipBtn) curSkipBtn.classList.add('active');
    const dOvl = document.getElementById('death-overlay');
    if (dOvl && dOvl.style.display === 'flex') { stopSkip(); return; } // 死亡畫面出現了，停止快進
    const choicesEl = document.querySelector('.choices-wrap');
    if (choicesEl && choicesEl.style.display === 'flex') { stopSkip(); return; } // 選項已經show出來了，停止快進
    const fullLayer = document.getElementById('full-image-layer');
    if (fullLayer && fullLayer.style.display === 'flex') {
      // 🎯 全螢幕過場圖用的是自己的 onclick，不是 #scene-card，要點它本人
      fullLayer.click();
      skipTimer = setTimeout(step, 80);
      return;
    }
    if (!typer.done) finishTyping();
    const card = document.getElementById('scene-card');
    if (card) card.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    skipTimer = setTimeout(step, 80);
  }
  step();
}

// ── 🟡 黃色塊轉場特效 ──
let lastTransitionAt = 0;
function performTransition(onMidpoint) {
  const overlay = document.getElementById('transition-overlay');
  if (!overlay) { if(onMidpoint) onMidpoint(); return; }
  const now = Date.now();
  // 🎯 400ms 內的重複觸發視為連續誤觸，直接忽略，避免轉場動畫重來
  if (now - lastTransitionAt < 400) return;
  lastTransitionAt = now;
  overlay.classList.remove('slide-active');
  void overlay.offsetWidth; 
  overlay.classList.add('slide-active');
  setTimeout(onMidpoint, 600); 
}

// ── 💀 死亡全屏處理 ──
function triggerDeathScreen(imageSrc) {
  const deathOverlay = document.getElementById('death-overlay');
  if (!deathOverlay) return;
  const gameRootEl = document.getElementById('game-root');
  if (gameRootEl) gameRootEl.style.display = 'none'; // 🎯 game-root 是 position:fixed 蓋滿全螢幕，不隱藏的話會在死亡畫面兩側露出自己的底色
  document.body.style.background = "#000 url('images/death_desktop.png') center / cover no-repeat"; // 🎯 死亡畫面外的空隙用 death_desktop.png，跟其他頁面共用的 bg-dots-desktop.png 不同
  deathOverlay.innerHTML = '';
  // 🎯 最底層：death_desktop.png 當背景，滿版鋪滿，避免手機尺寸的結局圖蓋不滿螢幕時露出黑色瀏覽器底色
  const bgDesktop = document.createElement('img');
  bgDesktop.src = 'images/death_desktop.png';
  Object.assign(bgDesktop.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'cover', display: 'block', zIndex: '0' });
  deathOverlay.appendChild(bgDesktop);
  // 🎯 上層：對應這個結局的手機尺寸圖，用 contain 完整顯示不裁切，蓋不到的地方會露出底下的 death_desktop.png
  const bgImg = document.createElement('img');
  bgImg.src = imageSrc;
  Object.assign(bgImg.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'contain', display: 'block', zIndex: '1' });
  deathOverlay.appendChild(bgImg);
  const restartBtn = document.createElement('img');
  restartBtn.id = 'death-restart-btn';
  restartBtn.src = 'images/death_btn.png';
  restartBtn.onclick = (ev) => { ev.stopPropagation(); location.reload(); };
  deathOverlay.appendChild(restartBtn);
  deathOverlay.style.display = 'flex';
  deathOverlay.style.opacity = '1';
}

// ── 打字機邏輯 ──
function startTyping(text, el, onDone) {
  if (!el) return;
  typer.full = text; typer.el = el; typer.pos = 0; typer.done = false;
  if (typer.timer) clearTimeout(typer.timer);
  function tick() {
    if (typer.pos >= typer.full.length) { finishTyping(onDone); return; }
    typer.pos++;
    el.innerHTML = typer.full.slice(0, typer.pos).replace(/\n/g,'<br>') + '<span class="cursor"></span>';
    const delay = /[。，、！？\n…]/.test(typer.full[typer.pos-1]) ? 60 : 25;
    typer.timer = setTimeout(tick, delay);
  }
  tick();
}

function finishTyping(onDone) {
  if (typer.timer) clearTimeout(typer.timer);
  typer.done = true;
  if (typer.el) typer.el.innerHTML = typer.full.replace(/\n/g,'<br>');
  if (onDone) onDone();
}

// ── 紀錄與選單 ──
function saveToHistory() {
  historyStack.push({ sceneId: state.current, pageIndex: pageIndex, branch: state.branch, route: state.route });
}
function toggleNavMenu() { isMenuOpen = !isMenuOpen; updateMenuUI(); }
function updateMenuUI() {
  const menu = document.getElementById('dropdown-nav');
  const menuArt = document.getElementById('dropdown-nav-art');
  if (menu) menu.style.display = isMenuOpen ? 'flex' : 'none';
  if (menuArt) menuArt.style.display = isMenuOpen ? 'flex' : 'none';
}
function goBack() {
  if (historyStack.length === 0) return;
  const prevState = historyStack.pop();
  state.branch = prevState.branch;
  state.route = prevState.route;
  if (typer.timer) clearTimeout(typer.timer);
  render(prevState.sceneId, prevState.pageIndex, true); 
  isMenuOpen = false; updateMenuUI();
}
// ============================================================
// 🎯 地標詳情頁（地圖 b1/b2/b3 點進去的畫面）
// ============================================================
function pxvh(n) { return (n * 100 / 1620).toFixed(3) + 'vh'; }

const LANDMARK_PIN_SVG = (color) => `<svg viewBox="0 0 154 271" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M77 2.5C118.168 2.5 151.5 35.9767 151.5 77.2197L151.492 78.1982C151.338 88.3603 148.807 100.062 144.91 112.739C140.863 125.904 135.187 140.599 128.657 156.398C115.492 188.25 98.9434 224.428 84.0098 263.668C82.9064 266.567 80.1314 268.488 77.0293 268.5C73.9276 268.512 71.138 266.613 70.0117 263.723C54.673 224.356 38.1861 188.337 25.0684 156.381C18.5796 140.573 12.9719 125.877 8.98145 112.711C5.0139 99.6203 2.50006 87.5873 2.5 77.2197C2.5 35.9767 35.8315 2.5 77 2.5ZM77 49.5C60.1553 49.5 46.5 63.1553 46.5 80C46.5 96.8447 60.1553 110.5 77 110.5C93.8447 110.5 107.5 96.8447 107.5 80C107.5 63.1553 93.8447 49.5 77 49.5Z" fill="${color}" stroke="black" stroke-width="5" stroke-linejoin="round"/></svg>`;

const LANDMARK_CONFIGS = {
  home: {
    bg: '#0EE5F8',
    rects: [
      { l: 188, t: 0, w: 48, h: 1620, color: '#E0E0E0' },
      { l: 912, t: 0, w: 48, h: 1620, color: '#E0E0E0' },
      { l: 1748, t: 0, w: 48, h: 1620, color: '#E0E0E0' },
      { l: 2476, t: 0, w: 48, h: 1620, color: '#E0E0E0' },
      { l: 0, t: 956, w: 2880, h: 104, color: '#E0E0E0' },
    ],
    texts: [
      { l: 1135, t: 993, text: 'THIS ROAD 1', color: '#A9B9C0', size: 24, ls: '36.96px' },
    ],
    landmarks: [
      { l: 1019, t: 602, w: 144, h: 261, color: '#FE971A',
        name: 'HOME', nameL: 1173, nameT: 630, nameSize: 64,
        sub: 'PLEASE <br>PICK ME!', subL: 1175, subT: 710, subSize: 24, room: 'images/map/HOME/index.html' },
    ]
  },
  printer: {
    bg: '#CDB592',
    rects: [
      { l: 0, t: 730, w: 2880, h: 104, color: '#5D737C' },
    ],
    texts: [
      { l: 1135, t: 758, text: 'RUST HIGHWAY', color: '#A9B9C0', size: 24, ls: '36.96px' },
    ],
    landmarks: [
      { l: 1172, t: 1143, w: 144, h: 261, color: '#65AD9B',
        name: 'PRINTER', nameL: 1326, nameT: 1171, nameSize: 64,
        sub: 'PLEASE <br>PICK ME!', subL: 1328, subT: 1251, subSize: 24, room: 'images/map/PRINT/index.html' },
    ]
  },
  dust: {
    bg: '#9D9FAB',
    rects: [
      { l: 0, t: 266, w: 2880, h: 104, color: '#596469' },
      { l: 1282, t: 309, w: 28, h: 1142, color: '#596469' },
      { l: 1704, t: 323, w: 28, h: 1366, color: '#596469' },
      { l: 1714.44, t: 891, w: 28, h: 285.25, color: '#596469', rotate: 51 },
      { l: 949, t: 817, w: 28, h: 690, color: '#596469' },
      { l: 743, t: 810, w: 1441, h: 31, color: '#596469' },
      { l: 743, t: 1188, w: 986, h: 31, color: '#596469' },
      { l: 689, t: 551, w: 621, h: 31, color: '#596469' },
    ],
    texts: [
      { l: 1135, t: 294, text: 'DUST HIGHWAY', color: '#A9B9C0', size: 24, ls: '36.96px' },
    ],
    landmarks: [
      { l: 1084, t: 1171, w: 144, h: 261, color: '#C71E1E',
        name: "PALM'S DINER", nameL: 1238, nameT: 1199, nameSize: 64,
        sub: 'PLEASE <br>PICK ME!', subL: 1240, subT: 1279, subSize: 24, room: 'images/map/DINNE/index.html' },
      { l: 1324, t: 462, w: 144, h: 261, color: '#708D3D',
        name: "Dust Town <br>Sheriff's Office", nameL: 1478, nameT: 462, nameSize: 64,
        sub: 'PLEASE <br>PICK ME!', subL: 1480, subT: 618, subSize: 24, room: 'images/map/POLICE/index.html' },
    ]
  }
};

function renderLandmarkScreen(key) {
  const cfg = LANDMARK_CONFIGS[key];
  const canvas = document.getElementById('landmark-canvas');
  const hud = document.getElementById('landmark-hud');
  if (!cfg || !canvas || !hud) return;

  let html = `<div class="lm-bg" style="background:${cfg.bg};"></div>
    <img class="lm-grid" src="images/map/gridline.svg" alt="">`;

  cfg.rects.forEach(r => {
    const rot = r.rotate ? `transform: rotate(${r.rotate}deg); transform-origin: top left;` : '';
    html += `<div class="lm-rect" style="left:${pxvh(r.l)};top:${pxvh(r.t)};width:${pxvh(r.w)};height:${pxvh(r.h)};background:${r.color};${rot}"></div>`;
  });
  cfg.texts.forEach(t => {
    html += `<div class="lm-text" style="left:${pxvh(t.l)};top:${pxvh(t.t)};color:${t.color};font-size:${pxvh(t.size)};letter-spacing:${t.ls};">${t.text}</div>`;
  });
  cfg.landmarks.forEach((lm, i) => {
    const clickable = lm.room ? `class="lm-pin lm-pin-clickable" data-room="${lm.room}"` : `class="lm-pin"`;
    html += `<div ${clickable} style="left:${pxvh(lm.l)};top:${pxvh(lm.t)};width:${pxvh(lm.w)};height:${pxvh(lm.h)};">${LANDMARK_PIN_SVG(lm.color)}</div>
      <div class="lm-text" style="left:${pxvh(lm.nameL)};top:${pxvh(lm.nameT)};color:black;font-size:${pxvh(lm.nameSize)};">${lm.name}</div>
      <div class="lm-text" style="left:${pxvh(lm.subL)};top:${pxvh(lm.subT)};color:black;font-size:${pxvh(lm.subSize)};">${lm.sub}</div>`;
  });

  html += `<img class="lm-position" src="images/map/position.svg" alt="">`;

  canvas.innerHTML = html;

  // 🎯 HUD：釘死在真實螢幕角落，不受地圖裁切影響（跟地圖那頁的 #map-hud 同一套做法）
  hud.innerHTML = `
    <div class="lm-scale-wrap">
      <img src="images/map/scale.svg" alt="">
      <div class="lm-text" style="left:0;top:0;">0</div>
      <div class="lm-text" style="left:${pxvh(118)};top:0;">250</div>
      <div class="lm-text" style="left:${pxvh(255)};top:0;">500</div>
      <div class="lm-text" style="left:${pxvh(301)};top:${pxvh(43)};">KM</div>
    </div>
    <img class="lm-magnifier" src="images/map/magnifier.svg" alt="">

    <div class="lm-menu-btn" id="lm-menu-btn">
      <div class="lm-menu-bar"></div>
      <div class="lm-menu-icon-wrap">
        <svg viewBox="0 0 62 67" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3.50003 3.5H58.5M3.5 34.3572H58.5M3.5 63.5H58.5" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="lm-menu-text-goback" id="lm-goback">GO BACK</div>
      <div class="lm-menu-text-tomenu" id="lm-tomenu">BACK TO MENU</div>
    </div>
  `;

  // 🎯 可進入的地標：點下去用 iframe 載入對應的房間場景
  canvas.querySelectorAll('.lm-pin-clickable').forEach(pin => {
    pin.style.pointerEvents = 'auto';
    pin.style.cursor = 'pointer';
    pin.onclick = (ev) => {
      ev.stopPropagation();
      const room = pin.dataset.room;
      const roomLayer = document.getElementById('room-layer');
      const roomIframe = document.getElementById('room-iframe');
      performTransition(() => {
        roomIframe.src = room;
        roomLayer.style.display = 'block';
      });
    };
  });

  const menuBtn = hud.querySelector('#lm-menu-btn');
  const gobackBtn = hud.querySelector('#lm-goback');
  const tomenuBtn = hud.querySelector('#lm-tomenu');
  if (menuBtn) menuBtn.onclick = (ev) => {
    ev.stopPropagation();
    if (!menuBtn.classList.contains('expanded')) menuBtn.classList.add('expanded');
  };
  if (gobackBtn) gobackBtn.onclick = (ev) => {
    ev.stopPropagation();
    performTransition(() => {
      document.getElementById('landmark-layer').style.display = 'none';
      document.getElementById('map-layer').style.display = 'block';
    });
  };
  if (tomenuBtn) tomenuBtn.onclick = (ev) => {
    ev.stopPropagation();
    performTransition(() => {
      document.getElementById('landmark-layer').style.display = 'none';
      document.getElementById('menu-layer').style.display = 'block';
    });
  };
}

function quitToMenu() {
  const gameRoot = document.getElementById('game-root');
  const menuLayer = document.getElementById('menu-layer');
  performTransition(() => {
    gameRoot.style.display = 'none'; menuLayer.style.display = 'block';
    historyStack = []; isMenuOpen = false;
    const dOvl = document.getElementById('death-overlay');
    if(dOvl) { dOvl.style.display = 'none'; dOvl.style.opacity = '0'; }
    const artL = document.getElementById('art-board-layer');
    if(artL) artL.style.display = 'none';
    const resL = document.getElementById('final-result-layer');
    if(resL) resL.style.display = 'none';
    const mapL = document.getElementById('map-layer');
    if(mapL) mapL.style.display = 'none';
    const lmL = document.getElementById('landmark-layer');
    if(lmL) lmL.style.display = 'none';
    const abL = document.getElementById('about-layer');
    if(abL) abL.style.display = 'none';
    const roomL = document.getElementById('room-layer');
    if(roomL) { roomL.style.display = 'none'; const ri = document.getElementById('room-iframe'); if(ri) ri.src = ''; }
  });
}

// ── 渲染場景 ──
function render(sceneId, targetPageIndex = 0, isBack = false) {
  const scene = STORY[sceneId];
  if (!scene) return;
  const gameRoot = document.getElementById('game-root');
  const fullLayer = document.getElementById('full-image-layer');
  const fullImg = document.getElementById('full-image-content');
  const card = document.getElementById('scene-card');
  state.current = sceneId;

  // 🎯 處理畫板介面
  if (scene.type === "art-board") {
    const handleArtBoard = () => {
      gameRoot.style.display = 'none'; fullLayer.style.display = 'none';
      renderArtBoard(scene);
    };
    if (isBack) handleArtBoard(); else performTransition(handleArtBoard);
    return;
  }

  // 🎯 處理直接返回主頁（無畫面）的場景
  if (scene.type === "quit-menu") {
    quitToMenu();
    return;
  }

  // 🎯 處理上傳介面
  if (scene.type === "upload-board") {
    const handleUpload = () => {
      gameRoot.style.display = 'none'; fullLayer.style.display = 'none';
      renderUploadBoard();
    };
    if (isBack) handleUpload(); else performTransition(handleUpload);
    return;
  }

  if (scene.type === "full-screen") {
    const handleFullLayer = () => {
      gameRoot.style.display = 'none'; fullLayer.style.display = 'flex';
      fullImg.src = scene.image;
      fullLayer.onclick = () => { saveToHistory(); fullLayer.onclick = null; fullLayer.style.display = 'none'; render(scene.next); };
    };
    if (isBack) handleFullLayer(); else performTransition(handleFullLayer);
    return; 
  }

  gameRoot.style.display = 'flex';
  fullLayer.style.display = 'none';
  let bodyText = scene.body || "";
  if (typeof scene.onEnter === 'function') bodyText = scene.onEnter();
  currentPages = bodyText.split('\n');
  pageIndex = targetPageIndex;
  card.innerHTML = buildSceneHTML(scene);
  card.scrollTop = 0;
  updateMenuUI();

  const textEl = card.querySelector('.story-text');
  const choicesEl = card.querySelector('.choices-wrap');
  const nameplateEl = card.querySelector('.story-nameplate');
  const isMulti = scene.choices && scene.choices.length > 1;

  // 🎯 人物名字牌：該頁文字開頭有 *名字「對話」標記才顯示，並把標記從顯示文字中拿掉
  function parseSpeaker(pageText) {
    const text = pageText || '';
    const m = text.match(/^\*+([^\s「]+)「/);
    if (m) return { speaker: m[1], displayText: text.slice(m[0].length - 1) }; // 保留「開頭，只拿掉 *名字
    return { speaker: null, displayText: text };
  }
  function updateNameplate(pageText) {
    const { speaker, displayText } = parseSpeaker(pageText);
    if (nameplateEl) {
      nameplateEl.style.display = speaker ? 'block' : 'none';
      const nameTextEl = nameplateEl.querySelector('.story-nameplate-text');
      if (nameTextEl) nameTextEl.textContent = speaker || '';
    }
    return displayText;
  }
  startTyping(updateNameplate(currentPages[pageIndex]), textEl);
  if (pageIndex === currentPages.length - 1 && isMulti && choicesEl) choicesEl.style.display = 'flex';

  // 🎯 如果一進來就是選項場景（例如 AUTO 播到這），直接停止自動播放
  if (isMulti) stopAutoPlay();

  card.onclick = (e) => {
    if (e.target.closest('.choice-btn') || e.target.closest('.story-menu-btn') || e.target.closest('.bb-btn')) return;
    if (isMenuOpen) { toggleNavMenu(); return; }
    if (e.isTrusted) { stopAutoPlay(); stopSkip(); } // 玩家真的手動點擊才取消自動播放/快進，合成的點擊不會取消自己
    if (!typer.done) { finishTyping(); return; }
    if (pageIndex < currentPages.length - 1) {
      saveToHistory(); pageIndex++;
      startTyping(updateNameplate(currentPages[pageIndex]), textEl); return;
    }
    if (sceneId.includes('dead_end') || sceneId.includes('death')) {
      stopAutoPlay();
      let dSrc = "images/death_1.png";
      if (sceneId === "dead_end_2") dSrc = "images/death_2.png";
      if (sceneId === "dead_end_3") dSrc = "images/death_3.png";
      performTransition(() => triggerDeathScreen(dSrc)); return;
    }
    if (isMulti && choicesEl && choicesEl.style.display === 'none') {
      saveToHistory(); choicesEl.style.display = 'flex';
      stopAutoPlay(); // 播到選項就停下來
      return;
    }
    if (!isMulti && scene.next) {
      saveToHistory();
      let nextT = scene.next;
      // 🎯 死亡機率改成 1/2
      if (scene.deathChance && Math.random() < 1/2) {
        nextT = (scene.deathTarget && scene.deathTarget !== "dead_end_check") ? scene.deathTarget : (state.branch === "A" ? "dead_end_1" : "dead_end_2");
      } else if (scene.routeNext && state.route && scene.routeNext[state.route]) {
        // 🎯 依照玩家路線 (diner / pray / cactus) 決定分支去向
        nextT = scene.routeNext[state.route];
      }
      render(nextT);
    }
  };
  if (choicesEl) {
    choicesEl.querySelectorAll('[data-next]').forEach(btn => {
      btn.onclick = (ev) => { 
        ev.stopPropagation(); 
        saveToHistory(); 
        if (btn.dataset.branch) state.branch = btn.dataset.branch; 
        render(btn.dataset.next); 
      };
    });
  }

  // 🎯 底部控制列：BACK（回上一幕）／AUTO（自動播放到選項為止）／SKIP（跳到本幕選項處）
  const backBtn = card.querySelector('.bb-back');
  const autoBtn = card.querySelector('.bb-auto');
  const skipBtn = card.querySelector('.bb-skip');
  if (backBtn) backBtn.onclick = (ev) => { ev.stopPropagation(); stopAutoPlay(); stopSkip(); goBack(); };
  if (autoBtn) autoBtn.onclick = (ev) => { ev.stopPropagation(); stopSkip(); if (autoPlay) stopAutoPlay(); else startAutoPlay(); };
  if (skipBtn) skipBtn.onclick = (ev) => {
    ev.stopPropagation();
    stopAutoPlay();
    skipToChoice();
  };

  // 🎯 右上角展開式選單按鈕（跟地圖那顆一樣：先點展開，再點一次才真的返回主選單）
  const storyMenuBtn = card.querySelector('#story-menu-btn');
  if (storyMenuBtn) {
    storyMenuBtn.onclick = (ev) => {
      ev.stopPropagation();
      if (!storyMenuBtn.classList.contains('expanded')) { storyMenuBtn.classList.add('expanded'); return; }
      stopAutoPlay();
      quitToMenu();
    };
  }
}

function buildSceneHTML(scene) {
  const isMulti = scene.choices && scene.choices.length > 1;
  let monthPart = "6", dayPart = "1";
  if (scene.day && scene.day.includes('/')) {
    const pts = scene.day.split('/'); monthPart = pts[0]; dayPart = pts[1];
  }
  const hasImage = scene.image && scene.image.length > 7;
  return `
    <img class="story-blood-l" src="images/menu/Blood_l.svg" alt="">
    <img class="story-blood-r" src="images/menu/Blood_r.svg" alt="">

    <div class="story-swatches story-swatches-top">
      <div class="story-swatch story-swatch-1"></div><div class="story-swatch story-swatch-2"></div>
      <div class="story-swatch story-swatch-3"></div><div class="story-swatch story-swatch-4"></div>
      <div class="story-swatch story-swatch-5"></div>
    </div>
    <div class="story-swatches story-swatches-bottom">
      <div class="story-swatch story-swatch-1"></div><div class="story-swatch story-swatch-2"></div>
      <div class="story-swatch story-swatch-3"></div><div class="story-swatch story-swatch-4"></div>
      <div class="story-swatch story-swatch-5"></div>
    </div>

    <div class="story-badge-rect story-badge-14"></div>
    <div class="story-badge-rect story-badge-13"></div>
    <div class="story-badge-rect story-badge-15"></div>
    <div class="story-badge-day">DAY</div>
    <div class="story-badge-month">${monthPart}</div>
    <div class="story-badge-line"></div>
    <div class="story-badge-daynum">${dayPart}</div>

    <div class="story-image-wrap">${hasImage ? `<img src="${scene.image}" onerror="this.style.display='none';">` : ''}</div>

    <div class="story-nameplate" style="display:none;">
      <img class="story-nameplate-bg" src="images/menu/name_space.svg" alt="">
      <div class="story-nameplate-text"></div>
    </div>

    <div class="story-panel-behind"></div>
    <div class="story-panel-main"></div>
    <div class="story-text"></div>

    ${isMulti ? `<div class="choices-wrap" style="display:none;">${scene.choices.map((c, i) => `<button class="choice-btn" data-next="${c.next}" data-branch="${c.branch || ''}"><span class="choice-key">0${i+1}</span><span class="choice-text">${c.label}</span></button>`).join('')}</div>` : `<div class="tap-hint">T A P &nbsp; T O &nbsp; C O N T I N U E</div>`}

    <div class="story-bottombar">
      <img src="images/menu/Group_9.svg" alt="">
      <div class="bb-btn bb-back">BACK</div>
      <div class="bb-btn bb-auto">AUTO</div>
      <div class="bb-btn bb-skip">SKIP</div>
    </div>

    <div class="story-menu-btn" id="story-menu-btn">
      <div class="story-menu-bar"></div>
      <div class="story-menu-icon-wrap">
        <svg viewBox="0 0 62 67" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3.50003 3.5H58.5M3.5 34.3572H58.5M3.5 63.5H58.5" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="story-menu-text">BACK TO MENU</div>
    </div>
  `;
}

// ── 🎨 Art Board 核心邏輯 ──
function renderArtBoard(scene) {
  const artLayer = document.getElementById('art-board-layer');
  const canvas = document.getElementById('art-canvas');
  const ctx = canvas.getContext('2d');
  artLayer.style.display = 'block';

  const sliderC = document.getElementById('slider-c');
  const sliderM = document.getElementById('slider-m');
  const sliderY = document.getElementById('slider-y');
  const sliderOpa = document.getElementById('slider-opa');
  const colorPreview = document.getElementById('art-color-preview');
  const toolBtns = document.querySelectorAll('.art-tool-btn');
  const doneBtn = document.getElementById('art-done-btn');
  const xformBar = document.getElementById('art-xform-overlay');
  const textModal = document.getElementById('art-text-modal');
  const textInput = document.getElementById('art-text-input');
  const textConfirm = document.getElementById('art-text-confirm');

  let shapes = [];
  let selectedIdx = null;
  let currentTool = 'rect';
  let isDragging = false, isResizing = false;
  let dragMode = '', startX, startY, pendingTextPos = null;

  let canvasCssW = 0, canvasCssH = 0; // 🎯 邏輯座標用的寬高(CSS px)，跟畫布內部實際解析度分開算
  function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvasCssW = rect.width; canvasCssH = rect.height;
    // 🎯 內部畫布解析度依裝置像素比放大，避免高解析度螢幕(Retina等)畫面模糊
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // 讓後續繪圖座標維持原本的 CSS px 邏輯座標，不用改任何畫圖數字
    drawAll();
  }
  setTimeout(resizeCanvas, 100);

  function cmyToRgb(c, m, y) {
    return { r: Math.round(255*(1-c/255)), g: Math.round(255*(1-m/255)), b: Math.round(255*(1-y/255)) };
  }
  function updatePreview() {
    const {r,g,b} = cmyToRgb(+sliderC.value, +sliderM.value, +sliderY.value);
    colorPreview.style.backgroundColor = `rgb(${r},${g},${b})`;
    colorPreview.style.opacity = sliderOpa.value / 100;
  }
  [sliderC, sliderM, sliderY, sliderOpa].forEach(s => s.oninput = updatePreview);
  updatePreview();

  toolBtns.forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      toolBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTool = btn.dataset.tool;
      selectedIdx = null; xformBar.style.display = 'none'; drawAll();
    };
  });

  function drawShape(s, isSelected) {
    ctx.save();
    ctx.globalAlpha = s.opacity;
    ctx.fillStyle = s.color;
    ctx.translate(s.x, s.y);
    ctx.rotate(s.angle || 0);

    if (s.type === 'rect') { ctx.fillRect(-s.w/2, -s.h/2, s.w, s.h); }
    else if (s.type === 'circle') { ctx.beginPath(); ctx.ellipse(0, 0, s.w/2, s.h/2, 0, 0, Math.PI*2); ctx.fill(); }
    else if (s.type === 'triangle') { ctx.beginPath(); ctx.moveTo(0, -s.h/2); ctx.lineTo(s.w/2, s.h/2); ctx.lineTo(-s.w/2, s.h/2); ctx.closePath(); ctx.fill(); }
    else if (s.type === 'text') {
      const baseFontSize = 100; ctx.font = `bold ${baseFontSize}px 'Bebas Neue'`;
      const textWidth = ctx.measureText(s.text).width;
      ctx.scale(s.w / textWidth, s.h / baseFontSize);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(s.text, 0, 0);
    }
    if (isSelected) {
      ctx.globalAlpha = 1; ctx.strokeStyle = '#09d8eb'; ctx.lineWidth = 2;
      const pad = 10, hw = s.w/2 + pad, hh = s.h/2 + pad, L = 15;
      ctx.beginPath();
      ctx.moveTo(-hw, -hh+L); ctx.lineTo(-hw, -hh); ctx.lineTo(-hw+L, -hh);
      ctx.moveTo(hw-L, -hh); ctx.lineTo(hw, -hh); ctx.lineTo(hw, -hh+L);
      ctx.moveTo(hw, hh-L); ctx.lineTo(hw, hh); ctx.lineTo(hw-L, hh);
      ctx.moveTo(-hw+L, hh); ctx.lineTo(-hw, hh); ctx.lineTo(-hw, hh-L);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawAll() {
    ctx.clearRect(0, 0, canvasCssW, canvasCssH);
    shapes.forEach((s, idx) => drawShape(s, idx === selectedIdx));
  }

  canvas.onmousedown = (e) => {
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    if (selectedIdx !== null) {
      const s = shapes[selectedIdx];
      const pad = 15, hw = s.w/2 + pad, hh = s.h/2 + pad;
      if (Math.abs(mx - (s.x - hw)) < 25 && Math.abs(my - (s.y - hh)) < 25) { isResizing = true; dragMode = 'tl'; }
      else if (Math.abs(mx - (s.x + hw)) < 25 && Math.abs(my - (s.y - hh)) < 25) { isResizing = true; dragMode = 'tr'; }
      else if (Math.abs(mx - (s.x + hw)) < 25 && Math.abs(my - (s.y + hh)) < 25) { isResizing = true; dragMode = 'br'; }
      else if (Math.abs(mx - (s.x - hw)) < 25 && Math.abs(my - (s.y + hh)) < 25) { isResizing = true; dragMode = 'bl'; }
      else if (Math.abs(mx - s.x) < s.w/2 && Math.abs(my - s.y) < s.h/2) { isDragging = true; dragMode = 'move'; }
      else { selectedIdx = null; xformBar.style.display = 'none'; drawAll(); }
      if (isDragging || isResizing) { startX = mx; startY = my; return; }
    }
    const {r:rv,g:gv,b:bv} = cmyToRgb(+sliderC.value, +sliderM.value, +sliderY.value);
    const col = `rgb(${rv},${gv},${bv})`, opa = sliderOpa.value / 100, baseSize = canvasCssW * 0.15;
    if (currentTool === 'text') {
      pendingTextPos = { x: mx, y: my, col, opa, baseSize };
      textModal.style.display = 'flex'; textInput.focus(); return;
    }
    shapes.push({ type: currentTool, x: mx, y: my, w: baseSize, h: baseSize, color: col, opacity: opa, angle: 0 });
    selectedIdx = shapes.length - 1; xformBar.style.display = 'flex'; drawAll();
  };

  window.onmousemove = (e) => {
    if (selectedIdx === null || (!isDragging && !isResizing)) return;
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top, s = shapes[selectedIdx];
    if (dragMode === 'move') { s.x += (mx - startX); s.y += (my - startY); }
    else {
      if (dragMode.includes('r')) s.w += (mx - startX) * 2;
      if (dragMode.includes('l')) s.w -= (mx - startX) * 2;
      if (dragMode.includes('b')) s.h += (my - startY) * 2;
      if (dragMode.includes('t')) s.h -= (my - startY) * 2;
      s.w = Math.max(10, s.w); s.h = Math.max(10, s.h);
    }
    startX = mx; startY = my; drawAll();
  };
  window.onmouseup = () => { isDragging = false; isResizing = false; };

  // ── 📱 Touch 事件支援（手機拖移與縮放）──
  function getTouchPos(e) {
    const r = canvas.getBoundingClientRect();
    const t = e.touches[0];
    return { mx: t.clientX - r.left, my: t.clientY - r.top };
  }

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const { mx, my } = getTouchPos(e);
    // 模擬 mousedown：直接觸發相同邏輯
    const fakeEvent = { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
    canvas.onmousedown(fakeEvent);
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (selectedIdx === null || (!isDragging && !isResizing)) return;
    const { mx, my } = getTouchPos(e);
    const s = shapes[selectedIdx];
    if (dragMode === 'move') { s.x += (mx - startX); s.y += (my - startY); }
    else {
      if (dragMode.includes('r')) s.w += (mx - startX) * 2;
      if (dragMode.includes('l')) s.w -= (mx - startX) * 2;
      if (dragMode.includes('b')) s.h += (my - startY) * 2;
      if (dragMode.includes('t')) s.h -= (my - startY) * 2;
      s.w = Math.max(10, s.w); s.h = Math.max(10, s.h);
    }
    startX = mx; startY = my; drawAll();
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    isDragging = false; isResizing = false;
  }, { passive: false });

  document.getElementById('btn-rot-cw').onclick = (e) => { e.stopPropagation(); if(selectedIdx!==null){ shapes[selectedIdx].angle += Math.PI/12; drawAll(); }};
  document.getElementById('btn-confirm-shape').onclick = (e) => { e.stopPropagation(); selectedIdx = null; xformBar.style.display = 'none'; drawAll(); };

  textConfirm.onclick = () => {
    if (textInput.value.trim() && pendingTextPos) {
      const txt = textInput.value.trim();
      const baseFontSize = 100; ctx.font = `bold ${baseFontSize}px 'Bebas Neue'`;
      const textWidth = ctx.measureText(txt).width;
      const initialHeight = pendingTextPos.baseSize;
      const initialWidth = (textWidth / baseFontSize) * initialHeight;
      shapes.push({ type: 'text', text: txt, x: pendingTextPos.x, y: pendingTextPos.y, w: initialWidth, h: initialHeight, color: pendingTextPos.col, opacity: pendingTextPos.opa, angle: 0 });
      selectedIdx = shapes.length - 1; xformBar.style.display = 'flex'; drawAll();
    }
    textModal.style.display = 'none'; textInput.value = '';
  };

  // 🎯 畫板完成：擷取畫布並顯示最終結局
  doneBtn.onclick = () => {
    state.userArt = canvas.toDataURL("image/png");
    artLayer.style.display = 'none';
    displayFinalResult();
  };
}

// ── 🎯 處理圖片上傳 ──
function renderUploadBoard() {
  const layer = document.getElementById('upload-board-layer');
  const btn = document.getElementById('upload-trigger-btn');
  const uploader = document.getElementById('image-uploader');
  layer.style.display = 'block';

  btn.onclick = () => uploader.click();
  uploader.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        state.userArt = event.target.result; 
        layer.style.display = 'none';
        displayFinalResult();
      };
      reader.readAsDataURL(file);
    }
  };
}

// ── 📰 新聞注入邏輯 ──
const injectArtIntoNews = () => {
  performTransition(() => {
    let newsLayer = document.getElementById('news-layer-new1');
    if (!newsLayer) {
      newsLayer = document.createElement('div');
      newsLayer.id = 'news-layer-new1';
      newsLayer.innerHTML = `
        <div class="news-container">
          <div class="news-label">EXCLUSIVE REPORT</div>
          <h1 class="news-title">公路驚見巨幅創作<br>神祕創作者引發熱議</h1>
          <p class="news-meta">BY AUTO-REPORTER | 2062.06.03 | ART SECTOR</p>
          <div class="news-main-content">
            <div class="news-gray-block">
              <img id="news-injected-art" src="${state.userArt}" style="width:100%; height:100%; object-fit:cover;">
            </div>
            <p class="news-body-text">
              <b>【本報訊】</b>一名剛畢業的高中生近日在荒野公路租下大型廣告版位，並利用自動繪圖裝置創作出震撼人心的巨幅作品。該作品上刊後短時間內在社群平台累積超過百萬觀看次數，引起廣泛討論。<br><br>據悉，該版位原本因周邊地理位置偏遠、仍在開發中而乏人問津。當地業者透露，沒想到這件「隨興之作」反而吸引大量遊客駐足拍照，甚至帶動了周邊老舊加油站與雜貨店的商機。
            </p>
          </div>
          <button id="news-close-btn">FINISH READING ▶</button>
        </div>
      `;
      document.getElementById('viewport').appendChild(newsLayer);
    } else {
      const injectedImg = newsLayer.querySelector('#news-injected-art');
      if (injectedImg) injectedImg.src = state.userArt;
      newsLayer.style.display = 'flex';
    }

    const newsCloseBtn = document.getElementById('news-close-btn');
    newsCloseBtn.onclick = () => {
      performTransition(() => {
        const nLayer = document.getElementById('news-layer-new1');
        if (nLayer) nLayer.style.display = 'none';
        quitToMenu();
        location.reload(); 
      });
    };
  });
};

// ── 🏆 最終結局展現 ──
function displayFinalResult() {
  const resLayer = document.getElementById('final-result-layer');
  const resBg = document.getElementById('final-result-bg');
  const resArt = document.getElementById('final-result-artwork-img');
  const toMenuBtn = document.getElementById('final-to-menu-btn');

  const finalBgSrc = state.branch === "A" ? "images/final_board_end1.png" : "images/final_board_end2.png";
  
  performTransition(() => {
    resBg.src = finalBgSrc;
    resArt.src = state.userArt; 
    resLayer.style.display = 'block';
  });

  toMenuBtn.onclick = () => {
    resLayer.style.display = 'none';
    if (state.branch === "A") {
      injectArtIntoNews();
    } else {
      performTransition(() => { quitToMenu(); location.reload(); });
    }
  };
}

// ── 🚀 啟動邏輯 (完全保留原本內容) ──
document.addEventListener('DOMContentLoaded', () => {
  const intro = document.getElementById('intro-screen');
  const menu = document.getElementById('menu-layer');
  const startBtn = document.getElementById('nav-start');

  // 🎯 預載所有場景圖片
  function preloadAllImages() {
    const urls = new Set();
    // 從 STORY 抓所有 image 欄位
    Object.values(STORY).forEach(scene => {
      if (scene.image) urls.add(scene.image);
    });
    // 固定會用到的背景圖
    [
      'images/menu/menu-back.png',
      'images/menu/menu-hero.png',
      'images/menu/menu-button-about.png',
      'images/menu/menu-button-map.png',
      'images/menu/menu-button-start.png',
      'images/bg-dots-desktop.png',
      'images/map/gridline.svg',
      'images/map/nodeline.svg',
      'images/map/mapnode.svg',
      'images/map/magnifier.svg',
      'images/map/scale.svg',
      'images/map/landmark.svg',
      'images/map/position.svg',
      'images/map/map-b0.png',
      'images/map/map-b1.png',
      'images/map/map-b2.png',
      'images/map/map-b3.png',
      'images/map/map-b4.png',
      'images/map/map-b5.png',
      'images/map/map-b6.png',
      'images/menu/Blood_l.svg',
      'images/menu/Blood_r.svg',
      'images/menu/Group_9.svg',
      'images/menu/name_space.svg',
      'images/final_board_art.png',
      'images/final_board_end1.png',
      'images/final_board_end2.png',
      'images/final_ud_btn.png',
      'images/death_desktop.png',
      'images/death_1.png',
      'images/death_2.png',
      'images/death_3.png',
    ].forEach(u => urls.add(u));

    urls.forEach(src => {
      const img = new Image();
      img.src = src;
    });
  }
  preloadAllImages();

  setTimeout(() => { performTransition(() => { intro.style.display = 'none'; menu.style.display = 'block'; }); }, 1000);
  if (startBtn) startBtn.onclick = () => { performTransition(() => { menu.style.display = 'none'; render('start'); }); };

  // 🎯 地圖頁
  const mapBtn = document.getElementById('nav-map');
  const mapLayer = document.getElementById('map-layer');
  const mapBackBtn = document.getElementById('map-back-btn');
  const mapContent = document.getElementById('map-content');
  const mapMagnifier = document.getElementById('map-magnifier');
  const mapCanvas = document.getElementById('map-canvas');

  if (mapBtn) mapBtn.onclick = () => { performTransition(() => { menu.style.display = 'none'; mapLayer.style.display = 'block'; }); };

  // 🎯 返回主頁按鈕：第一次點擊展開(漢堡圖示 → 黃色色塊+文字)，展開後再點一次才真的返回主選單
  if (mapBackBtn) {
    mapBackBtn.onclick = () => {
      if (!mapBackBtn.classList.contains('expanded')) {
        mapBackBtn.classList.add('expanded');
        return;
      }
      performTransition(() => {
        mapLayer.style.display = 'none';
        menu.style.display = 'block';
        mapBackBtn.classList.remove('expanded'); // 下次打開地圖時恢復收合狀態
      });
    };
  }

  // 🎯 放大鏡：縮小/還原地點縮圖跟旗標(不影響底圖)
  let mapZoomedOut = false;
  const mapDrag = { x: 0, y: 0, active: false, startX: 0, startY: 0, baseX: 0, baseY: 0 };
  function applyMapContentTransform() {
    if (!mapContent) return;
    const scale = mapZoomedOut ? 0.6 : 1;
    mapContent.style.transform = `translate(${mapDrag.x}px, ${mapDrag.y}px) scale(${scale})`;
  }
  if (mapMagnifier) {
    mapMagnifier.onclick = () => {
      mapZoomedOut = !mapZoomedOut;
      mapMagnifier.classList.toggle('active', mapZoomedOut);
      applyMapContentTransform();
    };
  }

  // 🎯 拖曳地圖內容(縮圖/旗標/文字)，底圖(波點+連線)保持不動
  if (mapCanvas && mapContent) {
    const onDragStart = (clientX, clientY) => {
      mapDrag.active = true;
      mapDrag.startX = clientX; mapDrag.startY = clientY;
      mapDrag.baseX = mapDrag.x; mapDrag.baseY = mapDrag.y;
      mapContent.classList.add('dragging');
    };
    const onDragMove = (clientX, clientY) => {
      if (!mapDrag.active) return;
      mapDrag.x = mapDrag.baseX + (clientX - mapDrag.startX);
      mapDrag.y = mapDrag.baseY + (clientY - mapDrag.startY);
      applyMapContentTransform();
    };
    const onDragEnd = () => { mapDrag.active = false; mapContent.classList.remove('dragging'); };

    mapCanvas.addEventListener('pointerdown', (e) => {
      if (e.target.closest('#map-hud')) return; // HUD 上的點擊不要觸發拖曳
      if (e.target.closest('.map-node-photo')) return; // 🎯 點地點縮圖不要觸發拖曳，不然 click 事件會被 pointer capture 攔截
      onDragStart(e.clientX, e.clientY);
      mapCanvas.setPointerCapture(e.pointerId);
    });
    mapCanvas.addEventListener('pointermove', (e) => { onDragMove(e.clientX, e.clientY); });
    mapCanvas.addEventListener('pointerup', onDragEnd);
    mapCanvas.addEventListener('pointercancel', onDragEnd);
  }

  // 🎯 地圖上的地點縮圖 (b1/b2/b3) 點下去會打開對應的地標詳情頁
  const landmarkLayer = document.getElementById('landmark-layer');
  const mapB1 = document.getElementById('map-b1');
  const mapB2 = document.getElementById('map-b2');
  const mapB3 = document.getElementById('map-b3');
  if (mapB1) mapB1.onclick = (ev) => { ev.stopPropagation(); performTransition(() => { mapLayer.style.display = 'none'; renderLandmarkScreen('home'); landmarkLayer.style.display = 'block'; }); };
  if (mapB2) mapB2.onclick = (ev) => { ev.stopPropagation(); performTransition(() => { mapLayer.style.display = 'none'; renderLandmarkScreen('printer'); landmarkLayer.style.display = 'block'; }); };
  if (mapB3) mapB3.onclick = (ev) => { ev.stopPropagation(); performTransition(() => { mapLayer.style.display = 'none'; renderLandmarkScreen('dust'); landmarkLayer.style.display = 'block'; }); };

  // 🎯 About 頁面
  const aboutBtn = document.getElementById('nav-about');
  const aboutLayer = document.getElementById('about-layer');
  if (aboutBtn) aboutBtn.onclick = () => { performTransition(() => { menu.style.display = 'none'; renderAboutPage(); aboutLayer.style.display = 'block'; }); };
});

document.addEventListener('selectstart', (e) => e.preventDefault());
// 🎯 房間場景(iframe)點擊 exit 離開時，關閉房間層、回到地標詳情頁
window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'exitRoom') {
    performTransition(() => {
      const roomLayer = document.getElementById('room-layer');
      const roomIframe = document.getElementById('room-iframe');
      roomLayer.style.display = 'none';
      roomIframe.src = ''; // 釋放 iframe，下次進入重新載入(重置房間狀態)
    });
  }
});
// 🎯 展開式選單按鈕（地圖的 BACK TO MENU / 場景的右上角選單）：點旁邊會自動收回去
document.addEventListener('click', (e) => {
  document.querySelectorAll('#map-back-btn.expanded, .story-menu-btn.expanded, .lm-menu-btn.expanded, #about-back-btn.expanded').forEach(el => {
    if (!el.contains(e.target)) el.classList.remove('expanded');
  });
});
// 🔧 圖片/svg 不能被原生拖曳抓起來（CSS 的 -webkit-user-drag 在 Firefox 不吃，這裡用 JS 補一道保險）
document.addEventListener('dragstart', (e) => {
  const t = e.target;
  if (t && (t.tagName === 'IMG' || t.tagName === 'SVG' || t.closest('svg'))) e.preventDefault();
});

// ============================================================
//  🎯 About 頁面（作者的話 + 參考資料 + 聯絡資訊）
// ============================================================
function renderAboutPage() {
  const canvas = document.getElementById('about-canvas');
  const hud = document.getElementById('about-hud');
  if (!canvas || !hud) return;

  const noteText = "你好，我是作者，正面臨大一開學大關。<br>“Billboard run”是為了紀念我終於從高中畢業的一個小小遊戲，更新內容是為了紀念我上大學，之後不會繼續更新。除了代碼由claude生成之外都由我一人製作，篇幅較短，整個遊戲時長大概在10分鐘以下。<br>希望各位玩的開心，開學順利。";

  const links = [
    "https://sketchfab.com/3d-models/old-car-vaz-2107-91270dab9d1a47c7ba7ffaaf8c8b0beb",
    "https://sketchfab.com/3d-models/jeep-wrangler-1997-reworked-00e6dba30cdd47eeb37a5a0a4d79d084",
    "https://sketchfab.com/3d-models/m16-assault-rifle-339d0f7b21024387853dd926a5d51b50",
    "https://sketchfab.com/3d-models/mp5-submachine-gun-a73b61932a0e4eecb5db5c63c158aa24",
    "https://www.cgtrader.com/free-3d-models/car/antique-car/cadillac-deville-1959-5977b2ee-c929-4879-b735-d49ad572c650",
    "https://sketchfab.com/3d-models/gaz-69-soviet-four-wheel-drive-off-road-vehicle-77d0eb71b07b4500bfad49f27150197d"
  ];
  const refsHTML = `參考資料<br><br>${links.map(l => `<a href="${l}" target="_blank">${l}</a>`).join('<br><br>')}<br><br><br>聯絡資訊<br>zyu34917@gmail.com<br>`;

  canvas.innerHTML = `
    <div class="about-text" id="about-text">${noteText}<br><br>${refsHTML}</div>
    <div class="about-scroll-track" id="about-scroll-track"></div>
    <div class="about-scroll-thumb" id="about-scroll-thumb"></div>
  `;

  // 🎯 HUD：釘死在真實螢幕角落，不受畫布裁切影響
  hud.innerHTML = `
    <div id="about-back-btn">
      <div id="about-back-bar"></div>
      <div id="about-back-icon-wrap">
        <svg viewBox="0 0 62 67" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3.50003 3.5H58.5M3.5 34.3572H58.5M3.5 63.5H58.5" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div id="about-back-text">BACK TO MENU</div>
    </div>
  `;

  const scrollTrack = canvas.querySelector('#about-scroll-track');
  const scrollThumb = canvas.querySelector('#about-scroll-thumb');
  const aboutTextEl = canvas.querySelector('#about-text');
  if (scrollTrack && scrollThumb && aboutTextEl) {
    scrollTrack.onclick = (ev) => {
      ev.stopPropagation();
      const scrolled = scrollThumb.classList.toggle('scrolled-pos');
      aboutTextEl.scrollTo({ top: scrolled ? aboutTextEl.scrollHeight : 0, behavior: 'smooth' });
    };
  }

  const backBtn = hud.querySelector('#about-back-btn');
  if (backBtn) {
    backBtn.onclick = (ev) => {
      ev.stopPropagation();
      if (!backBtn.classList.contains('expanded')) { backBtn.classList.add('expanded'); return; }
      performTransition(() => {
        document.getElementById('about-layer').style.display = 'none';
        document.getElementById('menu-layer').style.display = 'block';
      });
    };
  }
}
