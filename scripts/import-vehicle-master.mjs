#!/usr/bin/env node
/**
 * vehicle-master-seed.json → RTDB vehicle_master 직접 저장.
 *
 * 사용:
 *   node scripts/import-vehicle-master.mjs              # 병합 (기존 유지 + 새것 추가)
 *   node scripts/import-vehicle-master.mjs --replace    # 전체 삭제 후 재작성
 *   node scripts/import-vehicle-master.mjs --dry-run    # 집계만
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, get, update, remove } from 'firebase/database';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_FILE = path.join(__dirname, 'vehicle-master-seed.json');
const ROOT = 'vehicle_master';

const app = initializeApp({
  databaseURL: 'https://jpkerp-default-rtdb.asia-southeast1.firebasedatabase.app',
  apiKey: 'AIzaSyCCzPhqUiLXFB0zu41txT9OjKXE8ACqu4Y',
  projectId: 'jpkerp',
});
const db = getDatabase(app);

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const replace = process.argv.includes('--replace');

  const rows = JSON.parse(await fs.readFile(SEED_FILE, 'utf8'));
  console.log(`[import] seed: ${rows.length}개 행`);

  const existingSnap = await get(ref(db, ROOT));
  const existing = existingSnap.exists() ? existingSnap.val() : {};
  console.log(`[import] 기존 vehicle_master: ${Object.keys(existing).length}개`);

  if (dryRun) {
    const byOrigin = rows.reduce((acc, r) => ((acc[r.origin] = (acc[r.origin] ?? 0) + 1), acc), {});
    console.log('[dry-run] origin 집계:', byOrigin);
    console.log('[dry-run] 샘플 3개:');
    for (const r of rows.slice(0, 3)) console.log(' ', JSON.stringify({ _key: r._key, origin: r.origin, maker: r.maker, model: r.model, sub: r.sub }));
    process.exit(0);
  }

  if (replace) {
    console.log('[import] --replace: 기존 데이터 삭제 중...');
    await remove(ref(db, ROOT));
  }

  // RTDB update()로 배치 저장
  const batchSize = 200;
  let done = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const updates = {};
    for (const row of chunk) {
      const { _key, ...payload } = row;
      // _encar_* 메타 제거 (저장 안 함)
      const clean = Object.fromEntries(
        Object.entries(payload).filter(([k, v]) => !k.startsWith('_encar_') && v !== undefined && v !== null)
      );
      updates[`${ROOT}/${_key}`] = clean;
    }
    await update(ref(db), updates);
    done += chunk.length;
    console.log(`  진행: ${done}/${rows.length}`);
  }

  console.log(`[import] 완료 · ${done}개 저장`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[import] 실패:', err);
  process.exit(1);
});
