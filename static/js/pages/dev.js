/**
 * pages/dev.js — 개발도구
 *
 * 컬렉션 단위 데이터 조회/전체삭제
 */
import { ref, get, update } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js';
import { db } from '../firebase/config.js';
import { showToast } from '../core/toast.js';

const $ = s => document.querySelector(s);

const COLLECTIONS = [
  { key: 'assets',    label: '자산',     icon: '🚗' },
  { key: 'contracts', label: '계약',     icon: '📋' },
  { key: 'customers', label: '고객',     icon: '👥' },
  { key: 'members',   label: '회원사',   icon: '🏢' },
  { key: 'vendors',   label: '거래처',   icon: '🤝' },
  { key: 'events',    label: '운영이력', icon: '📊' },
  { key: 'billings',  label: '수납',     icon: '💰' },
  { key: 'uploads',   label: '업로드이력', icon: '📤' },
];

export async function mount() {
  const host = $('#devHost');
  if (!host) return;

  // 각 컬렉션 카드 렌더
  host.innerHTML = `
    <div style="padding:12px 0;color:var(--c-danger);font-weight:600;font-size:var(--font-size-sm)">
      ⚠ 삭제는 복구 불가합니다. 신중하게 사용하세요.
    </div>
    ${COLLECTIONS.map(c => `
      <div class="dash-card" style="display:flex;align-items:center;gap:12px;margin-bottom:8px" data-col="${c.key}">
        <span style="font-size:20px">${c.icon}</span>
        <div style="flex:1">
          <div style="font-weight:600">${c.label}</div>
          <div style="font-size:var(--font-size-xs);color:var(--c-text-muted)" id="dev_count_${c.key}">조회 중...</div>
        </div>
        <button class="btn" data-action="count" data-col="${c.key}" style="font-size:var(--font-size-xs)">새로고침</button>
        <button class="btn" data-action="delete-all" data-col="${c.key}" style="font-size:var(--font-size-xs);color:var(--c-danger)">전체 삭제</button>
      </div>
    `).join('')}
    <div style="margin-top:20px;border-top:1px solid var(--c-border);padding-top:16px">
      <div style="font-weight:600;margin-bottom:8px">업로드 단위 삭제</div>
      <div style="font-size:var(--font-size-sm);color:var(--c-text-muted);margin-bottom:8px">
        특정 업로드로 반영된 데이터만 삭제 (upload_id 기준)
      </div>
      <div style="display:flex;gap:6px">
        <input type="text" id="devUploadId" class="ctrl" placeholder="upload_id 입력" style="flex:1">
        <button class="btn" id="devDeleteByUpload" style="color:var(--c-danger)">해당 업로드 삭제</button>
      </div>
    </div>
  `;

  // 건수 조회
  for (const c of COLLECTIONS) {
    await refreshCount(c.key);
  }

  // 이벤트
  host.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const col = btn.dataset.col;

    if (action === 'count') {
      await refreshCount(col);
    }

    if (action === 'delete-all') {
      const info = COLLECTIONS.find(c => c.key === col);
      const countEl = $(`#dev_count_${col}`);
      const count = countEl?.textContent?.match(/(\d+)/)?.[1] || '?';

      if (!confirm(`⚠ "${info.label}" 컬렉션의 ${count}건을 전체 삭제합니다.\n\n정말 삭제하시겠습니까?`)) return;
      if (!confirm(`마지막 확인: "${info.label}" 전체 삭제 진행합니다.`)) return;

      try {
        btn.disabled = true;
        btn.textContent = '삭제 중...';
        const snap = await get(ref(db, col));
        if (!snap.exists()) { showToast('데이터 없음', 'info'); return; }

        const updates = {};
        Object.keys(snap.val()).forEach(k => {
          updates[`${col}/${k}/status`] = 'deleted';
          updates[`${col}/${k}/deleted_at`] = Date.now();
        });
        await update(ref(db), updates);

        showToast(`${info.label} 전체 삭제 완료`, 'success');
        await refreshCount(col);
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '전체 삭제';
      }
    }
  });

  // 업로드 단위 삭제
  $('#devDeleteByUpload')?.addEventListener('click', async () => {
    const uploadId = $('#devUploadId')?.value?.trim();
    if (!uploadId) { showToast('upload_id를 입력하세요', 'info'); return; }

    // 해당 upload_id로 만들어진 events 찾기
    try {
      const eventsSnap = await get(ref(db, 'events'));
      const assetsSnap = await get(ref(db, 'assets'));
      const updates = {};
      let count = 0;

      if (eventsSnap.exists()) {
        Object.entries(eventsSnap.val()).forEach(([k, v]) => {
          if (v.note?.includes(uploadId) || v.upload_id === uploadId) {
            updates[`events/${k}/status`] = 'deleted';
            updates[`events/${k}/deleted_at`] = Date.now();
            count++;
          }
        });
      }

      if (assetsSnap.exists()) {
        Object.entries(assetsSnap.val()).forEach(([k, v]) => {
          if (v.upload_id === uploadId) {
            updates[`assets/${k}/status`] = 'deleted';
            updates[`assets/${k}/deleted_at`] = Date.now();
            count++;
          }
        });
      }

      if (!count) { showToast('해당 업로드로 생성된 데이터 없음', 'info'); return; }
      if (!confirm(`${count}건 삭제합니다. 진행?`)) return;

      await update(ref(db), updates);
      showToast(`${count}건 삭제 완료`, 'success');

      for (const c of COLLECTIONS) await refreshCount(c.key);
    } catch (err) { showToast(err.message, 'error'); }
  });
}

async function refreshCount(col) {
  const el = $(`#dev_count_${col}`);
  if (!el) return;
  try {
    const snap = await get(ref(db, col));
    if (!snap.exists()) { el.textContent = '0건'; return; }
    const all = Object.values(snap.val());
    const active = all.filter(v => v.status !== 'deleted');
    el.textContent = `${active.length}건 (삭제포함 ${all.length})`;
  } catch { el.textContent = '조회 실패'; }
}
