/**
 * m-upload.js — 모바일 업로드 (운영팀 현장용)
 * "현장에선 빠르게, 정리는 자리에서"
 *
 * 플로우: 차량번호 → 카테고리 → [카메라 | 앨범] → 자동업로드
 * Storage: photos/{type}/{car}/{ts}_{rand}.{ext}
 * RTDB:    uploads/{car}/{type}/{pushId} = { url, path, name, uploader, taken_at, ... }
 */
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js';
import { ref as dbRef, push, onValue } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js';
import { db, storage } from '../../firebase/config.js';
import { watchAssets } from '../../firebase/assets.js';
import { watchMembers } from '../../firebase/members.js';
import { saveEvent } from '../../firebase/events.js';

const $ = (s) => document.querySelector(s);

// ── 로컬 설정 ─────────────────────
const RECENT_KEY = 'jpk.op.recent_cars';

const loadRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; } };
const pushRecent = (car) => {
  if (!car) return;
  const list = loadRecent().filter((c) => c !== car);
  list.unshift(car);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)));
};
const getUploader = () => {
  const u = window.__mUser;
  if (!u) return { uid: '', name: '', email: '' };
  return { uid: u.uid, name: u.name, email: u.email };
};

// ── 상태 ─────────────────────────
let currentCar = '';
let selectedType = '';
let countsUnsub = null;
const blobUrls = new Map(); // thumbId → blob URL (revoke 위해)

// 자산/회원사 로컬 캐시
let assetsByCar = new Map();
let membersByCode = new Map();
let assetsUnsub = null;
let membersUnsub = null;

function watchCatalog() {
  assetsUnsub = watchAssets((items) => {
    assetsByCar = new Map();
    items.forEach((a) => {
      const cn = (a.car_number || '').trim();
      if (cn) assetsByCar.set(cn, a);
    });
    updateCarInfo();
  });
  membersUnsub = watchMembers((items) => {
    membersByCode = new Map();
    items.forEach((m) => membersByCode.set(m.partner_code || m.member_id, m));
    updateCarInfo();
  });
}

// 페이지 떠날 때 구독 정리 (SW pre-cache / pagehide 모두 대응)
window.addEventListener('pagehide', () => {
  try { countsUnsub && countsUnsub(); } catch {}
  try { assetsUnsub && assetsUnsub(); } catch {}
  try { membersUnsub && membersUnsub(); } catch {}
  blobUrls.forEach((u) => URL.revokeObjectURL(u));
  blobUrls.clear();
});

function updateCarInfo() {
  const panel = $('#currentCar');
  const companyEl = $('#curCompany');
  const numEl = $('#curNumber');
  const modelEl = $('#curModel');
  if (!panel || !companyEl || !numEl || !modelEl) return;

  const setAll = (company, num, model) => {
    companyEl.textContent = company;
    numEl.textContent = num;
    modelEl.textContent = model;
  };

  if (!currentCar) {
    panel.classList.add('is-empty');
    panel.classList.remove('is-active');
    setAll('—', '차량번호를 검색하세요', '—');
    return;
  }

  const asset = assetsByCar.get(currentCar);
  if (!asset) {
    panel.classList.remove('is-active');
    panel.classList.remove('is-empty');
    setAll('등록되지 않은 차량', currentCar, '—');
    return;
  }

  const member = membersByCode.get(asset.partner_code);
  const company = member?.company_name || asset.partner_code || '—';
  const model = asset.detail_model || '—';
  panel.classList.add('is-active');
  panel.classList.remove('is-empty');
  setAll(company, currentCar, model);
}

