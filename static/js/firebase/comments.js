/**
 * comments.js — 업무 코멘트/채팅
 *
 * 각 이벤트(업무)에 대해 직원들이 코멘트 달 수 있음.
 * comments/{id} — event_id(연결 업무), user, message, created_at
 *
 * 대화방 = event_id 없이 room_id 로 그룹핑
 */
import { setRecord, watchCollection, nextSequence } from './db.js';

const PATH = 'comments';

export async function addComment(data) {
  const id = await nextSequence('comment', 'CM');
  const record = {
    ...data,
    comment_id: id,
    created_at: Date.now(),
  };
  await setRecord(`${PATH}/${id}`, record);
  return record;
}

export function watchComments(callback, options = {}) {
  return watchCollection(PATH, callback, {
    sort: (a, b) => (a.created_at || 0) - (b.created_at || 0),
    ...options,
  });
}

export function watchEventComments(eventId, callback) {
  return watchComments((all) => {
    callback(all.filter(c => c.event_id === eventId));
  });
}

export function watchRoomComments(roomId, callback) {
  return watchComments((all) => {
    callback(all.filter(c => c.room_id === roomId));
  });
}
