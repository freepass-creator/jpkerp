/**
 * notifications.js — 알림
 *
 * notifications/{id}
 *   to_uid     : 받는 직원
 *   from_uid   : 보낸 직원
 *   type       : 'assign' | 'comment' | 'mention' | 'overdue' | 'system'
 *   title      : '출고 업무 배정'
 *   message    : '02무0357 출고 건 담당자로 지정되었습니다'
 *   ref_type   : 'event' | 'contract' | 'billing'
 *   ref_id     : 'EV00042'
 *   read       : false
 *   created_at : timestamp
 */
import { setRecord, updateRecord, watchCollection, nextSequence } from './db.js';

const PATH = 'notifications';

export async function sendNotification(data) {
  const id = await nextSequence('noti', 'NT');
  const record = {
    ...data,
    noti_id: id,
    read: false,
    created_at: Date.now(),
  };
  await setRecord(`${PATH}/${id}`, record);
  return record;
}

export async function markRead(notiId) {
  return updateRecord(`${PATH}/${notiId}`, { read: true, read_at: Date.now() });
}

export async function markAllRead(uid) {
  // watchNotifications로 가져온 후 일괄 처리
}

export function watchNotifications(uid, callback) {
  return watchCollection(PATH, (all) => {
    callback(all.filter(n => n.to_uid === uid && n.status !== 'deleted'));
  }, {
    sort: (a, b) => (b.created_at || 0) - (a.created_at || 0),
  });
}
