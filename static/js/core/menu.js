/**
 * menu.js — 사이드바 메뉴
 */

export const MENU = [
  { href: '/status/operation', label: '통합 리포트', icon: 'chart' },

  { group: '입력', icon: 'plus', children: [
    { href: '/input/operation', label: '운영업무', icon: 'play' },
    { href: '/upload',          label: '일괄 업로드',   icon: 'fileup' },
    { href: '/input',           label: '개별 입력',     icon: 'circleplus' },
    { href: '/input/history',   label: '입력 이력',     icon: 'listcheck' },
  ]},

  { group: '현황', icon: 'trending', children: [
    { href: '/status/overdue',   label: '미납',      icon: 'alert' },
    { href: '/status/idle',      label: '휴차',      icon: 'pause' },
    { href: '/status/product',   label: '상품대기',  icon: 'storefront' },
    { href: '/status/expiring',  label: '만기도래',  icon: 'clock' },
    { href: '/status/pending',   label: '미결업무',  icon: 'clipboard' },
    { href: '/status/ignition',  label: '시동제어',  icon: 'alert' },
  ]},

  { group: '조회', icon: 'searchck', children: [
    { subgroup: '자산관리', icon: 'gridcheck' },
    { href: '/asset',     label: '자산 목록' },
    { href: '/loan',      label: '할부 관리' },
    { href: '/insurance', label: '보험 관리' },
    { href: '/gps',       label: 'GPS 장착' },
    { href: '/disposal',  label: '매각 차량' },

    { subgroup: '운영관리', icon: 'circlecheck' },
    { href: '/operation',          label: '전체 이력' },
    { href: '/operation/contact',  label: '고객센터' },
    { href: '/operation/delivery', label: '입출고센터' },
    { href: '/return-schedule',    label: '반납 일정' },
    { href: '/operation/maint',    label: '정비 이력' },
    { href: '/operation/accident', label: '사고 이력' },
    { href: '/operation/wash',     label: '세차' },
    { href: '/operation/fuel',     label: '주유' },

    { subgroup: '영업관리', icon: 'clipcheck' },
    { href: '/contract', label: '계약 관리' },
    { href: '/customer', label: '고객 관리' },
    { href: '/product',  label: '상품 관리' },

    { subgroup: '재무관리', icon: 'dollar' },
    { href: '/billing',   label: '수납 관리' },
    { href: '/autodebit', label: '자동이체' },
    { href: '/ledger',    label: '입출금 내역' },
    { href: '/finance',   label: '재무 보고' },
  ]},

  { group: '설정', icon: 'settings', children: [
    { subgroup: '회사·인사', icon: 'building' },
    { href: '/admin/company', label: '회사 정보' },
    { href: '/admin/staff',   label: '직원 관리' },
    { href: '/admin/leave',   label: '휴가 관리' },

    { subgroup: '거래 마스터', icon: 'contract' },
    { href: '/admin/member', label: '회원사 관리' },
    { href: '/admin/vendor', label: '거래처 관리' },

    { subgroup: '자금', icon: 'wallet' },
    { href: '/admin/card',    label: '법인카드' },
    { href: '/admin/account', label: '계좌 관리' },

    { subgroup: '문서·결재', icon: 'fileplus' },
    { href: '/admin/contract', label: '계약서 관리' },
    { href: '/admin/seal',     label: '인감 관리' },
    { href: '/admin/approval', label: '전자결재' },

    { subgroup: '시스템', icon: 'code' },
    { href: '/dev/car-master', label: '차종 등록' },
    { href: '/dev',            label: '개발도구' },
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
  userplus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>',
  usercheck:'<path d="m16 11 2 2 4-4"/><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>',
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

// 기존 아이콘 이름 → Phosphor (중복 없이 고유 매핑)
const PH_MAP = {
  // ── 대분류 그룹 ──
  plus:       'ph-plus-circle',        // 입력
  trending:   'ph-trend-up',           // 현황
  searchck:   'ph-magnifying-glass',   // 조회
  settings:   'ph-gear-six',           // 행정/설정

  // ── 입력 소메뉴 ──
  play:       'ph-stack-plus',         // 운영업무 (입력)
  fileup:     'ph-upload-simple',      // 업로드센터
  circleplus: 'ph-keyboard',           // 직접입력
  listcheck:  'ph-list-checks',        // 입력내역

  // ── 현황 소메뉴 ──
  alert:      'ph-warning-circle',     // 미납현황
  pause:      'ph-pause-circle',       // 휴차현황
  storefront: 'ph-storefront',        // 상품대기
  clock:      'ph-clock-countdown',    // 만기도래

  // ── 조회 중분류 ──
  gridcheck:  'ph-car',                // 자산·차량
  circlecheck:'ph-stack',              // 운영·정비 (조회)
  clipcheck:  'ph-handshake',          // 영업·계약
  dollar:     'ph-currency-krw',       // 재무·수납

  // ── 행정/설정 소메뉴 ──
  info:       'ph-info',               // 회사정보
  users:      'ph-users-three',        // 직원관리
  wallet:     'ph-credit-card',        // 법인카드
  fund:       'ph-bank',               // 계좌관리
  contract:   'ph-briefcase',          // 거래처관리
  building:   'ph-buildings',          // 회원사관리
  fileplus:   'ph-file-text',          // 계약서관리
  stamp:      'ph-stamp',              // 인감/도장
  approval:   'ph-check-square',       // 전자결재
  leave:      'ph-calendar-check',     // 휴가관리
  database:   'ph-database',           // 차종마스터
  code:       'ph-code',               // 개발도구

  // ── 기타/공용 ──
  home:       'ph-house',
  chart:      'ph-chart-line',
  search:     'ph-magnifying-glass',
  check:      'ph-check',
  chevron:    'ph-caret-down',
  logout:     'ph-sign-out',
  dot:        'ph-dot-outline',

  // ── 하위 호환 (기존 이름이 남아있을 수 있음) ──
  uploadicon: 'ph-upload-simple',
  gridplus:   'ph-squares-four',
  userplus:   'ph-user-plus',
  usercheck:  'ph-user-check',
  clipplus2:  'ph-clipboard',
  walletplus: 'ph-credit-card',
  walletsearch:'ph-credit-card',
  monitorck:  'ph-monitor',
  clipboard:  'ph-shield-check',       // 보험 용
  filesearch: 'ph-file-magnifying-glass',
};

const svg = (name) => {
  const cls = PH_MAP[name] || 'ph-circle';
  return `<i class="ph ${cls}"></i>`;
};

/** 서브그룹 단위로 children을 그룹핑해서 렌더 */
function renderChildren(children, fullUrl, groupName) {
  // 서브그룹으로 버킷 분할
  const buckets = []; // [{subgroup, icon, items}]
  let current = { subgroup: null, icon: null, items: [] };
  for (const c of children) {
    if (c.subgroup) {
      if (current.items.length || current.subgroup) buckets.push(current);
      current = { subgroup: c.subgroup, icon: c.icon || null, items: [] };
    } else {
      current.items.push(c);
    }
  }
  if (current.items.length) buckets.push(current);

  return buckets.map(bucket => {
    if (!bucket.subgroup) {
      // 대분류 직속 자식 — 번호 없음
      return bucket.items.map(c => renderLink(c, fullUrl)).join('');
    }
    const hasActive = bucket.items.some(c => c.href === fullUrl);
    const openKey = `submenu_${groupName}_${bucket.subgroup}`;
    const savedOpen = localStorage.getItem(openKey);
    const isOpen = hasActive || (savedOpen === '1');

    return `<div class="sidebar-subgroup-wrap${isOpen ? ' is-open' : ''}" data-key="${openKey}">
      <div class="sidebar-subgroup" data-toggle="1">
        ${bucket.icon ? svg(bucket.icon) : ''}
        <span class="sidebar-link-label">${bucket.subgroup}</span>
        <svg class="sidebar-subgroup-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="sidebar-subgroup-body">
        ${bucket.items.map((c, i) => renderLink(c, fullUrl, i + 1)).join('')}
      </div>
    </div>`;
  }).join('');
}

function renderLink(c, fullUrl, idx) {
  const active = c.href === fullUrl ? ' is-active' : '';
  const num = idx ? `<span class="sidebar-num">${idx}</span>` : '';
  return `<a class="sidebar-link sidebar-child${active}" href="${c.href}">
    ${num}
    ${c.icon ? svg(c.icon) : ''}
    <span class="sidebar-link-label">${c.label}</span>
    <span class="sidebar-count"></span>
  </a>`;
}

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
          ${renderChildren(it.children, fullUrl, it.group)}
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

  // 아코디언 토글 (대분류)
  container.querySelectorAll('.sidebar-group-head').forEach(head => {
    head.addEventListener('click', () => {
      const group = head.parentElement;
      const isOpen = group.classList.toggle('is-open');
      localStorage.setItem(head.dataset.key, isOpen ? '1' : '0');
    });
  });

  // 아코디언 토글 (서브그룹)
  container.querySelectorAll('.sidebar-subgroup[data-toggle]').forEach(head => {
    head.addEventListener('click', (e) => {
      e.stopPropagation();
      const wrap = head.parentElement;
      const isOpen = wrap.classList.toggle('is-open');
      localStorage.setItem(wrap.dataset.key, isOpen ? '1' : '0');
    });
  });

  // active 메뉴로 스크롤
  const activeEl = container.querySelector('.sidebar-link.is-active');
  if (activeEl) activeEl.scrollIntoView({ block: 'center', behavior: 'instant' });
}
