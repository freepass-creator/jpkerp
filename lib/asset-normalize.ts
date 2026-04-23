/**
 * 자산 업로드 시 차량 정보 자동 정규화 — jpkerp4 asset-normalize.js 이식.
 *
 * 1. 제조사 ALIAS → 정규화
 * 2. 모델명 fuzzy + 접두어 제거 + 코드토큰 매칭
 * 3. 세부모델 컨텍스트 스코어링 (연식/연료/코드/텍스트 유사도)
 * 4. 차종(category) 자동 채움
 * 5. 연료 정규화
 * 6. 숫자 필드 콤마 제거
 */

import type { RtdbCarModel } from '@/lib/types/rtdb-entities';

// ── 헬퍼 ──
const norm = (s: unknown) => String(s ?? '').trim();
const normLow = (s: unknown) => norm(s).toLowerCase().replace(/\s+/g, '');
const strongNorm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[\s\-_·•‧/()[\]{}]+/g, '');

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m: number[][] = [];
  for (let i = 0; i <= b.length; i++) m[i] = [i];
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++)
    for (let j = 1; j <= a.length; j++)
      m[i][j] = b[i - 1] === a[j - 1] ? m[i - 1][j - 1] : Math.min(m[i - 1][j - 1] + 1, m[i][j - 1] + 1, m[i - 1][j] + 1);
  return m[b.length][a.length];
}

function codeTokens(s: unknown): string[] {
  return String(s ?? '').toLowerCase().split(/[\s\-_·/()\[\]]+/).filter((t) => /^[a-z0-9]{2,}$/.test(t));
}

/** 세부모델에서 연식 suffix 제거: "CN7 스마트 22-" → "CN7 스마트" */
function stripYearSuffix(s: string): string {
  return s.replace(/\s+\d{2}-?\s*$/, '').trim();
}

function lcsLen(a: string, b: string): number {
  const al = normLow(a); const bl = normLow(b);
  if (!al || !bl) return 0;
  const m = Array.from({ length: al.length + 1 }, () => new Array(bl.length + 1).fill(0));
  let max = 0;
  for (let i = 1; i <= al.length; i++)
    for (let j = 1; j <= bl.length; j++) {
      if (al[i - 1] === bl[j - 1]) { m[i][j] = m[i - 1][j - 1] + 1; if (m[i][j] > max) max = m[i][j]; }
    }
  return max;
}

// ── 제조사 별칭 ──
const MAKER_ALIAS: Record<string, string> = {
  hyundai: '현대', '현대자동차': '현대', '현대차': '현대', '현대모비스': '현대',
  kia: '기아', '기아자동차': '기아', '기아차': '기아',
  genesis: '제네시스', '제네시스자동차': '제네시스',
  kgm: 'KGM', ssangyong: 'KGM', '쌍용': 'KGM', '쌍용자동차': 'KGM',
  gm: '쉐보레', gmkorea: '쉐보레', chevrolet: '쉐보레', 'gm대우': '쉐보레', '쉐보래': '쉐보레',
  renault: '르노', '르노삼성': '르노', '르노코리아': '르노', rsm: '르노',
  bmw: 'BMW', '비엠더블유': 'BMW', '비엠': 'BMW',
  benz: '벤츠', mercedes: '벤츠', '메르세데스': '벤츠', '메르세데스-벤츠': '벤츠', '메르세데스벤츠': '벤츠', '벤쯔': '벤츠',
  audi: '아우디', volkswagen: '폭스바겐', vw: '폭스바겐',
  porsche: '포르쉐', '포르셰': '포르쉐', mini: '미니', tesla: '테슬라',
  volvo: '볼보', lexus: '렉서스', toyota: '토요타', honda: '혼다',
  ford: '포드', jeep: '지프', '짚': '지프', 'landrover': '랜드로버', 'land rover': '랜드로버',
  jaguar: '재규어', lincoln: '링컨', cadillac: '캐딜락',
  peugeot: '푸조', citroen: '시트로엥', maserati: '마세라티',
};

