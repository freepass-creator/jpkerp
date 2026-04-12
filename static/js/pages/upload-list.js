/**
 * pages/upload-list.js — 업로드내역
 *
 * 좌: 업로드 이력 목록 (날짜/파일명/유형/상태)
 * 우: 선택한 업로드의 추출 데이터 AG Grid
 */
import { watchUploads, getUpload } from '../firebase/uploads.js';

const $ = (s) => document.querySelector(s);
const fmtTs = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getFullYear()).slice(2)}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

let uploads = [];
let selectedId = null;
let detailGrid = null;

const STATUS_BADGE = {
  pending:   '<span style="color:var(--c-warn);font-weight:500">대기</span>',
  processed: '<span style="color:var(--c-success);font-weight:500">완료</span>',
  partial:   '<span style="color:var(--c-danger);font-weight:500">부분</span>',
  error:     '<span style="color:var(--c-danger);font-weight:500">오류</span>',
};

function renderList() {
  const host = $('#ulList');
  if (!uploads.length) {
    host.innerHTML = '<div style="padding:24px;text-align:center;color:var(--c-text-muted)">업로드 이력 없음</div>';
    return;
  }
  host.innerHTML = `<table class="grid-table">
    <thead><tr><th>일시</th><th>파일</th><th>유형</th><th>행</th><th>상태</th></tr></thead>
    <tbody>${uploads.map(u => {
      const active = selectedId === u.upload_id ? ' is-active' : '';
      const ok = u.results?.ok || 0;
      const fail = u.results?.fail || 0;
      return `<tr class="ul-row${active}" data-id="${u.upload_id}" style="cursor:pointer">
        <td style="font-size:10px;color:var(--c-text-muted)">${fmtTs(u.uploaded_at)}</td>
        <td style="font-weight:500;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${u.filename || '-'}</td>
        <td style="font-size:10px">${u.detected_label || u.detected_type || '-'}</td>
        <td style="text-align:right">${u.row_count || '-'}</td>
        <td>${STATUS_BADGE[u.status] || u.status || '-'}</td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;

  host.querySelectorAll('.ul-row').forEach(row => {
    row.addEventListener('click', () => {
      selectedId = row.dataset.id;
      renderList();
      showDetail(selectedId);
    });
  });
}

async function showDetail(uploadId) {
  const u = uploads.find(x => x.upload_id === uploadId);
  if (!u) return;

  $('#ulDetailTitle').textContent = u.detected_label || u.filename || '상세';
  const ok = u.results?.ok || 0;
  const fail = u.results?.fail || 0;
  const skip = u.results?.skip || 0;
  $('#ulDetailInfo').textContent = `${u.row_count || 0}행 · 반영 ${ok} · 실패 ${fail} · 중복 ${skip}`;

  // rows 데이터가 upload에 저장돼 있으면 표시
  if (u.rows && u.rows.length) {
    showDetailGrid(u.rows);
  } else {
    // rows 없으면 메타만 표시
    if (detailGrid) { detailGrid.destroy(); detailGrid = null; }
    $('#ulDetailGrid').innerHTML = `<div style="padding:24px;text-align:center;color:var(--c-text-muted)">
      <div style="font-weight:600;margin-bottom:8px">${u.filename}</div>
      <div style="font-size:11px">유형: ${u.detected_label || '-'}</div>
      <div style="font-size:11px">업로드: ${fmtTs(u.uploaded_at)}</div>
      <div style="font-size:11px">처리: ${fmtTs(u.processed_at) || '-'}</div>
      <div style="font-size:11px;margin-top:8px">반영 ${ok}건 · 실패 ${fail}건 · 중복 ${skip}건</div>
    </div>`;
  }
}

function showDetailGrid(rows) {
  if (!rows.length) return;
  // 첫 행에서 컬럼 자동 추출
  const keys = Object.keys(rows[0]).filter(k => !k.startsWith('_'));
  const cols = keys.map(k => ({
    headerName: k,
    field: k,
    width: 120,
  }));

  if (detailGrid) detailGrid.destroy();
  detailGrid = agGrid.createGrid($('#ulDetailGrid'), {
    columnDefs: [
      { headerName: '#', valueGetter: 'node.rowIndex + 1', width: 45 },
      ...cols,
    ],
    rowData: rows,
    defaultColDef: { resizable: true, sortable: true, editable: false, minWidth: 50 },
    rowHeight: 28,
    headerHeight: 28,
    animateRows: false,
    suppressContextMenu: true,
    onGridReady: (p) => p.api.autoSizeAllColumns(),
  });
}

export async function mount() {
  watchUploads((items) => {
    uploads = items;
    renderList();
    if (!selectedId && items.length) {
      selectedId = items[0].upload_id;
      renderList();
      showDetail(selectedId);
    }
  });
}
