/**
 * photo-ui.js — 사진 업로드·조회 공통 컴포넌트
 *
 * createPhotoUploader(container, options) — 업로드 위젯
 *   options = {
 *     accept: 'image/*' | 'image/*,.pdf',
 *     multiple: true,
 *     onChange: (files) => void,   // 현재 선택된 File 배열
 *   }
 *   반환: { getFiles(), clear() }
 *
 * renderPhotoGrid(container, photos, options?)
 *   photos: [{url, name, content_type, ...} | string(url)]
 *   options = { tags: [label,...], emptyHtml: '' }
 *
 * openLightbox(photos, startIndex)
 */

const isImg = (p) => {
  const ct = p?.content_type || '';
  if (ct.startsWith('image/')) return true;
  const url = typeof p === 'string' ? p : (p?.url || p?.name || '');
  return /\.(jpe?g|png|heic|webp|gif|avif)(\?|$)/i.test(url);
};
const extOf = (p) => {
  const name = typeof p === 'string' ? p : (p?.name || p?.url || '');
  const m = name.match(/\.([a-z0-9]{1,5})(\?|$)/i);
  return m ? m[1].toLowerCase() : '';
};

// ── 갤러리 ───────────────────────
export function renderPhotoGrid(container, photos, options = {}) {
  const list = Array.isArray(photos) ? photos : [];
  if (!list.length) {
    container.innerHTML = options.emptyHtml
      || '<div style="padding:24px;text-align:center;color:#9b9a97;font-size:12px">등록된 사진이 없습니다</div>';
    return;
  }
  container.className = 'photo-grid';
  container.innerHTML = list.map((p, i) => {
    const url = typeof p === 'string' ? p : p.url;
    const img = isImg(p);
    const ext = extOf(p);
    return `
      <a class="photo-thumb" data-idx="${i}" href="${url}" target="_blank" rel="noopener">
        ${img
          ? `<img src="${url}" alt="" loading="lazy">`
          : `<div class="photo-thumb-file"><i class="ph ph-file"></i></div>${ext ? `<span class="photo-thumb-file-ext">${ext}</span>` : ''}`}
      </a>`;
  }).join('');
  // 라이트박스 연동 (이미지만)
  container.querySelectorAll('.photo-thumb').forEach((el) => {
    el.addEventListener('click', (e) => {
      const i = Number(el.dataset.idx);
      const item = list[i];
      if (!isImg(item)) return; // 파일은 새창 열기 (기본 href)
      e.preventDefault();
      openLightbox(list, i);
    });
  });
}

// ── 라이트박스 ───────────────────
export function openLightbox(photos, startIndex = 0) {
  const imgs = photos.filter(isImg);
  if (!imgs.length) return;
  let idx = Math.max(0, Math.min(startIndex, imgs.length - 1));
  // 원본 인덱스 → imgs 인덱스 변환
  const original = photos[startIndex];
  const foundIdx = imgs.indexOf(original);
  if (foundIdx >= 0) idx = foundIdx;

  const root = document.createElement('div');
  root.className = 'photo-lightbox';
  root.innerHTML = `
    <div class="photo-lightbox-counter"><span class="cur">${idx + 1}</span> / ${imgs.length}</div>
    <button class="photo-lightbox-close" aria-label="닫기">✕</button>
    ${imgs.length > 1 ? '<button class="photo-lightbox-nav prev" aria-label="이전">‹</button><button class="photo-lightbox-nav next" aria-label="다음">›</button>' : ''}
    <img alt="">
  `;
  const imgEl = root.querySelector('img');
  const curEl = root.querySelector('.cur');
  const set = (i) => {
    idx = (i + imgs.length) % imgs.length;
    const p = imgs[idx];
    imgEl.src = typeof p === 'string' ? p : p.url;
    if (curEl) curEl.textContent = String(idx + 1);
  };
  set(idx);
  root.querySelector('.photo-lightbox-close').addEventListener('click', close);
  root.querySelector('.prev')?.addEventListener('click', () => set(idx - 1));
  root.querySelector('.next')?.addEventListener('click', () => set(idx + 1));
  root.addEventListener('click', (e) => { if (e.target === root) close(); });
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') set(idx - 1);
    if (e.key === 'ArrowRight') set(idx + 1);
  };
  document.addEventListener('keydown', onKey);
  function close() {
    document.removeEventListener('keydown', onKey);
    root.remove();
  }
  document.body.appendChild(root);
}

