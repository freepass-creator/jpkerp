/**
 * MENU_V3 — JPK ERP v3 7-menu config
 * - 4그룹 (현황+업무 / 자산+계약+재무 / 일반+개발)
 * - Phosphor 아이콘 클래스만 보관 (i.ph + iconClass)
 * - 기존 v2 라우트로 매핑 (점진 전환)
 */

import type { MenuCounts } from '@/lib/stores/menu-counts';

export interface MenuV3Item {
  /** 라우트 (v2 페이지 그대로 매핑) */
  href: string;
  /** 사이드바에 표시되는 한글 이름 */
  label: string;
  /** Phosphor 아이콘 클래스 (예: ph-push-pin) */
  icon: string;
  /** 카운트 뱃지 키 — MenuCounts 필드명 */
  countKey?: keyof MenuCounts;
  /** 강조 뱃지 (빨간색) — 미설정 시 subtle */
  primary?: boolean;
}

export interface MenuV3Section {
  /** 섹션 사이 sb-divider 표시 여부 — 첫 섹션은 false */
  divider: boolean;
  items: MenuV3Item[];
}

export const MENU_V3: MenuV3Section[] = [
  {
    divider: false,
    items: [
      {
        href: '/',
        label: '대시보드',
        icon: 'ph-chart-line',
      },
      {
        href: '/status/pending',
        label: '업무현황',
        icon: 'ph-push-pin',
        countKey: 'pending',
        primary: true,
      },
      {
        href: '/operation',
        label: '업무관리',
        icon: 'ph-notebook',
        countKey: 'operation',
      },
    ],
  },
  {
    divider: true,
    items: [
      {
        href: '/asset',
        label: '자산관리',
        icon: 'ph-car-simple',
        countKey: 'asset',
      },
      {
        href: '/contract',
        label: '계약관리',
        icon: 'ph-clipboard-text',
        countKey: 'contract',
      },
      {
        href: '/ledger',
        label: '재무관리',
        icon: 'ph-coins',
      },
    ],
  },
  {
    divider: true,
    items: [
      {
        href: '/admin/company',
        label: '일반관리',
        icon: 'ph-folders',
      },
      {
        href: '/dev',
        label: '개발도구',
        icon: 'ph-wrench',
      },
    ],
  },
];

/** 평탄화 — 빠른 lookup 용 */
export const MENU_V3_FLAT: MenuV3Item[] = MENU_V3.flatMap((s) => s.items);

/** href → 라벨 (브레드크럼·문서 타이틀 등에 사용) */
export function labelForHref(href: string): string | null {
  // 정확 일치 우선
  const exact = MENU_V3_FLAT.find((m) => m.href === href);
  if (exact) return exact.label;
  // prefix 매칭 (가장 긴 prefix 우선)
  const sorted = [...MENU_V3_FLAT].sort((a, b) => b.href.length - a.href.length);
  const pref = sorted.find((m) => href.startsWith(`${m.href}/`) || href === m.href);
  return pref ? pref.label : null;
}
