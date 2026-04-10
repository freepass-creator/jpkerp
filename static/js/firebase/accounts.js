/**
 * accounts.js — 계정과목 마스터
 *
 * 사용자가 settings/accounts 에서 코드/분류/이름/방향/매핑(type) 을 자유롭게 정의.
 * view-finance 의 계정과목 탭이 이걸 참조해서 events 를 합산.
 */
import {
  watchCollection, setRecord, updateRecord, softDelete, nextSequence, isNotDeleted, fetchOne,
} from './db.js';

const PATH = 'accounts';

export const DEFAULT_SUBJECT = '미분류';

export function watchAccounts(callback) {
  return watchCollection(PATH, callback, {
    filter: isNotDeleted,
    sort: (a, b) => String(a.code || '').localeCompare(String(b.code || '')),
  });
}

export async function saveAccount(data) {
  const code = data.code || await nextSequence('account', 'AC');
  const now = Date.now();
  const record = {
    ...data,
    code,
    direction: data.direction || 'out',
    types: Array.isArray(data.types) ? data.types : (data.types ? String(data.types).split(',').map(s => s.trim()).filter(Boolean) : []),
    created_at: data.created_at || now,
    updated_at: now,
  };
  await setRecord(`${PATH}/${code}`, record);
  return record;
}

export async function updateAccount(code, data) {
  return updateRecord(`${PATH}/${code}`, data);
}

export async function deleteAccount(code) {
  return softDelete(`${PATH}/${code}`);
}

/** 이벤트 → 매칭되는 계정과목 1건 (못 찾으면 fallback name) */
export function findAccountForEvent(accounts, event) {
  if (!event || !accounts?.length) return null;
  // 1. type 정확 매칭
  const byType = accounts.filter(a => Array.isArray(a.types) && a.types.includes(event.type));
  if (byType.length === 1) return byType[0];
  // 2. type + direction 매칭 (통장 같은 양방향 type 처리)
  if (byType.length > 1) {
    const dirMatch = byType.find(a => a.direction === event.direction);
    if (dirMatch) return dirMatch;
    return byType[0];
  }
  return null;
}

/** 시드 — 처음 한 번만 호출 (settings/accounts 가 비어있으면) */
export const SEED = [
  { code: '4100', category: '매출', name: '대여수익',     direction: 'in',  types: ['payment', 'manual_in'] },
  { code: '4200', category: '매출', name: '보증금수입',   direction: 'in',  types: [] },
  { code: '4900', category: '매출', name: '통장입금',     direction: 'in',  types: ['bank_tx'] },
  { code: '5100', category: '매입', name: '차량매입',     direction: 'out', types: [] },
  { code: '5200', category: '매입', name: '차량보험료',   direction: 'out', types: [] },
  { code: '6100', category: '경비', name: '정비비',       direction: 'out', types: ['maintenance'] },
  { code: '6150', category: '경비', name: '사고처리비',   direction: 'out', types: ['accident'] },
  { code: '6160', category: '경비', name: '과태료',       direction: 'out', types: ['penalty'] },
  { code: '6200', category: '경비', name: '유류비',       direction: 'out', types: [] },
  { code: '6300', category: '경비', name: '임차료',       direction: 'out', types: [] },
  { code: '6400', category: '경비', name: '인건비',       direction: 'out', types: [] },
  { code: '6500', category: '경비', name: '광고선전비',   direction: 'out', types: [] },
  { code: '6900', category: '경비', name: '법인카드 지출', direction: 'out', types: ['card_tx'] },
  { code: '6990', category: '경비', name: '수기지출',     direction: 'out', types: ['manual_out'] },
];

export async function seedAccountsIfEmpty() {
  return new Promise((resolve) => {
    let done = false;
    const unsub = watchAccounts(async (items) => {
      if (done) return;
      done = true;
      unsub();
      if (items.length === 0) {
        for (const a of SEED) await saveAccount(a);
        resolve(SEED.length);
      } else resolve(0);
    });
  });
}
