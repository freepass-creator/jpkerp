import { watchCards } from '../firebase/cards.js';
const $ = s => document.querySelector(s);
let gridApi;
export async function mount() {
  document.getElementById('adminTitle').textContent = '법인카드관리';
  gridApi = agGrid.createGrid($('#adminGrid'), {
    columnDefs: [
      {headerName:'#',valueGetter:'node.rowIndex+1',width:45},
      {headerName:'카드번호',field:'card_no',width:150},{headerName:'카드사',field:'card_company',width:80},
      {headerName:'사용자',field:'card_user',width:80},{headerName:'한도',field:'card_limit',width:100,type:'numericColumn',valueFormatter:p=>p.value?Number(p.value).toLocaleString():''},
      {headerName:'결제일',field:'pay_day',width:60},{headerName:'용도',field:'usage',width:80},
      {headerName:'상태',field:'status',width:60},
    ],
    rowData:[],defaultColDef:{resizable:true,sortable:true,filter:true,editable:false,minWidth:50},
    rowHeight:28,headerHeight:28,animateRows:false,suppressContextMenu:true,
    onGridReady:p=>p.api.autoSizeAllColumns(),
  });
  watchCards(items=>gridApi.setGridOption('rowData',items));
}
