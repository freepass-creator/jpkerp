/**
 * pages/fund.js — 입출금등록
 *
 * 3탭: 계좌(통장) / 자동이체 / 카드
 * CSV 업로드 → 파서 → AG Grid 미리보기 → [적용] → events 컬렉션 upsert
 */
import { parseCsv } from '../widgets/csv-upload.js';
import * as shinhanBank from '../data/bank-parsers/shinhan.js';
import * as shinhanCard from '../data/card-parsers/shinhan.js';
import { upsertEventByRawKey } from '../firebase/events.js';
import { showToast } from '../core/toast.js';

const $ = (s) => document.querySelector(s);
const fmt = (v) => Number(v || 0).toLocaleString('ko-KR');
const fmtDate = (s) => {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1].slice(2)}.${m[2]}.${m[3]}` : s;
};

let activeTab = 'bank';
let previewGrid = null;
let parsedRows = [];

const GUIDES = {
  bank: '통장 거래내역 CSV를 업로드하세요. 입금/출금 모든 거래가 등록됩니다.',
  autodebit: '자동이체 결과 명세 CSV를 업로드하세요. 고객별 결제 상태가 기록됩니다.',
  card: '법인카드 이용내역 CSV를 업로드하세요. 지출 거래가 등록됩니다.',
};

const PARSERS = {
  bank: { shinhan: shinhanBank },
  autodebit: { shinhan: shinhanBank }, // 추후 별도 파서
  card: { shinhan: shinhanCard },
};

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.fund-tab').forEach(t => t.classList.toggle('is-active', t.dataset.tab === tab));
  $('#fundGuide').textContent = GUIDES[tab];
  $('#fundAccountNo').hidden = tab === 'card';
  reset();
}

function reset() {
  parsedRows = [];
  if (previewGrid) { previewGrid.destroy(); previewGrid = null; }
  $('#fundGrid').innerHTML = '';
  $('#fundFile').value = '';
  $('#fundInfo').textContent = '입출금등록';
  $('#fundPreviewInfo').textContent = '데이터를 불러오세요';
}

async function loadFile(file) {
  if (!file) return;
  const text = await file.text();
  ingest(text);
}

function ingest(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) { showToast('데이터 행이 없습니다', 'error'); return; }
  const headers = rows[0].map(h => String(h || '').trim());
  const bankKey = $('#fundBank').value;
  const parserGroup = PARSERS[activeTab] || {};
  const parser = parserGroup[bankKey];
  if (!parser) { showToast('파서를 찾을 수 없습니다', 'error'); return; }
  if (!parser.detect(headers)) { showToast('헤더가 일치하지 않습니다', 'error'); return; }

  const acctNo = $('#fundAccountNo').value.trim();
  const acctLabel = parser.LABEL || '';

  parsedRows = rows.slice(1).map(row => {
    const ev = parser.parseRow(row, headers);
    if (!ev) return null;
    if (activeTab !== 'card' && acctNo) {
      ev.account = `${acctLabel} ${acctNo}`;
      ev.account_no = acctNo;
      ev.raw_key = `${acctNo}|${ev.raw_key}`;
    }
    return ev;
  }).filter(Boolean);

  if (!parsedRows.length) { showToast('인식된 거래가 없습니다', 'error'); return; }
  showPreview();
}

function showPreview() {
  const inCount = parsedRows.filter(r => r.direction === 'in').length;
  const outCount = parsedRows.filter(r => r.direction === 'out').length;
  const inSum = parsedRows.filter(r => r.direction === 'in').reduce((s, r) => s + r.amount, 0);
  const outSum = parsedRows.filter(r => r.direction === 'out').reduce((s, r) => s + r.amount, 0);
  $('#fundPreviewInfo').textContent = `총 ${parsedRows.length}건 · 입금 ${inCount}건 ${fmt(inSum)}원 · 출금 ${outCount}건 ${fmt(outSum)}원`;
  $('#fundInfo').textContent = `${parsedRows.length}건 인식`;

  const colDefs = activeTab === 'card' ? [
    { headerName: '일자', field: 'date', width: 85, valueFormatter: p => fmtDate(p.value) },
    { headerName: '가맹점', field: 'counterparty', width: 150 },
    { headerName: '금액', field: 'amount', width: 110, type: 'numericColumn',
      valueFormatter: p => fmt(p.value), cellStyle: { color: 'var(--c-danger)' } },
    { headerName: '카드', field: 'card_no', width: 100 },
    { headerName: '메모', field: 'memo', flex: 1 },
  ] : [
    { headerName: '일자', field: 'date', width: 85, valueFormatter: p => fmtDate(p.value) },
    { headerName: '방향', field: 'direction', width: 60,
      valueFormatter: p => p.value === 'in' ? '입금' : '출금',
      cellStyle: p => ({ color: p.value === 'in' ? 'var(--c-success)' : 'var(--c-danger)', fontWeight: 500 }) },
    { headerName: '금액', field: 'amount', width: 110, type: 'numericColumn',
      valueFormatter: p => fmt(p.value),
      cellStyle: p => ({ color: p.data.direction === 'in' ? 'var(--c-success)' : 'var(--c-danger)' }) },
    { headerName: '내용', field: 'counterparty', width: 150 },
    { headerName: '적요', field: 'summary', width: 100 },
    { headerName: '잔액', field: 'balance', width: 110, type: 'numericColumn',
      valueFormatter: p => p.value ? fmt(p.value) : '' },
    { headerName: '메모', field: 'memo', flex: 1 },
  ];

  if (previewGrid) previewGrid.destroy();
  previewGrid = agGrid.createGrid($('#fundGrid'), {
    columnDefs: colDefs,
    rowData: parsedRows,
    defaultColDef: { resizable: true, sortable: true, editable: false, minWidth: 50 },
    rowHeight: 28,
    headerHeight: 28,
    animateRows: false,
    suppressContextMenu: true,
  });
}

async function confirm() {
  if (!parsedRows.length) return;
  $('#fundConfirm').disabled = true;
  let ok = 0, fail = 0;
  for (const ev of parsedRows) {
    try {
      await upsertEventByRawKey(ev);
      ok++;
    } catch (e) {
      console.error('[fund]', e);
      fail++;
    }
  }
  showToast(`적용 완료 ${ok}건${fail ? ` · 실패 ${fail}` : ''}`, ok ? 'success' : 'error');
  $('#fundConfirm').disabled = false;
}

export async function mount() {
  switchTab('bank');

  document.querySelectorAll('.fund-tab').forEach(t => {
    t.addEventListener('click', () => switchTab(t.dataset.tab));
  });

  const drop = $('#fundDrop');
  const file = $('#fundFile');
  drop?.addEventListener('click', () => file.click());
  file?.addEventListener('change', (e) => loadFile(e.target.files[0]));
  drop?.addEventListener('dragover', (e) => { e.preventDefault(); drop.style.background = 'var(--c-bg-hover)'; });
  drop?.addEventListener('dragleave', () => { drop.style.background = ''; });
  drop?.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.style.background = '';
    if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
  });

  $('#fundReset')?.addEventListener('click', reset);
  $('#fundConfirm')?.addEventListener('click', confirm);
}
