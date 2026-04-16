/**
 * pages/home.js — 대시보드 (Phosphor 아이콘 · 색상 구분)
 *
 * 좌: 운영 지표 (차량·매출·수금·미납)
 * 중: 업무 상황 (이번달 계약·정비·사고·고객센터)
 * 우: 미결업무 (계약→미출고 · 통장 미매칭 · 사고 미종결 등)
 */
import { watchAssets } from '../firebase/assets.js';
import { watchContracts } from '../firebase/contracts.js';
import { watchBillings, computeTotalDue } from '../firebase/billings.js';
import { watchEvents } from '../firebase/events.js';

const $ = (s) => document.querySelector(s);
const fmt = (v) => Number(v || 0).toLocaleString('ko-KR');

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

// 이벤트 타입별 Phosphor 아이콘 + 색상 (운영업무입력과 동일)
const EVENT_META = {
  contact:     { icon: 'ph-phone',              color: '#3b82f6' },
  delivery:    { icon: 'ph-truck',              color: '#10b981' },
  return:      { icon: 'ph-arrow-u-down-left',  color: '#059669' },
  force:       { icon: 'ph-warning-octagon',    color: '#dc2626' },
  transfer:    { icon: 'ph-arrows-left-right',  color: '#14b8a6' },
  key:         { icon: 'ph-key',                color: '#f59e0b' },
  maint:       { icon: 'ph-wrench',             color: '#f97316' },
  maintenance: { icon: 'ph-wrench',             color: '#f97316' },
  accident:    { icon: 'ph-car-profile',        color: '#ef4444' },
  repair:      { icon: 'ph-hammer',             color: '#ea580c' },
  penalty:     { icon: 'ph-prohibit',           color: '#b91c1c' },
  product:     { icon: 'ph-sparkle',            color: '#8b5cf6' },
  insurance:   { icon: 'ph-shield-check',       color: '#7c3aed' },
  collect:     { icon: 'ph-envelope',           color: '#2563eb' },
  wash:        { icon: 'ph-drop',               color: '#a855f7' },
  fuel:        { icon: 'ph-gas-pump',           color: '#c026d3' },
  bank_tx:     { icon: 'ph-bank',               color: '#059669' },
  card_tx:     { icon: 'ph-credit-card',        color: '#2563eb' },
};
const iconHtml = (type, size = 14) => {
  const m = EVENT_META[type] || { icon: 'ph-circle', color: '#9b9a97' };
  return `<i class="ph ${m.icon}" style="color:${m.color};font-size:${size}px"></i>`;
};

