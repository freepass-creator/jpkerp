import { setRecord, updateRecord, watchCollection, nextSequence, isNotDeleted } from './db.js';
const PATH = 'leases';
export async function saveLease(d) { const id = await nextSequence('lease','LS'); const r = {...d, lease_id:id, created_at:Date.now(), updated_at:Date.now()}; await setRecord(`${PATH}/${id}`,r); return r; }
export async function updateLease(id,d) { return updateRecord(`${PATH}/${id}`,{...d, updated_at:Date.now()}); }
export function watchLeases(cb) { return watchCollection(PATH, cb, { filter: isNotDeleted }); }
