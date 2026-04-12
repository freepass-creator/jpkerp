import { watchLeaves, saveLeave, updateLeave } from '../firebase/leaves.js';
import { showToast } from '../core/toast.js';
const $ = s => document.querySelector(s);
const fmtDate = s => { if(!s) return ''; const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); return m?`${m[1].slice(2)}.${m[2]}.${m[3]}`:s; };
let gridApi;
const STATUS = {pending:'대기',approved:'승인',rejected:'반려'};
const STATUS_COLOR = {pending:'var(--c-warn)',approved:'var(--c-success)',rejected:'var(--c-danger)'};
export async function mount() {
  const today = new Date().toISOString().slice(0,10);
  const host = $('#leaveFormHost');
  host.innerHTML = `
    <div class="form-section"><div class="form-section-title">휴가 신청</div><div class="form-grid">
      <div class="field is-required"><label>신청자</label><input type="text" name="applicant"></div>
      <div class="field is-required"><label>유형</label><select name="leave_type"><option>연차</option><option>반차(오전)</option><option>반차(오후)</option><option>병가</option><option>경조</option><option>기타</option></select></div>
      <div class="field is-required"><label>시작일</label><input type="date" name="start_date" value="${today}"></div>
      <div class="field is-required"><label>종료일</label><input type="date" name="end_date" value="${today}"></div>
      <div class="field" style="grid-column:1/-1"><label>사유</label><textarea name="reason" rows="2"></textarea></div>
    </div></div>`;
  $('#leaveSubmit')?.addEventListener('click', async()=>{
    const data={}; host.querySelectorAll('[name]').forEach(el=>{data[el.name]=el.value.trim()});
    if(!data.applicant||!data.start_date) { showToast('신청자, 시작일은 필수','error'); return; }
    try { await saveLeave(data); showToast('휴가 신청 완료','success'); host.querySelectorAll('input:not([type=date]),textarea').forEach(el=>{el.value='';}); } catch(e){ showToast(e.message,'error'); }
  });
  gridApi = agGrid.createGrid($('#leaveGrid'), {
    columnDefs: [
      {headerName:'#',valueGetter:'node.rowIndex+1',width:45},
      {headerName:'신청자',field:'applicant',width:80},{headerName:'유형',field:'leave_type',width:80},
      {headerName:'시작일',field:'start_date',width:85,valueFormatter:p=>fmtDate(p.value)},
      {headerName:'종료일',field:'end_date',width:85,valueFormatter:p=>fmtDate(p.value)},
      {headerName:'사유',field:'reason',width:150},
      {headerName:'상태',field:'status',width:60,cellRenderer:p=>`<span style="color:${STATUS_COLOR[p.value]||''};font-weight:500">${STATUS[p.value]||p.value||'-'}</span>`},
    ],
    rowData:[],defaultColDef:{resizable:true,sortable:true,filter:true,editable:false,minWidth:50},
    rowHeight:28,headerHeight:28,animateRows:false,suppressContextMenu:true,
    onGridReady:p=>p.api.autoSizeAllColumns(),
  });
  watchLeaves(items=>{gridApi.setGridOption('rowData',items); $('#leaveInfo').textContent=`${items.length}건`;});
}
