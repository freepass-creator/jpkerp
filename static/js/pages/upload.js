/**
 * pages/upload.js — 업로드센터
 *
 * 아무 파일 던지면 자동 감지 → 확인 → 파싱 → AG Grid 검증 → 반영
 * CSV: 헤더로 유형 자동 판별 (통장/카드/자산/계약/고객)
 * PDF/이미지: 추후 OCR 연동
 */
import { parseCsv, mapHeaders } from '../widgets/csv-upload.js';
import { matchEvent } from '../core/match-engine.js';
import * as shinhanBank from '../data/bank-parsers/shinhan.js';
import * as shinhanCard from '../data/card-parsers/shinhan.js';
import { ASSET_SCHEMA } from '../data/schemas/asset.js';
import { CONTRACT_SCHEMA } from '../data/schemas/contract.js';
import { CUSTOMER_SCHEMA } from '../data/schemas/customer.js';
import { upsertEventByRawKey } from '../firebase/events.js';
import { saveAsset } from '../firebase/assets.js';
import { saveContract } from '../firebase/contracts.js';
import { saveCustomer } from '../firebase/customers.js';
import { watchAssets } from '../firebase/assets.js';
import { watchContracts } from '../firebase/contracts.js';
import { watchCustomers } from '../firebase/customers.js';
import { watchEvents } from '../firebase/events.js';
import { watchBillings } from '../firebase/billings.js';
import { saveUpload, updateUpload, fileFingerprint } from '../firebase/uploads.js';
import { showToast } from '../core/toast.js';

