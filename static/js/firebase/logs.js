/**
 * logs.js — 활동 로그
 *
 * 누가 언제 뭘 했는지 기록.
 * logs/{id} — user, action, target, detail, created_at
 */
import { setRecord, watchCollection, nextSequence } from './db.js';

const PATH = 'logs';

export async function writeLog(data) {
  const id = await nextSequence('log', 'LG');
  const record = {
    ...data,
    log_id: id,
    created_at: Date.now(),
  };
  await setRecord(`${PATH}/${id}`, record);
  return record;
}

export function watchLogs(callback) {
  return watchCollection(PATH, callback, {
    sort: (a, b) => (b.created_at || 0) - (a.created_at || 0),
  });
}
