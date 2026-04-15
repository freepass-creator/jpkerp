/**
 * menu-counts.js — 사이드바 메뉴에 레코드 건수 실시간 표시
 *
 * 단순 컬렉션 카운트 + 파생 카운트(현황·필터별) 모두 지원
 */
import { ref, onValue } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js';
import { db } from '../firebase/config.js';

const isActive = r => r && r.status !== 'deleted';

function normalizeDate(s) {
  if (!s) return '';
  let v = String(s).trim().replace(/[./]/g, '-');
  const m = v.match(/^(\d{2})-(\d{1,2})-(\d{1,2})$/);
  if (m) v = `${Number(m[1]) < 50 ? 2000 + Number(m[1]) : 1900 + Number(m[1])}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  return v;
}
function computeContractEnd(c) {
  if (c.end_date) return normalizeDate(c.end_date);
  const s = normalizeDate(c.start_date);
  if (!s || !c.rent_months) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  d.setMonth(d.getMonth() + Number(c.rent_months));
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** 단순 컬렉션 카운트 (status !== 'deleted' 기본) */
const PATHS = [
  { collection: 'assets',           hrefs: ['/asset'] },
  { collection: 'loans',            hrefs: ['/loan'] },
  { collection: 'insurances',       hrefs: ['/insurance'] },
  { collection: 'contracts',        hrefs: ['/contract'] },
  { collection: 'customers',        hrefs: ['/customer'] },
  { collection: 'members',          hrefs: ['/admin/member'] },
  { collection: 'vendors',          hrefs: ['/admin/vendor'] },
  { collection: 'products',         hrefs: ['/product'] },
  { collection: 'billings',         hrefs: ['/billing'] },
  { collection: 'autodebits',       hrefs: ['/autodebit'] },
  { collection: 'finances',         hrefs: ['/finance'] },
  { collection: 'uploads',          hrefs: ['/upload/list', '/input/history'] },
  // 자산 하위 필터 (GPS·매각)
  { collection: 'assets', filterFn: a => isActive(a) && a.gps_installed === 'Y', hrefs: ['/gps'] },
  { collection: 'assets', filterFn: a => isActive(a) && (a.asset_status === '매각예정' || a.asset_status === '폐차'), hrefs: ['/disposal'] },
  // 미납만 (billing/overdue 와 status/overdue 둘 다 표시)
  { collection: 'billings', filterFn: b => {
    if (!isActive(b)) return false;
    const due = (b.amount || 0) - (Number(b.paid_total) || 0);
    const today = new Date().toISOString().slice(0, 10);
    return due > 0 && b.due_date && b.due_date < today;
  }, hrefs: ['/billing/overdue', '/status/overdue'] },
  // 시동제어·회수진행 계약
  { collection: 'contracts', filterFn: c => isActive(c) && ['시동제어','회수결정','회수완료'].includes(c.action_status), hrefs: ['/status/ignition'] },
  // events 유형별
  { collection: 'events', filterFn: e => isActive(e) && e.event_type === 'penalty',      hrefs: ['/admin/notice'] },
  { collection: 'events', filterFn: e => isActive(e) && e.event_type === 'maint',        hrefs: ['/operation/maint'] },
  { collection: 'events', filterFn: e => isActive(e) && e.event_type === 'accident',     hrefs: ['/operation/accident'] },
  { collection: 'events', filterFn: e => isActive(e) && (e.event_type === 'delivery' || e.event_type === 'return'), hrefs: ['/operation/delivery'] },
  { collection: 'events', filterFn: e => isActive(e) && e.event_type === 'contact',      hrefs: ['/operation/contact'] },
  { collection: 'events', filterFn: e => isActive(e) && e.event_type === 'wash',         hrefs: ['/operation/wash'] },
  { collection: 'events', filterFn: e => isActive(e) && e.event_type === 'fuel',         hrefs: ['/operation/fuel'] },
  { collection: 'events', filterFn: e => isActive(e) && e.event_type === 'return_scheduled', hrefs: ['/return-schedule'] },
];

/** 파생 카운트 — 여러 컬렉션 조합. cache[coll] = 객체 맵 */
const DERIVED = [
  // 휴차 = 자산 - 활성계약 차량
  { needs: ['assets', 'contracts'], hrefs: ['/status/idle'], compute: (c) => {
    const today = new Date().toISOString().slice(0, 10);
    const contracts = Object.values(c.contracts || {});
    const activeCars = new Set(contracts.filter(x => {
      if (!isActive(x)) return false;
      if (!x.contractor_name?.trim()) return false;
      const s = normalizeDate(x.start_date);
      if (!s || s > today) return false;
      const e = computeContractEnd(x);
      if (e && e < today) return false;
      return true;
    }).map(x => x.car_number).filter(Boolean));
    return Object.values(c.assets || {}).filter(a => isActive(a) && !activeCars.has(a.car_number)).length;
  }},
  // 만기도래 = 30일 이내 종료 계약
  { needs: ['contracts'], hrefs: ['/status/expiring'], compute: (c) => {
    const today = new Date();
    const t30 = new Date(today.getTime() + 30 * 86400000).toISOString().slice(0, 10);
    const todayStr = today.toISOString().slice(0, 10);
    return Object.values(c.contracts || {}).filter(x => {
      if (!isActive(x) || !x.contractor_name?.trim()) return false;
      const e = computeContractEnd(x);
      return e && e >= todayStr && e <= t30;
    }).length;
  }},
  // 미납현황 = 미납 billings (billing/overdue와 동일)
  { needs: ['billings'], hrefs: ['/status/overdue'], compute: (c) => {
    const today = new Date().toISOString().slice(0, 10);
    return Object.values(c.billings || {}).filter(b => {
      if (!isActive(b)) return false;
      const due = (b.amount || 0) - (Number(b.paid_total) || 0);
      return due > 0 && b.due_date && b.due_date < today;
    }).length;
  }},
];

const _cache = {};
const _counts = {};

function applyCount(href, n) {
  _counts[href] = n;
  document.querySelectorAll(`.sidebar-link[href="${href}"] .sidebar-count`).forEach(el => {
    el.textContent = n > 0 ? n.toLocaleString() : '';
  });
}

function recompute() {
  for (const p of PATHS) {
    const items = Object.values(_cache[p.collection] || {});
    const filtered = p.filterFn ? items.filter(p.filterFn) : items.filter(isActive);
    for (const href of p.hrefs) applyCount(href, filtered.length);
  }
  for (const d of DERIVED) {
    const n = d.compute(_cache);
    for (const href of d.hrefs) applyCount(href, n);
  }
}

const _subscribed = new Set();

export function initMenuCounts() {
  const collections = new Set(PATHS.map(p => p.collection));
  DERIVED.forEach(d => d.needs.forEach(c => collections.add(c)));
  for (const coll of collections) {
    if (_subscribed.has(coll)) continue;
    _subscribed.add(coll);
    onValue(ref(db, coll), snap => {
      _cache[coll] = snap.val() || {};
      recompute();
    });
  }
}

/** 렌더 직후 호출 — 현재 캐시된 카운트를 DOM에 반영 */
export function refreshCountsDom() {
  for (const [href, n] of Object.entries(_counts)) applyCount(href, n);
}
