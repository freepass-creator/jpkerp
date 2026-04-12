/**
 * core/input-page.js — 공통 등록 페이지
 *
 * 좌(3): 입력 폼 (스키마 기반 섹션별)
 * 우(7): 검증/반영 AG Grid
 *
 * mount({
 *   schema, sections, keyField, label,
 *   saveFn,     // async (row) => saved
 *   validate,   // (row, context) => [{col, msg}] — 에러 배열
 *   context,    // validate 에 넘길 참조 데이터 (중복 체크 등)
 *   csvSchema,  // CSV 업로드용 (기본: schema)
 * })
 */
import { showToast } from './toast.js';
import { openCsvUpload } from '../widgets/csv-upload.js';

let _state = null;

export function mountInputPage(opts) {
  _state = { ...opts, stage: [], stageSeq: 0, gridApi: null };
  renderForm();
  renderGrid();
  bindButtons();
}

function renderForm() {
  const host = document.getElementById('inputFormHost');
  if (!host) return;
  const { schema, sections } = _state;
  host.innerHTML = sections.map(sec => {
    const fields = schema.filter(f => f.section === sec);
    if (!fields.length) return '';
    return `<div class="form-section">
      <div class="form-section-title">${sec}</div>
      <div class="form-grid">${fields.map(f => fieldHtml(f)).join('')}</div>
    </div>`;
  }).join('');
}

function fieldHtml(s) {
  const req = s.required ? ' is-required' : '';
  if (s.type === 'select' && s.options) {
    const opts = ['<option value="">선택</option>'].concat(s.options.map(o => `<option value="${o}">${o}</option>`)).join('');
    return `<div class="field${req}"><label>${s.label}</label><select name="${s.col}">${opts}</select></div>`;
  }
  if (s.type === 'textarea') {
    return `<div class="field${req}" style="grid-column:1/-1"><label>${s.label}</label><textarea name="${s.col}"></textarea></div>`;
  }
  const type = s.type === 'date' ? 'date' : 'text';
  const inputmode = s.type === 'number' ? ' inputmode="numeric"' : '';
  return `<div class="field${req}"><label>${s.label}</label><input type="${type}" name="${s.col}"${inputmode}></div>`;
}

function readForm() {
  const host = document.getElementById('inputFormHost');
  const data = {};
  host.querySelectorAll('[name]').forEach(el => { data[el.name] = el.value.trim(); });
  return data;
}

function resetForm() {
  const host = document.getElementById('inputFormHost');
  host.querySelectorAll('[name]').forEach(el => { el.value = ''; });
  host.querySelector('[name]')?.focus();
}

function renderGrid() {
  const { schema, keyField } = _state;
  const cols = [
    { headerName: '#', valueGetter: 'node.rowIndex + 1', width: 50 },
    { headerName: '상태', field: '_status', width: 70,
      cellRenderer: (p) => {
        if (p.value === 'committed') return '<span style="color:var(--c-success);font-weight:600">반영</span>';
        if (p.value === 'error') return '<span style="color:var(--c-danger);font-weight:600">오류</span>';
        return '<span style="color:var(--c-text-muted)">대기</span>';
      } },
    { headerName: '메시지', field: '_message', width: 220,
      cellStyle: (p) => p.data._status === 'error' ? { color: 'var(--c-danger)' } : {} },
    ...schema.map(s => ({
      field: s.col,
      headerName: s.label + (s.required ? ' *' : ''),
      width: 110,
    })),
    { headerName: '', width: 60, cellRenderer: () => '<button class="btn btn-icon stage-del" title="제거">✕</button>' },
  ];

  _state.gridApi = agGrid.createGrid(document.getElementById('stageGrid'), {
    columnDefs: cols,
    rowData: [],
    defaultColDef: { resizable: true, sortable: false, editable: false, minWidth: 60 },
    rowHeight: 28,
    headerHeight: 28,
    animateRows: false,
    suppressContextMenu: true,
    onCellClicked: (e) => {
      if (e.event?.target?.closest('.stage-del')) {
        removeStage(e.data._id);
      }
    },
  });
}

function refreshGrid() {
  if (!_state.gridApi) return;
  _state.gridApi.setGridOption('rowData', _state.stage);
  const pending = _state.stage.filter(s => s._status !== 'committed').length;
  const errors = _state.stage.filter(s => s._status === 'error').length;
  const cnt = document.getElementById('stageCount');
  if (cnt) cnt.textContent = `임시 ${pending}건${errors ? ` · 오류 ${errors}` : ''}`;
}

function stageCurrent() {
  const data = readForm();
  addToStage(data);
  resetForm();
}

function addToStage(row) {
  const { schema, validate, context } = _state;
  // 필수 체크
  const missing = schema.filter(s => s.required && !row[s.col]).map(s => s.label);
  const entry = { ...row, _id: ++_state.stageSeq, _status: 'pending', _message: '' };
  if (missing.length) {
    entry._status = 'error';
    entry._message = `필수: ${missing.join(', ')}`;
  } else if (validate) {
    const errs = validate(row, context && context());
    if (errs?.length) {
      entry._status = 'error';
      entry._message = errs.map(e => `${e.col ? '[' + e.col + '] ' : ''}${e.msg}`).join(' / ');
    }
  }
  _state.stage.unshift(entry);
  refreshGrid();
  showToast(entry._status === 'error' ? '검증 오류' : '임시 등록', entry._status === 'error' ? 'error' : 'success');
}

function removeStage(id) {
  _state.stage = _state.stage.filter(s => s._id !== id);
  refreshGrid();
}

async function commitAll() {
  const { stage, saveFn, label } = _state;
  const targets = stage.filter(s => s._status === 'pending');
  if (!targets.length) { showToast('반영할 항목이 없습니다', 'info'); return; }
  if (!confirm(`${targets.length}건을 반영합니다. 진행할까요?`)) return;
  let ok = 0, fail = 0;
  for (const row of targets) {
    try {
      const { _id, _status, _message, ...payload } = row;
      await saveFn(payload);
      row._status = 'committed';
      row._message = '';
      ok++;
    } catch (e) {
      row._status = 'error';
      row._message = e.message || '저장 실패';
      fail++;
    }
  }
  refreshGrid();
  showToast(`${label || '항목'} 반영 ${ok}건${fail ? ` · 실패 ${fail}` : ''}`, ok ? 'success' : 'error');
  // 반영 완료된 것은 잠시 후 제거
  setTimeout(() => {
    _state.stage = _state.stage.filter(s => s._status !== 'committed');
    refreshGrid();
  }, 1500);
}

function bindButtons() {
  document.getElementById('inputStage')?.addEventListener('click', stageCurrent);
  document.getElementById('inputReset')?.addEventListener('click', resetForm);
  document.getElementById('stageClear')?.addEventListener('click', () => {
    if (!_state.stage.length) return;
    if (!confirm('임시 등록을 모두 비웁니다. 진행할까요?')) return;
    _state.stage = [];
    refreshGrid();
  });
  document.getElementById('stageCommitAll')?.addEventListener('click', commitAll);
  document.getElementById('inputCsv')?.addEventListener('click', () => {
    const { schema, label, csvSchema } = _state;
    openCsvUpload({
      title: `${label || '일괄'} 업로드`,
      schema: csvSchema || schema,
      onRow: async (row) => {
        addToStage(row);
      },
    });
  });
}
