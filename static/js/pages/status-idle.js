import { watchAssets } from '../firebase/assets.js';
import { watchContracts } from '../firebase/contracts.js';
const $ = s => document.querySelector(s);
const fmtDate = s => { if(!s) return ''; const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); return m?`${m[1].slice(2)}.${m[2]}.${m[3]}`:s; };
function normalizeDate(s){if(!s)return'';let v=String(s).trim().replace(/[./]/g,'-');const m=v.match(/^(\d{2})-(\d{1,2})-(\d{1,2})$/);if(m)v=`${Number(m[1])<50?2000+Number(m[1]):1900+Number(m[1])}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;return v;}
let gridApi, assets=[], contracts=[];
function refresh() {
  const today = new Date().toISOString().slice(0,10);
  const activeCars = new Set(contracts.filter(c=>{const s=normalizeDate(c.start_date);if(!s)return false;return s<=today;}).map(c=>c.car_number));
  const idle = assets.filter(a=>!activeCars.has(a.car_number));
  gridApi.setGridOption('rowData',idle);
}
export async function mount() {
  gridApi = agGrid.createGrid($('#idleGrid'), {
    columnDefs: [
      {headerName:'#',valueGetter:'node.rowIndex+1',width:45},
      {headerName:'차량번호',field:'car_number',width:90},{headerName:'모델',field:'car_model',width:100},
      {headerName:'제조사',field:'manufacturer',width:80},{headerName:'연식',field:'car_year',width:55},
      {headerName:'상태',field:'asset_status',width:80,cellStyle:p=>({color:'var(--c-warn)',fontWeight:500})},
      {headerName:'색상',field:'ext_color',width:65},
    ],
    rowData:[],defaultColDef:{resizable:true,sortable:true,filter:true,editable:false,minWidth:50},
    rowHeight:28,headerHeight:28,animateRows:false,suppressContextMenu:true,
    onGridReady:p=>p.api.autoSizeAllColumns(),
  });
  watchAssets(items=>{assets=items;refresh();});
  watchContracts(items=>{contracts=items;refresh();});
}
