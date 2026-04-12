/**
 * pages/home.js — 대시보드
 *
 * 좌: 숫자 (현황 파악) — 자산/가동/수금/금일입금
 * 우: 업무 (액션) — 미납자/만기도래/휴차/최근거래
 */
import { watchAssets } from '../firebase/assets.js';
import { watchContracts } from '../firebase/contracts.js';
import { watchBillings, computeTotalDue } from '../firebase/billings.js';
import { watchEvents } from '../firebase/events.js';

const $ = (s) => document.querySelector(s);
const fmt = (v) => Number(v || 0).toLocaleString('ko-KR');
const fmtDate = (s) => {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1].slice(2)}.${m[2]}.${m[3]}` : s;
};

function normalizeDate(s) {
  if (!s) return '';
  let v = String(s).trim().replace(/[./]/g, '-');
  const m = v.match(/^(\d{2})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const yy = Number(m[1]);
    v = `${yy < 50 ? 2000 + yy : 1900 + yy}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  return v;
}

function computeContractEnd(c) {
  if (c.end_date) return normalizeDate(c.end_date);
  const start = normalizeDate(c.start_date);
  if (!start || !c.rent_months) return '';
  const d = new Date(start);
  if (isNaN(d.getTime())) return '';
  d.setMonth(d.getMonth() + Number(c.rent_months));
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let assets = [], contracts = [], billings = [], events = [];

function render() {
  const left = $('#dashLeft');
  const right = $('#dashRight');
  if (!left || !right) return;
  const today = new Date().toISOString().slice(0, 10);
  const todayDate = new Date(today);
  const thisMonth = today.slice(0, 7);

  // ─── 자산 ───────────────────────────────────
  const activeContracts = contracts.filter(c => {
    const start = normalizeDate(c.start_date);
    const end = computeContractEnd(c);
    if (!start) return false;
    if (!end) return start <= today;
    return start <= today && end >= today;
  });
  const activeCars = new Set(activeContracts.map(c => c.car_number));
  const totalAssets = assets.length;
  const activating = activeCars.size;
  const idle = totalAssets - activating;
  const utilizationRate = totalAssets ? Math.round(activating / totalAssets * 100) : 0;

  // 휴차 분류
  const idleAssets = assets.filter(a => !activeCars.has(a.car_number));
  const idleByStatus = {};
  idleAssets.forEach(a => {
    const st = a.asset_status || '미지정';
    if (!idleByStatus[st]) idleByStatus[st] = [];
    idleByStatus[st].push(a);
  });

  // ─── 청구/납부/미납 ─────────────────────────
  const totalDue = billings.reduce((s, b) => s + computeTotalDue(b), 0);
  const totalPaid = billings.reduce((s, b) => s + (Number(b.paid_total) || 0), 0);
  const totalUnpaid = totalDue - totalPaid;
  const collectRate = totalDue ? Math.round(totalPaid / totalDue * 100) : 0;

  // ─── 금일 입금 ──────────────────────────────
  const todayIn = events.filter(e => e.date === today && e.direction === 'in');
  const todayInSum = todayIn.reduce((s, e) => s + (e.amount || 0), 0);

  // ─── 이번달 ─────────────────────────────────
  const monthReturns = contracts.filter(c => {
    const end = computeContractEnd(c);
    return end && end.startsWith(thisMonth);
  });
  const monthStarts = contracts.filter(c => {
    const start = normalizeDate(c.start_date);
    return start && start.startsWith(thisMonth);
  });
  const newContracts = contracts.filter(c => {
    const created = c.created_at ? new Date(c.created_at).toISOString().slice(0, 7) : '';
    return created === thisMonth;
  });

  // ─── 만기도래 ───────────────────────────────
  const offsetDate = (months) => {
    const d = new Date(todayDate);
    d.setMonth(d.getMonth() + months);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const m1 = offsetDate(1), m2 = offsetDate(2), m3 = offsetDate(3);
  const expiringIn = (from, to) => contracts.filter(c => {
    const end = computeContractEnd(c);
    return end && end >= from && end < to;
  });
  const exp1 = expiringIn(today, m1);
  const exp2 = expiringIn(m1, m2);
  const exp3 = expiringIn(m2, m3);

  // ─── 미납 구간별 ───────────────────────────
  const overdue = billings
    .filter(b => {
      const due = computeTotalDue(b);
      const paid = Number(b.paid_total) || 0;
      return paid < due && b.due_date && b.due_date < today;
    })
    .map(b => {
      const c = contracts.find(x => x.contract_code === b.contract_code) || {};
      const due = computeTotalDue(b);
      const paid = Number(b.paid_total) || 0;
      const days = Math.floor((todayDate - new Date(b.due_date)) / 86400000);
      return { ...b, contractor_name: c.contractor_name || '-', car_number: c.car_number || '-', unpaid: due - paid, days };
    })
    .sort((a, b) => b.days - a.days);

  const buckets = [
    { label: '3일이하', min: 1, max: 3, color: 'var(--c-text-sub)' },
    { label: '4~7일', min: 4, max: 7, color: 'var(--c-warn)' },
    { label: '8~10일', min: 8, max: 10, color: 'var(--c-warn)' },
    { label: '10~20일', min: 11, max: 20, color: '#dc2626' },
    { label: '20~30일', min: 21, max: 30, color: '#dc2626' },
    { label: '30일이상', min: 31, max: 99999, color: '#991b1b' },
  ];
  buckets.forEach(bk => {
    bk.items = overdue.filter(o => o.days >= bk.min && o.days <= bk.max);
    bk.sum = bk.items.reduce((s, o) => s + o.unpaid, 0);
  });

  // ─── 최근 거래 ──────────────────────────────
  const recentTx = events
    .filter(e => e.type === 'bank_tx' || e.type === 'card_tx')
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, 10);

  // ─── 렌더 ─────────────────────────────────
  const card = (label, value, sub, color, href) =>
    `<div class="dash-card" ${href ? `onclick="location.href='${href}'"` : ''}>
      <div class="dash-card__label">${label}</div>
      <div class="dash-card__value"${color ? ` style="color:${color}"` : ''}>${value}</div>
      ${sub ? `<div class="dash-card__sub">${sub}</div>` : ''}
    </div>`;

  const maxBucket = Math.max(...buckets.map(b => b.items.length), 1);
  const bucketBar = (bk) => {
    const pct = Math.round(bk.items.length / maxBucket * 100);
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
      <div style="width:60px;font-size:var(--font-size-sm);color:var(--c-text-muted);flex-shrink:0">${bk.label}</div>
      <div style="flex:1;height:16px;background:var(--c-bg-hover);border-radius:2px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:${bk.color};border-radius:2px;opacity:0.7"></div>
      </div>
      <div style="width:40px;text-align:right;font-size:var(--font-size-sm);font-weight:600;color:${bk.color}">${bk.items.length}건</div>
      <div style="width:80px;text-align:right;font-size:var(--font-size-xs);color:${bk.color}">${bk.sum ? fmt(bk.sum) : '-'}</div>
    </div>`;
  };

  // ─── 좌측: 지표 ─────────────────────────────
  left.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
      ${card('총 자산', `${totalAssets}대`, `가동률 ${utilizationRate}%`, '', '/asset')}
      ${card('가동중', `${activating}대`, '', 'var(--c-success)', '/asset')}
      ${card('휴차', `${idle}대`, Object.entries(idleByStatus).map(([k, v]) => `${k} ${v.length}`).join(' · ') || '없음', idle > 0 ? 'var(--c-warn)' : 'var(--c-success)', '/asset')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
      ${card('총 청구', fmt(totalDue), `수금률 ${collectRate}%`, '', '/billing')}
      ${card('납부', fmt(totalPaid), '', 'var(--c-success)', '/billing')}
      ${card('미납', fmt(totalUnpaid), `${overdue.length}건`, totalUnpaid > 0 ? 'var(--c-danger)' : 'var(--c-success)', '/billing')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      ${card('금일 입금', fmt(todayInSum), `${todayIn.length}건`, 'var(--c-primary)', '/ledger')}
      ${card('이번달', `출고 ${monthStarts.length} · 반납 ${monthReturns.length}`, `신규 ${newContracts.length}건`, 'var(--c-info)', '/contract')}
    </div>
  `;

  // ─── 우측: 할 일 ────────────────────────────
  right.innerHTML = `
    <div class="section-label" style=";color:var(--c-danger)">미납 독촉</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
      ${card('미납자', `${overdue.length}건`, fmt(totalUnpaid) + '원', overdue.length ? 'var(--c-danger)' : 'var(--c-success)', '/billing')}
      ${card('7일+', `${overdue.filter(o => o.days >= 7).length}건`, '', overdue.some(o => o.days >= 7) ? 'var(--c-danger)' : '', '/billing')}
      ${card('30일+', `${overdue.filter(o => o.days >= 30).length}건`, '', overdue.some(o => o.days >= 30) ? '#991b1b' : '', '/billing')}
    </div>

    <div class="section-label" style=";margin-top:8px;color:var(--c-warn)">만기 협의</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
      ${card('1개월 이내', `${exp1.length}건`, '', exp1.length ? 'var(--c-danger)' : '', '/contract')}
      ${card('1~2개월', `${exp2.length}건`, '', exp2.length ? 'var(--c-warn)' : '', '/contract')}
      ${card('2~3개월', `${exp3.length}건`, '', '', '/contract')}
    </div>

    <div class="section-label" style=";margin-top:8px">출고 대기</div>
    <div style="display:grid;grid-template-columns:repeat(${Math.max(Object.keys(idleByStatus).length, 2)},1fr);gap:8px">
      ${Object.keys(idleByStatus).length ? Object.entries(idleByStatus).map(([st, items]) =>
        card(st, `${items.length}대`, '', 'var(--c-warn)', '/asset')
      ).join('') : card('휴차', '0대', '전차 가동중', 'var(--c-success)', '/asset')}
    </div>

    <div class="section-label" style=";margin-top:8px">연체 구간</div>
    <div style="cursor:pointer" onclick="location.href='/billing'">
      ${buckets.map(bk => bucketBar(bk)).join('')}
    </div>
  `;
}

export async function mount() {
  watchAssets((items) => { assets = items; render(); });
  watchContracts((items) => { contracts = items; render(); });
  watchBillings((items) => { billings = items; render(); });
  watchEvents((items) => { events = items; render(); });
}
