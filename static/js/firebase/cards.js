import { setRecord, updateRecord, watchCollection, nextSequence, isNotDeleted } from './db.js';
const PATH = 'cards';
export async function saveCard(d) { const id = await nextSequence('card','CD'); const r = {...d, card_id:id, created_at:Date.now(), updated_at:Date.now()}; await setRecord(`${PATH}/${id}`,r); return r; }
export async function updateCard(id,d) { return updateRecord(`${PATH}/${id}`,{...d, updated_at:Date.now()}); }
export function watchCards(cb) { return watchCollection(PATH, cb, { filter: isNotDeleted }); }
