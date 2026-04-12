import { setRecord, updateRecord, watchCollection, nextSequence, isNotDeleted } from './db.js';
const PATH = 'members';
export async function saveMember(d) { const id = await nextSequence('member','MB'); const r = {...d, member_id:id, created_at:Date.now(), updated_at:Date.now()}; await setRecord(`${PATH}/${id}`,r); return r; }
export async function updateMember(id,d) { return updateRecord(`${PATH}/${id}`,{...d, updated_at:Date.now()}); }
export function watchMembers(cb) { return watchCollection(PATH, cb, { filter: isNotDeleted }); }
