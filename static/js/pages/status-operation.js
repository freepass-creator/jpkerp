/**
 * pages/status-operation.js — 통합 리포트 (차량별 종합 현황)
 *
 * 한 행 = 한 차량
 * 식별 + 계약 + 수납·미납 + 할부 + 보험 + 운영 누적 + 손익
 */
import { ref, get } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js';
import { db } from '../firebase/config.js';
import { computeTotalDue, computeBillingStatus, computeOverdueDays } from '../firebase/billings.js';

const $ = s => document.querySelector(s);
const fmt = v => Number(v || 0).toLocaleString('ko-KR');
const today = new Date().toISOString().slice(0, 10);

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
function daysFromToday(dateStr) {
  if (!dateStr) return null;
  return Math.floor((new Date(dateStr) - new Date(today)) / 86400000);
}

let gridApi = null;

async function loadAll() {
  const [a, c, b, l, i, e] = await Promise.all([
    get(ref(db, 'assets')),
    get(ref(db, 'contracts')),
    get(ref(db, 'billings')),
    get(ref(db, 'loans')),
    get(ref(db, 'insurances')),
    get(ref(db, 'events')),
  ]);
  const filt = (snap) => Object.values(snap.val() || {}).filter(r => r && r.status !== 'deleted');
  return {
    assets: filt(a),
    contracts: filt(c),
    billings: filt(b),
    loans: filt(l),
    insurances: filt(i),
    events: filt(e),
  };
}

