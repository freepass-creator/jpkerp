/**
 * pages/admin-approval.js — 전자결재
 *
 * 좌: 결재 목록 (상태별 필터)
 * 우: 선택한 결재 상세 + 승인/반려
 */
import { watchApprovals } from '../firebase/approvals.js';
import { showToast } from '../core/toast.js';

const $ = (s) => document.querySelector(s);
const fmtTs = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getFullYear()).slice(2)}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
};
const fmt = (v) => Number(v || 0).toLocaleString('ko-KR');

let approvals = [];
const STATUS = {
  draft: { label: '임시', color: 'var(--c-text-muted)' },
  pending: { label: '결재중', color: 'var(--c-warn)' },
  approved: { label: '승인', color: 'var(--c-success)' },
  rejected: { label: '반려', color: 'var(--c-danger)' },
  canceled: { label: '취소', color: 'var(--c-text-muted)' },
};

function renderList() {
  const host = $('#approvalList');
  if (!approvals.length) {
    host.innerHTML = '<div style="padding:24px;text-align:center;color:var(--c-text-muted)">결재 없음</div>';
    return;
  }
  host.innerHTML = approvals.map(a => {
    const st = STATUS[a.status] || STATUS.draft;
    return `<div class="op-type" data-id="${a.approval_id}" style="cursor:pointer">
      <span class="op-type__icon" style="font-size:var(--font-size);color:${st.color}">●</span>
      <span class="op-type__label">${a.title || '-'}</span>
      <span class="op-type__sub">${fmtTs(a.created_at)} · ${st.label}</span>
    </div>`;
  }).join('');

  host.querySelectorAll('.op-type').forEach(el => {
    el.addEventListener('click', () => showDetail(el.dataset.id));
  });
}

function showDetail(id) {
  const a = approvals.find(x => x.approval_id === id);
  if (!a) return;
  const st = STATUS[a.status] || STATUS.draft;
  $('#approvalDetailTitle').textContent = a.title || '상세';
  $('#approvalDetail').innerHTML = `
    <div style="max-width:600px">
      <div style="display:flex;gap:12px;margin-bottom:16px;align-items:center">
        <span style="font-weight:600;font-size:var(--font-size-md)">${a.title}</span>
        <span style="color:${st.color};font-weight:500;font-size:var(--font-size-sm)">${st.label}</span>
      </div>
      <table style="width:100%;font-size:var(--font-size-sm);border-collapse:collapse">
        <tr><td style="padding:6px 0;color:var(--c-text-muted);width:80px">기안자</td><td style="padding:6px 0">${a.drafter || '-'}</td></tr>
        <tr><td style="padding:6px 0;color:var(--c-text-muted)">기안일</td><td style="padding:6px 0">${fmtTs(a.created_at)}</td></tr>
        ${a.amount ? `<tr><td style="padding:6px 0;color:var(--c-text-muted)">금액</td><td style="padding:6px 0;font-weight:600">${fmt(a.amount)}원</td></tr>` : ''}
      </table>
      <div style="margin-top:12px;padding:12px;background:var(--c-bg-sub);border-radius:var(--r-md);white-space:pre-wrap;font-size:var(--font-size-sm)">${a.content || '내용 없음'}</div>
      ${a.approval_line?.length ? `
        <div style="margin-top:16px;font-weight:600;font-size:var(--font-size-sm)">결재선</div>
        ${a.approval_line.map(l => {
          const ls = STATUS[l.status] || STATUS.draft;
          return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--c-border);font-size:var(--font-size-sm)">
            <span style="color:${ls.color}">●</span>
            <span>${l.name || '-'}</span>
            <span style="color:var(--c-text-muted)">${l.role || ''}</span>
            <span style="margin-left:auto;color:${ls.color}">${ls.label}</span>
          </div>`;
        }).join('')}
      ` : ''}
    </div>
  `;
}

export async function mount() {
  watchApprovals((items) => { approvals = items; renderList(); });
  $('#newApproval')?.addEventListener('click', () => showToast('기안 작성 준비 중', 'info'));
}
