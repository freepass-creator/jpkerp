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
import { openDetail, schemaToSections } from '../core/detail-panel.js';
import { buildSchemaColumns, readSavedColState, applyColState, persistColState, baseGridOptions, orderColumnsByPriority, ASSET_DEFAULT_ORDER } from '../core/grid-utils.js';
import { watchAssets, saveAsset, updateAsset } from '../firebase/assets.js';
import { ASSET_SCHEMA, ASSET_SECTIONS } from '../data/schemas/asset.js';

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
    const countEl = document.getElementById('assetCount');
    if (countEl) countEl.textContent = data.length;
    gridApi.setGridOption('rowData', data.map(r => ({ ...r })));
  });
}

function initGrid() {
  const savedState = readSavedColState(COL_STATE_KEY);
  const baseCols = buildSchemaColumns(ASSET_SCHEMA, {
    savedState,
    editableFn: (params) => editableVins.has(params.data.vin || params.data._tempId),
  });
  // 첫 컬럼(#)는 유지, 나머지를 자산 표준 순서로 정렬
  const [rowNumCol, ...rest] = baseCols;
  const columnDefs = [rowNumCol, ...orderColumnsByPriority(rest, ASSET_DEFAULT_ORDER)];
  const gridOptions = baseGridOptions({
    columnDefs,
    keyField: 'vin',
    dirtyRows,
    onColStateChange: saveColumnState,
    colStateKey: COL_STATE_KEY,
  });

  const el = document.getElementById('assetGrid');
  gridApi = agGrid.createGrid(el, gridOptions);
  el._agApi = gridApi;

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
      { label: '상세보기', icon: '📄', action: () => {
        openDetail({
          title: `${d.car_number || ''} ${d.manufacturer || ''} ${d.car_model || ''}`.trim(),
          subtitle: d.vin || '',
          sections: schemaToSections(ASSET_SCHEMA, d, ASSET_SECTIONS),
        });
      }},
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

  // 행 더블클릭 → 상세 팝업
  el.addEventListener('dblclick', (e) => {
    const rowEl = e.target.closest('[row-index]');
    if (!rowEl) return;
    const node = gridApi.getDisplayedRowAtIndex(parseInt(rowEl.getAttribute('row-index')));
    if (!node || node.data._tempId) return;
    const d = node.data;
    openDetail({
      title: `${d.car_number || ''} ${d.manufacturer || ''} ${d.car_model || ''}`.trim(),
      subtitle: d.vin || '',
      sections: schemaToSections(ASSET_SCHEMA, d, ASSET_SECTIONS),
    });
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
function restoreColumnState() { applyColState(gridApi, COL_STATE_KEY); }
function saveColumnState() { persistColState(gridApi, COL_STATE_KEY); }

function bindButtons() {
  // 수정/저장 토글
  let editingAll = false;
  const toggleBtn = document.getElementById('assetEditToggle');
  const refreshToggleUI = () => {
    if (!toggleBtn) return;
    toggleBtn.innerHTML = editingAll
      ? '<i class="ph ph-floppy-disk"></i><span>저장</span>'
      : '<i class="ph ph-pencil-simple"></i><span>수정</span>';
  };

  toggleBtn?.addEventListener('click', async () => {
    if (!editingAll) {
      // 수정 모드 진입: 모든 행 편집 가능
      allData.forEach(r => { if (r.vin) editableVins.add(r.vin); });
      gridApi.refreshCells({ force: true });
      editingAll = true;
      refreshToggleUI();
      showToast('수정 모드 — 셀 더블클릭해 편집', 'info');
    } else {
      // 저장
      const keys = Object.keys(dirtyRows);
      if (!keys.length) {
        editableVins.clear();
        gridApi.refreshCells({ force: true });
        editingAll = false;
        refreshToggleUI();
        showToast('변경사항 없음', 'info');
        return;
      }
      toggleBtn.disabled = true;
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
          ok++;
        } catch (e) { fail++; showToast(e.message, 'error'); }
      }
      editableVins.clear();
      gridApi.refreshCells({ force: true });
      editingAll = false;
      refreshToggleUI();
      toggleBtn.disabled = false;
      showToast(`${ok}건 저장${fail ? ` · 실패 ${fail}` : ''}`, ok ? 'success' : 'error');
    }
  });

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

  // 업로드
  document.getElementById('assetUpload')?.addEventListener('click', async () => {
    const { openCsvUpload } = await import('../widgets/csv-upload.js');
    const { normalizeAsset } = await import('../data/asset-normalize.js');
    openCsvUpload({
      title: '자산 업로드',
      schema: ASSET_SCHEMA,
      transform: normalizeAsset,
      onRow: async (row) => {
        const tempId = '_new_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
        editableVins.add(tempId);
        dirtyRows[tempId] = { ...row };
        gridApi.applyTransaction({ add: [{ _tempId: tempId, ...row }] });
      },
    });
  });
}

