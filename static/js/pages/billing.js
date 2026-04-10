/**
 * pages/billing.js — 수납관리 (read-only)
 *
 * 좌: 계약 목록 (계약자/차량/미수합계)
 * 우: 선택 계약의 회차 (납부일자/방법/금액/잔액 — 계약 전체 누적)
 *
 * 입력은 자금일보(통장 업로드 + 자동매칭)에서만 가능.
 */
import { watchContracts } from '../firebase/contracts.js';
import { watchBillings, computeTotalDue, generateBillingsForContract } from '../firebase/billings.js';
import { showToast } from '../core/toast.js';

const $ = (s) => document.querySelector(s);
const fmt = (v) => Number(v || 0).toLocaleString('ko-KR');

let allContracts = [];
let allBillings = [];
let selectedContract = null;
let viewMode = 'matrix'; // 'matrix' | 'detail'
let selectedYear = new Date().getFullYear();

function summarize(code) {
  const items = allBillings.filter(b => b.contract_code === code);
  const total = items.reduce((s, b) => s + computeTotalDue(b), 0);
  const paid = items.reduce((s, b) => s + (Number(b.paid_total) || 0), 0);
  return { total, paid, unpaid: total - paid, count: items.length };
}

function statusBadge(b) {
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = b.status === '미수' && b.due_date && b.due_date < today;
  if (isOverdue) return '<span class="badge badge-danger">연체</span>';
  if (b.status === '완납') return '<span class="badge badge-success">완납</span>';
  if (b.status === '부분입금') return '<span class="badge badge-warn">부분</span>';
  return '<span class="badge">미수</span>';
}

function render() {
  const host = $('#billingHost');
  if (!host) return;
  if (viewMode === 'matrix') renderMatrix();
  else renderDetail();
}

