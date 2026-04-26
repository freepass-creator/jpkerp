'use client';

/**
 * Sidebar — JPK ERP v3 (prototype.html .sidebar 구조)
 * - 172px 폭, 풀하이트, 흰 배경
 * - 브랜드(.sb-brand) · 메뉴(.sb-menu) · 푸터(.sb-foot)
 * - 7-menu 평면 구조 (lib/menu-v3.ts)
 *
 * Phase 12 — 사이드바 카운트 ↔ gap-check 실시간 동기화.
 *  - 미결 카운트는 useGapCheckCounts()로 derive
 *  - 기존 v2 useMenuCounts 스토어와 병존 (v2 메뉴들은 그대로 사용)
 */

import { useAuth } from '@/lib/auth/context';
import { useGapCheckCounts } from '@/lib/hooks/useGapCheckCounts';
import { MENU_V3, type MenuV3Item } from '@/lib/menu-v3';
import { MOBILE_ENTRY_HREF } from '@/lib/menu-v3-mobile';
import { useMenuCounts } from '@/lib/stores/menu-counts';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment } from 'react';

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  // /asset 활성화 — /asset/123 등 하위경로 포함
  return pathname.startsWith(`${href}/`);
}

/** v3 7-menu의 href → gap-check 카운트 키 매핑 */
const GAP_CHECK_HREF: Record<string, keyof ReturnType<typeof useGapCheckCounts>> = {
  '/status/pending': 'pending',
  '/operation': 'journal',
  '/asset': 'asset',
  '/contract': 'contract',
  '/ledger': 'finance',
};

export function Sidebar() {
  const pathname = usePathname();
  const counts = useMenuCounts((s) => s.counts);
  const gapCounts = useGapCheckCounts();
  const { user, signOut } = useAuth();

  const displayName = user?.displayName || user?.email || '로그인 필요';

  const resolveCount = (item: MenuV3Item): number => {
    // 1) gap-check 카운트가 정의된 v3 메뉴는 우선
    const gapKey = GAP_CHECK_HREF[item.href];
    if (gapKey) return gapCounts[gapKey];
    // 2) 그 외 v2 호환 카운트 (countKey)
    if (item.countKey) return counts[item.countKey];
    return 0;
  };

  return (
    <aside className="sidebar">
      <div className="sb-brand">
        <span className="name">JPK ERP</span>
      </div>

      <nav className="sb-menu">
        {MENU_V3.map((section) => {
          const sectionKey = section.items[0]?.href ?? 'section';
          return (
            <Fragment key={sectionKey}>
              {section.divider && <div className="sb-divider" />}
              {section.items.map((item) => (
                <SidebarItem
                  key={item.href}
                  item={item}
                  active={isActive(pathname, item.href)}
                  count={resolveCount(item)}
                />
              ))}
            </Fragment>
          );
        })}
        {/* 모바일 진입점 — 개발도구 아래 */}
        <div className="sb-divider" />
        <SidebarItem
          item={{ href: MOBILE_ENTRY_HREF, label: '모바일', icon: 'ph-device-mobile' }}
          active={pathname.startsWith('/m')}
          count={0}
        />
      </nav>

      <div className="sb-foot">
        <span className="name" title={displayName}>
          {displayName}
        </span>
        <button
          type="button"
          className="logout"
          onClick={() => {
            void signOut();
          }}
        >
          로그아웃
        </button>
      </div>
    </aside>
  );
}

interface SidebarItemProps {
  item: MenuV3Item;
  active: boolean;
  count: number;
}

function SidebarItem({ item, active, count }: SidebarItemProps) {
  // gap-check 5종 메뉴는 countKey 없어도 카운트 노출 (lib/hooks/useGapCheckCounts)
  const isGapCheckMenu = GAP_CHECK_HREF[item.href] !== undefined;
  const showCount = count > 0 && (isGapCheckMenu || !!item.countKey);
  const countClass = item.primary ? 'sb-count' : 'sb-count subtle';

  return (
    <Link href={item.href} className={`sb-item${active ? ' is-active' : ''}`}>
      <span className="ico">
        <i className={`ph ${item.icon}`} />
      </span>
      <span className="label">{item.label}</span>
      {showCount && <span className={countClass}>{count}</span>}
    </Link>
  );
}
