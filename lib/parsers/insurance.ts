/**
 * 자동차보험증권 / 공제 가입증명서 범용 OCR 파서
 *
 * 대응 양식:
 *   - DB손해보험, 삼성화재, 현대해상, KB 등 일반 손보사 보험증권
 *   - 전국렌터카공제조합(KRMA) 가입증명서
 *   - 기타 공제조합(택시, 버스 등) 가입증명서
 *
 * 추출 필드:
 *   - 차량번호, 차명, 연식, 배기량, 정원
 *   - 보험사/공제조합, 증권번호/공제번호
 *   - 보험기간/공제기간(시작/종료)
 *   - 총보험료(총분담금), 납입보험료(납입분담금)
 *   - 운전가능연령/연령한정, 운전가능범위
 *   - 물적사고할증금액/물적할증특약(자기부담금)
 *   - 담보 내역(대인/대물/자기신체/무보험/자차 등)
 *   - 차량가액
 */

export interface InstallmentEntry {
  seq: number;          // 회차 (2~6)
  date: string;         // yyyy-mm-dd
  amount: number;       // 원
}

export interface InsuranceParsed {
  car_number: string;
  car_name: string;
  year: number | null;
  cc: number | null;
  seats: number | null;
  insurance_company: string;
  policy_no: string;
  start_date: string;
  end_date: string;
  premium: number;        // 총보험료 or 총분담금
  paid: number;           // 납입한 보험료 or 납입분담금
  age_limit: string;
  driver_range: string;
  deductible: number;     // 물적사고할증금액 or 물적할증특약
  coverage: string;       // 담보 요약
  car_value: number;      // 차량가액(만원→원)
  insured_name: string;   // 피보험자명
  insured_biz_no: string; // 피보험자 사업자등록번호
  doc_type: 'insurance' | 'mutual_aid';  // 보험증권 vs 공제
  installments: InstallmentEntry[];      // 분납 스케줄
  installment_method: string;            // 분납방법 (예: "6회 분납", "일시납" 등)
  auto_debit_bank: string;              // 자동이체 은행
  auto_debit_account: string;           // 자동이체 계좌 (마스킹된 상태)
}

/* ── 키워드 탐지 ─────────────────────── */

// 손보사 보험증권 키워드
const INS_KEYWORDS = [
  '자동차보험증권', '보험증권', '보험기간', '증권번호', '총보험료',
  '대인배상', '대물배상', '자기차량손해', '피보험자', '운전가능범위',
  '납입한 보험료', '프로미카', '가입담보', '차량가액',
];

// 공제조합 가입증명서 키워드
const AID_KEYWORDS = [
  '가입증명서', '공제번호', '공제기간', '총 분담금', '분담금',
  '피공제자', '렌터카공제', '공제조합', '납입분담금',
  '대인I', '대인II', '대물',
];

export function detectInsurance(text: string): boolean {
  const insScore = INS_KEYWORDS.filter((k) => text.includes(k)).length;
  const aidScore = AID_KEYWORDS.filter((k) => text.includes(k)).length;
  return insScore >= 3 || aidScore >= 3;
}

/** 보험증권인지 공제인지 판별 */
function detectDocType(text: string): 'insurance' | 'mutual_aid' {
  const aidScore = AID_KEYWORDS.filter((k) => text.includes(k)).length;
  const insScore = INS_KEYWORDS.filter((k) => text.includes(k)).length;
  return aidScore > insScore ? 'mutual_aid' : 'insurance';
}

/* ── 유틸 ─────────────────────────── */

const pad = (n: number | string) => String(n).padStart(2, '0');
const toNum = (s: string) => Number(String(s).replace(/[,\s]/g, ''));
const CAR_RE = /(\d{2,3}\s?[가-힣]\s?\d{4})/;

/* ── 공통: 차량번호 추출 ──────────────── */

function extractCarNumber(text: string): string {
  const patterns = [
    /차\s*량\s*번\s*호\s+(\d{2,3}\s?[가-힣]\s?\d{4})/,
    /차량\s*\(?\s*차대\s*\)?\s*번호\s*(\d{2,3}\s?[가-힣]\s?\d{4})/,
    CAR_RE,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].replace(/\s/g, '');
  }
  return '';
}

