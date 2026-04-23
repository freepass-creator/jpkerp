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

export function parseVehicleReg(text: string, _lines?: string[]): VehicleRegParsed {
  const d: VehicleRegParsed = {
    car_number: '', vin: '', car_name: '', type_number: '', engine_type: '',
    car_year: null, category_hint: '', usage_type: '', seats: null,
    displacement: null, fuel_type: '', first_registration_date: '',
    owner_name: '', owner_biz_no: '', address: '',
    length_mm: null, width_mm: null, height_mm: null,
    gross_weight_kg: null, curb_weight_kg: null,
  };

  // ── 차량번호 ──
  // 1차: 한글 1자 포함 (ex. 12가3456, 123하4567)
  const carNumM = text.match(/(\d{2,3})\s*([가-힣])\s*(\d{4})/);
  if (carNumM) d.car_number = `${carNumM[1]}${carNumM[2]}${carNumM[3]}`;
  // 2차: 라벨 기반 폴백 — "자동차등록번호" 뒤의 숫자/한글 토큰
  if (!d.car_number) {
    const lbl = text.match(/자동차등록번호[\s:：]*([0-9가-힣\s]{4,15})/);
    if (lbl) {
      const cleaned = lbl[1].replace(/\s/g, '');
      // 숫자-한글-숫자 구조인지 최종 검증
      const m = cleaned.match(/^(\d{2,3})([가-힣])(\d{4})$/);
      if (m) d.car_number = cleaned;
    }
  }

  // ── VIN (17자리, I/O/Q 제외) ──
  // 라벨 근처 우선, 없으면 전체 텍스트에서 17자 연속
  const vinLabel = text.match(/차\s*대\s*번\s*호[\s:：]*([A-HJ-NPR-Z0-9]{17})/);
  if (vinLabel) d.vin = vinLabel[1];
  if (!d.vin) {
    const vinAll = text.match(/\b([A-HJ-NPR-Z0-9]{17})\b/);
    if (vinAll) d.vin = vinAll[1];
  }

  // ── 차명 ──
  // 다음 라벨(형식, 차종, 제작연월, 원동기, 차대번호, 차체, 용도, 연료 등) 전까지 한 줄 이내
  // "차 명" 또는 "차명" 뒤 공백 뒤의 값만
  const NEXT_LABELS = /형식|차종|차\s*체|제작연월|원동기|차대번호|용도|연료|배기량|승차정원|최초등록|차량자중|총중량/;
  const carNameM = text.match(/차\s*명[\s:：]+([^\n]+)/);
  if (carNameM) {
    let raw = carNameM[1].trim();
    // 다음 라벨 전까지 잘라냄
    const cut = raw.search(NEXT_LABELS);
    if (cut > 0) raw = raw.slice(0, cut).trim();
    // 괄호 안/번호 제거
    raw = raw.replace(/\s*\([^)]*\)/g, '').replace(/^[⑤⑥①②③④⑦⑧⑨⓪]+\s*/, '').trim();
    // 최소 2자 이상 한글/영문이 포함돼야 유효
    if (/[가-힣A-Za-z]{2,}/.test(raw) && raw !== '차대번호') {
      d.car_name = raw;
    }
  }

  // ── 형식번호 (영문+숫자 조합) ──
  // "형식 및 제작연월 NKC90D 2020-03" 형태
  const typeM = text.match(/형식\s*(?:및\s*)?제작연월[\s:：]*([A-Z0-9]{4,10})/i);
  if (typeM) d.type_number = typeM[1];

  // ── 제작연월 → car_year ──
  const yearM = text.match(/제작연월[^0-9]*(\d{4})\s*[-년./\s]+\s*(\d{1,2})/);
  if (yearM) d.car_year = Number(yearM[1]);

  // ── 원동기형식 ──
  const engineM = text.match(/원동기\s*형식[\s:：]*([A-Z][A-Z0-9\-]{2,9})/i);
  if (engineM) d.engine_type = engineM[1];

  // ── 차종 ──
  const catM = text.match(/차\s*종[\s:：]+((?:대형|중형|소형|경형)\s*(?:승용|승합|화물|특수))/);
  if (catM) d.category_hint = catM[1].replace(/\s+/g, '');

  // ── 승차정원 ──
  const seatsM = text.match(/승차정원[\s:：]*(\d{1,2})\s*명/);
  if (seatsM) d.seats = Number(seatsM[1]);

  // ── 배기량 (cc) ──
  const dispM = text.match(/배기량[\s:：]*([\d,]{3,})\s*(?:cc|시시|CC)?/);
  if (dispM) {
    const n = toNum(dispM[1]);
    if (n >= 50 && n <= 20000) d.displacement = n;
  }

  // ── 연료 (라벨 "연료의 종류" 또는 "사용연료" 근처에서만, 전역 매칭 금지) ──
  const fuelLabel = text.match(/(?:연료(?:의)?\s*종류|사용\s*연료|연\s*료)[\s:：]*([^\n]{0,40})/);
  if (fuelLabel) {
    const zone = fuelLabel[1];
    const fm = zone.match(/(경유|휘발유|가솔린|디젤|LPG|전기|수소|하이브리드)/i);
    if (fm) d.fuel_type = FUEL_ALIAS[fm[1]] || fm[1];
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

  // ── 최초등록일 ──
  const regM = text.match(/최초등록(?:일)?[\s:：]*(\d{4})\s*[년./\-]\s*(\d{1,2})\s*[월./\-]\s*(\d{1,2})/);
  if (regM) d.first_registration_date = `${regM[1]}-${pad(regM[2])}-${pad(regM[3])}`;

  // ── 소유자 ──
  const ownerM = text.match(/성\s*명\s*\(?\s*명칭\s*\)?[\s:：]*([^\n]+)/);
  if (ownerM) {
    let o = ownerM[1].trim();
    const cut = o.search(/생년월일|주민등록|법인등록/);
    if (cut > 0) o = o.slice(0, cut).trim();
    d.owner_name = o;
  }

  // ── 법인/사업자번호 ──
  const corpM = text.match(/(?:법인등록번호|사업자등록번호)[\s:：]*([\d\-]{10,14})/);
  if (corpM) d.owner_biz_no = corpM[1].replace(/\s/g, '');

  // ── 사용본거지 ──
  const addrM = text.match(/사용본거지[\s:：]+([^\n]+)/);
  if (addrM) d.address = addrM[1].trim();

  // ── 길이/너비/높이/중량 ──
  const lenM = text.match(/길\s*이[\s:：]*([\d,]+)\s*mm/);
  if (lenM) d.length_mm = toNum(lenM[1]);
  const widM = text.match(/너\s*비[\s:：]*([\d,]+)\s*mm/);
  if (widM) d.width_mm = toNum(widM[1]);
  const heiM = text.match(/높\s*이[\s:：]*([\d,]+)\s*mm/);
  if (heiM) d.height_mm = toNum(heiM[1]);
  const grossM = text.match(/총\s*중량[\s:：]*([\d,]+)\s*kg/);
  if (grossM) d.gross_weight_kg = toNum(grossM[1]);
  const curbM = text.match(/차량\s*자중[\s:：]*([\d,]+)\s*kg/);
  if (curbM) d.curb_weight_kg = toNum(curbM[1]);

  return d;
}
