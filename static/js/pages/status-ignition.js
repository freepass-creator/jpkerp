/**
 * pages/status-ignition.js — 시동제어 / 회수 진행 현황
 *
 * action_status in ['시동제어','회수결정','회수완료'] 인 계약만 표시
 */
import { watchContracts } from '../firebase/contracts.js';
import { watchBillings, computeTotalDue, computeOverdueDays } from '../firebase/billings.js';

const $ = s => document.querySelector(s);
const fmt = v => Number(v || 0).toLocaleString('ko-KR');

const ACTION_COLOR = {
  '시동제어': '#ea580c',
  '회수결정': '#dc2626',
  '회수완료': '#7f1d1d',
};

let gridApi = null;
let contracts = [];
let billings = [];

function refresh() {
  const rows = contracts
    .filter(c => c.status !== 'deleted')
    .filter(c => ['시동제어', '회수결정', '회수완료'].includes(c.action_status))
    .map(c => {
      const carBills = billings.filter(b => b.contract_code === c.contract_code && b.status !== 'deleted');
      let unpaidCount = 0, unpaidSum = 0, maxOverdue = 0;
      carBills.forEach(b => {
        const due = computeTotalDue(b);
        const paid = Number(b.paid_total) || 0;
        if (paid < due) {
          unpaidCount++;
          unpaidSum += (due - paid);
          const od = computeOverdueDays(b);
          if (od > maxOverdue) maxOverdue = od;
        }
      });
      return {
        partner_code: c.partner_code || '-',
        car_number: c.car_number || '-',
        contract_code: c.contract_code || '-',
        contractor_name: c.contractor_name || '-',
        contractor_phone: c.contractor_phone || '-',
        action_status: c.action_status,
        unpaid_count: unpaidCount,
        unpaid_sum: unpaidSum,
        max_overdue_days: maxOverdue,
        rent_amount: Number(c.rent_amount) || 0,
        deposit_amount: Number(c.deposit_amount) || 0,
        contract_start: c.start_date || '-',
        note: c.note || '',
      };
    })
    .sort((a, b) => b.max_overdue_days - a.max_overdue_days);

  gridApi?.setGridOption('rowData', rows);
  const cnt = $('#igCount');
  if (cnt) cnt.textContent = rows.length;
}

export async function mount() {
  const el = $('#igGrid');
  if (!el) return;

  const money = (color) => ({
    type: 'numericColumn',
    valueFormatter: p => p.value ? fmt(p.value) : '-',
    cellStyle: { textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: color || 'var(--c-text)' },
  });

  gridApi = agGrid.createGrid(el, {
    columnDefs: [
      { headerName: '회원사',   field: 'partner_code',    width: 80 },
      { headerName: '차량번호', field: 'car_number',      width: 100, cellStyle: { fontWeight: 600 } },
      { headerName: '계약자',   field: 'contractor_name', width: 90 },
      { headerName: '연락처',   field: 'contractor_phone',width: 120 },
      { headerName: '조치상태', field: 'action_status',   width: 100,
        cellStyle: p => ({ color: ACTION_COLOR[p.value] || 'var(--c-text)', fontWeight: 700 }) },
      { headerName: '미납 회차', field: 'unpaid_count', width: 80, type: 'numericColumn',
        valueFormatter: p => p.value ? `${p.value}회` : '-',
        cellStyle: p => ({ textAlign: 'right', fontWeight: p.value ? 700 : 400, color: p.value ? '#dc2626' : 'var(--c-text-muted)' }) },
      { headerName: '미납액',    field: 'unpaid_sum',    width: 120, ...money('#dc2626') },
      { headerName: '미납 일수', field: 'max_overdue_days', width: 100, type: 'numericColumn',
        valueFormatter: p => p.value ? `${p.value}일` : '-',
        cellStyle: p => ({ textAlign: 'right', fontWeight: 700, color: p.value >= 60 ? '#7f1d1d' : p.value >= 30 ? '#dc2626' : '#ea580c' }) },
      { headerName: '월 대여료', field: 'rent_amount',    width: 110, ...money() },
      { headerName: '보증금',    field: 'deposit_amount', width: 110, ...money() },
      { headerName: '계약 시작', field: 'contract_start', width: 110 },
      { headerName: '계약코드',  field: 'contract_code',  width: 130, cellStyle: { color: 'var(--c-text-muted)' } },
      { headerName: '메모',      field: 'note',           flex: 1, minWidth: 150 },
    ],
    rowData: [],
    defaultColDef: { resizable: true, sortable: true, filter: 'agTextColumnFilter', minWidth: 60 },
    rowHeight: 28,
    headerHeight: 28,
    animateRows: false,
    suppressContextMenu: true,
  });

  watchContracts(items => { contracts = items; refresh(); });
  watchBillings(items => { billings = items; refresh(); });
}
