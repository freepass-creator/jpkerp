/**
 * alimtalk.js — 카카오 알림톡 발송 큐 (Aligo)
 *
 * 클라이언트는 직접 Aligo API 호출하지 않고 alimtalk_queue 에 row 만 적재.
 * 서버측 워커(Flask 또는 Cloud Function)가 큐를 폴링해 실제 발송.
 *
 * 템플릿:
 *   - unpaid    : 미수 안내
 *   - return    : 반납 예정 안내
 *   - payment   : 입금 확인
 *   - contract  : 신규 계약 환영
 */
import { setRecord, updateRecord, watchCollection, nextSequence, isNotDeleted } from './db.js';

const PATH = 'alimtalk_queue';

/**
 * @param {object} data
 *   template:    'unpaid' | 'return' | 'payment' | 'contract'
 *   to_phone:    '010-1234-5678'
 *   to_name:     '홍길동'
 *   variables:   { ... } 템플릿 치환용
 *   ref_type:    'billing' | 'contract' | 'manual'
 *   ref_id:      참조 ID
 */
export async function enqueueAlimtalk(data) {
  const id = await nextSequence('alimtalk', 'AT');
  const now = Date.now();
  const record = {
    ...data,
    alimtalk_id: id,
    status: 'pending', // pending / sending / sent / failed
    queued_at: now,
    created_at: now,
    updated_at: now,
  };
  await setRecord(`${PATH}/${id}`, record);
  return record;
}

export function watchAlimtalkQueue(callback) {
  return watchCollection(PATH, callback, {
    filter: isNotDeleted,
    sort: (a, b) => (b.queued_at || 0) - (a.queued_at || 0),
  });
}

// ─── 템플릿 미리보기 (실제 발송 전 직원 검수용) ─────────────
export const TEMPLATES = {
  unpaid: ({ name, car, seq, amount, due }) =>
    `[안내] ${name}님, ${car} 차량의 ${seq}회차 (${due}) 대여료 ${Number(amount).toLocaleString()}원이 미납 상태입니다. 빠른 시일 내 입금 부탁드립니다.`,
  return: ({ name, car, end }) =>
    `[안내] ${name}님, ${car} 차량의 계약 종료일 (${end}) 이 다가옵니다. 반납 일정 협의 부탁드립니다.`,
  payment: ({ name, amount, date }) =>
    `[입금확인] ${name}님, ${date}에 ${Number(amount).toLocaleString()}원이 정상 입금되었습니다. 감사합니다.`,
  contract: ({ name, car, start }) =>
    `[계약안내] ${name}님, ${car} 차량 계약이 ${start}부터 시작됩니다. 문의: 02-XXX-XXXX`,
};

export function previewTemplate(template, vars) {
  const fn = TEMPLATES[template];
  if (!fn) return '';
  try { return fn(vars || {}); }
  catch { return ''; }
}

/** 큐 등록 + 즉시 발송 시도 (서버 엔드포인트 호출) */
export async function sendAlimtalk(data) {
  const message = previewTemplate(data.template, data.variables);
  const queued = await enqueueAlimtalk(data);
  try {
    const res = await fetch('/api/alimtalk/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template: data.template,
        to_phone: data.to_phone,
        to_name: data.to_name,
        subject: '알림',
        message,
      }),
    });
    const result = await res.json();
    // 큐 status 업데이트
    await updateRecord(`${PATH}/${queued.alimtalk_id}`, {
      status: result.ok ? 'sent' : 'failed',
      sent_at: Date.now(),
      response: result,
    });
    return result;
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
