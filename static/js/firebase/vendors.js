/**
 * vendors.js — 거래처 컬렉션
 */
import {
  watchCollection, fetchOne, setRecord, updateRecord, softDelete, nextSequence,
} from './db.js';

const PATH = 'vendors';

export function watchVendors(callback) {
  return watchCollection(PATH, callback);
}

export async function getVendor(code) {
  return fetchOne(`${PATH}/${code}`);
}

export async function saveVendor(data) {
  const code = await nextSequence('vendor', 'VD');
  const now = Date.now();
  const record = {
    ...data,
    vendor_code: code,
    status: data.status || 'active',
    created_at: now,
    updated_at: now,
  };
  await setRecord(`${PATH}/${code}`, record);
  return record;
}

export async function updateVendor(code, data) {
  return updateRecord(`${PATH}/${code}`, data);
}

export async function deleteVendor(code) {
  return softDelete(`${PATH}/${code}`);
}
