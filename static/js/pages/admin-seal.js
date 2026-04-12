import { watchSeals } from '../firebase/seals.js';
const $ = s => document.querySelector(s);
let gridApi;
export async function mount() {
  document.getElementById('adminTitle').textContent = '인감/도장';
  gridApi = agGrid.createGrid($('#adminGrid'), {
    columnDefs: [
      {headerName:'#',valueGetter:'node.rowIndex+1',width:45},
      {headerName:'인감명',field:'seal_name',width:120},{headerName:'종류',field:'seal_type',width:80},
      {headerName:'용도',field:'usage',width:140},{headerName:'보관위치',field:'location',width:120},
      {headerName:'관리자',field:'manager',width:80},{headerName:'비고',field:'note',flex:1},
    ],
    rowData:[],defaultColDef:{resizable:true,sortable:true,filter:true,editable:false,minWidth:50},
    rowHeight:28,headerHeight:28,animateRows:false,suppressContextMenu:true,
    onGridReady:p=>p.api.autoSizeAllColumns(),
  });
  watchSeals(items=>gridApi.setGridOption('rowData',items));
}
