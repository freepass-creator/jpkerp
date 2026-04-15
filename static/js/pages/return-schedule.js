/**
 * pages/return-schedule.js — 반납관리
 *
 * 계약 만기일 기준 반납 예정 리스트 (D-day 순)
 * events 컬렉션의 event_type='return_scheduled' 또는
 * 계약에서 직접 만기일 계산
 */
import { watchContracts } from '../firebase/contracts.js';
import { watchAssets } from '../firebase/assets.js';
import { watchEvents } from '../firebase/events.js';

const $ = s => document.querySelector(s);
const fmtDate = s => s ? s.slice(0, 10).replace(/-/g, '.') : '';

let gridApi = null;
let contracts = [];
let assets = [];
let events = [];

export async function mount() {
  initGrid();
  bindFilters();
  watchContracts(items => { contracts = items; refresh(); });
  watchAssets(items => { assets = items; refresh(); });
  watchEvents(items => { events = items; refresh(); });
}

function initGrid() {
  gridApi = agGrid.createGrid($('#rtGrid'), {
    columnDefs: [
      { headerName: '#', valueGetter: 'node.rowIndex + 1', width: 45 },
      { headerName: '상태', field: '_status', width: 80,
        cellStyle: p => {
          if (p.value === '만기초과') return { color: '#fff', background: 'var(--c-danger)', textAlign: 'center', fontWeight: 600 };
          if (p.value === '임박') return { color: '#fff', background: 'var(--c-warn)', textAlign: 'center', fontWeight: 600 };
          if (p.value === '완료') return { color: 'var(--c-text-muted)', textAlign: 'center' };
          return { color: 'var(--c-success)', textAlign: 'center' };
        } },
      { headerName: 'D-Day', field: '_dday', width: 70, type: 'numericColumn',
        cellStyle: p => {
          if (p.value < 0) return { color: 'var(--c-danger)', fontWeight: 600 };
          if (p.value <= 7) return { color: 'var(--c-warn)', fontWeight: 600 };
          return {};
        },
        valueFormatter: p => p.value > 0 ? `D-${p.value}` : p.value === 0 ? 'D-Day' : `D+${Math.abs(p.value)}` },
      { headerName: '만기일', field: 'end_date', width: 110, valueFormatter: p => fmtDate(p.value) },
      { headerName: '차량번호', field: 'car_number', width: 100 },
      { headerName: '차량', field: '_car_info', width: 140 },
      { headerName: '계약자', field: 'contractor_name', width: 100 },
      { headerName: '연락처', field: 'contractor_phone', width: 110 },
      { headerName: '계약기간', field: '_period', width: 180 },
      { headerName: '월대여료', field: 'rent_amount', width: 100, type: 'numericColumn', valueFormatter: p => p.value ? Number(p.value).toLocaleString() : '' },
      { headerName: '계약코드', field: 'contract_code', width: 100 },
      { headerName: '비고', field: 'note', flex: 1 },
    ],
    rowData: [],
    defaultColDef: { resizable: true, sortable: true, filter: true, minWidth: 40 },
    rowHeight: 32,
    headerHeight: 28,
    animateRows: false,
    suppressContextMenu: true,
  });
}

function refresh() {
  const today = new Date().toISOString().slice(0, 10);
  const todayMs = new Date(today).getTime();
  const filter = $('#rtFilter')?.value || 'upcoming';

  let rows = contracts
    .filter(c => c.status !== 'deleted' && c.contract_status !== '계약해지')
    .map(c => {
      const end = c.end_date || computeEnd(c);
      const asset = assets.find(a => a.car_number === c.car_number);
      const dday = end ? Math.ceil((new Date(end) - todayMs) / 86400000) : null;
      let _status;
      if (c.contract_status === '계약완료' || c.contract_status === '반납완료') _status = '완료';
      else if (dday === null) _status = '-';
      else if (dday < 0) _status = '만기초과';
      else if (dday <= 7) _status = '임박';
      else _status = '예정';

      return {
        ...c,
        end_date: end,
        _car_info: asset ? `${asset.manufacturer || ''} ${asset.car_model || ''}`.trim() : '',
        _period: `${fmtDate(c.start_date)} ~ ${fmtDate(end)}`,
        _dday: dday,
        _status,
      };
    });

  // 필터
  if (filter === 'upcoming') rows = rows.filter(r => r._dday !== null && r._dday >= 0 && r._dday <= 30 && r._status !== '완료');
  else if (filter === 'overdue') rows = rows.filter(r => r._dday !== null && r._dday < 0 && r._status !== '완료');
  else if (filter === 'this_month') {
    const [y, m] = today.split('-');
    rows = rows.filter(r => r.end_date && r.end_date.startsWith(`${y}-${m}`));
  }

  // D-day 순 정렬
  rows.sort((a, b) => (a._dday ?? 9999) - (b._dday ?? 9999));

  gridApi?.setGridOption('rowData', rows);
  $('#rtSubtitle').textContent = `${rows.length}건`;
}

function computeEnd(c) {
  if (!c.start_date || !c.rent_months) return '';
  const d = new Date(c.start_date);
  if (isNaN(d)) return '';
  d.setMonth(d.getMonth() + Number(c.rent_months));
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function bindFilters() {
  $('#rtFilter')?.addEventListener('change', refresh);
}
