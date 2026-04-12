import { watchBankAccounts } from '../firebase/bank-accounts.js';
const $ = s => document.querySelector(s);
let gridApi;
export async function mount() {
  document.getElementById('adminTitle').textContent = '계좌관리';
  gridApi = agGrid.createGrid($('#adminGrid'), {
    columnDefs: [
      {headerName:'#',valueGetter:'node.rowIndex+1',width:45},
      {headerName:'은행',field:'bank_name',width:80},{headerName:'계좌번호',field:'account_no',width:150},
      {headerName:'예금주',field:'holder',width:80},{headerName:'용도',field:'usage',width:100},
      {headerName:'별칭',field:'alias',width:80},{headerName:'상태',field:'status',width:60},
    ],
    rowData:[],defaultColDef:{resizable:true,sortable:true,filter:true,editable:false,minWidth:50},
    rowHeight:28,headerHeight:28,animateRows:false,suppressContextMenu:true,
    onGridReady:p=>p.api.autoSizeAllColumns(),
  });
  watchBankAccounts(items=>gridApi.setGridOption('rowData',items));
}
