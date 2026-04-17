/**
 * db.js — Firebase Realtime DB 공통 헬퍼
 *
 * 모든 컬렉션 모듈(assets/customers/contracts/...)이 이걸 사용.
 */
import {
  ref, set, get, update, remove, onValue, runTransaction,
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js';
import { db } from './config.js';

export const isNotDeleted = (item) => item?.status !== 'deleted';

/**
 * 컬렉션 watch — 실시간 구독
 * @param {string} path
 * @param {(items: any[]) => void} callback
 * @param {{filter?: (item)=>boolean, sort?: (a,b)=>number}} options
 * @returns unsubscribe 함수
 */
export function watchCollection(path, callback, options = {}) {
  const r = ref(db, path);
  const unsub = onValue(r, (snap) => {
    const val = snap.val() || {};
    let items = Object.entries(val).map(([k, v]) => ({ ...v, _key: k }));
    if (options.filter !== undefined) items = items.filter(options.filter);
    else items = items.filter(isNotDeleted);
    if (options.sort) items.sort(options.sort);
    else items.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    callback(items);
  });
  return unsub;
}

export async function fetchOne(path) {
  const snap = await get(ref(db, path));
  return snap.exists() ? snap.val() : null;
}

export async function setRecord(path, data) {
  await set(ref(db, path), data);
  return data;
}

export async function updateRecord(path, data) {
  const cur = await fetchOne(path);
  if (!cur) throw new Error('항목을 찾을 수 없습니다.');
  const merged = { ...cur, ...data, updated_at: Date.now() };
  await update(ref(db, path), merged);
  return merged;
}

export async function softDelete(path) {
  return updateRecord(path, { status: 'deleted' });
}

export async function hardDelete(path) {
  await remove(ref(db, path));
}

/** 시퀀스 자동 채번 — code_sequences/{key} */
export async function nextSequence(key, prefix = '', pad = 5) {
  const seqRef = ref(db, `code_sequences/${key}`);
  let nextVal;
  await runTransaction(seqRef, (cur) => {
    nextVal = (cur || 0) + 1;
    return nextVal;
  });
  return prefix + String(nextVal).padStart(pad, '0');
}
