/**
 * pages/home.js — 대시보드
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
  const host = $('#dashHost');
  if (!host) return;
  const today = new Date().toISOString().slice(0, 10);
  const todayDate = new Date(today);
  const thisMonth = today.slice(0, 7);

  // ─── 자산/가동 ──────────────────────────────
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

  // ─── 이번달 반납/출고 ─────────────────────────
  const monthReturns = contracts.filter(c => {
    const end = computeContractEnd(c);
    return end && end.startsWith(thisMonth);
  });
  const monthStarts = contracts.filter(c => {
    const start = normalizeDate(c.start_date);
    return start && start.startsWith(thisMonth);
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
    });

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
    .slice(0, 8);

  // ─── 이번달 신규 계약 ────────────────────────
  const newContracts = contracts.filter(c => {
    const created = c.created_at ? new Date(c.created_at).toISOString().slice(0, 7) : '';
    return created === thisMonth;
  });

  // ─── 렌더 ─────────────────────────────────
  const card = (label, value, sub, color, href) =>
    `<div class="dash-card" ${href ? `onclick="location.href='${href}'" style="cursor:pointer"` : ''}>
      <div style="font-size:11px;color:var(--c-text-muted)">${label}</div>
      <div style="font-size:20px;font-weight:700;${color ? `color:${color}` : ''}">${value}</div>
      ${sub ? `<div style="font-size:10px;color:var(--c-text-muted);margin-top:2px">${sub}</div>` : ''}
    </div>`;

  host.innerHTML = `
    <!-- 1행: 자산/가동 + 수금 -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
      ${card('총 자산', `${totalAssets}대`, `가동률 ${utilizationRate}%`, '', '/asset')}
      ${card('가동중', `${activating}대`, '', 'var(--c-success)', '/asset')}
      ${card('휴차', `${idle}대`, Object.entries(idleByStatus).map(([k, v]) => `${k} ${v.length}`).join(' · ') || '', idle > 0 ? 'var(--c-warn)' : '', '/asset')}
      ${card('금일 입금', fmt(todayInSum), `${todayIn.length}건`, 'var(--c-primary)', '/ledger')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
      ${card('총 청구', fmt(totalDue), `수금률 ${collectRate}%`, '', '/billing')}
      ${card('납부', fmt(totalPaid), '', 'var(--c-success)', '/billing')}
      ${card('미납', fmt(totalUnpaid), `${overdue.length}건`, totalUnpaid > 0 ? 'var(--c-danger)' : 'var(--c-success)', '/billing')}
      ${card('이번달', `출고 ${monthStarts.length} · 반납 ${monthReturns.length}`, `신규 ${newContracts.length}건`, 'var(--c-info)', '/contract')}
    </div>

    <!-- 2행: 만기도래 -->
    <div>
      <div style="font-size:13px;font-weight:600;margin-bottom:8px">만기도래</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
        ${[['1개월 이내', exp1, 'var(--c-danger)'], ['1~2개월', exp2, 'var(--c-warn)'], ['2~3개월', exp3, 'var(--c-text-sub)']].map(([label, items, color]) => `
          <div class="dash-card">
            <div style="font-size:11px;color:var(--c-text-muted);margin-bottom:4px">${label} · <span style="color:${color};font-weight:600">${items.length}건</span></div>
            ${items.slice(0, 5).map(c => `<div style="font-size:11px;display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid var(--c-border)">
              <span>${c.contractor_name || '-'} <span style="color:var(--c-text-muted)">${c.car_number || ''}</span></span>
              <span style="color:${color}">${fmtDate(computeContractEnd(c))}</span>
            </div>`).join('')}
            ${items.length > 5 ? `<div style="font-size:9px;color:var(--c-text-muted);margin-top:4px">외 ${items.length - 5}건</div>` : ''}
            ${!items.length ? '<div style="font-size:11px;color:var(--c-text-muted)">없음</div>' : ''}
          </div>
        `).join('')}
      </div>
    </div>

    <!-- 3행: 미납 구간별 -->
    <div>
      <div style="font-size:13px;font-weight:600;margin-bottom:8px">미납자 연체구간</div>
      <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px">
        ${buckets.map(bk => `<div class="dash-card">
          <div style="font-size:11px;color:var(--c-text-muted)">${bk.label}</div>
          <div style="font-size:18px;font-weight:700;color:${bk.color}">${bk.items.length}<span style="font-size:11px;font-weight:400">건</span></div>
          <div style="font-size:10px;color:${bk.color}">${bk.sum ? fmt(bk.sum) + '원' : '-'}</div>
          ${bk.items.slice(0, 3).map(o => `<div style="font-size:10px;color:var(--c-text-muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${o.contractor_name} ${o.days}일 ${fmt(o.unpaid)}</div>`).join('')}
          ${bk.items.length > 3 ? `<div style="font-size:9px;color:var(--c-text-muted)">외 ${bk.items.length - 3}건</div>` : ''}
        </div>`).join('')}
      </div>
    </div>

    <!-- 4행: 휴차 목록 + 최근 거래 -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div>
        <div style="font-size:13px;font-weight:600;margin-bottom:8px">휴차 ${idle}대</div>
        ${idle ? `<table class="grid-table">
          <thead><tr><th>차량번호</th><th>모델</th><th>상태</th></tr></thead>
          <tbody>${idleAssets.slice(0, 10).map(a => `<tr>
            <td>${a.car_number || '-'}</td>
            <td style="color:var(--c-text-muted)">${a.car_model || '-'}</td>
            <td><span style="font-size:11px;font-weight:500;color:var(--c-warn)">${a.asset_status || '미지정'}</span></td>
          </tr>`).join('')}</tbody>
        </table>
        ${idleAssets.length > 10 ? `<div style="font-size:10px;color:var(--c-text-muted);margin-top:4px">외 ${idleAssets.length - 10}대</div>` : ''}
        ` : '<div style="color:var(--c-text-muted)">휴차 없음</div>'}
      </div>
      <div>
        <div style="font-size:13px;font-weight:600;margin-bottom:8px">최근 거래</div>
        ${recentTx.length ? `<table class="grid-table">
          <thead><tr><th>일자</th><th>내용</th><th class="is-num">금액</th></tr></thead>
          <tbody>${recentTx.map(e => {
            const isIn = e.direction === 'in';
            return `<tr>
              <td style="color:var(--c-text-muted)">${fmtDate(e.date)}</td>
              <td>${e.counterparty || e.summary || '-'}</td>
              <td class="is-num" style="color:${isIn ? 'var(--c-success)' : 'var(--c-danger)'}">${isIn ? '+' : '-'}${fmt(e.amount)}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>` : '<div style="color:var(--c-text-muted)">거래 없음</div>'}
      </div>
    </div>
  `;
}

export async function mount() {
  watchAssets((items) => { assets = items; render(); });
  watchContracts((items) => { contracts = items; render(); });
  watchBillings((items) => { billings = items; render(); });
  watchEvents((items) => { events = items; render(); });
}
