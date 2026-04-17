/**
 * pages/status-ignition.js — 시동제어 현황
 * 목록 + 우측 이력/상태변경
 */
import { watchContracts } from '../firebase/contracts.js';
import { watchBillings, computeTotalDue, computeOverdueDays } from '../firebase/billings.js';
import { watchEvents } from '../firebase/events.js';
import { watchAssets } from '../firebase/assets.js';
import { showContextMenu } from '../core/context-menu.js';

const $ = (s) => document.querySelector(s);
const fmt = (v) => { const n = Number(v || 0); return n ? n.toLocaleString() : '-'; };
const fmtDate = (s) => {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1].slice(2)}.${m[2]}.${m[3]}` : s;
};

const ACTION_COLOR = {
  '시동제어': '#ea580c',
  '제어해제': 'var(--c-success)',
};
const ACTION_STEPS = ['시동제어', '제어해제'];

let gridApi, contracts = [], billings = [], events = [], assets = [];
let selectedRow = null;

function buildRows() {
  return contracts
    .filter(c => c.status !== 'deleted' && ACTION_STEPS.includes(c.action_status))
    .map(c => {
      const carBills = billings.filter(b => b.contract_code === c.contract_code && b.status !== 'deleted');
      let unpaidCount = 0, unpaidSum = 0, maxOverdue = 0;
      carBills.forEach(b => {
        const due = computeTotalDue(b);
        const paid = Number(b.paid_total) || 0;
        if (paid < due) {
          unpaidCount++;
          unpaidSum += (due - paid);
          const od = computeOverdueDays(b);
          if (od > maxOverdue) maxOverdue = od;
        }
      });
      return {
        partner_code: c.partner_code || '-',
        car_number: c.car_number || '-',
        contractor_name: c.contractor_name || '-',
        contractor_phone: c.contractor_phone || '-',
        action_status: c.action_status,
        unpaid_count: unpaidCount,
        unpaid_sum: unpaidSum,
        max_overdue_days: maxOverdue,
        contract_code: c.contract_code || '',
        _contract: c,
      };
    })
    .sort((a, b) => b.max_overdue_days - a.max_overdue_days);
}

function refresh() {
  if (!gridApi) return;
  const rows = buildRows();
  gridApi.setGridOption('rowData', rows);
  const cnt = $('#igCount');
  if (cnt) cnt.textContent = rows.length;
  if (selectedRow) {
    const updated = rows.find(r => r.contract_code === selectedRow.contract_code);
    if (updated) { selectedRow = updated; renderDetail(updated); }
  }
}

function renderDetail(row) {
  const host = $('#igHistory');
  const titleEl = $('#igHistoryTitle');
  const subEl = $('#igHistorySub');
  const c = row._contract;
  const asset = assets.find(a => a.car_number === row.car_number);

  titleEl.textContent = row.car_number;
  subEl.textContent = `${row.contractor_name} · ${row.contract_code}`;

  // 상태 변경 버튼
  const statusBtns = ACTION_STEPS.map(s =>
    `<span class="btn-opt${s === row.action_status ? ' is-active' : ''}" data-action="${s}">${s}</span>`
  ).join('');

  // 계약 정보
  const infoHtml = `
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-warning-octagon" style="color:#dc2626"></i>조치 상태</div>
      <div class="btn-group" id="igActionGroup" style="padding:0 4px;margin-bottom:var(--sp-3)">
        ${statusBtns}
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-user"></i>계약 정보</div>
      <div class="ioc-car-info">
        <div class="ioc-car-col">
          <div class="ioc-car-row"><span class="k">계약자</span><span class="v">${c.contractor_name || '-'}</span></div>
          <div class="ioc-car-row"><span class="k">연락처</span><span class="v">${c.contractor_phone || '-'}</span></div>
          <div class="ioc-car-row"><span class="k">계약코드</span><span class="v">${c.contract_code || '-'}</span></div>
        </div>
        <div class="ioc-car-col">
          <div class="ioc-car-row"><span class="k">미납</span><span class="v" style="color:var(--c-danger);font-weight:var(--fw-bold)">${row.unpaid_count}회 / ${fmt(row.unpaid_sum)}</span></div>
          <div class="ioc-car-row"><span class="k">최장연체</span><span class="v" style="color:var(--c-danger);font-weight:var(--fw-bold)">${row.max_overdue_days}일</span></div>
          <div class="ioc-car-row"><span class="k">월대여료</span><span class="v">${fmt(c.rent_amount)}</span></div>
        </div>
      </div>
    </div>`;

  // 이력
  const carEvents = events
    .filter(e => e.car_number === row.car_number && e.status !== 'deleted')
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, 15);

  const EVENT_META = {
    delivery: { icon: 'ph-truck', color: '#10b981', label: '출고' },
    return:   { icon: 'ph-arrow-u-down-left', color: '#059669', label: '반납' },
    force:    { icon: 'ph-warning-octagon', color: '#dc2626', label: '강제회수' },
    transfer: { icon: 'ph-arrows-left-right', color: '#14b8a6', label: '이동' },
    maint:    { icon: 'ph-wrench', color: '#f97316', label: '정비' },
    repair:   { icon: 'ph-hammer', color: '#ea580c', label: '사고수리' },
    product:  { icon: 'ph-sparkle', color: '#8b5cf6', label: '상품화' },
    wash:     { icon: 'ph-drop', color: '#a855f7', label: '세차' },
    accident: { icon: 'ph-car-profile', color: '#ef4444', label: '사고' },
    contact:  { icon: 'ph-phone', color: '#3b82f6', label: '고객���터' },
    insurance:{ icon: 'ph-shield-check', color: '#7c3aed', label: '보험' },
  };

  const eventsHtml = carEvents.length ? carEvents.map(e => {
    const m = EVENT_META[e.type] || { icon: 'ph-circle', color: 'var(--c-text-muted)', label: e.type || '-' };
    return `<div class="dash-todo">
      <i class="ph ${m.icon}" style="color:${m.color};flex-shrink:0"></i>
      <div class="dash-todo-body">
        <div class="dash-todo-label">${m.label}</div>
        <div class="dash-todo-item-sub">${e.title || ''}</div>
      </div>
      <span style="font-size:var(--font-size-xs);color:var(--c-text-muted)">${fmtDate(e.date)}</span>
    </div>`;
  }).join('') : '<div class="form-section" style="color:var(--c-text-muted)">이력 없음</div>';

  host.innerHTML = `
    ${infoHtml}
    <div class="form-section">
      <div class="form-section-title"><i class="ph ph-clock-counter-clockwise"></i>운영 이력</div>
    </div>
    ${eventsHtml}
  `;

  // 상태 변경 바인딩
  host.querySelectorAll('#igActionGroup .btn-opt').forEach(btn => {
    btn.addEventListener('click', async () => {
      const newStatus = btn.dataset.action;
      if (newStatus === row.action_status) return;
      try {
        const { updateContract } = await import('../firebase/contracts.js');
        await updateContract(c.contract_code, { action_status: newStatus });
        host.querySelectorAll('#igActionGroup .btn-opt').forEach(b => b.classList.toggle('is-active', b === btn));
      } catch (err) {
        const toast = document.createElement('div');
        toast.className = 'toast toast-error';
        toast.textContent = err.message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
      }
    });
  });
}

export async function mount() {
  const el = $('#igGrid');
  if (!el) return;

  gridApi = agGrid.createGrid(el, {
    columnDefs: [
      { headerName: '#', valueGetter: 'node.rowIndex+1', width: 45, cellStyle: { color: 'var(--c-text-muted)' } },
      { headerName: '회사코드', field: 'partner_code', width: 75 },
      { headerName: '차량번호', field: 'car_number', width: 95, cellStyle: { fontWeight: 'var(--fw-bold)' } },
      { headerName: '계약자', field: 'contractor_name', width: 80 },
      { headerName: '연락처', field: 'contractor_phone', width: 105 },
      { headerName: '조치상태', field: 'action_status', width: 85,
        cellStyle: p => ({ color: ACTION_COLOR[p.value] || 'var(--c-text)', fontWeight: 'var(--fw-bold)' }) },
      { headerName: '미납', field: 'unpaid_count', width: 60, filter: false,
        valueFormatter: p => p.value ? `${p.value}회` : '-',
        cellStyle: p => ({ textAlign: 'right', color: p.value ? 'var(--c-danger)' : 'var(--c-text-muted)', fontWeight: 'var(--fw-bold)' }) },
      { headerName: '미납��', field: 'unpaid_sum', width: 100, filter: false,
        valueFormatter: p => fmt(p.value),
        cellStyle: { textAlign: 'right', color: 'var(--c-danger)' } },
      { headerName: '연체일', field: 'max_overdue_days', width: 70, sort: 'desc', filter: false,
        valueFormatter: p => p.value ? `${p.value}일` : '-',
        cellStyle: p => ({
          textAlign: 'right', fontWeight: 'var(--fw-bold)',
          color: p.value >= 60 ? '#7f1d1d' : p.value >= 30 ? 'var(--c-danger)' : 'var(--c-warn)',
        }) },
    ],
    rowData: [],
    defaultColDef: { resizable: true, sortable: true, filter: 'agTextColumnFilter', editable: false, minWidth: 50 },
    rowHeight: 28,
    headerHeight: 28,
    animateRows: false,
    rowSelection: 'single',
    onRowClicked: (e) => {
      selectedRow = e.data;
      if (selectedRow) renderDetail(selectedRow);
    },
    onGridReady: (p) => p.api.autoSizeAllColumns(),
  });
  el._agApi = gridApi;

  // 우클릭 — 상태 즉시 변경
  el.addEventListener('contextmenu', (e) => {
    const rowEl = e.target.closest('.ag-row');
    if (!rowEl) return;
    e.preventDefault();
    const rowIndex = Number(rowEl.getAttribute('row-index'));
    const node = gridApi.getDisplayedRowAtIndex(rowIndex);
    const row = node?.data;
    if (!row) return;
    selectedRow = row;
    node.setSelected(true);
    renderDetail(row);

    const c = row._contract;
    const menuItems = [];
    if (row.action_status !== '시동제어') {
      menuItems.push({ label: '시동제어로 변경', icon: '🔒', action: () => changeStatus(c, '시동제어') });
    }
    if (row.action_status !== '제어해제') {
      menuItems.push({ label: '제어해제', icon: '🔓', action: () => changeStatus(c, '제어해제') });
    }
    menuItems.push('sep');
    menuItems.push({ label: '상세 보기', icon: '📋', action: () => renderDetail(row) });
    showContextMenu(e, menuItems);
  });

  watchContracts((items) => { contracts = items; refresh(); });
  watchBillings((items) => { billings = items; refresh(); });
  watchEvents((items) => { events = items; refresh(); });
  watchAssets((items) => { assets = items; });
}

async function changeStatus(contract, newStatus) {
  try {
    const { updateContract } = await import('../firebase/contracts.js');
    await updateContract(contract.contract_code, { action_status: newStatus });
    const toast = document.createElement('div');
    toast.className = 'toast toast-success';
    toast.textContent = `조치상태 → ${newStatus}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  } catch (err) {
    const toast = document.createElement('div');
    toast.className = 'toast toast-error';
    toast.textContent = err.message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }
}
