/**
 * asset-normalize.js — 자산 업로드 시 차량 정보 자동 보정
 *
 * 프리패스ERP 동일 로직:
 *   1. 제조사 ALIAS → 정규화
 *   2. 모델명 fuzzy + 접두어 제거 + 코드토큰 매칭
 *   3. 세부모델 컨텍스트 스코어링 (연식/연료/코드/텍스트 유사도)
 *   4. 차종(category) 자동 채움
 *   5. 숫자/날짜 정규화
 */

import { CAR_MODELS, getMakers, getModels, getSubModels, getCategory, loadCustomCarModels } from './car-models.js';

// ── 정규화 헬퍼 ──────────────────────────────────────────
const norm = s => String(s || '').trim();
const normLow = s => norm(s).toLowerCase().replace(/\s+/g, '');
const strongNorm = s => String(s || '').toLowerCase().replace(/[\s\-_·•‧／/()[\]{}]+/g, '');

function levenshtein(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = [];
  for (let i = 0; i <= b.length; i++) m[i] = [i];
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++)
    for (let j = 1; j <= a.length; j++)
      m[i][j] = b[i-1] === a[j-1] ? m[i-1][j-1] : Math.min(m[i-1][j-1]+1, m[i][j-1]+1, m[i-1][j]+1);
  return m[b.length][a.length];
}

/** 영숫자 코드 토큰 추출: "3시리즈 G20 LCI" → ["g20","lci"] */
function codeTokens(s) {
  return String(s || '').toLowerCase().split(/[\s\-_·/()\[\]]+/).filter(t => /^[a-z0-9]{2,}$/.test(t));
}

/** LCS (최장 공통 부분문자열) 길이 */
function lcsLen(a, b) {
  a = normLow(a); b = normLow(b);
  if (!a || !b) return 0;
  const m = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  let max = 0;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      if (a[i-1] === b[j-1]) { m[i][j] = m[i-1][j-1] + 1; if (m[i][j] > max) max = m[i][j]; }
    }
  return max;
}

// ── 제조사 별칭 (프리패스ERP 동일) ───────────────────────
const MAKER_ALIAS = {
  'hyundai': '현대', '현대자동차': '현대', '현대차': '현대',
  'kia': '기아', '기아자동차': '기아', '기아차': '기아',
  'genesis': '제네시스', '제네시스자동차': '제네시스',
  'kgm': 'KGM', 'ssangyong': 'KGM', '쌍용': 'KGM', '쌍용자동차': 'KGM',
  'gm': '쉐보레', 'gmkorea': '쉐보레', 'chevrolet': '쉐보레', 'gm대우': '쉐보레', '쉐보래': '쉐보레',
  'renault': '르노', '르노삼성': '르노', '르노코리아': '르노', 'rsm': '르노', '르노(삼성)': '르노',
  'bmw': 'BMW', '비엠더블유': 'BMW', '비엠': 'BMW',
  'benz': '벤츠', 'mercedes': '벤츠', '메르세데스': '벤츠', '메르세데스-벤츠': '벤츠', '메르세데스벤츠': '벤츠', '벤쯔': '벤츠',
  'audi': '아우디', 'volkswagen': '폭스바겐', 'vw': '폭스바겐',
  'porsche': '포르쉐', '포르셰': '포르쉐', 'mini': '미니', 'tesla': '테슬라',
  'volvo': '볼보', 'lexus': '렉서스', 'toyota': '토요타', 'honda': '혼다',
  'ford': '포드', 'maserati': '마세라티', 'ferrari': '페라리',
  'lamborghini': '람보르기니', 'bentley': '벤틀리', 'rollsroyce': '롤스로이스',
  'jaguar': '재규어', 'landrover': '랜드로버', 'land rover': '랜드로버',
  'jeep': '지프', 'chrysler': '크라이슬러', 'dodge': '닷지',
  'peugeot': '푸조', 'citroen': '시트로엥', 'ds': 'DS',
  'lincoln': '링컨', 'cadillac': '캐딜락', 'gmc': 'GMC',
  'infiniti': '인피니티', 'acura': '아큐라',
};

