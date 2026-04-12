import { setRecord, updateRecord, watchCollection, nextSequence, isNotDeleted } from './db.js';
const PATH = 'admin_contracts';
export async function saveAdminContract(d) { const id = await nextSequence('adcon','AC'); const r = {...d, doc_id:id, created_at:Date.now(), updated_at:Date.now()}; await setRecord(`${PATH}/${id}`,r); return r; }
export function watchAdminContracts(cb) { return watchCollection(PATH, cb, { filter: isNotDeleted }); }