const MODEL_NUMBER_MAP: Record<string, string> = {
  // BMW (엔카 model명: 'N시리즈')
  '116': '1시리즈', '118': '1시리즈', '120': '1시리즈', '125': '1시리즈', '128': '1시리즈', '135': '1시리즈',
  '218': '2시리즈', '220': '2시리즈', '225': '2시리즈', '228': '2시리즈', '230': '2시리즈',
  '316': '3시리즈', '318': '3시리즈', '320': '3시리즈', '325': '3시리즈', '328': '3시리즈', '330': '3시리즈', '335': '3시리즈', '340': '3시리즈',
  '418': '4시리즈', '420': '4시리즈', '425': '4시리즈', '428': '4시리즈', '430': '4시리즈', '435': '4시리즈', '440': '4시리즈',
  '518': '5시리즈', '520': '5시리즈', '523': '5시리즈', '525': '5시리즈', '528': '5시리즈', '530': '5시리즈', '535': '5시리즈', '540': '5시리즈', '550': '5시리즈',
  '620': '6시리즈', '625': '6시리즈', '630': '6시리즈', '635': '6시리즈', '640': '6시리즈', '645': '6시리즈', '650': '6시리즈',
  '720': '7시리즈', '725': '7시리즈', '730': '7시리즈', '735': '7시리즈', '740': '7시리즈', '745': '7시리즈', '750': '7시리즈', '760': '7시리즈',
  '840': '8시리즈', '845': '8시리즈', '850': '8시리즈',
  // 벤츠 (엔카 model명: 'X-클래스')
  a180: 'A-클래스', a200: 'A-클래스', a220: 'A-클래스', a250: 'A-클래스', a35: 'A-클래스', a45: 'A-클래스',
  b180: 'B-클래스', b200: 'B-클래스', b220: 'B-클래스', b250: 'B-클래스',
  c180: 'C-클래스', c200: 'C-클래스', c220: 'C-클래스', c230: 'C-클래스', c240: 'C-클래스', c250: 'C-클래스', c280: 'C-클래스', c300: 'C-클래스', c350: 'C-클래스', c400: 'C-클래스', c43: 'C-클래스', c63: 'C-클래스',
  cla180: 'CLA-클래스', cla200: 'CLA-클래스', cla220: 'CLA-클래스', cla250: 'CLA-클래스', cla35: 'CLA-클래스', cla45: 'CLA-클래스',
  cls250: 'CLS-클래스', cls300: 'CLS-클래스', cls320: 'CLS-클래스', cls350: 'CLS-클래스', cls400: 'CLS-클래스', cls450: 'CLS-클래스', cls500: 'CLS-클래스', cls550: 'CLS-클래스', cls53: 'CLS-클래스', cls63: 'CLS-클래스',
  cle200: 'CLE-클래스', cle300: 'CLE-클래스', cle450: 'CLE-클래스',
  e200: 'E-클래스', e220: 'E-클래스', e230: 'E-클래스', e240: 'E-클래스', e250: 'E-클래스', e280: 'E-클래스', e300: 'E-클래스', e320: 'E-클래스', e350: 'E-클래스', e400: 'E-클래스', e450: 'E-클래스', e500: 'E-클래스', e550: 'E-클래스', e53: 'E-클래스', e63: 'E-클래스',
  s280: 'S-클래스', s300: 'S-클래스', s320: 'S-클래스', s350: 'S-클래스', s400: 'S-클래스', s420: 'S-클래스', s430: 'S-클래스', s450: 'S-클래스', s500: 'S-클래스', s550: 'S-클래스', s580: 'S-클래스', s600: 'S-클래스', s63: 'S-클래스', s65: 'S-클래스',
  sl350: 'SL-클래스', sl400: 'SL-클래스', sl500: 'SL-클래스', sl550: 'SL-클래스', sl63: 'SL-클래스',
  slk200: 'SLK-클래스', slk250: 'SLK-클래스', slk300: 'SLK-클래스', slk350: 'SLK-클래스',
  slc180: 'SLC-클래스', slc200: 'SLC-클래스', slc300: 'SLC-클래스', slc43: 'SLC-클래스',
  clk200: 'CLK-클래스', clk230: 'CLK-클래스', clk320: 'CLK-클래스', clk350: 'CLK-클래스', clk430: 'CLK-클래스', clk500: 'CLK-클래스', clk550: 'CLK-클래스', clk63: 'CLK-클래스',
  g320: 'G-클래스', g350: 'G-클래스', g400: 'G-클래스', g500: 'G-클래스', g550: 'G-클래스', g63: 'G-클래스',
  gla180: 'GLA-클래스', gla200: 'GLA-클래스', gla220: 'GLA-클래스', gla250: 'GLA-클래스', gla35: 'GLA-클래스', gla45: 'GLA-클래스',
  glb200: 'GLB-클래스', glb220: 'GLB-클래스', glb250: 'GLB-클래스', glb35: 'GLB-클래스',
  glc200: 'GLC-클래스', glc220: 'GLC-클래스', glc250: 'GLC-클래스', glc300: 'GLC-클래스', glc350: 'GLC-클래스', glc43: 'GLC-클래스', glc63: 'GLC-클래스',
  glk220: 'GLK-클래스', glk280: 'GLK-클래스', glk300: 'GLK-클래스', glk320: 'GLK-클래스', glk350: 'GLK-클래스',
  gle300: 'GLE-클래스', gle320: 'GLE-클래스', gle350: 'GLE-클래스', gle400: 'GLE-클래스', gle450: 'GLE-클래스', gle500: 'GLE-클래스', gle550: 'GLE-클래스', gle580: 'GLE-클래스', gle53: 'GLE-클래스', gle63: 'GLE-클래스',
  gls350: 'GLS-클래스', gls400: 'GLS-클래스', gls450: 'GLS-클래스', gls500: 'GLS-클래스', gls550: 'GLS-클래스', gls580: 'GLS-클래스', gls63: 'GLS-클래스',
  v200: 'V-클래스', v220: 'V-클래스', v250: 'V-클래스', v300: 'V-클래스',
};