const $ = (s) => document.querySelector(s);
const fmt = (v) => Number(v || 0).toLocaleString('ko-KR');
const fmtDate = (s) => {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1].slice(2)}.${m[2]}.${m[3]}` : s;
};

let gridApi = null;
let detectedType = null;
let parsedRows = [];
let saveFn = null;

// 기존 데이터 (중복 체크 + 매칭용)
let existingData = { events: [], assets: [], contracts: [], customers: [], billings: [] };
let currentUploadId = null;

const DETECTORS = [
  {
    name: '신한은행 통장내역',
    icon: '🏦',
    test: (headers) => shinhanBank.detect(headers),
    parse: (rows, headers) => rows.map(r => shinhanBank.parseRow(r, headers)).filter(Boolean),
    columns: () => [
      { headerName: '일자', field: 'date', width: 85, valueFormatter: p => fmtDate(p.value) },
      { headerName: '방향', field: 'direction', width: 55, valueFormatter: p => p.value === 'in' ? '입금' : '출금',
        cellStyle: p => ({ fontWeight: 500, color: p.value === 'in' ? 'var(--c-success)' : 'var(--c-danger)' }) },
      { headerName: '금액', field: 'amount', width: 100, type: 'numericColumn', valueFormatter: p => fmt(p.value) },
      { headerName: '내용', field: 'counterparty', width: 140 },
      { headerName: '적요', field: 'summary', width: 100 },
      { headerName: '잔액', field: 'balance', width: 100, type: 'numericColumn', valueFormatter: p => p.value ? fmt(p.value) : '' },
      { headerName: '메모', field: 'memo', flex: 1 },
    ],
    save: (row) => upsertEventByRawKey(row),
    isDup: (row) => existingData.events.some(e => e.raw_key && e.raw_key === row.raw_key),
  },
  {
    name: '신한카드 이용내역',
    icon: '💳',
    test: (headers) => shinhanCard.detect(headers),
    parse: (rows, headers) => rows.map(r => shinhanCard.parseRow(r, headers)).filter(Boolean),
    columns: () => [
      { headerName: '일자', field: 'date', width: 85, valueFormatter: p => fmtDate(p.value) },
      { headerName: '사용자', field: 'card_user', width: 80 },
      { headerName: '가맹점', field: 'counterparty', width: 150 },
      { headerName: '금액', field: 'amount', width: 100, type: 'numericColumn', valueFormatter: p => fmt(p.value),
        cellStyle: { color: 'var(--c-danger)' } },
      { headerName: '분류', field: 'expense_category', width: 75,
        cellStyle: { fontWeight: 500, color: 'var(--c-text-sub)' } },
      { headerName: '카드', field: 'card_no', width: 110 },
      { headerName: '결제예정', field: 'pay_date', width: 85, valueFormatter: p => fmtDate(p.value) },
    ],
    save: (row) => upsertEventByRawKey(row),
    isDup: (row) => existingData.events.some(e => e.raw_key && e.raw_key === row.raw_key),
  },
  {
    name: '자산(차량) 데이터',
    icon: '🚗',
    test: (headers) => {
      const mapped = mapHeaders(headers, ASSET_SCHEMA);
      return mapped.filter(Boolean).length >= 3;
    },
    parse: (rows, headers) => {
      const mapping = mapHeaders(headers, ASSET_SCHEMA);
      return rows.map(row => {
        const obj = {};
        mapping.forEach((col, i) => { if (col) obj[col] = String(row[i] || '').trim(); });
        return Object.keys(obj).length ? obj : null;
      }).filter(Boolean);
    },
    columns: () => ASSET_SCHEMA.filter(s => s.gridShow !== false).slice(0, 10).map(s => ({
      headerName: s.label, field: s.col, width: 100,
    })),
    save: (row) => saveAsset(row),
    isDup: (row) => existingData.assets.some(a => a.vin && a.vin === row.vin),
  },
  {
    name: '계약 데이터',
    icon: '📋',
    test: (headers) => {
      const mapped = mapHeaders(headers, CONTRACT_SCHEMA);
      return mapped.filter(Boolean).length >= 3;
    },
    parse: (rows, headers) => {
      const mapping = mapHeaders(headers, CONTRACT_SCHEMA);
      return rows.map(row => {
        const obj = {};
        mapping.forEach((col, i) => { if (col) obj[col] = String(row[i] || '').trim(); });
        return Object.keys(obj).length ? obj : null;
      }).filter(Boolean);
    },
    columns: () => CONTRACT_SCHEMA.filter(s => s.gridShow !== false).slice(0, 10).map(s => ({
      headerName: s.label, field: s.col, width: 100,
    })),
    save: (row) => saveContract(row),
    isDup: (row) => existingData.contracts.some(c => c.car_number === row.car_number && c.start_date === row.start_date),
  },
  {
    name: '고객 데이터',
    icon: '👥',
    test: (headers) => {
      const mapped = mapHeaders(headers, CUSTOMER_SCHEMA);
      return mapped.filter(Boolean).length >= 2;
    },
    parse: (rows, headers) => {
      const mapping = mapHeaders(headers, CUSTOMER_SCHEMA);
      return rows.map(row => {
        const obj = {};
        mapping.forEach((col, i) => { if (col) obj[col] = String(row[i] || '').trim(); });
        return Object.keys(obj).length ? obj : null;
      }).filter(Boolean);
    },
    columns: () => CUSTOMER_SCHEMA.map(s => ({
      headerName: s.label, field: s.col, width: 100,
    })),
    save: (row) => saveCustomer(row),
    isDup: (row) => existingData.customers.some(c => c.customer_reg_no && c.customer_reg_no === row.customer_reg_no),
  },
];

function reset() {
  detectedType = null;
  parsedRows = [];
  saveFn = null;
  if (gridApi) { gridApi.destroy(); gridApi = null; }
  $('#uploadGrid').innerHTML = '';
  $('#uploadFile').value = '';
  $('#uploadDetect').innerHTML = '';
  $('#uploadInfo').textContent = '파일을 업로드하세요';
}

async function handleFiles(files) {
  if (!files.length) return;
  const file = files[0];
  const ext = file.name.split('.').pop().toLowerCase();

  if (['csv'].includes(ext)) {
    const text = await file.text();
    handleCsv(text, file.name);
  } else if (['pdf', 'png', 'jpg', 'jpeg'].includes(ext)) {
    handleOcr(file);
  } else {
    showToast('지원하지 않는 파일 형식입니다', 'error');
  }
}

function handleCsv(text, filename) {
  const rows = parseCsv(text);
  if (rows.length < 2) { showToast('데이터 행이 없습니다', 'error'); return; }
  const headers = rows[0].map(h => String(h || '').trim());
  const dataRows = rows.slice(1);

  // 자동 감지
  const matches = DETECTORS.filter(d => d.test(headers));
  const detect = $('#uploadDetect');

  if (matches.length === 0) {
    detect.innerHTML = `<div class="dash-card" style="color:var(--c-danger)">
      <div style="font-weight:600">감지 실패</div>
      <div style="font-size:11px;color:var(--c-text-muted)">헤더를 인식할 수 없습니다: ${headers.slice(0, 5).join(', ')}...</div>
    </div>`;
    return;
  }

  if (matches.length === 1) {
    applyDetector(matches[0], dataRows, headers, filename);
    return;
  }

  // 여러 개 매칭 → 선택
  detect.innerHTML = `<div style="font-size:11px;color:var(--c-text-muted);margin-bottom:4px">여러 유형이 감지되었습니다:</div>` +
    matches.map((d, i) => `<div class="dash-card detect-choice" data-idx="${i}" style="cursor:pointer;display:flex;align-items:center;gap:8px">
      <span style="font-size:var(--font-size-lg)">${d.icon}</span>
      <span style="font-weight:500">${d.name}</span>
    </div>`).join('');

  detect.querySelectorAll('.detect-choice').forEach(el => {
    el.addEventListener('click', () => {
      applyDetector(matches[Number(el.dataset.idx)], dataRows, headers, filename);
    });
  });
}

async function applyDetector(detector, dataRows, headers, filename) {
  detectedType = detector;
  saveFn = detector.save;

  // 좌측 감지 결과
  $('#uploadDetect').innerHTML = `<div class="dash-card" style="display:flex;align-items:center;gap:8px">
    <span style="font-size:var(--font-size-lg)">${detector.icon}</span>
    <div>
      <div style="font-weight:600">${detector.name}</div>
      <div style="font-size:10px;color:var(--c-text-muted)">${filename} · ${dataRows.length}행</div>
    </div>
  </div>`;

  // 원본 데이터 통합 저장소에 보관
  try {
    const upload = await saveUpload({
      filename,
      file_type: 'csv',
      detected_type: detector.name,
      detected_label: detector.name,
      row_count: dataRows.length,
      status: 'pending',
      fingerprint: fileFingerprint(filename, dataRows.length, dataRows[0]),
      rows: parsedRows.slice(0, 500).map(r => {
        const clean = {};
        Object.keys(r).forEach(k => { if (!k.startsWith('_')) clean[k] = r[k]; });
        return clean;
      }),
    });
    currentUploadId = upload.upload_id;
  } catch (e) { console.warn('[upload save]', e); }

  // 원본 행 데이터 (헤더 기준으로 객체화)
  const rawObjs = dataRows.map(row => {
    const obj = {};
    headers.forEach((h, i) => { if (h) obj[h] = row[i] || ''; });
    return obj;
  });

  // 파싱 (ERP용 추출)
  const parsed = detector.parse(dataRows, headers);

  // 원본 + 파싱 + 중복 + 매칭 합치기
  const isTransaction = detector.name.includes('통장') || detector.name.includes('카드');
  const matchCtx = { contracts: existingData.contracts, billings: existingData.billings, customers: existingData.customers, assets: existingData.assets };

  parsedRows = rawObjs.map((rawObj, i) => {
    const erpRow = parsed[i] || null;
    const dup = erpRow && detector.isDup ? detector.isDup(erpRow) : false;
    const match = erpRow && isTransaction ? matchEvent(erpRow, matchCtx) : null;
    return {
      ...rawObj,
      _erp: erpRow,
      _dup: dup,
      _matchStatus: match?.status || '',
      _matchCategory: match?.category || '',
      _matchReason: match?.reason || '',
      _matchBest: match?.best || null,
    };
  });

  const withErp = parsedRows.filter(r => r._erp);
  const newCount = withErp.filter(r => !r._dup).length;
  const dupCount = withErp.filter(r => r._dup).length;
  const autoCount = parsedRows.filter(r => r._matchStatus === 'auto').length;
  const unmatchCount = parsedRows.filter(r => r._matchStatus === 'unmatched').length;

  $('#uploadInfo').textContent = `${parsedRows.length}행`;
  $('#uploadDetectTitle').textContent = '데이터 미리보기';

  // 감지 결과 바 — ERP 어디에 반영할지
  const bar = $('#uploadDetectBar');
  bar.hidden = false;
  const targets = [];
  if (isTransaction && detector.name.includes('통장')) {
    targets.push({ label: '입출금내역', icon: '💰', desc: '계좌 거래 등록' });
    if (autoCount) targets.push({ label: '수납관리', icon: '📋', desc: `대여료 매칭 ${autoCount}건` });
  } else if (isTransaction && detector.name.includes('카드')) {
    targets.push({ label: '입출금내역', icon: '💳', desc: '카드 지출 등록' });
    targets.push({ label: '비용분류', icon: '📊', desc: '항목별 자동 분류' });
  } else if (detector.name.includes('자산')) {
    targets.push({ label: '자산관리', icon: '🚗', desc: '차량 등록' });
  } else if (detector.name.includes('계약')) {
    targets.push({ label: '계약관리', icon: '📋', desc: '계약 등록 + 고객 자동 생성' });
    targets.push({ label: '수납관리', icon: '💰', desc: '회차 자동 생성' });
  } else if (detector.name.includes('고객')) {
    targets.push({ label: '고객관리', icon: '👥', desc: '고객 등록' });
  }
  bar.innerHTML = `
    <span style="font-size:var(--font-size-lg)">${detector.icon}</span>
    <span style="font-weight:600">${detector.name}</span>
    <span style="color:var(--c-text-muted)">→</span>
    ${targets.map(t => `<span style="background:var(--c-primary-bg);color:var(--c-primary);padding:2px 8px;border-radius:var(--r-sm);font-size:11px;font-weight:500">${t.icon} ${t.label}</span>`).join('')}
    <span style="color:var(--c-text-muted);font-size:11px;margin-left:auto">${newCount}건 반영 예정${dupCount ? ` · ${dupCount}건 중복` : ''}</span>
  `;

  // 원본 컬럼 전체 — 틀고정 없이 좌우 스크롤
  const rawColumns = headers.filter(Boolean).map(h => ({
    headerName: h,
    field: h,
    width: 120,
  }));

  // AG Grid — 원본 그대로
  if (gridApi) gridApi.destroy();
  gridApi = agGrid.createGrid($('#uploadGrid'), {
  $('#uploadGrid')._agApi = gridApi;
    columnDefs: [
      { headerName: '#', valueGetter: 'node.rowIndex + 1', width: 45 },
      ...rawColumns,
    ],
    rowData: parsedRows,
    defaultColDef: { resizable: true, sortable: true, editable: false, minWidth: 50 },
    rowHeight: 28,
    headerHeight: 28,
    animateRows: false,
    suppressContextMenu: true,
    onGridReady: (params) => {
      params.api.autoSizeAllColumns();
    },
  });
}

function handleOcr(file) {
  $('#uploadDetect').innerHTML = `<div class="dash-card" style="display:flex;align-items:center;gap:8px">
    <span style="font-size:var(--font-size-lg)">📄</span>
    <div>
      <div style="font-weight:600">${file.name}</div>
      <div style="font-size:10px;color:var(--c-warn)">OCR 기능 준비 중 (Google Vision API 연동 예정)</div>
    </div>
  </div>`;
}

async function confirmUpload() {
  const newRows = parsedRows.filter(r => r._erp && !r._dup);
  if (!newRows.length || !saveFn) { showToast('반영할 신규 데이터가 없습니다', 'info'); return; }
  const dupSkip = parsedRows.filter(r => r._dup).length;
  if (!confirm(`신규 ${newRows.length}건 반영${dupSkip ? ` (중복 ${dupSkip}건 제외)` : ''}. 진행할까요?`)) return;

  $('#uploadConfirm').disabled = true;
  let ok = 0, fail = 0;
  for (const row of newRows) {
    try {
      await saveFn(row._erp);
      ok++;
    } catch (e) { console.error('[upload]', e); fail++; }
  }
  showToast(`반영 ${ok}건${fail ? ` · 실패 ${fail}` : ''}${dupSkip ? ` · 중복 제외 ${dupSkip}` : ''}`, ok ? 'success' : 'error');
  $('#uploadConfirm').disabled = false;

  // 업로드 이력 업데이트
  if (currentUploadId) {
    try {
      await updateUpload(currentUploadId, {
        status: fail ? 'partial' : 'processed',
        processed_at: Date.now(),
        results: { ok, fail, skip: dupSkip },
      });
    } catch (e) { console.warn('[upload update]', e); }
  }
}

export async function mount() {
  watchEvents((items) => { existingData.events = items; });
  watchAssets((items) => { existingData.assets = items; });
  watchContracts((items) => { existingData.contracts = items; });
  watchCustomers((items) => { existingData.customers = items; });
  watchBillings((items) => { existingData.billings = items; });

  const drop = $('#uploadDrop');
  const file = $('#uploadFile');

  drop?.addEventListener('click', () => file.click());
  file?.addEventListener('change', (e) => handleFiles(Array.from(e.target.files)));
  drop?.addEventListener('dragover', (e) => { e.preventDefault(); drop.style.background = 'var(--c-bg-hover)'; });
  drop?.addEventListener('dragleave', () => { drop.style.background = ''; });
  drop?.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.style.background = '';
    handleFiles(Array.from(e.dataTransfer.files));
  });

  $('#uploadReset')?.addEventListener('click', reset);
  $('#uploadConfirm')?.addEventListener('click', confirmUpload);
  $('#uploadUrlLoad')?.addEventListener('click', loadFromUrl);
  $('#uploadUrl')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadFromUrl(); });
}

async function loadFromUrl() {
  const url = ($('#uploadUrl')?.value || '').trim();
  if (!url) { showToast('URL을 입력하세요', 'error'); return; }
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) { showToast('구글시트 URL이 아닙니다', 'error'); return; }
  const id = m[1];
  const gidMatch = url.match(/[#?&]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : '0';
  try {
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (text.trim().startsWith('<')) throw new Error('시트가 비공개입니다 — 공유 → 링크가 있는 모든 사용자: 뷰어');
    handleCsv(text, '구글시트');
  } catch (e) {
    showToast(`불러오기 실패: ${e.message}`, 'error');
  }
}