// ── 유틸 ─────────────────────────
const encodeKey = (s) => String(s).replace(/[.#$\[\]\/]/g, '_');

const TYPE_LABEL = { delivery: '출고', return: '반납', product: '상품화', file: '파일' };
const TYPE_COLOR = { delivery: '#10b981', return: '#059669', product: '#8b5cf6', file: '#6b7280' };

// ── 토스트 ─────────────────────────
function toast(msg) {
  const el = document.createElement('div');
  el.className = 'm-toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

// ── 차량 UI ─────────────────────────
function renderRecent() {
  const host = $('#recentCars');
  const recent = loadRecent();
  host.innerHTML = recent.map((car) =>
    `<button class="m-pill ${car === currentCar ? 'is-active' : ''}" data-car="${car}">${car}</button>`
  ).join('');
}
// 리스트 재렌더링시마다 리스너 중복 추가 방지 — delegation 한번만 등록
function wireRecent() {
  const host = $('#recentCars');
  host.addEventListener('click', (e) => {
    const pill = e.target.closest('.m-pill');
    if (!pill) return;
    const c = pill.dataset.car;
    $('#carInput').value = c;
    setCar(c);
  });
}

function setCar(car) {
  currentCar = (car || '').trim();
  const enabled = !!currentCar;
  document.querySelectorAll('.m-quad-btn').forEach((b) => {
    b.classList.toggle('is-dim', !enabled);
  });
  // clear 버튼 토글
  const clr = $('#carClear');
  if (clr) clr.hidden = !enabled;
  renderRecent();

  if (countsUnsub) { countsUnsub(); countsUnsub = null; }

  if (enabled) {
    watchCounts();
  } else {
    document.querySelectorAll('.m-quad-badge').forEach((el) => { el.textContent = '0'; el.dataset.count = '0'; });
  }
  updateCarInfo();
}

// ── 카운트 구독 (events 에서 차량+타입으로 집계) ─────────
function watchCounts() {
  const r = dbRef(db, 'events');
  countsUnsub = onValue(r, (snap) => {
    const v = snap.val() || {};
    const counts = {};
    Object.values(v).forEach((e) => {
      if (e?.status === 'deleted') return;
      if (e?.car_number !== currentCar) return;
      counts[e.type] = (counts[e.type] || 0) + 1;
    });
    document.querySelectorAll('.m-quad-btn').forEach((b) => {
      const t = b.dataset.type;
      const n = counts[t] || 0;
      let badge = b.querySelector('.m-quad-badge');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'm-quad-badge';
        b.appendChild(badge);
      }
      badge.textContent = n;
      badge.dataset.count = n;
    });
  });
}

function updatePendingVisibility() {
  const host = $('#recentFeed');
  const sec = $('#pendingSection');
  const cnt = $('#pendingCount');
  if (!sec || !host) return;
  const n = host.children.length;
  sec.hidden = n === 0;
  if (cnt) cnt.textContent = n;
}

// ── 액션 시트 ─────────────────────────
function openSheet(type) {
  selectedType = type;
  $('#sheetTitle').textContent = `${TYPE_LABEL[type]} — 업로드 방법`;
  // '파일' 카테고리는 카메라/앨범 대신 '파일 선택'만
  const isFile = type === 'file';
  $('#actionSheet').querySelectorAll('.m-sheet-btn').forEach((b) => {
    const act = b.dataset.act;
    if (act === 'camera' || act === 'gallery') b.style.display = isFile ? 'none' : 'flex';
    if (act === 'file') b.style.display = isFile ? 'flex' : 'none';
  });
  $('#sheetOverlay').hidden = false;
  $('#actionSheet').hidden = false;
}
function closeSheet() {
  $('#sheetOverlay').hidden = true;
  $('#actionSheet').hidden = true;
}

function wireSheet() {
  $('#sheetOverlay').addEventListener('click', closeSheet);
  $('#actionSheet').querySelectorAll('.m-sheet-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const act = btn.dataset.act;
      closeSheet();
      if (act === 'cancel') return;
      if (act === 'camera')  triggerInput('#fileCamera');
      if (act === 'gallery') triggerInput('#fileGallery');
      if (act === 'file')    triggerInput('#fileAny');
    });
  });
}

function triggerInput(sel) {
  const inp = $(sel);
  inp.value = '';
  inp.click();
}

