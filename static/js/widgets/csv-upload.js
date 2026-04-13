/**
 * csv-upload.js — CSV/구글시트 업로드 모달
 *
 * 사용:
 *   openCsvUpload({
 *     title: '자산 일괄 업로드',
 *     schema: ASSET_SCHEMA,
 *     onRow: async (row) => { await saveAsset(row); },
 *     transform: (row) => ({ data: row, messages: [] }), // 선택
 *   });
 *
 * - 헤더는 col / label / "label (col)" 모두 인식
 * - 시트 URL 또는 CSV 파일 모두 지원
 * - 미리보기 → 확인 → 결과 표시
 */

/**
 * 날짜 문자열 자동 정규화 → YYYY-MM-DD
 * 지원: 2024-03-15, 2024.03.15, 2024/03/15, 20240315,
 *       24-3-15, 24.3.15, 240315, 2024년3월15일 등
 */
function _normalizeDate(s) {
  if (!s) return '';
  let v = String(s).trim()
    .replace(/년|월/g, '-').replace(/일/g, '')  // 한글
    .replace(/[./]/g, '-')                       // 구분자 통일
    .replace(/\s+/g, '')                         // 공백 제거
    .trim();
  // 숫자만 8자리: 20240315
  if (/^\d{8}$/.test(v)) v = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6)}`;
  // 숫자만 6자리: 240315
  if (/^\d{6}$/.test(v)) {
    const y = Number(v.slice(0, 2));
    v = `${y < 50 ? 2000 + y : 1900 + y}-${v.slice(2, 4)}-${v.slice(4)}`;
  }
  // YY-M-D or YY-MM-DD
  const m2 = v.match(/^(\d{2})-(\d{1,2})-(\d{1,2})$/);
  if (m2) {
    const y = Number(m2[1]);
    v = `${y < 50 ? 2000 + y : 1900 + y}-${m2[2].padStart(2, '0')}-${m2[3].padStart(2, '0')}`;
  }
  // YYYY-M-D → YYYY-MM-DD
  const m4 = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m4) v = `${m4[1]}-${m4[2].padStart(2, '0')}-${m4[3].padStart(2, '0')}`;
  return v;
}

import { showToast } from '../core/toast.js';

// ─── CSV 파서 (RFC 4180 최소) ─────────────────────────────
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\r') { /* skip */ }
      else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += ch;
    }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}

// 헤더 한 줄 → 컬럼 코드 배열
export function mapHeaders(headerRow, schema) {
  const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, '').replace(/\([^)]*\)/g, '');
  return headerRow.map(h => {
    if (!h) return null;
    const m = String(h).match(/\(([^)]+)\)/);
    const inside = m ? m[1].trim() : '';
    const outside = m ? String(h).replace(/\s*\([^)]+\)\s*/, '').trim() : String(h).trim();
    for (const t of [outside, inside, h].filter(Boolean)) {
      const found = schema.find(s => s.col === t || s.label === t);
      if (found) return found.col;
    }
    const nh = norm(h);
    const found = schema.find(s => norm(s.col) === nh || norm(s.label) === nh);
    return found ? found.col : null;
  });
}

// ─── 모달 DOM ─────────────────────────────────────────────
let _host = null;
let _state = null;

function ensureHost() {
  if (_host) return _host;
  _host = document.createElement('div');
  _host.className = 'modal-host';
  _host.hidden = true;
  _host.innerHTML = `
    <div class="modal" style="width:720px">
      <div class="panel-head">
        <div class="panel-title" id="csvTitle">CSV 업로드</div>
        <button class="btn btn-icon" id="csvClose" title="닫기">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>
      <div class="panel-body is-pad" style="display:flex;flex-direction:column;gap:14px">
        <div id="csvStep1">
          <div id="csvSchemaInfo" style="background:var(--c-bg-sub);border:1px solid var(--c-border);border-radius:var(--r-sm);padding:10px 12px;font-size:var(--font-size-sm);margin-bottom:12px"></div>
          <div style="display:flex;gap:6px;margin-bottom:10px">
            <button class="btn" id="csvCopyHead" style="flex:1">헤더 복사</button>
            <button class="btn" id="csvSample" style="flex:1">샘플 CSV</button>
          </div>
          <div style="display:flex;gap:6px;margin-bottom:10px">
            <button class="btn csv-tab is-active" data-tab="sheet" style="flex:1">구글 시트</button>
            <button class="btn csv-tab" data-tab="file" style="flex:1">CSV 파일</button>
          </div>
          <div id="csvTabSheet">
            <input type="url" id="csvSheetUrl" placeholder="구글 시트 URL" style="width:100%;height:32px;padding:0 12px;border:1px solid var(--c-border);border-radius:var(--r-sm);font-size:var(--font-size);outline:none">
            <div style="font-size:var(--font-size-sm);color:var(--c-text-muted);margin:6px 0">시트 공유 → <b>링크가 있는 모든 사용자: 뷰어</b></div>
            <button class="btn btn-primary" id="csvSheetLoad" style="width:100%">시트 불러오기</button>
          </div>
          <div id="csvTabFile" hidden>
            <label id="csvDrop" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:20px;border:2px dashed var(--c-border-strong);border-radius:var(--r-md);background:var(--c-bg-sub);color:var(--c-text-muted);cursor:pointer">
              <input type="file" id="csvFile" accept=".csv,text/csv" hidden>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <div id="csvDropText">CSV 파일 선택 또는 드래그</div>
            </label>
          </div>
        </div>

        <div id="csvStep2" hidden>
          <div id="csvPreviewInfo" style="font-size:var(--font-size-sm);color:var(--c-text-sub);margin-bottom:8px"></div>
          <div style="max-height:280px;overflow:auto;border:1px solid var(--c-border);border-radius:var(--r-sm)">
            <table class="grid-table" id="csvPreviewTable"></table>
          </div>
          <div id="csvResult" hidden style="margin-top:10px"></div>
          <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:10px">
            <button class="btn" id="csvBack">초기화</button>
            <button class="btn btn-primary" id="csvConfirm">업로드 시작</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(_host);

  // 닫기 — 모달 바깥 또는 X
  _host.addEventListener('click', (e) => { if (e.target === _host) close(); });
  _host.querySelector('#csvClose').addEventListener('click', close);

  // 탭
  _host.querySelectorAll('.csv-tab').forEach(t => {
    t.addEventListener('click', () => {
      _host.querySelectorAll('.csv-tab').forEach(x => x.classList.toggle('is-active', x === t));
      _host.querySelector('#csvTabSheet').hidden = t.dataset.tab !== 'sheet';
      _host.querySelector('#csvTabFile').hidden = t.dataset.tab !== 'file';
    });
  });

  _host.querySelector('#csvCopyHead').addEventListener('click', copyHeaders);
  _host.querySelector('#csvSample').addEventListener('click', downloadSample);
  _host.querySelector('#csvSheetLoad').addEventListener('click', loadSheet);
  _host.querySelector('#csvSheetUrl').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadSheet(); });

  const fileInput = _host.querySelector('#csvFile');
  const drop = _host.querySelector('#csvDrop');
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    _host.querySelector('#csvDropText').textContent = file.name;
    handleText(await file.text());
  });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.style.background = 'var(--c-bg-hover)'; });
  drop.addEventListener('dragleave', () => { drop.style.background = 'var(--c-bg-sub)'; });
  drop.addEventListener('drop', async (e) => {
    e.preventDefault();
    drop.style.background = 'var(--c-bg-sub)';
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    _host.querySelector('#csvDropText').textContent = file.name;
    handleText(await file.text());
  });

  _host.querySelector('#csvBack').addEventListener('click', resetState);
  _host.querySelector('#csvConfirm').addEventListener('click', runUpload);

  return _host;
}

