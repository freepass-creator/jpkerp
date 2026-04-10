/**
 * pages/contract.js — 계약관리 (AG Grid)
 */
import { showToast } from '../core/toast.js';
import { showContextMenu } from '../core/context-menu.js';
import { watchContracts, saveContract, updateContract } from '../firebase/contracts.js';
import { CONTRACT_SCHEMA } from '../data/schemas/contract.js';

let gridApi = null;
let allData = [];
let dirtyRows = {};
let editableKeys = new Set();
const KEY = 'contract_code';
const COL_STATE_KEY = 'jpk.grid.contract';

export async function mount() {
  initGrid();
  bindButtons();
  restoreColumnState();
  watchContracts((data) => {
    allData = data;
    document.getElementById('contractCount').textContent = data.length;
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
    ...CONTRACT_SCHEMA.filter(s => s.gridShow).map(s => ({
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
    defaultColDef: { resizable: true, sortable: false, filter: false, minWidth: 60 },
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

  const el = document.getElementById('contractGrid');
  gridApi = agGrid.createGrid(el, gridOptions);

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
      'sep',
      { label: '위에 행 추가', icon: '⬆', action: () => addRowAt(rowIndex) },
      { label: '아래에 행 추가', icon: '⬇', action: () => addRowAt(rowIndex + 1) },
      { label: '행 복사', icon: '📋', action: () => {
        const text = CONTRACT_SCHEMA.filter(s => s.gridShow).map(s => node.data[s.col] || '').join('\t');
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
      const missing = CONTRACT_SCHEMA.filter(s => s.required && !changes[s.col]);
      if (missing.length) { showToast('필수: ' + missing.map(s => s.label).join(', '), 'error'); return; }
      await saveContract(changes);
    } else {
      await updateContract(key, changes);
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
    const firstCol = CONTRACT_SCHEMA.find(s => s.gridShow);
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
  document.getElementById('contractSearch')?.addEventListener('input', (e) => {
    gridApi.setGridOption('quickFilterText', e.target.value);
  });
}