// ── 진행률 업로드 ─────────────────────
function uploadWithProgress(file, path, thumbId) {
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef(storage, path), file, { contentType: file.type });
    task.on('state_changed', (snap) => {
      const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
      const el = document.getElementById(thumbId);
      if (el) {
        const bar = el.querySelector('.m-thumb-progress');
        if (bar) bar.style.width = pct + '%';
        const s = el.querySelector('.m-thumb-status');
        if (s) s.textContent = pct + '%';
      }
    }, reject, async () => {
      try { resolve(await getDownloadURL(task.snapshot.ref)); }
      catch (e) { reject(e); }
    });
  });
}

// ── 개별 파일 Storage 업로드 (URL 리턴) ─────────
async function uploadOneToStorage(file, type) {
  const ts = Date.now();
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const ext = (file.name.split('.').pop() || (file.type.startsWith('image/') ? 'jpg' : 'bin')).toLowerCase();
  const safeCar = encodeKey(currentCar);
  const rand = Math.random().toString(36).slice(2, 6);
  const path = `photos/${type}/${safeCar}/${stamp}_${rand}.${ext}`;

  const thumbId = `pending-${ts}-${rand}`;
  injectPending(file, thumbId);

  try {
    const url = await uploadWithProgress(file, path, thumbId);
    markDone(thumbId);
    return { url, path, name: file.name, content_type: file.type || '', size: file.size, taken_at: ts };
  } catch (e) {
    console.error('[upload]', e);
    markError(thumbId, e.message || String(e));
    toast(`업로드 실패: ${e.message || e}`);
    return null;
  }
}

// ── 세션 업로드: 파일들 → Storage → event 1건 ──────
const TITLE_MAP = { delivery: '출고', return: '반납', product: '상품화', file: '파일' };
async function uploadSession(files, type) {
  if (!currentCar) { toast('차량번호를 먼저 선택하세요'); return; }
  await window.__mUserReady;
  const uploader = getUploader();
  // 병렬 업로드 (최대 3동시)
  const results = [];
  const queue = [...files];
  const workers = Array(Math.min(3, queue.length)).fill(null).map(async () => {
    while (queue.length) {
      const f = queue.shift();
      const r = await uploadOneToStorage(f, type);
      if (r) results.push(r);
    }
  });
  await Promise.all(workers);
  if (!results.length) return;

  // event 1건 생성
  const today = new Date().toISOString().slice(0, 10);
  const asset = assetsByCar.get(currentCar);
  const member = asset ? membersByCode.get(asset.partner_code) : null;
  await saveEvent({
    type,
    date: today,
    car_number: currentCar,
    car_model: asset?.car_model || '',
    detail_model: asset?.detail_model || '',
    partner_code: asset?.partner_code || '',
    company_name: member?.company_name || '',
    title: `${TITLE_MAP[type] || type} (${results.length}장)`,
    memo: '',
    photos: results,
    uploader_uid: uploader.uid,
    uploader_name: uploader.name,
    uploader_email: uploader.email,
    source: 'mobile',
    direction: type === 'return' ? 'in' : 'out',
  });
  toast(`${TITLE_MAP[type]} 등록 완료 (${results.length}장)`);
}

