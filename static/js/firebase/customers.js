/**
 * customers.js — 고객 컬렉션
 * 키: customer_code (자동 채번 CU00001)
 * 매칭 키: customer_reg_no (고객등록번호 — 주민번호 또는 사업자등록번호)
 */
import {
  watchCollection, fetchOne, setRecord, updateRecord, softDelete, nextSequence,
} from './db.js';
import { ref, get } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js';
import { db } from './config.js';

const PATH = 'customers';

export function watchCustomers(callback) {
  return watchCollection(PATH, callback);
}

export async function getCustomer(code) {
  return fetchOne(`${PATH}/${code}`);
}

export async function saveCustomer(data) {
  // 고객코드 — 회원사 있으면 CP01CU00001, 없으면 CU00001
  let code = data.customer_code || '';
  if (!code) {
    const partner = (data.partner_code || '').trim();
    if (partner) {
      const seq = await nextSequence(`customer_${partner}`, '', 5);
      code = `${partner}CU${seq}`;
    } else {
      code = await nextSequence('customer', 'CU', 5);
    }
  }
  const now = Date.now();
  const record = {
    ...data,
    customer_code: code,
    status: data.status || 'active',
    created_at: now,
    updated_at: now,
  };
  await setRecord(`${PATH}/${code}`, record);
  return record;
}

export async function updateCustomer(code, data) {
  return updateRecord(`${PATH}/${code}`, data);
}

export async function deleteCustomer(code) {
  return softDelete(`${PATH}/${code}`);
}

/** 고객등록번호로 upsert — CSV 일괄 시 사용 */
export async function upsertByRegNo(data) {
  const regNo = String(data.customer_reg_no || '').trim();
  if (!regNo) throw new Error('고객등록번호가 필요합니다.');
  const snap = await get(ref(db, PATH));
  const all = Object.values(snap.val() || {});
  const existing = all.find(c => String(c.customer_reg_no || '').trim() === regNo && c.status !== 'deleted');
  if (existing) {
    await updateCustomer(existing.customer_code, data);
    return { ...existing, ...data, _action: 'updated' };
  }
  const created = await saveCustomer(data);
  return { ...created, _action: 'created' };
}
