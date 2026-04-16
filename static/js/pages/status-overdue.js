/**
 * pages/status-overdue.js — 미납 현황
 * 미납 있는 계약자만 한 줄씩 (금액 합산, 최장 연체일)
 */
import { watchBillings, computeTotalDue } from '../firebase/billings.js';
import { watchContracts } from '../firebase/contracts.js';

const $ = s => document.querySelector(s);
const fmt = v => Number(v || 0).toLocaleString('ko-KR');
const fmtDate = s => {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1].slice(2)}.${m[2]}.${m[3]}` : s;
};

let gridApi, contracts = [], billings = [];

function refresh() {
  if (!gridApi) return;
  const today = new Date().toISOString().slice(0, 10);
  const todayDate = new Date(today);

  // 1) 미납 회차 추출
  const overdueBills = billings
    .filter(b => {
      const due = computeTotalDue(b);
      const paid = Number(b.paid_total) || 0;
      return paid < due && b.due_date && b.due_date < today;
    })
    .map(b => {
      const c = contracts.find(x => x.contract_code === b.contract_code) || {};
      const due = computeTotalDue(b);
      const paid = Number(b.paid_total) || 0;
      return {
        ...b,
        contract_code: b.contract_code || c.contract_code || '',
        contractor_name: c.contractor_name || '-',
        contractor_phone: c.contractor_phone || '',
        car_number: c.car_number || b.car_number || '-',
        partner_code: c.partner_code || '',
        unpaid: due - paid,
        overdue_days: Math.floor((todayDate - new Date(b.due_date)) / 86400000),
      };
    });

  // 2) 계약자 단위로 그룹핑 (contract_code 기준)
  const byContract = new Map();
  overdueBills.forEach(b => {
    const key = b.contract_code || `${b.contractor_name}|${b.car_number}`;
    if (!byContract.has(key)) {
      byContract.set(key, {
        contract_code: b.contract_code,
        contractor_name: b.contractor_name,
        contractor_phone: b.contractor_phone,
        car_number: b.car_number,
        partner_code: b.partner_code,
        unpaid_total: 0,
        bill_count: 0,
        max_days: 0,
        earliest_due: '',
        latest_due: '',
      });
    }
    const row = byContract.get(key);
    row.unpaid_total += b.unpaid;
    row.bill_count += 1;
    row.max_days = Math.max(row.max_days, b.overdue_days);
    if (!row.earliest_due || b.due_date < row.earliest_due) row.earliest_due = b.due_date;
    if (!row.latest_due || b.due_date > row.latest_due) row.latest_due = b.due_date;
  });

  const rows = [...byContract.values()].sort((a, b) => b.max_days - a.max_days);
  gridApi.setGridOption('rowData', rows);

  // subtitle 갱신
  const sub = $('#overdueCount');
  if (sub) {
    const total = rows.reduce((s, r) => s + r.unpaid_total, 0);
    sub.textContent = `${rows.length}명 · ${fmt(total)}원`;
  }
}

export async function mount() {
  gridApi = agGrid.createGrid($('#overdueGrid'), {
    columnDefs: [
      { headerName: '#', valueGetter: 'node.rowIndex+1', width: 45, cellStyle: { color: 'var(--c-text-muted)' } },
      { headerName: '계약자', field: 'contractor_name', width: 90 },
      { headerName: '연락처', field: 'contractor_phone', width: 120 },
      { headerName: '차량번호', field: 'car_number', width: 100 },
      { headerName: '회원사', field: 'partner_code', width: 70 },
      { headerName: '미납 회차', field: 'bill_count', width: 75, type: 'numericColumn',
        valueFormatter: p => p.value ? `${p.value}건` : '' },
      { headerName: '미납 금액', field: 'unpaid_total', width: 120, type: 'numericColumn',
        valueFormatter: p => fmt(p.value),
        cellStyle: { color: 'var(--c-danger)', fontWeight: 600 } },
      { headerName: '최장 연체', field: 'max_days', width: 90, type: 'numericColumn',
        valueFormatter: p => p.value ? `${p.value}일` : '',
        cellStyle: p => ({
          color: p.value >= 30 ? '#991b1b' : p.value >= 14 ? 'var(--c-danger)' : p.value >= 7 ? 'var(--c-warn)' : 'var(--c-text-sub)',
          fontWeight: 600,
        }) },
      { headerName: '최초 미납일', field: 'earliest_due', width: 100, valueFormatter: p => fmtDate(p.value) },
      { headerName: '최근 미납일', field: 'latest_due', width: 100, valueFormatter: p => fmtDate(p.value) },
      { headerName: '계약코드', field: 'contract_code', flex: 1, minWidth: 120,
        cellStyle: { fontFamily: 'monospace', color: 'var(--c-text-muted)' } },
    ],
    rowData: [],
    defaultColDef: { resizable: true, sortable: true, filter: true, editable: false, minWidth: 50 },
    rowHeight: 28,
    headerHeight: 28,
    animateRows: false,
    suppressContextMenu: true,
    onGridReady: (p) => p.api.autoSizeAllColumns(),
    onRowClicked: (e) => {
      if (e.data?.contract_code) location.href = `/billing?contract=${encodeURIComponent(e.data.contract_code)}`;
    },
  });
  $('#overdueGrid')._agApi = gridApi;

  watchContracts((items) => { contracts = items; refresh(); });
  watchBillings((items) => { billings = items; refresh(); });
}
