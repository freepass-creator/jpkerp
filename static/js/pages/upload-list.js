/**
 * pages/upload-list.js — 업로드내역
 *
 * 좌: AG Grid 업로드 이력
 * 우: 선택한 업로드의 원본 데이터 AG Grid
 */
import { watchUploads } from '../firebase/uploads.js';

const $ = (s) => document.querySelector(s);
const fmtTs = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getFullYear()).slice(2)}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

let uploads = [];
let listGrid = null;
let detailGrid = null;

export async function mount() {
  listGrid = agGrid.createGrid($('#ulListGrid'), {
    columnDefs: [
      { headerName: '일시', field: 'uploaded_at', width: 110,
        valueFormatter: (p) => fmtTs(p.value) },
      { headerName: '파일명', field: 'filename', width: 160 },
      { headerName: '유형', field: 'detected_label', width: 120 },
      { headerName: '행', field: 'row_count', width: 50, type: 'numericColumn' },
      { headerName: '상태', field: 'status', width: 55,
        cellRenderer: (p) => {
          const s = { pending: '대기', processed: '완료', partial: '부분', error: '오류' };
          const c = { pending: 'var(--c-warn)', processed: 'var(--c-success)', partial: 'var(--c-danger)', error: 'var(--c-danger)' };
          return `<span style="color:${c[p.value] || ''};font-weight:500">${s[p.value] || p.value || '-'}</span>`;
        }},
      { headerName: '성공', field: 'results', width: 45, type: 'numericColumn',
        valueGetter: (p) => p.data.results?.ok || 0,
        cellStyle: { color: 'var(--c-success)' } },
      { headerName: '실패', field: 'results', width: 45, type: 'numericColumn',
        valueGetter: (p) => p.data.results?.fail || 0,
        cellStyle: (p) => (p.data.results?.fail ? { color: 'var(--c-danger)' } : {}) },
    ],
    rowData: [],
    defaultColDef: { resizable: true, sortable: true, editable: false, minWidth: 40 },
    rowHeight: 28,
    headerHeight: 28,
    animateRows: false,
    suppressContextMenu: true,
    rowSelection: 'single',
    onRowClicked: (e) => {
      if (e.data) showDetail(e.data);
    },
    onGridReady: (p) => { p.api.autoSizeAllColumns(); p.api.gridOptionsService?.eGridDiv && (p.api.gridOptionsService.eGridDiv._agApi = p.api); },
  });

  watchUploads((items) => {
    uploads = items;
    listGrid.setGridOption('rowData', items);
    if (items.length && !detailGrid) {
      showDetail(items[0]);
    }
  });
}

function showDetail(u) {
  $('#ulDetailTitle').textContent = u.detected_label || u.filename || '상세';
  const ok = u.results?.ok || 0;
  const fail = u.results?.fail || 0;
  const skip = u.results?.skip || 0;
  $('#ulDetailInfo').textContent = `${u.row_count || 0}행 · 반영 ${ok} · 실패 ${fail} · 중복 ${skip}`;

  if (u.rows && u.rows.length) {
    const keys = Object.keys(u.rows[0]).filter(k => !k.startsWith('_'));
    const cols = keys.map(k => ({ headerName: k, field: k, width: 120 }));

    if (detailGrid) detailGrid.destroy();
    detailGrid = agGrid.createGrid($('#ulDetailGrid'), {
      columnDefs: [
        { headerName: '#', valueGetter: 'node.rowIndex + 1', width: 45 },
        ...cols,
      ],
      rowData: u.rows,
      defaultColDef: { resizable: true, sortable: true, editable: false, minWidth: 50 },
      rowHeight: 28,
      headerHeight: 28,
      animateRows: false,
      suppressContextMenu: true,
      onGridReady: (p) => { p.api.autoSizeAllColumns(); p.api.gridOptionsService?.eGridDiv && (p.api.gridOptionsService.eGridDiv._agApi = p.api); },
    });
  } else {
    if (detailGrid) { detailGrid.destroy(); detailGrid = null; }
    $('#ulDetailGrid').innerHTML = `<div style="padding:24px;text-align:center;color:var(--c-text-muted)">
      <div style="font-weight:600;margin-bottom:8px">${u.filename || '-'}</div>
      <div style="font-size:var(--font-size-sm)">유형: ${u.detected_label || '-'}</div>
      <div style="font-size:var(--font-size-sm)">업로드: ${fmtTs(u.uploaded_at)}</div>
      <div style="font-size:var(--font-size-sm);margin-top:8px">반영 ${ok}건 · 실패 ${fail}건 · 중복 ${skip}건</div>
    </div>`;
  }
}
