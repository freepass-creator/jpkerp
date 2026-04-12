import { watchMembers } from '../firebase/members.js';
const $ = s => document.querySelector(s);
let gridApi;
export async function mount() {
  document.getElementById('adminTitle').textContent = '회원사관리';
  gridApi = agGrid.createGrid($('#adminGrid'), {
    columnDefs: [
      {headerName:'#',valueGetter:'node.rowIndex+1',width:45},
      {headerName:'회사명',field:'company_name',width:140},
      {headerName:'사업자번호',field:'biz_no',width:110},
      {headerName:'대표자',field:'ceo_name',width:80},
      {headerName:'담당자',field:'contact_name',width:80},
      {headerName:'연락처',field:'phone',width:110},
      {headerName:'이메일',field:'email',width:150},
      {headerName:'차량대수',field:'car_count',width:70,type:'numericColumn'},
      {headerName:'계약일',field:'contract_date',width:85},
      {headerName:'상태',field:'status',width:60},
      {headerName:'비고',field:'note',flex:1},
    ],
    rowData:[],
    defaultColDef:{resizable:true,sortable:true,filter:'agTextColumnFilter',editable:false,minWidth:40},
    rowHeight:28,headerHeight:28,animateRows:false,suppressContextMenu:true,
    onGridReady:p=>{ p.api.autoSizeAllColumns(); $('#adminGrid')._agApi = p.api; },
  });
  watchMembers(items=>gridApi.setGridOption('rowData',items));
}
