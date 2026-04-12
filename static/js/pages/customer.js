/**
 * pages/customer.js — 고객관리 (AG Grid)
 */
import { showToast } from '../core/toast.js';
import { showContextMenu } from '../core/context-menu.js';
import { watchCustomers, saveCustomer, updateCustomer } from '../firebase/customers.js';
import { CUSTOMER_SCHEMA } from '../data/schemas/customer.js';

let gridApi = null;
let allData = [];
let dirtyRows = {};
let editableKeys = new Set();
const KEY = 'customer_code';
const COL_STATE_KEY = 'jpk.grid.customer';

export async function mount() {
  initGrid();
  bindButtons();
  restoreColumnState();
  watchCustomers((data) => {
    allData = data;
    document.getElementById('customerCount').textContent = data.length;
    gridApi.setGridOption('rowData', data.map(r => ({ ...r })));
  });
}

function initGrid() {
  let savedState = {};
  try {
    const raw = localStorage.getItem(COL_STATE_KEY);
    if (raw) JSON.parse(raw).forEach(s => { savedState[s.colId] = s; });
  } catch {}

  const columnDefs = [
    { headerName: '#', valueGetter: 'node.rowIndex + 1', width: 50, editable: false },
    ...CUSTOMER_SCHEMA.map(s => ({
      field: s.col,
      headerName: s.label + (s.required ? ' *' : ''),
      editable: (params) => {
        const key = params.data[KEY] || params.data._tempId;
        return editableKeys.has(key);
      },
      ...(savedState[s.col]?.width ? { width: savedState[s.col].width } : {}),
      ...(s.type === 'select' && s.options ? {
        cellEditor: 'agSelectCellEditor',
        cellEditorParams: { values: ['', ...s.options] },
      } : {}),
      ...(s.type === 'date' ? { cellEditor: 'agTextCellEditor' } : {}),
      ...(s.type === 'number' ? {
        cellEditor: 'agTextCellEditor',
        valueParser: (params) => params.newValue,
      } : {}),
    })),
  ];

  const gridOptions = {
    columnDefs,
    rowData: [],
    defaultColDef: { resizable: true, sortable: false, filter: 'agTextColumnFilter', minWidth: 60 },
    rowHeight: 28,
    headerHeight: 28,
    animateRows: false,
    singleClickEdit: true,
    stopEditingWhenCellsLoseFocus: true,
    undoRedoCellEditing: true,
    onCellValueChanged: (e) => {
      const key = e.data[KEY] || e.data._tempId;
      if (!key) return;
      if (!dirtyRows[key]) dirtyRows[key] = {};
      dirtyRows[key][e.colDef.field] = e.newValue;
    },
    getRowId: (params) => params.data[KEY] || params.data._tempId || String(Math.random()),
    onColumnResized: saveColumnState,
    onColumnMoved: saveColumnState,
    suppressContextMenu: true,
  };

  const el = document.getElementById('customerGrid');
  gridApi = agGrid.createGrid(el, gridOptions);
  el._agApi = gridApi;

  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const rowEl = e.target.closest('[row-index]');
    if (!rowEl) return;
    const rowIndex = parseInt(rowEl.getAttribute('row-index'));
    const node = gridApi.getDisplayedRowAtIndex(rowIndex);
    if (!node) return;
    const key = node.data[KEY] || node.data._tempId;
    const isEditing = editableKeys.has(key);
    const hasDirty = !!dirtyRows[key];
    const cellEl = e.target.closest('[col-id]');
    const colId = cellEl?.getAttribute('col-id');

    showContextMenu(e, [
      { label: '수정하기', icon: '✏', disabled: isEditing, action: () => {
        editableKeys.add(key);
        gridApi.refreshCells({ rowNodes: [node], force: true });
        if (colId) setTimeout(() => gridApi.startEditingCell({ rowIndex, colKey: colId }), 50);
      }},
      { label: '수정 취소', icon: '↩', disabled: !isEditing, action: () => {
        editableKeys.delete(key);
        delete dirtyRows[key];
        const orig = allData.find(r => r[KEY] === key);
        if (orig) node.setData({ ...orig });
        gridApi.refreshCells({ rowNodes: [node], force: true });
      }},
      { label: '이 행 저장', icon: '💾', disabled: !hasDirty, action: () => saveRow(key, node) },
      { label: '상세보기', icon: '📄', action: () => showCustomerDetail(node.data) },
      'sep',
      { label: '위에 행 추가', icon: '⬆', action: () => addRowAt(rowIndex) },
      { label: '아래에 행 추가', icon: '⬇', action: () => addRowAt(rowIndex + 1) },
      { label: '행 복사', icon: '📋', action: () => {
        const text = CUSTOMER_SCHEMA.filter(s => s.gridShow).map(s => node.data[s.col] || '').join('\t');
        navigator.clipboard.writeText(text);
        showToast('복사 완료', 'success');
      }},
    ]);
  });
}

