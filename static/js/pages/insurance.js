/**
 * pages/insurance.js — 보험관리
 * events 컬렉션에서 event_type='insurance'인 것만 필터
 */
import { watchEvents } from '../firebase/events.js';
import { watchAssets } from '../firebase/assets.js';
import { openDetail } from '../core/detail-panel.js';

const $ = s => document.querySelector(s);
let gridApi = null;
let assets = [];

export async function mount() {
  initGrid();
  watchAssets(items => { assets = items; refreshJoin(); });
  watchEvents(items => {
    const ins = items.filter(e => e.event_type === 'insurance' && e.status !== 'deleted');
    $('#insCount').textContent = ins.length;
    _allIns = ins;
    refreshJoin();
  });
  bindToolbar();
}

function bindToolbar() {
  const search = $('#insSearch');
  if (search) search.addEventListener('input', e => gridApi?.setGridOption('quickFilterText', e.target.value || ''));
  $('#insExportCsv')?.addEventListener('click', () => {
    gridApi?.exportDataAsCsv({
      fileName: `보험관리_${todayStr()}.csv`,
      processCellCallback: csvCell,
    });
  });
  $('#insExportXlsx')?.addEventListener('click', () => {
    // AG Grid Community에는 Excel export가 없음 → CSV로 대체 (엑셀에서 열림)
    if (typeof gridApi?.exportDataAsExcel === 'function') {
      gridApi.exportDataAsExcel({
        fileName: `보험관리_${todayStr()}.xlsx`,
        processCellCallback: csvCell,
      });
    } else {
      gridApi?.exportDataAsCsv({
        fileName: `보험관리_${todayStr()}.csv`,
        processCellCallback: csvCell,
      });
    }
  });
  $('#insExportJson')?.addEventListener('click', () => downloadJson(_allIns));
}

function csvCell(p) {
  const v = p.value;
  if (Array.isArray(v)) {
    // 분납일정: [{seq,date,amount}] → "2회 2026-04-14 77300 / ..."
    if (v.length && typeof v[0] === 'object' && 'seq' in v[0]) {
      return v.map(x => `${x.seq}회 ${x.date} ${x.amount}`).join(' / ');
    }
    return v.join(', ');
  }
  return v ?? '';
}

