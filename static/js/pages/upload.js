/**
 * pages/upload.js — 업로드센터
 *
 * 아무 파일 던지면 자동 감지 → 확인 → 파싱 → AG Grid 검증 → 반영
 * CSV: 헤더로 유형 자동 판별 (통장/카드/자산/계약/고객)
 * PDF/이미지: 추후 OCR 연동
 */
import { parseCsv, mapHeaders } from '../widgets/csv-upload.js';
import { matchEvent } from '../core/match-engine.js';
import { ocrFile, extractCarNumber, extractVin, extractAmount, extractDate } from '../core/ocr.js';
import * as shinhanBank from '../data/bank-parsers/shinhan.js';
import * as shinhanCard from '../data/card-parsers/shinhan.js';
import { ASSET_SCHEMA } from '../data/schemas/asset.js';
import { normalizeAsset } from '../data/asset-normalize.js';
import { CONTRACT_SCHEMA } from '../data/schemas/contract.js';
import { CUSTOMER_SCHEMA } from '../data/schemas/customer.js';
import { MEMBER_SCHEMA } from '../data/schemas/member.js';
import { VENDOR_SCHEMA } from '../data/schemas/vendor.js';
import { upsertEventByRawKey, saveEvent } from '../firebase/events.js';
import { saveAsset } from '../firebase/assets.js';
import { saveContract } from '../firebase/contracts.js';
import { saveCustomer } from '../firebase/customers.js';
import { saveMember } from '../firebase/members.js';
import { saveVendor } from '../firebase/vendors.js';
import { watchAssets } from '../firebase/assets.js';
import { watchContracts } from '../firebase/contracts.js';
import { watchCustomers } from '../firebase/customers.js';
import { watchEvents } from '../firebase/events.js';
import { watchBillings, addPaymentToBilling } from '../firebase/billings.js';
import { watchMembers } from '../firebase/members.js';
import { watchVendors } from '../firebase/vendors.js';
import { saveUpload, updateUpload, fileFingerprint } from '../firebase/uploads.js';
import { uploadPenaltyFile } from '../firebase/file-storage.js';
import { showToast } from '../core/toast.js';

const $ = (s) => document.querySelector(s);
const fmt = (v) => Number(v || 0).toLocaleString('ko-KR');

/** 날짜 정규화 → YYYY-MM-DD */
function normalizeDate(s) {
  if (!s) return '';
  let v = String(s).trim().replace(/년|월/g, '-').replace(/일/g, '').replace(/[./]/g, '-').replace(/\s+/g, '').trim();
  if (/^\d{8}$/.test(v)) v = `${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6)}`;
  if (/^\d{6}$/.test(v)) { const y = Number(v.slice(0,2)); v = `${y<50?2000+y:1900+y}-${v.slice(2,4)}-${v.slice(4)}`; }
  const m2 = v.match(/^(\d{2})-(\d{1,2})-(\d{1,2})$/);
  if (m2) { const y = Number(m2[1]); v = `${y<50?2000+y:1900+y}-${String(m2[2]).padStart(2,'0')}-${String(m2[3]).padStart(2,'0')}`; }
  const m4 = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m4) v = `${m4[1]}-${String(m4[2]).padStart(2,'0')}-${String(m4[3]).padStart(2,'0')}`;
  return v;
}

/** 숫자 정규화 (콤마 제거) */
function normalizeNum(s) { return s ? String(s).replace(/,/g, '').trim() : ''; }

/** 스키마 기반 행 정규화 (날짜/숫자) */
function normalizeRow(obj, schema) {
  const dateCols = new Set(schema.filter(s => s.type === 'date').map(s => s.col));
  const numCols = new Set(schema.filter(s => s.num || s.type === 'number').map(s => s.col));
  for (const [k, v] of Object.entries(obj)) {
    if (v && dateCols.has(k)) obj[k] = normalizeDate(v);
    if (v && numCols.has(k)) obj[k] = normalizeNum(v);
  }
  return obj;
}

