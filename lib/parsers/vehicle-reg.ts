/**
 * 자동차등록증 OCR 파서
 *
 * 한국 자동차등록증은 격자 양식이라 OCR 출력 순서가 일정치 않아
 * label-value 매칭을 엄격하게 (한 줄 이내, 다음 필드 라벨 직전까지).
 */

export interface VehicleRegParsed {
  car_number: string;
  vin: string;
  car_name: string;          // 차명 원본 (제조사+모델)
  type_number: string;       // 형식번호 (NKC90D 등)
  engine_type: string;       // 원동기형식 (D4HB 등)
  car_year: number | null;
  category_hint: string;     // 차종 (대형승용, 소형승합 등)
  usage_type: string;        // 용도 (자가용/렌터카)
  seats: number | null;
  displacement: number | null;
  fuel_type: string;
  first_registration_date: string;
  owner_name: string;
  owner_biz_no: string;
  address: string;
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  gross_weight_kg: number | null;
  curb_weight_kg: number | null;
}

const pad = (n: number | string) => String(n).padStart(2, '0');
const toNum = (s: string) => Number(String(s).replace(/[,\s]/g, ''));

const FUEL_ALIAS: Record<string, string> = {
  '경유': '디젤', '휘발유': '가솔린', '가솔린': '가솔린', '디젤': '디젤',
  'lpg': 'LPG', 'LPG': 'LPG', '전기': '전기', '수소': '수소',
  '하이브리드': '하이브리드', '가솔린하이브리드': '하이브리드',
};

// 엔진 코드에서 연료 추정 (D로 시작하면 디젤, G는 가솔린, L은 LPG, E는 전기)
function inferFuelFromEngine(engineCode: string): string {
  if (!engineCode) return '';
  const c = engineCode.toUpperCase();
  if (c.startsWith('D')) return '디젤';
  if (c.startsWith('G')) return '가솔린';
  if (c.startsWith('L')) return 'LPG';
  if (c.startsWith('E')) return '전기';
  return '';
}

export function detectVehicleReg(text: string): boolean {
  const keywords = ['자동차등록증', '자동차등록번호', '차대번호', '형식 및 제작연월', '승차정원', '배기량', '원동기형식'];
  return keywords.filter((k) => text.includes(k)).length >= 3;
}

// 자동차등록규칙 별지 제1호서식의 각 필드 앞에 붙는 원형 숫자 (①~⑳ 그리고 ㉑~㉔)
// U+2460~2473 (① ~ ⑳), U+3251~3254 (㉑ ~ ㉔)
const CIRCLED_NUMS = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒㉓㉔';

/**
 * 원형 숫자(①②③…) 앵커로 텍스트를 셀 단위로 분해.
 * 자동차등록증은 표준 서식이라 각 필드 앞에 고유한 원형 숫자가 있음.
 * @returns Map<원형번호(1~24), 해당 셀의 텍스트 (라벨+값)>
 */
function splitByCircledNumbers(text: string): Map<number, string> {
  const cells = new Map<number, string>();
  const re = new RegExp(`([${CIRCLED_NUMS}])`, 'g');
  const matches: Array<{ num: number; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const idx = CIRCLED_NUMS.indexOf(m[1]);
    if (idx >= 0) matches.push({ num: idx + 1, index: m.index });
  }
  if (matches.length === 0) return cells;
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + 1; // 원형 숫자 자체는 스킵
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    cells.set(matches[i].num, text.slice(start, end).trim());
  }
  return cells;
}

/**
 * 셀 내용에서 라벨 제거 후 값만 반환.
 * 예: "자 동 차 등 록 번 호 02마4731" → "02마4731"
 */
function stripLabel(cellText: string, labelPattern: RegExp): string {
  const m = cellText.match(labelPattern);
  return m ? cellText.slice(m[0].length).trim() : cellText.trim();
}

