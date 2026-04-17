/**
 * pages/dev-car-master.js — 차종 마스터 관리
 *
 * 좌: 차종 추가 폼
 * 우: 전체 목록 (하드코드 + Firebase 추가분)
 *
 * Firebase 추가분은 car_models_custom 컬렉션에 저장
 * car-models.js에서 자동 병합
 */
import { showToast } from '../core/toast.js';
import { CAR_MODELS, getMakers, getModels } from '../data/car-models.js';
import { ref, get, set, onValue } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js';
import { db } from '../firebase/config.js';

const $ = s => document.querySelector(s);
let gridApi = null;
let customModels = [];
let editingKey = null; // 수정 중인 커스텀 키

export async function mount() {
  initGrid();
  bindForm();
  loadCustomModels();
  populateDataLists();
}

function initGrid() {
  gridApi = agGrid.createGrid($('#cmGrid'), {
    columnDefs: [
      { headerName: '#', valueGetter: 'node.rowIndex + 1', width: 40 },
      { headerName: '출처', field: '_source', width: 55,
        cellStyle: p => p.value === '추가' ? { color: 'var(--c-primary)', fontWeight: 600 } : { color: 'var(--c-text-muted)' } },
      { headerName: '제조사', field: 'maker', width: 80 },
      { headerName: '모델', field: 'model', width: 100 },
      { headerName: '세부모델', field: 'sub', width: 220 },
      { headerName: '코드', field: 'code', width: 60 },
      { headerName: '시작', field: 'year_start', width: 50 },
      { headerName: '종료', field: 'year_end', width: 50 },
      { headerName: '차종', field: 'category', width: 120 },
      { headerName: '', width: 50, cellRenderer: p => p.data._source === '추가' ? '<button class="btn btn-icon" style="color:var(--c-danger)" title="삭제">✕</button>' : '' },
    ],
    rowData: [],
    defaultColDef: { resizable: true, sortable: true, filter: true, minWidth: 40 },
    rowHeight: 28,
    headerHeight: 28,
    animateRows: false,
    suppressContextMenu: true,
    onRowClicked: e => {
      if (e.data) fillForm(e.data);
    },
    onCellClicked: e => {
      if (e.event?.target?.closest('button') && e.data._source === '추가') {
        deleteCustom(e.data._key);
      }
    },
  });

  $('#cmSearch')?.addEventListener('input', e => {
    gridApi.setGridOption('quickFilterText', e.target.value);
  });
}

function refreshGrid() {
  const base = CAR_MODELS.map(m => ({ ...m, _source: '기본' }));
  const custom = customModels.map(m => ({ ...m, _source: '추가' }));
  const all = [...custom, ...base];
  gridApi.setGridOption('rowData', all);
  $('#cmCount').textContent = `${all.length}건 (추가 ${custom.length})`;
}

function populateDataLists() {
  const makers = getMakers();
  $('#cmMakerList').innerHTML = makers.map(m => `<option value="${m}">`).join('');

  const categories = [...new Set(CAR_MODELS.map(m => m.category).filter(Boolean))];
  $('#cmCatList').innerHTML = categories.map(c => `<option value="${c}">`).join('');

  // 제조사 변경 → 모델 datalist 갱신
  $('[name="maker"]')?.addEventListener('input', e => {
    const models = getModels(e.target.value);
    $('#cmModelList').innerHTML = models.map(m => `<option value="${m}">`).join('');
  });
}

function fillForm(data) {
  $('[name="maker"]').value = data.maker || '';
  $('[name="model"]').value = data.model || '';
  $('[name="sub"]').value = data.sub || '';
  $('[name="code"]').value = data.code || '';
  $('[name="year_start"]').value = data.year_start || '';
  $('[name="year_end"]').value = data.year_end || '';
  $('[name="category"]').value = data.category || '';
  // 모델 datalist 갱신
  const models = getModels(data.maker);
  $('#cmModelList').innerHTML = models.map(m => `<option value="${m}">`).join('');
  // 추가분이면 수정 모드
  if (data._source === '추가' && data._key) {
    editingKey = data._key;
    const btn = $('#cmSave');
    if (btn) btn.textContent = '수정';
  } else {
    editingKey = null;
    const btn = $('#cmSave');
    if (btn) btn.textContent = '등록';
  }
}

function readForm() {
  return {
    maker: $('[name="maker"]').value.trim(),
    model: $('[name="model"]').value.trim(),
    sub: $('[name="sub"]').value.trim(),
    code: $('[name="code"]').value.trim(),
    year_start: $('[name="year_start"]').value.trim(),
    year_end: $('[name="year_end"]').value.trim() || '현재',
    category: $('[name="category"]').value.trim(),
  };
}

function resetForm() {
  ['maker','model','sub','code','year_start','year_end','category'].forEach(n => {
    const el = $(`[name="${n}"]`);
    if (el) el.value = '';
  });
  editingKey = null;
  const btn = $('#cmSave');
  if (btn) btn.textContent = '등록';
  $('[name="maker"]')?.focus();
}

function bindForm() {
  $('#cmReset')?.addEventListener('click', resetForm);
  $('#cmSave')?.addEventListener('click', saveCustom);
}

// ── Firebase 커스텀 차종 ────────────────────────────────
const CUSTOM_PATH = 'car_models_custom';

function loadCustomModels() {
  onValue(ref(db, CUSTOM_PATH), snap => {
    if (!snap.exists()) { customModels = []; refreshGrid(); return; }
    customModels = Object.entries(snap.val()).map(([k, v]) => ({ ...v, _key: k }));
    refreshGrid();
    // CAR_MODELS에 동적 추가 (중복 방지)
    for (const cm of customModels) {
      const exists = CAR_MODELS.some(m => m.maker === cm.maker && m.model === cm.model && m.sub === cm.sub);
      if (!exists) CAR_MODELS.push(cm);
    }
  });
}

async function saveCustom() {
  const data = readForm();
  if (!data.maker || !data.model || !data.sub || !data.year_start) {
    showToast('제조사, 모델, 세부모델, 생산시작은 필수입니다', 'error');
    return;
  }

  if (editingKey) {
    // 수정 모드
    try {
      await set(ref(db, `${CUSTOM_PATH}/${editingKey}`), { ...data, updated_at: Date.now() });
      showToast(`${data.maker} ${data.sub} 수정 완료`, 'success');
      resetForm();
    } catch (e) { showToast(e.message, 'error'); }
  } else {
    // 신규 등록
    const exists = CAR_MODELS.some(m => m.maker === data.maker && m.sub === data.sub);
    if (exists) { showToast('이미 등록된 세부모델입니다', 'error'); return; }
    const key = `${data.maker}_${data.model}_${data.code || data.year_start}_${Date.now()}`.replace(/[\s./]/g, '_');
    try {
      await set(ref(db, `${CUSTOM_PATH}/${key}`), { ...data, created_at: Date.now() });
      showToast(`${data.maker} ${data.model} ${data.sub} 추가 완료`, 'success');
      resetForm();
    } catch (e) { showToast(e.message, 'error'); }
  }
}

async function deleteCustom(key) {
  if (!key) return;
  if (!confirm('삭제하시겠습니까?')) return;
  try {
    await set(ref(db, `${CUSTOM_PATH}/${key}`), null);
    showToast('삭제 완료', 'success');
  } catch (e) { showToast(e.message, 'error'); }
}
