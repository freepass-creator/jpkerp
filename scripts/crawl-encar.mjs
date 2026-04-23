#!/usr/bin/env node
/**
 * Encar API 크롤러 — CarType → Manufacturer → ModelGroup → Model(세대) 3단계 수집.
 *
 * 구조 (리버스 엔지니어링 결과):
 *   iNav.Nodes[CarType].Facets[Y/N].Refinements.Nodes[Manufacturer]
 *     .Facets[현대].Refinements.Nodes[ModelGroup]
 *       .Facets[아반떼].Refinements.Nodes[Model]
 *         .Facets[아반떼 (CN7)]
 *
 * 용어 매핑 (Encar → vehicle_master):
 *   CarType(Y/N)   → origin (국산/수입)
 *   Manufacturer   → maker ("현대")
 *   ModelGroup     → model ("아반떼")
 *   Model          → sub / car_name ("아반떼 (CN7)")  ★ 등록증 ④ 차명과 매칭
 *
 * Badge/BadgeDetail(트림)은 등록증 매칭에 불필요하므로 스킵.
 *
 * 출력: scripts/encar-taxonomy.json
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.join(__dirname, 'encar-taxonomy.json');

const BASE = 'http://api.encar.com/search/car/list/general';
const INAV = '|Metadata|Sort|Manufacturer|ModelGroup|Model|Badge|BadgeDetail';
const UA = 'Mozilla/5.0 (JPKERP/1.0; internal use)';
const DELAY_MS = 350;
const RETRY_DELAY_MS = 2000;
const MAX_RETRY = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(query, attempt = 1) {
  const url = `${BASE}?count=true&q=${encodeURIComponent(query)}&inav=${encodeURIComponent(INAV)}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (attempt < MAX_RETRY) {
      await sleep(RETRY_DELAY_MS * attempt);
      return fetchJson(query, attempt + 1);
    }
    throw new Error(`${err.message}: ${query.slice(0, 80)}`);
  }
}

/** 드릴다운 체인을 모두 따라 특정 Expression prefix의 Facets 추출 */
function extractChainedFacets(data, expressionPrefix) {
  function walk(container) {
    for (const node of container?.Nodes ?? []) {
      for (const f of node.Facets ?? []) {
        if (f.Expression?.startsWith(expressionPrefix + '.')) {
          return node.Facets.filter((ff) => ff.Expression?.startsWith(expressionPrefix + '.'));
        }
        if (f.Refinements) {
          const r = walk(f.Refinements);
          if (r) return r;
        }
      }
    }
    return null;
  }
  return walk(data.iNav) ?? [];
}

function extractCarTypeFacets(data, carTypeValue) {
  const carType = data.iNav?.Nodes?.find((n) => n.Name === 'CarType');
  const facet = carType?.Facets?.find((f) => f.Value === carTypeValue);
  return facet?.Refinements?.Nodes?.[0]?.Facets ?? [];
}

async function listManufacturers(carType) {
  const q = `(And.Hidden.N._.CarType.${carType}.)`;
  const data = await fetchJson(q);
  return extractCarTypeFacets(data, carType);
}

async function listModelGroups(carType, mfgValue) {
  const q = `(And.Hidden.N._.(C.CarType.${carType}._.Manufacturer.${mfgValue}.))`;
  const data = await fetchJson(q);
  return extractChainedFacets(data, 'ModelGroup');
}

async function listModels(carType, mfgValue, mgValue) {
  const q = `(And.Hidden.N._.(C.CarType.${carType}._.(C.Manufacturer.${mfgValue}._.ModelGroup.${mgValue}.)))`;
  const data = await fetchJson(q);
  return extractChainedFacets(data, 'Model');
}

function summarize(f) {
  return {
    name: f.DisplayValue,
    value: f.Value,
    count: f.Count,
    code: f.Metadata?.Code?.[0],
    eng_name: f.Metadata?.EngName?.[0],
    ordering: f.Metadata?.Ordering?.[0],
  };
}

