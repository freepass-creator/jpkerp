import { setRecord, updateRecord, watchCollection, nextSequence, isNotDeleted } from './db.js';
const PATH = 'bank_accounts';
export async function saveBankAccount(d) { const id = await nextSequence('bacct','BA'); const r = {...d, account_id:id, created_at:Date.now(), updated_at:Date.now()}; await setRecord(`${PATH}/${id}`,r); return r; }
export async function updateBankAccount(id,d) { return updateRecord(`${PATH}/${id}`,{...d, updated_at:Date.now()}); }
export function watchBankAccounts(cb) { return watchCollection(PATH, cb, { filter: isNotDeleted }); }
