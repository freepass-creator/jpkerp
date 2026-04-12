import { watchLeases } from '../firebase/leases.js';
const $ = s => document.querySelector(s);
const fmt = v => Number(v||0).toLocaleString('ko-KR');
const fmtDate = s => { if(!s) return ''; const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); return m?`${m[1].slice(2)}.${m[2]}.${m[3]}`:s; };
let gridApi;
export async function mount() {
  document.getElementById('adminTitle').textContent = '임대관리';
  gridApi = agGrid.createGrid($('#adminGrid'), {
  $('#adminGrid')._agApi = gridApi;
    columnDefs: [
      {headerName:'#',valueGetter:'node.rowIndex+1',width:45},
      {headerName:'계약명',field:'lease_name',width:140},{headerName:'유형',field:'lease_type',width:80},
      {headerName:'업체',field:'vendor',width:100},{headerName:'월임대료',field:'monthly_fee',width:100,type:'numericColumn',valueFormatter:p=>p.value?fmt(p.value):'-'},
      {headerName:'시작일',field:'start_date',width:85,valueFormatter:p=>fmtDate(p.value)},
      {headerName:'종료일',field:'end_date',width:85,valueFormatter:p=>fmtDate(p.value)},
      {headerName:'상태',field:'status',width:60},{headerName:'비고',field:'note',flex:1},
    ],
    rowData:[],defaultColDef:{resizable:true,sortable:true,filter:true,editable:false,minWidth:50},
    rowHeight:28,headerHeight:28,animateRows:false,suppressContextMenu:true,
    onGridReady:p=>p.api.autoSizeAllColumns(),
  });
  watchLeases(items=>gridApi.setGridOption('rowData',items));
}
