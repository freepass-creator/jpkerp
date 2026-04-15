/**
 * breadcrumb.js — 상단바 중앙 브레드크럼
 *
 * 메뉴 구조에서 현재 URL에 해당하는 경로를 찾아 표시
 * 예: 조회 › 자산·차량 › 할부 (12건)
 */
import { MENU } from './menu.js';

/**
 * 현재 경로의 브레드크럼 찾기
 * @param {string} pathname
 * @returns {{group:string, subgroup:string|null, label:string}|null}
 */
export function findBreadcrumb(pathname) {
  for (const item of MENU) {
    if (item.href === pathname) {
      return { group: null, subgroup: null, label: item.label };
    }
    if (item.group && item.children) {
      let currentSubgroup = null;
      for (const c of item.children) {
        if (c.subgroup) {
          currentSubgroup = c.subgroup;
          continue;
        }
        if (c.href === pathname) {
          return { group: item.group, subgroup: currentSubgroup, label: c.label };
        }
      }
    }
  }
  return null;
}

/** 상단바 브레드크럼 렌더 */
export function renderBreadcrumb(host, pathname, countText = '') {
  if (!host) return;
  const bc = findBreadcrumb(pathname);
  if (!bc) {
    host.innerHTML = '';
    return;
  }
  const sep = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.4"><polyline points="9 18 15 12 9 6"/></svg>`;
  const parts = [];
  if (bc.group) parts.push(`<span style="color:var(--c-text-muted)">${bc.group}</span>`);
  if (bc.subgroup) parts.push(`<span style="color:var(--c-text-muted)">${bc.subgroup}</span>`);
  parts.push(`<span style="color:var(--c-text);font-weight:var(--fw-medium)">${bc.label}</span>`);
  if (countText) parts.push(`<span style="color:var(--c-text-muted)">${countText}</span>`);
  host.innerHTML = parts.join(sep);
}

/** 건수만 갱신 */
export function updateBreadcrumbCount(countText) {
  const host = document.getElementById('topbarBreadcrumb');
  if (host) renderBreadcrumb(host, window.location.pathname, countText);
}