function render() {
  const company = $('#dashCompany');
  const team = $('#dashTeam');
  const my = $('#dashMy');
  if (!company || !team || !my) return;

  const today = new Date().toISOString().slice(0, 10);
  const todayDate = new Date(today);
  const thisMonth = today.slice(0, 7);

  // ─── 활성 계약 / 가동 차량 ─────────────────
  const activeContracts = contracts.filter(c => {
    if (c.status === 'deleted') return false;
    if (!c.contractor_name || !String(c.contractor_name).trim()) return false;
    const start = normalizeDate(c.start_date);
    const end = computeContractEnd(c);
    if (!start) return false;
    if (!end) return start <= today;
    return start <= today && end >= today;
  });
  const activeCars = new Set(activeContracts.map(c => c.car_number));
  const totalAssets = assets.length;
  const activating = activeCars.size;
  const utilizationRate = totalAssets ? Math.round(activating / totalAssets * 100) : 0;

  // ─── 금액 계산 ─────────────────
  const monthBillings = billings.filter(b => (b.due_date || '').startsWith(thisMonth));
  const monthDue = monthBillings.reduce((s, b) => s + computeTotalDue(b), 0);
  const monthPaid = monthBillings.reduce((s, b) => s + (Number(b.paid_total) || 0), 0);
  const totalDue = billings.reduce((s, b) => s + computeTotalDue(b), 0);
  const totalPaid = billings.reduce((s, b) => s + (Number(b.paid_total) || 0), 0);
  const totalUnpaid = totalDue - totalPaid;
  const collectRate = totalDue ? Math.round(totalPaid / totalDue * 100) : 0;

  // ─── 이번달 이벤트 집계 ─────────────────
  const monthEvents = events.filter(e => String(e.date || '').startsWith(thisMonth));
  const monthDeliveries = monthEvents.filter(e => e.type === 'delivery').length;
  const monthReturns = monthEvents.filter(e => e.type === 'return').length;
  const monthAccidents = monthEvents.filter(e => e.type === 'accident').length;
  const monthContacts = monthEvents.filter(e => e.type === 'contact').length;
  const monthRepairs = monthEvents.filter(e => ['maint', 'maintenance', 'repair', 'product'].includes(e.type)).length;
  const monthNewContracts = contracts.filter(c => {
    const created = c.created_at ? new Date(c.created_at).toISOString().slice(0, 7) : '';
    return created === thisMonth;
  }).length;
  const expiring14 = contracts.filter(c => {
    const end = computeContractEnd(c);
    if (!end) return false;
    const diff = Math.floor((new Date(end) - todayDate) / 86400000);
    return diff >= 0 && diff <= 14;
  }).length;

  // ─── 미결업무 계산 ─────────────────
  // 1) 계약됐는데 출고 안됨 (start_date 지났는데 delivery 이벤트 없음)
  const deliveryByContract = new Set(
    events.filter(e => e.type === 'delivery' && e.contract_code).map(e => e.contract_code)
  );
  const deliveryByCar = new Set(events.filter(e => e.type === 'delivery').map(e => e.car_number));
  const notDelivered = contracts.filter(c => {
    if (c.status === 'deleted') return false;
    if (!c.contractor_name) return false;
    const start = normalizeDate(c.start_date);
    if (!start || start > today) return false;
    if (c.contract_status !== '계약진행') return false;
    return !deliveryByContract.has(c.contract_code) && !deliveryByCar.has(c.car_number);
  });

  // 2) 통장 거래 미매칭
  const unmatchedBank = events.filter(e =>
    (e.type === 'bank_tx' || e.type === 'card_tx') &&
    (!e.match_status || e.match_status === 'unmatched' || e.match_status === 'candidate')
  );

  // 3) 사고 미종결
  const openAccidents = events.filter(e =>
    e.type === 'accident' && e.accident_status && !['종결', '완료', '처리완료'].includes(e.accident_status)
  );

  // 4) 차량케어 진행중/작업중 (정비·수리·상품화·세차 — work_status != '완료')
  const openWorks = events.filter(e =>
    ['maint', 'maintenance', 'repair', 'product', 'wash'].includes(e.type) &&
    e.work_status && !['완료'].includes(e.work_status)
  );

  // 5) 고객센터 진행중/보류
  const openContacts = events.filter(e =>
    e.type === 'contact' && e.contact_result && ['진행중', '보류', '처리불가'].includes(e.contact_result)
  );

  // 6) 미수 조치 진행 (collect_result=납부약속 등 미완료)
  const openCollects = events.filter(e =>
    e.type === 'collect' && e.collect_result && !['즉시납부'].includes(e.collect_result)
  );

  // 5) 미납 (만기 경과)
  const overdueBills = billings.filter(b => {
    const due = computeTotalDue(b);
    const paid = Number(b.paid_total) || 0;
    return paid < due && b.due_date && b.due_date < today;
  });
  const overdueTotal = overdueBills.reduce((s, b) => s + computeTotalDue(b) - (Number(b.paid_total) || 0), 0);

  // ═════════════════════════════════════════════
  // 렌더
  // ═════════════════════════════════════════════
  const kpiRow = (iconName, iconColor, label, value, sub, href) => `
    <div class="dash-kpi" ${href ? `onclick="location.href='${href}'"` : ''}>
      <div class="dash-kpi-icon" style="background:${iconColor}22;color:${iconColor}"><i class="ph ${iconName}"></i></div>
      <div class="dash-kpi-body">
        <div class="dash-kpi-label">${label}</div>
        <div class="dash-kpi-value">${value}</div>
        ${sub ? `<div class="dash-kpi-sub">${sub}</div>` : ''}
      </div>
    </div>`;

  // ─── 좌: 운영 지표 ───
  company.innerHTML = `
    ${kpiRow('ph-car', '#10b981', '차량 가동', `${activating} / ${totalAssets}`, `가동률 ${utilizationRate}%`, '/asset')}
    ${kpiRow('ph-wallet', '#2383e2', '이번달 청구', `${fmt(monthDue)}원`, `수금 ${fmt(monthPaid)}원 · ${monthDue ? Math.round(monthPaid/monthDue*100) : 0}%`, '/billing')}
    ${kpiRow('ph-trend-up', '#059669', '누적 수금', `${fmt(totalPaid)}원`, `수금률 ${collectRate}%`, '/billing')}
    ${kpiRow('ph-warning-circle', '#dc2626', '미납 총액', `${fmt(overdueTotal)}원`, `${overdueBills.length}건 연체`, '/billing/overdue')}
  `;

  // ─── 중: 업무 상황 (이번달) ───
  team.innerHTML = `
    <div style="font-size:var(--font-size-sm);color:var(--c-text-muted);padding:4px 12px 0">이번달 · ${thisMonth.replace('-', '.')}</div>
    ${kpiRow('ph-file-plus', '#2383e2', '신규 계약', `${monthNewContracts}건`, '', '/contract')}
    ${kpiRow('ph-hourglass', '#f59e0b', '만기 도래 (D-14)', `${expiring14}건`, '', '/status/expiring')}
    ${kpiRow('ph-arrows-in-line-horizontal', '#10b981', '출고·반납', `${monthDeliveries} / ${monthReturns}`, '출고 · 반납', '/operation/delivery')}
    ${kpiRow('ph-sparkle', '#8b5cf6', '정비·상품화', `${monthRepairs}건`, '', '/operation/maint')}
    ${kpiRow('ph-car-profile', '#ef4444', '사고 접수', `${monthAccidents}건`, '', '/operation/accident')}
    ${kpiRow('ph-phone', '#3b82f6', '고객센터', `${monthContacts}건`, '', '/operation/contact')}
  `;

  // ─── 우: 미결업무 ───
  const todoRow = (iconName, iconColor, label, count, href) => `
    <div class="dash-todo" ${href ? `onclick="location.href='${href}'"` : ''}>
      <i class="ph ${iconName}" style="color:${iconColor};font-size:18px"></i>
      <div class="dash-todo-body">
        <div class="dash-todo-label">${label}</div>
      </div>
      <div class="dash-todo-count" style="color:${count > 0 ? iconColor : 'var(--c-text-muted)'}">${count}</div>
    </div>`;

  const todoItem = (iconName, iconColor, title, sub, href) => `
    <div class="dash-todo-item" ${href ? `onclick="location.href='${href}'"` : ''}>
      <i class="ph ${iconName}" style="color:${iconColor};font-size:14px"></i>
      <div style="flex:1;min-width:0">
        <div class="dash-todo-item-title">${title}</div>
        ${sub ? `<div class="dash-todo-item-sub">${sub}</div>` : ''}
      </div>
    </div>`;

  my.innerHTML = `
    ${todoRow('ph-truck', '#10b981', '계약 후 미출고', notDelivered.length, '/contract')}
    ${notDelivered.slice(0, 3).map(c =>
      todoItem('ph-circle', '#10b981', `${c.contractor_name || '-'} (${c.car_number || '-'})`, `시작일 ${c.start_date || '-'}`, '/contract')
    ).join('')}

    ${todoRow('ph-bank', '#059669', '통장 미매칭', unmatchedBank.length, '/fund')}
    ${unmatchedBank.slice(0, 3).map(e =>
      todoItem('ph-circle', '#059669', `${e.counterparty || e.memo || '-'}`, `${e.date || ''} · ${fmt(e.amount)}원`, '/fund')
    ).join('')}

    ${todoRow('ph-car-profile', '#ef4444', '사고 미종결', openAccidents.length, '/operation/accident')}
    ${openAccidents.slice(0, 3).map(e =>
      todoItem('ph-circle', '#ef4444', `${e.title || '사고'} (${e.car_number || '-'})`, e.accident_status || '', '/operation/accident')
    ).join('')}

    ${todoRow('ph-wrench', '#f97316', '차량케어 진행중', openWorks.length, '/operation/maint')}
    ${openWorks.slice(0, 3).map(e =>
      todoItem('ph-circle', '#f97316', `${e.title || e.type} (${e.car_number || '-'})`, e.work_status || '', '/operation/maint')
    ).join('')}

    ${todoRow('ph-phone', '#3b82f6', '고객센터 진행중', openContacts.length, '/operation/contact')}
    ${openContacts.slice(0, 3).map(e =>
      todoItem('ph-circle', '#3b82f6', `${e.title || e.type} (${e.car_number || '-'})`, e.contact_result || '', '/operation/contact')
    ).join('')}

    ${todoRow('ph-envelope', '#2563eb', '미수 조치 진행', openCollects.length, '/billing/overdue')}
    ${openCollects.slice(0, 3).map(e =>
      todoItem('ph-circle', '#2563eb', `${e.title || e.type} (${e.car_number || '-'})`, e.collect_result || '', '/billing/overdue')
    ).join('')}

    ${todoRow('ph-warning-circle', '#dc2626', '미납 독촉', overdueBills.length, '/billing/overdue')}
    ${overdueBills.slice(0, 3).map(b => {
      const c = contracts.find(x => x.contract_code === b.contract_code) || {};
      const unpaid = computeTotalDue(b) - (Number(b.paid_total) || 0);
      const days = Math.max(0, Math.floor((todayDate - new Date(b.due_date)) / 86400000));
      return todoItem('ph-circle', '#dc2626', `${c.contractor_name || '-'} · ${fmt(unpaid)}원`, `${days}일 연체`, '/billing/overdue');
    }).join('')}
  `;
}

export async function mount() {
  watchAssets((items) => { assets = items; render(); });
  watchContracts((items) => { contracts = items; render(); });
  watchBillings((items) => { billings = items; render(); });
  watchEvents((items) => { events = items; render(); });
}