// ─── 매트릭스 (활성 계약 × 12개월, 연도별) ─────────────────────
function normalizeDate(s) {
  if (!s) return '';
  let v = String(s).trim().replace(/[./]/g, '-');
  const m = v.match(/^(\d{2})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const yy = Number(m[1]);
    v = `${yy < 50 ? 2000 + yy : 1900 + yy}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  }
  return v;
}

function computeContractEnd(c) {
  if (c.end_date) return normalizeDate(c.end_date);
  const start = normalizeDate(c.start_date);
  if (!start || !c.rent_months) return '';
  const d = new Date(start);
  if (isNaN(d.getTime())) return '';
  d.setMonth(d.getMonth() + Number(c.rent_months));
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function initYearSelect() {
  const sel = document.getElementById('billingYear');
  if (!sel) return;
  const years = new Set();
  allBillings.forEach(b => { if (b.due_month) years.add(b.due_month.slice(0, 4)); });
  years.add(String(new Date().getFullYear()));
  const sorted = Array.from(years).sort().reverse();
  sel.innerHTML = sorted.map(y => `<option value="${y}" ${Number(y) === selectedYear ? 'selected' : ''}>${y}년</option>`).join('');
}

function renderMatrix() {
  const host = $('#billingHost');
  const info = $('#billingInfo');
  initYearSelect();

  // 1~12월 고정
  const months = [];
  for (let m = 1; m <= 12; m++) months.push(`${selectedYear}-${String(m).padStart(2,'0')}`);

  const today = new Date().toISOString().slice(0, 10);
  const yearStart = `${selectedYear}-01-01`;
  const yearEnd = `${selectedYear}-12-31`;

  // 해당 연도에 활성인 계약 (시작~종료 기간이 연도와 겹치면 표시, 종료일 없으면 진행 중)
  const activeContracts = allContracts.filter(c => {
    const start = normalizeDate(c.start_date);
    const end = computeContractEnd(c);
    if (!start) return allBillings.some(b => b.contract_code === c.contract_code && b.due_month && b.due_month.startsWith(String(selectedYear)));
    if (!end) return start <= yearEnd;
    return start <= yearEnd && end >= yearStart;
  });

  if (!activeContracts.length) {
    if (info) info.textContent = '';
    host.innerHTML = '<div style="padding:48px;text-align:center;color:var(--c-text-muted)">해당 연도에 활성 계약이 없습니다.</div>';
    return;
  }

  const rows = activeContracts.map(c => {
    const bills = allBillings.filter(b => b.contract_code === c.contract_code);
    const byMonth = {};
    bills.forEach(b => { if (b.due_month) byMonth[b.due_month] = b; });
    const yearBills = bills.filter(b => b.due_month && b.due_month.startsWith(String(selectedYear)));
    const yearDue = yearBills.reduce((s, b) => s + computeTotalDue(b), 0);
    const yearPaid = yearBills.reduce((s, b) => s + (Number(b.paid_total) || 0), 0);
    return { contract: c, byMonth, yearDue, yearPaid, yearUnpaid: yearDue - yearPaid };
  }).sort((a, b) => b.yearUnpaid - a.yearUnpaid);

  const totalDue = rows.reduce((s, r) => s + r.yearDue, 0);
  const totalUnpaid = rows.reduce((s, r) => s + r.yearUnpaid, 0);
  if (info) info.textContent = `${activeContracts.length}건 · 청구 ${fmt(totalDue)} · 미수 ${fmt(totalUnpaid)}`;

  // 월별 합계
  const monthTotals = months.map(m => {
    let due = 0, paid = 0;
    rows.forEach(r => {
      const b = r.byMonth[m];
      if (b) { due += computeTotalDue(b); paid += Number(b.paid_total) || 0; }
    });
    return { due, paid };
  });

  host.innerHTML = `
    <div style="overflow:auto;flex:1;min-height:0">
      <table class="grid-table" style="white-space:nowrap;min-width:max-content;font-size:11px">
        <thead>
          <tr>
            <th style="position:sticky;left:0;background:var(--c-bg-sub);z-index:2;min-width:80px">계약자</th>
            <th style="position:sticky;left:80px;background:var(--c-bg-sub);z-index:2;min-width:80px">차량</th>
            <th class="is-num" style="position:sticky;left:160px;background:var(--c-bg-sub);z-index:2;min-width:70px">월대여료</th>
            ${months.map(m => `<th class="is-num" style="min-width:80px">${Number(m.slice(5))}월</th>`).join('')}
            <th class="is-num" style="background:#fef3c7;min-width:80px">연미수</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => {
            const c = r.contract;
            return `<tr class="bl-matrix-row" data-code="${c.contract_code}" style="cursor:pointer">
              <td style="position:sticky;left:0;background:var(--c-bg);font-weight:500">${c.contractor_name || '-'}</td>
              <td style="position:sticky;left:80px;background:var(--c-bg);color:var(--c-text-muted)">${c.car_number || '-'}</td>
              <td class="is-num" style="position:sticky;left:160px;background:var(--c-bg)">${fmt(c.rent_amount)}</td>
              ${months.map(m => {
                const b = r.byMonth[m];
                if (!b) return '<td style="text-align:center;color:var(--c-text-faint)">-</td>';
                const due = computeTotalDue(b);
                const paid = Number(b.paid_total) || 0;
                const bal = due - paid;
                const isOverdue = b.due_date && b.due_date < today && bal > 0;
                let bg, color, text;
                if (paid >= due) {
                  bg = '#dcfce7'; color = '#16a34a'; text = fmt(paid);
                } else if (isOverdue) {
                  bg = '#fef2f2'; color = '#dc2626'; text = paid > 0 ? `${fmt(paid)}/${fmt(due)}` : fmt(due);
                } else if (paid > 0) {
                  bg = '#fefce8'; color = '#d97706'; text = `${fmt(paid)}/${fmt(due)}`;
                } else {
                  bg = ''; color = 'var(--c-text-muted)'; text = fmt(due);
                }
                return `<td class="is-num" style="background:${bg};color:${color}">${text}</td>`;
              }).join('')}
              <td class="is-num" style="background:#fef3c7;font-weight:600;color:${r.yearUnpaid > 0 ? '#dc2626' : '#16a34a'}">${r.yearUnpaid ? fmt(r.yearUnpaid) : '0'}</td>
            </tr>`;
          }).join('')}
          <tr style="background:var(--c-bg-sub);font-weight:600">
            <td style="position:sticky;left:0;background:var(--c-bg-sub)">합계</td>
            <td style="position:sticky;left:80px;background:var(--c-bg-sub)"></td>
            <td style="position:sticky;left:160px;background:var(--c-bg-sub)"></td>
            ${monthTotals.map(t => {
              const bal = t.due - t.paid;
              return `<td class="is-num" style="color:${bal > 0 ? '#dc2626' : '#16a34a'}">${t.due ? (bal > 0 ? `${fmt(t.paid)}/${fmt(t.due)}` : fmt(t.paid)) : '-'}</td>`;
            }).join('')}
            <td class="is-num" style="background:#fde68a;color:#dc2626">${fmt(totalUnpaid)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  host.querySelectorAll('.bl-matrix-row').forEach(row => {
    row.addEventListener('click', () => {
      selectedContract = row.dataset.code;
      viewMode = 'detail';
      render();
    });
  });
}

// ─── 디테일 (한 계약의 회차) ─────────────────────────────────
function renderDetail() {
  const host = $('#billingHost');
  const info = $('#billingInfo');
  const c = allContracts.find(x => x.contract_code === selectedContract);

  host.innerHTML = `
    <div style="flex:1;overflow:auto">
      <div style="padding:12px 16px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--c-border)">
        <button class="btn" id="blBack">← 전체</button>
        <span style="font-weight:600">${c?.contractor_name || '-'}</span>
        <span style="color:var(--c-text-muted)">${c?.car_number || '-'} · ${c?.contract_code || ''}</span>
      </div>
      <div id="blDetailBody" style="padding:0"></div>
    </div>
  `;

  document.getElementById('blBack')?.addEventListener('click', () => {
    viewMode = 'matrix';
    selectedContract = null;
    render();
  });

  renderSchedule();
}

