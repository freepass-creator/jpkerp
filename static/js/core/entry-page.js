/**
 * entry-page.js — 표준 등록 페이지 (좌: 입력폼 / 우: 임시 검토 / 반영)
 *
 * 모든 등록 페이지(자산/계약/운영/과태료)가 이 함수 한 줄로 마운트된다.
 *
 * 사용:
 *   mountEntryPage({
 *     schema, sections, keyField,
 *     saveFn,                  // async (record) => savedRecord
 *     uploadCsvFn,             // (선택) 헤드 업로드 버튼 클릭 핸들러
 *     stageColumns,            // 우측 임시 목록 컬럼 (기본: 자동)
 *     entityLabel,             // '자산' 등 (토스트 메시지)
 *     viewHref,                // '/view/asset' — 반영 후 "조회로?"
 *   });
 *
 * 동작:
 *   1. 좌측 폼 작성 → [임시 등록] → 우측 stage 목록에 한 줄 추가 (메모리만)
 *   2. 우측 행 클릭 → 좌측 폼에 prefill (수정 가능, [수정 적용] 으로 stage 갱신)
 *   3. 우측 행의 [반영] → 그 행만 DB 저장 → ✓ 표시 → 잠시 후 사라짐
 *   4. 헤드 [전체 반영] → 모든 stage 한 번에
 *   5. [비우기] → stage 전체 제거
 */

import { showToast } from './toast.js';
import { icon } from './icons.js';

