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

  // 저장된 비율 복원 (과거 버그로 특정 패널이 0에 가까운 값 저장된 경우 폐기)
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (saved && saved.length === panels.length) {
      const allOk = saved.every(r => typeof r === 'number' && r >= 5);
      if (allOk) {
        panels.forEach((p, i) => { p.style.flex = `${saved[i]} 0 0`; });
      } else {
        localStorage.removeItem(key);
      }
    }
  } catch {}

  // 패널 사이마다 핸들 삽입
  for (let i = 1; i < panels.length; i++) {
    const handle = document.createElement('div');
    handle.className = 'panel-resize-handle';
    ws.insertBefore(handle, panels[i]);

    let dragging = false;
    let startX = 0;
    let startWidths = [];

    // 더블클릭 → CSS 레이아웃 기본값 복원 (layout-55/37/254 등)
    handle.addEventListener('dblclick', () => {
      panels.forEach(p => { p.style.flex = ''; });
      localStorage.removeItem(key);
    });

    handle.addEventListener('mousedown', (e) => {
      dragging = true;
      startX = e.clientX;
      // 3패널 이상에서도 안전하도록 전체 패널 너비 고정
      startWidths = panels.map(p => p.getBoundingClientRect().width);
      document.body.classList.add('is-resizing');
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const newLeft = Math.max(80, startWidths[i - 1] + dx);
      const newRight = Math.max(80, startWidths[i] - dx);
      panels.forEach((p, idx) => {
        if (idx === i - 1)      p.style.flex = `${newLeft} 0 0`;
        else if (idx === i)     p.style.flex = `${newRight} 0 0`;
        else                    p.style.flex = `${startWidths[idx]} 0 0`;
      });
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
