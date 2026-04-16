/**
 * pages/admin-notice.js — 고지서업무 (과태료/통행료)
 *
 * 좌: 고지서 스캔 업로드 (OCR) + 필터
 * 우: 과태료 목록 (AG Grid) + 확인서 출력 + 일괄 다운로드
 */
import { showToast } from '../core/toast.js';
import { ocrFile, extractCarNumber } from '../core/ocr.js';
import { saveEvent, watchEvents } from '../firebase/events.js';
import { watchAssets } from '../firebase/assets.js';
import { watchContracts } from '../firebase/contracts.js';
import { uploadPenaltyFile } from '../firebase/file-storage.js';
import { generateRentalConfirmation } from '../core/doc-generator.js';

const $ = s => document.querySelector(s);
const fmt = v => Number(v || 0).toLocaleString();

let gridApi = null;
let allPenalties = [];
let allAssets = [];
let allContracts = [];
let selectedRow = null;

export async function mount() {
  watchAssets(items => { allAssets = items; });
  watchContracts(items => { allContracts = items; });
  watchEvents(items => {
    allPenalties = items.filter(e => e.event_type === 'penalty');
    refreshGrid();
  });

  initGrid();
  bindUpload();
  bindButtons();

  // 오늘 날짜 기본
  const today = new Date().toISOString().split('T')[0];
  $('#noticeFilterDate').value = today;
}

// ── 그리드 ──────────────────────────────────────────────
function initGrid() {
  const columnDefs = [
    { headerName: '#', valueGetter: 'node.rowIndex + 1', width: 40 },
    { headerName: '유형', field: 'doc_type', width: 70 },
    { headerName: '차량번호', field: 'car_number', width: 100 },
    { headerName: '차량정보', field: '_car_info', width: 110 },
    { headerName: '위반일', field: 'date', width: 90 },
    { headerName: '금액', field: 'amount', width: 85, type: 'numericColumn', valueFormatter: p => fmt(p.value) },
    { headerName: '장소', field: 'location', width: 150 },
    { headerName: '납부기한', field: 'due_date', width: 90 },
    { headerName: '계약자', field: 'customer_name', width: 80 },
    { headerName: '이력', field: '_history', width: 65,
      cellStyle: p => p.value !== '최초' ? { color: 'var(--c-danger)', fontWeight: 600 } : {} },
    { headerName: '상태', field: 'paid_status', width: 70,
      cellStyle: p => p.value === '납부완료' ? { color: 'var(--c-success)' } : { color: 'var(--c-danger)' } },
  ];

  gridApi = agGrid.createGrid($('#noticeGrid'), {
    columnDefs,
    rowData: [],
    defaultColDef: { resizable: true, sortable: true, filter: true, minWidth: 40 },
    rowHeight: 32,
    headerHeight: 28,
    animateRows: false,
    rowSelection: { mode: 'singleRow', checkboxes: false, headerCheckbox: false },
    suppressContextMenu: true,
    onRowClicked: e => { selectedRow = e.data; },
  });
}

function refreshGrid() {
  const filterDate = $('#noticeFilterDate')?.value;
  const filterStatus = $('#noticeFilterStatus')?.value;

  let rows = allPenalties.map(p => {
    const asset = allAssets.find(a => a.car_number === p.car_number);
    const contract = allContracts.find(c => c.car_number === p.car_number && c.contract_status !== '계약해지');
    const history = allPenalties.filter(x => x.car_number === p.car_number);
    const idx = history.sort((a, b) => (a.date || '').localeCompare(b.date || '')).indexOf(p);

    return {
      ...p,
      _car_info: asset ? `${asset.manufacturer || ''} ${asset.car_model || ''}` : '',
      customer_name: p.customer_name || contract?.contractor_name || '',
      _history: idx === 0 ? '최초' : `${idx + 1}번째`,
      _asset: asset,
      _contract: contract,
    };
  });

  // 필터 적용
  if (filterDate) rows = rows.filter(r => (r.date || '').startsWith(filterDate) || (r.created_at && new Date(r.created_at).toISOString().split('T')[0] === filterDate));
  if (filterStatus) rows = rows.filter(r => r.paid_status === filterStatus);

  rows.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  gridApi.setGridOption('rowData', rows);
  $('#noticeInfo').textContent = `${rows.length}건`;
}

// ── 업로드 (OCR) ────────────────────────────────────────
function bindUpload() {
  const file = $('#noticeFile');
  const drop = $('#noticeDrop');

  file?.addEventListener('change', e => handleFiles(Array.from(e.target.files)));
  drop?.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('is-drag'); });
  drop?.addEventListener('dragleave', () => drop.classList.remove('is-drag'));
  drop?.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('is-drag');
    handleFiles(Array.from(e.dataTransfer.files));
  });
}