// ── 업로더 ───────────────────────
export function createPhotoUploader(container, options = {}) {
  const accept = options.accept || 'image/*';
  const multiple = options.multiple !== false;
  const onChange = options.onChange || (() => {});
  let files = []; // [{id, file, url(blob)}]

  container.classList.add('photo-grid');
  container.innerHTML = `
    <label class="photo-upload-add" data-role="add">
      <input type="file" accept="${accept}" ${multiple ? 'multiple' : ''} hidden>
      <i class="ph ph-plus"></i>
      <span>사진 추가</span>
    </label>
  `;

  const addEl = container.querySelector('[data-role="add"]');
  const input = addEl.querySelector('input');

  const render = () => {
    // 기존 썸네일 제거 (add 타일만 남김)
    container.querySelectorAll('.photo-thumb.is-pending').forEach((el) => el.remove());
    // 파일 썸네일 prepend
    files.forEach((item) => {
      const div = document.createElement('div');
      div.className = 'photo-thumb is-pending';
      div.dataset.id = item.id;
      const img = item.file.type.startsWith('image/');
      div.innerHTML = `
        ${img
          ? `<img src="${item.url}" alt="">`
          : `<div class="photo-thumb-file"><i class="ph ph-file"></i></div><span class="photo-thumb-file-ext">${extOf(item.file.name) || 'FILE'}</span>`}
        <button class="photo-thumb-remove" type="button" aria-label="제거">✕</button>
      `;
      div.querySelector('.photo-thumb-remove').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        removeItem(item.id);
      });
      container.insertBefore(div, addEl);
    });
    onChange(files.map((f) => f.file));
  };

  const addFiles = (list) => {
    for (const f of list) {
      const id = `pf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const url = f.type.startsWith('image/') ? URL.createObjectURL(f) : '';
      files.push({ id, file: f, url });
    }
    render();
  };

  const removeItem = (id) => {
    const i = files.findIndex((f) => f.id === id);
    if (i < 0) return;
    if (files[i].url) URL.revokeObjectURL(files[i].url);
    files.splice(i, 1);
    render();
  };

  input.addEventListener('change', (e) => {
    const sel = Array.from(e.target.files || []);
    if (!sel.length) return;
    addFiles(sel);
    input.value = '';
  });

  // 드래그앤드롭
  addEl.addEventListener('dragover', (e) => { e.preventDefault(); addEl.classList.add('is-drag'); });
  addEl.addEventListener('dragleave', () => addEl.classList.remove('is-drag'));
  addEl.addEventListener('drop', (e) => {
    e.preventDefault();
    addEl.classList.remove('is-drag');
    const dropped = Array.from(e.dataTransfer.files || []);
    if (dropped.length) addFiles(dropped);
  });

  // 클립보드 붙여넣기 (Ctrl+V)
  const pasteHandler = (e) => {
    if (!container.isConnected) {
      document.removeEventListener('paste', pasteHandler);
      return;
    }
    const items = Array.from(e.clipboardData?.items || []);
    const imgs = items.filter((it) => it.kind === 'file' && it.type.startsWith('image/'));
    if (!imgs.length) return;
    const pasted = imgs.map((it) => {
      const f = it.getAsFile();
      if (!f) return null;
      // 이름 없는 경우 시간 기준
      const ts = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
      return new File([f], f.name && f.name !== 'image.png' ? f.name : `paste-${ts}.png`, { type: f.type });
    }).filter(Boolean);
    if (pasted.length) addFiles(pasted);
  };
  document.addEventListener('paste', pasteHandler);

  return {
    getFiles: () => files.map((f) => f.file),
    clear: () => {
      files.forEach((f) => f.url && URL.revokeObjectURL(f.url));
      files = [];
      render();
    },
  };
}

// ── Firebase Storage 일괄 업로드 헬퍼 ────────
export async function uploadFilesToStorage(files, { type, car }) {
  const { ref: sRef, uploadBytesResumable, getDownloadURL } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js');
  const { storage } = await import('../firebase/config.js');
  const pad = (n) => String(n).padStart(2, '0');
  const safeCar = String(car || '').replace(/[.#$\[\]\/]/g, '_');
  const result = [];
  for (const f of files) {
    const d = new Date();
    const stamp = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    const rand = Math.random().toString(36).slice(2, 6);
    const ext = (f.name.split('.').pop() || 'bin').toLowerCase();
    const path = `photos/${type || 'misc'}/${safeCar}/${stamp}_${rand}.${ext}`;
    const task = uploadBytesResumable(sRef(storage, path), f, { contentType: f.type });
    await new Promise((resolve, reject) => task.on('state_changed', null, reject, resolve));
    const url = await getDownloadURL(task.snapshot.ref);
    result.push({ url, path, name: f.name, content_type: f.type, size: f.size, taken_at: Date.now() });
  }
  return result;
}