/** 원형숫자 셀 맵에서 각 필드를 추출해 VehicleRegParsed에 채움. */
function applyCellsToFields(cells: Map<number, string>, d: VehicleRegParsed): void {
  // ① 자동차등록번호 → car_number
  const c1 = cells.get(1);
  if (c1) {
    const v = stripLabel(c1, /^자\s*동\s*차\s*등\s*록\s*번\s*호\s*[:：]?\s*/);
    const plate = v.match(/(\d{2,3})\s*([가-힣])\s*(\d{4})/);
    if (plate) d.car_number = `${plate[1]}${plate[2]}${plate[3]}`;
  }

  // ② 차 종 → category_hint
  const c2 = cells.get(2);
  if (c2) {
    const v = stripLabel(c2, /^차\s*종\s*[:：]?\s*/);
    const cat = v.match(/((?:대형|중형|소형|경형)\s*(?:승용|승합|화물|특수))/);
    if (cat) d.category_hint = cat[1].replace(/\s+/g, '');
  }

  // ③ 용도 → 일단 차량번호로 판별 (더 정확) — 여기선 생략, 후처리에서 결정

  // ④ 차 명 → car_name
  const c4 = cells.get(4);
  if (c4) {
    const v = stripLabel(c4, /^차\s*명\s*[:：]?\s*/);
    if (v && v.length < 30 && /[가-힣A-Za-z]/.test(v)) d.car_name = v;
  }

  // ⑤ 형식 및 제작연월 → type_number + car_year
  const c5 = cells.get(5);
  if (c5) {
    const v = stripLabel(c5, /^형식\s*(?:및\s*)?제작연월\s*[:：]?\s*/);
    // 형식번호: 영문으로 시작, 하이픈/숫자 포함
    const typeM = v.match(/^([A-Z][A-Z0-9\-]{2,18})/);
    if (typeM) d.type_number = typeM[1].replace(/-+$/, '');
    // 제작연월: YYYY-MM 또는 YYYY년 MM
    const yearM = v.match(/(\d{4})\s*[-년./]/);
    if (yearM) d.car_year = Number(yearM[1]);
  }

  // ⑥ 차대번호 → vin
  const c6 = cells.get(6);
  if (c6) {
    const v = stripLabel(c6, /^차\s*대\s*번\s*호\s*[:：]?\s*/);
    const vinM = v.match(/([A-HJ-NPR-Z0-9]{17})/);
    if (vinM) d.vin = vinM[1];
  }

  // ⑦ 원동기형식 → engine_type
  const c7 = cells.get(7);
  if (c7) {
    const v = stripLabel(c7, /^원동기\s*형식\s*[:：]?\s*/);
    const engM = v.match(/^([A-Z][A-Z0-9\-]{2,9})/);
    if (engM) d.engine_type = engM[1];
  }

  // ⑧ 사용본거지 → address
  const c8 = cells.get(8);
  if (c8) {
    const v = stripLabel(c8, /^사\s*용\s*본\s*거\s*지\s*[:：]?\s*/);
    if (v) d.address = v;
  }

  // ⑨ 성명(명칭) → owner_name
  const c9 = cells.get(9);
  if (c9) {
    const v = stripLabel(c9, /^성\s*명\s*\(?\s*명칭\s*\)?\s*[:：]?\s*/);
    if (v && v.length < 50) d.owner_name = v;
  }

  // ⑩ 생년월일/법인등록번호 → owner_biz_no
  const c10 = cells.get(10);
  if (c10) {
    // 법인등록번호 형식 XXXXXX-XXXXXXX 또는 주민번호 YYMMDD-NNNNNNN
    const m = c10.match(/(\d{6}\s*-\s*\d{7})|(\d{6}\s*-\s*\d{1}\*{6})/);
    if (m) d.owner_biz_no = m[0].replace(/\s/g, '');
  }

  // ⑫ 길이
  const c12 = cells.get(12);
  if (c12) {
    const m = c12.match(/([\d,]+)\s*mm/);
    if (m) d.length_mm = toNum(m[1]);
  }
  // ⑬ 너비
  const c13 = cells.get(13);
  if (c13) {
    const m = c13.match(/([\d,]+)\s*mm/);
    if (m) d.width_mm = toNum(m[1]);
  }
  // ⑭ 높이
  const c14 = cells.get(14);
  if (c14) {
    const m = c14.match(/([\d,]+)\s*mm/);
    if (m) d.height_mm = toNum(m[1]);
  }
  // ⑮ 총중량
  const c15 = cells.get(15);
  if (c15) {
    const m = c15.match(/([\d,]+)\s*kg/);
    if (m) d.gross_weight_kg = toNum(m[1]);
  }
  // ⑯ 승차정원
  const c16 = cells.get(16);
  if (c16) {
    const m = c16.match(/(\d{1,2})\s*명/);
    if (m) d.seats = Number(m[1]);
  }
  // ⑱ 배기량
  const c18 = cells.get(18);
  if (c18) {
    const m = c18.match(/([\d,]{3,})\s*(?:cc|CC|시시)/);
    if (m) {
      const n = toNum(m[1]);
      if (n >= 50 && n <= 20000) d.displacement = n;
    }
  }
  // ㉑ 연료의 종류 (21번 — U+3251, 다른 unicode 블록)
  const c21 = cells.get(21);
  if (c21) {
    const fm = c21.match(/(경유|휘발유|가솔린|디젤|LPG|전기|수소|하이브리드)/i);
    if (fm) d.fuel_type = FUEL_ALIAS[fm[1]] || fm[1];
  }
}

