#!/usr/bin/env node
/**
 * Encar taxonomy → vehicle_master 스키마 변환.
 *
 * 입력: scripts/encar-taxonomy.json (crawl-encar.mjs 결과)
 * 출력: scripts/vehicle-master-seed.json
 *
 * 매핑:
 *   Encar                → vehicle_master
 *   ─────────────────────────────────────────────
 *   CarType(Y/N)         → origin ("국산"/"수입")
 *   Manufacturer.name    → maker ("현대")
 *   ModelGroup.name      → model ("아반떼")
 *   Model.name           → sub ("아반떼 (CN7)"), car_name (등록증 ④ 매칭)
 *   Model.count          → _encar_count (메타)
 *   Mfg.eng_name         → maker_eng ("Hyundai")
 *   Mfg.code             → maker_code ("001")
 *
 * 각 Model(세대) 하나당 master row 하나 생성.
 * code = `encar_${mfgCode}_${mgCode}_${modelCode}` — 중복 방지용 고유 키
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IN_FILE = path.join(__dirname, 'encar-taxonomy.json');
const OUT_FILE = path.join(__dirname, 'vehicle-master-seed.json');

function slugify(s) {
  return String(s || '')
    .replace(/\s+/g, '_')
    .replace(/[()\/\\]/g, '')
    .replace(/[^\w가-힣_-]/g, '')
    .slice(0, 40);
}

// Encar 긴 제조사명 → 짧은 이름 (자산 DB/UI 일관성)
const MAKER_NORMALIZE = {
  'KG모빌리티(쌍용)': 'KGM',
  '쉐보레(GM대우)': '쉐보레',
  '르노코리아(삼성)': '르노',
};
function normalizeMaker(name) {
  return MAKER_NORMALIZE[name] ?? name;
}

/** 생산종료가 현재로부터 15년 초과면 archived */
const ARCHIVE_CUTOFF_YEAR = new Date().getFullYear() - 15;
function isArchived(productionEnd) {
  if (!productionEnd || productionEnd === '현재') return false;
  const m = String(productionEnd).match(/^(\d{4})/);
  if (!m) return false;
  return parseInt(m[1], 10) < ARCHIVE_CUTOFF_YEAR;
}

async function main() {
  const raw = JSON.parse(await fs.readFile(IN_FILE, 'utf8'));
  const rows = [];
  const now = Date.now();

  for (const ct of raw.car_types ?? []) {
    for (const mfg of ct.manufacturers ?? []) {
      for (const mg of mfg.model_groups ?? []) {
        // Model(세대)이 있으면 세대별로, 없으면 ModelGroup만으로 row 생성
        const models = mg.models?.length ? mg.models : [{ name: mg.name, value: mg.value, count: mg.count, code: mg.code }];
        for (const md of models) {
          const mfgSlug = mfg.code || slugify(mfg.eng_name) || slugify(mfg.name);
          const mgSlug = mg.code || slugify(mg.value || mg.name);
          const mdSlug = md.code || slugify(md.value || md.name);
          const key = `encar_${mfgSlug}_${mgSlug}_${mdSlug}`;

          // 차종 마스터 핵심 필드만 유지:
          //   제조사·모델·세부모델·제조국·차종구분·생산시작·생산종료
          //   (연료/배기량/승차/배터리 등은 자동차등록증에서 채움)
          const row = {
            _key: key,
            origin: ct.origin,          // 국산/수입
            maker: normalizeMaker(mfg.name),  // 제조사 (짧은 이름으로 정규화)
            model: mg.name,              // 모델
            sub: md.name,                // 세부모델
            car_name: md.name,           // 등록증 ④ 차명 매칭 키
            source: 'encar',
            status: 'active',
            created_at: now,
            updated_at: now,
          };
          if (md.category) row.category = md.category;              // 차종구분 (대형 MPV 등)
          if (md.production_start) row.production_start = md.production_start;
          if (md.production_end) row.production_end = md.production_end;
          row.archived = isArchived(md.production_end);               // 15년 초과 단종 → UI에서 숨김
          if (mfg.eng_name) row.maker_eng = mfg.eng_name;
          if (mfg.code) row.maker_code = mfg.code;
          // 통상 인기 기준 정렬용 — 엔카 매물 수(세대별) + 모델그룹 총 매물 수
          if (typeof md.count === 'number') row.popularity = md.count;
          if (typeof mg.count === 'number') row.model_popularity = mg.count;
          rows.push(row);
        }
      }
    }
  }

  // 중복 체크 (_key 기준)
  const seen = new Set();
  const unique = [];
  let dups = 0;
  for (const r of rows) {
    if (seen.has(r._key)) { dups++; continue; }
    seen.add(r._key);
    unique.push(r);
  }

  const byOrigin = unique.reduce((acc, r) => {
    acc[r.origin] = (acc[r.origin] ?? 0) + 1;
    return acc;
  }, {});
  const archivedCount = unique.filter((r) => r.archived).length;

  console.log(`[encar-to-master] 변환 완료 · ${unique.length} rows`);
  console.log(`  국산: ${byOrigin['국산'] ?? 0}개 / 수입: ${byOrigin['수입'] ?? 0}개`);
  console.log(`  archived (15년 초과): ${archivedCount}개 → UI 기본 숨김`);
  if (dups) console.log(`  중복 제거: ${dups}개`);

  await fs.writeFile(OUT_FILE, JSON.stringify(unique, null, 2), 'utf8');
  console.log(`[encar-to-master] 저장 → ${OUT_FILE}`);
}

main().catch((err) => {
  console.error('[encar-to-master] 실패:', err);
  process.exit(1);
});
