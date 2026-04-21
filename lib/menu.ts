/**
 * MENU — 기존 jpkerp menu.js 1:1 이식 + v2 조정
 * - 대시보드 + 통합리포트 같은 항렬 (루트)
 * - 개발도구 → 설정 그룹 하위로 이동
 */

export interface MenuLink {
  href: string;
  label: string;
  icon?: string;
}

export interface MenuSubgroup {
  subgroup: string;
  icon?: string;
  /** 설정 시 서브그룹 자체가 링크 (토글 아님) */
  href?: string;
}

export interface MenuGroup {
  group: string;
  icon: string;
  children: Array<MenuLink | MenuSubgroup>;
}

export type MenuEntry = MenuLink | MenuGroup;

export const MENU: MenuEntry[] = [
  { href: '/', label: '대시보드', icon: 'home' },
  { href: '/status/operation', label: '통합 리포트', icon: 'chart' },

  {
    group: '입력',
    icon: 'plus',
    children: [
      { href: '/input/operation', label: '운영업무', icon: 'play' },
      { href: '/upload', label: '일괄 불러오기', icon: 'fileup' },
      { href: '/input', label: '개별 입력', icon: 'circleplus' },
      { href: '/input/history', label: '입력 이력', icon: 'listcheck' },
    ],
  },

  {
    group: '현황',
    icon: 'trending',
    children: [
      { href: '/status/overdue', label: '미납', icon: 'alert' },
      { href: '/status/idle', label: '휴차', icon: 'pause' },
      { href: '/status/product', label: '상품대기', icon: 'storefront' },
      { href: '/status/expiring', label: '만기도래', icon: 'clock' },
      { href: '/status/pending', label: '미결업무', icon: 'clipboard' },
      { href: '/status/ignition', label: '시동제어', icon: 'alert' },
    ],
  },

  {
    group: '조회',
    icon: 'searchck',
    children: [
      { subgroup: '자산관리', icon: 'gridcheck' },
      { href: '/asset', label: '자산 목록' },
      { href: '/loan', label: '할부 관리' },
      { href: '/insurance', label: '보험 관리' },
      { href: '/gps', label: 'GPS 장착' },
      { href: '/disposal', label: '매각 차량' },

      { subgroup: '운영관리', icon: 'circlecheck' },
      { href: '/operation', label: '전체 이력' },
      { href: '/operation/contact', label: '고객센터' },
      { href: '/operation/delivery', label: '입출고센터' },
      { href: '/return-schedule', label: '반납 일정' },
      { href: '/operation/maint', label: '정비 이력' },
      { href: '/operation/accident', label: '사고 이력' },
      { href: '/operation/penalty', label: '과태료 처리' },
      { href: '/operation/wash', label: '세차' },

      { subgroup: '영업관리', icon: 'clipcheck' },
      { href: '/contract', label: '계약 관리' },
      { href: '/customer', label: '고객 관리' },
      { href: '/sales', label: '실적 관리' },
      { href: '/task', label: '업무 목록' },

      { subgroup: '재무관리', icon: 'dollar' },
      { href: '/billing-schedule', label: '수납 스케줄' },
      { href: '/billing', label: '수납 관리' },
      { href: '/autodebit', label: '자동이체' },
      { href: '/fund', label: '자금 관리' },
      { href: '/ledger', label: '입출금 내역' },
      { href: '/finance', label: '재무 보고' },
    ],
  },

  {
    group: '설정',
    icon: 'settings',
    children: [
      { subgroup: '회사·인사', icon: 'building' },
      { href: '/admin/company', label: '회사 정보' },
      { href: '/admin/staff', label: '직원 관리' },
      { href: '/admin/leave', label: '휴가 관리' },

      { subgroup: '거래 마스터', icon: 'contract' },
      { href: '/admin/member', label: '회원사 관리' },
      { href: '/admin/vendor', label: '거래처 관리' },

      { subgroup: '자금', icon: 'wallet' },
      { href: '/admin/card', label: '법인카드' },
      { href: '/admin/account', label: '계좌 관리' },

      { subgroup: '문서·결재', icon: 'fileplus' },
      { href: '/admin/contract', label: '계약서 관리' },
      { href: '/admin/seal', label: '인감 관리' },
      { href: '/admin/approval', label: '전자결재' },

      { subgroup: '개발도구', icon: 'code', href: '/dev' },
    ],
  },
];

/** 아이콘 키워드 → Phosphor class (jpkerp PH_MAP 이식) */
export const PH_MAP: Record<string, string> = {
  home: 'ph-house',
  chart: 'ph-chart-line',
  plus: 'ph-plus-circle',
  trending: 'ph-trend-up',
  searchck: 'ph-magnifying-glass',
  settings: 'ph-gear-six',

  play: 'ph-stack-plus',
  fileup: 'ph-upload-simple',
  circleplus: 'ph-keyboard',
  listcheck: 'ph-list-checks',

  alert: 'ph-warning-circle',
  pause: 'ph-pause-circle',
  storefront: 'ph-storefront',
  clock: 'ph-clock-countdown',
  clipboard: 'ph-shield-check',

  gridcheck: 'ph-car',
  circlecheck: 'ph-stack',
  clipcheck: 'ph-handshake',
  dollar: 'ph-currency-krw',

  info: 'ph-info',
  users: 'ph-users-three',
  wallet: 'ph-credit-card',
  fund: 'ph-bank',
  contract: 'ph-briefcase',
  building: 'ph-buildings',
  fileplus: 'ph-file-text',
  stamp: 'ph-stamp',
  approval: 'ph-check-square',
  leave: 'ph-calendar-check',
  database: 'ph-database',
  code: 'ph-code',

  check: 'ph-check',
  chevron: 'ph-caret-down',
  logout: 'ph-sign-out',
  dot: 'ph-dot-outline',
};

export function iconClass(name?: string): string {
  if (!name) return 'ph-dot-outline';
  return PH_MAP[name] ?? `ph-${name}`;
}
