/**
 * pages/billing.js — 수납관리 (AG Grid 매트릭스)
 *
 * 고객명 / 차량번호 / 차종 + 1~12월 미수금액 + 연미수
 * 셀: 0=완납(녹색), 금액=미납, 연체=빨강배경
 * 행 클릭 → 디테일 (납부일자/방법/금액/잔액 누적)
 */
import { watchContracts } from '../firebase/contracts.js';
import { watchBillings, computeTotalDue, computeBillingStatus, computeOverdueDays, generateBillingsForContract } from '../firebase/billings.js';
import { showToast } from '../core/toast.js';
import { showContextMenu } from '../core/context-menu.js';
import { openDetail } from '../core/detail-panel.js';

const fmt = (v) => Number(v || 0).toLocaleString('ko-KR');
const fmtDate = (s) => {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  return `${m[1].slice(2)}.${m[2]}.${m[3]}`;
};

let gridApi = null;
let allContracts = [];
let allBillings = [];
// 당월 기준 ±3개월 뷰 — selectedMonth = 가운데 월
const today0 = new Date();
let selectedMonth = new Date(today0.getFullYear(), today0.getMonth(), 1);

function ymStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function shiftMonth(base, delta) {
  return new Date(base.getFullYear(), base.getMonth() + delta, 1);
}
/** 가운데 월 기준 ±3개월 = 7개 (오름차순) */
function visibleMonths() {
  return [-3, -2, -1, 0, 1, 2, 3].map(d => ymStr(shiftMonth(selectedMonth, d)));
}

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

function buildRowData() {
  const months = visibleMonths();
  const rangeStart = months[0] + '-01';
  const rangeEnd = months[months.length - 1] + '-31';

  const activeContracts = allContracts.filter(c => {
    const start = normalizeDate(c.start_date);
    const end = computeContractEnd(c);
    if (!start) return allBillings.some(b => b.contract_code === c.contract_code && months.includes(b.due_month));
    if (!end) return start <= rangeEnd;
    return start <= rangeEnd && end >= rangeStart;
  });

  return activeContracts.map(c => {
    const bills = allBillings.filter(b => b.contract_code === c.contract_code);
    const byMonth = {};
    bills.forEach(b => { if (b.due_month) byMonth[b.due_month] = b; });

    const row = {
      contract_code: c.contract_code,
      contractor_name: c.contractor_name || '-',
      car_number: c.car_number || '-',
      detail_model: c.detail_model || c.car_model || '-',
      deposit_amount: Number(c.deposit_amount) || 0,
      auto_debit_day: c.auto_debit_day || '-',
      action_status: c.action_status || '납부중',
      _rangeUnpaid: 0,
      _maxOverdueDays: 0,
    };

    // 미납일수 = 모든 회차 중 가장 오래된 미납일수
    bills.forEach(b => {
      const od = computeOverdueDays(b);
      if (od > row._maxOverdueDays) row._maxOverdueDays = od;
    });

    // 평균 지연일 = 완납된 회차들의 (최종 납부일 - 납부예정일) 평균
    let totalLateDays = 0;
    let paidCount = 0;
    bills.forEach(b => {
      if (!b.due_date || !Array.isArray(b.payments) || !b.payments.length) return;
      const due = computeTotalDue(b);
      const paid = Number(b.paid_total) || 0;
      if (paid < due) return;  // 완납만 집계
      // 마지막 입금일 (완납을 만든 날짜)
      const lastPay = b.payments
        .map(p => p.date)
        .filter(Boolean)
        .sort()
        .pop();
      if (!lastPay) return;
      const diff = Math.floor((new Date(lastPay) - new Date(b.due_date)) / 86400000);
      totalLateDays += diff;
      paidCount++;
    });
    row._avgLateDays = paidCount > 0 ? Math.round(totalLateDays / paidCount * 10) / 10 : null;
    row._paidCount = paidCount;

    months.forEach((key, i) => {
      const b = byMonth[key];
      const f = `m${i}`;
      if (!b) {
        row[f] = null;
        row[f + '_meta'] = null;
      } else {
        const due = computeTotalDue(b);
        const paid = Number(b.paid_total) || 0;
        const bal = due - paid;
        const status = computeBillingStatus(b);
        const overdueDays = computeOverdueDays(b);
        row[f] = bal;
        row[f + '_meta'] = { due, paid, bal, status, overdueDays, due_date: b.due_date };
        if (bal > 0) row._rangeUnpaid += bal;
      }
    });
    return row;
  });
}