async function saveRow(key, node) {
  const changes = dirtyRows[key];
  if (!changes) return;
  try {
    if (key.startsWith('_new_')) {
      const missing = CUSTOMER_SCHEMA.filter(s => s.required && !changes[s.col]);
      if (missing.length) { showToast('필수: ' + missing.map(s => s.label).join(', '), 'error'); return; }
      await saveCustomer(changes);
    } else {
      await updateCustomer(key, changes);
    }
    delete dirtyRows[key];
    editableKeys.delete(key);
    showToast('저장 완료', 'success');
  } catch (err) { showToast(err.message, 'error'); }
}

function addRowAt(index) {
  const tempId = '_new_' + Date.now();
  editableKeys.add(tempId);
  dirtyRows[tempId] = {};
  gridApi.applyTransaction({ add: [{ _tempId: tempId }], addIndex: index });
  setTimeout(() => {
    const firstCol = CUSTOMER_SCHEMA.find(s => s.gridShow);
    if (firstCol) gridApi.startEditingCell({ rowIndex: index, colKey: firstCol.col });
  }, 50);
}

function restoreColumnState() {
  const saved = localStorage.getItem(COL_STATE_KEY);
  if (saved) { try { gridApi.applyColumnState({ state: JSON.parse(saved), applyOrder: true }); } catch {} }
}
function saveColumnState() {
  if (!gridApi) return;
  localStorage.setItem(COL_STATE_KEY, JSON.stringify(gridApi.getColumnState()));
}

function bindButtons() {
  document.getElementById('customerSearch')?.addEventListener('input', (e) => {
    gridApi.setGridOption('quickFilterText', e.target.value);
  });
}

const row = (l,v) => v ? `<tr><td style="padding:6px 12px 6px 0;color:var(--c-text-muted);width:120px">${l}</td><td style="padding:6px 0;font-weight:500">${v}</td></tr>` : '';
function showCustomerDetail(d) {
  const grid = document.getElementById('customerGrid');
  const detail = document.getElementById('customerDetailView');
  grid.style.display='none'; detail.hidden=false; detail.style.display='block';
  detail.innerHTML = `<div style="max-width:800px;margin:0 auto;padding:24px">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
      <button class="btn" id="customerBack">← 목록</button>
      <span style="font-size:var(--font-size-lg);font-weight:700">👤 ${d.code_name||''}</span>
    </div>
    <div style="background:var(--c-bg);border:1px solid var(--c-border);border-radius:var(--r-md);padding:20px">
      <table style="width:100%;border-collapse:collapse;font-size:var(--font-size)">
        ${row('고객코드',d.customer_code)}${row('이름/상호',d.code_name)}${row('등록번호',d.customer_reg_no)}
        ${row('연락처',d.phone)}${row('구분',d.type)}${row('주소',d.address)}${row('이메일',d.email)}
        ${row('사업자번호',d.biz_no)}${row('상호',d.biz_name)}${row('대표자',d.ceo_name)}
      </table>
      ${d.note?`<div style="margin-top:12px;padding:10px;background:var(--c-bg-sub);border-radius:var(--r-md);font-size:var(--font-size-sm)">${d.note}</div>`:''}
    </div></div>`;
  document.getElementById('customerBack')?.addEventListener('click',()=>{detail.style.display='none';detail.hidden=true;grid.style.display='';});
}