/** 스키마 기반 CSV 파싱 (날짜/숫자 정규화 포함) */
function parseWithSchema(rows, headers, schema) {
  const mapping = mapHeaders(headers, schema);
  return rows.map(row => {
    const obj = {};
    mapping.forEach((col, i) => { if (col) obj[col] = String(row[i] || '').trim(); });
    if (!Object.keys(obj).length) return null;
    return normalizeRow(obj, schema);
  }).filter(Boolean);
}
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
let existingData = { events: [], assets: [], contracts: [], customers: [], billings: [], members: [], vendors: [] };
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
    key: 'asset',
    icon: '🚗',
    schema: ASSET_SCHEMA,
    test: (headers) => {
      const mapped = mapHeaders(headers, ASSET_SCHEMA);
      return mapped.filter(Boolean).length >= 3;
    },
    parse: async (rows, headers) => {
      const mapping = mapHeaders(headers, ASSET_SCHEMA);
      const dateCols = new Set(ASSET_SCHEMA.filter(s => s.type === 'date').map(s => s.col));
      const results = [];
      for (const row of rows) {
        const obj = {};
        mapping.forEach((col, i) => {
          if (!col) return;
          let v = String(row[i] || '').trim();
          if (v && dateCols.has(col)) v = normalizeDate(v);
          obj[col] = v;
        });
        if (!Object.keys(obj).length) { results.push(null); continue; }
        const result = await normalizeAsset(obj);
        results.push(result?.data ?? obj);
      }
      return results.filter(Boolean);
    },
    columns: () => ASSET_SCHEMA.filter(s => s.gridShow !== false).slice(0, 10).map(s => ({
      headerName: s.label, field: s.col, width: 100,
    })),
    save: (row) => saveAsset(row),
    isDup: (row) => existingData.assets.some(a => (a.vin && a.vin === row.vin) || (a.car_number && a.car_number === row.car_number)),
    validate: (row) => {
      const errors = [];
      if (!row.car_number) errors.push('차량번호 누락');
      if (!row.vin) errors.push('차대번호 누락');
      else if (row.vin.length !== 17) errors.push(`차대번호 ${row.vin.length}자 (17자 필요)`);
      if (row.car_number && !/\d{2,3}[가-힣]\d{4}/.test(row.car_number)) errors.push('차량번호 형식 오류');
      if (row.car_year && !/^\d{4}$/.test(String(row.car_year).replace(/,/g, ''))) errors.push('연식 4자리');
      return errors;
    },
  },
  {
    name: '계약 데이터',
    key: 'contract',
    icon: '📋',
    schema: CONTRACT_SCHEMA,
    test: (headers) => {
      const mapped = mapHeaders(headers, CONTRACT_SCHEMA);
      return mapped.filter(Boolean).length >= 3;
    },
    parse: (rows, headers) => parseWithSchema(rows, headers, CONTRACT_SCHEMA),
    columns: () => CONTRACT_SCHEMA.filter(s => s.gridShow !== false).slice(0, 10).map(s => ({
      headerName: s.label, field: s.col, width: 100,
    })),
    save: (row) => saveContract(row),
    isDup: (row) => existingData.contracts.some(c => c.car_number === row.car_number && c.start_date === row.start_date),
    validate: (row) => {
      const errors = [];
      if (!row.car_number) errors.push('차량번호 누락');
      if (!row.contractor_name) errors.push('계약자명 누락');
      if (!row.start_date) errors.push('시작일 누락');
      if (!row.rent_amount) errors.push('대여료 누락');
      return errors;
    },
  },
  {
    name: '고객 데이터',
    key: 'customer',
    icon: '👥',
    schema: CUSTOMER_SCHEMA,
    test: (headers) => {
      const mapped = mapHeaders(headers, CUSTOMER_SCHEMA);
      return mapped.filter(Boolean).length >= 2;
    },
    parse: (rows, headers) => parseWithSchema(rows, headers, CUSTOMER_SCHEMA),
    columns: () => CUSTOMER_SCHEMA.map(s => ({
      headerName: s.label, field: s.col, width: 100,
    })),
    save: (row) => saveCustomer(row),
    isDup: (row) => existingData.customers.some(c => c.customer_reg_no && c.customer_reg_no === row.customer_reg_no),
    validate: (row) => {
      const errors = [];
      if (!row.customer_reg_no) errors.push('등록번호 누락');
      if (!row.code_name) errors.push('이름/상호 누락');
      return errors;
    },
  },
  {
    name: '회원사 데이터',
    key: 'member',
    icon: '🏢',
    schema: MEMBER_SCHEMA,
    test: (headers) => {
      const mapped = mapHeaders(headers, MEMBER_SCHEMA);
      return mapped.filter(Boolean).length >= 2;
    },
    parse: (rows, headers) => parseWithSchema(rows, headers, MEMBER_SCHEMA),
    columns: () => MEMBER_SCHEMA.filter(s => s.gridShow).map(s => ({
      headerName: s.label, field: s.col, width: 100,
    })),
    save: (row) => saveMember(row),
    isDup: (row) => existingData.members?.some(m => m.biz_no && m.biz_no === row.biz_no),
    validate: (row) => {
      const errors = [];
      if (!row.company_name) errors.push('회사명 누락');
      if (!row.biz_no) errors.push('사업자번호 누락');
      return errors;
    },
  },
  {
    name: '거래처 데이터',
    key: 'vendor',
    icon: '🤝',
    schema: VENDOR_SCHEMA,
    test: (headers) => {
      const mapped = mapHeaders(headers, VENDOR_SCHEMA);
      return mapped.filter(Boolean).length >= 2;
    },
    parse: (rows, headers) => parseWithSchema(rows, headers, VENDOR_SCHEMA),
    columns: () => VENDOR_SCHEMA.filter(s => s.gridShow).map(s => ({
      headerName: s.label, field: s.col, width: 100,
    })),
    save: (row) => saveVendor(row),
    isDup: (row) => existingData.vendors?.some(v => v.vendor_name === row.vendor_name),
  },
];

