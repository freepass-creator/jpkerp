/**
 * pages/billing.js — 수납관리 (AG Grid 매트릭스)
 *
 * 고객명 / 차량번호 / 차종 + 1~12월 미수금액 + 연미수
 * 셀: 0=완납(녹색), 금액=미납, 연체=빨강배경
 * 행 클릭 → 디테일 (납부일자/방법/금액/잔액 누적)
 */
import { watchContracts } from '../firebase/contracts.js';
import { watchBillings, computeTotalDue, generateBillingsForContract } from '../firebase/billings.js';
import { showToast } from '../core/toast.js';

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
let selectedYear = new Date().getFullYear();

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
  const yearStart = `${selectedYear}-01-01`;
  const yearEnd = `${selectedYear}-12-31`;
  const today = new Date().toISOString().slice(0, 10);

  const activeContracts = allContracts.filter(c => {
    const start = normalizeDate(c.start_date);
    const end = computeContractEnd(c);
    if (!start) return allBillings.some(b => b.contract_code === c.contract_code && b.due_month && b.due_month.startsWith(String(selectedYear)));
    if (!end) return start <= yearEnd;
    return start <= yearEnd && end >= yearStart;
  });

  return activeContracts.map(c => {
    const bills = allBillings.filter(b => b.contract_code === c.contract_code);
    const byMonth = {};
    bills.forEach(b => { if (b.due_month) byMonth[b.due_month] = b; });

    const row = {
      contract_code: c.contract_code,
      contractor_name: c.contractor_name || '-',
      car_number: c.car_number || '-',
      car_model: c.car_model || '-',
      _yearUnpaid: 0,
    };

    for (let m = 1; m <= 12; m++) {
      const key = `${selectedYear}-${String(m).padStart(2, '0')}`;
      const b = byMonth[key];
      if (!b) {
        row[`m${m}`] = null; // 해당 월 회차 없음
        row[`m${m}_meta`] = null;
      } else {
        const due = computeTotalDue(b);
        const paid = Number(b.paid_total) || 0;
        const bal = due - paid;
        const isOverdue = b.due_date && b.due_date < today && bal > 0;
        row[`m${m}`] = bal;
        row[`m${m}_meta`] = { due, paid, bal, isOverdue };
        if (bal > 0) row._yearUnpaid += bal;
      }
    }
    return row;
  });
}

function monthCellRenderer(params) {
  const val = params.value;
  if (val == null) return '<span style="color:var(--c-text-faint)">-</span>';
  if (val <= 0) return '<span style="color:#16a34a">0</span>';
  return `<span style="font-weight:500">${fmt(val)}</span>`;
}

function monthCellStyle(params) {
  const field = params.colDef.field;
  const meta = params.data?.[field + '_meta'];
  if (!meta) return null;
  if (meta.bal <= 0) return { background: '#dcfce7' };
  if (meta.isOverdue) return { background: '#fef2f2', color: '#dc2626' };
  return null;
}

function initGrid() {
  const monthCols = [];
  for (let m = 1; m <= 12; m++) {
    monthCols.push({
      headerName: `${m}월`,
      field: `m${m}`,
      width: 90,
      cellRenderer: monthCellRenderer,
      cellStyle: monthCellStyle,
      type: 'numericColumn',
    });
  }

  const columnDefs = [
    { headerName: '고객명', field: 'contractor_name', width: 90, pinned: 'left',
      cellStyle: { fontWeight: 500 } },
    { headerName: '차량번호', field: 'car_number', width: 90, pinned: 'left' },
    { headerName: '차종', field: 'car_model', width: 80, pinned: 'left',
      cellStyle: { color: 'var(--c-text-muted)' } },
    ...monthCols,
    { headerName: '연미수', field: '_yearUnpaid', width: 100, pinned: 'right',
      type: 'numericColumn',
      cellRenderer: (params) => {
        const v = params.value || 0;
        const color = v > 0 ? '#dc2626' : '#16a34a';
        return `<span style="font-weight:600;color:${color}">${fmt(v)}</span>`;
      },
      cellStyle: { background: '#fef3c7' },
    },
  ];

  const gridOptions = {
    columnDefs,
    rowData: [],
    defaultColDef: {
      resizable: true,
      sortable: true,
      filter: false,
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
}

function refreshGrid() {
  if (!gridApi) return;
  const rows = buildRowData();
  gridApi.setGridOption('rowData', rows);

  const info = document.getElementById('billingInfo');
  if (info) info.textContent = `수납관리 · ${selectedYear}년 · ${rows.length}건`;
}

function initYearSelect() {
  const sel = document.getElementById('billingYear');
  if (!sel) return;
  const years = new Set();
  allBillings.forEach(b => { if (b.due_month) years.add(b.due_month.slice(0, 4)); });
  years.add(String(new Date().getFullYear()));
  const sorted = Array.from(years).sort().reverse();
  sel.innerHTML = sorted.map(y => `<option value="${y}" ${Number(y) === selectedYear ? 'selected' : ''}>${y}년</option>`).join('');
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
  initYearSelect();

  watchContracts((items) => { allContracts = items; initYearSelect(); refreshGrid(); });
  watchBillings((items) => { allBillings = items; initYearSelect(); refreshGrid(); });

  document.getElementById('billingYear')?.addEventListener('change', (e) => {
    selectedYear = Number(e.target.value);
    refreshGrid();
  });
}
