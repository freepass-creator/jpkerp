'use client';

/**
 * Sidebar — JPK ERP v3 (prototype.html .sidebar 구조)
 * - 172px 폭, 풀하이트, 흰 배경
 * - 브랜드(.sb-brand) · 메뉴(.sb-menu) · 푸터(.sb-foot)
 * - 7-menu 평면 구조 (lib/menu-v3.ts)
 */

import { useAuth } from '@/lib/auth/context';
import { MENU_V3, type MenuV3Item } from '@/lib/menu-v3';
import { useMenuCounts } from '@/lib/stores/menu-counts';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment } from 'react';

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  // /asset 활성화 — /asset/123 등 하위경로 포함
  return pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();
  const counts = useMenuCounts((s) => s.counts);
  const { user, signOut } = useAuth();

  const displayName = user?.displayName || user?.email || '로그인 필요';

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
                  count={item.countKey ? counts[item.countKey] : 0}
                />
              ))}
            </Fragment>
          );
        })}
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
  const showCount = count > 0 && !!item.countKey;
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
