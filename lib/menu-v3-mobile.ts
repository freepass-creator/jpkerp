/**
 * MENU_V3_MOBILE — JPK ERP v3 mobile bottom-tab + entry config
 * - 데스크톱 사이드바 하단 "모바일" 진입점에서도 참조
 * - 5개 핵심 모바일 화면 (현장 직원용)
 * - app/m/layout.tsx 의 m-tabbar 와 별개로 유지 (탭바는 4개 핵심만)
 */

export interface MenuV3MobileItem {
  href: string;
  label: string;
  icon: string;
  sub?: string;
}

export const MENU_V3_MOBILE: MenuV3MobileItem[] = [
  { href: '/m/todo', label: '오늘 할 일', icon: 'ph-list-checks', sub: '미결업무 요약' },
  { href: '/m/upload', label: '사진 업로드', icon: 'ph-camera', sub: '등록증·보험·과태료' },
  { href: '/m/task', label: '업무', icon: 'ph-clipboard-text', sub: '현장 작업 바로가기' },
  { href: '/m/scan', label: '차량 조회', icon: 'ph-magnifying-glass', sub: '계약·이력·미납' },
  { href: '/m/ocr', label: 'OCR 스캔', icon: 'ph-qr-code', sub: '단건 인식·저장' },
  { href: '/m/settings', label: '설정', icon: 'ph-gear' },
];

/** 모바일 진입 기본 경로 (사이드바 "모바일" 메뉴 클릭 시) */
export const MOBILE_ENTRY_HREF = '/m/todo';
