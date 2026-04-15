/**
 * pages/contract.js — 계약관리 (AG Grid)
 */
import { showToast } from '../core/toast.js';
import { showContextMenu } from '../core/context-menu.js';
import { openDetail, schemaToSections } from '../core/detail-panel.js';
import { buildSchemaColumns, readSavedColState, applyColState, persistColState, baseGridOptions } from '../core/grid-utils.js';
import { watchContracts, saveContract, updateContract } from '../firebase/contracts.js';
import { CONTRACT_SCHEMA, CONTRACT_SECTIONS } from '../data/schemas/contract.js';

let gridApi = null;
let allData = [];
let dirtyRows = {};
let editableKeys = new Set();
const KEY = 'contract_code';
const COL_STATE_KEY = 'jpk.grid.contract';

// 종료일 계산 + 만기 후 일수
function normalizeDate(s) {
  if (!s) return '';
  let v = String(s).trim().replace(/[./]/g, '-');
  const m = v.match(/^(\d{2})-(\d{1,2})-(\d{1,2})$/);
  if (m) v = `${Number(m[1]) < 50 ? 2000 + Number(m[1]) : 1900 + Number(m[1])}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  return v;
}
function computeEnd(c) {
  if (c.end_date) return normalizeDate(c.end_date);
  const s = normalizeDate(c.start_date);
  if (!s || !c.rent_months) return '';
  const d = new Date(s);
  if (isNaN(d)) return '';
  d.setMonth(d.getMonth() + Number(c.rent_months));
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function mount() {
  initGrid();
  bindButtons();
  restoreColumnState();
  watchContracts((data) => {
    const today = new Date().toISOString().slice(0, 10);
    // 만기 후 미연장 정보 부여
    allData = data.map(c => {
      const end = computeEnd(c);
      const expired = end && end < today && c.contract_status !== '계약해지';
      const days = expired ? Math.floor((Date.now() - new Date(end)) / 86400000) : 0;
      return { ...c, _expiredDays: expired ? days : 0 };
    });
    const expiredCount = allData.filter(r => r._expiredDays > 0).length;
    const cntEl = document.getElementById('contractCount');
    if (cntEl) cntEl.textContent = data.length + (expiredCount ? ` · 만기 ${expiredCount}건` : '');
    gridApi.setGridOption('rowData', allData);
  });
}

function initGrid() {
  const savedState = readSavedColState(COL_STATE_KEY);
  const baseCols = buildSchemaColumns(CONTRACT_SCHEMA, {
    savedState,
    editableFn: (params) => editableKeys.has(params.data[KEY] || params.data._tempId),
  });
  // "만기경과" 컬럼 추가 (만기 후 일수 — 0이면 빈칸)
  const expiryCol = {
    headerName: '만기경과', field: '_expiredDays', width: 100,
    cellStyle: p => p.value > 0
      ? { color: 'var(--c-danger)', fontWeight: 700, textAlign: 'right' }
      : { color: 'var(--c-text-muted)', textAlign: 'right' },
    valueFormatter: p => p.value > 0 ? `${p.value}일 경과` : '',
  };
  // # 다음 + 계약상태 다음에 만기경과 삽입 (스키마 첫 4개 = #/계약코드/회원사코드/계약상태)
  const columnDefs = [...baseCols.slice(0, 4), expiryCol, ...baseCols.slice(4)];

  const gridOptions = baseGridOptions({
    columnDefs,
    keyField: KEY,
    dirtyRows,
    onColStateChange: saveColumnState,
    colStateKey: COL_STATE_KEY,
  });
  // 만기 후 미연장 행 → 연한 빨간 배경
  gridOptions.getRowStyle = (p) => p.data._expiredDays > 0 ? { background: '#fff5f5' } : null;

  const el = document.getElementById('contractGrid');
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

  // 행 더블클릭 → 상세
  el.addEventListener('dblclick', (e) => {
    const rowEl = e.target.closest('[row-index]');
    if (!rowEl) return;
    const node = gridApi.getDisplayedRowAtIndex(parseInt(rowEl.getAttribute('row-index')));
    if (!node || node.data._tempId) return;
    const d = node.data;
    openDetail({
      title: `${d.contractor_name || d.contract_code || ''}`,
      subtitle: `${d.car_number || ''} · ${d.start_date || ''}`,
      sections: schemaToSections(CONTRACT_SCHEMA, d, CONTRACT_SECTIONS),
    });
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

function restoreColumnState() { applyColState(gridApi, COL_STATE_KEY); }
function saveColumnState() { persistColState(gridApi, COL_STATE_KEY); }

function bindButtons() {
  document.getElementById('contractSearch')?.addEventListener('input', (e) => {
    gridApi.setGridOption('quickFilterText', e.target.value);
  });
}

const fmtD = s => { if(!s) return '-'; const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); return m?`${m[1].slice(2)}.${m[2]}.${m[3]}`:s; };
const fmtN = v => v ? Number(v).toLocaleString('ko-KR') : '-';
const row = (l,v) => v && v !== '-' ? `<tr><td style="padding:6px 12px 6px 0;color:var(--c-text-muted);width:120px">${l}</td><td style="padding:6px 0;font-weight:500">${v}</td></tr>` : '';

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
