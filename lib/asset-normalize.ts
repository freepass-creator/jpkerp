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
  ford: '포드', jeep: '지프', 'landrover': '랜드로버', 'land rover': '랜드로버',
  jaguar: '재규어', lincoln: '링컨', cadillac: '캐딜락',
  peugeot: '푸조', citroen: '시트로엥', maserati: '마세라티',
};

const MODEL_NUMBER_MAP: Record<string, string> = {
  '318': '3시리즈', '320': '3시리즈', '325': '3시리즈', '330': '3시리즈', '340': '3시리즈',
  '520': '5시리즈', '523': '5시리즈', '525': '5시리즈', '530': '5시리즈', '540': '5시리즈',
  '730': '7시리즈', '740': '7시리즈', '750': '7시리즈',
  c200: 'C-클래스', c220: 'C-클래스', c300: 'C-클래스',
  e200: 'E-클래스', e220: 'E-클래스', e300: 'E-클래스', e350: 'E-클래스',
  s350: 'S-클래스', s400: 'S-클래스', s500: 'S-클래스', s580: 'S-클래스',
  glc200: 'GLC', glc220: 'GLC', glc300: 'GLC',
  gle350: 'GLE', gle450: 'GLE',
  gls400: 'GLS', gls450: 'GLS', gls580: 'GLS',
};

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

function extractYY(data: Record<string, unknown>): number | null {
  if (data.car_year) {
    const y = String(data.car_year).replace(/,/g, '').trim();
    if (/^\d{4}$/.test(y)) return Number(y.slice(2));
    if (/^\d{2}$/.test(y)) return Number(y);
  }
  if (data.first_registration_date) {
    const m = String(data.first_registration_date).match(/(\d{2,4})/);
    if (m) return Number(m[1].length === 4 ? m[1].slice(2) : m[1]);
  }
  return null;
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
}

export function normalizeAsset(
  row: Record<string, unknown>,
  masters: RtdbCarModel[],
): NormalizeResult {
  const data = { ...row };
  const messages: string[] = [];
  const corrections: Record<string, string> = {};

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
        if (!found) found = models.find((m) => normLow(m).includes(normLow(stripped)) || normLow(stripped).includes(normLow(m))) ?? null;
        if (!found) {
          const numKey = strongNorm(stripped).replace(/[dise]+$/, '');
          if (MODEL_NUMBER_MAP[numKey]) found = models.find((m) => m === MODEL_NUMBER_MAP[numKey]) ?? null;
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

  // 3. 세부모델 컨텍스트 스코어링
  if (data.manufacturer && data.car_model) {
    const subs = getSubs(String(data.manufacturer), String(data.car_model));
    if (subs.length) {
      const raw = norm(data.detail_model);
      const yy = extractYY(data);
      const fuelNorm = normalizeFuel(data.fuel_type);
      const isEV = fuelNorm === '전기';

      if (!raw || !subs.includes(raw)) {
        const scored = subs.map((sub) => {
          let score = 1.0;
          const entry = activeMasters.find((m) => m.maker === data.manufacturer && m.model === data.car_model && m.sub === sub);
          const ys = Number(entry?.year_start || 0);
          const ye = entry?.year_end === '현재' ? 99 : Number(entry?.year_end || 99);

          if (raw) {
            if (normLow(sub).includes(normLow(raw)) || normLow(raw).includes(normLow(sub))) score -= 0.4;
            else score -= (lcsLen(raw, sub) / Math.max(normLow(raw).length, 1)) * 0.3;
            const inputCodes = codeTokens(raw);
            const subCodes = codeTokens(sub);
            score -= inputCodes.filter((t) => subCodes.includes(t)).length * 0.25;
          }
          if (yy) {
            if (yy >= ys && yy <= ye) score -= 0.5;
            else if (yy < ys) score += 0.3;
          }
          if (isEV && /ev|전기/i.test(sub)) score -= 0.3;
          else if (!isEV && /ev|전기/i.test(sub) && fuelNorm) score += 0.3;

          return { sub, score };
        });
        scored.sort((a, b) => a.score - b.score);
        const best = scored[0];
        if (best && best.score < 0.9) {
          messages.push(`세부모델: "${raw || '(없음)'}" → "${best.sub}"`); corrections.detail_model = raw || '';
          data.detail_model = best.sub;
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

  // 7. 스펙 자동 채움 (마스터에서) — 세부트림/옵션 제외하고 공통 스펙만
  // 7-1. 세부모델까지 매칭되는 경우 정확한 스펙 사용
  let specEntry = (data.manufacturer && data.car_model && data.detail_model)
    ? activeMasters.find((m) => m.maker === data.manufacturer && m.model === data.car_model && m.sub === data.detail_model)
    : null;

  // 7-2. 세부모델 없거나 못 찾으면 제조사+모델만으로 첫 항목 사용 (연식 우선 매칭)
  if (!specEntry && data.manufacturer && data.car_model) {
    const yy = extractYY(data);
    const candidates = activeMasters.filter((m) => m.maker === data.manufacturer && m.model === data.car_model);
    if (candidates.length > 0) {
      if (yy !== null) {
        specEntry = candidates.find((m) => {
          const ys = Number(m.year_start);
          const ye = m.year_end === '현재' || !m.year_end ? 99 : Number(m.year_end);
          return !isNaN(ys) && ys <= yy && yy <= ye;
        }) ?? candidates[0];
      } else {
        specEntry = candidates[0];
      }
    }
  }

  if (specEntry) {
    // 트림/옵션 제외하고 공통 스펙만 자동 채움
    if (!data.fuel_type && specEntry.fuel_type) { data.fuel_type = specEntry.fuel_type; corrections.fuel_type = ''; }
    if (!data.origin && specEntry.origin) { data.origin = specEntry.origin; corrections.origin = ''; }
    if (!data.powertrain && specEntry.powertrain) { data.powertrain = specEntry.powertrain; corrections.powertrain = ''; }
    if (!data.displacement && specEntry.displacement) { data.displacement = specEntry.displacement; corrections.displacement = ''; }
    if (!data.seats && specEntry.seats) { data.seats = specEntry.seats; corrections.seats = ''; }
    if (!data.battery_kwh && specEntry.battery_kwh) { data.battery_kwh = specEntry.battery_kwh; corrections.battery_kwh = ''; }
    if (!data.category && specEntry.category) { data.category = specEntry.category; corrections.category = ''; }
    if (!data.transmission && specEntry.transmission) { data.transmission = specEntry.transmission; corrections.transmission = ''; }
    if (!data.drive_type && specEntry.drive_type) { data.drive_type = specEntry.drive_type; corrections.drive_type = ''; }
  }

  return { data, messages, corrections };
}
