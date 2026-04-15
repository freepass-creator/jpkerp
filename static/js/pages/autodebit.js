/**
 * pages/autodebit.js — 자동이체 관리
 */
import { ref, onValue, set } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js';
import { db } from '../firebase/config.js';
import { AUTODEBIT_SCHEMA } from '../data/schemas/autodebit.js';
import { showToast } from '../core/toast.js';

const $ = s => document.querySelector(s);
let gridApi = null;

export async function mount() {
  initGrid();
  bindButtons();
  onValue(ref(db, 'autodebits'), snap => {
    const items = snap.exists() ? Object.values(snap.val()).filter(r => r.status !== 'deleted') : [];
    items.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    gridApi?.setGridOption('rowData', items);
    $('#adSubtitle').textContent = `${items.length}건`;
  });
}

function initGrid() {
  const cols = AUTODEBIT_SCHEMA.filter(s => s.gridShow).map(s => ({
    headerName: s.label,
    field: s.col,
    width: s.num ? 100 : 110,
    ...(s.num ? { valueFormatter: p => p.value ? Number(p.value).toLocaleString() : '' } : {}),
  }));

  gridApi = agGrid.createGrid($('#adGrid'), {
    columnDefs: [
      { headerName: '#', valueGetter: 'node.rowIndex + 1', width: 45 },
      ...cols,
    ],
    rowData: [],
    defaultColDef: { resizable: true, sortable: true, filter: true, minWidth: 40 },
    rowHeight: 30, headerHeight: 28, animateRows: false, suppressContextMenu: true,
  });
}

function bindButtons() {
  $('#adNew')?.addEventListener('click', () => {
    showToast('개별입력 > 자동이체 에서 등록 (곧 추가)', 'info');
  });
  $('#adUpload')?.addEventListener('click', () => {
    location.href = '/upload';
  });
}
