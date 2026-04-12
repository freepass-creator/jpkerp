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
    ...ASSET_SCHEMA.map(s => ({
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
      { label: '상세보기', icon: '📄', action: () => showAssetDetail(node.data) },
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

  document.getElementById('assetSearch')?.addEventListener('input', (e) => {
    gridApi.setGridOption('quickFilterText', e.target.value);
  });
}

const fmtD = s => { if(!s) return '-'; const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); return m?`${m[1].slice(2)}.${m[2]}.${m[3]}`:s; };
const fmtN = v => v ? Number(v).toLocaleString('ko-KR') : '-';
const row = (l,v) => v && v !== '-' ? `<tr><td style="padding:6px 12px 6px 0;color:var(--c-text-muted);width:120px;vertical-align:top">${l}</td><td style="padding:6px 0;font-weight:500">${v}</td></tr>` : '';

function showAssetDetail(d) {
  const grid = document.getElementById('assetGrid');
  const detail = document.getElementById('assetDetailView');
  grid.style.display = 'none'; detail.hidden = false; detail.style.display = 'block';
  detail.innerHTML = `<div style="max-width:800px;margin:0 auto;padding:24px">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
      <button class="btn" id="assetBack">← 목록</button>
      <span style="font-size:var(--font-size-lg);font-weight:700">🚗 ${d.car_number || ''} ${d.car_model || ''}</span>
    </div>
    <div style="background:var(--c-bg);border:1px solid var(--c-border);border-radius:var(--r-md);padding:20px">
      <div style="font-weight:600;margin-bottom:8px">차량 기본</div>
      <table style="width:100%;border-collapse:collapse;font-size:var(--font-size)">
        ${row('차량번호',d.car_number)}${row('차대번호',d.vin)}${row('제조사',d.manufacturer)}
        ${row('모델',d.car_model)}${row('세부모델',d.detail_model)}${row('연식',d.car_year)}
        ${row('상태',d.asset_status)}${row('색상',d.ext_color)}
      </table>
      <div style="font-weight:600;margin:16px 0 8px">제원/등록</div>
      <table style="width:100%;border-collapse:collapse;font-size:var(--font-size)">
        ${row('연료',d.fuel_type)}${row('배기량',d.displacement)}${row('변속기',d.transmission)}
        ${row('최초등록일',fmtD(d.first_reg_date))}${row('용도',d.usage_type)}
      </table>
      <div style="font-weight:600;margin:16px 0 8px">취득</div>
      <table style="width:100%;border-collapse:collapse;font-size:var(--font-size)">
        ${row('취득방법',d.purchase_method)}${row('취득일',fmtD(d.purchase_date))}
        ${row('매입처',d.dealer)}${row('취득원가',fmtN(d.purchase_price)+'원')}
      </table>
      <div style="font-weight:600;margin:16px 0 8px">할부</div>
      <table style="width:100%;border-collapse:collapse;font-size:var(--font-size)">
        ${row('금융사',d.loan_company)}${row('원금',fmtN(d.loan_principal)+'원')}
        ${row('할부기간',d.loan_months?d.loan_months+'개월':'-')}${row('금리',d.loan_rate?d.loan_rate+'%':'-')}
        ${row('대출방식',d.loan_method)}${row('초회차납입일',fmtD(d.loan_start_date))}
      </table>
      <div style="font-weight:600;margin:16px 0 8px">소유/차키</div>
      <table style="width:100%;border-collapse:collapse;font-size:var(--font-size)">
        ${row('소유구분',d.owner_type)}${row('소유자',d.owner_name)}
        ${row('메인키',d.key_main)}${row('보조키',d.key_sub)}${row('카드키',d.key_card)}
        ${row('주행거리',d.mileage?fmtN(d.mileage)+'km':'-')}
      </table>
      ${d.note?`<div style="margin-top:12px;padding:10px;background:var(--c-bg-sub);border-radius:var(--r-md);font-size:var(--font-size-sm)">${d.note}</div>`:''}
    </div>
  </div>`;
  document.getElementById('assetBack')?.addEventListener('click',()=>{detail.style.display='none';detail.hidden=true;grid.style.display='';});
}
