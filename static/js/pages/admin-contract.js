import { watchAdminContracts } from '../firebase/admin-contracts.js';
const $ = s => document.querySelector(s);
const fmtDate = s => { if(!s) return ''; const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); return m?`${m[1].slice(2)}.${m[2]}.${m[3]}`:s; };
let gridApi;
export async function mount() {
  document.getElementById('adminTitle').textContent = '계약서관리';
  gridApi = agGrid.createGrid($('#adminGrid'), {
  $('#adminGrid')._agApi = gridApi;
    columnDefs: [
      {headerName:'#',valueGetter:'node.rowIndex+1',width:45},
      {headerName:'계약서명',field:'doc_name',width:180},{headerName:'유형',field:'doc_type',width:100},
      {headerName:'상대방',field:'counterparty',width:100},{headerName:'등록일',field:'reg_date',width:85,valueFormatter:p=>fmtDate(p.value)},
      {headerName:'만료일',field:'exp_date',width:85,valueFormatter:p=>fmtDate(p.value)},
      {headerName:'상태',field:'status',width:60},{headerName:'비고',field:'note',flex:1},
    ],
    rowData:[],defaultColDef:{resizable:true,sortable:true,filter:true,editable:false,minWidth:50},
    rowHeight:28,headerHeight:28,animateRows:false,suppressContextMenu:true,
    onGridReady:p=>p.api.autoSizeAllColumns(),
  });
  watchAdminContracts(items=>gridApi.setGridOption('rowData',items));
}
