/**
 * context-menu.js — 우클릭 컨텍스트 메뉴
 *
 * 사용:
 *   import { showContextMenu } from '../core/context-menu.js';
 *   el.addEventListener('contextmenu', (e) => {
 *     e.preventDefault();
 *     showContextMenu(e, [
 *       { label: '수정하기', icon: '✏', action: () => { ... } },
 *       'sep',
 *       { label: '삭제', icon: '🗑', danger: true, action: () => { ... } },
 *     ]);
 *   });
 */

let activeMenu = null;

export function showContextMenu(e, items) {
  closeMenu();
  const menu = document.createElement('div');
  menu.className = 'ctx-menu';

  items.forEach(item => {
    if (item === 'sep') {
      menu.appendChild(Object.assign(document.createElement('div'), { className: 'ctx-menu-sep' }));
      return;
    }
    const el = document.createElement('div');
    el.className = 'ctx-menu-item' + (item.disabled ? ' is-disabled' : '') + (item.danger ? ' is-danger' : '');
    el.innerHTML = (item.icon ? `<span style="display:inline-flex;align-items:center;width:20px">${item.icon}</span> ` : '') + item.label;
    if (!item.disabled) {
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const fn = item.action;
        closeMenu();
        if (fn) setTimeout(() => fn(), 0);
      });
    }
    menu.appendChild(el);
  });

  document.body.appendChild(menu);

  // 위치 조정 (화면 밖 방지)
  const x = Math.min(e.clientX, window.innerWidth - menu.offsetWidth - 4);
  const y = Math.min(e.clientY, window.innerHeight - menu.offsetHeight - 4);
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  activeMenu = menu;

  // 바깥 클릭 닫기
  setTimeout(() => {
    document.addEventListener('click', onOutside);
    document.addEventListener('contextmenu', onOutside);
  }, 0);
}

function closeMenu() {
  if (activeMenu) {
    activeMenu.remove();
    activeMenu = null;
  }
  document.removeEventListener('click', onOutside);
  document.removeEventListener('contextmenu', onOutside);
}

function onOutside() {
  closeMenu();
}
