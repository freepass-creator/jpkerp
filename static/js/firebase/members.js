import { setRecord, updateRecord, watchCollection, nextSequence, isNotDeleted } from './db.js';
const PATH = 'members';
export async function saveMember(d) { const seq = await nextSequence('member','CP',5); const r = {...d, member_id:seq, partner_code:seq, created_at:Date.now(), updated_at:Date.now()}; await setRecord(`${PATH}/${seq}`,r); return r; }
export async function updateMember(id,d) { return updateRecord(`${PATH}/${id}`,{...d, updated_at:Date.now()}); }
export async function deleteMember(id) {
  const { get, ref, set } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
  const { db } = await import('./config.js');
  const r = ref(db, `${PATH}/${id}`);
  const snap = await get(r);
  if (!snap.exists()) throw new Error('회원사를 찾을 수 없습니다.');
  await set(r, { ...snap.val(), status: 'deleted', deleted_at: Date.now() });
}
export function watchMembers(cb) { return watchCollection(PATH, cb, { filter: isNotDeleted }); }
