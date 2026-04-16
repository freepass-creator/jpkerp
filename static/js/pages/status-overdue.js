/**
 * pages/status-overdue.js — 미납 관리 (목록 단일)
 * 계약자별 그룹 · 연체일 · 조치 이력 집계
 */
import { watchBillings, computeTotalDue } from '../firebase/billings.js';
import { watchContracts } from '../firebase/contracts.js';
import { watchEvents } from '../firebase/events.js';

const $ = (s) => document.querySelector(s);
const fmt = (v) => Number(v || 0).toLocaleString('ko-KR');
const fmtDate = (s) => {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1].slice(2)}.${m[2]}.${m[3]}` : s;
};

let gridApi, contracts = [], billings = [], events = [];
let currentFilter = 'all';
let selectedKey = null;

function getRows() {
  const today = new Date().toISOString().slice(0, 10);
  const todayDate = new Date(today);

  // 계약자별 집계
  const byKey = new Map();
  billings.forEach(b => {
    const due = computeTotalDue(b);
    const paid = Number(b.paid_total) || 0;
    if (paid >= due) return;
    if (!b.due_date || b.due_date >= today) return;
    const c = contracts.find(x => x.contract_code === b.contract_code) || {};
    const key = b.contract_code || `${c.contractor_name || '-'}|${c.car_number || '-'}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        contract_code: b.contract_code,
        contractor_name: c.contractor_name || '-',
        contractor_phone: c.contractor_phone || '',
        car_number: c.car_number || b.car_number || '-',
        partner_code: c.partner_code || '',
        unpaid_total: 0,
        bill_count: 0,
        max_days: 0,
        earliest_due: '',
      });
    }
    const row = byKey.get(key);
    const days = Math.floor((todayDate - new Date(b.due_date)) / 86400000);
    row.unpaid_total += (due - paid);
    row.bill_count += 1;
    row.max_days = Math.max(row.max_days, days);
    if (!row.earliest_due || b.due_date < row.earliest_due) row.earliest_due = b.due_date;
  });

  // 조치 이력 집계 — events.collect (+ 기타 독촉성 타입)
  byKey.forEach(row => {
    const myEvents = events.filter(e =>
      e.type === 'collect' &&
      (e.contract_code === row.contract_code || e.car_number === row.car_number)
    );
    row.sms_count = myEvents.filter(e => /문자|알림톡|SMS/i.test(e.collect_action || '')).length;
    row.call_count = myEvents.filter(e => /전화|통화/i.test(e.collect_action || '')).length;
    row.legal_count = myEvents.filter(e => /내용증명|법적/i.test(e.collect_action || '')).length;
    row.total_actions = myEvents.length;
    // 최근 조치
    const latest = [...myEvents].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0];
    if (latest) {
      row.last_action = latest.collect_action || '';
      row.last_result = latest.collect_result || '';
      row.last_action_date = latest.date || '';
      row.promise_date = latest.promise_date || '';
    } else {
      row.last_action = '-';
      row.last_result = '';
      row.last_action_date = '';
      row.promise_date = '';
    }
  });

  let rows = [...byKey.values()];
  if (currentFilter === '7') rows = rows.filter(r => r.max_days >= 7);
  else if (currentFilter === '14') rows = rows.filter(r => r.max_days >= 14);
  else if (currentFilter === '30') rows = rows.filter(r => r.max_days >= 30);
  else if (currentFilter === 'multi') rows = rows.filter(r => r.bill_count >= 2);
  return rows.sort((a, b) => b.max_days - a.max_days);
}

function refresh() {
  if (!gridApi) return;
  const rows = getRows();
  gridApi.setGridOption('rowData', rows);
  const sub = $('#overdueCount');
  if (sub) {
    const total = rows.reduce((s, r) => s + r.unpaid_total, 0);
    sub.textContent = `${rows.length}명 · ${fmt(total)}원`;
  }
  if (selectedKey) renderHistory(selectedKey);
}