export function openCsvUpload({ title, schema, onRow, transform, validate }) {
  const el = ensureHost();
  _state = { schema, onRow, transform, validate, parsed: null, mapping: null };
  el.querySelector('#csvTitle').textContent = title || 'CSV 업로드';
  el.querySelector('#csvSchemaInfo').innerHTML = renderSchemaInfo(schema);
  el.querySelector('#csvStep1').hidden = false;
  el.querySelector('#csvStep2').hidden = true;
  el.querySelector('#csvResult').hidden = true;
  el.querySelector('#csvSheetUrl').value = '';
  el.querySelector('#csvFile').value = '';
  el.querySelector('#csvDropText').textContent = 'CSV 파일 선택 또는 드래그';
  el.hidden = false;
}

function close() {
  if (_host) _host.hidden = true;
  _state = null;
}

function resetState() {
  if (!_state) return;
  _state.parsed = null;
  _state.mapping = null;
  _host.querySelector('#csvStep1').hidden = false;
  _host.querySelector('#csvStep2').hidden = true;
  _host.querySelector('#csvResult').hidden = true;
}

function renderSchemaInfo(schema) {
  const cols = schema.map(s => s.required ? `${s.label || s.col} *` : (s.label || s.col));
  return `<div>${cols.join(', ')}</div>`;
}