// 상태별 글자색 (배경 없음)
const STATUS_FG = {
  '수납완료': '#16a34a',         // 초록
  '부분수납': '#2563eb',         // 파랑
  '납부예정': 'var(--c-text-muted)',
};
// 미납 일수별 글자색 (단계적 강도)
function overdueFg(days) {
  if (days >= 60) return '#7f1d1d';   // 60일+ 진빨강
  if (days >= 30) return '#dc2626';   // 30일+ 빨강
  if (days >= 7)  return '#ea580c';   // 7일+ 주황
  return '#a16207';                   // 1~6일 진노랑
}

function monthCellRenderer(params) {
  const val = params.value;
  if (val == null) return '<span style="color:var(--c-text-faint)">-</span>';
  const meta = params.data?.[params.colDef.field + '_meta'];
  if (!meta) return fmt(val);
  if (meta.status === '수납완료') return '완납';
  if (meta.status === '납부예정') return fmt(meta.due);
  // 부분수납 또는 미납
  const days = meta.overdueDays;
  const tag = days > 0 ? ` <span style="font-size:10px">(${days}일)</span>` : '';
  return `${fmt(val)}${tag}`;
}

function monthCellStyle(params) {
  const meta = params.data?.[params.colDef.field + '_meta'];
  if (!meta) return { textAlign: 'right' };
  const fg = meta.overdueDays > 0
    ? overdueFg(meta.overdueDays)
    : (STATUS_FG[meta.status] || STATUS_FG['납부예정']);
  return {
    color: fg,
    fontWeight: meta.overdueDays > 0 || meta.status === '부분수납' ? 600 : 400,
    textAlign: 'right',
    background: 'transparent',
  };
}

function buildColumnDefs() {
  const months = visibleMonths();
  const todayMonth = ymStr(new Date());
  const monthCols = months.map((ym, i) => {
    const isCurrent = ym === todayMonth;
    const [y, m] = ym.split('-');
    return {
      headerName: `${Number(m)}월${isCurrent ? ' (당월)' : ''}`,
      field: `m${i}`,
      width: 105,
      cellRenderer: monthCellRenderer,
      cellStyle: monthCellStyle,
      type: 'numericColumn',
      headerClass: isCurrent ? 'bl-current-month' : '',
    };
  });

  const ACTION_COLOR = {
    '납부중':   '#16a34a',
    '시동제어': '#ea580c',
    '회수결정': '#dc2626',
  };
  return [
    { headerName: '고객명',   field: 'contractor_name', width: 90, pinned: 'left', cellStyle: { fontWeight: 500 } },
    { headerName: '차량번호', field: 'car_number',      width: 90, pinned: 'left' },
    { headerName: '세부모델', field: 'detail_model',    width: 110, pinned: 'left', cellStyle: { color: 'var(--c-text-muted)' } },
    { headerName: '보증금',   field: 'deposit_amount',  width: 95, pinned: 'left', type: 'numericColumn',
      valueFormatter: (p) => p.value ? fmt(p.value) : '-',
      cellStyle: { textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--c-text-muted)' } },
    { headerName: '결제일',   field: 'auto_debit_day',  width: 70, pinned: 'left',
      valueFormatter: (p) => p.value && p.value !== '-' ? `${p.value}${/^\d+$/.test(p.value) ? '일' : ''}` : '-',
      cellStyle: { textAlign: 'center', color: 'var(--c-text-muted)' } },
    { headerName: '미납일수', field: '_maxOverdueDays', width: 85, pinned: 'left', type: 'numericColumn',
      valueFormatter: (p) => p.value > 0 ? `${p.value}일` : '-',
      cellStyle: (p) => ({
        textAlign: 'right',
        fontWeight: p.value > 0 ? 700 : 400,
        color: p.value >= 60 ? '#7f1d1d'
             : p.value >= 30 ? '#dc2626'
             : p.value >= 7  ? '#ea580c'
             : p.value >= 1  ? '#a16207'
             : 'var(--c-text-muted)',
      }) },
    { headerName: '평균지연', field: '_avgLateDays', width: 85, pinned: 'left', type: 'numericColumn',
      valueFormatter: (p) => p.value === null ? '-' : (p.value > 0 ? `+${p.value}일` : (p.value < 0 ? `${p.value}일` : '0일')),
      cellStyle: (p) => ({
        textAlign: 'right',
        fontWeight: 600,
        color: p.value === null ? 'var(--c-text-muted)'
             : p.value <= 0  ? '#16a34a'
             : p.value <= 2  ? 'var(--c-text)'
             : p.value <= 5  ? '#a16207'
             : p.value <= 10 ? '#ea580c'
             : '#dc2626',
      }) },
    { headerName: '조치상태', field: 'action_status',   width: 90, pinned: 'left',
      cellStyle: (p) => ({ color: ACTION_COLOR[p.value] || 'var(--c-text-muted)', fontWeight: 600, textAlign: 'center' }) },
    ...monthCols,
    { headerName: '범위 미수', field: '_rangeUnpaid', width: 110, pinned: 'right',
      type: 'numericColumn',
      cellRenderer: (params) => {
        const v = params.value || 0;
        const color = v > 0 ? '#dc2626' : '#16a34a';
        return `<span style="font-weight:600;color:${color}">${fmt(v)}</span>`;
      },
    },
  ];
}

function initGrid() {
  const columnDefs = buildColumnDefs();

  const gridOptions = {
    columnDefs,
    rowData: [],
    defaultColDef: {
      resizable: true,
      sortable: true,
      filter: 'agTextColumnFilter',
      editable: false,
      minWidth: 60,
    },
    rowHeight: 28,
    headerHeight: 28,
    animateRows: false,
    suppressContextMenu: true,
    getRowId: (params) => params.data.contract_code,
    onRowClicked: (e) => {
      const ov = document.getElementById('blOverlay');
      if (ov && !ov.hidden) return; // 디테일 열려있으면 무시
      if (e.data?.contract_code) {
        showDetail(e.data.contract_code);
      }
    },
  };

  const el = document.getElementById('billingGrid');
  gridApi = agGrid.createGrid(el, gridOptions);

  // 우클릭 → 상세보기
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const rowEl = e.target.closest('[row-index]');
    if (!rowEl) return;
    const node = gridApi.getDisplayedRowAtIndex(parseInt(rowEl.getAttribute('row-index')));
    if (!node) return;
    const d = node.data;
    showContextMenu(e, [
      { label: '상세보기', icon: '📄', action: () => {
        const months = [];
        for (let m = 1; m <= 12; m++) {
          const key = 'm' + m;
          if (d[key] !== undefined && d[key] !== null) {
            months.push({ label: `${m}월`, value: d[key] === 0 ? '완납' : fmt(d[key]) + '원' });
          }
        }
        openDetail({
          title: d.customer_name || d.contract_code || '',
          subtitle: `${d.car_number || ''} · ${selectedYear}년`,
          sections: [
            { label: '계약 정보', rows: [
              { label: '계약번호', value: d.contract_code },
              { label: '고객명', value: d.customer_name },
              { label: '차량번호', value: d.car_number },
              { label: '차종', value: d.car_model },
              { label: '연 미수합계', value: fmt(d.yearTotal) + '원' },
            ]},
            { label: `${selectedYear}년 월별 현황`, rows: months },
          ],
        });
      }},
    ]);
  });
}

