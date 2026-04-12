import { setRecord, updateRecord, watchCollection, nextSequence, isNotDeleted } from './db.js';
const PATH = 'leaves';
export async function saveLeave(d) { const id = await nextSequence('leave','LV'); const r = {...d, leave_id:id, status:d.status||'pending', created_at:Date.now(), updated_at:Date.now()}; await setRecord(`${PATH}/${id}`,r); return r; }
export async function updateLeave(id,d) { return updateRecord(`${PATH}/${id}`,{...d, updated_at:Date.now()}); }
export function watchLeaves(cb) { return watchCollection(PATH, cb, { filter: isNotDeleted, sort:(a,b)=>(b.created_at||0)-(a.created_at||0) }); }
