/**
 * confirm-reflect.js — "시스템 반영" 재확인 모달
 *
 * 모든 입력(대량/단건)에서 DB 저장 직전에 호출
 *
 * 사용:
 *   const ok = await confirmReflect({
 *     title: '자산 등록 반영',
 *     summary: { '신규': 28, 'DB중복': 3, '오류': 2 },
 *     preview: [ {차량번호:'123가4567', 차대번호:'...'}, ... ],  // 상위 3~5건
 *     action: '반영하기',
 *   });
 *   if (ok) await save();
 */

let _host = null;

function ensureHost() {
  if (_host) return _host;
  _host = document.createElement('div');
  _host.id = 'confirmReflectHost';
  _host.className = 'modal-host';
  _host.hidden = true;
  _host.innerHTML = `
    <div class="modal" style="width:640px;max-width:90vw">
      <div class="panel-head">
        <div class="panel-title" id="crTitle">시스템 반영</div>
        <button class="btn btn-icon" id="crClose" title="닫기">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>
      <div class="panel-body is-pad" style="display:flex;flex-direction:column;gap:12px">
        <div id="crMessage" style="font-size:var(--font-size);line-height:1.6"></div>
        <div id="crSummary" style="display:flex;gap:12px;flex-wrap:wrap;padding:10px 12px;background:var(--c-bg-sub);border-radius:var(--r-sm);font-size:var(--font-size-sm)"></div>
        <div id="crPreview" style="border:1px solid var(--c-border);border-radius:var(--r-sm);max-height:240px;overflow:auto;font-size:var(--font-size-sm)"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;padding-top:4px">
          <button class="btn" id="crCancel">취소</button>
          <button class="btn btn-primary" id="crConfirm">반영하기</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(_host);

  _host.addEventListener('click', e => { if (e.target === _host) close(false); });
  _host.querySelector('#crClose').addEventListener('click', () => close(false));
  _host.querySelector('#crCancel').addEventListener('click', () => close(false));
  _host.querySelector('#crConfirm').addEventListener('click', () => close(true));
  document.addEventListener('keydown', e => {
    if (_host?.hidden) return;
    if (e.key === 'Escape') close(false);
    if (e.key === 'Enter') close(true);
  });
  return _host;
}

let _resolver = null;
function close(result) {
  if (_host) _host.hidden = true;
  if (_resolver) { _resolver(result); _resolver = null; }
}

/**
 * @param {object} opts
 *   title: 모달 제목
 *   message: 본문 메시지 (기본: "N건을 시스템에 반영합니다...")
 *   summary: { label: count, ... } 요약
 *   preview: [{}] 상위 데이터 (컬럼 자동 추출)
 *   previewCols: ['col1','col2'] (선택) 표시할 컬럼 순서
 *   previewLabels: { col: label } (선택) 컬럼 라벨
 *   action: 확인 버튼 텍스트 (기본: "반영하기")
 *   count: 반영될 건수 (요약 message에 사용)
 * @returns {Promise<boolean>}
 */
export function confirmReflect(opts) {
  const el = ensureHost();
  el.querySelector('#crTitle').textContent = opts.title || '시스템 반영';

  const count = opts.count ?? (opts.preview?.length || 0);
  el.querySelector('#crMessage').innerHTML = opts.message ||
    `<strong>${count}건</strong>을 시스템에 반영합니다. 진행하시겠습니까?`;

  // 요약
  const summaryEl = el.querySelector('#crSummary');
  if (opts.summary && Object.keys(opts.summary).length) {
    const colors = {
      '신규': 'var(--c-success)', '정상': 'var(--c-success)',
      'DB중복': 'var(--c-danger)', '중복': 'var(--c-danger)',
      '파일중복': '#e040fb',
      '오류': 'var(--c-warn)', '실패': 'var(--c-danger)',
    };
    summaryEl.innerHTML = Object.entries(opts.summary).map(([k, v]) => {
      const color = colors[k] || 'var(--c-text-muted)';
      return `<span><span style="color:${color};font-weight:600">${k}</span> <strong>${v}</strong></span>`;
    }).join(' · ');
    summaryEl.style.display = '';
  } else {
    summaryEl.style.display = 'none';
  }

  // 미리보기 테이블
  const previewEl = el.querySelector('#crPreview');
  const preview = opts.preview || [];
  if (preview.length) {
    const cols = opts.previewCols || Object.keys(preview[0]).filter(k => !k.startsWith('_')).slice(0, 6);
    const labels = opts.previewLabels || {};
    const thead = `<thead><tr>${cols.map(c => `<th style="padding:6px 10px;text-align:left;background:var(--c-bg-sub);border-bottom:1px solid var(--c-border);position:sticky;top:0">${labels[c] || c}</th>`).join('')}</tr></thead>`;
    const tbody = `<tbody>${preview.slice(0, 5).map(row => `<tr>${cols.map(c => {
      const v = row[c];
      return `<td style="padding:6px 10px;border-bottom:1px solid var(--c-border-soft, #f0f0f0)">${v == null ? '' : String(v)}</td>`;
    }).join('')}</tr>`).join('')}</tbody>`;
    const more = preview.length > 5 ? `<div style="padding:6px 10px;text-align:center;color:var(--c-text-muted);font-size:var(--font-size-xs)">... 외 ${preview.length - 5}건</div>` : '';
    previewEl.innerHTML = `<table style="width:100%;border-collapse:collapse">${thead}${tbody}</table>${more}`;
    previewEl.style.display = '';
  } else {
    previewEl.style.display = 'none';
  }

  el.querySelector('#crConfirm').textContent = opts.action || '반영하기';
  el.hidden = false;
  el.querySelector('#crConfirm').focus();

  return new Promise(resolve => { _resolver = resolve; });
}
