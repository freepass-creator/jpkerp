/**
 * approvals.js — 전자결재
 *
 * approvals/{id}
 *   approval_id   : AP00001
 *   title         : '차량 구매 품의'
 *   type          : 'purchase'|'expense'|'leave'|'etc'
 *   drafter       : 기안자 (uid/name)
 *   content       : 결재 내용 (HTML or text)
 *   amount        : 금액 (있으면)
 *   attachments   : [{name, url}]
 *   approval_line : [{uid, name, role, status:'pending'|'approved'|'rejected', date, comment}]
 *   status        : 'draft'|'pending'|'approved'|'rejected'|'canceled'
 *   created_at, updated_at
 */
import { setRecord, updateRecord, watchCollection, nextSequence, isNotDeleted } from './db.js';

const PATH = 'approvals';

export async function createApproval(data) {
  const id = await nextSequence('approval', 'AP');
  const now = Date.now();
  const record = {
    ...data,
    approval_id: id,
    status: data.status || 'pending',
    created_at: now,
    updated_at: now,
  };
  await setRecord(`${PATH}/${id}`, record);
  return record;
}

export async function updateApproval(id, data) {
  return updateRecord(`${PATH}/${id}`, { ...data, updated_at: Date.now() });
}

export function watchApprovals(callback) {
  return watchCollection(PATH, callback, {
    filter: isNotDeleted,
    sort: (a, b) => (b.created_at || 0) - (a.created_at || 0),
  });
}
