import { watchContracts } from '../firebase/contracts.js';
const $ = s => document.querySelector(s);
const fmtDate = s => { if(!s) return ''; const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); return m?`${m[1].slice(2)}.${m[2]}.${m[3]}`:s; };
function normalizeDate(s){if(!s)return'';let v=String(s).trim().replace(/[./]/g,'-');const m=v.match(/^(\d{2})-(\d{1,2})-(\d{1,2})$/);if(m)v=`${Number(m[1])<50?2000+Number(m[1]):1900+Number(m[1])}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;return v;}
function computeEnd(c){if(c.end_date)return normalizeDate(c.end_date);const s=normalizeDate(c.start_date);if(!s||!c.rent_months)return'';const d=new Date(s);d.setMonth(d.getMonth()+Number(c.rent_months));d.setDate(d.getDate()-1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
let gridApi;
export async function mount() {
  gridApi = agGrid.createGrid($('#expiringGrid'), {
    columnDefs: [
      {headerName:'#',valueGetter:'node.rowIndex+1',width:45},
      {headerName:'계약자',field:'contractor_name',width:80},{headerName:'차량',field:'car_number',width:90},
      {headerName:'차종',field:'car_model',width:90},{headerName:'시작일',field:'start_date_fmt',width:85},
      {headerName:'종료일',field:'end_date_fmt',width:85},
      {headerName:'D-day',field:'d_day',width:65,type:'numericColumn',cellStyle:p=>({color:p.value<=7?'var(--c-danger)':p.value<=30?'var(--c-warn)':'var(--c-text-sub)',fontWeight:600}),valueFormatter:p=>`D-${p.value}`},
    ],
    rowData:[],defaultColDef:{resizable:true,sortable:true,filter:true,editable:false,minWidth:50},
    rowHeight:28,headerHeight:28,animateRows:false,suppressContextMenu:true,
    onGridReady:p=>p.api.autoSizeAllColumns(),
  });
  const today = new Date().toISOString().slice(0,10);
  const todayDate = new Date(today);
  const m3 = new Date(todayDate); m3.setMonth(m3.getMonth()+3);
  const m3s = m3.toISOString().slice(0,10);
  watchContracts(items=>{
    const expiring = items.map(c=>{
      const end=computeEnd(c); if(!end||end<today||end>m3s) return null;
      const dDay=Math.floor((new Date(end)-todayDate)/86400000);
      return {...c,end_date_fmt:fmtDate(end),start_date_fmt:fmtDate(normalizeDate(c.start_date)),d_day:dDay};
    }).filter(Boolean).sort((a,b)=>a.d_day-b.d_day);
    gridApi.setGridOption('rowData',expiring);
  });
}
