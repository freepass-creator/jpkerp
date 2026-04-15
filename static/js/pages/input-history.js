/**
 * pages/input-history.js — 업로드 이력 (배치 단위 요약)
 *
 * 좌: 업로드별 1행 — 일시/종류/파일/총/신규/중복/오류
 * 우: 선택한 업로드의 원본 행들 + 요약
 */
import { ref, get } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js';
import { db } from '../firebase/config.js';
import { buildSchemaColumns } from '../core/grid-utils.js';

const SCHEMA_LOADERS = {
  asset:     () => import('../data/schemas/asset.js').then(m => m.ASSET_SCHEMA),
  contract:  () => import('../data/schemas/contract.js').then(m => m.CONTRACT_SCHEMA),
  customer:  () => import('../data/schemas/customer.js').then(m => m.CUSTOMER_SCHEMA),
  member:    () => import('../data/schemas/member.js').then(m => m.MEMBER_SCHEMA),
  vendor:    () => import('../data/schemas/vendor.js').then(m => m.VENDOR_SCHEMA),
  insurance: () => import('../data/schemas/insurance.js').then(m => m.INSURANCE_SCHEMA),
  loan:      () => import('../data/schemas/loan.js').then(m => m.LOAN_SCHEMA),
  autodebit: () => import('../data/schemas/autodebit.js').then(m => m.AUTODEBIT_SCHEMA),
};

async function loadSchemaFor(upload) {
  const t = upload.type;
  if (SCHEMA_LOADERS[t]) return SCHEMA_LOADERS[t]();
  // fund: detected_label 로 은행/카드 구분
  if (t === 'fund') {
    const label = String(upload._raw?.detected_label || upload._raw?.detected_type || '').toLowerCase();
    if (/card|카드/.test(label)) return import('../data/schemas/card-transaction.js').then(m => m.CARD_TRANSACTION_SCHEMA);
    return import('../data/schemas/bank-transaction.js').then(m => m.BANK_TRANSACTION_SCHEMA);
  }
  return null;
}

const $ = s => document.querySelector(s);
const fmtTs = ts => {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getFullYear()).slice(2)}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};
const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let gridApi = null;
let detailGridApi = null;
let allUploads = [];

export async function mount() {
  initGrid();
  bindFilters();
  await loadData();
}

function initGrid() {
  gridApi = agGrid.createGrid($('#ihGrid'), {
    columnDefs: [
      { headerName: '일시', field: 'uploaded_at', width: 120, valueFormatter: p => fmtTs(p.value) },
      { headerName: '방식', field: 'method_label', width: 70,
        cellStyle: p => p.value === '대량' ? { color: 'var(--c-primary)', fontWeight: 600 } : { color: 'var(--c-text-muted)' } },
      { headerName: '종류', field: 'type_label', width: 90,
        cellStyle: { fontWeight: 500 } },
      { headerName: '파일/주소', field: 'filename', flex: 1, minWidth: 180,
        cellRenderer: p => {
          const v = p.value || '';
          if (/^https?:\/\//i.test(v)) {
            let short = v;
            try { short = new URL(v).hostname.replace(/^www\./,''); } catch {}
            return `<a href="${escape(v)}" target="_blank" rel="noopener" style="color:var(--c-primary);text-decoration:underline" title="${escape(v)}">🔗 ${escape(short)}</a>`;
          }
          return escape(v);
        } },
      { headerName: '총', field: 'total', width: 60,
        cellStyle: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
        valueFormatter: p => Number(p.value || 0).toLocaleString() },
      { headerName: '신규', field: 'ok', width: 60,
        cellStyle: p => ({ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: p.value > 0 ? 'var(--c-success)' : 'var(--c-text-muted)', fontWeight: p.value > 0 ? 600 : 400 }),
        valueFormatter: p => Number(p.value || 0).toLocaleString() },
      { headerName: '중복', field: 'skip', width: 60,
        cellStyle: p => ({ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: p.value > 0 ? 'var(--c-warning, #c08a2b)' : 'var(--c-text-muted)' }),
        valueFormatter: p => Number(p.value || 0).toLocaleString() },
      { headerName: '오류', field: 'fail', width: 60,
        cellStyle: p => ({ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: p.value > 0 ? 'var(--c-danger)' : 'var(--c-text-muted)', fontWeight: p.value > 0 ? 600 : 400 }),
        valueFormatter: p => Number(p.value || 0).toLocaleString() },
      { headerName: '반영', field: 'committed_label', width: 70,
        cellStyle: p => {
          if (p.value === '완료') return { color: 'var(--c-success)', fontWeight: 600 };
          if (p.value === '부분') return { color: '#c08a2b', fontWeight: 500 };
          if (p.value === '대기') return { color: 'var(--c-text-muted)' };
          if (p.value === '오류') return { color: 'var(--c-danger)', fontWeight: 600 };
          return {};
        } },
    ],
    rowData: [],
    defaultColDef: { resizable: true, sortable: true, filter: false, minWidth: 50 },
    rowHeight: 30,
    headerHeight: 28,
    animateRows: false,
    rowSelection: 'single',
    suppressContextMenu: true,
    onRowClicked: (e) => showDetail(e.data),
  });
}

