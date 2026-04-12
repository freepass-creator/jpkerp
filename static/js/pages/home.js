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
  const company = $('#dashCompany');
  const team = $('#dashTeam');
  const my = $('#dashMy');
  if (!company || !team || !my) return;
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

  const allEvents = events;
  const EVENT_ICONS = { maintenance:'🔧', maint:'🔧', accident:'💥', penalty:'🚫', delivery:'🚗', return:'🔙', force:'🚨', transfer:'🔄', key:'🔑', contact:'📞', wash:'🧼', fuel:'⛽', insurance:'🛡', repair:'🔨', product:'✨', collect:'📨', parts:'🔧', fix:'🛠' };

  const recentOps = allEvents
    .filter(e => e.type && e.created_at)
    .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
    .slice(0, 10);
  const miniCard = (label, value, color) => `<div style="text-align:center"><div style="font-size:20px;font-weight:700;${color ? `color:${color}` : ''}">${value}</div><div style="font-size:var(--font-size-xs);color:var(--c-text-muted)">${label}</div></div>`;

  const progressBar = (label, value, max, color) => {
    const pct = max ? Math.min(100, Math.round(value / max * 100)) : 0;
    return `<div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;font-size:var(--font-size-sm);margin-bottom:3px">
        <span>${label}</span><span style="font-weight:600;color:${color}">${pct}%</span>
      </div>
      <div style="height:6px;background:var(--c-bg-hover);border-radius:3px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:${color};border-radius:3px"></div>
      </div>
    </div>`;
  };

  // ─── 회사현황 ─────────────────────────
  company.innerHTML = `
    <div style="display:flex;justify-content:space-around;padding:8px 0">
      ${miniCard('총자산', `${totalAssets}대`)}
      ${miniCard('가동', `${activating}대`, 'var(--c-success)')}
      ${miniCard('휴차', `${idle}대`, idle > 0 ? 'var(--c-warn)' : 'var(--c-success)')}
    </div>
    <div class="dash-card" style="padding:10px 14px">
      ${progressBar('가동률', activating, totalAssets, utilizationRate >= 80 ? 'var(--c-success)' : 'var(--c-warn)')}
      ${progressBar('수금률', totalPaid, totalDue, collectRate >= 90 ? 'var(--c-success)' : collectRate >= 70 ? 'var(--c-warn)' : 'var(--c-danger)')}
    </div>
    <div class="dash-card" onclick="location.href='/billing'">
      <div style="display:flex;justify-content:space-around;text-align:center">
        <div><div style="font-size:var(--font-size-xs);color:var(--c-text-muted)">청구</div><div style="font-weight:700">${fmt(totalDue)}</div></div>
        <div><div style="font-size:var(--font-size-xs);color:var(--c-text-muted)">납부</div><div style="font-weight:700;color:var(--c-success)">${fmt(totalPaid)}</div></div>
        <div><div style="font-size:var(--font-size-xs);color:var(--c-text-muted)">미납</div><div style="font-weight:700;color:${totalUnpaid > 0 ? 'var(--c-danger)' : 'var(--c-success)'}">${fmt(totalUnpaid)}</div></div>
      </div>
    </div>
    <div style="display:flex;justify-content:space-around;padding:4px 0">
      ${miniCard('금일입금', fmt(todayInSum), 'var(--c-primary)')}
      ${miniCard(`출고`, `${monthStarts.length}건`)}
      ${miniCard(`반납`, `${monthReturns.length}건`)}
    </div>
    <div class="dash-card" onclick="location.href='/billing'" style="padding:10px 14px">
      <div style="font-size:var(--font-size-xs);color:var(--c-text-muted);margin-bottom:6px">연체 구간</div>
      ${buckets.map(bk => bucketBar(bk)).join('')}
    </div>
  `;

  // ─── 부서할일 ─────────────────────────
  team.innerHTML = `
    <div class="dash-card" onclick="location.href='/billing'" style="border-left:3px solid var(--c-danger)">
      <div style="font-weight:600;color:var(--c-danger);margin-bottom:4px">🔴 미납 독촉 ${overdue.length}건</div>
      <div style="display:flex;gap:12px;font-size:var(--font-size-sm)">
        <span>7일+ <strong>${overdue.filter(o => o.days >= 7).length}</strong></span>
        <span>30일+ <strong style="color:#991b1b">${overdue.filter(o => o.days >= 30).length}</strong></span>
        <span style="margin-left:auto;color:var(--c-danger);font-weight:600">${fmt(totalUnpaid)}원</span>
      </div>
    </div>
    <div class="dash-card" onclick="location.href='/contract'" style="border-left:3px solid var(--c-warn)">
      <div style="font-weight:600;color:var(--c-warn);margin-bottom:4px">🟡 만기 도래 ${exp1.length + exp2.length + exp3.length}건</div>
      <div style="display:flex;gap:12px;font-size:var(--font-size-sm)">
        <span>1개월 <strong style="color:var(--c-danger)">${exp1.length}</strong></span>
        <span>2개월 <strong>${exp2.length}</strong></span>
        <span>3개월 <strong>${exp3.length}</strong></span>
      </div>
    </div>
    <div class="dash-card" onclick="location.href='/asset'" style="border-left:3px solid var(--c-info)">
      <div style="font-weight:600;color:var(--c-info);margin-bottom:4px">🔵 휴차 ${idle}대</div>
      <div style="display:flex;gap:8px;font-size:var(--font-size-sm);flex-wrap:wrap">
        ${Object.entries(idleByStatus).map(([st, items]) => `<span>${st} <strong>${items.length}</strong></span>`).join('') || '<span style="color:var(--c-success)">전차 가동</span>'}
      </div>
    </div>
  `;

  // ─── 최근업무 (실시간 타임라인) ─────────
  const allRecentOps = allEvents
    .filter(e => e.created_at)
    .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
    .slice(0, 30);

  const timeAgo = (ts) => {
    if (!ts) return '';
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return '방금';
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    const d = new Date(ts);
    return `${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  if (!allRecentOps.length) {
    my.innerHTML = '<div style="padding:24px;text-align:center;color:var(--c-text-muted);font-size:var(--font-size-sm)">아직 업무 기록이 없습니다</div>';
  } else {
    my.innerHTML = allRecentOps.map(e => `
      <div class="recent-item" data-id="${e.event_id || ''}" style="display:flex;gap:8px;padding:8px 4px;border-bottom:1px solid var(--c-border);font-size:var(--font-size-sm);cursor:pointer;transition:background var(--t-fast)">
        <span style="flex-shrink:0;font-size:14px">${EVENT_ICONS[e.type] || '📝'}</span>
        <div style="flex:1;min-width:0">
          <div style="display:flex;justify-content:space-between;gap:4px">
            <span style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e.title || e.type || '-'}</span>
            <span style="flex-shrink:0;color:var(--c-text-muted);font-size:var(--font-size-xs)">${timeAgo(e.created_at)}</span>
          </div>
          <div style="color:var(--c-text-muted);font-size:var(--font-size-xs)">
            ${e.car_number || ''} ${e.assignee ? `· 담당: ${e.assignee}` : ''}
          </div>
          <div style="display:flex;gap:8px;margin-top:4px">
            <span class="like-btn" data-id="${e.event_id || ''}" style="font-size:var(--font-size-xs);color:var(--c-text-muted);cursor:pointer">👍 ${e.likes || 0}</span>
            <span style="font-size:var(--font-size-xs);color:var(--c-text-muted)">💬 ${e.comment_count || 0}</span>
          </div>
        </div>
      </div>
    `).join('');

    // 클릭 → 운영관리 상세
    my.querySelectorAll('.recent-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.like-btn')) return;
        navigateTo('/operation');
      });
      el.addEventListener('mouseenter', () => { el.style.background = 'var(--c-bg-hover)'; });
      el.addEventListener('mouseleave', () => { el.style.background = ''; });
    });
  }
}

export async function mount() {
  watchAssets((items) => { assets = items; render(); });
  watchContracts((items) => { contracts = items; render(); });
  watchBillings((items) => { billings = items; render(); });
  watchEvents((items) => { events = items; render(); });
}