function injectPending(file, id) {
  const host = $('#recentFeed');
  const url = file.type.startsWith('image/') ? URL.createObjectURL(file) : '';
  if (url) blobUrls.set(id, url);
  const div = document.createElement('div');
  div.className = 'm-thumb is-uploading';
  div.id = id;
  div.innerHTML = `
    ${url
      ? `<img src="${url}" alt="">`
      : `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:#888"><i class="ph ph-file" style="font-size:30px"></i></div>`}
    <span class="m-thumb-status">업로드 중…</span>
    <div class="m-thumb-progress" style="width:30%"></div>
  `;
  host.prepend(div);
  updatePendingVisibility();
}
function revokeBlob(id) {
  const u = blobUrls.get(id);
  if (u) { URL.revokeObjectURL(u); blobUrls.delete(id); }
}
function markDone(id) {
  revokeBlob(id);
  const el = document.getElementById(id);
  if (!el) return;
  el.remove();
  updatePendingVisibility();
}
function markError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('is-uploading');
  el.classList.add('is-error');
  const s = el.querySelector('.m-thumb-status');
  if (s) s.textContent = '실패';
  const p = el.querySelector('.m-thumb-progress');
  if (p) p.remove();
  el.addEventListener('click', () => { revokeBlob(id); el.remove(); updatePendingVisibility(); });
}

// ── 타일 → 시트 ─────────────
function wireCatButtons() {
  document.querySelectorAll('.m-quad-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!currentCar) { $('#carInput').focus(); toast('차량번호를 먼저 입력하세요'); return; }
      openSheet(btn.dataset.type);
    });
  });
}

// ── 파일 입력 → 세션 업로드 ─────────────
function wireInputs() {
  const handler = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    if (!selectedType) { toast('유형이 선택되지 않았습니다'); return; }
    pushRecent(currentCar);
    renderRecent();
    await uploadSession(files, selectedType);
  };
  $('#fileCamera').addEventListener('change', handler);
  $('#fileGallery').addEventListener('change', handler);
  $('#fileAny').addEventListener('change', handler);
}

// ── 자동완성 ─────────────────────
function renderSuggest(query) {
  const host = $('#suggestList');
  const q = (query || '').trim();
  if (!q) { host.hidden = true; host.innerHTML = ''; return; }

  // 차량번호 / 회사명 / 모델명 부분일치
  const ql = q.toLowerCase();
  const matches = [];
  for (const [car, asset] of assetsByCar.entries()) {
    const member = membersByCode.get(asset.partner_code);
    const company = member?.company_name || '';
    const model = asset.detail_model || '';
    const hay = `${car} ${company} ${model}`.toLowerCase();
    if (hay.includes(ql)) matches.push({ car, company, model });
    if (matches.length >= 20) break;
  }

  if (!matches.length) {
    host.hidden = false;
    host.innerHTML = '<div class="m-suggest-empty">일치하는 차량 없음</div>';
    return;
  }

  const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  host.hidden = false;
  host.innerHTML = matches.map((m) => `
    <div class="m-suggest-item" data-car="${m.car}">
      <div class="m-suggest-ic"><i class="ph ph-car"></i></div>
      <div class="m-suggest-body">
        <div class="m-suggest-num">${m.car.replace(re, '<mark>$1</mark>')}</div>
        <div class="m-suggest-meta">${[m.company, m.model].filter(Boolean).join(' · ') || '—'}</div>
      </div>
    </div>
  `).join('');

  host.querySelectorAll('.m-suggest-item').forEach((el) => {
    el.addEventListener('mousedown', (ev) => ev.preventDefault()); // blur 전에 동작
    el.addEventListener('click', () => {
      const car = el.dataset.car;
      $('#carInput').value = car;
      host.hidden = true;
      host.innerHTML = '';
      setCar(car);
      $('#carInput').blur();
    });
  });
}

// ── 차량 입력 ─────────────────────
function wireCarInput() {
  const inp = $('#carInput');
  const clr = $('#carClear');
  const suggest = $('#suggestList');
  let t;
  inp.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      renderSuggest(inp.value);
      setCar(inp.value);
    }, 120);
  });
  inp.addEventListener('focus', () => renderSuggest(inp.value));
  inp.addEventListener('blur', () => {
    setTimeout(() => { suggest.hidden = true; }, 150);
    setCar(inp.value);
  });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
  if (clr) {
    clr.addEventListener('click', () => {
      inp.value = '';
      suggest.hidden = true;
      setCar('');
      inp.focus();
    });
  }
}

// ── init ─────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  wireCarInput();
  wireCatButtons();
  wireSheet();
  wireInputs();
  wireRecent();
  watchCatalog();
  renderRecent();
  setCar('');
});
