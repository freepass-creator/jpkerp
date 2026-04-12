/**
 * pages/tasks.js — 업무관리 (조회)
 */
import { watchTasks, updateTask } from '../firebase/tasks.js';
import { showToast } from '../core/toast.js';
import { showContextMenu } from '../core/context-menu.js';

const $ = s => document.querySelector(s);
const fmtDate = s => { if(!s) return ''; const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); return m?`${m[1].slice(2)}.${m[2]}.${m[3]}`:s; };
const timeAgo = ts => { if(!ts) return ''; const d=Math.floor((Date.now()-ts)/1000); if(d<60) return '방금'; if(d<3600) return `${Math.floor(d/60)}분 전`; if(d<86400) return `${Math.floor(d/3600)}시간 전`; return fmtDate(new Date(ts).toISOString().slice(0,10)); };

const STATUS = {open:'진행중',done:'완료',hold:'보류',canceled:'취소'};
const STATUS_COLOR = {open:'var(--c-primary)',done:'var(--c-success)',hold:'var(--c-warn)',canceled:'var(--c-text-muted)'};
const PRIORITY_COLOR = {긴급:'var(--c-danger)',높음:'var(--c-warn)',보통:'var(--c-text-sub)',낮음:'var(--c-text-muted)'};

let gridApi;

export async function mount() {
  gridApi = agGrid.createGrid($('#tasksGrid'), {
    columnDefs: [
      {headerName:'#',valueGetter:'node.rowIndex+1',width:45},
      {headerName:'우선',field:'priority',width:55,cellStyle:p=>({color:PRIORITY_COLOR[p.value]||'',fontWeight:500})},
      {headerName:'제목',field:'title',width:220},
      {headerName:'설명',field:'description',width:180},
      {headerName:'담당자',field:'assignee',width:80},
      {headerName:'참여자',field:'participants',width:100},
      {headerName:'마감',field:'due_date',width:80,valueFormatter:p=>fmtDate(p.value)},
      {headerName:'분류',field:'category',width:65},
      {headerName:'상태',field:'status',width:60,cellRenderer:p=>`<span style="color:${STATUS_COLOR[p.value]||''};font-weight:500">${STATUS[p.value]||p.value||'-'}</span>`},
      {headerName:'생성',field:'created_at',width:80,valueFormatter:p=>timeAgo(p.value)},
    ],
    rowData:[],
    defaultColDef:{resizable:true,sortable:true,filter:true,editable:false,minWidth:40},
    rowHeight:28,headerHeight:28,animateRows:false,
    suppressContextMenu:true,
    onGridReady:p=>p.api.autoSizeAllColumns(),
  });

  const el = $('#tasksGrid');
  el.addEventListener('contextmenu', e => {
    e.preventDefault();
    const rowEl = e.target.closest('[row-index]');
    if (!rowEl) return;
    const node = gridApi.getDisplayedRowAtIndex(parseInt(rowEl.getAttribute('row-index')));
    if (!node) return;
    const d = node.data;
    showContextMenu(e, [
      {label:'상세보기',icon:'📄',action:()=>showTaskDetail(d)},
      'sep',
      {label:'진행중',icon:'🔵',action:()=>changeStatus(d.task_id,'open')},
      {label:'완료',icon:'✅',action:()=>changeStatus(d.task_id,'done')},
      {label:'보류',icon:'⏸',action:()=>changeStatus(d.task_id,'hold')},
      {label:'취소',icon:'❌',action:()=>changeStatus(d.task_id,'canceled')},
    ]);
  });

  watchTasks(items=>gridApi.setGridOption('rowData',items));
}

async function changeStatus(id, status) {
  try { await updateTask(id,{status}); showToast(`상태 변경: ${STATUS[status]}`,'success'); } catch(e){ showToast(e.message,'error'); }
}

function showTaskDetail(d) {
  const grid=$('#tasksGrid'),detail=$('#tasksDetailView');
  grid.style.display='none';detail.hidden=false;detail.style.display='block';
  const st=STATUS_COLOR[d.status]||'';
  const row=(l,v)=>v?`<tr><td style="padding:6px 12px 6px 0;color:var(--c-text-muted);width:100px">${l}</td><td style="padding:6px 0;font-weight:500">${v}</td></tr>`:'';
  detail.innerHTML=`<div style="max-width:800px;margin:0 auto;padding:24px">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
      <button class="btn" id="taskBack">← 목록</button>
      <span style="font-size:var(--font-size-lg);font-weight:700">${d.title||''}</span>
      <span style="color:${st};font-weight:500;font-size:var(--font-size-sm)">${STATUS[d.status]||''}</span>
    </div>
    <div style="background:var(--c-bg);border:1px solid var(--c-border);border-radius:var(--r-md);padding:20px">
      <table style="width:100%;border-collapse:collapse;font-size:var(--font-size)">
        ${row('우선순위',`<span style="color:${PRIORITY_COLOR[d.priority]||''}">${d.priority||'-'}</span>`)}
        ${row('담당자',d.assignee)}${row('참여자',d.participants)}
        ${row('마감일',fmtDate(d.due_date))}${row('분류',d.category)}
        ${row('생성',timeAgo(d.created_at))}
      </table>
      ${d.description?`<div style="margin-top:12px;padding:10px;background:var(--c-bg-sub);border-radius:var(--r-md);white-space:pre-wrap;font-size:var(--font-size-sm)">${d.description}</div>`:''}
    </div></div>`;
  document.getElementById('taskBack')?.addEventListener('click',()=>{detail.style.display='none';detail.hidden=true;grid.style.display='';});
}
