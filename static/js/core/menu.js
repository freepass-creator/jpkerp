/**
 * menu.js — 사이드바 메뉴
 */

export const MENU = [
  { href: '/home', label: '대시보드', icon: 'home' },
  { group: '입력', icon: 'upload', children: [
    { href: '/upload',           label: '업로드센터', icon: 'upload' },
    { href: '/input/operation',  label: '운영등록',   icon: 'check' },
    { href: '/input/asset',      label: '자산등록',   icon: 'asset' },
    { href: '/input/contract',   label: '계약등록',   icon: 'contract' },
    { href: '/fund',             label: '입출금등록', icon: 'fund' },
  ]},
  { group: '조회', icon: 'search', children: [
    { href: '/operation', label: '운영관리',   icon: 'check' },
    { href: '/asset',     label: '자산관리',   icon: 'asset' },
    { href: '/contract',  label: '계약관리',   icon: 'contract' },
    { href: '/customer',  label: '고객관리',   icon: 'users' },
    { href: '/billing',   label: '수납관리',   icon: 'fund' },
    { href: '/ledger',    label: '입출금관리', icon: 'fund' },
  ]},
  { group: '현황', icon: 'accident', children: [
    { href: '/status/overdue',  label: '미납현황', icon: 'fund' },
    { href: '/status/idle',     label: '휴차현황', icon: 'asset' },
    { href: '/status/expiring', label: '만기도래', icon: 'contract' },
  ]},
  { href: '/settings', label: '설정', icon: 'settings' },
];

const ICONS = {
  home:     '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  check:    '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  asset:    '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>',
  contract: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  fund:     '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>',
  search:   '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  logout:   '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  users:    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  chevron:  '<polyline points="6 9 12 15 18 9"/>',
  dot:      '<circle cx="12" cy="12" r="2"/>',
};

const svg = (name) => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.dot}</svg>`;

export function renderMenu(container, items) {
  const fullUrl = window.location.pathname;
  let html = '';
  items.forEach(it => {
    if (it.group) {
      const hasActive = it.children?.some(c => c.href === fullUrl);
      const openKey = `menu_${it.group}`;
      const savedOpen = localStorage.getItem(openKey);
      const isOpen = savedOpen !== null ? savedOpen === '1' : hasActive;
      html += `<div class="sidebar-group${isOpen ? ' is-open' : ''}" data-group="${it.group}">
        <div class="sidebar-group-head" data-key="${openKey}">
          ${svg(it.icon || 'dot')}
          <span>${it.group}</span>
          <svg class="sidebar-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        <div class="sidebar-group-body">
          ${it.children.map(c => {
            const active = c.href === fullUrl ? ' is-active' : '';
            return `<a class="sidebar-link sidebar-child${active}" href="${c.href}">
              ${svg(c.icon || 'dot')}
              <span class="sidebar-link-label">${c.label}</span>
            </a>`;
          }).join('')}
        </div>
      </div>`;
    } else if (it.divider) {
      html += `<div class="sidebar-divider">${it.label ? `<span>${it.label}</span>` : ''}</div>`;
    } else {
      const active = it.href === fullUrl ? ' is-active' : '';
      html += `<a class="sidebar-link${active}" href="${it.href}">
        ${svg(it.icon || 'dot')}
        <span class="sidebar-link-label">${it.label}</span>
      </a>`;
    }
  });
  container.innerHTML = html;

  // 아코디언 토글
  container.querySelectorAll('.sidebar-group-head').forEach(head => {
    head.addEventListener('click', () => {
      const group = head.parentElement;
      const isOpen = group.classList.toggle('is-open');
      localStorage.setItem(head.dataset.key, isOpen ? '1' : '0');
    });
  });
}
