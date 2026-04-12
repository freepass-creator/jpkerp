/**
 * uploads.js — 업로드 통합 저장소
 *
 * 어떤 파일이든 올리면 원본 데이터를 일단 다 저장.
 * 매칭/분류 결과와 함께 보관 → 나중에 재처리 가능.
 *
 * uploads/{id}
 *   upload_id       : UL00001
 *   filename        : 'shinhan_202604.csv'
 *   file_type       : 'csv' | 'pdf' | 'image' | 'xlsx'
 *   detected_type   : 'bank_shinhan' | 'card_shinhan' | 'asset' | 'contract' | 'unknown'
 *   detected_label  : '신한은행 통장내역'
 *   row_count       : 20
 *   status          : 'pending' | 'processed' | 'partial' | 'error'
 *   uploaded_at     : timestamp
 *   processed_at    : timestamp
 *   results         : { ok: 15, skip: 3, fail: 2 }
 *   rows            : [ { ...원본 데이터, _match: {...매칭결과} } ]
 *
 * 용도:
 *   - 업로드 이력 추적 (언제 누가 뭘 올렸는지)
 *   - 재처리 (매칭 로직 업데이트 후 다시 돌리기)
 *   - 원본 보존 (잘못 반영해도 원본에서 복구)
 *   - 중복 방지 (같은 파일 다시 올렸는지 체크)
 */
import {
  setRecord, updateRecord, watchCollection, fetchOne,
  nextSequence, isNotDeleted,
} from './db.js';

const PATH = 'uploads';

export async function saveUpload(data) {
  const id = await nextSequence('upload', 'UL');
  const now = Date.now();
  const record = {
    ...data,
    upload_id: id,
    status: data.status || 'pending',
    uploaded_at: now,
    created_at: now,
    updated_at: now,
  };
  await setRecord(`${PATH}/${id}`, record);
  return record;
}

export async function updateUpload(id, data) {
  return updateRecord(`${PATH}/${id}`, { ...data, updated_at: Date.now() });
}

export async function getUpload(id) {
  return fetchOne(`${PATH}/${id}`);
}

export function watchUploads(callback) {
  return watchCollection(PATH, callback, {
    filter: isNotDeleted,
    sort: (a, b) => (b.uploaded_at || 0) - (a.uploaded_at || 0),
  });
}

/**
 * 파일 해시 (간이) — 같은 파일 중복 업로드 방지
 */
export function fileFingerprint(filename, rowCount, firstRow) {
  return `${filename}|${rowCount}|${JSON.stringify(firstRow || {}).slice(0, 100)}`;
}
