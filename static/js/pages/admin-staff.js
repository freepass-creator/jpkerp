import { watchUsers } from '../firebase/users.js';
const $ = s => document.querySelector(s);
let gridApi;
export async function mount() {
  document.getElementById('adminTitle').textContent = '직원관리';
  gridApi = agGrid.createGrid($('#adminGrid'), {
    columnDefs: [
      {headerName:'#',valueGetter:'node.rowIndex+1',width:45},
      {headerName:'이름',field:'name',width:80},{headerName:'부서',field:'department',width:80},
      {headerName:'직급',field:'position',width:70},{headerName:'연락처',field:'phone',width:110},
      {headerName:'이메일',field:'email',width:150},{headerName:'권한',field:'role',width:70},
      {headerName:'상태',field:'status',width:60},
    ],
    rowData:[],defaultColDef:{resizable:true,sortable:true,filter:true,editable:false,minWidth:50},
    rowHeight:28,headerHeight:28,animateRows:false,suppressContextMenu:true,
    onGridReady:p=>p.api.autoSizeAllColumns(),
  });
  watchUsers(items=>gridApi.setGridOption('rowData',items));
}