/** BMW/벤츠 모델번호 → 시리즈 매핑 */
const MODEL_NUMBER_MAP = {
  // BMW: 3자리 숫자 → 시리즈
  '118': '1시리즈', '120': '1시리즈', '125': '1시리즈',
  '218': '2시리즈', '220': '2시리즈', '225': '2시리즈',
  '318': '3시리즈', '320': '3시리즈', '325': '3시리즈', '330': '3시리즈', '340': '3시리즈',
  '420': '4시리즈', '430': '4시리즈', '440': '4시리즈',
  '520': '5시리즈', '523': '5시리즈', '525': '5시리즈', '530': '5시리즈', '540': '5시리즈',
  '620': '6시리즈', '630': '6시리즈', '640': '6시리즈', '650': '6시리즈',
  '725': '7시리즈', '730': '7시리즈', '740': '7시리즈', '745': '7시리즈', '750': '7시리즈',
  '840': '8시리즈', '850': '8시리즈',
  // 벤츠: C/E/S + 숫자
  'c180': 'C-클래스', 'c200': 'C-클래스', 'c220': 'C-클래스', 'c250': 'C-클래스', 'c300': 'C-클래스', 'c43': 'C-클래스', 'c63': 'C-클래스',
  'e200': 'E-클래스', 'e220': 'E-클래스', 'e250': 'E-클래스', 'e300': 'E-클래스', 'e350': 'E-클래스', 'e400': 'E-클래스', 'e43': 'E-클래스', 'e53': 'E-클래스', 'e63': 'E-클래스',
  's350': 'S-클래스', 's400': 'S-클래스', 's450': 'S-클래스', 's500': 'S-클래스', 's560': 'S-클래스', 's580': 'S-클래스', 's63': 'S-클래스',
  'glc200': 'GLC', 'glc220': 'GLC', 'glc250': 'GLC', 'glc300': 'GLC', 'glc43': 'GLC', 'glc63': 'GLC',
  'gle300': 'GLE', 'gle350': 'GLE', 'gle400': 'GLE', 'gle450': 'GLE', 'gle53': 'GLE', 'gle63': 'GLE',
  'gls400': 'GLS', 'gls450': 'GLS', 'gls580': 'GLS', 'gls63': 'GLS',
  'a200': 'A-클래스', 'a250': 'A-클래스', 'a35': 'A-클래스',
  'cla200': 'CLA', 'cla250': 'CLA', 'cla35': 'CLA', 'cla45': 'CLA',
  'cls350': 'CLS', 'cls400': 'CLS', 'cls450': 'CLS', 'cls53': 'CLS',
  'eqs450': 'EQS', 'eqs580': 'EQS',
  'eqe300': 'EQE', 'eqe350': 'EQE',
};

/** 연료 정규화 */
const FUEL_ALIAS = {
  'ev': '전기', 'electric': '전기', '전기차': '전기',
  '경유': '디젤', 'diesel': '디젤',
  '휘발유': '가솔린', 'gasoline': '가솔린', '가솔린(휘발유)': '가솔린',
  'hybrid': '하이브리드', 'hev': '하이브리드', 'HEV': '하이브리드', '하이브리드(HEV)': '하이브리드',
  'phev': '플러그인하이브리드',
  'lpg': 'LPG', 'lpgi': 'LPG',
  '수소': '수소', 'fcev': '수소',
};

