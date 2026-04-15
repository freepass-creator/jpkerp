/**
 * assets.js — 자산(차량) 컬렉션
 * 키: vin (Firebase 경로) / 표시·운영용 식별자: asset_code (AS00001~)
 */
import { watchCollection, fetchOne, setRecord, updateRecord, softDelete, nextSequence } from './db.js';

const PATH = 'assets';

export function watchAssets(callback) {
  return watchCollection(PATH, callback);
}

export async function getAsset(vin) {
  return fetchOne(`${PATH}/${vin}`);
}

export async function saveAsset(data) {
  const vin = String(data.vin || '').trim();
  if (!vin) throw new Error('차대번호(VIN)는 필수');
  const now = Date.now();

  // 내부 자산코드 — 회원사 있으면 CP00001AS00001, 없으면 AS00001
  // 우선순위: 기존 코드(레거시 vin 제외) > 미리 부여된 코드 > 새 채번
  const existing = await fetchOne(`${PATH}/${vin}`);
  const existingCode = existing?.asset_code;
  const isLegacy = existingCode && existingCode === vin;
  let assetCode = (existingCode && !isLegacy) ? existingCode : (data.asset_code || '');
  if (!assetCode) {
    const partner = (data.partner_code || '').trim();
    if (partner) {
      const seq = await nextSequence(`asset_${partner}`, '', 5);
      assetCode = `${partner}AS${seq}`;
    } else {
      assetCode = await nextSequence('asset', 'AS', 5);
    }
  }

  const record = {
    ...data,
    vin,
    asset_code: assetCode,
    status: data.status || 'active',
    created_at: existing?.created_at || data.created_at || now,
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
