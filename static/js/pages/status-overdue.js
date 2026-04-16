/**
 * pages/status-overdue.js — 미납 관리
 * 좌: 미납자 목록 (계약자별 그룹)
 * 우: 상세 — 회차별 명세 + 빠른 수금 입력 + 독촉 이력
 */
import { watchBillings, computeTotalDue, addPaymentToBilling } from '../firebase/billings.js';
import { watchContracts } from '../firebase/contracts.js';
import { watchEvents } from '../firebase/events.js';
import { showToast } from '../core/toast.js';

const $ = (s) => document.querySelector(s);
const fmt = (v) => Number(v || 0).toLocaleString('ko-KR');
const fmtDate = (s) => {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1].slice(2)}.${m[2]}.${m[3]}` : s;
};

let gridApi, contracts = [], billings = [], events = [];
let selectedKey = null;
let currentFilter = 'all';

function getRows() {
  const today = new Date().toISOString().slice(0, 10);
  const todayDate = new Date(today);
  const byContract = new Map();
  billings.forEach(b => {
    const due = computeTotalDue(b);
    const paid = Number(b.paid_total) || 0;
    if (paid >= due) return;
    if (!b.due_date || b.due_date >= today) return;
    const c = contracts.find(x => x.contract_code === b.contract_code) || {};
    const key = b.contract_code || `${c.contractor_name || '-'}|${c.car_number || '-'}`;
    if (!byContract.has(key)) {
      byContract.set(key, {
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
        latest_due: '',
      });
    }
    const row = byContract.get(key);
    const days = Math.floor((todayDate - new Date(b.due_date)) / 86400000);
    row.unpaid_total += (due - paid);
    row.bill_count += 1;
    row.max_days = Math.max(row.max_days, days);
    if (!row.earliest_due || b.due_date < row.earliest_due) row.earliest_due = b.due_date;
    if (!row.latest_due || b.due_date > row.latest_due) row.latest_due = b.due_date;
  });

  let rows = [...byContract.values()];
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
  // 선택 유지
  if (selectedKey) renderDetail(selectedKey);
}

function renderDetail(key) {
  const host = $('#overdueDetail');
  const titleEl = $('#overdueDetailTitle');
  const subEl = $('#overdueDetailSub');
  const actionsEl = $('#overdueDetailActions');
  const today = new Date().toISOString().slice(0, 10);
  const todayDate = new Date(today);

  // 해당 계약의 전체 billings
  const rows = getRows();
  const row = rows.find(r => r.key === key);
  if (!row) {
    titleEl.textContent = '상세';
    subEl.textContent = '좌측에서 계약자를 선택하세요';
    actionsEl.innerHTML = '';
    host.innerHTML = '<div style="padding:24px;text-align:center;color:var(--c-text-muted)">선택 안됨</div>';
    return;
  }

  titleEl.innerHTML = `${row.contractor_name} <span style="color:var(--c-text-muted);font-weight:var(--fw)">· ${row.car_number}</span>`;
  subEl.textContent = `미납 ${fmt(row.unpaid_total)}원 · ${row.bill_count}회차 · 최장 ${row.max_days}일`;

  // 액션 버튼
  const phone = row.contractor_phone || '';
  actionsEl.innerHTML = `
    ${phone ? `<a href="tel:${phone}" class="btn" title="전화걸기"><i class="ph ph-phone"></i> ${phone}</a>` : ''}
    <button class="btn" id="overdueSendSms"><i class="ph ph-chat-circle-dots"></i> 알림톡</button>
  `;

  // 회차별 명세
  const cBills = billings
    .filter(b => b.contract_code === row.contract_code || (!b.contract_code && b.car_number === row.car_number))
    .sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')));

  const rowsHtml = cBills.map(b => {
    const due = computeTotalDue(b);
    const paid = Number(b.paid_total) || 0;
    const unpaid = due - paid;
    const isOverdue = unpaid > 0 && b.due_date && b.due_date < today;
    const days = b.due_date ? Math.floor((todayDate - new Date(b.due_date)) / 86400000) : 0;
    const status = paid >= due ? '완납' : (paid > 0 ? '부분입금' : (isOverdue ? `${days}일 연체` : '미수'));
    const statusColor = paid >= due ? 'var(--c-success)' : (isOverdue && days >= 30 ? '#991b1b' : isOverdue && days >= 7 ? 'var(--c-danger)' : 'var(--c-warn)');
    return `
      <tr data-id="${b.billing_id}">
        <td>${b.seq || '-'}</td>
        <td>${fmtDate(b.due_date)}</td>
        <td class="is-num">${fmt(due)}</td>
        <td class="is-num" style="color:var(--c-success)">${fmt(paid)}</td>
        <td class="is-num" style="color:${unpaid ? 'var(--c-danger)' : 'var(--c-text-muted)'};font-weight:${unpaid ? 600 : 400}">${fmt(unpaid)}</td>
        <td><span style="color:${statusColor};font-weight:500">${status}</span></td>
        <td>
          ${unpaid > 0 ? `<button class="btn btn-xs pay-btn" data-id="${b.billing_id}" data-unpaid="${unpaid}"><i class="ph ph-currency-krw"></i> 수금</button>` : ''}
        </td>
      </tr>`;
  }).join('');

  // 독촉 이력 (events collect 타입)
  const collectEvents = events
    .filter(e => e.type === 'collect' && (e.car_number === row.car_number || e.contract_code === row.contract_code))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, 5);
  const collectHtml = collectEvents.length ? `
    <div style="margin-top:16px;padding:0 16px">
      <div class="form-section-title" style="font-size:var(--font-size-sm);font-weight:600;color:var(--c-text-muted);margin-bottom:8px">
        <i class="ph ph-envelope"></i> 최근 독촉 이력
      </div>
      <div style="display:flex;flex-direction:column;gap:4px">
        ${collectEvents.map(e => `
          <div style="display:flex;gap:8px;font-size:var(--font-size-sm);padding:4px 0;border-bottom:1px solid var(--c-border)">
            <span style="color:var(--c-text-muted);width:80px">${fmtDate(e.date)}</span>
            <span style="flex:1">${e.collect_action || '-'} · ${e.collect_result || ''}</span>
            <span style="color:var(--c-text-muted)">${e.handler || ''}</span>
          </div>`).join('')}
      </div>
    </div>` : '';

  host.innerHTML = `
    <div style="padding:16px">
      <table class="grid-table" style="width:100%;margin-bottom:12px">
        <thead>
          <tr>
            <th style="width:50px">회차</th>
            <th style="width:90px">청구일</th>
            <th class="is-num" style="width:110px">청구액</th>
            <th class="is-num" style="width:110px">납부액</th>
            <th class="is-num" style="width:110px">미납액</th>
            <th style="width:100px">상태</th>
            <th style="width:90px"></th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    ${collectHtml}
    <!-- 빠른 수금 다이얼로그 -->
    <div id="payDialog" hidden style="position:fixed;inset:0;background:rgba(0,0,0,0.3);z-index:2000;display:flex;align-items:center;justify-content:center">
      <div style="background:var(--c-bg);border:1px solid var(--c-border);border-radius:var(--r-md);padding:20px;width:400px;max-width:90vw">
        <div style="font-weight:600;margin-bottom:12px"><i class="ph ph-currency-krw"></i> 수금 입력</div>
        <div style="font-size:var(--font-size-sm);color:var(--c-text-muted);margin-bottom:10px">미납액 <span id="payUnpaid">-</span>원</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <div class="field"><label>납부일</label><input type="date" id="payDate" value="${today}"></div>
          <div class="field"><label>납부액</label><input type="text" id="payAmount" inputmode="numeric" placeholder="0"></div>
          <div class="field"><label>납부방법</label>
            <div class="btn-group" data-name="payMethod">
              <span class="btn-opt is-active" data-val="계좌이체">계좌이체</span>
              <span class="btn-opt" data-val="카드">카드</span>
              <span class="btn-opt" data-val="현금">현금</span>
              <span class="btn-opt" data-val="자동이체">자동이체</span>
            </div>
            <input type="hidden" id="payMethodHidden" value="계좌이체">
          </div>
          <div class="field"><label>메모</label><input type="text" id="payNote" placeholder="특이사항"></div>
        </div>
        <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:14px">
          <button class="btn" id="payCancel">취소</button>
          <button class="btn btn-primary" id="payConfirm"><i class="ph ph-check"></i> 수금 저장</button>
        </div>
      </div>
    </div>
  `;

  // 수금 버튼
  host.querySelectorAll('.pay-btn').forEach(btn => {
    btn.addEventListener('click', () => openPayDialog(btn.dataset.id, Number(btn.dataset.unpaid)));
  });

  // 알림톡 버튼
  $('#overdueSendSms')?.addEventListener('click', () => {
    if (!phone) { showToast('연락처 없음', 'error'); return; }
    showToast('알림톡 발송은 Solapi 연동 필요 (준비중)', 'info');
  });
}

let _payBillingId = null;
function openPayDialog(billingId, unpaid) {
  _payBillingId = billingId;
  $('#payDialog').hidden = false;
  $('#payUnpaid').textContent = fmt(unpaid);
  $('#payAmount').value = unpaid.toLocaleString();
  const amt = $('#payAmount');
  amt.addEventListener('input', () => {
    const d = amt.value.replace(/[^\d]/g, '');
    amt.value = d ? Number(d).toLocaleString() : '';
  });
  $('#payCancel').addEventListener('click', () => { $('#payDialog').hidden = true; });
  // 납부방법 버튼 그룹
  const methodGroup = $('#payDialog .btn-group[data-name="payMethod"]');
  methodGroup.querySelectorAll('.btn-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      methodGroup.querySelectorAll('.btn-opt').forEach(o => o.classList.remove('is-active'));
      opt.classList.add('is-active');
      $('#payMethodHidden').value = opt.dataset.val;
    });
  });
  $('#payConfirm').addEventListener('click', async () => {
    const amount = Number(($('#payAmount').value || '').replace(/,/g, '')) || 0;
    if (amount <= 0) { showToast('납부액을 입력하세요', 'error'); return; }
    try {
      await addPaymentToBilling(_payBillingId, {
        date: $('#payDate').value,
        amount,
        method: $('#payMethodHidden').value,
        note: $('#payNote').value.trim(),
      });
      $('#payDialog').hidden = true;
      showToast('수금 저장 완료', 'success');
    } catch (e) {
      showToast('실패: ' + (e.message || e), 'error');
    }
  });
}

export async function mount() {
  gridApi = agGrid.createGrid($('#overdueGrid'), {
    columnDefs: [
      { headerName: '#', valueGetter: 'node.rowIndex+1', width: 45, cellStyle: { color: 'var(--c-text-muted)' } },
      { headerName: '계약자', field: 'contractor_name', width: 90 },
      { headerName: '차량', field: 'car_number', width: 95 },
      { headerName: '회사', field: 'partner_code', width: 60 },
      { headerName: '회차', field: 'bill_count', width: 55, type: 'numericColumn',
        valueFormatter: p => p.value ? `${p.value}` : '' },
      { headerName: '미납액', field: 'unpaid_total', flex: 1, minWidth: 100, type: 'numericColumn',
        valueFormatter: p => fmt(p.value),
        cellStyle: { color: 'var(--c-danger)', fontWeight: 600 } },
      { headerName: '최장', field: 'max_days', width: 70, type: 'numericColumn',
        valueFormatter: p => p.value ? `${p.value}일` : '',
        cellStyle: p => ({
          color: p.value >= 30 ? '#991b1b' : p.value >= 14 ? 'var(--c-danger)' : p.value >= 7 ? 'var(--c-warn)' : 'var(--c-text-sub)',
          fontWeight: 600,
        }) },
    ],
    rowData: [],
    defaultColDef: { resizable: true, sortable: true, filter: true, editable: false, minWidth: 50 },
    rowHeight: 28,
    headerHeight: 28,
    animateRows: false,
    suppressContextMenu: true,
    rowSelection: 'single',
    onRowClicked: (e) => {
      selectedKey = e.data?.key;
      if (selectedKey) renderDetail(selectedKey);
    },
    onGridReady: (p) => p.api.autoSizeAllColumns(),
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