// 수입 제조사 화이트리스트 (jpkerp 실제 등록된 브랜드 + 여유)
const IMPORT_WHITELIST = new Set([
  '벤츠', '지프', 'BMW', '마세라티', '테슬라', '포드', '포르쉐', '미니',
  '아우디', '폭스바겐', '렉서스', '토요타', '혼다', '볼보', '랜드로버',
]);

async function main() {
  const carTypes = [
    { code: 'Y', label: '국산', origin: '국산' },
    { code: 'N', label: '수입', origin: '수입' },
  ];

  const result = {
    source: 'api.encar.com',
    fetched_at: new Date().toISOString(),
    car_types: [],
  };

  let requestCount = 0;
  const startTime = Date.now();

  for (const ct of carTypes) {
    console.log(`\n[${ct.label}] 제조사 수집 시작`);
    await sleep(DELAY_MS);
    const mfgs = await listManufacturers(ct.code);
    requestCount++;
    console.log(`[${ct.label}] 제조사 ${mfgs.length}개`);

    const ctEntry = { car_type: ct.label, origin: ct.origin, manufacturers: [] };

    // 수입은 화이트리스트만 처리
    const filtered = ct.code === 'N'
      ? mfgs.filter((m) => IMPORT_WHITELIST.has(m.DisplayValue) || IMPORT_WHITELIST.has(m.Value))
      : mfgs;
    if (ct.code === 'N') {
      const skipped = mfgs.length - filtered.length;
      console.log(`[${ct.label}] 화이트리스트 필터 적용 → ${filtered.length}개 (${skipped}개 스킵)`);
    }

    for (const mfg of filtered) {
      const mfgEntry = { ...summarize(mfg), model_groups: [] };
      process.stdout.write(`  [${mfg.DisplayValue}] `);
      try {
        await sleep(DELAY_MS);
        const mgs = await listModelGroups(ct.code, mfg.Value);
        requestCount++;
        process.stdout.write(`MG${mgs.length} `);

        for (const mg of mgs) {
          const mgEntry = { ...summarize(mg), models: [] };
          try {
            await sleep(DELAY_MS);
            const models = await listModels(ct.code, mfg.Value, mg.Value);
            requestCount++;
            mgEntry.models = models.map(summarize);
            process.stdout.write('.');
          } catch (err) {
            process.stdout.write('X');
            mgEntry.error = err.message;
          }
          mfgEntry.model_groups.push(mgEntry);
        }
      } catch (err) {
        process.stdout.write(`FAIL(${err.message.slice(0, 30)})`);
        mfgEntry.error = err.message;
      }
      ctEntry.manufacturers.push(mfgEntry);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(` · req=${requestCount} · ${elapsed}s`);
      // 중간 저장
      const snapshot = {
        ...result,
        car_types: [...result.car_types, ctEntry],
      };
      await fs.writeFile(OUT_FILE, JSON.stringify(snapshot, null, 2), 'utf8');
    }
    result.car_types.push(ctEntry);
  }

  await fs.writeFile(OUT_FILE, JSON.stringify(result, null, 2), 'utf8');

  let totalMfgs = 0, totalMGs = 0, totalModels = 0;
  for (const ct of result.car_types) {
    totalMfgs += ct.manufacturers.length;
    for (const m of ct.manufacturers) {
      totalMGs += m.model_groups?.length ?? 0;
      for (const mg of m.model_groups ?? []) totalModels += mg.models?.length ?? 0;
    }
  }
  const totalSec = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\n[crawl-encar] 완료 · 제조사 ${totalMfgs} · 모델그룹 ${totalMGs} · 세대모델 ${totalModels} · ${requestCount}req · ${totalSec}s`);
  console.log(`[crawl-encar] 저장 → ${OUT_FILE}`);
}

main().catch((err) => {
  console.error('[crawl-encar] 실패:', err);
  process.exit(1);
});
