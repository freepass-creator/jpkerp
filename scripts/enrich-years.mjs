#!/usr/bin/env node
/**
 * encar-taxonomy.json의 각 Model(세대)에 YearGroup + Category fetch 후
 * production_start / production_end / category 주입 → taxonomy 재저장.
 *
 * 실행: node scripts/enrich-years.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, 'encar-taxonomy.json');

const BASE = 'http://api.encar.com/search/car/list/general';
const INAV = '|Metadata|Sort|Manufacturer|ModelGroup|Model|Badge|BadgeDetail|YearGroup';
const UA = 'Mozilla/5.0 (JPKERP/1.0; internal use)';
const DELAY_MS = 280;
const CURRENT_YEAR = new Date().getFullYear();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(q, attempt = 1) {
  const url = `${BASE}?count=true&q=${encodeURIComponent(q)}&inav=${encodeURIComponent(INAV)}`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  } catch (err) {
    if (attempt < 3) { await sleep(1500 * attempt); return fetchJson(q, attempt + 1); }
    throw err;
  }
}

function extractFacets(data, prefix) {
  function walk(container) {
    for (const node of container?.Nodes ?? []) {
      for (const f of node.Facets ?? []) {
        if (f.Expression?.startsWith(prefix + '.')) {
          return node.Facets.filter((ff) => ff.Expression?.startsWith(prefix + '.'));
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

/** top-level Category node에서 Count가 가장 큰 facet 추출 */
function extractTopCategory(data) {
  const catNode = data.iNav?.Nodes?.find((n) => n.Name === 'Category');
  if (!catNode?.Facets?.length) return null;
  const sorted = [...catNode.Facets].sort((a, b) => (b.Count ?? 0) - (a.Count ?? 0));
  const top = sorted[0];
  if (!top || !top.Count) return null;
  return top.DisplayValue;
}

function buildQuery(carType, mfg, mg, model) {
  return `(And.Hidden.N._.(C.CarType.${carType}._.(C.Manufacturer.${mfg}._.(C.ModelGroup.${mg}._.Model.${model}.))))`;
}

function yearsFromFacets(ygFacets) {
  const years = ygFacets
    .map((y) => parseInt(String(y.Value).match(/\d{4}/)?.[0], 10))
    .filter((n) => n >= 1950 && n <= CURRENT_YEAR + 1);
  if (!years.length) return null;
  years.sort((a, b) => a - b);
  const min = years[0];
  const max = years[years.length - 1];
  return {
    start: `${min}-01`,
    end: max >= CURRENT_YEAR - 1 ? '현재' : `${max}-12`,
    years,
  };
}

async function main() {
  const raw = JSON.parse(await fs.readFile(FILE, 'utf8'));

  let total = 0;
  for (const ct of raw.car_types) for (const mfg of ct.manufacturers) for (const mg of mfg.model_groups) total += mg.models?.length ?? 0;
  console.log(`[enrich] 대상 Model: ${total}개`);

  let done = 0, withYears = 0, withCat = 0, errCount = 0;
  const startTime = Date.now();

  for (const ct of raw.car_types) {
    for (const mfg of ct.manufacturers) {
      for (const mg of mfg.model_groups) {
        if (!mg.models?.length) continue;
        process.stdout.write(`\n  [${ct.origin}/${mfg.name}/${mg.name}] `);
        for (const md of mg.models) {
          try {
            await sleep(DELAY_MS);
            const q = buildQuery(ct.car_type === '국산' ? 'Y' : 'N', mfg.value, mg.value, md.value);
            const d = await fetchJson(q);

            const yg = extractFacets(d, 'YearGroup');
            const ys = yearsFromFacets(yg);
            if (ys) {
              md.production_start = ys.start;
              md.production_end = ys.end;
              md.years = ys.years;
              withYears++;
            }

            const cat = extractTopCategory(d);
            if (cat) {
              md.category = cat;
              withCat++;
            }

            process.stdout.write(ys && cat ? '.' : ys ? 'y' : cat ? 'c' : '_');
          } catch (err) {
            errCount++;
            process.stdout.write('X');
            md.year_error = err.message;
          }
          done++;
          if (done % 100 === 0) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
            await fs.writeFile(FILE, JSON.stringify(raw, null, 2), 'utf8');
            process.stdout.write(` [${done}/${total} · y${withYears} c${withCat} · ${elapsed}s]`);
          }
        }
      }
    }
  }

  await fs.writeFile(FILE, JSON.stringify(raw, null, 2), 'utf8');
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\n\n[enrich] 완료 · ${done}개 · years ${withYears} · category ${withCat} · err ${errCount} · ${elapsed}s`);
  console.log(`[enrich] 저장 → ${FILE}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