/* ── 공통: 보험기간/공제기간 추출 ────────── */

function extractPeriod(text: string): { start: string; end: string } {
  // "보험기간" 또는 "공제기간" 뒤의 날짜
  // 패턴1: "2026년 03월 14일 ~ 2027년 03월 14일"
  // 패턴2: "2026-01-09 16:17 부터 ~ 2027-01-09 24:00 까지"
  // 패턴3: "2026.03.14 ~ 2027.03.14"
  const patterns = [
    // yyyy년 mm월 dd일 ~ yyyy년 mm월 dd일
    /(?:보험|공제)\s*기\s*간\s+(\d{4})\s*[년.\-]\s*(\d{1,2})\s*[월.\-]\s*(\d{1,2})\s*일?\s*[\s\S]{0,20}?~\s*(\d{4})\s*[년.\-]\s*(\d{1,2})\s*[월.\-]\s*(\d{1,2})/,
    // yyyy-mm-dd HH:MM 부터 ~ yyyy-mm-dd HH:MM 까지
    /(?:보험|공제)\s*기\s*간\s+(\d{4})-(\d{2})-(\d{2})\s*[\d:]*\s*부터\s*~\s*(\d{4})-(\d{2})-(\d{2})/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      return {
        start: `${m[1]}-${pad(m[2])}-${pad(m[3])}`,
        end: `${m[4]}-${pad(m[5])}-${pad(m[6])}`,
      };
    }
  }
  return { start: '', end: '' };
}

/* ── 공통: 보험사/공제조합 추출 ────────── */

function extractCompany(text: string): string {
  // 공제조합
  if (/전국렌터카공제조합|렌터카공제|KRMA/.test(text)) return '전국렌터카공제조합';
  if (/택시공제|전국택시/.test(text)) return '전국택시공제조합';
  if (/버스공제|전국버스/.test(text)) return '전국버스공제조합';
  if (/화물공제|전국화물/.test(text)) return '전국화물공제조합';
  if (/개인택시공제/.test(text)) return '개인택시공제조합';

  // 일반 손보사
  const companies: [RegExp, string][] = [
    [/DB손해보험/, 'DB손해보험'],
    [/삼성화재/, '삼성화재'],
    [/현대해상/, '현대해상'],
    [/KB손해보험/, 'KB손해보험'],
    [/메리츠/, '메리츠화재'],
    [/한화손해/, '한화손해보험'],
    [/롯데손해/, '롯데손해보험'],
    [/흥국화재/, '흥국화재'],
    [/MG손해보험/, 'MG손해보험'],
    [/AXA손해보험|AXA/, 'AXA손해보험'],
    [/캐롯손해보험|캐롯/, '캐롯손해보험'],
    [/하나손해보험/, '하나손해보험'],
  ];
  for (const [re, name] of companies) {
    if (re.test(text)) return name;
  }

  // fallback
  const coMatch = text.match(/([\w가-힣]+손해보험|[\w가-힣]+화재)/);
  if (coMatch) return coMatch[1];
  return '';
}

/* ── 공통: 담보 추출 ─────────────────── */

