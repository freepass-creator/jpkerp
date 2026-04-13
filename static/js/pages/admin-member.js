/**
 * pages/admin-member.js — 회원사관리
 *
 * 좌: AG Grid 목록 (클릭 → 우측 폼에 채움)
 * 우: 등록/수정 폼
 */
import { showToast } from '../core/toast.js';
import { showContextMenu } from '../core/context-menu.js';
import { saveMember, updateMember, deleteMember, watchMembers } from '../firebase/members.js';
import { MEMBER_SCHEMA, MEMBER_SECTIONS } from '../data/schemas/member.js';

let gridApi = null;
let allData = [];
let editingId = null; // null이면 신규, 값이면 수정

export async function mount() {
  initGrid();
  renderForm();
  bindButtons();
  watchMembers((data) => {
    allData = data;
    document.getElementById('memberCount').textContent = data.length;
    gridApi.setGridOption('rowData', data);
  });
}

// ── 좌측 그리드 ───────────────────────────────────────────
function initGrid() {
  const columnDefs = [
    { headerName: '#', valueGetter: 'node.rowIndex + 1', width: 45 },
    { headerName: '회원사코드', field: 'partner_code', width: 100 },
    { headerName: '회사명', field: 'company_name', width: 130 },
    { headerName: '대표자', field: 'ceo_name', width: 80 },
    { headerName: '연락처', field: 'phone', width: 110 },
    { headerName: '상태', field: 'status', width: 60 },
  ];

  const el = document.getElementById('memberGrid');
  gridApi = agGrid.createGrid(el, {
    columnDefs,
    rowData: [],
    defaultColDef: { resizable: true, sortable: true, filter: true, minWidth: 40 },
    rowHeight: 32,
    headerHeight: 32,
    animateRows: false,
    rowSelection: { mode: 'singleRow', checkboxes: false, headerCheckbox: false },
    suppressContextMenu: true,
    onRowClicked: (e) => fillForm(e.data),
  });

  // 우클릭 메뉴
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const rowEl = e.target.closest('[row-index]');
    if (!rowEl) return;
    const rowIndex = parseInt(rowEl.getAttribute('row-index'));
    const node = gridApi.getDisplayedRowAtIndex(rowIndex);
    if (!node) return;
    const d = node.data;

    showContextMenu(e, [
      { label: '수정', icon: '✏', action: () => fillForm(d) },
      { label: '삭제', icon: '🗑', danger: true, action: async () => {
        const id = d.member_id;
        if (!id) return;
        if (!confirm(`"${d.company_name || id}" 삭제하시겠습니까?`)) return;
        try {
          await deleteMember(id);
          showToast('삭제 완료', 'success');
          if (editingId === id) resetForm();
        } catch (err) { showToast(err.message, 'error'); }
      }},
    ]);
  });
}

// ── 우측 폼 ──────────────────────────────────────────────
function renderForm() {
  const host = document.getElementById('memberFormHost');
  if (!host) return;
  host.innerHTML = MEMBER_SECTIONS.map(sec => {
    const fields = MEMBER_SCHEMA.filter(f => f.section === sec);
    if (!fields.length) return '';
    return `<div class="form-section">
      <div class="form-section-title">${sec}</div>
      <div class="form-grid">${fields.map(f => fieldHtml(f)).join('')}</div>
    </div>`;
  }).join('');
}

function fieldHtml(s) {
  const req = s.required ? ' is-required' : '';
  if (s.readonly) {
    return `<div class="field"><label>${s.label}</label><input type="text" name="${s.col}" readonly placeholder="자동부여" style="background:#f3f4f6;color:#9ca3af"></div>`;
  }
  if (s.type === 'select' && s.options) {
    const opts = ['<option value="">선택</option>']
      .concat(s.options.map(o => `<option value="${o}">${o}</option>`)).join('');
    return `<div class="field${req}"><label>${s.label}</label><select name="${s.col}">${opts}</select></div>`;
  }
  if (s.type === 'textarea') {
    return `<div class="field${req}" style="grid-column:1/-1"><label>${s.label}</label><textarea name="${s.col}" rows="2"></textarea></div>`;
  }
  const type = s.type === 'date' ? 'date' : 'text';
  const inputmode = s.type === 'number' ? ' inputmode="numeric"' : '';
  return `<div class="field${req}"><label>${s.label}</label><input type="${type}" name="${s.col}"${inputmode}></div>`;
}

function readForm() {
  const host = document.getElementById('memberFormHost');
  const data = {};
  host.querySelectorAll('[name]').forEach(el => { data[el.name] = el.value.trim(); });
  return data;
}

function resetForm() {
  editingId = null;
  document.getElementById('memberFormTitle').textContent = '회원사 등록';
  const host = document.getElementById('memberFormHost');
  host.querySelectorAll('[name]').forEach(el => { el.value = ''; });
  host.querySelector('[name]')?.focus();
  gridApi.deselectAll();
}

function fillForm(data) {
  editingId = data.member_id || null;
  document.getElementById('memberFormTitle').textContent = editingId ? '회원사 수정' : '회원사 등록';
  const host = document.getElementById('memberFormHost');
  MEMBER_SCHEMA.forEach(s => {
    const el = host.querySelector(`[name="${s.col}"]`);
    if (el) el.value = data[s.col] || '';
  });
}

// ── 버튼 바인딩 ──────────────────────────────────────────
function bindButtons() {
  document.getElementById('memberNew')?.addEventListener('click', resetForm);
  document.getElementById('memberReset')?.addEventListener('click', resetForm);

  document.getElementById('memberDelete')?.addEventListener('click', async () => {
    if (!editingId) { showToast('삭제할 회원사를 선택하세요', 'info'); return; }
    const name = document.getElementById('memberFormHost').querySelector('[name="company_name"]')?.value || '';
    if (!confirm(`"${name || editingId}" 삭제하시겠습니까?`)) return;
    try {
      await deleteMember(editingId);
      showToast('삭제 완료', 'success');
      resetForm();
    } catch (e) { showToast(e.message, 'error'); }
  });

  document.getElementById('memberSave')?.addEventListener('click', async () => {
    const data = readForm();
    const missing = MEMBER_SCHEMA.filter(s => s.required && !data[s.col]);
    if (missing.length) {
      showToast('필수: ' + missing.map(s => s.label).join(', '), 'error');
      return;
    }
    try {
      if (editingId) {
        await updateMember(editingId, data);
        showToast('수정 완료', 'success');
      } else {
        await saveMember(data);
        showToast('등록 완료', 'success');
      }
      resetForm();
    } catch (e) {
      showToast(e.message, 'error');
    }
  });
}