function refreshGrid() {
  if (!gridApi) return;
  // 컬럼 헤더는 월 변경 시 다시 만들어야 함
  gridApi.setGridOption('columnDefs', buildColumnDefs());
  const rows = buildRowData();
  gridApi.setGridOption('rowData', rows);

  const info = document.getElementById('billingInfo');
  if (info) info.textContent = `수납관리 · ${rows.length}건`;
  const monthBtn = document.getElementById('billingMonth');
  if (monthBtn) monthBtn.textContent = `${selectedMonth.getFullYear()}.${String(selectedMonth.getMonth() + 1).padStart(2, '0')}`;
}

function initMonthNav() {
  document.getElementById('billingPrev')?.addEventListener('click', () => {
    selectedMonth = shiftMonth(selectedMonth, -1);
    refreshGrid();
  });
  document.getElementById('billingNext')?.addEventListener('click', () => {
    selectedMonth = shiftMonth(selectedMonth, 1);
    refreshGrid();
  });
  document.getElementById('billingToday')?.addEventListener('click', () => {
    const t = new Date();
    selectedMonth = new Date(t.getFullYear(), t.getMonth(), 1);
    refreshGrid();
  });
}

// ─── 디테일 (행 클릭 시) ──────────────────────────────────────
function showDetail(contractCode) {
  const c = allContracts.find(x => x.contract_code === contractCode);
  if (!c) return;
  const items = allBillings
    .filter(b => b.contract_code === contractCode)
    .sort((a, b) => (a.seq || 0) - (b.seq || 0));

  if (!items.length) {
    // 회차 자동 생성
    generateBillingsForContract(c).then(r => {
      showToast(`회차 ${r.created || 0}건 생성`, 'success');
    }).catch(e => showToast(e.message, 'error'));
    return;
  }

  let running = 0;

  // 그리드 숨기고 디테일 표시
  const grid = document.getElementById('billingGrid');
  const detail = document.getElementById('billingDetail');
  grid.style.display = 'none';
  detail.removeAttribute('hidden');
  detail.style.display = 'flex';
  detail.style.flexDirection = 'column';
  // AG Grid 로 디테일 표시
  detail.innerHTML = `
    <div style="flex-shrink:0;padding:10px 16px;border-bottom:1px solid var(--c-border);display:flex;align-items:center;gap:12px">
      <button class="btn" id="blBack">← 전체</button>
      <span style="font-weight:600">${c.contractor_name || '-'}</span>
      <span style="color:var(--c-text-muted)">${c.car_number || '-'} · ${c.car_model || ''}</span>
    </div>
    <div id="blDetailGrid" class="ag-theme-alpine" style="flex:1;min-height:0;width:100%"></div>
  `;

  // 행 데이터 구축
  const detailRows = [];
  items.forEach(b => {
    const totalDue = computeTotalDue(b);
    const baseAmt = Number(b.amount) || 0;
    const adjustments = Array.isArray(b.adjustments) ? b.adjustments : [];
    running += baseAmt;

    // 1행: 기본 청구
    detailRows.push({
      seq: b.seq, due_date: b.due_date || '', pay_date: '', method: '',
      type: '청구', label: `${b.seq}회차 대여료`,
      charge: baseAmt, pay: null, balance: running, _isHeader: true,
    });

    // 조정 행 (추가청구/할인)
    adjustments.forEach(a => {
      const amt = Number(a.amount) || 0;
      running += amt;
      const isAdd = amt >= 0;
      detailRows.push({
        seq: '', due_date: '', pay_date: a.date || '', method: '',
        type: isAdd ? '추가청구' : '할인', label: a.label || '',
        charge: amt, pay: null, balance: running, _isHeader: false,
      });
    });

    // 납부 행
    const payments = (Array.isArray(b.payments) ? b.payments : []).slice()
      .sort((a, x) => String(a.date || '').localeCompare(String(x.date || '')));
    if (!payments.length && !adjustments.length) {
      // 미납 표시 (기본 청구 행에 이미 들어감)
      detailRows[detailRows.length - 1].method = '미납';
    }
    payments.forEach(p => {
      const amt = Number(p.amount) || 0;
      running -= amt;
      detailRows.push({
        seq: '', due_date: '', pay_date: p.date || '', method: p.method || '',
        type: '납부', label: '',
        charge: null, pay: amt, balance: running, _isHeader: false,
      });
    });
  });

  const typeColors = { '청구': 'var(--c-text)', '추가청구': '#d97706', '할인': '#2383e2', '납부': 'var(--c-success)' };
  const detailColDefs = [
    { headerName: '회차', field: 'seq', width: 55,
      valueFormatter: (p) => p.value || '',
      cellStyle: (p) => p.data._isHeader ? { fontWeight: 600 } : {} },
    { headerName: '청구일', field: 'due_date', width: 85,
      valueFormatter: (p) => fmtDate(p.value),
      cellStyle: { color: 'var(--c-text-muted)' }, suppressSizeToFit: true },
    { headerName: '구분', field: 'type', width: 75,
      cellStyle: (p) => ({ fontWeight: 500, color: typeColors[p.value] || 'var(--c-text)' }) },
    { headerName: '내용', field: 'label', width: 140 },
    { headerName: '일자', field: 'pay_date', width: 85,
      valueFormatter: (p) => fmtDate(p.value), suppressSizeToFit: true },
    { headerName: '방법', field: 'method', width: 80 },
    { headerName: '청구/조정', field: 'charge', width: 100, type: 'numericColumn',
      valueFormatter: (p) => p.value != null ? (p.value >= 0 ? '+' + fmt(p.value) : fmt(p.value)) : '',
      cellStyle: (p) => {
        if (p.value == null) return {};
        return { fontWeight: 500, color: p.value >= 0 ? 'var(--c-danger)' : '#2383e2' };
      } },
    { headerName: '납부', field: 'pay', width: 100, type: 'numericColumn',
      valueFormatter: (p) => p.value != null && p.value > 0 ? '-' + fmt(p.value) : '',
      cellStyle: { color: 'var(--c-success)', fontWeight: 500 } },
    { headerName: '잔액', field: 'balance', width: 110, type: 'numericColumn',
      valueFormatter: (p) => fmt(p.value),
      cellStyle: (p) => ({
        fontWeight: p.data.balance === 0 ? 600 : 400,
        color: p.data.balance > 0 ? 'var(--c-danger)' : (p.data.balance < 0 ? '#0ea5e9' : 'var(--c-success)'),
      }) },
  ];

  agGrid.createGrid(document.getElementById('blDetailGrid'), {
    columnDefs: detailColDefs,
    rowData: detailRows,
    defaultColDef: { resizable: true, sortable: false, editable: false, minWidth: 60 },
    rowHeight: 28,
    headerHeight: 28,
    animateRows: false,
    suppressContextMenu: true,
  });
  document.getElementById('blBack').addEventListener('click', () => {
    detail.style.display = 'none';
    grid.style.display = '';
  });
}

export async function mount() {
  initGrid();
  initMonthNav();
  refreshGrid();

  watchContracts((items) => { allContracts = items; refreshGrid(); });
  watchBillings((items) => { allBillings = items; refreshGrid(); });
}
