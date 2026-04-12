/**
 * pages/admin-notice.js — 고지서업무
 *
 * 좌: 과태료 고지서 PDF/이미지 업로드
 * 우: OCR → 차량번호/위반일/금액 자동 추출 → 계약 매칭 → AG Grid
 */
import { showToast } from '../core/toast.js';

const $ = (s) => document.querySelector(s);

export async function mount() {
  const drop = $('#noticeDrop');
  const file = $('#noticeFile');

  drop?.addEventListener('click', () => file.click());
  file?.addEventListener('change', (e) => handleFiles(Array.from(e.target.files)));
  drop?.addEventListener('dragover', (e) => { e.preventDefault(); drop.style.background = 'var(--c-bg-hover)'; });
  drop?.addEventListener('dragleave', () => { drop.style.background = ''; });
  drop?.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.style.background = '';
    handleFiles(Array.from(e.dataTransfer.files));
  });
}

function handleFiles(files) {
  if (!files.length) return;
  const detect = $('#noticeDetect');
  detect.innerHTML = files.map(f => `
    <div class="dash-card" style="display:flex;align-items:center;gap:8px">
      <span style="font-size:18px">📄</span>
      <div style="flex:1">
        <div style="font-weight:500;font-size:var(--font-size-sm)">${f.name}</div>
        <div style="font-size:var(--font-size-xs);color:var(--c-warn)">OCR 처리 준비 중 (Google Vision 연동 예정)</div>
      </div>
    </div>
  `).join('');
  $('#noticeInfo').textContent = `${files.length}건 업로드`;
  showToast(`${files.length}건 업로드 — OCR 기능 준비 중`, 'info');
}
