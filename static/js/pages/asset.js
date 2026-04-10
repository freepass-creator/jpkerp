/**
 * pages/asset.js — 자산관리 (AG Grid)
 *
 * 기본: 읽기 전용
 * 행 추가: 새 행은 바로 편집 가능
 * 수정: 우클릭 → "수정하기" → 해당 행만 편집 가능
 * 저장: 변경사항 일괄 반영
 */
import { showToast } from '../core/toast.js';
import { showContextMenu } from '../core/context-menu.js';
import { watchAssets, saveAsset, updateAsset } from '../firebase/assets.js';
import { ASSET_SCHEMA } from '../data/schemas/asset.js';

let gridApi = null;
let allData = [];
let dirtyRows = {};
let editableVins = new Set();  // 편집 허용된 행

export async function mount() {
  initGrid();
  bindButtons();
  restoreColumnState();
  watchAssets((data) => {
    allData = data;
    document.getElementById('assetCount').textContent = data.length;
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
    ...ASSET_SCHEMA.filter(s => s.gridShow).map(s => ({
      field: s.col,
      headerName: s.label + (s.required ? ' *' : ''),
      editable: (params) => {
        const key = params.data.vin || params.data._tempId;
        return editableVins.has(key);
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
    defaultColDef: {
      resizable: true,
      sortable: false,
      filter: false,
      minWidth: 60,
    },
    rowHeight: 28,
    headerHeight: 28,
    animateRows: false,
    singleClickEdit: true,
    stopEditingWhenCellsLoseFocus: true,
    undoRedoCellEditing: true,
    onCellValueChanged: (e) => {
      const key = e.data.vin || e.data._tempId;
      if (!key) return;
      if (!dirtyRows[key]) dirtyRows[key] = {};
      dirtyRows[key][e.colDef.field] = e.newValue;
    },
    getRowId: (params) => params.data.vin || params.data._tempId || String(Math.random()),
    onColumnResized: saveColumnState,
    onColumnMoved: saveColumnState,

    suppressContextMenu: true,
  };

  const el = document.getElementById('assetGrid');
  gridApi = agGrid.createGrid(el, gridOptions);

  // 우클릭 메뉴
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    // 클릭한 행/셀 찾기
    const rowEl = e.target.closest('[row-index]');
    if (!rowEl) return;
    const rowIndex = parseInt(rowEl.getAttribute('row-index'));
    const node = gridApi.getDisplayedRowAtIndex(rowIndex);
    if (!node) return;

    const key = node.data.vin || node.data._tempId;
    const isEditing = editableVins.has(key);
    const hasDirty = !!dirtyRows[key];

    // 클릭한 컬럼
    const cellEl = e.target.closest('[col-id]');
    const colId = cellEl?.getAttribute('col-id');

    showContextMenu(e, [
      { label: '수정하기', icon: '✏', disabled: isEditing, action: () => {
        editableVins.add(key);
        gridApi.refreshCells({ rowNodes: [node], force: true });
        if (colId) setTimeout(() => gridApi.startEditingCell({ rowIndex, colKey: colId }), 50);
      }},
      { label: '수정 취소', icon: '↩', disabled: !isEditing, action: () => {
        editableVins.delete(key);
        delete dirtyRows[key];
        const orig = allData.find(r => r.vin === key);
        if (orig) node.setData({ ...orig });
        gridApi.refreshCells({ rowNodes: [node], force: true });
      }},
      { label: '이 행 저장', icon: '💾', disabled: !hasDirty, action: async () => {
        const changes = dirtyRows[key];
        if (!changes) return;
        try {
          if (key.startsWith('_new_')) {
            const missing = ASSET_SCHEMA.filter(s => s.required && !changes[s.col]);
            if (missing.length) { showToast('필수: ' + missing.map(s => s.label).join(', '), 'error'); return; }
            await saveAsset(changes);
          } else {
            await updateAsset(key, changes);
          }
          delete dirtyRows[key];
          editableVins.delete(key);
          showToast('저장 완료', 'success');
        } catch (err) { showToast(err.message, 'error'); }
      }},
      'sep',
      { label: '위에 행 추가', icon: '⬆', action: () => addRowAt(rowIndex) },
      { label: '아래에 행 추가', icon: '⬇', action: () => addRowAt(rowIndex + 1) },
      { label: '행 복사', icon: '📋', action: () => {
        const text = ASSET_SCHEMA.filter(s => s.gridShow).map(s => node.data[s.col] || '').join('\t');
        navigator.clipboard.writeText(text);
        showToast('복사 완료', 'success');
      }},
      'sep',
      { label: '삭제', icon: '🗑', danger: true, action: () => {
        if (!confirm((node.data.car_number || '이 행') + ' 삭제할까요?')) return;
        if (key.startsWith('_new_')) {
          gridApi.applyTransaction({ remove: [node.data] });
          delete dirtyRows[key];
          editableVins.delete(key);
        } else {
          showToast('삭제 기능 준비 중', 'info');
        }
      }},
    ]);
  });
}

function addRowAt(index) {
  const tempId = '_new_' + Date.now();
  editableVins.add(tempId);
  dirtyRows[tempId] = {};
  gridApi.applyTransaction({ add: [{ _tempId: tempId }], addIndex: index });
  setTimeout(() => {
    const firstCol = ASSET_SCHEMA.find(s => s.gridShow);
    if (firstCol) gridApi.startEditingCell({ rowIndex: index, colKey: firstCol.col });
  }, 50);
}

const COL_STATE_KEY = 'jpk.grid.asset';
function restoreColumnState() {
  const saved = localStorage.getItem(COL_STATE_KEY);
  if (saved) {
    try { gridApi.applyColumnState({ state: JSON.parse(saved), applyOrder: true }); } catch {}
  }
}
function saveColumnState() {
  if (!gridApi) return;
  localStorage.setItem(COL_STATE_KEY, JSON.stringify(gridApi.getColumnState()));
}

function bindButtons() {
  // 행 추가 — 새 행은 바로 편집 가능
  document.getElementById('assetAddRow')?.addEventListener('click', () => {
    const tempId = '_new_' + Date.now();
    const newRow = { _tempId: tempId };
    dirtyRows[tempId] = {};
    editableVins.add(tempId);
    gridApi.applyTransaction({ add: [newRow] });
    setTimeout(() => {
      const rowNode = gridApi.getRowNode(tempId);
      if (rowNode) {
        const firstCol = ASSET_SCHEMA.find(s => s.gridShow);
        if (firstCol) gridApi.startEditingCell({ rowIndex: rowNode.rowIndex, colKey: firstCol.col });
      }
    }, 50);
  });

  // 저장
  document.getElementById('assetSaveAll')?.addEventListener('click', async () => {
    const keys = Object.keys(dirtyRows);
    if (!keys.length) { showToast('변경사항 없음', 'info'); return; }

    let ok = 0, fail = 0;
    for (const key of keys) {
      const changes = dirtyRows[key];
      if (!Object.keys(changes).length) continue;
      try {
        if (key.startsWith('_new_')) {
          const missing = ASSET_SCHEMA.filter(s => s.required && !changes[s.col]);
          if (missing.length) { showToast(`필수: ${missing.map(s => s.label).join(', ')}`, 'error'); fail++; continue; }
          await saveAsset(changes);
        } else {
          await updateAsset(key, changes);
        }
        delete dirtyRows[key];
        editableVins.delete(key);
        ok++;
      } catch (e) { fail++; showToast(e.message, 'error'); }
    }
    if (ok) showToast(`${ok}건 저장`, 'success');
  });

  // 검색
  document.getElementById('assetSearch')?.addEventListener('input', (e) => {
    gridApi.setGridOption('quickFilterText', e.target.value);
  });
}