function renderContracts() {
  const left = $('#blLeft');
  if (!left) return;
  const info = $('#billingInfo');
  if (info) info.textContent = `계약 ${allContracts.length}건`;

  if (!allContracts.length) {
    left.innerHTML = '<div style="padding:24px;color:var(--c-text-muted);text-align:center">계약이 없습니다.</div>';
    return;
  }

  left.innerHTML = `<table class="grid-table">
    <thead><tr><th>계약</th><th>계약자</th><th>차량</th><th class="is-num">청구</th><th class="is-num">미수</th></tr></thead>
    <tbody>${allContracts.map(c => {
      const sum = summarize(c.contract_code);
      const active = selectedContract === c.contract_code ? ' is-active' : '';
      return `<tr class="bl-row${active}" data-code="${c.contract_code}" style="cursor:pointer">
        <td>${c.contract_code}</td>
        <td>${c.contractor_name || '-'}</td>
        <td>${c.car_number || '-'}</td>
        <td class="is-num">${fmt(sum.total)}</td>
        <td class="is-num" style="color:${sum.unpaid > 0 ? 'var(--c-danger)' : 'var(--c-success)'}">${fmt(sum.unpaid)}</td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;

  left.querySelectorAll('.bl-row').forEach(row => {
    row.addEventListener('click', async () => {
      selectedContract = row.dataset.code;
      // 회차 없으면 자동 생성
      const has = allBillings.some(b => b.contract_code === selectedContract);
      if (!has) {
        const c = allContracts.find(x => x.contract_code === selectedContract);
        if (c) {
          try {
            const r = await generateBillingsForContract(c);
            showToast(`회차 ${r.created || 0}건 생성`, 'success');
          } catch (e) { showToast(e.message, 'error'); }
        }
      }
      render();
    });
  });
}

function renderSchedule() {
  const right = $('#blDetailBody') || $('#blRight');
  if (!right) return;
  if (!selectedContract) {
    right.innerHTML = '<div style="padding:24px;color:var(--c-text-muted);text-align:center">계약을 선택하세요.</div>';
    return;
  }
  const items = allBillings
    .filter(b => b.contract_code === selectedContract)
    .sort((a, b) => (a.seq || 0) - (b.seq || 0));
  if (!items.length) {
    right.innerHTML = '<div style="padding:24px;color:var(--c-text-muted);text-align:center">회차가 없습니다.</div>';
    return;
  }

  const balColor = (bal) => bal > 0 ? 'var(--c-danger)' : (bal < 0 ? '#0ea5e9' : 'var(--c-success)');
  const rows = [];
  let running = 0;

  items.forEach(b => {
    const totalDue = computeTotalDue(b);
    running += totalDue;
    const payments = (Array.isArray(b.payments) ? b.payments : []).slice()
      .sort((a, c) => String(a.date || '').localeCompare(String(c.date || '')));

    if (!payments.length) {
      rows.push(`<tr style="border-top:1px solid var(--c-border)">
        <td style="font-weight:600">${b.seq} <span style="font-weight:400;font-size:10px;color:var(--c-text-muted)">(${b.due_date || '-'})</span></td>
        <td style="color:var(--c-text-muted)">미납</td>
        <td style="color:var(--c-text-muted)">-</td>
        <td class="is-num" style="font-weight:600">${fmt(totalDue)}</td>
        <td class="is-num" style="color:var(--c-text-muted)">-</td>
        <td class="is-num" style="color:${balColor(running)};font-weight:600">${fmt(running)}</td>
      </tr>`);
    } else {
      payments.forEach((p, i) => {
        const amt = Number(p.amount) || 0;
        running -= amt;
        rows.push(`<tr ${i === 0 ? 'style="border-top:1px solid var(--c-border)"' : ''}>
          <td style="font-weight:600">${i === 0 ? `${b.seq} <span style="font-weight:400;font-size:10px;color:var(--c-text-muted)">(${b.due_date || '-'})</span>` : ''}</td>
          <td>${p.date || '-'}</td>
          <td>${p.method || '-'}</td>
          <td class="is-num" style="font-weight:600">${i === 0 ? fmt(totalDue) : ''}</td>
          <td class="is-num" style="color:var(--c-success)">${fmt(amt)}</td>
          <td class="is-num" style="color:${balColor(running)};font-weight:${running === 0 ? 600 : 400}">${fmt(running)}</td>
        </tr>`);
      });
    }
  });

  right.innerHTML = `<table class="grid-table">
    <thead><tr><th style="width:100px">회차</th><th>납부일자</th><th>납부방법</th><th class="is-num">청구</th><th class="is-num">납부</th><th class="is-num">잔액</th></tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table>`;
}

export async function mount() {
  watchContracts((items) => { allContracts = items; render(); });
  watchBillings((items) => { allBillings = items; render(); });
  document.getElementById('billingYear')?.addEventListener('change', (e) => {
    selectedYear = Number(e.target.value);
    render();
  });
}
