/**
 * assets.js — 자산(차량) 컬렉션
 * 키: vin (=asset_code) — jpkerp 호환
 */
import { watchCollection, fetchOne, setRecord, updateRecord, softDelete } from './db.js';

const PATH = 'assets';

export function watchAssets(callback) {
  return watchCollection(PATH, callback);
}

export async function getAsset(vin) {
  return fetchOne(`${PATH}/${vin}`);
}

export async function saveAsset(data) {
  const vin = String(data.vin || data.asset_code || '').trim();
  if (!vin) throw new Error('차대번호(VIN)는 필수');
  const now = Date.now();
  const record = {
    ...data,
    vin,
    asset_code: vin,
    status: data.status || 'active',
    created_at: data.created_at || now,
    updated_at: now,
  };
  await setRecord(`${PATH}/${vin}`, record);
  return record;
}

export async function updateAsset(vin, data) {
  return updateRecord(`${PATH}/${vin}`, data);
}

export async function deleteAsset(vin) {
  return softDelete(`${PATH}/${vin}`);
}