export function mountEntryPage(opts) {
  const {
    schema, sections,
    saveFn,
    uploadCsvFn,
    entityLabel = '항목',
    viewHref,
    onReady,
  } = opts;

  // ─── 상태 (모듈 closure) ─────────────────
  let stage = [];        // 임시 등록 배열
  let editingIdx = -1;   // -1이면 신규, 아니면 stage[idx] 수정 중
  let stageSeq = 0;      // 임시 ID

  const formHost = document.getElementById('entryFormHost');
  const stageHost = document.getElementById('stageHost');
  const stageCount = document.getElementById('stageCount');
  const editingTag = document.getElementById('entryEditing');

  if (!formHost || !stageHost) return;

  // 헤드 버튼 — 한 번만 바인딩
  document.getElementById('entryUpload')?.addEventListener('click', () => {
    if (uploadCsvFn) uploadCsvFn();
    else showToast('업로드는 곧 추가됩니다', 'warn');
  });
  document.getElementById('stageClear')?.addEventListener('click', () => {
    if (!stage.length) return;
    if (!confirm('임시 등록한 모든 항목을 비웁니다. 진행할까요?')) return;
    stage = [];
    editingIdx = -1;
    renderForm();
    renderStage();
  });
  document.getElementById('stageCommitAll')?.addEventListener('click', commitAll);
  document.getElementById('entryStage')?.addEventListener('click', () => stageCurrent());
  document.getElementById('entryCancel')?.addEventListener('click', () => {
    editingIdx = -1;
    renderForm();
  });

  renderForm();
  renderStage();

  // 외부에 stage push API 노출 — CSV 업로드 등에서 사용
  if (typeof onReady === 'function') {
    onReady({
      stage: (row) => {
        stage.unshift({ ...row, _id: ++stageSeq, _committed: false });
        renderStage();
      },
      stageMany: (rows) => {
        rows.forEach(r => {
          stage.unshift({ ...r, _id: ++stageSeq, _committed: false });
        });
        renderStage();
      },
      clear: () => { stage = []; renderStage(); },
    });
  }

  // ─── 폼 ─────────────────────────────────
  function renderForm(prefill = null) {
    const data = prefill || {};
    formHost.innerHTML = sections.map(sec => {
      const fields = schema.filter(s => s.section === sec);
      if (!fields.length) return '';
      return `<div class="form-section">
        <div class="form-section-title">${icon('edit', 16)} ${sec}</div>
        <div class="form-grid">${fields.map(f => fieldHtml(f, data[f.col])).join('')}</div>
      </div>`;
    }).join('');

    // 패널헤드 액션 버튼 텍스트/표시 갱신
    const stageBtn = document.getElementById('entryStage');
    const cancelBtn = document.getElementById('entryCancel');
    if (stageBtn) {
      const ico = editingIdx >= 0 ? icon('check') : icon('plus');
      const label = editingIdx >= 0 ? '수정 적용' : '임시 등록';
      stageBtn.innerHTML = ico + ' ' + label;
    }
    if (cancelBtn) cancelBtn.hidden = editingIdx < 0;

    // 편집중 표시
    if (editingTag) editingTag.textContent = editingIdx >= 0 ? '· 수정 중' : '';

    setTimeout(() => formHost.querySelector('input, select, textarea')?.focus(), 0);
  }

  function fieldHtml(s, value) {
    const v = value == null ? '' : value;
    const reqCls = s.required ? ' is-required' : '';
    if (s.type === 'select' && s.options) {
      const opts = ['<option value="">선택</option>'].concat(
        s.options.map(o => `<option value="${o}"${v === o ? ' selected' : ''}>${o}</option>`)
      ).join('');
      return `<div class="field${reqCls}"><label>${s.label}</label><select name="${s.col}">${opts}</select></div>`;
    }
    if (s.type === 'textarea') {
      return `<div class="field${reqCls}" style="grid-column:1/-1"><label>${s.label}</label><textarea name="${s.col}">${escapeHtml(v)}</textarea></div>`;
    }
    const type = s.type === 'date' ? 'date' : 'text';
    const inputmode = s.type === 'number' ? ' inputmode="numeric"' : '';
    return `<div class="field${reqCls}"><label>${s.label}</label><input type="${type}" name="${s.col}" value="${escapeHtml(v)}"${inputmode}></div>`;
  }

  function readForm() {
    const data = {};
    formHost.querySelectorAll('[name]').forEach(el => { data[el.name] = el.value.trim(); });
    return data;
  }

  // ─── stage ──────────────────────────────
  function stageCurrent() {
    const data = readForm();
    const missing = schema.filter(s => s.required && !data[s.col]).map(s => s.label);
    if (missing.length) { showToast(`필수: ${missing.join(', ')}`, 'error'); return; }

    if (editingIdx >= 0) {
      stage[editingIdx] = { ...stage[editingIdx], ...data, _committed: false };
      editingIdx = -1;
      showToast('수정 적용', 'success');
    } else {
      stage.unshift({ ...data, _id: ++stageSeq, _committed: false });
      showToast('임시 등록', 'success');
    }
    renderForm();
    renderStage();
  }

  function renderStage() {
    if (stageCount) {
      const pending = stage.filter(s => !s._committed).length;
      stageCount.textContent = stage.length
        ? `임시 ${pending}건 / 반영 ${stage.length - pending}건`
        : '아직 등록할 항목이 없습니다';
    }
    if (!stage.length) {
      stageHost.innerHTML = '<div class="empty" style="padding:40px 20px;color:var(--c-text-muted)">좌측에서 입력 후 [임시 등록]을 눌러주세요.</div>';
      return;
    }
    // 자동 컬럼: 그리드 컬럼이 있으면 거기서, 없으면 첫 4개 필드
    const gridCols = schema.filter(s => s.gridShow).slice(0, 4);
    const cols = gridCols.length ? gridCols : schema.slice(0, 4);

    stageHost.innerHTML = `
      <table class="grid-table" style="width:100%">
        <thead><tr>
          ${cols.map(c => `<th>${c.label}</th>`).join('')}
          <th style="width:90px">상태</th>
          <th style="width:60px"></th>
        </tr></thead>
        <tbody>
          ${stage.map((row, i) => `
            <tr data-idx="${i}" class="stage-row${row._committed ? ' is-committed' : ''}">
              ${cols.map(c => `<td>${escapeHtml(row[c.col] || '-')}</td>`).join('')}
              <td>${row._committed ? '<span class="badge badge-success">반영</span>' : '<span class="badge badge-mute">임시</span>'}</td>
              <td>
                ${row._committed
                  ? '<button class="btn btn-icon stage-del" title="제거">✕</button>'
                  : `<button class="btn btn-icon stage-commit" title="반영">✓</button>
                     <button class="btn btn-icon stage-del" title="제거">✕</button>`}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    // 행 클릭 → prefill
    stageHost.querySelectorAll('.stage-row').forEach(tr => {
      tr.addEventListener('click', (e) => {
        if (e.target.closest('.stage-commit') || e.target.closest('.stage-del')) return;
        const idx = Number(tr.dataset.idx);
        if (stage[idx]._committed) return;
        editingIdx = idx;
        renderForm(stage[idx]);
      });
    });
    stageHost.querySelectorAll('.stage-commit').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const idx = Number(btn.closest('.stage-row').dataset.idx);
        await commitOne(idx);
      });
    });
    stageHost.querySelectorAll('.stage-del').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(btn.closest('.stage-row').dataset.idx);
        stage.splice(idx, 1);
        if (editingIdx === idx) { editingIdx = -1; renderForm(); }
        renderStage();
      });
    });
  }

  // ─── commit ────────────────────────────
  async function commitOne(idx) {
    const row = stage[idx];
    if (!row || row._committed) return;
    try {
      const { _id, _committed, ...payload } = row;
      await saveFn(payload);
      stage[idx]._committed = true;
      renderStage();
      showToast(`${entityLabel} 반영 완료`, 'success');
      // 잠시 후 자동 제거
      setTimeout(() => {
        const i = stage.findIndex(s => s._id === _id);
        if (i >= 0) { stage.splice(i, 1); renderStage(); }
      }, 1500);
    } catch (e) {
      showToast(e.message || '저장 실패', 'error');
    }
  }

  async function commitAll() {
    const targets = stage.map((s, i) => ({ s, i })).filter(x => !x.s._committed);
    if (!targets.length) { showToast('반영할 항목이 없습니다', 'info'); return; }
    if (!confirm(`임시 등록 ${targets.length}건을 모두 반영합니다. 진행할까요?`)) return;
    let ok = 0, fail = 0;
    for (const { i } of targets) {
      const row = stage[i];
      try {
        const { _id, _committed, ...payload } = row;
        await saveFn(payload);
        stage[i]._committed = true;
        ok++;
      } catch {
        fail++;
      }
    }
    renderStage();
    showToast(`반영 ${ok}건${fail ? ` · 실패 ${fail}` : ''}`, ok ? 'success' : 'error');
    // 1.5초 후 반영된 것들 모두 제거
    setTimeout(() => {
      stage = stage.filter(s => !s._committed);
      renderStage();
      // 모두 비었으면 조회 페이지로?
      if (!stage.length && viewHref) {
        if (confirm(`등록 완료. ${entityLabel} 조회로 이동할까요?`)) {
          window.location.href = viewHref;
        }
      }
    }, 1500);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
