/**
 * pages/input-task.js — 업무생성
 *
 * 좌: 업무 작성 폼
 * 우: 생성된 업무 AG Grid
 */
import { saveTask, watchTasks } from '../firebase/tasks.js';
import { showToast } from '../core/toast.js';

const $ = (s) => document.querySelector(s);
const fmtDate = s => { if(!s) return ''; const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); return m?`${m[1].slice(2)}.${m[2]}.${m[3]}`:s; };

let gridApi;

const STATUS = { open: '진행중', done: '완료', hold: '보류', canceled: '취소' };
const STATUS_COLOR = { open: 'var(--c-primary)', done: 'var(--c-success)', hold: 'var(--c-warn)', canceled: 'var(--c-text-muted)' };
const PRIORITY_COLOR = { 긴급: 'var(--c-danger)', 높음: 'var(--c-warn)', 보통: 'var(--c-text-sub)', 낮음: 'var(--c-text-muted)' };

export async function mount() {
  const today = new Date().toISOString().slice(0, 10);
  const host = $('#taskFormHost');
  host.innerHTML = `
    <div class="form-section">
      <div class="form-section-title">업무 내용</div>
      <div class="form-grid">
        <div class="field is-required" style="grid-column:1/-1"><label>제목</label><input type="text" name="title" placeholder="업무 제목"></div>
        <div class="field" style="grid-column:1/-1"><label>설명</label><textarea name="description" rows="3" placeholder="업무 상세 내용"></textarea></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">배정</div>
      <div class="form-grid">
        <div class="field"><label>담당자</label><input type="text" name="assignee" placeholder="담당 직원"></div>
        <div class="field"><label>참여자</label><input type="text" name="participants" placeholder="쉼표 구분"></div>
        <div class="field"><label>마감일</label><input type="date" name="due_date"></div>
        <div class="field"><label>우선순위</label><select name="priority"><option>보통</option><option>낮음</option><option>높음</option><option>긴급</option></select></div>
        <div class="field"><label>분류</label><select name="category"><option>일반</option><option>출고</option><option>반납</option><option>정비</option><option>수금</option><option>사고</option><option>기타</option></select></div>
      </div>
    </div>
  `;

  // Enter → 생성
  host.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.target.matches('textarea')) { e.preventDefault(); submitTask(); }
  });

  $('#taskSubmit')?.addEventListener('click', submitTask);
  $('#taskReset')?.addEventListener('click', () => {
    host.querySelectorAll('input:not([type=date]),textarea').forEach(el => { el.value = ''; });
  });

  gridApi = agGrid.createGrid($('#taskGrid'), {
  $('#taskGrid')._agApi = gridApi;
    columnDefs: [
      { headerName: '#', valueGetter: 'node.rowIndex+1', width: 45 },
      { headerName: '우선', field: 'priority', width: 55, cellStyle: p => ({ color: PRIORITY_COLOR[p.value] || '', fontWeight: 500 }) },
      { headerName: '제목', field: 'title', width: 200 },
      { headerName: '담당자', field: 'assignee', width: 80 },
      { headerName: '마감', field: 'due_date', width: 80, valueFormatter: p => fmtDate(p.value) },
      { headerName: '분류', field: 'category', width: 65 },
      { headerName: '상태', field: 'status', width: 60,
        cellRenderer: p => `<span style="color:${STATUS_COLOR[p.value] || ''};font-weight:500">${STATUS[p.value] || p.value || '-'}</span>` },
    ],
    rowData: [],
    defaultColDef: { resizable: true, sortable: true, filter: true, suppressHeaderMenuButton: true, editable: false, minWidth: 40 },
    rowHeight: 28, headerHeight: 28, animateRows: false, suppressContextMenu: true,
    onGridReady: p => { p.api.autoSizeAllColumns(); },
  });

  watchTasks((items) => {
    gridApi.setGridOption('rowData', items);
    $('#taskCount').textContent = `${items.length}건`;
  });
}

async function submitTask() {
  const host = $('#taskFormHost');
  const data = {};
  host.querySelectorAll('[name]').forEach(el => { data[el.name] = el.value.trim(); });
  if (!data.title) { showToast('제목을 입력하세요', 'error'); return; }
  try {
    await saveTask(data);
    showToast('업무 생성 완료', 'success');
    host.querySelectorAll('input:not([type=date]),textarea').forEach(el => { el.value = ''; });
    host.querySelector('[name="title"]')?.focus();
  } catch (e) { showToast(e.message, 'error'); }
}