async function handleFiles(files) {
  if (!files.length) return;
  const status = $('#noticeStatus');
  let penaltyModule;
  try { penaltyModule = await import('../data/ocr-parsers/penalty.js'); } catch {}

  for (const file of files) {
    const id = `notice_${Date.now()}_${Math.random().toString(36).slice(2,4)}`;
    status.innerHTML += `<div id="${id}" class="dash-card" style="display:flex;align-items:center;gap:8px">
      <span>⏳</span> <span style="font-size:var(--font-size-sm)">${file.name} — OCR 중...</span>
    </div>`;

    try {
      const result = await ocrFile(file);
      const texts = result.text.split('--- 페이지 구분 ---').map(t => t.trim()).filter(Boolean);
      const allText = texts.length ? texts : [result.text];

      let saved = 0;
      for (const txt of allText) {
        const lines = txt.split('\n').map(l => l.trim()).filter(Boolean);
        if (!penaltyModule?.detect(txt)) continue;

        const p = penaltyModule.parse(txt, lines);
        if (!p.car_number) continue;

        const asset = allAssets.find(a => a.car_number === p.car_number);
        const contract = allContracts.find(c => c.car_number === p.car_number && c.contract_status !== '계약해지');

        // 원본 파일 Storage 업로드
        let fileUrl = '';
        try {
          fileUrl = await uploadPenaltyFile(file, p.car_number, (p.date || '').split(' ')[0]);
        } catch (e) { console.warn('[file upload]', e); }

        await saveEvent({
          event_type: 'penalty',
          doc_type: p.doc_type,
          car_number: p.car_number,
          vin: asset?.vin || '',
          date: (p.date || '').split(' ')[0],
          title: p.description || p.doc_type || '과태료',
          penalty_amount: p.penalty_amount,
          fine_amount: p.fine_amount,
          demerit_points: p.demerit_points,
          toll_amount: p.toll_amount,
          amount: p.amount,
          location: p.location,
          description: p.description,
          law_article: p.law_article,
          due_date: p.due_date,
          notice_no: p.notice_no,
          issuer: p.issuer,
          issue_date: p.issue_date,
          payer_name: p.payer_name,
          pay_account: p.pay_account,
          customer_name: contract?.contractor_name || '',
          contract_code: contract?.contract_code || '',
          partner_code: asset?.partner_code || '',
          paid_status: '미납',
          direction: 'out',
          file_url: fileUrl,
          note: `OCR (${file.name})`,
        });
        saved++;
      }

      document.getElementById(id).innerHTML = `<span>✅</span> <span style="font-size:var(--font-size-sm)">${file.name} — ${saved}건 등록</span>`;
    } catch (e) {
      document.getElementById(id).innerHTML = `<span>❌</span> <span style="font-size:var(--font-size-sm);color:var(--c-danger)">${file.name} — ${e.message}</span>`;
    }
  }

  showToast('OCR 처리 완료', 'success');
  $('#noticeFile').value = '';
}

// ── 버튼 ────────────────────────────────────────────────
function bindButtons() {
  $('#noticeRefresh')?.addEventListener('click', refreshGrid);

  // 계약사실확인서 출력
  $('#noticePrintConfirm')?.addEventListener('click', () => {
    if (!selectedRow) { showToast('목록에서 건을 선택하세요', 'info'); return; }
    const r = selectedRow;
    const asset = r._asset;
    const contract = r._contract;

    if (!contract) { showToast('매칭된 계약이 없습니다', 'error'); return; }

    // 회사 정보 (TODO: 설정에서 가져오기)
    generateRentalConfirmation({
      company_name: r.payer_name || '주식회사 손오공렌터카',
      company_addr: '',
      company_biz_no: '',
      company_ceo: '',
      company_phone: '',
      car_number: r.car_number,
      car_model: asset ? `${asset.manufacturer || ''} ${asset.car_model || ''}` : '',
      vin: asset?.vin || r.vin || '',
      contractor_name: contract.contractor_name || '',
      contractor_phone: contract.contractor_phone || '',
      contractor_reg_no: contract.contractor_reg_no || '',
      start_date: contract.start_date || '',
      end_date: contract.end_date || '',
      violation_date: r.date || '',
    });
  });

  // 일괄 다운로드 (고지서 + 확인서)
  $('#noticeDownloadAll')?.addEventListener('click', async () => {
    const rows = [];
    gridApi.forEachNodeAfterFilterAndSort(n => { if (n.data) rows.push(n.data); });

    if (!rows.length) { showToast('다운로드할 건이 없습니다', 'info'); return; }

    const withFile = rows.filter(r => r.file_url);
    if (!withFile.length) { showToast('원본 파일이 없는 건만 있습니다', 'info'); return; }

    showToast(`${withFile.length}건 다운로드 준비 중...`, 'info');

    // JSZip 로드
    let JSZip;
    try {
      if (!window.JSZip) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
          s.onload = resolve;
          s.onerror = reject;
          document.head.appendChild(s);
        });
      }
      JSZip = window.JSZip;
    } catch { showToast('ZIP 라이브러리 로드 실패', 'error'); return; }

    const zip = new JSZip();
    let count = 0;

    for (const r of withFile) {
      const prefix = `${r.car_number}_${(r.date || '').split(' ')[0]}`;
      // 고지서 원본 다운로드
      try {
        const res = await fetch(r.file_url);
        const blob = await res.blob();
        const ext = r.file_url.includes('.pdf') ? 'pdf' : 'jpg';
        zip.file(`${prefix}_고지서.${ext}`, blob);
        count++;
      } catch (e) { console.warn('[download]', e); }
    }

    if (count) {
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const dateStr = $('#noticeFilterDate')?.value || new Date().toISOString().split('T')[0];
      a.download = `과태료_${dateStr}_${count}건.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
      showToast(`${count}건 다운로드 완료`, 'success');
    }
  });
}