function aggregateRow(asset, ctx) {
  const car = asset.car_number;
  const row = {
    // 식별
    partner_code: asset.partner_code || '-',
    car_number: car,
    asset_code: asset.asset_code || '-',
    model: `${asset.manufacturer || ''} ${asset.car_model || ''} ${asset.car_year || ''}`.trim() || '-',
    asset_status: asset.asset_status || '미지정',
  };

  // 활성 계약
  const activeContract = ctx.contracts
    .filter(c => c.car_number === car && c.contractor_name?.trim())
    .filter(c => {
      const s = normalizeDate(c.start_date);
      const e = computeContractEnd(c);
      if (!s || s > today) return false;
      if (e && e < today) return false;
      return true;
    })
    .sort((x, y) => String(y.start_date || '').localeCompare(String(x.start_date || '')))[0];

  if (activeContract) {
    const end = computeContractEnd(activeContract);
    row.contractor_name = activeContract.contractor_name || '-';
    row.contractor_phone = activeContract.contractor_phone || '-';
    row.contract_end = end;
    row.days_to_end = daysFromToday(end);
    row.rent_amount = Number(activeContract.rent_amount) || 0;
    row.deposit_amount = Number(activeContract.deposit_amount) || 0;
    row.auto_debit_day = activeContract.auto_debit_day || '-';
    row.action_status = activeContract.action_status || '납부중';
    row.contract_status_disp = '가동중';
  } else {
    row.contractor_name = '-';
    row.contractor_phone = '-';
    row.contract_end = '-';
    row.days_to_end = null;
    row.rent_amount = 0;
    row.deposit_amount = 0;
    row.auto_debit_day = '-';
    row.action_status = '-';
    // 자산상태 우선 (정비중·매각예정 등), 없으면 휴차
    row.contract_status_disp = (asset.asset_status && asset.asset_status !== '가동중') ? asset.asset_status : '휴차';
  }

  // 수납·미납 — 차량의 모든 계약 누적 (과거 만료 계약 포함)
  const carContractCodes = new Set(
    ctx.contracts.filter(c => c.car_number === car).map(c => c.contract_code)
  );
  const carBillings = ctx.billings.filter(b =>
    (b.car_number === car) || carContractCodes.has(b.contract_code)
  );
  let totalCharged = 0, totalPaid = 0, unpaidCount = 0, unpaidAmount = 0, maxOverdue = 0;
  carBillings.forEach(b => {
    const due = computeTotalDue(b);
    const paid = Number(b.paid_total) || 0;
    totalCharged += due;
    totalPaid += paid;
    if (paid < due && b.due_date && b.due_date < today) {
      unpaidCount++;
      unpaidAmount += (due - paid);
      const od = computeOverdueDays(b);
      if (od > maxOverdue) maxOverdue = od;
    }
  });
  row.total_charged = totalCharged;   // 누적 청구액
  row.total_revenue = totalPaid;       // 누적 수납액 (실제 받은 돈)
  row.unpaid_count = unpaidCount;
  row.unpaid_amount = unpaidAmount;
  row.max_overdue_days = maxOverdue;

  // 할부
  const loan = ctx.loans.find(x => x.car_number === car || x.vin === asset.vin);
  if (loan) {
    row.loan_company = loan.loan_company || '-';
    row.loan_principal = Number(loan.loan_principal) || 0;
    row.loan_balance = Number(loan.loan_balance) || row.loan_principal;
    row.loan_paid = row.loan_principal - row.loan_balance;
    // 이자 누적 (간이 — 원금-잔액의 일정 비율로 추정 또는 events에서 차감)
    // 정확한 계산은 회차별로, 일단 0 (events에 별도 기록 시 합산)
    row.loan_interest = 0;
    row.loan_end = loan.loan_end_date || '-';
    row.loan_days_to_end = daysFromToday(loan.loan_end_date);
  } else {
    row.loan_company = '-';
    row.loan_principal = 0;
    row.loan_balance = 0;
    row.loan_paid = 0;
    row.loan_interest = 0;
    row.loan_end = '-';
    row.loan_days_to_end = null;
  }

  // 보험
  const ins = ctx.insurances
    .filter(x => x.car_number === car && x.status !== '해지')
    .sort((x, y) => String(y.start_date || '').localeCompare(String(x.start_date || '')))[0];
  if (ins) {
    row.insurance_company = ins.insurance_company || '-';
    row.insurance_end = ins.end_date || '-';
    row.insurance_days_to_end = daysFromToday(ins.end_date);
    row.age_limit = ins.age_limit || '-';
    row.driver_range = ins.driver_range || '-';
    row.insurance_premium = Number(ins.premium) || 0;
  } else {
    row.insurance_company = '-';
    row.insurance_end = '-';
    row.insurance_days_to_end = null;
    row.age_limit = '-';
    row.driver_range = '-';
    row.insurance_premium = 0;
  }

  // 운영 누적 (events 합산 — 차량별)
  const carEvents = ctx.events.filter(ev => ev.car_number === car);
  const sumByType = (type) => carEvents
    .filter(e => e.event_type === type || e.type === type)
    .reduce((s, e) => s + (Number(e.amount) || Number(e.cost) || 0), 0);
  const countByType = (type) => carEvents
    .filter(e => e.event_type === type || e.type === type).length;

  row.maint_cost = sumByType('maint');
  row.maint_count = countByType('maint');
  row.accident_cost = sumByType('accident');
  row.accident_count = countByType('accident');
  row.wash_cost = sumByType('wash');
  row.fuel_cost = sumByType('fuel');
  row.penalty_cost = sumByType('penalty');
  row.delivery_cost = sumByType('delivery') + sumByType('transfer');

  // 마지막 정비일 + 현재 주행거리
  const maintEvents = carEvents.filter(e => (e.event_type === 'maint' || e.type === 'maint') && e.date)
    .sort((x, y) => String(y.date || '').localeCompare(String(x.date || '')));
  row.last_maint_date = maintEvents[0]?.date || '-';

  const mileageEvents = carEvents
    .map(e => Number(e.mileage) || 0)
    .filter(m => m > 0);
  row.current_mileage = mileageEvents.length ? Math.max(...mileageEvents) : (Number(asset.mileage) || 0);

  // 손익
  row.total_cost = row.maint_cost + row.accident_cost + row.wash_cost +
                   row.fuel_cost + row.penalty_cost + row.delivery_cost +
                   row.insurance_premium + row.loan_interest;
  row.profit = row.total_revenue - row.total_cost;

  return row;
}

