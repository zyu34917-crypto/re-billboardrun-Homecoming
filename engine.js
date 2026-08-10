// ============================================================
//  BILLBOARD RUN — 核心引擎 (整合上傳 + 畫板 + 最終鑲嵌版)
// ============================================================

let pageIndex = 0;
let currentPages = [];
let historyStack = []; 
const state = { 
  current: "start", 
  branch: null, 
  userArt: null  // 存放玩家創作或上傳的 Base64 圖片
};
let typer = { full: "", false: false, timer: null, el: null, pos: 0 };
let isMenuOpen = false; 

// ── 🟡 黃色塊轉場特效 ──
function performTransition(onMidpoint) {
  const overlay = document.getElementById('transition-overlay');
  if (!overlay) { if(onMidpoint) onMidpoint(); return; }
  overlay.classList.remove('slide-active');
  void overlay.offsetWidth; 
  overlay.classList.add('slide-active');
  setTimeout(onMidpoint, 600); 
}

// ── 💀 死亡全屏處理 ──
function triggerDeathScreen(imageSrc) {
  const deathOverlay = document.getElementById('death-overlay');
  if (!deathOverlay) return;
  deathOverlay.innerHTML = '';
  const bgImg = document.createElement('img');
  bgImg.src = imageSrc;
  Object.assign(bgImg.style, { width: '100%', height: '100%', objectFit: 'cover', display: 'block' });
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
  historyStack.push({ sceneId: state.current, pageIndex: pageIndex, branch: state.branch });
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
  if (typer.timer) clearTimeout(typer.timer);
  render(prevState.sceneId, prevState.pageIndex, true); 
  isMenuOpen = false; updateMenuUI();
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

  const textEl = card.querySelector('.scene-text');
  const choicesEl = card.querySelector('.choices-wrap');
  const isMulti = scene.choices && scene.choices.length > 1;
  startTyping(currentPages[pageIndex], textEl);
  if (pageIndex === currentPages.length - 1 && isMulti && choicesEl) choicesEl.style.display = 'flex';

  card.onclick = (e) => {
    if (e.target.closest('.nav-trigger') || e.target.closest('.dropdown-content') || e.target.closest('.choice-btn')) return;
    if (isMenuOpen) { toggleNavMenu(); return; }
    if (!typer.done) { finishTyping(); return; }
    if (pageIndex < currentPages.length - 1) {
      saveToHistory(); pageIndex++; startTyping(currentPages[pageIndex], textEl); return;
    }
    if (sceneId.includes('dead_end') || sceneId.includes('death')) {
      let dSrc = "images/death_1.png";
      if (sceneId === "dead_end_2") dSrc = "images/death_2.png";
      if (sceneId === "dead_end_3") dSrc = "images/death_3.png";
      performTransition(() => triggerDeathScreen(dSrc)); return;
    }
    if (isMulti && choicesEl && choicesEl.style.display === 'none') {
      saveToHistory(); choicesEl.style.display = 'flex'; return;
    }
    if (!isMulti && scene.next) {
      saveToHistory();
      let nextT = scene.next;
      // 🎯 死亡機率改成 1/3
      if (scene.deathChance && Math.random() < 1/3) {
        nextT = (scene.deathTarget && scene.deathTarget !== "dead_end_check") ? scene.deathTarget : (state.branch === "A" ? "dead_end_1" : "dead_end_2");
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
}

function buildSceneHTML(scene) {
  const isMulti = scene.choices && scene.choices.length > 1;
  let dayPart = "01", monthPart = "JUNE";
  if (scene.day && scene.day.includes('/')) {
    const pts = scene.day.split('/'); dayPart = pts[1].padStart(2, '0');
    const ms = ["JAN", "FEB", "MAR", "APR", "MAY", "JUNE", "JULY", "AUG", "SEPT", "OCT", "NOV", "DEC"];
    monthPart = ms[parseInt(pts[0]) - 1] || "RUN";
  }
  const hasImage = scene.image && scene.image.length > 7;
  return `
    <div class="ui-header">
      <div class="nav-trigger" onclick="event.stopPropagation(); toggleNavMenu();">
        <div style="height:3px; background:var(--ink);"></div>
        <div style="height:3px; background:var(--cyan);"></div>
        <div style="height:3px; background:var(--cyan);"></div>
      </div>
      <div id="dropdown-nav" class="dropdown-content">
        <div onclick="event.stopPropagation(); goBack();">BACK</div>
        <div onclick="event.stopPropagation(); quitToMenu();">MENU</div>
      </div>
      <div class="date-badge"><div class="date-badge-inner">
        <span class="db-day">${dayPart}</span><span class="db-month">${monthPart}</span>
      </div></div>
      <div class="status-bar-wrap">
        <div class="status-text">2062.Sunny.billboard-run</div>
        <div class="status-line-black"></div><div class="status-line-cyan"></div>
      </div>
    </div>
    <div class="scene-image-wrap">${hasImage ? `<img src="${scene.image}" onerror="this.style.display='none';">` : ''}</div>
    <div class="scene-body"><div class="content-divider"></div><div class="scene-text"></div></div>
    ${isMulti ? `<div class="choices-wrap" style="display:none;">${scene.choices.map((c, i) => `<button class="choice-btn" data-next="${c.next}" data-branch="${c.branch || ''}"><span class="choice-key">0${i+1}</span><span class="choice-text">${c.label}</span></button>`).join('')}</div>` : `<div class="tap-hint">T A P &nbsp; T O &nbsp; C O N T I N U E</div>`}
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

  function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width; canvas.height = rect.height;
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
    ctx.clearRect(0, 0, canvas.width, canvas.height);
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
    const col = `rgb(${rv},${gv},${bv})`, opa = sliderOpa.value / 100, baseSize = canvas.width * 0.15;
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
      'images/menu_bg.png',
      'images/final_board_art.png',
      'images/final_board_end1.png',
      'images/final_board_end2.png',
      'images/final_ud_bg.png',
      'images/final_ud_btn.png',
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
  
  // 🎯 下方為新增的按鈕綁定邏輯
  const aboutBtn = document.getElementById('nav-about');
  const refsBtn = document.getElementById('nav-refs');
  if (aboutBtn) aboutBtn.onclick = () => renderInfoPage('about');
  if (refsBtn) refsBtn.onclick = () => renderInfoPage('refs');
});

document.addEventListener('selectstart', (e) => e.preventDefault());

// ============================================================
//  🎯 額外新增：About / References 頁面生成函數
// ============================================================
function renderInfoPage(type) {
  let layer = document.getElementById('info-page-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'info-page-layer';
    layer.className = 'info-layer';
    document.getElementById('viewport').appendChild(layer);
  }

  let contentHTML = '';
  if (type === 'about') {
    contentHTML = `
      <div class="info-content">
        <h2>ABOUT ME</h2>
        <p>我是剛旅行回來的作者平安🙏</p>
        <p>“Billboard run”是為了紀念我終於從高中畢業的一個小小遊戲，全部都由我一人製作，篇幅較短，整個遊戲時長大概在10分鐘以下。</p>
        <p>希望各位玩的開心！畢業快樂！</p>
        <br><br>
        <p>threads👉 @__leisure1224</p>
      </div>
    `;
  } else if (type === 'refs') {
    const links = [
      "https://sketchfab.com/3d-models/old-car-vaz-2107-91270dab9d1a47c7ba7ffaaf8c8b0beb",
      "https://sketchfab.com/3d-models/jeep-wrangler-1997-reworked-00e6dba30cdd47eeb37a5a0a4d79d084",
      "https://sketchfab.com/3d-models/m16-assault-rifle-339d0f7b21024387853dd926a5d51b50",
      "https://sketchfab.com/3d-models/mp5-submachine-gun-a73b61932a0e4eecb5db5c63c158aa24"
    ];
    contentHTML = `
      <div class="info-content">
        <h2>REFERENCES</h2>
        <p>參考資料</p>
        ${links.map(link => `<a href="${link}" target="_blank">${link}</a>`).join('')}
      </div>
    `;
  }

  layer.innerHTML = contentHTML + `<button class="info-back-btn" onclick="document.getElementById('info-page-layer').style.display='none'">BACK TO MENU</button>`;
  layer.style.display = 'flex';
}