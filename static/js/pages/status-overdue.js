import { watchBillings, computeTotalDue } from '../firebase/billings.js';
import { watchContracts } from '../firebase/contracts.js';
const $ = s => document.querySelector(s);
const fmt = v => Number(v||0).toLocaleString('ko-KR');
const fmtDate = s => { if(!s) return ''; const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); return m?`${m[1].slice(2)}.${m[2]}.${m[3]}`:s; };
let gridApi, contracts=[], billings=[];
function refresh() {
  const today = new Date().toISOString().slice(0,10);
  const overdue = billings.filter(b=>{const d=computeTotalDue(b),p=Number(b.paid_total)||0; return p<d&&b.due_date&&b.due_date<today;}).map(b=>{
    const c=contracts.find(x=>x.contract_code===b.contract_code)||{};
    const due=computeTotalDue(b),paid=Number(b.paid_total)||0;
    return {...b,contractor_name:c.contractor_name||'-',car_number:c.car_number||b.car_number||'-',unpaid:due-paid,overdue_days:Math.floor((new Date(today)-new Date(b.due_date))/86400000)};
  }).sort((a,b)=>b.overdue_days-a.overdue_days);
  gridApi.setGridOption('rowData',overdue);
}
export async function mount() {
  gridApi = agGrid.createGrid($('#overdueGrid'), {
    columnDefs: [
      {headerName:'#',valueGetter:'node.rowIndex+1',width:45},
      {headerName:'계약자',field:'contractor_name',width:80},{headerName:'차량',field:'car_number',width:90},
      {headerName:'회차',field:'seq',width:55},{headerName:'청구일',field:'due_date',width:85,valueFormatter:p=>fmtDate(p.value)},
      {headerName:'미수',field:'unpaid',width:100,type:'numericColumn',valueFormatter:p=>fmt(p.value),cellStyle:{color:'var(--c-danger)',fontWeight:500}},
      {headerName:'연체일',field:'overdue_days',width:65,type:'numericColumn',cellStyle:p=>({color:p.value>=30?'#991b1b':p.value>=7?'var(--c-danger)':'var(--c-warn)',fontWeight:600})},
    ],
    rowData:[],defaultColDef:{resizable:true,sortable:true,filter:true,editable:false,minWidth:50},
    rowHeight:28,headerHeight:28,animateRows:false,suppressContextMenu:true,
    onGridReady:p=>p.api.autoSizeAllColumns(),
  });
  watchContracts(items=>{contracts=items;refresh();});
  watchBillings(items=>{billings=items;refresh();});
}