function downloadJson(rows) {
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `보험관리_${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
}

let _allIns = [];

function refreshJoin() {
  const rows = _allIns.map(e => {
    const asset = assets.find(a => a.car_number === e.car_number);
    return {
      ...e,
      _car_info: asset ? `${asset.manufacturer || ''} ${asset.car_model || ''}` : '',
    };
  }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  gridApi?.setGridOption('rowData', rows);
}

const MAX_INSTALLMENT = 6;  // 자동차보험 기본 6회차

function initGrid() {
  const fmtNum = p => p.value ? Number(p.value).toLocaleString() : '';
  const fmtTerms = p => Array.isArray(p.value) ? p.value.join(', ') : (p.value || '');

  // 회차별 컬럼 동적 생성 (한 회차 = 일자셀 + 금액셀 2개)
  const instColumns = [];
  for (let n = 1; n <= MAX_INSTALLMENT; n++) {
    instColumns.push({
      headerName: `${n}회차일`,
      colId: `inst_${n}_date`,
      width: 100,
      valueGetter: p => {
        const insts = p.data?.installments;
        if (!Array.isArray(insts)) return '';
        const x = insts.find(i => i.seq === n);
        return x?.date || '';
      },
      cellStyle: { textAlign: 'center' },
    });
    instColumns.push({
      headerName: `${n}회차액`,
      colId: `inst_${n}_amt`,
      width: 90,
      type: 'numericColumn',
      valueGetter: p => {
        const insts = p.data?.installments;
        if (!Array.isArray(insts)) return 0;
        const x = insts.find(i => i.seq === n);
        return x?.amount || 0;
      },
      valueFormatter: fmtNum,
      cellStyle: p => p.value ? { fontWeight: 600, fontVariantNumeric: 'tabular-nums' } : { color: 'var(--c-text-muted)' },
    });
  }
  gridApi = agGrid.createGrid($('#insuranceGrid'), {
    columnDefs: [
      { headerName: '#', valueGetter: 'node.rowIndex + 1', width: 45, pinned: 'left' },
      // ── 회원사 (맨 앞 고정) ──
      { headerName: '🏢 회원사', headerClass: 'grp-basic', children: [
        { headerName: '회원사코드', field: 'partner_code', width: 90, pinned: 'left',
          cellStyle: p => p.value
            ? { background: 'var(--c-primary-bg)', color: 'var(--c-primary)', fontWeight: 700, textAlign: 'center' }
            : { color: 'var(--c-text-muted)', textAlign: 'center' },
          valueFormatter: p => p.value || '미등록' },
        { headerName: '회원사명', field: 'member_name', width: 160, pinned: 'left' },
      ]},
      // ── 기본 식별 (좌측 고정) ──
      { headerName: '기본', headerClass: 'grp-basic', children: [
        { headerName: '차량번호', field: 'car_number', width: 100, pinned: 'left' },
        { headerName: '차대번호', field: 'vin', width: 160 },
        { headerName: '차량', field: '_car_info', width: 140, pinned: 'left' },
        { headerName: '보험사', field: 'insurance_company', width: 110 },
        { headerName: '증권번호', field: 'policy_no', width: 150 },
        { headerName: '상품명', field: 'insurance_product', width: 200 },
        { headerName: '유형', field: 'insurance_type', width: 80 },
        { headerName: '시작일', field: 'insurance_start', width: 100 },
        { headerName: '만료일', field: 'insurance_end', width: 100 },
        { headerName: '계약일', field: 'contract_date', width: 100 },
        { headerName: '발행일', field: 'issue_date', width: 100 },
      ]},
      // ── 계약자·피보험자 ──
      { headerName: '계약자 · 피보험자', headerClass: 'grp-holder', children: [
        { headerName: '피보험자', field: 'insured_name', width: 140 },
        { headerName: '사업자번호', field: 'insured_biz_no', width: 130 },
        { headerName: '계약자', field: 'policyholder_name', width: 140 },
        { headerName: '계약자번호', field: 'policyholder_biz_no', width: 130 },
        { headerName: '주소', field: 'insured_address', width: 200 },
      ]},
      // ── ⭐ 보장한도 (핵심) ──
      { headerName: '🛡️ 보장한도', headerClass: 'grp-coverage', children: [
        { headerName: '대인Ⅰ', field: 'coverage_liability_1', width: 150,
          cellStyle: { background: 'var(--c-primary-bg)', fontWeight: 600 } },
        { headerName: '대인Ⅱ', field: 'coverage_liability_2', width: 100,
          cellStyle: { background: 'var(--c-primary-bg)', fontWeight: 600 } },
        { headerName: '대물', field: 'coverage_property', width: 120,
          cellStyle: { background: 'var(--c-primary-bg)', fontWeight: 600 } },
        { headerName: '자손', field: 'coverage_self_injury', width: 160 },
        { headerName: '무보험', field: 'coverage_uninsured', width: 110 },
        { headerName: '자차', field: 'coverage_self_damage', width: 90,
          valueFormatter: p => p.value || '미가입',
          cellStyle: p => !p.value || /미가입/.test(p.value) ? { color: 'var(--c-danger)' } : { fontWeight: 600 } },
        { headerName: '할증금액', field: 'deductible_amount', width: 100, type: 'numericColumn', valueFormatter: fmtNum },
        { headerName: '자기부담금', field: 'self_burden', width: 100 },
        { headerName: '할증한정', field: 'surcharge_limit', width: 100 },
      ]},
      // ── ⭐ 납부 스케줄 (핵심) ──
      { headerName: '💰 납부 스케줄', headerClass: 'grp-payment', children: [
        { headerName: '총보험료', field: 'total_premium', width: 110, type: 'numericColumn', valueFormatter: fmtNum,
          cellStyle: { background: 'var(--c-primary-bg)', color: 'var(--c-primary)', fontWeight: 700 } },
        { headerName: '납입액', field: 'paid_amount', width: 100, type: 'numericColumn', valueFormatter: fmtNum,
          cellStyle: { fontWeight: 600 } },
        { headerName: '납입방법', field: 'payment_method', width: 110 },
        { headerName: '분납', field: 'installment_count', width: 65, type: 'numericColumn',
          valueFormatter: p => p.value ? `${p.value}회` : '' },
        { headerName: '납부은행', field: 'payment_bank', width: 110 },
        { headerName: '납부계좌', field: 'payment_account', width: 140 },
        { headerName: '예금주', field: 'payment_holder', width: 130 },
      ]},
      // ── ⭐ 분납 일정 (회차별 분리) ──
      { headerName: '📅 분납 일정', headerClass: 'grp-payment', children: instColumns },
      // ── 차량 ──
      { headerName: '차량', headerClass: 'grp-car', children: [
        { headerName: '차명', field: 'car_model', width: 140 },
        { headerName: '연식', field: 'car_year', width: 60 },
        { headerName: '차종', field: 'car_type', width: 140 },
        { headerName: '용도', field: 'car_use', width: 70 },
        { headerName: '배기량', field: 'engine_cc', width: 80, type: 'numericColumn', valueFormatter: fmtNum },
        { headerName: '정원', field: 'seat_capacity', width: 55, type: 'numericColumn' },
        { headerName: '적재정량', field: 'load_capacity', width: 90 },
        { headerName: '차량가액', field: 'car_value', width: 100, type: 'numericColumn', valueFormatter: fmtNum },
        { headerName: '부속가액', field: 'accessory_value', width: 90, type: 'numericColumn',
          valueFormatter: p => p.value ? fmtNum(p) : '없음',
          cellStyle: p => !p.value ? { color: 'var(--c-text-muted)' } : {} },
        { headerName: '부속품', field: 'accessories', width: 120 },
      ]},
      // ── 운전자 / 특약 ──
      { headerName: '운전 · 특약', children: [
        { headerName: '운전범위', field: 'driver_range', width: 100 },
        { headerName: '연령한정', field: 'age_limit', width: 120 },
        { headerName: '지정1운전자', field: 'designated_driver_1', width: 120 },
        { headerName: '지정2운전자', field: 'designated_driver_2', width: 120 },
        { headerName: '출동', field: 'sos_count', width: 60, type: 'numericColumn',
          valueFormatter: p => p.value ? `${p.value}회` : '' },
        { headerName: '견인(Km)', field: 'sos_tow_km', width: 80, type: 'numericColumn' },
        { headerName: '특약', field: 'special_terms', width: 280, valueFormatter: fmtTerms, tooltipValueGetter: fmtTerms },
      ]},
      // ── 기타 ──
      { headerName: '기타', children: [
        { headerName: '질권', field: 'pledge', width: 80 },
        { headerName: '지점', field: 'branch', width: 120 },
        { headerName: '이메일', field: 'contact_email', width: 160 },
        { headerName: '메모', field: 'note', flex: 1, minWidth: 200 },
      ]},
    ],
    rowData: [],
    defaultColDef: { resizable: true, sortable: true, filter: true, minWidth: 40 },
    rowHeight: 30, headerHeight: 28, animateRows: false, suppressContextMenu: true,
    onRowClicked: (e) => openInsuranceDetail(e.data),
  });
}

/** 행 클릭 시 분납일정 표 + 전체 정보 팝업 */
function openInsuranceDetail(row) {
  if (!row) return;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = n => n ? Number(n).toLocaleString() : '';

  // ── ⭐ 보장한도 (핵심 #1) ──
  const coverages = [
    { label: '대인배상Ⅰ', value: row.coverage_liability_1, must: true },
    { label: '대인배상Ⅱ', value: row.coverage_liability_2, must: true },
    { label: '대물배상',   value: row.coverage_property, must: true },
    { label: '자기신체사고', value: row.coverage_self_injury },
    { label: '무보험차상해', value: row.coverage_uninsured },
    { label: '자기차량손해', value: row.coverage_self_damage },
  ].filter(c => c.value);
  const coverageHtml = coverages.length ? `
    <table class="detail-table" style="width:100%">
      <thead>
        <tr style="background:var(--c-primary-bg);color:var(--c-primary)">
          <th style="padding:6px 10px;text-align:left;width:140px">담보 항목</th>
          <th style="padding:6px 10px;text-align:left">보상한도</th>
        </tr>
      </thead>
      <tbody>
        ${coverages.map(c => {
          const none = /미가입/.test(c.value);
          return `<tr>
            <td style="padding:6px 10px;font-weight:600;${c.must ? 'color:var(--c-primary)' : ''}">${esc(c.label)}${c.must ? ' <span style="font-size:10px;color:var(--c-danger)">필수</span>' : ''}</td>
            <td style="padding:6px 10px;${none ? 'color:var(--c-text-muted)' : 'font-weight:600'}">${esc(c.value)}</td>
          </tr>`;
        }).join('')}
        ${row.deductible_amount ? `<tr style="background:var(--c-surface-2)">
          <td style="padding:6px 10px">물적사고할증금액</td>
          <td style="padding:6px 10px;font-variant-numeric:tabular-nums">${fmt(row.deductible_amount)}원</td>
        </tr>` : ''}
        ${row.sos_count ? `<tr>
          <td style="padding:6px 10px">긴급출동</td>
          <td style="padding:6px 10px">${esc(row.sos_count)}회 · 견인 ${esc(row.sos_tow_km || 0)}Km</td>
        </tr>` : ''}
      </tbody>
    </table>
  ` : '<div style="padding:10px;color:var(--c-text-muted)">보장 정보 없음</div>';

  // ── ⭐ 납부 스케줄 (핵심 #2) ──
  const insts = Array.isArray(row.installments) ? row.installments : [];
  const today = new Date().toISOString().slice(0, 10);
  const sumAmt = insts.reduce((s, x) => s + Number(x.amount || 0), 0);
  const scheduleHtml = `
    ${(row.payment_bank || row.payment_account) ? `
      <div style="padding:8px 12px;margin-bottom:8px;background:var(--c-primary-bg);border-radius:var(--r-sm);font-size:12px;display:flex;gap:16px;flex-wrap:wrap">
        <span><strong>납부계좌</strong> · ${esc(row.payment_bank || '')} ${esc(row.payment_account || '')}</span>
        ${row.payment_holder ? `<span><strong>예금주</strong> · ${esc(row.payment_holder)}</span>` : ''}
        ${row.total_premium ? `<span><strong>총보험료</strong> · <span style="color:var(--c-primary);font-weight:600">${fmt(row.total_premium)}원</span></span>` : ''}
      </div>
    ` : ''}
    ${insts.length ? `
      <table class="detail-table" style="width:100%">
        <thead>
          <tr style="background:var(--c-primary-bg);color:var(--c-primary)">
            <th style="padding:6px 8px;text-align:center;width:80px">회차</th>
            <th style="padding:6px 8px;text-align:center;width:130px">납부일</th>
            <th style="padding:6px 8px;text-align:right;width:120px">금액</th>
            <th style="padding:6px 8px;text-align:center;width:80px">상태</th>
          </tr>
        </thead>
        <tbody>
          ${insts.map(x => {
            const paid = x.date <= today;
            return `<tr${paid ? '' : ' style="background:var(--c-warn-bg, #fff8e1)"'}>
              <td style="padding:5px 8px;text-align:center;font-weight:600">${esc(x.seq)}회차</td>
              <td style="padding:5px 8px;text-align:center">${esc(x.date)}</td>
              <td style="padding:5px 8px;text-align:right;font-variant-numeric:tabular-nums;font-weight:600">${fmt(x.amount)}원</td>
              <td style="padding:5px 8px;text-align:center;color:${paid ? 'var(--c-success)' : 'var(--c-danger)'};font-weight:600">${paid ? '✓ 납입' : '예정'}</td>
            </tr>`;
          }).join('')}
          <tr style="border-top:2px solid var(--c-border);background:var(--c-surface-2);font-weight:700">
            <td style="padding:6px 8px;text-align:center" colspan="2">합계 (${insts.length}회)</td>
            <td style="padding:6px 8px;text-align:right;font-variant-numeric:tabular-nums;color:var(--c-primary)">${fmt(sumAmt)}원</td>
            <td></td>
          </tr>
        </tbody>
      </table>
    ` : '<div style="padding:10px;color:var(--c-text-muted)">분납 정보 없음 (일시납 또는 미추출)</div>'}
  `;

  openDetail({
    title: `${row.insurance_company || ''} · ${row.car_number || ''}`,
    subtitle: `${row.policy_no || ''} · ${row.insurance_start || ''} ~ ${row.insurance_end || ''}`,
    sections: [
      // ── ⭐ 핵심 2개 (최상단) ──
      { label: '🛡️ 보장한도', html: coverageHtml },
      { label: '💰 납부 스케줄', html: scheduleHtml },
      // ── 부가 정보 ──
      { label: '보험 기본', rows: [
        { label: '보험사', value: row.insurance_company },
        { label: '상품명', value: row.insurance_product },
        { label: '보험유형', value: row.insurance_type },
        { label: '증권번호', value: row.policy_no },
        { label: '시작일', value: row.insurance_start },
        { label: '만료일', value: row.insurance_end },
      ]},
      { label: '계약자 / 피보험자', rows: [
        { label: '계약자', value: row.policyholder_name },
        { label: '사업자번호', value: row.policyholder_biz_no },
        { label: '피보험자', value: row.insured_name },
      ]},
      { label: '차량', rows: [
        { label: '차량번호', value: row.car_number },
        { label: '차명', value: row.car_model },
        { label: '연식', value: row.car_year },
        { label: '차종', value: row.car_type },
        { label: '배기량', value: fmt(row.engine_cc) },
        { label: '정원', value: row.seat_capacity },
        { label: '차량가액', value: fmt(row.car_value) },
        { label: '부속품', value: row.accessories },
      ]},
    ],
    actions: [
      { label: '분납일정 CSV', action: () => downloadInstallmentsCsv(row) },
    ],
  });
}

function downloadInstallmentsCsv(row) {
  const insts = Array.isArray(row.installments) ? row.installments : [];
  if (!insts.length) return;
  const header = '회차,납부일,금액\n';
  const body = insts.map(x => `${x.seq},${x.date},${x.amount}`).join('\n');
  const blob = new Blob(['\uFEFF' + header + body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `분납일정_${row.car_number || 'unknown'}_${row.policy_no || ''}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