// 드롭다운 ↔ 스키마 안내
function updateSchemaInfo() {
  const sel = $('#uploadType');
  const info = $('#uploadSchemaInfo');
  if (!sel || !info) return;
  const val = sel.value;
  if (val === 'auto') {
    info.innerHTML = '<span style="color:var(--c-text-muted)">파일을 올리면 헤더를 분석하여 자동 감지합니다.</span>';
    return;
  }
  const det = DETECTORS.find(d => d.key === val);
  if (!det?.schema) { info.innerHTML = ''; return; }
  const cols = det.schema.filter(s => s.type !== 'file').map(s => s.required ? `<b>${s.label} *</b>` : s.label);
  info.innerHTML = cols.join(', ');
}

let _lastCsvText = null;
let _lastCsvFilename = null;

function reset() {
  detectedType = null;
  parsedRows = [];
  saveFn = null;
  _lastCsvText = null;
  _lastCsvFilename = null;
  if (gridApi) { gridApi.destroy(); gridApi = null; }
  $('#uploadGrid').innerHTML = '';
  $('#uploadFile').value = '';
  $('#uploadDetect').innerHTML = '';
  $('#uploadInfo').textContent = '파일을 업로드하세요';
  const bar = $('#uploadSummaryBar');
  if (bar) bar.hidden = true;
  updateSchemaInfo();
}

/** SheetJS 동적 로드 */
let _xlsxReady = null;
function loadXlsx() {
  if (_xlsxReady) return _xlsxReady;
  _xlsxReady = new Promise((resolve, reject) => {
    if (window.XLSX) { resolve(window.XLSX); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => { _xlsxReady = null; reject(new Error('XLSX 로드 실패')); };
    document.head.appendChild(s);
  });
  return _xlsxReady;
}

async function handleFiles(files) {
  if (!files.length) return;
  // 여러 파일 → 순차 처리
  for (const file of files) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (['csv'].includes(ext)) {
      const text = await file.text();
      handleCsv(text, file.name);
    } else if (['xlsx', 'xls'].includes(ext)) {
      await handleExcel(file);
    } else if (['pdf', 'png', 'jpg', 'jpeg', 'heic', 'webp'].includes(ext)) {
      handleOcr(file);
    } else {
      showToast(`지원하지 않는 형식: ${file.name}`, 'error');
    }
  }
}

