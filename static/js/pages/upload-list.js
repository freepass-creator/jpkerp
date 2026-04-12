/**
 * pages/upload-list.js — 업로드내역
 *
 * uploads 컬렉션의 이력 조회.
 * 언제 / 뭘 올렸고 / 뭘 추출했고 / 반영 결과가 어떤지.
 * 행 클릭 시 상세 데이터 확인.
 */
import { watchUploads } from '../firebase/uploads.js';
import { showToast } from '../core/toast.js';

const $ = (s) => document.querySelector(s);
const fmt = (v) => Number(v || 0).toLocaleString('ko-KR');
const fmtDate = (s) => {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getFullYear()).slice(2)}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

let gridApi = null;

export async function mount() {
  const STATUS = {
    pending: '<span style="color:var(--c-warn)">대기</span>',
    processed: '<span style="color:var(--c-success)">완료</span>',
    partial: '<span style="color:var(--c-danger)">부분</span>',
    error: '<span style="color:var(--c-danger)">오류</span>',
  };

  gridApi = agGrid.createGrid($('#uploadListGrid'), {
    columnDefs: [
      { headerName: '#', valueGetter: 'node.rowIndex + 1', width: 45 },
      { headerName: '업로드일시', field: 'uploaded_at', width: 130,
        valueFormatter: (p) => fmtDate(p.value) },
      { headerName: '파일명', field: 'filename', width: 200 },
      { headerName: '유형', field: 'detected_label', width: 140 },
      { headerName: '형식', field: 'file_type', width: 60 },
      { headerName: '행수', field: 'row_count', width: 60, type: 'numericColumn' },
      { headerName: '상태', field: 'status', width: 70,
        cellRenderer: (p) => STATUS[p.value] || p.value || '-' },
      { headerName: '성공', field: 'results', width: 60, type: 'numericColumn',
        valueGetter: (p) => p.data.results?.ok || 0,
        cellStyle: { color: 'var(--c-success)' } },
      { headerName: '실패', field: 'results', width: 60, type: 'numericColumn',
        valueGetter: (p) => p.data.results?.fail || 0,
        cellStyle: (p) => (p.data.results?.fail ? { color: 'var(--c-danger)' } : {}) },
      { headerName: '중복', field: 'results', width: 60, type: 'numericColumn',
        valueGetter: (p) => p.data.results?.skip || 0 },
      { headerName: '처리일시', field: 'processed_at', width: 130,
        valueFormatter: (p) => fmtDate(p.value) },
    ],
    rowData: [],
    defaultColDef: { resizable: true, sortable: true, editable: false, minWidth: 40 },
    rowHeight: 28,
    headerHeight: 28,
    animateRows: false,
    suppressContextMenu: true,
    onGridReady: (params) => { params.api.autoSizeAllColumns(); },
  });

  watchUploads((items) => {
    gridApi.setGridOption('rowData', items);
  });
}
