/**
 * grid.js — AG Grid 공통 규격
 *
 * 사용:
 *   import { createGrid } from '../core/grid.js';
 *   const { gridApi } = createGrid('#myGrid', columnDefs, {
 *     storageKey: 'jpk.grid.asset',
 *     onCellChanged: (key, field, value) => { ... },
 *     getRowId: (data) => data.vin,
 *   });
 */

import { JpkSetFilter } from './grid-set-filter.js';

const DEFAULTS = {
  rowHeight: 28,
  headerHeight: 28,
  animateRows: false,
  singleClickEdit: true,
  stopEditingWhenCellsLoseFocus: true,
  undoRedoCellEditing: true,
  defaultColDef: {
    resizable: true,
    sortable: true,
    filter: 'agTextColumnFilter',
    minWidth: 60,
  },
};

/**
 * @param {string} selector — 그리드 컨테이너 selector or element
 * @param {Array} columnDefs — AG Grid columnDefs
 * @param {object} opts
 * @param {string} opts.storageKey — 컬럼 상태 저장 키
 * @param {function} opts.onCellChanged — (rowKey, field, newValue) => void
 * @param {function} opts.getRowId — (data) => string
 */
export function createGrid(selector, columnDefs, opts = {}) {
  const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
  if (!el) throw new Error('Grid container not found: ' + selector);

  const storageKey = opts.storageKey || null;

  // 저장된 컬럼 폭 복원
  let savedState = {};
  if (storageKey) {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) JSON.parse(raw).forEach(s => { savedState[s.colId] = s; });
    } catch {}
  }

  // 컬럼 폭 적용
  const cols = columnDefs.map(c => {
    if (c.field && savedState[c.field]?.width) {
      return { ...c, width: savedState[c.field].width };
    }
    return c;
  });

  function saveState() {
    if (!storageKey || !gridApi) return;
    localStorage.setItem(storageKey, JSON.stringify(gridApi.getColumnState()));
  }

  const gridOptions = {
    ...DEFAULTS,
    columnDefs: cols,
    rowData: [],
    onColumnResized: saveState,
    onColumnMoved: saveState,
    onCellValueChanged: (e) => {
      if (opts.onCellChanged) {
        const key = opts.getRowId ? opts.getRowId(e.data) : e.data.id;
        opts.onCellChanged(key, e.colDef.field, e.newValue, e.data);
      }
    },
    getRowId: opts.getRowId
      ? (params) => opts.getRowId(params.data) || String(Math.random())
      : undefined,
    getContextMenuItems: opts.contextMenu || undefined,
  };

  const gridApi = agGrid.createGrid(el, gridOptions);

  // 저장된 상태 복원
  function restoreState() {
    if (!storageKey) return;
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try { gridApi.applyColumnState({ state: JSON.parse(saved), applyOrder: true }); } catch {}
    }
  }
  restoreState();

  return {
    gridApi,
    setData: (data) => gridApi.setGridOption('rowData', data),
    addRow: (row) => gridApi.applyTransaction({ add: [row] }),
    refreshRow: (node) => gridApi.refreshCells({ rowNodes: [node], force: true }),
    exportCsv: () => gridApi.exportDataAsCsv(),
    quickFilter: (text) => gridApi.setGridOption('quickFilterText', text),
  };
}

/**
 * 스키마 → AG Grid columnDefs 변환
 * @param {Array} schema — ASSET_SCHEMA 등
 * @param {object} opts
 * @param {function} opts.editable — (params) => boolean
 */
export function schemaToColumns(schema, opts = {}) {
  const gridCols = schema.filter(s => s.gridShow);
  return [
    { headerName: '#', valueGetter: 'node.rowIndex + 1', width: 50, editable: false },
    ...gridCols.map(s => ({
      field: s.col,
      headerName: s.label + (s.required ? ' *' : ''),
      editable: opts.editable || false,
      ...(s.type === 'select'
        ? { filter: JpkSetFilter }
        : s.type === 'number'
          ? { filter: false }
          : { filter: 'agTextColumnFilter' }),
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
}
