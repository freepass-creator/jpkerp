'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { MENU, iconClass, type MenuGroup, type MenuLink, type MenuSubgroup, type MenuEntry } from '@/lib/menu';
import { useMenuCounts, countFor } from '@/lib/stores/menu-counts';
import { useAuth } from '@/lib/auth/context';
import { can, policyForPath } from '@/lib/auth/rbac';

interface SubBucket {
  subgroup: string | null;
  icon: string | null;
  href?: string;
  items: MenuLink[];
}

function splitBuckets(children: Array<MenuLink | MenuSubgroup>): SubBucket[] {
  const out: SubBucket[] = [];
  let cur: SubBucket = { subgroup: null, icon: null, items: [] };
  for (const c of children) {
    if ('subgroup' in c) {
      if (cur.items.length || cur.subgroup) out.push(cur);
      cur = { subgroup: c.subgroup, icon: c.icon ?? null, href: c.href, items: [] };
    } else {
      cur.items.push(c);
    }
  }
  if (cur.items.length || cur.subgroup) out.push(cur);
  return out;
}

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  // 권한 기반 메뉴 필터
  const allowedMenu = useMemo<MenuEntry[]>(() => {
    const checkHref = (href: string) => {
      const policy = policyForPath(href);
      if (!policy) return true;
      return !!user && can(user.role, policy);
    };
    return MENU.map((entry) => {
      if ('group' in entry) {
        const filtered = entry.children.filter((c) => {
          if ('href' in c && c.href) return checkHref(c.href);
          if ('subgroup' in c && c.href) return checkHref(c.href);
          return true;
        });
        // 서브그룹 헤더만 남고 링크 없으면 그룹 자체 숨김
        const realLinks = filtered.filter((c) => 'href' in c);
        if (realLinks.length === 0) return null;
        return { ...entry, children: filtered };
      }
      return checkHref(entry.href) ? entry : null;
    }).filter((x): x is MenuEntry => !!x);
  }, [user]);

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <Link
          href="/"
          className="text-text" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', width: '100%', height: '100%' }}
          aria-label="홈"
        />
      </div>
      <nav className="sidebar-menu">
        {allowedMenu.map((entry) => {
          if ('group' in entry) {
            return <MenuGroupBlock key={entry.group} group={entry} pathname={pathname} />;
          }
          return (
            <SidebarLink
              key={entry.href}
              item={entry}
              active={pathname === entry.href}
              depth={0}
            />
          );
        })}
      </nav>
      <div className="sidebar-bottom">
        <button
          type="button"
          className="sidebar-link"
          style={{ margin: 0, width: '100%' }}
          onClick={() => {
            const ev = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
            window.dispatchEvent(ev);
          }}
        >
          <i className="ph ph-magnifying-glass" />
          <span className="sidebar-link-label">검색</span>
          <span className="sidebar-kbd">⌘K</span>
        </button>
      </div>
    </aside>
  );
}

function MenuGroupBlock({ group, pathname }: { group: MenuGroup; pathname: string }) {
  const buckets = splitBuckets(group.children);
  const hasActive = group.children.some(
    (c) => 'href' in c && c.href === pathname,
  );
  const key = `menu_${group.group}`;
  const [open, setOpen] = useState<boolean>(false);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(key) : null;
    setOpen(hasActive || saved === '1');
  }, [hasActive, key]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem(key, next ? '1' : '0'); } catch {}
  };

  return (
    <div className={`sidebar-group ${open ? 'is-open' : ''}`} data-group={group.group}>
      <button type="button" className="sidebar-group-head" onClick={toggle}>
        <i className={`ph ${iconClass(group.icon)}`} />
        <span className="sidebar-link-label">{group.group}</span>
        <i className="ph ph-caret-down sidebar-chevron" />
      </button>
      <div className="sidebar-group-body">
        {buckets.map((b) => {
          if (!b.subgroup) {
            return b.items.map((c) => (
              <SidebarLink key={c.href} item={c} active={pathname === c.href} depth={1} />
            ));
          }
          return (
            <SubgroupBlock
              key={b.subgroup}
              bucket={b}
              pathname={pathname}
              groupKey={`${key}_${b.subgroup}`}
            />
          );
        })}
      </div>
    </div>
  );
}

function SubgroupBlock({
  bucket,
  pathname,
  groupKey,
}: {
  bucket: SubBucket;
  pathname: string;
  groupKey: string;
}) {
  const hasActive = bucket.items.some((c) => c.href === pathname);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(groupKey) : null;
    setOpen(hasActive || saved === '1');
  }, [hasActive, groupKey]);

  // 서브그룹 자체가 링크 (href 있고 children 없는 경우)
  if (bucket.href && bucket.items.length === 0) {
    const active = pathname === bucket.href;
    return (
      <Link
        href={bucket.href}
        className={`sidebar-subgroup ${active ? 'is-active' : ''}`}
        style={{ textDecoration: 'none' }}
      >
        {bucket.icon && <i className={`ph ${iconClass(bucket.icon)}`} />}
        <span className="sidebar-link-label">{bucket.subgroup}</span>
      </Link>
    );
  }

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem(groupKey, next ? '1' : '0'); } catch {}
  };

  return (
    <div className={`sidebar-subgroup-wrap ${open ? 'is-open' : ''}`}>
      <button type="button" className="sidebar-subgroup" onClick={toggle}>
        {bucket.icon && <i className={`ph ${iconClass(bucket.icon)}`} />}
        <span className="sidebar-link-label">{bucket.subgroup}</span>
        <i className="ph ph-caret-down sidebar-subgroup-chevron" />
      </button>
      <div className="sidebar-subgroup-body">
        {bucket.items.map((c, i) => (
          <SidebarLink key={c.href} item={c} active={pathname === c.href} index={i + 1} depth={2} />
        ))}
      </div>
    </div>
  );
}

function SidebarLink({
  item,
  active,
  index,
  depth = 0,
}: {
  item: MenuLink;
  active: boolean;
  index?: number;
  depth?: number;
}) {
  const counts = useMenuCounts((s) => s.counts);
  const count = countFor(item.href, counts);
  const classes = ['sidebar-link'];
  if (depth > 0) classes.push('sidebar-child');
  if (active) classes.push('is-active');

  // 현황 페이지에만 숫자 표시
  const isStatus = item.href.startsWith('/status/');
  const isUrgent = (item.href === '/status/overdue' || item.href === '/status/pending' || item.href === '/status/ignition') && count > 0;
  const countClass = isUrgent ? 'sidebar-count urgent' : 'sidebar-count';

  return (
    <Link href={item.href} className={classes.join(' ')}>
      {index !== undefined && <span className="sidebar-num">{index}</span>}
      {item.icon && <i className={`ph ${iconClass(item.icon)}`} />}
      <span className="sidebar-link-label">{item.label}</span>
      {isStatus && count > 0 && <span className={countClass}>{count}</span>}
    </Link>
  );
}
