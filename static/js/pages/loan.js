/**
 * pages/loan.js — 할부관리 (자산의 할부실행 데이터를 그리드로)
 */
import { showToast } from '../core/toast.js';
import { showContextMenu } from '../core/context-menu.js';
import { openDetail } from '../core/detail-panel.js';
import { watchAssets } from '../firebase/assets.js';

let gridApi = null;
const COL_STATE_KEY = 'jpk.grid.loan';

export async function mount() {
  initGrid();
  watchAssets((data) => {
    // 할부 정보 있는 자산만
    const loans = data.filter(a => a.loan_company || a.loan_principal).map(a => ({
      vin: a.vin,
      car_number: a.car_number,
      manufacturer: a.manufacturer,
      car_model: a.car_model,
      loan_company: a.loan_company || '-',
      loan_principal: a.loan_principal || 0,
      loan_down_payment: a.loan_down_payment || 0,
      loan_months: a.loan_months || 0,
      loan_rate: a.loan_rate || 0,
      loan_monthly: a.loan_monthly || 0,
      loan_start_date: a.loan_start_date || '',
      loan_end_date: a.loan_end_date || '',
      loan_status: a.loan_status || '-',
      loan_account: a.loan_account || '',
    }));
    document.getElementById('loanCount').textContent = loans.length;
    gridApi.setGridOption('rowData', loans);
  });
}

function initGrid() {
  let savedState = {};
  try {
    const raw = localStorage.getItem(COL_STATE_KEY);
    if (raw) JSON.parse(raw).forEach(s => { savedState[s.colId] = s; });
  } catch {}

  const cols = [
    { headerName: '#', valueGetter: 'node.rowIndex+1', width: 45 },
    { headerName: '차량번호', field: 'car_number', width: 90 },
    { headerName: '제조사', field: 'manufacturer', width: 70 },
    { headerName: '모델', field: 'car_model', width: 80 },
    { headerName: '할부/리스사', field: 'loan_company', width: 100 },
    { headerName: '원금', field: 'loan_principal', width: 100, valueFormatter: p => p.value ? Number(p.value).toLocaleString() : '-' },
    { headerName: '선수금', field: 'loan_down_payment', width: 90, valueFormatter: p => p.value ? Number(p.value).toLocaleString() : '-' },
    { headerName: '개월', field: 'loan_months', width: 60 },
    { headerName: '금리(%)', field: 'loan_rate', width: 70 },
    { headerName: '월납입', field: 'loan_monthly', width: 90, valueFormatter: p => p.value ? Number(p.value).toLocaleString() : '-' },
    { headerName: '시작일', field: 'loan_start_date', width: 90 },
    { headerName: '종료일', field: 'loan_end_date', width: 90 },
    { headerName: '상태', field: 'loan_status', width: 80 },
  ].map(c => ({ ...c, ...(savedState[c.field]?.width ? { width: savedState[c.field].width } : {}) }));

  const el = document.getElementById('loanGrid');
  gridApi = agGrid.createGrid(el, {
    columnDefs: cols,
    rowData: [],
    defaultColDef: { resizable: true, sortable: false, filter: false, minWidth: 50 },
    rowHeight: 28,
    headerHeight: 28,
    animateRows: false,
    suppressContextMenu: true,
    onColumnResized: saveState,
    onColumnMoved: saveState,
    getRowId: p => p.data.vin || String(Math.random()),
  });

  // 컬럼 상태 복원
  const saved = localStorage.getItem(COL_STATE_KEY);
  if (saved) { try { gridApi.applyColumnState({ state: JSON.parse(saved), applyOrder: true }); } catch {} }

  // 더블클릭 → 상세
  el.addEventListener('dblclick', (e) => {
    const rowEl = e.target.closest('[row-index]');
    if (!rowEl) return;
    const node = gridApi.getDisplayedRowAtIndex(parseInt(rowEl.getAttribute('row-index')));
    if (!node) return;
    const d = node.data;
    const fmt = v => v ? Number(v).toLocaleString() + '원' : '-';
    openDetail({
      title: `${d.car_number} ${d.car_model || ''}`,
      subtitle: d.loan_company || '',
      sections: [{
        label: '할부 정보',
        rows: [
          { label: '할부/리스사', value: d.loan_company },
          { label: '원금', value: fmt(d.loan_principal) },
          { label: '선수금', value: fmt(d.loan_down_payment) },
          { label: '할부개월', value: d.loan_months ? d.loan_months + '개월' : '-' },
          { label: '금리', value: d.loan_rate ? d.loan_rate + '%' : '-' },
          { label: '월 납입금', value: fmt(d.loan_monthly) },
          { label: '납입시작일', value: d.loan_start_date || '-' },
          { label: '납입종료일', value: d.loan_end_date || '-' },
          { label: '출금계좌', value: d.loan_account || '-' },
          { label: '상환상태', value: d.loan_status },
        ],
      }, {
        label: '차량 정보',
        rows: [
          { label: '차량번호', value: d.car_number },
          { label: '제조사', value: d.manufacturer },
          { label: '모델', value: d.car_model },
        ],
      }],
    });
  });

  // 검색
  document.getElementById('loanSearch')?.addEventListener('input', (e) => {
    gridApi.setGridOption('quickFilterText', e.target.value);
  });

  function saveState() {
    if (!gridApi) return;
    localStorage.setItem(COL_STATE_KEY, JSON.stringify(gridApi.getColumnState()));
  }
}
