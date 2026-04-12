import { setRecord, updateRecord, watchCollection, nextSequence, isNotDeleted } from './db.js';
const PATH = 'seals';
export async function saveSeal(d) { const id = await nextSequence('seal','SL'); const r = {...d, seal_id:id, created_at:Date.now(), updated_at:Date.now()}; await setRecord(`${PATH}/${id}`,r); return r; }
export function watchSeals(cb) { return watchCollection(PATH, cb, { filter: isNotDeleted }); }
