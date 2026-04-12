/**
 * menu.js — 사이드바 메뉴
 */

export const MENU = [
  { group: '업로드센터', icon: 'fileup', children: [
    { href: '/upload',           label: '업로드하기', icon: 'uploadicon' },
    { href: '/upload/list',      label: '업로드내역', icon: 'listcheck' },
  ]},
  { group: '입력', icon: 'plus', children: [
    { href: '/input/operation',  label: '운영업무',   icon: 'circleplus' },
    { href: '/input/asset',      label: '자산등록',   icon: 'gridplus' },
    { href: '/input/contract',   label: '계약등록',   icon: 'clipplus2' },
    { href: '/fund',             label: '입출금등록', icon: 'listplus' },
  ]},
  { group: '조회', icon: 'searchck', children: [
    { href: '/total',     label: '통합관리',   icon: 'monitorck' },
    { href: '/operation', label: '운영관리',   icon: 'circlecheck' },
    { href: '/asset',     label: '자산관리',   icon: 'gridcheck' },
    { href: '/contract',  label: '계약관리',   icon: 'clipcheck' },
    { href: '/customer',  label: '고객관리',   icon: 'users' },
    { href: '/billing',   label: '수납관리',   icon: 'dollar' },
    { href: '/ledger',    label: '입출금관리', icon: 'listcheck' },
  ]},
  { group: '현황', icon: 'trending', children: [
    { href: '/status/overdue',  label: '미납현황', icon: 'alert' },
    { href: '/status/idle',     label: '휴차현황', icon: 'pause' },
    { href: '/status/expiring', label: '만기도래', icon: 'clock' },
  ]},
  { group: '회사관리', icon: 'building', children: [
    { href: '/admin/company',  label: '회사정보',     icon: 'info' },
    { href: '/admin/staff',    label: '직원관리',     icon: 'users' },
    { href: '/admin/card',     label: '법인카드관리', icon: 'wallet' },
    { href: '/admin/account',  label: '계좌관리',     icon: 'fund' },
    { href: '/admin/vendor',   label: '거래처관리',   icon: 'contract' },
    { href: '/admin/lease',    label: '임대관리',     icon: 'asset' },
    { href: '/admin/contract', label: '계약서관리',   icon: 'fileplus' },
    { href: '/admin/seal',     label: '인감/도장',    icon: 'circlecheck' },
    { href: '/admin/notice',   label: '고지서업무',  icon: 'alert' },
    { href: '/admin/approval', label: '전자결재',    icon: 'clipcheck' },
  ]},
];

const ICONS = {
  home:     '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  check:    '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  asset:    '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>',
  contract: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  fund:     '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>',
  search:   '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  searchck: '<path d="m8 11 2 2 4-4"/><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  logout:   '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  users:    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  chevron:  '<polyline points="6 9 12 15 18 9"/>',
  plus:     '<path d="M5 12h14"/><path d="M12 5v14"/>',
  uploadicon:'<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
  building: '<path d="M10 12h4"/><path d="M10 8h4"/><path d="M14 21v-3a2 2 0 0 0-4 0v3"/><path d="M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2"/><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/>',
  info:     '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  dot:      '<circle cx="12" cy="12" r="2"/>',
  chart:    '<path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/>',
  trending: '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>',
  listplus: '<path d="M16 5H3"/><path d="M11 12H3"/><path d="M16 19H3"/><path d="M18 9v6"/><path d="M21 12h-6"/>',
  listcheck:'<path d="M16 5H3"/><path d="M16 12H3"/><path d="M11 19H3"/><path d="m15 18 2 2 4-4"/>',
  monitorck:'<path d="m9 10 2 2 4-4"/><rect width="20" height="14" x="2" y="3" rx="2"/><path d="M12 17v4"/><path d="M8 21h8"/>',
  dollar:   '<circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/>',
  fileinput:'<path d="M4 11V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M2 15h10"/><path d="m9 18 3-3-3-3"/>',
  fileup:   '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M12 12v6"/><path d="m15 15-3-3-3 3"/>',
  wallet:   '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
  clipboard:'<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect width="8" height="4" x="8" y="2" rx="1"/>',
  alert:    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  pause:    '<rect width="4" height="16" x="6" y="4" rx="1"/><rect width="4" height="16" x="14" y="4" rx="1"/>',
  clock:    '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  // 파일 계열 (계약)
  fileplus:   '<path d="M11.35 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v5.35"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M14 19h6"/><path d="M17 16v6"/>',
  filesearch: '<path d="M11.1 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.589 3.588A2.4 2.4 0 0 1 20 8v3.25"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="m21 22-2.88-2.88"/><circle cx="16" cy="17" r="3"/>',
  // 원형 계열 (운영)
  circleplus: '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/>',
  circlecheck:'<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  // 지갑 계열 (입출금)
  walletplus: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/><path d="M14 19h6"/><path d="M17 16v6"/>',
  walletsearch:'<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h10"/><path d="m21 22-2.88-2.88"/><circle cx="16" cy="17" r="3"/>',
  // 그리드 계열 (자산)
  gridplus:   '<path d="M12 3v17a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1H3"/><path d="M16 19h6"/><path d="M19 22v-6"/>',
  gridcheck:  '<path d="M12 3v17a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1H3"/><path d="m16 19 2 2 4-4"/>',
  // 클립보드 계열 (계약)
  clipplus2:  '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 14h6"/><path d="M12 17v-6"/>',
  clipcheck:  '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
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
      const isOpen = hasActive || (savedOpen !== null ? savedOpen === '1' : false);
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
              ${c.icon ? svg(c.icon) : ''}
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

  // active 메뉴로 스크롤
  const activeEl = container.querySelector('.sidebar-link.is-active');
  if (activeEl) activeEl.scrollIntoView({ block: 'center', behavior: 'instant' });
}