// 모델명 직접 치환 (번호 패턴이 아닌 고유 이름). 키는 normLow 기준 (공백제거 + 소문자).
const MODEL_NAME_ALIAS: Record<string, string> = {
  '봉고3': '봉고III 미니버스', '봉고iii': '봉고III 미니버스', 'bongo3': '봉고III 미니버스', 'bongoiii': '봉고III 미니버스',
  '봉고2': '봉고II', '봉고ii': '봉고II',
  '포터2': '포터II 내장', '포터ii': '포터II 내장', 'porter2': '포터II 내장',
  '트래스': '트랙스', '트레스': '트랙스', '트력스': '트랙스', '트럭스': '트랙스', trax: '트랙스',
  trailblazer: '트레일블레이저',
  rangerover: '레인지로버',
};

// 영어↔한글 모델명 매칭 — OCR이 영어로 뽑아도 한글 DB와 매칭되도록
// 양방향 매핑 (English key → Korean value, 그리고 역매핑도 조회 시 지원)
const BILINGUAL_MODEL_MAP: Record<string, string> = {
  // Tesla
  'model 3': '모델 3', 'model s': '모델 S', 'model x': '모델 X', 'model y': '모델 Y',
  'model 3 long range': '모델 3', 'model 3 performance': '모델 3',
  'model y long range': '모델 Y', 'model y performance': '모델 Y',
  // BMW
  '3 series': '3시리즈', '5 series': '5시리즈', '7 series': '7시리즈',
  'x3': 'X3', 'x5': 'X5', 'x6': 'X6', 'x7': 'X7',
  // Mercedes
  'c-class': 'C-클래스', 'e-class': 'E-클래스', 's-class': 'S-클래스',
  'c class': 'C-클래스', 'e class': 'E-클래스', 's class': 'S-클래스',
  // Hyundai (영어 표기)
  'avante': '아반떼', 'sonata': '쏘나타', 'grandeur': '그랜저',
  'santa fe': '싼타페', 'santafe': '싼타페', 'tucson': '투싼',
  'palisade': '팰리세이드', 'ioniq 5': '아이오닉 5', 'ioniq 6': '아이오닉 6',
  // Kia (영어 표기)
  'morning': '모닝', 'ray': '레이', 'k3': 'K3', 'k5': 'K5', 'k7': 'K7', 'k8': 'K8', 'k9': 'K9',
  'sorento': '쏘렌토', 'sportage': '스포티지', 'carnival': '카니발',
  'seltos': '셀토스', 'niro': '니로', 'ev6': 'EV6', 'ev9': 'EV9',
  // Genesis
  'g70': 'G70', 'g80': 'G80', 'g90': 'G90', 'gv70': 'GV70', 'gv80': 'GV80',
  // Chevrolet / Other
  'spark': '스파크', 'malibu': '말리부', 'trax': '트랙스', 'trailblazer': '트레일블레이저',
};

/** 입력 모델명을 한글 표준형으로 변환 (매칭 실패 시 원본 반환) */
function translateModel(input: string): string {
  const low = input.toLowerCase().trim();
  if (BILINGUAL_MODEL_MAP[low]) return BILINGUAL_MODEL_MAP[low];
  // 부분 매칭 — "Model 3 Long Range" → "Model 3" 역할
  for (const [en, ko] of Object.entries(BILINGUAL_MODEL_MAP)) {
    if (low.startsWith(en + ' ') || low === en) return ko;
  }
  return input;
}