async function handleExcel(file) {
  try {
    const XLSX = await loadXlsx();
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (rows.length < 2) { showToast('데이터 행이 없습니다', 'error'); return; }
    // CSV와 동일하게 처리
    const headers = rows[0].map(h => String(h || '').trim());
    const dataRows = rows.slice(1).filter(r => r.some(c => String(c || '').trim()));
    // 내부적으로 CSV 텍스트 생성 (재파싱용)
    const csvText = [headers, ...dataRows].map(r => r.map(c => `"${String(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    handleCsv(csvText, file.name);
  } catch (e) {
    showToast(`엑셀 파싱 실패: ${e.message}`, 'error');
  }
}

function handleCsv(text, filename) {
  _lastCsvText = text;
  _lastCsvFilename = filename;
  const rows = parseCsv(text);
  if (rows.length < 2) { showToast('데이터 행이 없습니다', 'error'); return; }
  const headers = rows[0].map(h => String(h || '').trim());
  const dataRows = rows.slice(1);

  // 드롭다운 강제 선택 우선
  const typeVal = $('#uploadType')?.value || 'auto';
  if (typeVal !== 'auto') {
    const forced = DETECTORS.find(d => d.key === typeVal);
    if (forced) {
      applyDetector(forced, dataRows, headers, filename);
      return;
    }
  }

  // 자동 감지
  const matches = DETECTORS.filter(d => d.test(headers));
  const detect = $('#uploadDetect');

  if (matches.length === 0) {
    detect.innerHTML = `<div class="dash-card" style="color:var(--c-danger)">
      <div style="font-weight:600">감지 실패</div>
      <div style="font-size:11px;color:var(--c-text-muted)">헤더를 인식할 수 없습니다: ${headers.slice(0, 5).join(', ')}...</div>
      <div style="font-size:11px;color:var(--c-text-muted);margin-top:4px">좌측 드롭다운에서 데이터 종류를 직접 선택해보세요.</div>
    </div>`;
    return;
  }

  if (matches.length === 1) {
    // 드롭다운도 감지된 것으로 맞춰줌
    if (matches[0].key && $('#uploadType')) $('#uploadType').value = matches[0].key;
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
      const det = matches[Number(el.dataset.idx)];
      if (det.key && $('#uploadType')) $('#uploadType').value = det.key;
      applyDetector(det, dataRows, headers, filename);
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
  const parsed = await detector.parse(dataRows, headers);

  // 원본 + 파싱 + 중복 + 매칭 합치기
  const isTransaction = detector.name.includes('통장') || detector.name.includes('카드');
  const matchCtx = { contracts: existingData.contracts, billings: existingData.billings, customers: existingData.customers, assets: existingData.assets };

  // 자체 중복 체크용 Set (파일 내 중복)
  const seenKeys = new Set();
  const getKey = detector.schema
    ? (row) => {
        if (detector.key === 'asset') return row.vin || row.car_number || '';
        if (detector.key === 'contract') return `${row.car_number}_${row.start_date}`;
        if (detector.key === 'customer') return row.customer_reg_no || '';
        if (detector.key === 'member') return row.biz_no || '';
        if (detector.key === 'vendor') return row.vendor_name || '';
        return '';
      }
    : () => '';

  parsedRows = rawObjs.map((rawObj, i) => {
    const erpRow = parsed[i] || null;
    // DB 중복
    const dbDup = erpRow && detector.isDup ? detector.isDup(erpRow) : false;
    // 파일 내 자체 중복
    let selfDup = false;
    if (erpRow) {
      const k = getKey(erpRow);
      if (k && seenKeys.has(k)) selfDup = true;
      if (k) seenKeys.add(k);
    }
    // 검증 오류
    const errors = (erpRow && detector.validate) ? detector.validate(erpRow) : [];
    // 매칭
    const match = erpRow && isTransaction ? matchEvent(erpRow, matchCtx) : null;
    // 상태 결정
    let _status = '신규', _statusColor = 'var(--c-success)';
    if (!erpRow) { _status = '파싱실패'; _statusColor = 'var(--c-text-muted)'; }
    else if (errors.length) { _status = '오류'; _statusColor = 'var(--c-warn)'; }
    else if (dbDup) { _status = 'DB중복'; _statusColor = 'var(--c-danger)'; }
    else if (selfDup) { _status = '파일중복'; _statusColor = '#e040fb'; }

    return {
      ...rawObj,
      _erp: erpRow,
      _dup: dbDup || selfDup,
      _status,
      _statusColor,
      _errors: errors.join(' / '),
      _matchStatus: match?.status || '',
      _matchCategory: match?.category || '',
      _matchReason: match?.reason || '',
      _matchBest: match?.best || null,
    };
  });

  const withErp = parsedRows.filter(r => r._erp);
  const newCount = withErp.filter(r => r._status === '신규').length;
  const dupCount = withErp.filter(r => r._status === 'DB중복').length;
  const selfDupCount = withErp.filter(r => r._status === '파일중복').length;
  const errorCount = withErp.filter(r => r._status === '오류').length;
  const autoCount = parsedRows.filter(r => r._matchStatus === 'auto').length;
  const unmatchCount = parsedRows.filter(r => r._matchStatus === 'unmatched').length;

  $('#uploadInfo').textContent = `${parsedRows.length}행`;
  $('#uploadDetectTitle').textContent = '데이터 미리보기';

  // 감지 결과 바 — ERP 어디에 반영할지
  const bar = $('#uploadSummaryBar');
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
    <span style="color:var(--c-text-muted);font-size:11px;margin-left:auto">
      <span style="color:var(--c-success);font-weight:600">신규 ${newCount}</span>${dupCount ? ` · <span style="color:var(--c-danger)">DB중복 ${dupCount}</span>` : ''}${selfDupCount ? ` · <span style="color:#e040fb">파일중복 ${selfDupCount}</span>` : ''}${errorCount ? ` · <span style="color:var(--c-warn)">오류 ${errorCount}</span>` : ''}
    </span>
  `;

  // 스키마 있는 유형(자산/계약/고객/회원사/거래처)이면 정규화된 _erp 값으로 표시
  const hasSchema = !!detector.schema;
  let gridColumns, gridData;

  if (hasSchema) {
    const schema = detector.schema.filter(s => s.type !== 'file');
    gridColumns = [
      { headerName: '#', valueGetter: 'node.rowIndex + 1', width: 45 },
      { headerName: '상태', field: '_status', width: 70,
        cellStyle: p => ({ color: '#fff', background: p.data._statusColor || 'var(--c-success)', textAlign: 'center', fontWeight: 600 }) },
      { headerName: '검증', field: '_errors', width: 180,
        cellStyle: p => p.value ? { color: 'var(--c-danger)', fontSize: '11px' } : {} },
      ...schema.slice(0, 20).map(s => ({
        headerName: s.label + (s.required ? ' *' : ''),
        field: s.col,
        width: s.num ? 90 : 120,
        valueGetter: p => p.data._erp?.[s.col] ?? p.data[s.col] ?? '',
        ...(s.num ? { type: 'numericColumn', valueFormatter: p => p.value ? Number(p.value).toLocaleString() : '' } : {}),
      })),
    ];
    gridData = parsedRows;
  } else {
    // 원본 컬럼 (통장/카드 등)
    const rawColumns = headers.filter(Boolean).map(h => ({ headerName: h, field: h, width: 120 }));
    gridColumns = [
      { headerName: '#', valueGetter: 'node.rowIndex + 1', width: 45 },
      ...rawColumns,
    ];
    gridData = parsedRows;
  }

  if (gridApi) gridApi.destroy();
  gridApi = agGrid.createGrid($('#uploadGrid'), {
    columnDefs: gridColumns,
    rowData: gridData,
    defaultColDef: { resizable: true, sortable: true, editable: false, minWidth: 50 },
    rowHeight: 28,
    headerHeight: 28,
    animateRows: false,
    suppressContextMenu: true,
    onGridReady: (params) => {
      params.api.autoSizeAllColumns();
    },
  });
  $('#uploadGrid')._agApi = gridApi;
}

async function handleOcr(file) {
  const detectEl = $('#uploadDetect');
  detectEl.innerHTML = `<div class="dash-card" style="display:flex;align-items:center;gap:8px">
    <span style="font-size:var(--font-size-lg)">⏳</span>
    <div><div style="font-weight:600">${file.name}</div><div style="font-size:var(--font-size-xs);color:var(--c-text-muted)">OCR 분석 중...</div></div>
  </div>`;

  try {
    const result = await ocrFile(file);

    // 페이지별 텍스트 분리 (pdf.js가 구분자 넣음)
    const pageTexts = result.text.split('--- 페이지 구분 ---').map(t => t.trim()).filter(Boolean);
    // 한 페이지짜리면 전체 텍스트 사용
    const texts = pageTexts.length ? pageTexts : [result.text];

    // 과태료 파서
    let penaltyModule;
    try { penaltyModule = await import('../data/ocr-parsers/penalty.js'); } catch {}

    // 각 페이지/문서별로 파싱
    const ocrRows = [];
    for (let i = 0; i < texts.length; i++) {
      const txt = texts[i];
      const lines = txt.split('\n').map(l => l.trim()).filter(Boolean);
      const carNo = extractCarNumber(txt);
      const isPenalty = penaltyModule?.detect(txt);

      if (isPenalty) {
        console.log(`[OCR 페이지 ${i+1}] 원문:`, txt);
        const p = penaltyModule.parse(txt, lines);
        console.log(`[OCR 페이지 ${i+1}] 파싱 결과:`, p);
        const carNum = p.car_number;
        // 차량번호 → 자산 매칭
        const asset = carNum ? existingData.assets.find(a => a.car_number === carNum) : null;
        // 차량번호 → 현재 계약 (해지 아닌 것)
        const contract = carNum ? existingData.contracts.find(c => c.car_number === carNum && c.contract_status !== '계약해지') : null;
        // 차량번호 → 과태료 이력 (기존 events에서 조회)
        const prevPenalties = carNum ? existingData.events.filter(e => e.car_number === carNum && e.event_type === 'penalty') : [];
        const penaltyCount = prevPenalties.length;

        // 중복 체크: 고지서번호 또는 (차량번호 + 위반일) 매칭
        const dateOnly = (p.date || '').split(' ')[0];
        const isDup = prevPenalties.some(e =>
          (p.notice_no && e.notice_no === p.notice_no) ||
          (carNum && dateOnly && e.car_number === carNum && (e.date || '').startsWith(dateOnly))
        );

        ocrRows.push({
          _page: i + 1,
          _type: p.doc_type || '과태료',
          _saved: false,
          _dup: isDup,
          _dup_label: isDup ? '중복' : '신규',
          ...p,
          car_info: asset ? `${asset.manufacturer || ''} ${asset.car_model || ''}` : '미등록',
          partner_code: asset?.partner_code || '',
          customer_name: contract?.contractor_name || '',
          customer_phone: contract?.contractor_phone || '',
          contract_code: contract?.contract_code || '',
          vin: asset?.vin || '',
          history_count: penaltyCount,
          history_label: penaltyCount ? `${penaltyCount + 1}번째` : '최초',
          _text: txt,
        });
      } else if (carNo) {
        const vin = extractVin(txt);
        const amount = extractAmount(txt);
        const date = extractDate(txt);
        ocrRows.push({
          _page: i + 1,
          _type: '문서',
          _saved: false,
          doc_type: '문서',
          car_number: carNo,
          car_info: '',
          payer_name: '',
          date: date || '',
          location: '',
          description: '',
          penalty_amount: amount || 0,
          fine_amount: 0,
          demerit_points: 0,
          toll_amount: 0,
          law_article: '',
          due_date: '',
          notice_no: vin || '',
          issuer: '',
          issue_date: '',
          pay_account: '',
          customer_name: '',
          _text: txt,
        });
      }
    }

    // 좌측: 간단 요약
    const penaltyCount = ocrRows.filter(r => r._type === '과태료').length;
    const docCount = ocrRows.filter(r => r._type === '문서').length;
    detectEl.innerHTML = `<div class="dash-card" style="display:flex;align-items:center;gap:8px">
      <span style="font-size:var(--font-size-lg)">${penaltyCount ? '🚫' : '📄'}</span>
      <div>
        <div style="font-weight:600">${file.name}</div>
        <div style="font-size:var(--font-size-xs);color:var(--c-success)">OCR 완료 · ${texts.length}페이지</div>
        ${penaltyCount ? `<div style="font-size:var(--font-size-xs)">과태료 ${penaltyCount}건 감지</div>` : ''}
        ${docCount ? `<div style="font-size:var(--font-size-xs)">문서 ${docCount}건</div>` : ''}
      </div>
    </div>`;

    // 우측: 그리드에 행으로 표시
    parsedRows = ocrRows;
    // 원본 파일 참조 저장
    const _ocrFile = file;

    saveFn = async (row) => {
      // 원본 파일 Storage 업로드
      let fileUrl = '';
      try {
        const dateStr = (row.date || '').split(' ')[0] || new Date().toISOString().split('T')[0];
        fileUrl = await uploadPenaltyFile(_ocrFile, row.car_number || 'unknown', dateStr);
      } catch (e) { console.warn('[file upload]', e); }

      await saveEvent({
        file_url: fileUrl,
        event_type: 'penalty',
        doc_type: row.doc_type || row._type,
        car_number: row.car_number,
        vin: row.vin || '',
        date: (row.date || '').split(' ')[0],
        title: row.description || row.doc_type || '과태료',
        penalty_amount: row.penalty_amount || 0,
        fine_amount: row.fine_amount || 0,
        demerit_points: row.demerit_points || 0,
        toll_amount: row.toll_amount || 0,
        amount: row.amount || row.penalty_amount || row.toll_amount || 0,
        location: row.location,
        description: row.description,
        law_article: row.law_article || '',
        due_date: row.due_date,
        notice_no: row.notice_no,
        issuer: row.issuer,
        issue_date: row.issue_date || '',
        payer_name: row.payer_name || '',
        pay_account: row.pay_account || '',
        customer_name: row.customer_name || '',
        contract_code: row.contract_code || '',
        paid_status: '미납',
        direction: 'out',
        note: `OCR 자동 추출 (${file.name} p.${row._page})`,
      });
    };
    detectedType = { name: '과태료 (OCR)', isDup: (row) => row._dup };

    const fmtAmt = p => p.value ? Number(p.value).toLocaleString() : '';
    const columnDefs = [
      { headerName: '#', valueGetter: 'node.rowIndex + 1', width: 40 },
      // ── 핵심 ──
      { headerName: '중복', field: '_dup_label', width: 60,
        cellStyle: p => p.value === '중복' ? { color: '#fff', background: 'var(--c-danger)', fontWeight: 600, textAlign: 'center' } : { color: 'var(--c-success)', textAlign: 'center' } },
      { headerName: '차량번호', field: 'car_number', width: 100 },
      { headerName: '위반일시', field: 'date', width: 130 },
      { headerName: '위반내용', field: 'description', width: 200 },
      { headerName: '금액', field: 'amount', width: 90, type: 'numericColumn', valueFormatter: fmtAmt,
        cellStyle: { color: 'var(--c-danger)', fontWeight: 600 } },
      { headerName: '부과기관', field: 'issuer', width: 120 },
      { headerName: '납부계좌', field: 'pay_account', width: 160 },
      // ── 매칭 정보 ──
      { headerName: '차량정보', field: 'car_info', width: 120 },
      { headerName: '계약자(운전자)', field: 'customer_name', width: 110 },
      { headerName: '이력', field: 'history_label', width: 70,
        cellStyle: p => p.value === '최초' ? {} : { color: 'var(--c-danger)', fontWeight: 600 } },
      // ── 부가 ──
      { headerName: '유형', field: 'doc_type', width: 70 },
      { headerName: '납부기한', field: 'due_date', width: 100 },
      { headerName: '과태료', field: 'penalty_amount', width: 85, type: 'numericColumn', valueFormatter: fmtAmt },
      { headerName: '범칙금', field: 'fine_amount', width: 85, type: 'numericColumn', valueFormatter: fmtAmt },
      { headerName: '벌점', field: 'demerit_points', width: 55, type: 'numericColumn' },
      { headerName: '통행료', field: 'toll_amount', width: 85, type: 'numericColumn', valueFormatter: fmtAmt },
      { headerName: '적용법조', field: 'law_article', width: 140 },
      { headerName: '고지서번호', field: 'notice_no', width: 160 },
      { headerName: '납부자', field: 'payer_name', width: 140 },
      { headerName: '발행일', field: 'issue_date', width: 90 },
      { headerName: '연락처', field: 'customer_phone', width: 110 },
      { headerName: '장소', field: 'location', width: 180 },
    ];

    if (gridApi) gridApi.destroy();
    gridApi = agGrid.createGrid($('#uploadGrid'), {
      columnDefs,
      rowData: ocrRows,
      defaultColDef: { resizable: true, sortable: true, editable: false, minWidth: 40 },
      rowHeight: 32,
      headerHeight: 28,
      animateRows: false,
      suppressContextMenu: true,
      onGridReady: p => p.api.autoSizeAllColumns(),
    });
    $('#uploadGrid')._agApi = gridApi;

    const bar = $('#uploadSummaryBar');
    bar.hidden = false;
    bar.innerHTML = `
      <span style="font-size:var(--font-size-lg)">🚫</span>
      <span style="font-weight:600">과태료 (OCR)</span>
      <span style="color:var(--c-text-muted)">→</span>
      <span style="background:var(--c-primary-bg);color:var(--c-primary);padding:2px 8px;border-radius:var(--r-sm);font-size:11px;font-weight:500">운영관리</span>
      <span style="color:var(--c-text-muted);font-size:11px;margin-left:auto">${ocrRows.length}건</span>`;

    $('#uploadInfo').textContent = `OCR 완료 · ${ocrRows.length}건`;
    $('#uploadDetectTitle').textContent = '데이터 미리보기';

  } catch (e) {
    detectEl.innerHTML = `<div class="dash-card" style="color:var(--c-danger)">
      <div style="font-weight:600">OCR 실패</div>
      <div style="font-size:var(--font-size-xs)">${e.message}</div>
    </div>`;
    showToast(`OCR 실패: ${e.message}`, 'error');
  }
}

async function confirmUpload() {
  // OCR 행 (과태료 등): _erp 없이 row 자체가 데이터
  const isOcr = parsedRows.some(r => r._type);
  const newRows = isOcr
    ? parsedRows.filter(r => !r._saved)
    : parsedRows.filter(r => r._erp && !r._dup);

  if (!newRows.length || !saveFn) { showToast('반영할 신규 데이터가 없습니다', 'info'); return; }
  const dupSkip = parsedRows.filter(r => r._dup).length;
  if (!confirm(`신규 ${newRows.length}건 반영${dupSkip ? ` (중복 ${dupSkip}건 제외)` : ''}. 진행할까요?`)) return;

  $('#uploadConfirm').disabled = true;
  let ok = 0, fail = 0;
  for (const row of newRows) {
    try {
      const payload = isOcr ? row : row._erp;
      const saved = await saveFn(payload);
      if (isOcr) row._saved = true;
      // 자동매칭된 입금 → billings에 payment 추가
      if (!isOcr && row._matchStatus === 'auto' && row._matchBest?.billing_id && row._erp?.direction === 'in') {
        try {
          await addPaymentToBilling(row._matchBest.billing_id, {
            date: row._erp.date,
            method: row._erp.summary || '자동매칭',
            amount: row._erp.amount,
            source_event_id: saved?.event_id || '',
            note: `통장 자동매칭: ${row._erp.counterparty || ''}`,
          });
        } catch (e) { console.warn('[billing payment]', e); }
      }
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
  watchMembers((items) => { existingData.members = items; });
  watchVendors((items) => { existingData.vendors = items; });

  const drop = $('#uploadDrop');
  const file = $('#uploadFile');

  // label이 input을 감싸므로 별도 click 불필요
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

  // 드롭다운 변경 → 스키마 안내 갱신 + 이미 로드된 데이터 있으면 재파싱
  $('#uploadType')?.addEventListener('change', () => {
    updateSchemaInfo();
    if (_lastCsvText) handleCsv(_lastCsvText, _lastCsvFilename || '재분석');
  });
  updateSchemaInfo();

  // 헤더 복사 / 샘플 다운로드
  $('#uploadCopyHead')?.addEventListener('click', async () => {
    const typeVal = $('#uploadType')?.value || 'auto';
    const det = DETECTORS.find(d => d.key === typeVal);
    if (!det?.schema) { showToast('데이터 종류를 선택하세요', 'info'); return; }
    const schema = det.schema.filter(s => s.type !== 'file');
    const headers = schema.map(s => s.label || s.col);
    const samples = schema.map(s => s.sample || '');
    const plain = headers.join('\t') + '\n' + samples.join('\t');
    const thCells = headers.map(h => `<td style="font-weight:bold;background:#1b2a4a;color:#fff;padding:4px 8px">${h}</td>`).join('');
    const tdCells = samples.map(v => `<td style="background:#e8f0fe;color:#666;padding:4px 8px">${v}</td>`).join('');
    const html = `<table><tr>${thCells}</tr><tr>${tdCells}</tr></table>`;
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      })]);
      showToast(`${headers.length}개 컬럼 + 샘플행 복사됨`, 'success');
    } catch {
      await navigator.clipboard.writeText(plain);
      showToast(`${headers.length}개 컬럼 복사됨`, 'success');
    }
  });

  $('#uploadSample')?.addEventListener('click', () => {
    const typeVal = $('#uploadType')?.value || 'auto';
    const det = DETECTORS.find(d => d.key === typeVal);
    if (!det?.schema) { showToast('데이터 종류를 선택하세요', 'info'); return; }
    const schema = det.schema.filter(s => s.type !== 'file');
    const headers = schema.map(s => s.label || s.col);
    const samples = schema.map(s => s.sample || '');
    const csv = headers.join(',') + '\n' + samples.join(',');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${det.name}_sample.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
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
