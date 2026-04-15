/**
 * pages/ledger.js — 입출금내역
 *
 * events 컬렉션 전체를 기간별로 조회.
 * 일별/주간/월별/분기/반기/연도 — 기간 선택 시 그룹핑 또는 필터.
 * 상단 요약 (입금합/출금합/순합) + AG Grid
 */
import { watchEvents, EVENT_TYPES } from '../firebase/events.js';
import { showToast } from '../core/toast.js';

const $ = (s) => document.querySelector(s);
const fmt = (v) => Number(v || 0).toLocaleString('ko-KR');
const fmtDate = (s) => {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1].slice(2)}.${m[2]}.${m[3]}` : s;
};

let allEvents = [];
let gridApi = null;
let activePeriod = 'day';
let selectedMonth = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
})();

function isIn(e) {
  return e.direction === 'in';
}

// ─── 기간 필터 ────────────────────────────────────────────
function getDateRange() {
  const [y, m] = selectedMonth.split('-').map(Number);
  switch (activePeriod) {
    case 'day':
    case 'month':
      return { start: `${y}-${String(m).padStart(2,'0')}-01`, end: `${y}-${String(m).padStart(2,'0')}-31` };
    case 'week': {
      const today = new Date();
      const dow = today.getDay() || 7;
      const mon = new Date(today); mon.setDate(today.getDate() - dow + 1);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      const ds = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      return { start: ds(mon), end: ds(sun) };
    }
    case 'quarter': {
      const q = Math.ceil(m / 3);
      return { start: `${y}-${String((q-1)*3+1).padStart(2,'0')}-01`, end: `${y}-${String(q*3).padStart(2,'0')}-31` };
    }
    case 'half':
      return m <= 6
        ? { start: `${y}-01-01`, end: `${y}-06-30` }
        : { start: `${y}-07-01`, end: `${y}-12-31` };
    case 'year':
      return { start: `${y}-01-01`, end: `${y}-12-31` };
    default:
      return { start: `${y}-${String(m).padStart(2,'0')}-01`, end: `${y}-${String(m).padStart(2,'0')}-31` };
  }
}

function periodLabel() {
  const [y, m] = selectedMonth.split('-').map(Number);
  switch (activePeriod) {
    case 'day': return `${y}년 ${m}월`;
    case 'week': { const r = getDateRange(); return `${fmtDate(r.start)} ~ ${fmtDate(r.end)}`; }
    case 'month': return `${y}년 ${m}월`;
    case 'quarter': return `${y}년 ${Math.ceil(m/3)}분기`;
    case 'half': return `${y}년 ${m <= 6 ? '상반기' : '하반기'}`;
    case 'year': return `${y}년`;
    default: return '';
  }
}

function filteredEvents() {
  const { start, end } = getDateRange();
  return allEvents.filter(e => e.date && e.date >= start && e.date <= end);
}

// ─── 그룹핑 (일별이 아닌 경우 일자별 소계) ──────────────────
function buildRows() {
  const events = filteredEvents();
  if (activePeriod === 'day' || activePeriod === 'week') {
    // 개별 거래 행
    return events
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      .map(e => ({
        date: e.date,
        type: EVENT_TYPES[e.type] || e.type || '-',
        direction: isIn(e) ? '입금' : '출금',
        amount: e.amount || 0,
        counterparty: e.counterparty || '',
        account: e.account || '',
        summary: e.summary || e.memo || '',
        balance: e.balance || null,
        _isIn: isIn(e),
      }));
  }

  // 그룹핑: 날짜별 소계
  const byDate = {};
  events.forEach(e => {
    const d = e.date || '(없음)';
    if (!byDate[d]) byDate[d] = { date: d, inAmt: 0, outAmt: 0, count: 0 };
    if (isIn(e)) byDate[d].inAmt += e.amount || 0;
    else byDate[d].outAmt += e.amount || 0;
    byDate[d].count++;
  });
  return Object.values(byDate)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .map(d => ({
      date: d.date,
      type: `${d.count}건`,
      direction: '',
      inAmt: d.inAmt,
      outAmt: d.outAmt,
      net: d.inAmt - d.outAmt,
    }));
}

function renderSummary() {
  const events = filteredEvents();
  const inSum = events.filter(e => isIn(e)).reduce((s, e) => s + (e.amount || 0), 0);
  const outSum = events.filter(e => !isIn(e)).reduce((s, e) => s + (e.amount || 0), 0);
  const net = inSum - outSum;
  const host = $('#ledgerSummary');
  host.innerHTML = `
    <div style="padding:12px 20px;display:flex;gap:32px;align-items:center">
      <div style="font-weight:600">${periodLabel()}</div>
      <div><span style="color:var(--c-text-muted);font-size:11px">입금</span> <span style="font-weight:600;color:var(--c-success)">${fmt(inSum)}</span></div>
      <div><span style="color:var(--c-text-muted);font-size:11px">출금</span> <span style="font-weight:600;color:var(--c-danger)">${fmt(outSum)}</span></div>
      <div><span style="color:var(--c-text-muted);font-size:11px">순합</span> <span style="font-weight:600;color:${net >= 0 ? 'var(--c-success)' : 'var(--c-danger)'}">${fmt(net)}</span></div>
      <div style="color:var(--c-text-muted);font-size:11px">${events.length}건</div>
    </div>
  `;
}

function getColumnDefs() {
  if (activePeriod === 'day' || activePeriod === 'week') {
    return [
      { headerName: '일자', field: 'date', width: 85, valueFormatter: p => fmtDate(p.value) },
      { headerName: '유형', field: 'type', width: 75 },
      { headerName: '방향', field: 'direction', width: 55,
        cellStyle: p => ({ fontWeight: 500, color: p.data._isIn ? 'var(--c-success)' : 'var(--c-danger)' }) },
      { headerName: '금액', field: 'amount', width: 110, type: 'numericColumn',
        valueFormatter: p => fmt(p.value),
        cellStyle: p => ({ color: p.data._isIn ? 'var(--c-success)' : 'var(--c-danger)' }) },
      { headerName: '상대방', field: 'counterparty', width: 130 },
      { headerName: '계좌', field: 'account', width: 140 },
      { headerName: '적요/메모', field: 'summary', flex: 1 },
      { headerName: '잔액', field: 'balance', width: 110, type: 'numericColumn',
        valueFormatter: p => p.value ? fmt(p.value) : '' },
    ];
  }
  // 그룹핑 컬럼
  return [
    { headerName: '일자', field: 'date', width: 85, valueFormatter: p => fmtDate(p.value) },
    { headerName: '건수', field: 'type', width: 70 },
    { headerName: '입금', field: 'inAmt', width: 120, type: 'numericColumn',
      valueFormatter: p => p.value ? fmt(p.value) : '-',
      cellStyle: { color: 'var(--c-success)' } },
    { headerName: '출금', field: 'outAmt', width: 120, type: 'numericColumn',
      valueFormatter: p => p.value ? fmt(p.value) : '-',
      cellStyle: { color: 'var(--c-danger)' } },
    { headerName: '순합', field: 'net', width: 120, type: 'numericColumn',
      valueFormatter: p => fmt(p.value),
      cellStyle: p => ({ fontWeight: 500, color: p.value >= 0 ? 'var(--c-success)' : 'var(--c-danger)' }) },
  ];
}

function refresh() {
  renderSummary();
  const rows = buildRows();
  const info = $('#ledgerInfo');
  if (info) info.textContent = `입출금내역 · ${rows.length}건`;

  if (gridApi) gridApi.destroy();
  gridApi = agGrid.createGrid($('#ledgerGrid'), {
    columnDefs: getColumnDefs(),
    rowData: rows,
    defaultColDef: { resizable: true, sortable: true, editable: false, minWidth: 50 },
    rowHeight: 28,
    headerHeight: 28,
    animateRows: false,
    suppressContextMenu: true,
    onRowClicked: (e) => { if(e.data && (activePeriod==='day'||activePeriod==='week')) showLedgerDetail(e.data); },
  });
  $('#ledgerGrid')._agApi = gridApi;
}

const row = (l,v) => v ? `<tr><td style="padding:6px 12px 6px 0;color:var(--c-text-muted);width:100px">${l}</td><td style="padding:6px 0;font-weight:500">${v}</td></tr>` : '';
function showLedgerDetail(d) {
  const grid = $('#ledgerGrid');
  const detail = $('#ledgerDetailView');
  grid.style.display='none'; detail.hidden=false; detail.style.display='block';
  detail.innerHTML = `<div style="max-width:800px;margin:0 auto;padding:24px">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
      <button class="btn" id="ledgerBack">← 목록</button>
      <span style="font-size:var(--font-size-lg);font-weight:700">${d._isIn?'💰':'💳'} ${d.counterparty||d.type||''}</span>
    </div>
    <div style="background:var(--c-bg);border:1px solid var(--c-border);border-radius:var(--r-md);padding:20px">
      <table style="width:100%;border-collapse:collapse;font-size:var(--font-size)">
        ${row('일자',fmtDate(d.date))}${row('유형',d.type)}${row('방향',d.direction)}
        ${row('금액',fmt(d.amount)+'원')}${row('상대방',d.counterparty)}
        ${row('계좌',d.account)}${row('적요',d.summary)}${row('메모',d.memo)}
        ${row('잔액',d.balance?fmt(d.balance)+'원':'')}
      </table>
    </div></div>`;
  document.getElementById('ledgerBack')?.addEventListener('click',()=>{detail.style.display='none';detail.hidden=true;grid.style.display='';});
}

export async function mount() {
  $('#ledgerMonth').value = selectedMonth;

  watchEvents((items) => {
    allEvents = items;
    refresh();
  });

  document.querySelectorAll('.ledger-period').forEach(btn => {
    btn.addEventListener('click', () => {
      activePeriod = btn.dataset.period;
      document.querySelectorAll('.ledger-period').forEach(b => b.classList.toggle('is-active', b === btn));
      refresh();
    });
  });

  $('#ledgerMonth')?.addEventListener('change', (e) => {
    selectedMonth = e.target.value;
    refresh();
  });
}
