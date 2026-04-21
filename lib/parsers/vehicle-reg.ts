/**
 * 자동차등록증 OCR 파서
 *
 * 등록증에서 추출:
 *   - 차량번호, 차대번호(VIN), 차명, 형식번호, 제작연월
 *   - 배기량, 연료, 승차정원, 차종, 용도
 *   - 최초등록일, 소유자, 사용본거지
 *   - 검사유효기간, 길이/너비/높이, 총중량
 *   - 원동기형식
 */

export interface VehicleRegParsed {
  car_number: string;
  vin: string;
  car_name: string;          // 차명 원본 (제조사+모델 합쳐진 것)
  type_number: string;       // 형식번호 (NKC90D 등)
  engine_type: string;       // 원동기형식 (D4HB 등)
  car_year: number | null;   // 제작연월에서 추출
  category_hint: string;     // 차종 (대형 승용 등)
  usage_type: string;        // 용도 (자가용/렌터카 등)
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
  '하이브리드': '하이브리드',
};

export function detectVehicleReg(text: string): boolean {
  const keywords = ['자동차등록증', '자동차등록번호', '차대번호', '형식 및 제작연월', '승차정원', '배기량', '원동기형식'];
  return keywords.filter((k) => text.includes(k)).length >= 3;
}

export function parseVehicleReg(text: string, lines: string[]): VehicleRegParsed {
  const d: VehicleRegParsed = {
    car_number: '', vin: '', car_name: '', type_number: '', engine_type: '',
    car_year: null, category_hint: '', usage_type: '', seats: null,
    displacement: null, fuel_type: '', first_registration_date: '',
    owner_name: '', owner_biz_no: '', address: '',
    length_mm: null, width_mm: null,
    height_mm: null, gross_weight_kg: null, curb_weight_kg: null,
  };

  // 자동차등록번호 (차량번호)
  const carNum = text.match(/자동차등록번호\s*([\d가-힣\s]{4,10})/);
  if (carNum) d.car_number = carNum[1].replace(/\s/g, '');
  if (!d.car_number) {
    const cn = text.match(/(\d{2,3}\s?[가-힣]\s?\d{4})/);
    if (cn) d.car_number = cn[1].replace(/\s/g, '');
  }

  // 차대번호 (VIN 17자리)
  const vin = text.match(/차\s*대\s*번\s*호\s*([A-HJ-NPR-Z0-9]{17})/);
  if (vin) d.vin = vin[1];
  if (!d.vin) {
    const v = text.match(/([A-HJ-NPR-Z0-9]{17})/);
    if (v) d.vin = v[1];
  }

  // 차명
  const carName = text.match(/차\s*명\s+(.+?)(?:\s*형식|$)/m);
  if (carName) d.car_name = carName[1].trim();
  if (!d.car_name) {
    // "④ 차 명" 패턴
    const cn2 = text.match(/차\s*명\s+([^\n]+)/);
    if (cn2) d.car_name = cn2[1].trim().replace(/\s*형식.*$/, '').trim();
  }

  // 형식 및 제작연월
  const typeNum = text.match(/형식\s*(?:및\s*)?제작연월\s*([A-Z0-9]+)/i);
  if (typeNum) d.type_number = typeNum[1];

  // 제작연월 → car_year
  const prodDate = text.match(/제작연월\s*[A-Z0-9]*\s*(\d{4})\s*[-./]\s*(\d{1,2})/);
  if (prodDate) d.car_year = Number(prodDate[1]);
  if (!d.car_year) {
    const pd2 = text.match(/제작연월\s*\S+\s*(\d{4})/);
    if (pd2) d.car_year = Number(pd2[1]);
  }

  // 원동기형식
  const engine = text.match(/원동기\s*형식\s*([A-Z0-9\-]+)/i);
  if (engine) d.engine_type = engine[1];

  // 차종 (대형 승용, 소형 승합 등)
  const category = text.match(/차\s*종\s+((?:대형|중형|소형|경형)\s*(?:승용|승합|화물|특수))/);
  if (category) d.category_hint = category[1].replace(/\s/g, ' ');

  // 용도 — 차량번호 한글로 판별 (하허호 = 렌터카, 나머지 = 자가용)
  if (d.car_number) {
    const hangul = d.car_number.match(/[가-힣]/);
    d.usage_type = hangul && '하허호'.includes(hangul[0]) ? '렌터카' : '자가용';
  }

  // 승차정원
  const seats = text.match(/승차정원\s*(\d+)\s*명/);
  if (seats) d.seats = Number(seats[1]);

  // 배기량
  const disp = text.match(/배기량[^0-9]*(\d[\d,]+)/);
  if (disp) d.displacement = toNum(disp[1]);

  // 연료
  const fuel = text.match(/연료[의\s]*종류[^가-힣]*(경유|휘발유|가솔린|디젤|LPG|전기|수소|하이브리드)/i);
  if (fuel) d.fuel_type = FUEL_ALIAS[fuel[1]] || fuel[1];
  if (!d.fuel_type) {
    const f2 = text.match(/(경유|휘발유|가솔린|디젤|LPG|전기|수소)/);
    if (f2) d.fuel_type = FUEL_ALIAS[f2[1]] || f2[1];
  }

  // 최초등록일
  const regDate = text.match(/최초등록일\s*[:：]?\s*(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (regDate) d.first_registration_date = `${regDate[1]}-${pad(regDate[2])}-${pad(regDate[3])}`;

  // 소유자
  const owner = text.match(/성명\s*\(?\s*명칭\s*\)?\s*(.+?)(?:\s*생년월일|$)/m);
  if (owner) d.owner_name = owner[1].trim();

  // 법인번호/사업자번호
  const bizNo = text.match(/법인등록번호\)?\s*(\d{6}[\s-]*\d{7})/);
  if (bizNo) d.owner_biz_no = bizNo[1].replace(/\s/g, '');

  // 사용본거지
  const addr = text.match(/사용본거지\s+(.+?)(?:\n|$)/m);
  if (addr) d.address = addr[1].trim();

  // 길이/너비/높이
  const len = text.match(/길\s*이\s*(\d[\d,]+)\s*mm/);
  if (len) d.length_mm = toNum(len[1]);
  const wid = text.match(/너\s*비\s*(\d[\d,]+)\s*mm/);
  if (wid) d.width_mm = toNum(wid[1]);
  const hei = text.match(/높\s*이\s*(\d[\d,]+)\s*mm/);
  if (hei) d.height_mm = toNum(hei[1]);

  // 총중량
  const gross = text.match(/총중량\s*(\d[\d,]+)\s*kg/);
  if (gross) d.gross_weight_kg = toNum(gross[1]);

  return d;
}
