/**
 * tasks.js — 업무 생성/배정
 *
 * tasks/{id}
 *   task_id, title, description, priority, status,
 *   assignee (담당자), participants (참여자),
 *   due_date, category, ref_type, ref_id,
 *   created_by, created_at, updated_at
 */
import { setRecord, updateRecord, watchCollection, nextSequence, isNotDeleted } from './db.js';

const PATH = 'tasks';

export async function saveTask(data) {
  const id = await nextSequence('task', 'TK');
  const now = Date.now();
  const record = {
    ...data,
    task_id: id,
    status: data.status || 'open',
    created_at: now,
    updated_at: now,
  };
  await setRecord(`${PATH}/${id}`, record);
  return record;
}

export async function updateTask(id, data) {
  return updateRecord(`${PATH}/${id}`, { ...data, updated_at: Date.now() });
}

export function watchTasks(callback) {
  return watchCollection(PATH, callback, {
    filter: isNotDeleted,
    sort: (a, b) => (b.created_at || 0) - (a.created_at || 0),
  });
}