// ── 메인 정규화 함수 ────────────────────────────────────
export async function normalizeAsset(row) {
  await loadCustomCarModels();
  const data = { ...row };
  const messages = [];

  // ── 1. 제조사 정규화 ──
  if (data.manufacturer) {
    const makers = getMakers();
    const raw = norm(data.manufacturer);
    const key = normLow(raw);

    // ALIAS 체크
    if (MAKER_ALIAS[key]) {
      if (MAKER_ALIAS[key] !== raw) messages.push(`제조사: "${raw}" → "${MAKER_ALIAS[key]}"`);
      data.manufacturer = MAKER_ALIAS[key];
    }
    // 정확 일치
    else if (makers.includes(raw)) { /* OK */ }
    // strongNorm 일치
    else {
      const sn = strongNorm(raw);
      const found = makers.find(m => strongNorm(m) === sn);
      if (found) {
        messages.push(`제조사: "${raw}" → "${found}"`);
        data.manufacturer = found;
      } else {
        // fuzzy
        const best = fuzzyBest(raw, makers);
        if (best) {
          messages.push(`제조사: "${raw}" → "${best}" (유사)`);
          data.manufacturer = best;
        }
      }
    }
  }

  // ── 2. 모델명 정규화 ──
  if (data.manufacturer) {
    const models = getModels(data.manufacturer);
    if (models.length) {
      const raw = norm(data.car_model || '');
      // 제조사 접두어 제거: "BMW 3시리즈" → "3시리즈"
      const makerLow = normLow(data.manufacturer);
      const stripped = raw.replace(new RegExp('^' + makerLow + '[\\s\\-]*', 'i'), '').trim();
      // 모델명이 제조사명과 같거나 비어있으면 → 세부모델에서 역추론
      const isModelSameAsMaker = !stripped || normLow(stripped) === makerLow;

      let found = null;

      if (!isModelSameAsMaker && (models.includes(raw) || models.includes(stripped))) {
        // 정확 일치
        found = models.includes(stripped) ? stripped : raw;
      }

      if (!found && !isModelSameAsMaker) {
        const sn = strongNorm(stripped);
        // strongNorm 일치
        found = models.find(m => strongNorm(m) === sn);
        // 부분 포함
        if (!found) found = models.find(m => normLow(m).includes(normLow(stripped)) || normLow(stripped).includes(normLow(m)));
        // BMW/벤츠 모델번호 매핑: "530i" → "5시리즈", "C200" → "C-클래스"
        if (!found) {
          const numKey = strongNorm(stripped).replace(/[dise]+$/, ''); // 530i→530, 520d→520, c200→c200
          if (MODEL_NUMBER_MAP[numKey]) {
            found = models.find(m => m === MODEL_NUMBER_MAP[numKey]);
          }
        }
        // 코드토큰
        if (!found) {
          const inputTokens = codeTokens(stripped);
          if (inputTokens.length) {
            found = models.find(m => codeTokens(m).some(t => inputTokens.includes(t)));
          }
        }
        // fuzzy
        if (!found) found = suggestBest(stripped, models);
      }

      // 세부모델에서 모델 역추론 (모델명=제조사명이거나 매칭 실패 시)
      if (!found && data.detail_model) {
        const subRaw = norm(data.detail_model).replace(new RegExp('^' + makerLow + '[\\s\\-]*', 'i'), '').trim();
        // 세부모델 텍스트에서 모델명 포함 찾기
        for (const m of models) {
          const mLow = normLow(m);
          if (normLow(subRaw).includes(mLow) || mLow.includes(normLow(subRaw).split(/[\s(]/)[0])) {
            found = m;
            break;
          }
        }
        // 세부모델 코드토큰으로 매칭
        if (!found) {
          const subTokens = codeTokens(subRaw);
          if (subTokens.length) {
            // CAR_MODELS에서 직접 찾기
            const entry = CAR_MODELS.find(e =>
              e.maker === data.manufacturer &&
              subTokens.some(t => codeTokens(e.sub).includes(t))
            );
            if (entry) found = entry.model;
          }
        }
        // 세부모델 텍스트 fuzzy
        if (!found) {
          found = suggestBest(subRaw.split(/[\s(]/)[0], models);
        }
      }

      if (found && found !== raw) {
        messages.push(`모델: "${raw || '(없음)'}" → "${found}"`);
        data.car_model = found;
      }
    }
  }

  // ── 3. 세부모델 컨텍스트 스코어링 ──
  if (data.manufacturer && data.car_model) {
    const subs = getSubModels(data.manufacturer, data.car_model);
    if (subs.length) {
      const raw = norm(data.detail_model);
      const yy = extractYY(data);
      const fuelNorm = normalizeFuel(data.fuel_type);
      const isEV = fuelNorm === '전기';
      const isHybrid = /하이브리드/.test(fuelNorm);

      if (raw && subs.includes(raw)) {
        // 정확 일치 — OK
      } else {
        // 스코어링
        const scored = subs.map(sub => {
          let score = 1.0;
          const subLow = normLow(sub);
          const rawLow = normLow(raw || '');
          const entry = CAR_MODELS.find(m => m.maker === data.manufacturer && m.model === data.car_model && m.sub === sub);
          const ys = Number(entry?.year_start || 0);
          const ye = entry?.year_end === '현재' ? 99 : Number(entry?.year_end || 99);

          // 텍스트 유사도
          if (raw) {
            if (subLow.includes(rawLow) || rawLow.includes(subLow)) score -= 0.4;
            else {
              const lcs = lcsLen(raw, sub);
              const ratio = lcs / Math.max(rawLow.length, 1);
              score -= ratio * 0.3;
            }
            // 코드토큰
            const inputCodes = codeTokens(raw);
            const subCodes = codeTokens(sub);
            const codeMatch = inputCodes.filter(t => subCodes.includes(t)).length;
            score -= codeMatch * 0.25;
          }

          // 연식 매칭 (최강 신호)
          if (yy) {
            if (yy >= ys && yy <= ye) score -= 0.5;
            else if (yy === ys - 1) score -= 0.1;
            else if (yy < ys) score += 0.3;
            else score -= Math.max(0, 0.3 - (yy - ye) * 0.1);
          }

          // 연료 매칭
          if (isEV && /ev|전기|일렉트릭/i.test(sub)) score -= 0.3;
          else if (!isEV && /ev|전기|일렉트릭/i.test(sub) && fuelNorm) score += 0.3;
          if (isHybrid && /하이브리드|hybrid/i.test(sub)) score -= 0.25;

          return { sub, score };
        });

        scored.sort((a, b) => a.score - b.score);
        const best = scored[0];

        if (best && best.score < 0.9) {
          if (!raw || raw !== best.sub) {
            messages.push(`세부모델: "${raw || '(없음)'}" → "${best.sub}" (점수 ${best.score.toFixed(2)})`);
          }
          data.detail_model = best.sub;
        }
      }
    }
  }

  // ── 4. 세부모델 비어있고 연식만 있으면 → 연식 기반 자동 추천 ──
  if (!data.detail_model && data.manufacturer && data.car_model) {
    const yy = extractYY(data);
    if (yy) {
      const entries = CAR_MODELS.filter(m =>
        m.maker === data.manufacturer && m.model === data.car_model &&
        Number(m.year_start) <= yy && (m.year_end === '현재' || Number(m.year_end) >= yy)
      );
      if (entries.length >= 1) {
        data.detail_model = entries[0].sub;
        messages.push(`세부모델 자동: ${entries[0].sub} (연식 ${yy})`);
      }
    }
  }

  // ── 5. 차종(category) 자동 채움 ──
  if (!data.vehicle_class && data.manufacturer && data.car_model && data.detail_model) {
    const cat = getCategory(data.manufacturer, data.car_model, data.detail_model);
    if (cat) {
      data.vehicle_class = cat;
      messages.push(`차종: ${cat}`);
    }
  }

  // ── 6. 연료 정규화 ──
  if (data.fuel_type) {
    const fn = normalizeFuel(data.fuel_type);
    if (fn && fn !== data.fuel_type) {
      messages.push(`연료: "${data.fuel_type}" → "${fn}"`);
      data.fuel_type = fn;
    }
  }

  // ── 7. 숫자 필드 콤마 제거 ──
  const numCols = [
    'consumer_price', 'vehicle_price', 'purchase_price', 'delivery_fee',
    'actual_purchase_price', 'acquisition_tax', 'sales_commission',
    'performance_insurance', 'transfer_fee', 'local_bond', 'stamp_duty',
    'other_fees', 'loan_principal', 'loan_down_payment', 'mileage',
    'displacement', 'seats', 'car_year',
  ];
  for (const col of numCols) {
    if (data[col]) data[col] = String(data[col]).replace(/,/g, '').trim();
  }

  return { data, messages };
}

// ── 헬퍼 ────────────────────────────────────────────────

/** 연식 추출 (YY 두자리) */
function extractYY(data) {
  // 1순위: car_year
  if (data.car_year) {
    const y = String(data.car_year).replace(/,/g, '').trim();
    if (/^\d{4}$/.test(y)) return Number(y.slice(2));
    if (/^\d{2}$/.test(y)) return Number(y);
  }
  // 2순위: first_reg_date
  if (data.first_reg_date) {
    const m = String(data.first_reg_date).match(/(\d{2,4})/);
    if (m) {
      const v = m[1].length === 4 ? m[1].slice(2) : m[1];
      return Number(v);
    }
  }
  return null;
}

/** 연료 정규화 */
function normalizeFuel(f) {
  if (!f) return '';
  const key = normLow(f);
  return FUEL_ALIAS[key] || norm(f);
}

/** fuzzy 최근접 1개 */
function fuzzyBest(input, candidates) {
  const inLow = normLow(input);
  if (!inLow) return null;
  // 부분 포함
  for (const c of candidates) {
    const cLow = normLow(c);
    if (cLow.includes(inLow) || inLow.includes(cLow)) return c;
  }
  // levenshtein
  let best = null, bestScore = Infinity;
  for (const c of candidates) {
    const dist = levenshtein(normLow(input), normLow(c));
    const ratio = dist / Math.max(inLow.length, normLow(c).length);
    if (ratio < bestScore) { best = c; bestScore = ratio; }
  }
  return bestScore <= 0.5 ? best : null;
}

/** LCS 기반 최적 추천 */
function suggestBest(input, candidates) {
  const inLow = normLow(input);
  if (!inLow) return null;
  const minLcs = Math.min(3, Math.max(2, Math.floor(inLow.length / 2)));

  let best = null, bestScore = 1;
  for (const c of candidates) {
    const cLow = normLow(c);
    // 완전포함
    if (cLow.includes(inLow) || inLow.includes(cLow)) return c;
    // LCS
    const lcs = lcsLen(input, c);
    if (lcs < minLcs) continue;
    const lcsRatio = lcs / inLow.length;
    const levRatio = levenshtein(inLow, cLow) / Math.max(inLow.length, cLow.length);
    const score = (1 - lcsRatio) * 0.5 + levRatio * 0.3;
    if (score < bestScore) { best = c; bestScore = score; }
  }
  return bestScore <= 0.45 ? best : null;
}
