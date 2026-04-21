/**
 * 자산 재등록 — 제조사/모델은 원본, 세부모델은 차종마스터 연식 매칭
 */
import fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, push, set, get, update } from 'firebase/database';

const app = initializeApp({
  databaseURL: 'https://jpkerp-default-rtdb.asia-southeast1.firebasedatabase.app',
  apiKey: 'AIzaSyCCzPhqUiLXFB0zu41txT9OjKXE8ACqu4Y',
  projectId: 'jpkerp',
});
const db = getDatabase(app);

const normLow = s => String(s || '').trim().toLowerCase().replace(/\s+/g, '');

const MAKER_ALIAS = {
  hyundai: '현대', '현대자동차': '현대', '현대차': '현대',
  kia: '기아', '기아자동차': '기아', kgm: 'KGM', ssangyong: 'KGM', '쌍용': 'KGM',
  gm: '쉐보레', chevrolet: '쉐보레', '쉐보래': '쉐보레',
  renault: '르노', '르노삼성': '르노',
  bmw: 'BMW', benz: '벤츠', mercedes: '벤츠', '메르세데스벤츠': '벤츠',
  audi: '아우디', porsche: '포르쉐', '포르셰': '포르쉐',
  mini: '미니', tesla: '테슬라', volvo: '볼보', lexus: '렉서스',
  toyota: '토요타', honda: '혼다', ford: '포드', jeep: '지프',
  landrover: '랜드로버', maserati: '마세라티', ferrari: '페라리',
  bentley: '벤틀리', rollsroyce: '롤스로이스', cadillac: '캐딜락', lincoln: '링컨',
  genesis: '제네시스', volkswagen: '폭스바겐', vw: '폭스바겐',
};

const MODEL_NUM = {
  '320': '3시리즈', '330': '3시리즈', '520': '5시리즈', '530': '5시리즈', '540': '5시리즈',
  '640': '6시리즈', '730': '7시리즈', '740': '7시리즈',
  c200: 'C-클래스', c220: 'C-클래스', c300: 'C-클래스',
  e200: 'E-클래스', e220: 'E-클래스', e250: 'E-클래스', e300: 'E-클래스',
  s350: 'S-클래스', s400: 'S-클래스', s450: 'S-클래스', s580: 'S-클래스',
  glc200: 'GLC', glc300: 'GLC', cls300: 'CLS',
};

const FUEL_ALIAS = {
  '경유': '디젤', diesel: '디젤', '휘발유': '가솔린', gasoline: '가솔린',
  ev: '전기', '전기차': '전기', hybrid: '하이브리드', hev: '하이브리드',
  lpg: 'LPG', '수소': '수소',
};

function parseCSVLine(line) {
  const result = []; let cur = ''; let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { result.push(cur); cur = ''; continue; }
    cur += ch;
  }
  result.push(cur);
  return result;
}

function parseCSV(text) {
  const lines = text.split('\n');
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).filter(l => l.trim()).map(l => {
    const vals = parseCSVLine(l);
    const row = {};
    headers.forEach((h, j) => { row[h.trim()] = (vals[j] || '').trim(); });
    return row;
  });
}

function extractYear(row) {
  // 1순위: 최초등록일 (실제 등록 사실)
  const reg = (row['최초등록일'] || '').match(/(\d{2,4})/);
  if (reg) {
    const v = reg[1];
    return v.length === 4 ? Number(v) : 2000 + Number(v);
  }
  // 2순위: 연식 (모델연도 — 실제 등록보다 1년 앞설 수 있음)
  const y = String(row['연식'] || '').replace(/,/g, '').trim();
  if (/^\d{4}$/.test(y)) return Number(y);
  if (/^\d{2}$/.test(y)) return 2000 + Number(y);
  return null;
}

function normMaker(raw) {
  const key = normLow(raw);
  return MAKER_ALIAS[key] || raw.trim();
}

function normModel(maker, rawModel, rawSub) {
  let model = (rawModel || '').trim();
  const makerLow = normLow(maker);
  // 제조사 접두어 제거
  for (const prefix of [makerLow, ...Object.entries(MAKER_ALIAS).filter(([,v]) => v === maker).map(([k]) => k)]) {
    const re = new RegExp('^' + prefix + '[\\s\\-]*', 'i');
    const attempt = model.replace(re, '').trim();
    if (attempt && attempt.length > 0 && normLow(attempt) !== makerLow) { model = attempt; break; }
  }
  // 모델번호 매핑
  const numKey = normLow(model).replace(/[dise]+$/, '');
  if (MODEL_NUM[numKey]) model = MODEL_NUM[numKey];
  // 특수 케이스
  if (model.includes('카니발')) model = '카니발';
  if (model.includes('그랜저')) model = '그랜저';
  if (model.includes('아반떼')) model = '아반떼';
  if (model === '스타렉스') model = '그랜드 스타렉스';
  if (model === '포터') model = '포터2';
  if (/^k\d$/i.test(model)) model = model.toUpperCase();
  if (model === '모델3') model = '모델 3';
  model = model.replace(/\s*(GT|터보)$/i, '').trim();
  if (normLow(model) === makerLow && rawSub) {
    const sub = rawSub.replace(new RegExp('^' + makerLow + '[\\s]*', 'i'), '').trim().split(/\s/)[0];
    if (sub) model = sub;
  }
  if (model.includes('컨트리맨')) model = '컨트리맨';
  if (model.includes('쿠퍼') && !model.includes('컨트리맨')) model = '쿠퍼';
  return model;
}