// 모델명만으로 확실히 브랜드가 식별되는 경우 (Gemini가 제조사를 잘못 분류해도 교정)
// 예: G80은 제네시스 (현대 아님), 어벤저는 지프, X5는 BMW
const MODEL_TO_BRAND: Record<string, string> = {
  // 제네시스 — 현대로 혼동되는 케이스 많음
  'g70': '제네시스', 'g80': '제네시스', 'g90': '제네시스',
  'gv60': '제네시스', 'gv70': '제네시스', 'gv80': '제네시스',
  'eq900': '제네시스',  // 구 명칭
  // Jeep — 수입 브랜드, 모델명만으로 식별
  '어벤저': '지프', '랭글러': '지프', '체로키': '지프',
  '그랜드체로키': '지프', '그랜드 체로키': '지프',
  '레니게이드': '지프', '컴패스': '지프', '커맨더': '지프', '글래디에이터': '지프',
  // 테슬라
  '모델 3': '테슬라', '모델 s': '테슬라', '모델 x': '테슬라', '모델 y': '테슬라',
  'model 3': '테슬라', 'model s': '테슬라', 'model x': '테슬라', 'model y': '테슬라',
  // 포르쉐
  '911': '포르쉐', '카이엔': '포르쉐', '마칸': '포르쉐', '파나메라': '포르쉐', '타이칸': '포르쉐',
  // 포드
  '머스탱': '포드', '익스플로러': '포드', '레인저': '포드', '브롱코': '포드',
  // KGM (구 쌍용) — 제조사가 엔카에선 'KG모빌리티(쌍용)'이지만 별칭 MAKER_ALIAS가 'KGM'으로 정규화하므로 그에 맞춤
  '토레스': 'KGM', '렉스턴': 'KGM', '코란도': 'KGM', '티볼리': 'KGM',
  '액티언': 'KGM', '체어맨': 'KGM', '카이런': 'KGM', '로디우스': 'KGM', '무쏘': 'KGM', '뉴훼미리': 'KGM',
};

function inferBrandFromModel(model: string): string | null {
  const low = model.toLowerCase().trim();
  if (MODEL_TO_BRAND[low]) return MODEL_TO_BRAND[low];
  // 부분 매칭 — "G80 Sport", "Model 3 Long Range" 등
  for (const [key, brand] of Object.entries(MODEL_TO_BRAND)) {
    if (low.startsWith(key + ' ') || low === key) return brand;
  }
  return null;
}

const FUEL_ALIAS: Record<string, string> = {
  ev: '전기', electric: '전기', '전기차': '전기',
  '경유': '디젤', diesel: '디젤',
  '휘발유': '가솔린', gasoline: '가솔린', '가솔린(휘발유)': '가솔린',
  hybrid: '하이브리드', hev: '하이브리드', '하이브리드(hev)': '하이브리드',
  phev: '플러그인하이브리드',
  lpg: 'LPG', lpgi: 'LPG',
  '수소': '수소', fcev: '수소',
};

const NUM_COLS = [
  'consumer_price', 'vehicle_price', 'purchase_price', 'delivery_fee',
  'actual_purchase_price', 'acquisition_tax', 'mileage',
  'displacement', 'seats', 'car_year',
];

// ── 퍼지 매칭 ──
function fuzzyBest(input: string, candidates: string[]): string | null {
  const inLow = normLow(input);
  if (!inLow) return null;
  for (const c of candidates) {
    const cLow = normLow(c);
    if (cLow.includes(inLow) || inLow.includes(cLow)) return c;
  }
  let best: string | null = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    const dist = levenshtein(normLow(input), normLow(c));
    const ratio = dist / Math.max(normLow(input).length, normLow(c).length, 1);
    if (ratio < 0.5 && dist < bestScore) { best = c; bestScore = dist; }
  }
  return best;
}

/** 2자리·4자리 연식을 항상 4자리로 변환. 99/9999는 "현재" 표식. */
function toFullYear(v: unknown): number {
  if (v === '현재' || v === '' || v == null) return 9999;
  const n = Number(String(v).replace(/[,\s]/g, ''));
  if (!Number.isFinite(n)) return 0;
  if (n >= 1000) return n;            // 이미 4자리 (2017, 2023)
  if (n === 99) return 9999;          // 구버전 sentinel
  if (n < 50) return 2000 + n;        // 00-49 → 2000-2049
  return 1900 + n;                    // 50-99 → 1950-1999
}

/** 자산 데이터에서 연식을 항상 4자리 정수로 추출. */
function extractYY(data: Record<string, unknown>): number | null {
  if (data.car_year) {
    const y = String(data.car_year).replace(/,/g, '').trim();
    if (/^\d{4}$/.test(y)) return Number(y);
    if (/^\d{2}$/.test(y)) return toFullYear(y);
  }
  if (data.first_registration_date) {
    const m = String(data.first_registration_date).match(/(\d{4})/);
    if (m) return Number(m[1]);
  }
  return null;
}

