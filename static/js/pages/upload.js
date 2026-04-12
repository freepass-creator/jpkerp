/**
 * pages/upload.js — 업로드센터
 * 아무 파일 던지면 자동 감지 → 확인 → 등록
 */
import { showToast } from '../core/toast.js';

const $ = (s) => document.querySelector(s);

export async function mount() {
  const drop = $('#uploadDrop');
  const file = $('#uploadFile');

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

async function handleFiles(files) {
  if (!files.length) return;
  const result = $('#uploadResult');
  result.innerHTML = files.map(f => {
    const ext = f.name.split('.').pop().toLowerCase();
    const type = detectType(ext);
    return `<div class="dash-card" style="margin-bottom:8px;display:flex;align-items:center;gap:12px">
      <div style="font-size:20px">${typeIcon(ext)}</div>
      <div style="flex:1">
        <div style="font-weight:500">${f.name}</div>
        <div style="font-size:11px;color:var(--c-text-muted)">${formatSize(f.size)} · ${type}</div>
      </div>
      <div style="font-size:11px;color:var(--c-warn)">준비 중</div>
    </div>`;
  }).join('');
  showToast(`${files.length}개 파일 감지 — 자동 분류 기능 준비 중`, 'info');
}

function detectType(ext) {
  if (['csv'].includes(ext)) return '통장/카드 내역 (CSV)';
  if (['xlsx', 'xls'].includes(ext)) return '엑셀 파일';
  if (['pdf'].includes(ext)) return '문서 (OCR 대상)';
  if (['png', 'jpg', 'jpeg'].includes(ext)) return '이미지 (OCR 대상)';
  return '기타 파일';
}

function typeIcon(ext) {
  if (['csv', 'xlsx', 'xls'].includes(ext)) return '📊';
  if (['pdf'].includes(ext)) return '📄';
  if (['png', 'jpg', 'jpeg'].includes(ext)) return '🖼';
  return '📎';
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}
