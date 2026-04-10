/**
 * users.js — 사용자 프로필 / 권한
 *
 * Firebase Auth 가입은 로그인 페이지에서 처리.
 * 여기서는 RTDB의 users/{uid} 프로필 (이름/역할) 만 관리.
 *
 * 역할: admin / staff / viewer
 */
import { watchCollection, setRecord, updateRecord, fetchOne, isNotDeleted } from './db.js';

const PATH = 'users';

export const ROLES = {
  admin:  '관리자',
  staff:  '직원',
  viewer: '조회만',
};

export function watchUsers(callback) {
  return watchCollection(PATH, callback, {
    filter: isNotDeleted,
    sort: (a, b) => String(a.email || '').localeCompare(String(b.email || '')),
  });
}

export async function getUser(uid) {
  return fetchOne(`${PATH}/${uid}`);
}

export async function saveUser(uid, data) {
  const now = Date.now();
  const record = {
    ...data,
    uid,
    role: data.role || 'viewer',
    created_at: data.created_at || now,
    updated_at: now,
  };
  await setRecord(`${PATH}/${uid}`, record);
  return record;
}

export async function updateUser(uid, data) {
  return updateRecord(`${PATH}/${uid}`, data);
}
