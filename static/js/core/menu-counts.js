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

/** 단순 컬렉션 카운트 — 현황 메뉴만 */
const PATHS = [
  // 미납 현황
  { collection: 'billings', filterFn: b => {
    if (!isActive(b)) return false;
    const due = (b.amount || 0) - (Number(b.paid_total) || 0);
    const today = new Date().toISOString().slice(0, 10);
    return due > 0 && b.due_date && b.due_date < today;
  }, hrefs: ['/status/overdue'] },
  // 시동제어
  { collection: 'contracts', filterFn: c => isActive(c) && ['시동제어','제어해제'].includes(c.action_status), hrefs: ['/status/ignition'] },
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
  // 미결업무 = 사고미종결 + 차량케어진행 + 미출고 + 보험만기(3개월)
  { needs: ['assets', 'contracts', 'events'], hrefs: ['/status/pending'], compute: (c) => {
    const today = new Date().toISOString().slice(0, 10);
    const todayDate = new Date(today);
    let count = 0;
    const evts = Object.values(c.events || {});
    // 사고미종결
    count += evts.filter(e => isActive(e) && e.type === 'accident' && e.accident_status && e.accident_status !== '종결').length;
    // 차량케어 진행중
    count += evts.filter(e => isActive(e) && ['maint','repair','product','wash'].includes(e.type) && (!e.work_status || e.work_status !== '완료')).length;
    // 미출고
    const delivered = new Set(evts.filter(e => isActive(e) && e.type === 'delivery').map(e => e.car_number));
    const contracts = Object.values(c.contracts || {});
    count += contracts.filter(x => {
      if (!isActive(x) || !x.contractor_name?.trim()) return false;
      const s = normalizeDate(x.start_date);
      if (!s || s > today) return false;
      const e = computeContractEnd(x);
      if (e && e < today) return false;
      return !delivered.has(x.car_number);
    }).length;
    // 보험만기 3개월 이내
    const m3 = new Date(todayDate); m3.setMonth(m3.getMonth() + 3);
    const m3s = m3.toISOString().slice(0, 10);
    count += Object.values(c.assets || {}).filter(a => {
      if (!isActive(a)) return false;
      const exp = normalizeDate(a.insurance_expiry || a.vehicle_age_expiry_date);
      return exp && exp >= today && exp <= m3s;
    }).length;
    return count;
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
