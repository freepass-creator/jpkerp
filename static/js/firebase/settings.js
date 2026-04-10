/**
 * settings.js — 설정 (싱글톤 문서들)
 *
 * 회사정보 / 알림톡 키 / 시스템 설정 — 모두 settings/{key} 단일 path
 */
import { setRecord, fetchOne, watchCollection } from './db.js';

const PATH = 'settings';

export async function getCompany() {
  return fetchOne(`${PATH}/company`);
}

export async function saveCompany(data) {
  const now = Date.now();
  const record = { ...data, updated_at: now };
  await setRecord(`${PATH}/company`, record);
  return record;
}

export async function getAlimtalkConfig() {
  return fetchOne(`${PATH}/alimtalk`);
}

export async function saveAlimtalkConfig(data) {
  const record = { ...data, updated_at: Date.now() };
  await setRecord(`${PATH}/alimtalk`, record);
  return record;
}