/** 자산 데이터에서 제작연월(YYYY-MM) 추출 — 생산기간 매칭용 */
function extractProdMonth(data: Record<string, unknown>): string | null {
  if (data.first_registration_date) {
    const m = String(data.first_registration_date).match(/^(\d{4})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}`;
  }
  if (data.car_year) {
    const y = String(data.car_year).replace(/,/g, '').trim();
    if (/^\d{4}$/.test(y)) return `${y}-06`; // 연식만 있으면 중간값(6월) 사용
  }
  return null;
}

/** 마스터 엔트리의 생산기간을 YYYY-MM 범위로 추출 (production_start/end 우선, fallback year_start/end) */
function getProductionRange(m: RtdbCarModel): { start: string; end: string } {
  const parseMonth = (v: unknown): string | null => {
    if (!v) return null;
    const s = String(v);
    if (s === '현재') return '9999-12';
    const match = s.match(/^(\d{4})(?:[-\/.](\d{1,2}))?/);
    if (!match) return null;
    const yy = match[1];
    const mm = match[2] ? match[2].padStart(2, '0') : '01';
    return `${yy}-${mm}`;
  };
  const ps = parseMonth(m.production_start);
  const pe = parseMonth(m.production_end);
  // fallback: legacy year_start / year_end
  const start = ps ?? (m.year_start ? `${toFullYear(m.year_start)}-01` : '0000-01');
  const end = pe ?? (m.year_end && m.year_end !== '현재' ? `${toFullYear(m.year_end)}-12` : '9999-12');
  return { start, end };
}

function isInRange(monthStr: string | null, start: string, end: string): boolean {
  if (!monthStr) return false;
  return monthStr >= start && monthStr <= end;
}

function normalizeFuel(f: unknown): string {
  if (!f) return '';
  const key = normLow(f);
  return FUEL_ALIAS[key] || norm(f);
}

// ── 메인 ──
export interface NormalizeResult {
  data: Record<string, unknown>;
  messages: string[];
  /** 보정된 필드명 → 원본값 */
  corrections: Record<string, string>;
  /** 유사 매칭(엄밀한 일치가 아닌, 점수 기반 fuzzy)된 필드 목록 — UI 구분용 */
  fuzzyMatches: Record<string, boolean>;
}

export function normalizeAsset(
  row: Record<string, unknown>,
  masters: RtdbCarModel[],
): NormalizeResult {
  const data = { ...row };
  const messages: string[] = [];
  const corrections: Record<string, string> = {};
  const fuzzyMatches: Record<string, boolean> = {};

  // 마스터에서 maker/model/sub 목록 추출
  const activeMasters = masters.filter((m) => m.status !== 'deleted');
  const makers = [...new Set(activeMasters.map((m) => m.maker ?? '').filter(Boolean))];
  const getModels = (maker: string) => [...new Set(activeMasters.filter((m) => m.maker === maker).map((m) => m.model ?? '').filter(Boolean))];
  const getSubs = (maker: string, model: string) => activeMasters.filter((m) => m.maker === maker && m.model === model).map((m) => m.sub ?? '').filter(Boolean);

  // 1. 제조사 정규화
  if (data.manufacturer) {
    const raw = norm(data.manufacturer);
    const key = normLow(raw);
    if (MAKER_ALIAS[key]) {
      if (MAKER_ALIAS[key] !== raw) { messages.push(`제조사: "${raw}" → "${MAKER_ALIAS[key]}"`); corrections.manufacturer = raw; }
      data.manufacturer = MAKER_ALIAS[key];
    } else if (!makers.includes(raw)) {
      const sn = strongNorm(raw);
      const found = makers.find((m) => strongNorm(m) === sn) ?? fuzzyBest(raw, makers);
      if (found) {
        messages.push(`제조사: "${raw}" → "${found}"`); corrections.manufacturer = raw;
        data.manufacturer = found;
      }
    }
  }

  // 1-A2. 영어 모델명 → 한글 표준형 선변환
  // "Model 3 Long Range" → "모델 3", "Avante" → "아반떼" 같은 케이스
  if (data.car_model) {
    const translated = translateModel(norm(data.car_model));
    if (translated !== norm(data.car_model)) {
      messages.push(`모델명: "${data.car_model}" → "${translated}" (한글 변환)`);
      corrections.car_model = String(data.car_model);
      data.car_model = translated;
    }
  }

  // 1-A3. 모델명 기반 브랜드 교정 — G80은 제네시스, 어벤저는 지프 등
  // Gemini가 "현대 G80"으로 잘못 반환해도 "제네시스 G80"으로 정정
  if (data.car_model) {
    // car_model이 "짚 어벤저"처럼 브랜드+모델 혼합이면 분리
    const parts = norm(data.car_model).split(/\s+/).filter(Boolean);
    let strippedModel = norm(data.car_model);
    if (parts.length > 1) {
      const firstTokenBrand = MAKER_ALIAS[normLow(parts[0])];
      if (firstTokenBrand) {
        // 첫 토큰이 브랜드 별칭이면 떼어냄 (예: "짚 어벤저" → 모델 "어벤저")
        strippedModel = parts.slice(1).join(' ');
      }
    }
    const inferredBrand = inferBrandFromModel(strippedModel);
    if (inferredBrand) {
      if (data.manufacturer && data.manufacturer !== inferredBrand) {
        messages.push(`제조사 교정: "${data.manufacturer}" → "${inferredBrand}" (모델 "${strippedModel}" 기준)`);
        corrections.manufacturer = String(data.manufacturer);
      } else if (!data.manufacturer) {
        messages.push(`제조사: (없음) → "${inferredBrand}" (모델 "${strippedModel}" 기준)`);
      }
      data.manufacturer = inferredBrand;
      if (strippedModel !== norm(data.car_model)) {
        corrections.car_model = String(data.car_model);
        data.car_model = strippedModel;
      }
    }
  }

  // 1-B. 제조사 없고 모델만 있을 때 — 모델명으로 제조사 역추론
  // 자동차등록증은 "차명"만 있고 제조사는 별도 칸이 없음 → 여기서 채워야 함
  if (!data.manufacturer && data.car_model) {
    const modelRaw = norm(data.car_model);
    const candidates = activeMasters.filter((m) => {
      const mdl = norm(m.model);
      if (!mdl) return false;
      return mdl === modelRaw
        || normLow(mdl) === normLow(modelRaw)
        || strongNorm(mdl) === strongNorm(modelRaw);
    });
    const uniqueMakers = [...new Set(candidates.map((m) => norm(m.maker)).filter(Boolean))];
    if (uniqueMakers.length === 1) {
      data.manufacturer = uniqueMakers[0];
      corrections.manufacturer = '';
      messages.push(`제조사: (없음) → "${uniqueMakers[0]}" (모델 역추론)`);
    } else if (uniqueMakers.length > 1) {
      // 동명 모델이 여러 브랜드에 있을 땐 VIN 힌트로 좁히기
      const vinHint = data._vin_maker_hint ? norm(data._vin_maker_hint) : '';
      if (vinHint && uniqueMakers.includes(vinHint)) {
        data.manufacturer = vinHint;
        corrections.manufacturer = '';
        messages.push(`제조사: (없음) → "${vinHint}" (VIN 추론)`);
      }
    }
  }

  // 1-C. 여전히 비어있으면 VIN 힌트만이라도 반영 (모델이 마스터에 없을 때)
  if (!data.manufacturer && data._vin_maker_hint) {
    const hint = norm(data._vin_maker_hint);
    if (hint) {
      data.manufacturer = hint;
      corrections.manufacturer = '';
      messages.push(`제조사: (없음) → "${hint}" (VIN 추론)`);
    }
  }

  // 2. 모델명 정규화
  if (data.manufacturer) {
    const models = getModels(String(data.manufacturer));
    if (models.length) {
      const raw = norm(data.car_model);
      const makerLow = normLow(data.manufacturer);
      // 제조사 접두어 제거: "BMW530i"→"530i", "벤츠S450"→"S450", "BMW 520D"→"520D"
      let stripped = raw.replace(new RegExp('^' + makerLow + '[\\s\\-]*', 'i'), '').trim();
      if (!stripped || normLow(stripped) === makerLow) {
        // 접두어 제거 안 됐으면 원본에서 영문 제조사명으로도 시도
        const makerAliases = Object.entries(MAKER_ALIAS).filter(([, v]) => v === data.manufacturer).map(([k]) => k);
        for (const alias of makerAliases) {
          const re = new RegExp('^' + alias + '[\\s\\-]*', 'i');
          const attempt = raw.replace(re, '').trim();
          if (attempt && normLow(attempt) !== normLow(raw)) { stripped = attempt; break; }
        }
      }
      let found: string | null = null;

      if (stripped && normLow(stripped) !== makerLow) {
        if (models.includes(stripped)) found = stripped;
        else if (models.includes(raw)) found = raw;
        if (!found) found = models.find((m) => strongNorm(m) === strongNorm(stripped)) ?? null;

        // first token 추출 — "S450 4Matic" → "s450", "봉고III 1톤" → "봉고iii"
        const firstToken = stripped.trim().toLowerCase().split(/\s+/)[0] ?? '';

        // 직접 이름 별칭 (봉고3→봉고III 미니버스, 트래스→트랙스 등)
        if (!found && firstToken) {
          const aliasTarget = MODEL_NAME_ALIAS[firstToken] ?? MODEL_NAME_ALIAS[normLow(stripped)];
          if (aliasTarget && models.includes(aliasTarget)) found = aliasTarget;
        }
        if (!found) found = models.find((m) => normLow(m).includes(normLow(stripped)) || normLow(stripped).includes(normLow(m))) ?? null;

        // 모델번호 → 시리즈/클래스 매핑 (S450 → S-클래스, 420d → 4시리즈, CLS300 → CLS-클래스)
        if (!found && firstToken) {
          const tokenStrong = strongNorm(firstToken);
          const numKey = tokenStrong.replace(/[dise]+$/, '');
          const target = MODEL_NUMBER_MAP[tokenStrong] ?? MODEL_NUMBER_MAP[numKey];
          if (target) found = models.find((m) => m === target) ?? null;
        }
        if (!found) found = fuzzyBest(stripped, models);
      }

      // 세부모델에서 역추론
      if (!found && data.detail_model) {
        const subRaw = norm(data.detail_model).replace(new RegExp('^' + makerLow + '[\\s\\-]*', 'i'), '').trim();
        for (const m of models) {
          if (normLow(subRaw).includes(normLow(m)) || normLow(m).includes(normLow(subRaw).split(/[\s(]/)[0])) {
            found = m; break;
          }
        }
        if (!found) {
          const subTokens = codeTokens(subRaw);
          if (subTokens.length) {
            const entry = activeMasters.find((e) => e.maker === data.manufacturer && subTokens.some((t) => codeTokens(e.sub).includes(t)));
            if (entry) found = entry.model ?? null;
          }
        }
      }

      if (found && found !== raw) {
        messages.push(`모델: "${raw || '(없음)'}" → "${found}"`); corrections.car_model = raw || '';
        data.car_model = found;
      }
    }
  }

  // 3. 세부모델 2중 매칭 — (1) 연식으로 후보 좁히고 (2) 그 안에서 이름 매칭
  if (data.manufacturer && data.car_model) {
    const subs = getSubs(String(data.manufacturer), String(data.car_model));
    if (subs.length) {
      const raw = norm(data.detail_model);
      const yy = extractYY(data);
      const fuelNorm = normalizeFuel(data.fuel_type);
      const isEV = fuelNorm === '전기';
      const prodMonth = extractProdMonth(data);

      // 각 sub의 production 범위 사전 계산
      const subRanges = new Map<string, { start: string; end: string }>();
      for (const sub of subs) {
        const entry = activeMasters.find((m) => m.maker === data.manufacturer && m.model === data.car_model && m.sub === sub);
        subRanges.set(sub, entry ? getProductionRange(entry) : { start: '0000-01', end: '9999-12' });
      }

      // 1단계: 연식 범위 안의 sub들로 먼저 후보 좁힘
      let candidates = subs;
      if (prodMonth || yy !== null) {
        const inRange = subs.filter((sub) => {
          const { start, end } = subRanges.get(sub)!;
          if (prodMonth) return isInRange(prodMonth, start, end);
          const ys = parseInt(start.slice(0, 4), 10);
          const ye = parseInt(end.slice(0, 4), 10);
          return yy !== null && ys <= yy && yy <= ye;
        });
        if (inRange.length > 0) candidates = inRange;
      }

      // 2단계: raw가 "연식 범위 + 이름 정확 일치"를 모두 만족하면 그대로
      // (연식 범위는 못 찾았어도 candidates==subs이므로 동일하게 동작)
      const exactInRange = raw && candidates.includes(raw);

      if (!exactInRange) {
        // 이름 스코어링 — candidates 안에서만
        const scored = candidates.map((sub) => {
          let score = 1.0;
          const { start, end } = subRanges.get(sub)!;

          if (raw) {
            if (normLow(sub).includes(normLow(raw)) || normLow(raw).includes(normLow(sub))) score -= 0.4;
            else score -= (lcsLen(raw, sub) / Math.max(normLow(raw).length, 1)) * 0.3;
            const inputCodes = codeTokens(raw);
            const subCodes = codeTokens(sub);
            score -= inputCodes.filter((t) => subCodes.includes(t)).length * 0.25;
          }
          // 연식 보너스 — candidates가 이미 연식 필터링됐더라도 세밀하게
          if (prodMonth) {
            if (isInRange(prodMonth, start, end)) score -= 0.6;
            else if (prodMonth < start) score += 0.3;
          } else if (yy) {
            const ys = parseInt(start.slice(0, 4), 10);
            const ye = parseInt(end.slice(0, 4), 10);
            if (yy >= ys && yy <= ye) score -= 0.5;
            else if (yy < ys) score += 0.3;
          }
          if (isEV && /ev|전기/i.test(sub)) score -= 0.3;
          else if (!isEV && /ev|전기/i.test(sub) && fuelNorm) score += 0.3;

          return { sub, score };
        });
        scored.sort((a, b) => a.score - b.score);
        const best = scored[0];
        if (best) {
          // raw가 전체 subs엔 있지만 연식 범위 밖이라 후보에서 빠진 경우 → 교체
          const rawOutOfRange = raw && subs.includes(raw) && !candidates.includes(raw);
          const shouldFill = !raw || rawOutOfRange || best.score < 0.9;
          if (shouldFill) {
            const isFuzzy = best.score >= 0.3 && !rawOutOfRange;
            const tag = rawOutOfRange ? '연식재매칭' : (!raw ? '자동선택' : (isFuzzy ? '유사' : '매칭'));
            messages.push(`세부모델: "${raw || '(없음)'}" → "${best.sub}" (${tag}, score=${best.score.toFixed(2)})`);
            corrections.detail_model = raw || '';
            if (isFuzzy) fuzzyMatches.detail_model = true;
            data.detail_model = best.sub;
          } else {
            messages.push(`세부모델: "${raw}" 매칭 실패 (최저 score=${best.score.toFixed(2)}) → 수동 확인`);
          }
        }
      }
    }
  }

  // 4. 차종 자동 채움
  if (!data.category && data.manufacturer && data.car_model && data.detail_model) {
    const entry = activeMasters.find((m) => m.maker === data.manufacturer && m.model === data.car_model && m.sub === data.detail_model);
    if (entry?.category) {
      data.category = entry.category;
      messages.push(`차종: ${entry.category}`);
    }
  }

  // 5. 연료 정규화
  if (data.fuel_type) {
    const fn = normalizeFuel(data.fuel_type);
    if (fn && fn !== data.fuel_type) {
      messages.push(`연료: "${data.fuel_type}" → "${fn}"`); corrections.fuel_type = String(data.fuel_type);
      data.fuel_type = fn;
    }
  }

  // 6. 숫자 콤마 제거
  for (const col of NUM_COLS) {
    if (data[col]) data[col] = String(data[col]).replace(/,/g, '').trim();
  }

  // 7. 마스터 컨텍스트 보강 — 마스터에 있는 필드(origin, category)만 채움.
  //    연료/배기량/승차/배터리 등 차량별 스펙은 등록증 OCR에서 직접 취득 (마스터에 없음).
  let specEntry = (data.manufacturer && data.car_model && data.detail_model)
    ? activeMasters.find((m) => m.maker === data.manufacturer && m.model === data.car_model && m.sub === data.detail_model)
    : null;

  // 7-2. 세부모델 없으면 제조사+모델만으로 — 제작연월 우선, 연식 fallback.
  if (!specEntry && data.manufacturer && data.car_model) {
    const prodMonth = extractProdMonth(data);
    const yy = extractYY(data);
    const candidates = activeMasters.filter((m) => m.maker === data.manufacturer && m.model === data.car_model);
    if (candidates.length > 0) {
      if (prodMonth) {
        specEntry = candidates.find((m) => {
          const { start, end } = getProductionRange(m);
          return isInRange(prodMonth, start, end);
        }) ?? candidates[0];
      } else if (yy !== null) {
        specEntry = candidates.find((m) => {
          const { start, end } = getProductionRange(m);
          const ys = parseInt(start.slice(0, 4), 10);
          const ye = parseInt(end.slice(0, 4), 10);
          return ys > 0 && ys <= yy && yy <= ye;
        }) ?? candidates[0];
      } else {
        specEntry = candidates[0];
      }
    }
  }

  if (specEntry) {
    if (!data.origin && specEntry.origin) { data.origin = specEntry.origin; corrections.origin = ''; }
    if (!data.category && specEntry.category) { data.category = specEntry.category; corrections.category = ''; }
  }

  // ── 최종 검증: 차종마스터에 없는 값은 유지하되 경고 플래그 ──
  // (이전엔 싹 비웠는데 OCR 결과까지 날리는 부작용 있어서 완화)
  // 값은 그대로 두고 fuzzyMatches에 추가 — UI에서 경고색으로 표시.
  const notInMaster: string[] = [];

  if (data.manufacturer) {
    const mfg = String(data.manufacturer);
    if (!makers.includes(mfg)) {
      notInMaster.push(`제조사="${mfg}"`);
      fuzzyMatches.manufacturer = true;
    }
  }

  if (data.car_model && data.manufacturer) {
    const mdl = String(data.car_model);
    const validModels = getModels(String(data.manufacturer));
    if (!validModels.includes(mdl)) {
      notInMaster.push(`모델="${mdl}"`);
      fuzzyMatches.car_model = true;
    }
  }

  if (data.detail_model && data.manufacturer && data.car_model) {
    const sub = String(data.detail_model);
    const validSubs = getSubs(String(data.manufacturer), String(data.car_model));
    if (!validSubs.includes(sub)) {
      notInMaster.push(`세부모델="${sub}"`);
      fuzzyMatches.detail_model = true;
    }
  }

  if (notInMaster.length > 0) {
    messages.push(`⚠️ 차종마스터에 없음: ${notInMaster.join(', ')} (저장은 되지만 필요시 마스터 추가 권장)`);
  }

  // 내부 힌트 필드 제거 (RTDB 저장 시 불필요)
  delete data._vin_maker_hint;

  return { data, messages, corrections, fuzzyMatches };
}