function copyHeaders() {
  const schema = _state.schema.filter(s => s.type !== 'file');
  const headers = schema.map(s => s.label || s.col);
  const samples = schema.map(s => s.sample || '');
  // plain text (탭 구분 2행)
  const plain = headers.join('\t') + '\n' + samples.join('\t');
  // HTML: 1행 헤더(굵게), 2행 샘플(연한 파랑 배경)
  const thCells = headers.map(h => `<td style="font-weight:bold;background:#1b2a4a;color:#fff;padding:4px 8px">${h}</td>`).join('');
  const tdCells = samples.map(v => `<td style="background:#e8f0fe;color:#666;padding:4px 8px">${v}</td>`).join('');
  const html = `<table><tr>${thCells}</tr><tr>${tdCells}</tr></table>`;
  const blob = new Blob([html], { type: 'text/html' });
  const plainBlob = new Blob([plain], { type: 'text/plain' });
  navigator.clipboard.write([new ClipboardItem({ 'text/html': blob, 'text/plain': plainBlob })])
    .then(() => showToast(`${headers.length}개 컬럼 + 샘플행 복사됨`, 'success'))
    .catch(() => {
      // fallback: plain text만
      navigator.clipboard.writeText(plain)
        .then(() => showToast(`${headers.length}개 컬럼 + 샘플행 복사됨`, 'success'))
        .catch(() => showToast('클립보드 접근 실패', 'error'));
    });
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

async function downloadSample() {
  const schema = _state.schema.filter(s => s.type !== 'file');
  const headers = schema.map(s => s.label || s.col);
  const samples = schema.map(s => s.sample || '');

  let XLSX;
  try { XLSX = await loadXlsx(); } catch {
    const csv = headers.join(',') + '\n' + samples.join(',');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'sample.csv'; a.click();
    return;
  }

  // 차량 데이터 (동적 import — 있을 때만)
  let carData = null;
  try { carData = await import('../data/car-models.js'); } catch { /* 없으면 무시 */ }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, samples]);
  ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length * 2, 12) }));

  // ── 목록 시트 생성 (제조사 / 모델 / 세부모델 / 차종) ──
  if (carData) {
    const makers = carData.getMakers();
    const allModels = [...new Set(carData.CAR_MODELS.map(m => m.model))];
    const allSubs = [...new Set(carData.CAR_MODELS.map(m => m.sub))];
    const allCategories = [...new Set(carData.CAR_MODELS.map(m => m.category).filter(Boolean))];
    const maxLen = Math.max(makers.length, allModels.length, allSubs.length, allCategories.length);
    const listData = [['제조사', '모델', '세부모델', '차종']];
    for (let i = 0; i < maxLen; i++) {
      listData.push([makers[i] || '', allModels[i] || '', allSubs[i] || '', allCategories[i] || '']);
    }
    const wsList = XLSX.utils.aoa_to_sheet(listData);
    wsList['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 36 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsList, '목록');
  }

  // ── 드롭다운 (데이터 유효성) ──
  const validations = [];
  schema.forEach((s, ci) => {
    const ref = XLSX.utils.encode_range({ s: { r: 2, c: ci }, e: { r: 999, c: ci } });
    // select 옵션이 있는 컬럼
    if (s.type === 'select' && s.options?.length) {
      validations.push({ sqref: ref, type: 'list', formula1: `"${s.options.join(',')}"`, allowBlank: true });
    }
    // 차량 데이터 기반 드롭다운 (목록 시트 참조)
    if (carData) {
      const makers = carData.getMakers();
      const allModels = [...new Set(carData.CAR_MODELS.map(m => m.model))];
      const allSubs = [...new Set(carData.CAR_MODELS.map(m => m.sub))];
      const allCategories = [...new Set(carData.CAR_MODELS.map(m => m.category).filter(Boolean))];
      if (s.col === 'manufacturer') validations.push({ sqref: ref, type: 'list', formula1: `목록!$A$2:$A$${makers.length + 1}`, allowBlank: true });
      if (s.col === 'car_model')    validations.push({ sqref: ref, type: 'list', formula1: `목록!$B$2:$B$${allModels.length + 1}`, allowBlank: true });
      if (s.col === 'detail_model') validations.push({ sqref: ref, type: 'list', formula1: `목록!$C$2:$C$${allSubs.length + 1}`, allowBlank: true });
      if (s.col === 'vehicle_class')validations.push({ sqref: ref, type: 'list', formula1: `목록!$D$2:$D$${allCategories.length + 1}`, allowBlank: true });
    }
  });
  if (validations.length) ws['!dataValidation'] = validations;

  XLSX.utils.book_append_sheet(wb, ws, '입력');
  XLSX.writeFile(wb, 'sample_template.xlsx');
  showToast('샘플 Excel 다운로드 완료 (드롭다운 포함)', 'success');
}