export function parseVehicleReg(text: string, _lines?: string[]): VehicleRegParsed {
  const d: VehicleRegParsed = {
    car_number: '', vin: '', car_name: '', type_number: '', engine_type: '',
    car_year: null, category_hint: '', usage_type: '', seats: null,
    displacement: null, fuel_type: '', first_registration_date: '',
    owner_name: '', owner_biz_no: '', address: '',
    length_mm: null, width_mm: null, height_mm: null,
    gross_weight_kg: null, curb_weight_kg: null,
  };

  // ── 0차 (최우선): 원형 숫자(① ② ③ …) 셀 분해 기반 추출 ──
  // 자동차등록규칙 별지 제1호서식은 모든 등록증에 공통이므로, 필드 앞의 원형 숫자를
  // 앵커로 써서 셀 단위로 값 추출하면 텍스트 순서 교란에도 안정적.
  const cells = splitByCircledNumbers(text);
  applyCellsToFields(cells, d);

  // ── 아래는 셀 추출이 실패한 필드에 대한 텍스트 정규식 폴백 ──
  // ── 차량번호 ──
  if (!d.car_number) {
    const lbl = text.match(/자\s*동\s*차\s*등\s*록\s*번\s*호[\s:：]*([0-9가-힣\s]{4,20})/);
    if (lbl) {
      const cleaned = lbl[1].replace(/\s/g, '');
      const m = cleaned.match(/^(\d{2,3})([가-힣])(\d{4})/);
      if (m) d.car_number = `${m[1]}${m[2]}${m[3]}`;
    }
  }
  if (!d.car_number) {
    const looseLbl = text.match(/자\s*동\s*차\s*등\s*록\s*번\s*호[\s\S]{0,50}?(\d{2,3})\s*([^\d\s])\s*(\d{4})/);
    if (looseLbl) d.car_number = `${looseLbl[1]}${looseLbl[2]}${looseLbl[3]}`;
  }
  if (!d.car_number) {
    const carNumM = text.match(/(\d{2,3})\s*([가-힣])\s*(\d{4})/);
    if (carNumM) d.car_number = `${carNumM[1]}${carNumM[2]}${carNumM[3]}`;
  }

  // ── VIN ──
  if (!d.vin) {
    const vinLabel = text.match(/차\s*대\s*번\s*호[\s:：]*([A-HJ-NPR-Z0-9]{17})/);
    if (vinLabel) d.vin = vinLabel[1];
  }
  if (!d.vin) {
    const vinAll = text.match(/\b([A-HJ-NPR-Z0-9]{17})\b/);
    if (vinAll) d.vin = vinAll[1];
  }

  // ── 차명 ──
  if (!d.car_name) {
    const NEXT_LABELS = /형식|차종|차\s*체|제작연월|원동기|차대번호|용도|연료|배기량|승차정원|최초등록|차량자중|총중량/;
    const carNameM = text.match(/차\s*명[\s:：]+([^\n]+)/);
    if (carNameM) {
      let raw = carNameM[1].trim();
      const cut = raw.search(NEXT_LABELS);
      if (cut > 0) raw = raw.slice(0, cut).trim();
      raw = raw.replace(/\s*\([^)]*\)/g, '').replace(/^[⑤⑥①②③④⑦⑧⑨⓪]+\s*/, '').trim();
      if (/[가-힣A-Za-z]{2,}/.test(raw) && raw !== '차대번호') d.car_name = raw;
    }
  }

  // ── 형식번호 ──
  if (!d.type_number) {
    const typeM = text.match(/형식\s*(?:및\s*)?제작연월[\s:：]*([A-Z][A-Z0-9\-]{2,18}?)(?=\s+\d{4}\s*[-/.년]|\s*$|\n)/i);
    if (typeM) d.type_number = typeM[1].replace(/-+$/, '');
  }

  // ── 제작연월 → car_year ──
  if (!d.car_year) {
    const yearM = text.match(/제작연월[\s\S]{0,60}?(\d{4})\s*[-년./](?:\s*(\d{1,2}))?/);
    if (yearM) d.car_year = Number(yearM[1]);
  }

  // ── 원동기형식 ──
  if (!d.engine_type) {
    const engineM = text.match(/원동기\s*형식[\s:：]*([A-Z][A-Z0-9\-]{2,9})/i);
    if (engineM) d.engine_type = engineM[1];
  }

  // ── 차종 ──
  if (!d.category_hint) {
    const catM = text.match(/차\s*종[\s:：]+((?:대형|중형|소형|경형)\s*(?:승용|승합|화물|특수))/);
    if (catM) d.category_hint = catM[1].replace(/\s+/g, '');
  }

  // ── 승차정원 ──
  if (!d.seats) {
    const seatsM = text.match(/승차정원[\s:：]*(\d{1,2})\s*명/);
    if (seatsM) d.seats = Number(seatsM[1]);
  }

  // ── 배기량 ──
  if (!d.displacement) {
    const dispM = text.match(/배기량[\s\S]{0,80}?([\d,]{3,})\s*(?:cc|CC|시시)/);
    if (dispM) {
      const n = toNum(dispM[1]);
      if (n >= 50 && n <= 20000) d.displacement = n;
    }
  }

  // ── 연료 ──
  if (!d.fuel_type) {
    const fuelLabel = text.match(/(?:연료(?:의)?\s*종류|사용\s*연료|연\s*료)[\s:：]*([^\n]{0,40})/);
    if (fuelLabel) {
      const fm = fuelLabel[1].match(/(경유|휘발유|가솔린|디젤|LPG|전기|수소|하이브리드)/i);
      if (fm) d.fuel_type = FUEL_ALIAS[fm[1]] || fm[1];
    }
  }
  // 폴백: 원동기 코드로 추정 (D4HB=디젤, G4FL=가솔린 등)
  if (!d.fuel_type && d.engine_type) {
    const inferred = inferFuelFromEngine(d.engine_type);
    if (inferred) d.fuel_type = inferred;
  }

  // ── 용도 (차량번호 한글로 판별) ──
  if (d.car_number) {
    const h = d.car_number.match(/[가-힣]/);
    d.usage_type = h && '하허호'.includes(h[0]) ? '렌터카' : '자가용';
  }

  // ── 최초등록일 (원형숫자 앵커 없음 — "최초등록일" 라벨만 존재) ──
  if (!d.first_registration_date) {
    const regM = text.match(/최초등록(?:일)?[\s:：]*(\d{4})\s*[년./\-]\s*(\d{1,2})\s*[월./\-]\s*(\d{1,2})/);
    if (regM) d.first_registration_date = `${regM[1]}-${pad(regM[2])}-${pad(regM[3])}`;
  }

  // ── 소유자 (라벨 폴백) ──
  if (!d.owner_name) {
    const ownerM = text.match(/성\s*명\s*\(?\s*명칭\s*\)?[\s:：]*([^\n]+)/);
    if (ownerM) {
      let o = ownerM[1].trim();
      const cut = o.search(/생년월일|주민등록|법인등록/);
      if (cut > 0) o = o.slice(0, cut).trim();
      d.owner_name = o;
    }
  }

  // ── 법인/사업자번호 ──
  if (!d.owner_biz_no) {
    const corpM = text.match(/(?:법인등록번호|사업자등록번호)[\s:：]*([\d\-]{10,14})/);
    if (corpM) d.owner_biz_no = corpM[1].replace(/\s/g, '');
  }

  // ── 사용본거지 ──
  if (!d.address) {
    const addrM = text.match(/사용본거지[\s:：]+([^\n]+)/);
    if (addrM) d.address = addrM[1].trim();
  }

  // ── 길이/너비/높이/중량 ──
  if (!d.length_mm) {
    const lenM = text.match(/길\s*이[\s:：]*([\d,]+)\s*mm/);
    if (lenM) d.length_mm = toNum(lenM[1]);
  }
  if (!d.width_mm) {
    const widM = text.match(/너\s*비[\s:：]*([\d,]+)\s*mm/);
    if (widM) d.width_mm = toNum(widM[1]);
  }
  if (!d.height_mm) {
    const heiM = text.match(/높\s*이[\s:：]*([\d,]+)\s*mm/);
    if (heiM) d.height_mm = toNum(heiM[1]);
  }
  if (!d.gross_weight_kg) {
    const grossM = text.match(/총\s*중량[\s:：]*([\d,]+)\s*kg/);
    if (grossM) d.gross_weight_kg = toNum(grossM[1]);
  }
  if (!d.curb_weight_kg) {
    const curbM = text.match(/차량\s*자중[\s:：]*([\d,]+)\s*kg/);
    if (curbM) d.curb_weight_kg = toNum(curbM[1]);
  }

  // ── 최종 검증: 차량번호 포맷 ──
  // PDF 한글 폰트가 깨져 "가" 가 "-", "7-" 등으로 나오면 loose regex가 false positive 생성.
  // 엄격한 포맷 (\d{2,3} + 한글 1자 + \d{4})에 맞지 않으면 비움.
  if (d.car_number && !/^\d{2,3}[가-힣]\d{4}$/.test(d.car_number)) {
    d.car_number = '';
  }

  return d;
}

/**
 * 파싱 결과가 "핵심 필드가 부족"한지 판단 — 이미지 OCR 재시도 여부 결정용.
 *
 * 재시도 트리거 조건 (OR):
 *   1. 차량번호가 유효한 한국 번호판 포맷(\d{2,3}+한글+\d{4})이 아님
 *      — 한글 서브셋 폰트가 깨져 "가"가 garbage 문자로 추출된 경우
 *   2. 기본 필드 2개 이상 누락 (승차정원/배기량/제조사차명 등)
 *      — 한글 라벨 깨짐으로 값 추출 실패한 경우
 */
export function isVehicleRegParseIncomplete(d: VehicleRegParsed): boolean {
  // 1. 번호판 포맷 검증 — 한국 번호판은 반드시 숫자+한글+숫자 (예외 없음)
  if (!/^\d{2,3}[가-힣]\d{4}$/.test(d.car_number)) return true;

  // 2. 핵심 필드 누락 카운트
  const critical = [
    d.car_name,
    d.seats,
    d.displacement,
    d.engine_type,
    d.type_number,
  ];
  const missing = critical.filter((v) => v == null || v === '' || v === 0).length;
  if (missing >= 2) return true;

  return false;
}
