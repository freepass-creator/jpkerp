/**
 * panel-resize.js — 워크스페이스 N-패널 리사이즈
 *
 * .workspace 안의 .panel 사이마다 핸들 자동 삽입.
 * 2개든 3개든 4개든 패널 사이 드래그로 조절 가능.
 * 비율은 localStorage에 페이지별 저장.
 */

const STORAGE_PREFIX = 'jpk.panel.';

export function initPanelResize() {
  document.querySelectorAll('.workspace').forEach(setup);
  new MutationObserver(() => {
    document.querySelectorAll('.workspace').forEach(setup);
  }).observe(document.body, { childList: true, subtree: true });
}

function setup(ws) {
  if (ws.dataset.resizeInit) return;
  const panels = [...ws.children].filter(c => c.classList?.contains('panel'));
  if (panels.length < 2) return;
  ws.dataset.resizeInit = '1';

  const key = STORAGE_PREFIX + window.location.pathname;

  // 저장된 비율 복원
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (saved && saved.length === panels.length) {
      panels.forEach((p, i) => { p.style.flex = `${saved[i]} 0 0`; });
    }
  } catch {}

  // 패널 사이마다 핸들 삽입
  for (let i = 1; i < panels.length; i++) {
    const handle = document.createElement('div');
    handle.className = 'panel-resize-handle';
    ws.insertBefore(handle, panels[i]);

    let dragging = false;
    let startX = 0;
    let leftW = 0;
    let rightW = 0;

    let dblState = 0; // 0=현재, 1=5:5, 2=3:7
    handle.addEventListener('dblclick', () => {
      dblState = (dblState + 1) % 3;
      let ratios;
      if (dblState === 1) {
        ratios = panels.map(() => 100 / panels.length);
      } else if (dblState === 2) {
        ratios = panels.length === 2 ? [30, 70] : panels.map(() => 100 / panels.length);
      } else {
        ratios = panels.map(() => 100 / panels.length);
        dblState = 1;
      }
      panels.forEach((p, i) => { p.style.flex = `${ratios[i]} 0 0`; });
      localStorage.setItem(key, JSON.stringify(ratios));
    });

    handle.addEventListener('mousedown', (e) => {
      dragging = true;
      startX = e.clientX;
      leftW = panels[i - 1].getBoundingClientRect().width;
      rightW = panels[i].getBoundingClientRect().width;
      document.body.classList.add('is-resizing');
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const newLeft = Math.max(80, leftW + dx);
      const newRight = Math.max(80, rightW - dx);
      panels[i - 1].style.flex = `${newLeft} 0 0`;
      panels[i].style.flex = `${newRight} 0 0`;
    });

    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove('is-resizing');
      // 현재 비율 저장
      const total = ws.getBoundingClientRect().width;
      const ratios = panels.map(p => (p.getBoundingClientRect().width / total) * 100);
      localStorage.setItem(key, JSON.stringify(ratios));
    });
  }
}