const DIRECT_SOURCES = [
  { path: 'assets',      type: 'asset',     label: '자산' },
  { path: 'contracts',   type: 'contract',  label: '계약' },
  { path: 'customers',   type: 'customer',  label: '고객' },
  { path: 'members',     type: 'member',    label: '회원사' },
  { path: 'vendors',     type: 'vendor',    label: '거래처' },
  { path: 'insurances',  type: 'insurance', label: '보험' },
  { path: 'loans',       type: 'loan',      label: '할부' },
  { path: 'autodebits',  type: 'autodebit', label: '자동이체' },
  { path: 'events',      type: 'event',     label: '운영' },
];

async function loadData() {
  const rows = [];

  // 1) 대량 업로드
  try {
    const snap = await get(ref(db, 'uploads'));
    if (snap.exists()) {
      for (const [id, u] of Object.entries(snap.val())) {
        if (u.status === 'deleted') continue;
        const results = u.results || {};
        const st = String(u.status || '').toLowerCase();
        const committed_label =
          st === 'processed' ? '완료' :
          st === 'partial'   ? '부분' :
          st === 'error'     ? '오류' :
          st === 'pending'   ? '대기' : (u.status || '-');
        rows.push({
          _id: id,
          _raw: u,
          _direct: false,
          uploaded_at: u.uploaded_at || u.created_at,
          method: 'bulk',
          method_label: '대량',
          type: normalizeType(u.detected_type || u.detected_label),
          type_label: u.detected_label || u.detected_type || '-',
          filename: u.filename || '',
          total: u.row_count || 0,
          ok: results.ok || 0,
          skip: results.skip || 0,
          fail: results.fail || 0,
          committed_label,
        });
      }
    }
  } catch (e) { console.warn('[input-history] uploads load failed', e); }

  // 2) 개별입력 — 각 컬렉션을 (날짜, 종류)로 묶음
  for (const src of DIRECT_SOURCES) {
    try {
      const snap = await get(ref(db, src.path));
      if (!snap.exists()) continue;
      const buckets = {};  // dayKey → { ts, records }
      Object.values(snap.val()).forEach(r => {
        if (!r || r.status === 'deleted') return;
        if (r.upload_id) return;  // 업로드로 들어온 건 제외 (업로드 배치에서 이미 집계됨)
        const ts = r.created_at || 0;
        if (!ts) return;
        const d = new Date(ts);
        const dayKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).getTime();
        if (!buckets[dayKey]) buckets[dayKey] = { ts: endOfDay, records: [] };
        buckets[dayKey].records.push(r);
      });
      for (const [dayKey, bucket] of Object.entries(buckets)) {
        rows.push({
          _id: `direct_${src.type}_${dayKey}`,
          _direct: true,
          _records: bucket.records,
          uploaded_at: bucket.ts,
          method: 'single',
          method_label: '개별',
          type: src.type,
          type_label: src.label,
          filename: `개별입력 · ${dayKey}`,
          total: bucket.records.length,
          ok: bucket.records.length,
          skip: 0,
          fail: 0,
          committed_label: '완료',
        });
      }
    } catch (e) { console.warn(`[input-history] ${src.path} load failed`, e); }
  }

  allUploads = rows.sort((a, b) => (b.uploaded_at || 0) - (a.uploaded_at || 0));
  refreshGrid();
}

function normalizeType(t) {
  if (!t) return '';
  const s = String(t).toLowerCase();
  if (/자산|asset/.test(s)) return 'asset';
  if (/계약|contract/.test(s)) return 'contract';
  if (/고객|customer/.test(s)) return 'customer';
  if (/회원사|member/.test(s)) return 'member';
  if (/거래처|vendor/.test(s)) return 'vendor';
  if (/보험|insurance/.test(s)) return 'insurance';
  if (/할부|loan/.test(s)) return 'loan';
  if (/자동이체|autodebit/.test(s)) return 'autodebit';
  if (/통장|카드|입출금|bank|card|fund/.test(s)) return 'fund';
  if (/운영|event|penalty/.test(s)) return 'event';
  return '';
}

function refreshGrid() {
  const type = $('#ihType')?.value;
  const from = $('#ihDateFrom')?.value;
  const to = $('#ihDateTo')?.value;

  let rows = [...allUploads];
  if (type) rows = rows.filter(r => r.type === type);
  if (from) {
    const ts = new Date(from).getTime();
    rows = rows.filter(r => (r.uploaded_at || 0) >= ts);
  }
  if (to) {
    const ts = new Date(to).getTime() + 86400000;
    rows = rows.filter(r => (r.uploaded_at || 0) <= ts);
  }

  gridApi?.setGridOption('rowData', rows);
  const cnt = $('#ihCount');
  if (cnt) cnt.textContent = rows.length;
}

