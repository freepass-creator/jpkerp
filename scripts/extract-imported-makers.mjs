#!/usr/bin/env node
/**
 * freepasserp + jpkerp 두 RTDB의 assets에서 수입 제조사만 추출.
 *
 * 출력: scripts/imported-makers.json
 *   { makers: ['BMW', '벤츠', '아우디', ...], sources: { ... } }
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, get } from 'firebase/database';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.join(__dirname, 'imported-makers.json');

const CONFIGS = [
  {
    name: 'freepasserp3',
    databaseURL: 'https://freepasserp3-default-rtdb.asia-southeast1.firebasedatabase.app',
    apiKey: 'AIzaSyA0q_6yo9YRkpNeNaawH1AFPZx1IMgj-dY',
    projectId: 'freepasserp3',
  },
  {
    name: 'jpkerp',
    databaseURL: 'https://jpkerp-default-rtdb.asia-southeast1.firebasedatabase.app',
    apiKey: 'AIzaSyCCzPhqUiLXFB0zu41txT9OjKXE8ACqu4Y',
    projectId: 'jpkerp',
  },
];

// 국산 (제외 대상)
const DOMESTIC = new Set(['현대', '기아', '제네시스', '쉐보레', '르노', 'KGM', '쌍용', '르노삼성', '쉐보레(GM대우)', 'KG모빌리티', 'GM대우']);

// 수입 제조사 정규화 (변형 → 엔카 Canonical)
const IMPORT_ALIAS = {
  'benz': '벤츠', 'mercedes': '벤츠', 'mercedes-benz': '벤츠', '메르세데스-벤츠': '벤츠', '메르세데스': '벤츠', '메르세데스벤츠': '벤츠',
  'bmw': 'BMW', 'audi': '아우디', 'volkswagen': '폭스바겐', 'vw': '폭스바겐',
  'porsche': '포르쉐', '포르셰': '포르쉐', 'mini': '미니', 'tesla': '테슬라',
  'volvo': '볼보', 'lexus': '렉서스', 'toyota': '토요타', '도요타': '토요타', 'honda': '혼다',
  'ford': '포드', 'jeep': '지프', '짚': '지프',
  'landrover': '랜드로버', 'land rover': '랜드로버', 'range rover': '랜드로버',
  'maserati': '마세라티', 'ferrari': '페라리', 'bentley': '벤틀리',
  'rolls-royce': '롤스로이스', 'rollsroyce': '롤스로이스',
  'cadillac': '캐딜락', 'lincoln': '링컨', 'nissan': '닛산', 'infiniti': '인피니티',
  'jaguar': '재규어', 'peugeot': '푸조', 'citroen': '시트로엥',
  'chrysler': '크라이슬러', 'dodge': '닷지',
};

function normalize(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const low = s.toLowerCase().replace(/\s+/g, '');
  if (IMPORT_ALIAS[low]) return IMPORT_ALIAS[low];
  if (IMPORT_ALIAS[s.toLowerCase()]) return IMPORT_ALIAS[s.toLowerCase()];
  // 이미 한글/대문자 정식명이면 그대로
  return s;
}

async function scanProject(cfg) {
  const app = initializeApp(cfg, cfg.name);
  const db = getDatabase(app);
  const snap = await get(ref(db, 'assets'));
  const makers = new Map(); // maker → count
  if (snap.exists()) {
    for (const v of Object.values(snap.val() ?? {})) {
      const raw = v?.manufacturer;
      const n = normalize(raw);
      if (!n) continue;
      if (DOMESTIC.has(n)) continue;
      if (!isImport(n)) continue;
      makers.set(n, (makers.get(n) ?? 0) + 1);
    }
  }
  return makers;
}

function isImport(name) {
  // 국산 제외하면 나머지는 수입으로 간주
  return !DOMESTIC.has(name);
}

async function main() {
  const perProject = {};
  const total = new Map();
  for (const cfg of CONFIGS) {
    try {
      const makers = await scanProject(cfg);
      perProject[cfg.name] = Object.fromEntries([...makers.entries()].sort((a,b) => b[1] - a[1]));
      for (const [k, v] of makers) total.set(k, (total.get(k) ?? 0) + v);
      console.log(`[${cfg.name}] ${makers.size}개 수입 제조사`);
    } catch (err) {
      console.error(`[${cfg.name}] 실패:`, err.message);
      perProject[cfg.name] = { error: err.message };
    }
  }

  const sortedTotal = Object.fromEntries([...total.entries()].sort((a,b) => b[1] - a[1]));
  const makerList = Object.keys(sortedTotal);
  console.log(`\n총 ${makerList.length}개 수입 제조사:`);
  for (const m of makerList) console.log(`  ${m}: ${sortedTotal[m]}대`);

  const result = {
    fetched_at: new Date().toISOString(),
    makers: makerList,
    total_counts: sortedTotal,
    by_project: perProject,
  };
  await fs.writeFile(OUT_FILE, JSON.stringify(result, null, 2), 'utf8');
  console.log(`\n저장 → ${OUT_FILE}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