function parseSheetUrl(url) {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) return null;
  const g = url.match(/[#?&]gid=(\d+)/);
  return { id: m[1], gid: g ? g[1] : '0' };
}

async function loadSheet() {
  const url = _host.querySelector('#csvSheetUrl').value.trim();
  if (!url) { showToast('시트 URL을 입력하세요', 'error'); return; }
  const p = parseSheetUrl(url);
  if (!p) { showToast('올바른 시트 URL이 아닙니다', 'error'); return; }
  try {
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${p.id}/export?format=csv&gid=${p.gid}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (text.trim().startsWith('<')) throw new Error('시트가 비공개입니다 — 공유 → 링크가 있는 모든 사용자: 뷰어');
    handleText(text);
  } catch (e) {
    showToast(`시트 불러오기 실패: ${e.message}`, 'error');
  }
}

function handleText(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) { showToast('데이터 행이 없습니다', 'error'); return; }
  const header = rows[0];
  const data = rows.slice(1);
  const mapping = mapHeaders(header, _state.schema);
  _state.parsed = data;
  _state.mapping = mapping;

  _host.querySelector('#csvStep1').hidden = true;
  _host.querySelector('#csvStep2').hidden = false;
  _host.querySelector('#csvPreviewInfo').textContent = `총 ${data.length}행 · 매핑 ${mapping.filter(Boolean).length}/${header.length}컬럼`;

  // 미리보기 (5행)
  const preview = data.slice(0, 5);
  const thead = `<thead><tr>${header.map((h, i) => {
    const col = mapping[i];
    const item = col && _state.schema.find(s => s.col === col);
    const label = item ? item.label : h;
    const cls = col ? '' : ' style="color:var(--c-text-faint)"';
    return `<th${cls}>${label}</th>`;
  }).join('')}</tr></thead>`;
  const tbody = `<tbody>${preview.map(row =>
    `<tr>${row.map((c, i) => `<td${mapping[i] ? '' : ' style="color:var(--c-text-faint)"'}>${c || '-'}</td>`).join('')}</tr>`
  ).join('')}</tbody>`;
  _host.querySelector('#csvPreviewTable').innerHTML = thead + tbody;
}

async function runUpload() {
  const { parsed, mapping, schema, onRow, transform, validate } = _state;
  const result = { ok: 0, fail: 0, errors: [] };
  const dateCols = new Set(schema.filter(s => s.type === 'date').map(s => s.col));
  let records = parsed.map(row => {
    const obj = {};
    mapping.forEach((col, i) => {
      if (!col) return;
      let v = String(row[i] || '').trim();
      if (v && dateCols.has(col)) v = _normalizeDate(v);
      obj[col] = v;
    });
    return obj;
  });

  if (transform) {
    records = records.map((rec, i) => {
      try {
        const r = transform(rec);
        return r?.data ?? r ?? rec;
      } catch (e) {
        result.errors.push({ row: i + 2, message: `변환: ${e.message}` });
        result.fail++;
        return null;
      }
    });
  }

  const requiredCols = schema.filter(s => s.required).map(s => s.col);
  for (let i = 0; i < records.length; i++) {
    if (records[i] === null) continue;
    const rec = records[i];
    const missing = requiredCols.filter(c => !rec[c]);
    if (missing.length) {
      result.errors.push({ row: i + 2, message: `필수: ${missing.join(', ')}` });
      result.fail++;
      records[i] = null;
      continue;
    }
    if (validate) {
      const errs = validate(rec) || [];
      if (errs.length) {
        result.errors.push({ row: i + 2, message: errs.join(' / ') });
        result.fail++;
        records[i] = null;
      }
    }
  }

  for (let i = 0; i < records.length; i++) {
    if (records[i] === null) continue;
    try {
      await onRow(records[i]);
      result.ok++;
    } catch (e) {
      result.errors.push({ row: i + 2, message: e.message || '저장 실패' });
      result.fail++;
    }
  }

  const out = _host.querySelector('#csvResult');
  out.hidden = false;
  out.innerHTML = `
    <div style="display:flex;gap:12px;font-size:var(--font-size);margin-bottom:6px">
      <span style="color:var(--c-success);font-weight:var(--font-weight-bold)">성공 ${result.ok}</span>
      <span style="color:var(--c-danger);font-weight:var(--font-weight-bold)">실패 ${result.fail}</span>
    </div>
    ${result.errors.length ? `<div style="max-height:120px;overflow:auto;background:var(--c-danger-bg);color:#991b1b;padding:6px 10px;border-radius:var(--r-xs);font-size:var(--font-size-sm)">${
      result.errors.slice(0, 30).map(e => `<div>행 ${e.row}: ${e.message}</div>`).join('')
    }${result.errors.length > 30 ? `<div>... 외 ${result.errors.length - 30}건</div>` : ''}</div>` : ''}
  `;
  if (result.ok) showToast(`${result.ok}건 업로드 완료`, 'success');
}