function extractCoverage(text: string): string {
  const parts: string[] = [];

  // ── 대인Ⅰ ──
  if (/대인\s*[ⅠI1배]*\s*자배법/.test(text)) parts.push('대인1:법정');

  // ── 대인Ⅱ ──
  if (/대인\s*[ⅡII2배]*\s*(1인당\s*)?무한/.test(text)) parts.push('대인2:무한');
  else if (/대인\s*[ⅡII2배]*\s*미가입/.test(text)) parts.push('대인2:미가입');

  // ── 대물 ──
  // 손보: "1사고당 3억원 한도" / 공제: "1사고당 10,000 만원"
  const daemulM = text.match(/대\s*물\s*(?:배\s*상)?\s+1사고당\s*([\d,]+)\s*(억|만)\s*원/);
  if (daemulM) {
    if (daemulM[2] === '억') parts.push(`대물:${toNum(daemulM[1])}억`);
    else {
      const val = toNum(daemulM[1]);
      parts.push(`대물:${val >= 10000 ? val / 10000 + '억' : val + '만'}`);
    }
  } else {
    // "대물배상 1사고당 2천만원"
    const dm2 = text.match(/대\s*물\s*(?:배\s*상)?\s+1사고당\s*([\d,]+)\s*천만\s*원/);
    if (dm2) parts.push(`대물:${toNum(dm2[1])}천만`);
  }

  // ── 자기신체사고 ──
  if (/자기신체사고\s+미가입/.test(text)) {
    parts.push('자기신체:미가입');
  } else {
    // 손보: "1인당 사망/부상/장해 1억/5천/1억 한도"
    const bodyM = text.match(/자기신체사고\s+1인당\s*사망\/부상\/장해\s*([\d억천/]+)\s*한도/);
    if (bodyM) parts.push(`자기신체:${bodyM[1]}`);
    // 공제: "사망 / 후유장애(인당): 10,000 만원 부상(인당): 1,500 만원"
    const aidBodyM = text.match(/자기신체사고[\s\S]{0,80}?사망\s*\/?\s*후유장애\s*\(?\s*인당\s*\)?\s*[:：]?\s*([\d,]+)\s*만\s*원/);
    if (!bodyM && aidBodyM) parts.push(`자기신체:${toNum(aidBodyM[1])}만`);
  }

  // ── 자동차상해 (대인 상해 통합) ──
  const autoInjM = text.match(/자\s*동\s*차\s*상\s*해\s+1인당\s*사망\/부상\/장해\s*([\d억천/]+)\s*한도/);
  if (autoInjM) parts.push(`자동차상해:${autoInjM[1]}`);

  // ── 무보험차상해 ──
  if (/무보험(?:차상해)?\s+미가입/.test(text)) {
    parts.push('무보험:미가입');
  } else {
    // 손보: "1인당 2억원 한도"
    const uninsM = text.match(/무보험(?:차상해)?\s+1인당\s*([\d,]+)\s*(억|천만|만)\s*원/);
    if (uninsM) {
      if (uninsM[2] === '억') parts.push(`무보험:${toNum(uninsM[1])}억`);
      else if (uninsM[2] === '만') {
        const val = toNum(uninsM[1]);
        parts.push(`무보험:${val >= 10000 ? val / 10000 + '억' : val + '만'}`);
      } else parts.push(`무보험:${toNum(uninsM[1])}천만`);
    }
    // 공제: "1인당 최고20,000 만원"
    const aidUnins = text.match(/무보험\s+1인당\s*최고\s*([\d,]+)\s*만\s*원/);
    if (!uninsM && aidUnins) {
      const val = toNum(aidUnins[1]);
      parts.push(`무보험:${val >= 10000 ? val / 10000 + '억' : val + '만'}`);
    }
  }

  // ── 자기차량손해 ──
  if (/자기차량손해\s+미가입/.test(text)) {
    parts.push('자차:미가입');
  } else {
    const ownDmgM = text.match(/자기차량손해\s*\(?\s*단독포함\s*\)?\s*1사고당\s*([\d,]+)\s*만원/);
    if (ownDmgM) parts.push(`자차:${toNum(ownDmgM[1])}만`);
  }

  // ── 분담금할증한정 (공제 전용) ──
  const surchargeM = text.match(/분담금할증한정\s+([\d,]+\s*(?:억|만))/);
  if (surchargeM) parts.push(`할증한정:${surchargeM[1].replace(/\s/g, '')}`);

  return parts.join(',');
}

/* ── 분납 정보 추출 ───────────────────── */

