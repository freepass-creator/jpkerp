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
    ...CONTRACT_SCHEMA.map(s => ({
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
      { label: '상세보기', icon: '📄', action: () => showContractDetail(node.data) },
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

const fmtD = s => { if(!s) return '-'; const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); return m?`${m[1].slice(2)}.${m[2]}.${m[3]}`:s; };
const fmtN = v => v ? Number(v).toLocaleString('ko-KR') : '-';
const row = (l,v) => v && v !== '-' ? `<tr><td style="padding:6px 12px 6px 0;color:var(--c-text-muted);width:120px">${l}</td><td style="padding:6px 0;font-weight:500">${v}</td></tr>` : '';
function normalizeDate(s){if(!s)return'';let v=String(s).trim().replace(/[./]/g,'-');const m=v.match(/^(\d{2})-(\d{1,2})-(\d{1,2})$/);if(m)v=`${Number(m[1])<50?2000+Number(m[1]):1900+Number(m[1])}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;return v;}

function showContractDetail(d) {
  const grid = document.getElementById('contractGrid');
  const detail = document.getElementById('contractDetailView');
  grid.style.display = 'none'; detail.hidden = false; detail.style.display = 'block';
  const endDate = d.end_date || (() => { const s=normalizeDate(d.start_date); if(!s||!d.rent_months) return'-'; const dt=new Date(s); dt.setMonth(dt.getMonth()+Number(d.rent_months)); dt.setDate(dt.getDate()-1); return dt.toISOString().slice(0,10); })();
  detail.innerHTML = `<div style="max-width:800px;margin:0 auto;padding:24px">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
      <button class="btn" id="contractBack">← 목록</button>
      <span style="font-size:var(--font-size-lg);font-weight:700">📋 ${d.contract_code||''} ${d.contractor_name||''}</span>
    </div>
    <div style="background:var(--c-bg);border:1px solid var(--c-border);border-radius:var(--r-md);padding:20px">
      <div style="font-weight:600;margin-bottom:8px">계약 정보</div>
      <table style="width:100%;border-collapse:collapse;font-size:var(--font-size)">
        ${row('계약코드',d.contract_code)}${row('차량번호',d.car_number)}${row('모델',d.car_model)}
        ${row('계약자',d.contractor_name)}${row('등록번호',d.contractor_reg_no)}${row('연락처',d.contractor_phone)}
        ${row('구분',d.contractor_type)}${row('주소',d.contractor_address)}
      </table>
      ${d.biz_no?`<div style="font-weight:600;margin:16px 0 8px">사업자</div><table style="width:100%;border-collapse:collapse;font-size:var(--font-size)">${row('사업자번호',d.biz_no)}${row('상호',d.biz_name)}${row('대표자',d.ceo_name)}</table>`:''}
      ${d.driver_name?`<div style="font-weight:600;margin:16px 0 8px">실운전자</div><table style="width:100%;border-collapse:collapse;font-size:var(--font-size)">${row('이름',d.driver_name)}${row('연락처',d.driver_phone)}</table>`:''}
      <div style="font-weight:600;margin:16px 0 8px">조건</div>
      <table style="width:100%;border-collapse:collapse;font-size:var(--font-size)">
        ${row('시작일',fmtD(normalizeDate(d.start_date)))}${row('종료일',fmtD(endDate))}${row('기간',d.rent_months?d.rent_months+'개월':'-')}
        ${row('월대여료',fmtN(d.rent_amount)+'원')}${row('보증금',fmtN(d.deposit_amount)+'원')}${row('결제일','매월 '+(d.auto_debit_day||'-')+'일')}
        ${row('상태',d.contract_status)}
      </table>
      ${d.note?`<div style="margin-top:12px;padding:10px;background:var(--c-bg-sub);border-radius:var(--r-md);font-size:var(--font-size-sm)">${d.note}</div>`:''}
    </div></div>`;
  document.getElementById('contractBack')?.addEventListener('click',()=>{detail.style.display='none';detail.hidden=true;grid.style.display='';});
}
