/**
 * grid-utils.js — AG Grid 공통 유틸 (스키마 → 컬럼, 상태 저장/복원)
 */

const MONEY_RE = /price|amount|fee|tax|principal|bond|duty|commission|insurance|deposit|rent|payment|cost|down|prepay|transfer/i;
const isMoneyField = (s) => s.money === true || (s.type === 'number' && MONEY_RE.test(s.col));

/** 자산 노출 시 기본 컬럼 순서 — 정적 속성만 (변동값 제외) */
export const ASSET_DEFAULT_ORDER = [
  'partner_code', 'car_number', 'vin',
  'manufacturer', 'car_model', 'detail_model', 'trim', 'options',
  'car_year', 'fuel_type', 'ext_color', 'int_color',
];

/** columnDefs를 우선순위 순서대로 정렬. 우선순위에 없는 건 원래 순서로 뒤에. */
export function orderColumnsByPriority(cols, priorityFields) {
  const priorityMap = new Map(priorityFields.map((f, i) => [f, i]));
  const inPriority = [];
  const outPriority = [];
  for (const c of cols) {
    if (c.field && priorityMap.has(c.field)) inPriority.push(c);
    else outPriority.push(c);
  }
  inPriority.sort((a, b) => priorityMap.get(a.field) - priorityMap.get(b.field));
  return [...inPriority, ...outPriority];
}

/** 스키마를 AG Grid columnDefs로 변환. editableFn = (params) => bool */
export function buildSchemaColumns(schema, { editableFn, savedState = {}, includeRowNum = true } = {}) {
  const cols = [];
  if (includeRowNum) {
    cols.push({ headerName: '#', valueGetter: 'node.rowIndex + 1', width: 50, editable: false });
  }
  for (const s of schema) {
    const money = isMoneyField(s);
    cols.push({
      field: s.col,
      headerName: s.label + (s.required ? ' *' : ''),
      ...(editableFn ? { editable: editableFn } : {}),
      ...(savedState[s.col]?.width ? { width: savedState[s.col].width } : {}),
      ...(s.type === 'select' && s.options ? {
        cellEditor: 'agSelectCellEditor',
        cellEditorParams: { values: ['', ...s.options] },
      } : {}),
      ...(s.type === 'date' ? { cellEditor: 'agTextCellEditor' } : {}),
      ...(money ? {
        cellEditor: 'agTextCellEditor',
        type: 'rightAligned',
        cellStyle: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
        valueFormatter: (p) => {
          if (p.value === null || p.value === undefined || p.value === '') return '';
          const n = Number(String(p.value).replace(/,/g, ''));
          return Number.isFinite(n) ? n.toLocaleString('ko-KR') : p.value;
        },
        valueParser: (p) => {
          const raw = String(p.newValue ?? '').replace(/,/g, '').trim();
          if (!raw) return '';
          const n = Number(raw);
          return Number.isFinite(n) ? n : p.newValue;
        },
      } : s.type === 'number' ? {
        cellEditor: 'agTextCellEditor',
        valueParser: (params) => params.newValue,
      } : {}),
    });
  }
  return cols;
}

/** localStorage에서 savedState 복원 (columnDefs width용) */
export function readSavedColState(colStateKey) {
  try {
    const raw = localStorage.getItem(colStateKey);
    if (!raw) return {};
    const map = {};
    JSON.parse(raw).forEach(s => { map[s.colId] = s; });
    return map;
  } catch { return {}; }
}

/** gridApi 초기화 후 컬럼 순서/너비 적용. 저장된 state에 없는 새 컬럼은 보이게(hide:false). */
export function applyColState(gridApi, colStateKey) {
  const raw = localStorage.getItem(colStateKey);
  if (!raw) return;
  try {
    gridApi.applyColumnState({
      state: JSON.parse(raw),
      applyOrder: true,
      defaultState: { hide: false },
    });
  } catch {}
}

/** 현재 컬럼 상태를 localStorage에 저장 */
export function persistColState(gridApi, colStateKey) {
  if (!gridApi) return;
  localStorage.setItem(colStateKey, JSON.stringify(gridApi.getColumnState()));
}

/** 표준 gridOptions — 28px 행/헤더, 싱글클릭 편집, dirtyRows 자동 추적 */
export function baseGridOptions({ columnDefs, keyField, dirtyRows, onColStateChange, colStateKey }) {
  return {
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
      const key = e.data[keyField] || e.data._tempId;
      if (!key) return;
      if (!dirtyRows[key]) dirtyRows[key] = {};
      dirtyRows[key][e.colDef.field] = e.newValue;
    },
    getRowId: (params) => params.data[keyField] || params.data._tempId || String(Math.random()),
    onColumnResized: onColStateChange,
    onColumnMoved: onColStateChange,
    suppressContextMenu: true,
    // 페이지 열 때마다 내용에 맞춰 자동 폭 (사용자 수동 리사이즈는 saveColState에 누적 저장됨)
    onFirstDataRendered: (e) => {
      const allCols = e.api.getColumns()?.map(c => c.getColId()).filter(Boolean) || [];
      if (allCols.length) e.api.autoSizeColumns(allCols, false);
    },
  };
}