function extractInstallments(text: string, d: InsuranceParsed): void {
  // ── 자동이체 은행/계좌 ──
  // 손보: "분납 자동이체 : 신한은행(통합) / 14001438**** / 스위치플랜(주)"
  const debitM = text.match(/(?:분납\s*)?자동이체\s*[:：]\s*([가-힣]+(?:은행|저축|금고|조합))\s*(?:\([^)]*\))?\s*\/\s*([\d*]+)/);
  if (debitM) {
    d.auto_debit_bank = debitM[1];
    d.auto_debit_account = debitM[2];
  }

  // ── 분납방법 ──
  // 공제: "비연속분납(6회납)" or "연속분납(6회납)"
  const methodM = text.match(/(비?연속분납\s*\(\s*\d+회납?\s*\)|일시납)/);
  if (methodM) {
    d.installment_method = methodM[1].replace(/\s/g, '');
  } else if (d.auto_debit_bank) {
    // 손보는 보통 6회 분납 (2~6회차 기재)
    d.installment_method = '분납';
  }

  // ── 분납보험료 스케줄 ──
  // 손보 패턴: "분납보험료: 2회차: 2026.04.14 / 77,300원, 3회차: 2026.05.14 / 77,300원, ..."
  // 한 줄 또는 여러 줄에 걸쳐 나올 수 있음
  const installRe = /(\d)\s*회차\s*[:：]?\s*(\d{4})[.\-/](\d{2})[.\-/](\d{2})\s*\/?\s*([\d,]+)\s*원/g;
  let m: RegExpExecArray | null;
  while ((m = installRe.exec(text)) !== null) {
    d.installments.push({
      seq: Number(m[1]),
      date: `${m[2]}-${m[3]}-${m[4]}`,
      amount: toNum(m[5]),
    });
  }

  // 중복 제거 + 정렬
  if (d.installments.length > 0) {
    const seen = new Set<number>();
    d.installments = d.installments
      .filter((i) => { if (seen.has(i.seq)) return false; seen.add(i.seq); return true; })
      .sort((a, b) => a.seq - b.seq);

    // 1회차 역산: 총보험료 - (2~6회차 합계) = 1회차
    const has1st = d.installments.some((i) => i.seq === 1);
    if (!has1st && d.premium > 0) {
      const laterSum = d.installments.reduce((s, i) => s + i.amount, 0);
      const firstAmount = d.premium - laterSum;
      if (firstAmount > 0) {
        d.installments.unshift({
          seq: 1,
          date: d.start_date,  // 1회차 = 보험시작일
          amount: firstAmount,
        });
      }
    }

    if (!d.installment_method) {
      d.installment_method = `${d.installments.length}회 분납`;
    }
  }

  // 분납 없고 총보험료 = 납입보험료면 일시납
  if (d.installments.length === 0 && d.premium > 0 && d.premium === d.paid) {
    d.installment_method = d.installment_method || '일시납';
  }
}

/* ══════════════════════════════════════
   메인 파서
   ══════════════════════════════════════ */