async function showDetail(upload) {
  const host = $('#ihDetail');
  const titleEl = $('#ihDetailTitle');
  if (!host || !upload) return;

  titleEl.textContent = `${upload.type_label} · ${upload.filename}`;
  detailGridApi = null;

  const rows = upload._direct ? (upload._records || []) : (upload._raw?.rows || []);
  const stat = (label, value, color) =>
    `<div style="display:flex;flex-direction:column;align-items:center;padding:10px;background:var(--c-bg-sub);border-radius:var(--r-md);min-width:70px">
       <div style="font-size:var(--font-size-xs);color:var(--c-text-muted)">${label}</div>
       <div style="font-size:var(--font-size-lg);font-weight:700;color:${color};font-variant-numeric:tabular-nums">${Number(value || 0).toLocaleString()}</div>
     </div>`;

  host.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:10px">
      ${stat('총건수', upload.total, 'var(--c-text)')}
      ${stat('신규', upload.ok, 'var(--c-success)')}
      ${stat('중복', upload.skip, '#c08a2b')}
      ${stat('오류', upload.fail, 'var(--c-danger)')}
    </div>
    <div style="font-size:var(--font-size-sm);color:var(--c-text-muted);margin-bottom:8px;display:flex;gap:12px;flex-wrap:wrap">
      <span>${upload._direct ? '개별입력' : '업로드'}: ${fmtTs(upload.uploaded_at)}</span>
      <span>반영: <b style="color:${upload.committed_label === '완료' ? 'var(--c-success)' : upload.committed_label === '오류' ? 'var(--c-danger)' : 'inherit'}">${escape(upload.committed_label || '-')}</b></span>
      ${/^https?:\/\//i.test(upload.filename) ? `<a href="${escape(upload.filename)}" target="_blank" rel="noopener" style="color:var(--c-primary);text-decoration:underline">🔗 원본 열기</a>` : ''}
    </div>
    <div id="ihDetailGrid" class="ag-theme-alpine" style="flex:1;min-height:300px;width:100%;height:calc(100% - 100px)"></div>
    <div id="ihDetailMsg" style="margin-top:6px;font-size:var(--font-size-xs);color:var(--c-text-muted)"></div>
  `;

  const gridEl = $('#ihDetailGrid');
  const msgEl = $('#ihDetailMsg');

  if (!rows.length) {
    gridEl.outerHTML = `<div class="empty"><i class="ph ph-database" style="font-size:24px;color:var(--c-text-muted)"></i><div>저장된 원본 행 데이터가 없습니다</div></div>`;
    return;
  }

  const schema = await loadSchemaFor(upload);
  let columnDefs;
  if (schema) {
    columnDefs = [
      { headerName: '상태', valueGetter: p => {
          const s = p.data._match?.status;
          return s === 'new' ? '신규' : s === 'dup' ? '중복' : s === 'error' ? '오류' : '';
        }, width: 60,
        cellStyle: p => {
          const s = p.data._match?.status;
          if (s === 'new') return { color: 'var(--c-success)', fontWeight: 600 };
          if (s === 'dup') return { color: '#c08a2b' };
          if (s === 'error') return { color: 'var(--c-danger)', fontWeight: 600 };
          return {};
        } },
      ...buildSchemaColumns(schema, { includeRowNum: false }),
    ];
  } else {
    const keys = Object.keys(rows[0]).filter(k => !k.startsWith('_')).slice(0, 30);
    columnDefs = [
      { headerName: '#', valueGetter: 'node.rowIndex + 1', width: 45 },
      ...keys.map(k => ({ field: k, headerName: k, minWidth: 80 })),
    ];
    msgEl.textContent = '* 스키마 매핑 없음 — 원본 키 그대로 표시';
  }

  detailGridApi = agGrid.createGrid(gridEl, {
    columnDefs,
    rowData: rows.map(r => {
      const copy = { ...r };
      if (upload._direct && !copy._match) copy._match = { status: 'new' };
      return copy;
    }),
    defaultColDef: { resizable: true, sortable: true, filter: true, minWidth: 60 },
    rowHeight: 28,
    headerHeight: 28,
    animateRows: false,
    suppressContextMenu: true,
    getRowStyle: (p) => {
      const s = p.data._match?.status;
      if (s === 'dup')   return { background: '#fff8e6' };
      if (s === 'error') return { background: '#fde8e8' };
      return null;
    },
    onFirstDataRendered: (e) => {
      const allCols = e.api.getColumns()?.map(c => c.getColId()).filter(Boolean) || [];
      if (allCols.length) e.api.autoSizeColumns(allCols, false);
    },
  });
}

function bindFilters() {
  $('#ihRefresh')?.addEventListener('click', refreshGrid);
  ['ihType', 'ihDateFrom', 'ihDateTo'].forEach(id => {
    $(`#${id}`)?.addEventListener('change', refreshGrid);
  });
}
