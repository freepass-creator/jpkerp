/**
 * detail-panel.js — 가운데 팝업 상세 패널
 *
 * 사용:
 *   import { openDetail, closeDetail } from '../core/detail-panel.js';
 *
 *   openDetail({
 *     title: '19무0235 BMW 4시리즈',
 *     sections: [
 *       { label: '차량 기본', rows: [
 *         { label: '차량번호', value: '19무0235' },
 *         { label: '차대번호', value: 'WBA...' },
 *       ]},
 *     ],
 *     actions: [
 *       { label: '수정', action: () => {} },
 *       { label: '삭제', danger: true, action: () => {} },
 *     ],
 *   });
 */

let overlayEl = null;
let panelEl = null;

function ensureDOM() {
  if (overlayEl) return;
  overlayEl = document.createElement('div');
  overlayEl.className = 'detail-overlay';
  overlayEl.addEventListener('click', closeDetail);

  panelEl = document.createElement('div');
  panelEl.className = 'detail-popup';

  document.body.appendChild(overlayEl);
  document.body.appendChild(panelEl);
}

export function openDetail(opts) {
  ensureDOM();
  const { title, subtitle, sections = [], actions = [] } = opts;

  panelEl.innerHTML = `
    <div class="detail-head">
      <div>
        <div class="detail-title">${esc(title || '')}</div>
        ${subtitle ? `<div class="detail-subtitle">${esc(subtitle)}</div>` : ''}
      </div>
      <div class="detail-actions">
        ${actions.map(a =>
          `<button class="btn${a.danger ? ' btn-danger' : ''}" data-act="${esc(a.label)}">${esc(a.label)}</button>`
        ).join('')}
        <button class="btn detail-close">✕</button>
      </div>
    </div>
    <div class="detail-body">
      ${sections.map(sec => `
        <div class="detail-section">
          <div class="detail-section-title">${esc(sec.label)}</div>
          ${sec.html ? sec.html : `
            <table class="detail-table">
              ${(sec.rows || []).filter(r => r.value && r.value !== '-' && r.value !== '0').map(r => `
                <tr>
                  <td class="detail-td-label">${esc(r.label)}</td>
                  <td class="detail-td-value">${esc(r.value)}</td>
                </tr>
              `).join('')}
            </table>
          `}
        </div>
      `).join('')}
    </div>
  `;

  panelEl.querySelectorAll('[data-act]').forEach(btn => {
    const a = actions.find(x => x.label === btn.dataset.act);
    if (a?.action) btn.addEventListener('click', a.action);
  });
  panelEl.querySelector('.detail-close')?.addEventListener('click', closeDetail);

  overlayEl.classList.add('is-open');
  panelEl.classList.add('is-open');

  // ESC 닫기
  document.addEventListener('keydown', onEsc);
}

export function closeDetail() {
  if (overlayEl) overlayEl.classList.remove('is-open');
  if (panelEl) panelEl.classList.remove('is-open');
  document.removeEventListener('keydown', onEsc);
}

function onEsc(e) { if (e.key === 'Escape') closeDetail(); }

/**
 * 스키마 + 데이터 → sections 자동 생성
 * @param {Array} schema — ASSET_SCHEMA 등
 * @param {object} data — 행 데이터
 * @param {Array} sectionOrder — ['차량','스펙','제원',...] (없으면 자동)
 */
export function schemaToSections(schema, data, sectionOrder) {
  const secMap = {};
  schema.forEach(s => {
    if (!secMap[s.section]) secMap[s.section] = [];
    const val = data[s.col];
    secMap[s.section].push({
      label: s.label,
      value: val != null && val !== '' ? String(val) : '-',
    });
  });
  const order = sectionOrder || [...new Set(schema.map(s => s.section))];
  return order.filter(sec => secMap[sec]).map(sec => ({
    label: sec,
    rows: secMap[sec],
  }));
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
