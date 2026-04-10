/**
 * events.js — events 단일 컬렉션
 *
 * 모든 작업의 입력은 events 로 들어온다:
 *   - bank_tx     : 통장 거래내역 (입금/출금)
 *   - payment     : 수납 (자동매칭 또는 수동등록)
 *   - refund      : 환불
 *   - adjustment  : 조정/오프셋
 *   - manual_in   : 수기 입금
 *   - manual_out  : 수기 출금
 *
 * 매칭 결과:
 *   match_status : auto | candidate | unmatched | manual
 *   match_target : { contract_code, billing_id, customer_code }
 */
import {
  setRecord, updateRecord, fetchOne, watchCollection,
  nextSequence, isNotDeleted, softDelete,
} from './db.js';

export const EVENT_TYPES = {
  bank_tx:     '통장거래',
  card_tx:     '법인카드',
  payment:     '수납',
  refund:      '환불',
  adjustment:  '조정',
  manual_in:   '수기입금',
  manual_out:  '수기출금',
  // ─── 운영 ───
  maintenance: '정비',
  accident:    '사고',
  penalty:     '과태료',
  gps:         'GPS',
  delivery:    '출고',
  return:      '반납',
};

export const OPERATION_TYPES = ['maintenance', 'accident', 'penalty', 'gps', 'delivery', 'return'];

export const MATCH_STATUS = {
  auto:       '자동매칭',
  candidate:  '후보',
  unmatched:  '미매칭',
  manual:     '수동',
};

/**
 * @param {object} data
 *   type, date, direction (in/out), amount, account, counterparty,
 *   memo, raw, source (예: 'bank_shinhan'),
 *   match_status, match_target
 */
export async function saveEvent(data) {
  const code = data.event_id || await nextSequence('event', 'EV');
  const now = Date.now();
  const record = {
    ...data,
    event_id: code,
    type: data.type || 'bank_tx',
    direction: data.direction || (Number(data.amount) >= 0 ? 'in' : 'out'),
    amount: Number(data.amount) || 0,
    match_status: data.match_status || 'unmatched',
    status: data.status || 'active',
    created_at: now,
    updated_at: now,
  };
  await setRecord(`events/${code}`, record);
  return record;
}

/** 같은 source + raw_key 가 이미 있으면 update, 없으면 새로 — 통장 중복 업로드 방지 */
export async function upsertEventByRawKey(data) {
  if (!data.raw_key) return saveEvent(data);
  // raw_key 중복 체크 (최근 1000건만 스캔 — 대량시 인덱스 추가 권장)
  return new Promise((resolve, reject) => {
    let resolved = false;
    const unsub = watchEvents(async (items) => {
      if (resolved) return;
      resolved = true;
      unsub();
      const existing = items.find(e => e.raw_key === data.raw_key && e.source === data.source);
      try {
        if (existing) {
          const merged = await updateRecord(`events/${existing.event_id}`, data);
          resolve({ ...merged, _action: 'updated' });
        } else {
          resolve({ ...(await saveEvent(data)), _action: 'created' });
        }
      } catch (e) { reject(e); }
    });
  });
}

export async function updateEvent(eventId, data) {
  return updateRecord(`events/${eventId}`, data);
}

export async function deleteEvent(eventId) {
  return softDelete(`events/${eventId}`);
}

export function watchEvents(callback, options = {}) {
  return watchCollection('events', callback, {
    filter: options.filter || isNotDeleted,
    sort: options.sort || ((a, b) => String(b.date || '').localeCompare(String(a.date || ''))),
    ...options,
  });
}

export async function getEvent(eventId) {
  return fetchOne(`events/${eventId}`);
}