function renderHistory(key) {
  const host = $('#overdueHistory');
  const titleEl = $('#overdueHistoryTitle');
  const subEl = $('#overdueHistorySub');
  const today = new Date().toISOString().slice(0, 10);
  const todayDate = new Date(today);

  const rows = getRows();
  const row = rows.find(r => r.key === key);
  if (!row) {
    titleEl.textContent = '이력관리';
    subEl.textContent = '좌측에서 계약자를 선택하세요';
    host.innerHTML = '<div style="padding:24px;text-align:center;color:var(--c-text-muted)">선택 안됨</div>';
    return;
  }

  titleEl.innerHTML = `${row.contractor_name}`;
  subEl.textContent = `${row.car_number} · ${row.contractor_phone || ''} · 미납 ${fmt(row.unpaid_total)}원`;

  // 회차별 청구·납부 표
  const cBills = billings
    .filter(b => b.contract_code === row.contract_code || (!b.contract_code && b.car_number === row.car_number))
    .sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')));
  const billsHtml = cBills.length ? `
    <table class="grid-table" style="width:100%;margin-top:8px">
      <thead>
        <tr><th style="width:40px">회차</th><th style="width:80px">청구일</th><th class="is-num">청구액</th><th class="is-num">납부</th><th class="is-num">미납</th><th style="width:80px">상태</th></tr>
      </thead>
      <tbody>
        ${cBills.map(b => {
          const due = computeTotalDue(b);
          const paid = Number(b.paid_total) || 0;
          const unpaid = due - paid;
          const days = b.due_date ? Math.floor((todayDate - new Date(b.due_date)) / 86400000) : 0;
          const isOd = unpaid > 0 && b.due_date && b.due_date < today;
          const status = paid >= due ? '완납' : (paid > 0 ? '부분' : (isOd ? `${days}일연체` : '미수'));
          const color = paid >= due ? 'var(--c-success)' : (isOd && days >= 30 ? '#991b1b' : isOd && days >= 7 ? 'var(--c-danger)' : 'var(--c-warn)');
          return `<tr><td>${b.seq || '-'}</td><td>${fmtDate(b.due_date)}</td><td class="is-num">${fmt(due)}</td><td class="is-num" style="color:var(--c-success)">${fmt(paid)}</td><td class="is-num" style="color:${unpaid?'var(--c-danger)':'var(--c-text-muted)'};font-weight:${unpaid?600:400}">${fmt(unpaid)}</td><td><span style="color:${color};font-weight:500">${status}</span></td></tr>`;
        }).join('')}
      </tbody>
    </table>` : '<div style="color:var(--c-text-muted);padding:12px">청구 내역 없음</div>';

  // 독촉·조치 이력 타임라인
  const collectEvs = events
    .filter(e => e.type === 'collect' && (e.contract_code === row.contract_code || e.car_number === row.car_number))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  const historyHtml = collectEvs.length ? `
    <div style="display:flex;flex-direction:column;gap:4px">
      ${collectEvs.map(e => {
        const actionIcon = /문자|알림톡|SMS/i.test(e.collect_action || '') ? 'ph-chat-circle-dots'
          : /전화|통화/i.test(e.collect_action || '') ? 'ph-phone'
          : /내용증명|법적/i.test(e.collect_action || '') ? 'ph-scales'
          : 'ph-circle';
        const actionColor = /법적/i.test(e.collect_action || '') ? '#991b1b'
          : /문자|알림톡/i.test(e.collect_action || '') ? '#3b82f6'
          : /전화/i.test(e.collect_action || '') ? '#2563eb'
          : 'var(--c-text-muted)';
        const resultColor = e.collect_result === '즉시납부' ? 'var(--c-success)'
          : e.collect_result === '납부약속' ? 'var(--c-warn)'
          : (e.collect_result === '연락불가' || e.collect_result === '거부') ? 'var(--c-danger)'
          : 'var(--c-text)';
        return `
          <div style="display:flex;gap:10px;padding:8px 12px;border-bottom:1px solid var(--c-border)">
            <i class="ph ${actionIcon}" style="color:${actionColor};font-size:16px;flex-shrink:0;margin-top:2px"></i>
            <div style="flex:1;min-width:0">
              <div style="display:flex;gap:8px;align-items:baseline">
                <span style="font-size:var(--font-size);font-weight:600">${e.collect_action || '조치'}</span>
                <span style="font-size:var(--font-size-sm);color:${resultColor};font-weight:500">${e.collect_result || ''}</span>
                <span style="font-size:var(--font-size-xs);color:var(--c-text-muted);margin-left:auto">${fmtDate(e.date)}</span>
              </div>
              ${e.promise_date ? `<div style="font-size:var(--font-size-sm);color:var(--c-text-sub)">약속일 ${fmtDate(e.promise_date)}</div>` : ''}
              ${e.note ? `<div style="font-size:var(--font-size-sm);color:var(--c-text-sub);margin-top:2px;white-space:pre-wrap">${e.note}</div>` : ''}
              ${e.handler ? `<div style="font-size:var(--font-size-xs);color:var(--c-text-muted);margin-top:2px">담당: ${e.handler}</div>` : ''}
            </div>
          </div>`;
      }).join('')}
    </div>` : '<div style="color:var(--c-text-muted);padding:16px;text-align:center">조치 이력 없음</div>';

  // 조치 카운트 요약
  const summary = `
    <div style="display:flex;gap:12px;padding:10px 12px;background:var(--c-bg-sub);border-bottom:1px solid var(--c-border);font-size:var(--font-size-sm)">
      <span><i class="ph ph-phone" style="color:#2563eb"></i> 전화 ${row.call_count || 0}회</span>
      <span><i class="ph ph-chat-circle-dots" style="color:#3b82f6"></i> 문자 ${row.sms_count || 0}회</span>
      <span><i class="ph ph-scales" style="color:#991b1b"></i> 법적조치 ${row.legal_count || 0}회</span>
      <span style="margin-left:auto;color:var(--c-text-muted)">총 ${row.total_actions || 0}건</span>
    </div>`;

  host.innerHTML = `
    ${summary}
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-invoice"></i>청구·납부 내역</div>
      ${billsHtml}
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-clock-counter-clockwise"></i>조치 이력</div>
      ${historyHtml}
    </div>
  `;
}