async function main() {
  const masterSnap = await get(ref(db, 'vehicle_master'));
  const masters = [];
  if (masterSnap.exists()) {
    for (const [, v] of Object.entries(masterSnap.val())) {
      if (v.status === 'deleted') continue;
      masters.push(v);
    }
  }
  console.log(`차종마스터: ${masters.length}종`);

  // 기존 자산 삭제
  const existingSnap = await get(ref(db, 'assets'));
  if (existingSnap.exists()) {
    const dels = {};
    let cnt = 0;
    for (const k of Object.keys(existingSnap.val())) {
      dels[`assets/${k}/status`] = 'deleted';
      cnt++;
    }
    await update(ref(db), dels);
    console.log(`기존 ${cnt}대 삭제`);
  }

  const csv = fs.readFileSync('scripts/assets.csv', 'utf-8');
  const rows = parseCSV(csv);
  console.log(`CSV: ${rows.length}행`);

  let ok = 0, matched = 0;

  for (const row of rows) {
    const carNumber = (row['차량번호'] || '').trim();
    if (!carNumber) continue;

    const maker = normMaker(row['제조사'] || '');
    let model = normModel(maker, row['모델명'] || '', row['세부모델'] || '');
    const year = extractYear(row);

    // 모델명을 마스터에 있는 값으로 강제 매칭
    const makerModels = [...new Set(masters.filter(m => m.maker === maker).map(m => m.model).filter(Boolean))];
    if (makerModels.length > 0 && !makerModels.includes(model)) {
      // 정확 매칭 (대소문자 무시)
      let mm = makerModels.find(m => normLow(m) === normLow(model));
      // 포함 매칭 (GLC300 → GLC, k3 → K3)
      if (!mm) mm = makerModels.find(m => normLow(model).includes(normLow(m)) || normLow(m).includes(normLow(model)));
      // 숫자 접두어 → 시리즈 (640 → 6시리즈)
      if (!mm) {
        const leadNum = model.match(/^(\d)/);
        if (leadNum) mm = makerModels.find(m => m.startsWith(leadNum[1]) && m.includes('시리즈'));
      }
      // 첫 글자 → 클래스 (c 카브리올레 → C-클래스)
      if (!mm) {
        const firstChar = normLow(model).charAt(0);
        if (firstChar && /[a-z]/.test(firstChar)) mm = makerModels.find(m => normLow(m).startsWith(firstChar));
      }
      if (mm) model = mm;
    }

    // 세부모델: 차종마스터에서 제조사+모델+연식 범위로 매칭
    let detailModel = (row['세부모델'] || '').trim();
    let spec = null;

    const candidates = masters.filter(m => m.maker === maker && m.model === model);
    if (candidates.length > 0 && year) {
      // 연식 범위 매칭
      const yearMatch = candidates.filter(c => {
        const ys = Number(c.year_start || 0);
        const ye = c.year_end === '현재' ? 2099 : Number(c.year_end || 2099);
        return year >= (ys <= 99 ? 2000 + ys : ys) && year <= (ye <= 99 ? 2000 + ye : ye);
      });
      if (yearMatch.length > 0) {
        spec = yearMatch[0];
        detailModel = spec.sub;
        matched++;
      } else if (candidates.length === 1) {
        // 후보 1개뿐이면 그냥 사용
        spec = candidates[0];
        detailModel = spec.sub;
        matched++;
      }
    } else if (candidates.length === 1) {
      spec = candidates[0];
      detailModel = spec.sub;
      matched++;
    }

    let fuel = (row['연료'] || '').trim();
    const fuelKey = normLow(fuel);
    if (FUEL_ALIAS[fuelKey]) fuel = FUEL_ALIAS[fuelKey];

    const payload = {
      partner_code: (row['회원사코드'] || '').trim() || undefined,
      car_number: carNumber,
      vin: (row['차대번호'] || '').trim() || undefined,
      manufacturer: maker,
      car_model: model,
      detail_model: detailModel,
      car_year: year || undefined,
      fuel_type: fuel || spec?.fuel_type || undefined,
      ext_color: (row['외부색상'] || '').trim() || undefined,
      int_color: (row['내부색상'] || '').trim() || undefined,
      first_registration_date: (row['최초등록일'] || '').trim() || undefined,
      displacement: spec?.displacement || undefined,
      seats: spec?.seats || undefined,
      category: spec?.category || undefined,
      origin: spec?.origin || undefined,
      powertrain: spec?.powertrain || undefined,
      battery_kwh: spec?.battery_kwh || undefined,
      usage_type: (row['용도'] || '').trim() || undefined,
      asset_code: `AST-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6).toUpperCase()}`,
      status: 'active',
      created_at: Date.now(),
    };

    const clean = Object.fromEntries(Object.entries(payload).filter(([,v]) => v !== undefined && v !== ''));
    await set(push(ref(db, 'assets')), clean);
    ok++;
    if (ok % 20 === 0) console.log(`  ${ok}건...`);
  }

  console.log(`\n완료: ${ok}건 저장 (마스터 매칭 ${matched}건 / 원본유지 ${ok - matched}건)`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