export function parseInsurance(text: string, _lines?: string[]): InsuranceParsed {
  const docType = detectDocType(text);

  const d: InsuranceParsed = {
    car_number: '', car_name: '', year: null, cc: null, seats: null,
    insurance_company: '', policy_no: '', start_date: '', end_date: '',
    premium: 0, paid: 0, age_limit: '', driver_range: '',
    deductible: 0, coverage: '', car_value: 0,
    insured_name: '', insured_biz_no: '',
    doc_type: docType,
    installments: [], installment_method: '',
    auto_debit_bank: '', auto_debit_account: '',
  };

  // ── 차량번호 ──
  d.car_number = extractCarNumber(text);

  // ── 피보험자명 + 사업자번호 ──
  // "피보험자 스위치플랜(주) / 158-81-*****" 또는 "피보험자 홍길동 / 123-45-67890"
  const insuredM = text.match(/피\s*보\s*험\s*자\s+([^\n/]+?)\s*\/\s*([\d*\-]+)/);
  if (insuredM) {
    d.insured_name = insuredM[1].trim();
    d.insured_biz_no = insuredM[2].trim();
  }

  // ── 차명 ──
  // 손보: "차명 스팅어 3.3 터보 정원 5 명"
  // 공제: "차 명 짚 어벤저"
  const carNameM = text.match(/차\s*명\s+([^\n]+?)(?:\s+정원|\s+\d+\s*명|\s+등록|$)/m);
  if (carNameM) d.car_name = carNameM[1].trim().replace(/\[.*\]/, '').trim();

  // ── 연식 ──
  const yearM = text.match(/(?:연\s*식|등\s*록\s*연\s*도)\s+(\d{4})\s*[년B]?/);
  if (yearM) d.year = Number(yearM[1]);

  // ── 배기량 ──
  const ccM = text.match(/배\s*기\s*량\s+([\d,]+)\s*CC/i);
  if (ccM) d.cc = toNum(ccM[1]);

  // ── 정원 ──
  const seatsM = text.match(/정\s*원\s+(\d+)\s*명/);
  if (seatsM) d.seats = Number(seatsM[1]);

  // ── 보험사/공제조합 ──
  d.insurance_company = extractCompany(text);

  // ── 증권번호/공제번호 ──
  const policyPatterns = [
    /증권\s*번호\s+([\d\-]+)/,
    /공\s*제\s*번\s*호\s+([A-Z]?\d[\d\-]+)/,
  ];
  for (const p of policyPatterns) {
    const m = text.match(p);
    if (m) { d.policy_no = m[1]; break; }
  }

  // ── 보험기간/공제기간 ──
  const period = extractPeriod(text);
  d.start_date = period.start;
  d.end_date = period.end;

  // ── 총보험료/총분담금 ──
  const premiumPatterns = [
    /총\s*보험료\s+([\d,]+)\s*원/,
    /총\s*분담금\s+([\d,]+)\s*원/,
  ];
  for (const p of premiumPatterns) {
    const m = text.match(p);
    if (m) { d.premium = toNum(m[1]); break; }
  }

  // ── 납입한 보험료/납입분담금 ──
  const paidPatterns = [
    /납입한\s*보험료\s+([\d,]+)\s*원/,
    /총\s*납입분담금\s+([\d,]+)\s*원/,
    /납입분담금\s+([\d,]+)\s*원/,
  ];
  for (const p of paidPatterns) {
    const m = text.match(p);
    if (m) { d.paid = toNum(m[1]); break; }
  }

  // ── 운전가능연령/연령한정 ──
  const agePatterns = [
    /운전가능연령\s+(만?\s*\d+세이상한정|전연령)/,
    /연령한정특약\s+(만?\s*\d+세이상)/,
    /(만\d+세이상한정)/,
    /(만\d+세이상)/,
  ];
  for (const p of agePatterns) {
    const m = text.match(p);
    if (m) { d.age_limit = m[1].replace(/\s/g, ''); break; }
  }

  // ── 운전가능범위 ──
  const rangeM = text.match(/운전가능범위\s+(누구나운전|임직원한정|가족한정|부부한정|1인한정)/);
  if (rangeM) d.driver_range = rangeM[1];

  // ── 물적사고할증금액/물적할증특약 (자기부담금) ──
  const deductPatterns = [
    /물적사고할증금액\s*[:：]?\s*([\d,]+)\s*만?\s*원/,
    /물적할증특약\s*[:：]?\s*([\d,]+)\s*만?\s*원/,
  ];
  for (const p of deductPatterns) {
    const m = text.match(p);
    if (m) {
      const raw = toNum(m[1]);
      d.deductible = raw < 10000 ? raw * 10000 : raw;
      break;
    }
  }

  // ── 차량가액 ──
  const carValM = text.match(/차량가액\s*\(?\s*부속가액\s*\)?\s+([\d,]+)\s*만원/);
  if (carValM) d.car_value = toNum(carValM[1]) * 10000;

  // ── 담보 ──
  d.coverage = extractCoverage(text);

  // ── 분납 정보 ──
  extractInstallments(text, d);

  return d;
}

/**
 * 멀티페이지 OCR 텍스트를 페이지별로 분리 → 각각 파싱
 * ocrFile()은 페이지 구분자로 "--- 페이지 구분 ---"을 넣어줌
 */
export function parseInsurancePages(fullText: string): InsuranceParsed[] {
  const pages = fullText.split(/---\s*페이지\s*구분\s*---/).filter((p) => p.trim().length > 50);
  const results: InsuranceParsed[] = [];

  for (const page of pages) {
    if (!detectInsurance(page)) continue;
    const parsed = parseInsurance(page);
    if (!parsed.car_number) continue;
    results.push(parsed);
  }

  return results;
}
