import { watchVendors } from '../firebase/vendors.js';
const $ = s => document.querySelector(s);
let gridApi;
export async function mount() {
  document.getElementById('adminTitle').textContent = '거래처관리';
  gridApi = agGrid.createGrid($('#adminGrid'), {
  $('#adminGrid')._agApi = gridApi;
    columnDefs: [
      {headerName:'#',valueGetter:'node.rowIndex+1',width:45},
      {headerName:'거래처명',field:'vendor_name',width:120},{headerName:'업종',field:'vendor_type',width:80},
      {headerName:'담당자',field:'contact_name',width:80},{headerName:'연락처',field:'phone',width:110},
      {headerName:'주소',field:'address',width:180},{headerName:'사업자번호',field:'biz_no',width:110},
      {headerName:'계좌',field:'bank_account',width:130},{headerName:'비고',field:'note',flex:1},
    ],
    rowData:[],defaultColDef:{resizable:true,sortable:true,filter:true,editable:false,minWidth:50},
    rowHeight:28,headerHeight:28,animateRows:false,suppressContextMenu:true,
    onGridReady:p=>p.api.autoSizeAllColumns(),
  });
  watchVendors(items=>gridApi.setGridOption('rowData',items));
}