export async function mount() {
  gridApi = agGrid.createGrid($('#overdueGrid'), {
    columnDefs: [
      { headerName: '#', valueGetter: 'node.rowIndex+1', width: 45,
        cellStyle: { color: 'var(--c-text-muted)' } },
      { headerName: '계약자', field: 'contractor_name', width: 90 },
      { headerName: '연락처', field: 'contractor_phone', width: 115 },
      { headerName: '차량', field: 'car_number', width: 95 },
      { headerName: '회원사', field: 'partner_code', width: 65 },
      { headerName: '회차', field: 'bill_count', width: 55, type: 'numericColumn',
        valueFormatter: p => p.value ? `${p.value}` : '' },
      { headerName: '미납액', field: 'unpaid_total', width: 110, type: 'numericColumn',
        valueFormatter: p => fmt(p.value),
        cellStyle: { color: 'var(--c-danger)', fontWeight: 600 } },
      { headerName: '최장 연체', field: 'max_days', width: 85, type: 'numericColumn',
        valueFormatter: p => p.value ? `${p.value}일` : '',
        cellStyle: p => ({
          color: p.value >= 30 ? '#991b1b' : p.value >= 14 ? 'var(--c-danger)' : p.value >= 7 ? 'var(--c-warn)' : 'var(--c-text-sub)',
          fontWeight: 600,
        }) },
      { headerName: '문자', field: 'sms_count', width: 55, type: 'numericColumn',
        valueFormatter: p => p.value ? `${p.value}회` : '',
        cellStyle: { color: 'var(--c-text-sub)' } },
      { headerName: '전화', field: 'call_count', width: 55, type: 'numericColumn',
        valueFormatter: p => p.value ? `${p.value}회` : '',
        cellStyle: { color: 'var(--c-text-sub)' } },
      { headerName: '법적조치', field: 'legal_count', width: 75, type: 'numericColumn',
        valueFormatter: p => p.value ? `${p.value}회` : '',
        cellStyle: p => ({ color: p.value ? '#991b1b' : 'var(--c-text-muted)', fontWeight: p.value ? 600 : 400 }) },
      { headerName: '최근 조치', field: 'last_action', width: 120 },
      { headerName: '결과', field: 'last_result', width: 100,
        cellStyle: p => {
          if (p.value === '납부약속') return { color: 'var(--c-warn)', fontWeight: 600 };
          if (p.value === '즉시납부') return { color: 'var(--c-success)' };
          if (p.value === '연락불가' || p.value === '거부') return { color: 'var(--c-danger)' };
          return {};
        } },
      { headerName: '조치일', field: 'last_action_date', width: 85,
        valueFormatter: p => fmtDate(p.value) },
      { headerName: '약속일', field: 'promise_date', width: 85,
        valueFormatter: p => fmtDate(p.value),
        cellStyle: p => {
          if (!p.value) return {};
          const today = new Date().toISOString().slice(0, 10);
          return p.value < today ? { color: 'var(--c-danger)', fontWeight: 600 } : { color: 'var(--c-warn)' };
        } },
    ],
    rowData: [],
    defaultColDef: { resizable: true, sortable: true, filter: true, editable: false, minWidth: 50 },
    rowHeight: 28,
    headerHeight: 28,
    animateRows: false,
    suppressContextMenu: true,
    onGridReady: (p) => p.api.autoSizeAllColumns(),
    rowSelection: 'single',
    onRowClicked: (e) => {
      selectedKey = e.data?.key;
      if (selectedKey) renderHistory(selectedKey);
    },
  });
  $('#overdueGrid')._agApi = gridApi;

  $('#overdueFilter')?.addEventListener('change', (e) => {
    currentFilter = e.target.value;
    refresh();
  });

  watchContracts((items) => { contracts = items; refresh(); });
  watchBillings((items) => { billings = items; refresh(); });
  watchEvents((items) => { events = items; refresh(); });
}