function renderSummary(rows) {
  const sum = (k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const cnt = (k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);

  const totalRev = sum('total_revenue');
  const maintCost = sum('maint_cost');
  const accidentCost = sum('accident_cost');
  const fuelCost = sum('fuel_cost');
  const washCost = sum('wash_cost');
  const penaltyCost = sum('penalty_cost');
  const deliveryCost = sum('delivery_cost');
  const insurancePremium = sum('insurance_premium');
  const loanInterest = sum('loan_interest');
  const totalCost = sum('total_cost');
  const profit = totalRev - totalCost;
  const totalUnpaid = sum('unpaid_amount');
  const unpaidCount = cnt('unpaid_count');
  const loanBalance = sum('loan_balance');
  const loanPaid = sum('loan_paid');

  // 가동/휴차 카운트
  const active = rows.filter(r => r.contract_status_disp === '가동중').length;
  const idle = rows.length - active;

  const card = (label, value, color, divider) => `
    <div style="display:flex;flex-direction:column;gap:2px;${divider ? 'border-left:1px solid var(--c-border);padding-left:14px;margin-left:6px' : ''}">
      <div style="font-size:var(--font-size-xs);color:var(--c-text-muted)">${label}</div>
      <div style="font-size:var(--font-size-md);font-weight:700;color:${color || 'var(--c-text)'};font-variant-numeric:tabular-nums">${value}</div>
    </div>`;

  $('#opSummary').innerHTML = `
    ${card('차량', `${rows.length}대`)}
    ${card('가동', `${active}대`, '#16a34a')}
    ${card('휴차', `${idle}대`, idle ? '#c08a2b' : 'var(--c-text-muted)')}
    ${card('총 매출', fmt(totalRev), '#16a34a', true)}
    ${card('총 정비비', fmt(maintCost))}
    ${card('총 수리비', fmt(accidentCost))}
    ${card('총 주유비', fmt(fuelCost))}
    ${card('총 세차비', fmt(washCost))}
    ${card('총 과태료', fmt(penaltyCost))}
    ${card('총 탁송비', fmt(deliveryCost))}
    ${card('총 보험료', fmt(insurancePremium))}
    ${card('총 이자', fmt(loanInterest))}
    ${card('총 비용', fmt(totalCost), '#dc2626', true)}
    ${card('순익', fmt(profit), profit >= 0 ? '#16a34a' : '#dc2626')}
    ${card('미수금', `${fmt(totalUnpaid)} (${unpaidCount}회)`, '#c08a2b', true)}
    ${card('할부 납부', fmt(loanPaid), '#16a34a')}
    ${card('할부 잔액', fmt(loanBalance), '#c08a2b')}
  `;
}

function buildColumnDefs() {
  const right = (extra = {}) => ({ type: 'numericColumn', filter: false, cellStyle: { textAlign: 'right', fontVariantNumeric: 'tabular-nums', ...extra } });
  const money = (color) => ({
    type: 'numericColumn',
    filter: false,
    valueFormatter: p => p.value ? fmt(p.value) : '-',
    cellStyle: p => ({ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: color || 'var(--c-text)', fontWeight: p.value ? 500 : 400 }),
  });
  const days = {
    type: 'numericColumn',
    filter: false,
    valueFormatter: p => p.value === null || p.value === undefined ? '-' : (p.value > 0 ? `D-${p.value}` : (p.value === 0 ? '오늘' : `D+${-p.value}`)),
    cellStyle: p => ({
      textAlign: 'right',
      fontWeight: 600,
      color: p.value === null ? 'var(--c-text-muted)'
           : p.value < 0 ? '#dc2626'
           : p.value <= 7 ? '#ea580c'
           : p.value <= 30 ? '#c08a2b'
           : 'var(--c-success)',
    }),
  };

  return [
    // ── 식별 (좌측 고정) ──
    { headerName: '회원사', field: 'partner_code', width: 80, pinned: 'left' },
    { headerName: '차량번호', field: 'car_number', width: 100, pinned: 'left', cellStyle: { fontWeight: 600 } },
    { headerName: '차종', field: 'model', width: 160, pinned: 'left' },
    { headerName: '계약상태', field: 'contract_status_disp', width: 90, pinned: 'left',
      cellStyle: p => ({ fontWeight: 600, color: p.value === '가동중' ? '#16a34a' : p.value === '휴차' ? 'var(--c-text-muted)' : '#c08a2b' }) },

    // ── 손익 (핵심 — 좌측 다음) ──
    { headerName: '총 매출액', field: 'total_revenue', width: 120, ...money('#16a34a') },
    { headerName: '총 정비비', field: 'maint_cost', width: 110, ...money() },
    { headerName: '총 수리비', field: 'accident_cost', width: 110, ...money() },
    { headerName: '총 운영비', field: 'total_cost', width: 120, ...money('#dc2626') },
    { headerName: '총 순익', field: 'profit', width: 130,
      type: 'numericColumn',
      valueFormatter: p => fmt(p.value),
      cellStyle: p => ({
        textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700,
        color: p.value > 0 ? '#16a34a' : p.value < 0 ? '#dc2626' : 'var(--c-text-muted)',
      }) },

    // ── 할부 ──
    { headerName: '총 할부금', field: 'loan_principal', width: 120, ...money() },
    { headerName: '할부 납부', field: 'loan_paid', width: 110, ...money('#16a34a') },
    { headerName: '할부 잔액', field: 'loan_balance', width: 110, ...money('#c08a2b') },
    { headerName: '총 이자', field: 'loan_interest', width: 100, ...money('var(--c-text-muted)') },
    { headerName: '금융사', field: 'loan_company', width: 100 },
    { headerName: '할부 만기', field: 'loan_days_to_end', width: 90, ...days },

    // ── 미납 ──
    { headerName: '미납 회차', field: 'unpaid_count', width: 80, ...right(), valueFormatter: p => p.value ? `${p.value}회` : '-',
      cellStyle: p => ({ textAlign: 'right', fontWeight: p.value ? 700 : 400, color: p.value ? '#dc2626' : 'var(--c-text-muted)' }) },
    { headerName: '미납액', field: 'unpaid_amount', width: 110, ...money('#dc2626') },
    { headerName: '미납 일수', field: 'max_overdue_days', width: 90, ...right(),
      valueFormatter: p => p.value ? `${p.value}일` : '-',
      cellStyle: p => ({ textAlign: 'right', fontWeight: p.value ? 700 : 400, color: p.value > 30 ? '#dc2626' : p.value > 7 ? '#ea580c' : p.value > 0 ? '#a16207' : 'var(--c-text-muted)' }) },

    // ── 계약 ──
    { headerName: '계약자', field: 'contractor_name', width: 90 },
    { headerName: '연락처', field: 'contractor_phone', width: 120 },
    { headerName: '월 대여료', field: 'rent_amount', width: 100, ...money() },
    { headerName: '결제일', field: 'auto_debit_day', width: 60, cellStyle: { textAlign: 'center' } },
    { headerName: '계약 종료', field: 'contract_end', width: 100 },
    { headerName: '계약 잔여', field: 'days_to_end', width: 90, ...days },
    { headerName: '조치상태', field: 'action_status', width: 90 },

    // ── 보험 ──
    { headerName: '보험사', field: 'insurance_company', width: 100 },
    { headerName: '보험 만기', field: 'insurance_days_to_end', width: 90, ...days },
    { headerName: '연령한정', field: 'age_limit', width: 90 },
    { headerName: '보험료', field: 'insurance_premium', width: 100, ...money() },

    // ── 운영 부가 ──
    { headerName: '주행거리', field: 'current_mileage', width: 110, ...money(), valueFormatter: p => p.value ? `${fmt(p.value)}km` : '-' },
    { headerName: '주유비', field: 'fuel_cost', width: 100, ...money() },
    { headerName: '세차비', field: 'wash_cost', width: 100, ...money() },
    { headerName: '과태료', field: 'penalty_cost', width: 100, ...money() },
    { headerName: '탁송비', field: 'delivery_cost', width: 100, ...money() },
    { headerName: '마지막 정비', field: 'last_maint_date', width: 100 },
    { headerName: '자산상태', field: 'asset_status', width: 90 },
  ];
}

function applyFilters(allRows) {
  const partner = $('#opPartner')?.value || '';
  const status = $('#opStatus')?.value || '';
  return allRows.filter(r => {
    if (partner && r.partner_code !== partner) return false;
    if (status) {
      if (status === '휴차' && r.contractor_name !== '-') return false;
      if (status !== '휴차' && r.asset_status !== status) return false;
    }
    return true;
  });
}

let _allRows = [];

function refresh() {
  const rows = applyFilters(_allRows);
  gridApi?.setGridOption('rowData', rows);
  $('#opCount').textContent = rows.length;
  renderSummary(rows);
}

export async function mount() {
  const el = $('#opGrid');
  if (!el) return;

  gridApi = agGrid.createGrid(el, {
    columnDefs: buildColumnDefs(),
    rowData: [],
    defaultColDef: { resizable: true, sortable: true, filter: 'agTextColumnFilter', minWidth: 60 },
    rowHeight: 28,
    headerHeight: 28,
    animateRows: false,
    suppressContextMenu: true,
  });

  // 회원사 필터 옵션
  const data = await loadAll();
  const partners = [...new Set(data.assets.map(a => a.partner_code).filter(Boolean))].sort();
  const sel = $('#opPartner');
  if (sel) partners.forEach(p => sel.insertAdjacentHTML('beforeend', `<option value="${p}">${p}</option>`));

  _allRows = data.assets.map(a => aggregateRow(a, data));
  refresh();

  $('#opPartner')?.addEventListener('change', refresh);
  $('#opStatus')?.addEventListener('change', refresh);
}
