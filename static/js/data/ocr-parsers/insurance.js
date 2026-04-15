/**
 * ocr-parsers/insurance.js — 자동차보험증권 OCR 파서
 *
 * 대상: DB손해보험 프로미카다이렉트 등 국내 자동차보험증권 PDF
 */

export function detect(text) {
  const keywords = ['자동차보험증권', '증권번호', '피보험자', '보험기간', '대인배상', '대물배상', '자기신체사고', '무보험차상해'];
  return keywords.filter(k => text.includes(k)).length >= 3;
}

export function parse(text, lines) {
  const data = {
    // 기본
    policy_no: '', insurance_company: '', insurance_product: '', insurance_type: '',
    start_date: '', end_date: '',
    // 계약자/피보험자
    policyholder_name: '', policyholder_biz_no: '',
    insured_name: '', insured_biz_no: '',
    // 차량
    car_number: '', vin: '', car_year: '', car_model: '', car_type: '',
    engine_cc: 0, seat_capacity: 0, car_value: 0, accessory_value: 0, accessories: '',
    // 운전자
    driver_range: '', age_limit: '', min_age_driver: '',
    experience_driver_1: '', experience_driver_2: '',
    // 담보
    coverage_liability_1: '', coverage_liability_2: '',
    coverage_property: '', coverage_self_injury: '',
    coverage_uninsured: '', coverage_self_damage: '',
    sos_count: 0, sos_tow_km: 0,
    // 특약
    special_terms: [], deductible_amount: 0,
    // 납부
    total_premium: 0, paid_amount: 0,
    payment_bank: '', payment_account: '', payment_holder: '',
    installment_count: 0, installments: [],
    // 기타
    contact_email: '', branch: '', agent: '',
    note: '',
  };

  // ── 보험사 (상단 로고/상호 영역) ──
  const companyMatch = text.match(/(DB손해보험|삼성화재|현대해상|KB손해보험|메리츠화재|한화손해보험|롯데손해보험|AXA|MG손해보험|캐롯|하나손해보험)/);
  if (companyMatch) data.insurance_company = companyMatch[1];

  // ── 상품명 ──
  const productMatch = text.match(/(프로미카\S+자동차보험|다이렉트\S*자동차보험|\S{2,}자동차보험)/);
  if (productMatch) data.insurance_product = productMatch[1];

  // ── 보험유형 추정 ──
  if (/업무용/.test(text)) data.insurance_type = '업무용';
  else if (/개인용/.test(text)) data.insurance_type = '개인용';
  else if (/영업용/.test(text)) data.insurance_type = '영업용';
  else if (/책임/.test(text)) data.insurance_type = '책임보험';
  else data.insurance_type = '종합보험';

  // ── 증권번호 (예: 2-2026-1543994-000) ──
  const policyMatch = text.match(/증권\s*번\s*호\s*[:：]?\s*([\d\-]{10,})/);
  if (policyMatch) data.policy_no = policyMatch[1].trim();

  // ── 보험기간 ──
  const periodMatch = text.match(/보험\s*기\s*간\s*[:：]?\s*(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*[~～-]\s*(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (periodMatch) {
    data.start_date = `${periodMatch[1]}-${pad(periodMatch[2])}-${pad(periodMatch[3])}`;
    data.end_date = `${periodMatch[4]}-${pad(periodMatch[5])}-${pad(periodMatch[6])}`;
  }

  // ── 피보험자 / 계약자 ──
  // "피보험자 스위치플랜(주) / 158-81-*****"
  const insuredMatch = text.match(/피\s*보\s*험\s*자\s*([^\n/]+?)\s*\/\s*([\d\-*]+)/);
  if (insuredMatch) {
    data.insured_name = insuredMatch[1].trim();
    data.insured_biz_no = insuredMatch[2].trim();
  }
  const holderMatch = text.match(/계\s*약\s*자\s*([^\n/]+?)\s*\/\s*([\d\-*]+)/);
  if (holderMatch) {
    data.policyholder_name = holderMatch[1].trim();
    data.policyholder_biz_no = holderMatch[2].trim();
  }

  // ── 차량번호 ──
  const carMatch = text.match(/차량\(?차대\)?번호\s*([\d]{2,3}[가-힣]\s?\d{4})/);
  if (carMatch) data.car_number = carMatch[1].replace(/\s/g, '');
  if (!data.car_number) {
    const cm = text.match(/(\d{2,3}[가-힣]\s?\d{4})/);
    if (cm) data.car_number = cm[1].replace(/\s/g, '');
  }

  // ── 차대번호 VIN ──
  const vinMatch = text.match(/[A-HJ-NPR-Z0-9]{17}/);
  if (vinMatch) data.vin = vinMatch[0];

  // ── 연식 ──
  const yearMatch = text.match(/연\s*식\s*(\d{4})/);
  if (yearMatch) data.car_year = yearMatch[1];

  // ── 차명 ──
  const modelMatch = text.match(/차\s*명\s*([^\n]+?)(?:\s*정\s*원|\s*\n)/);
  if (modelMatch) data.car_model = modelMatch[1].trim();

  // ── 정원 ──
  const seatMatch = text.match(/정\s*원\s*(\d+)\s*명/);
  if (seatMatch) data.seat_capacity = Number(seatMatch[1]);

  // ── 차종 ──
  const typeMatch = text.match(/차\s*종\s*([^\n]+?)(?:\s*배\s*기\s*량|\s*\n)/);
  if (typeMatch) data.car_type = typeMatch[1].trim();

  // ── 배기량 ──
  const ccMatch = text.match(/배\s*기\s*량\s*([\d,]+)\s*CC/i);
  if (ccMatch) data.engine_cc = toNum(ccMatch[1]);

  // ── 차량가액 / 부속가액 ──
  // "차량가액(부속가액) 1,331 만원(20만원)"
  const valueMatch = text.match(/차량가액\(?부속가액\)?\s*([\d,]+)\s*만원\s*\(\s*([\d,]+)\s*만원\s*\)/);
  if (valueMatch) {
    data.car_value = toNum(valueMatch[1]) * 10000;
    data.accessory_value = toNum(valueMatch[2]) * 10000;
  }

  // ── 부속품 ──
  const accMatch = text.match(/부\s*속\s*품\s*([^\n]+?)(?:\n|가입담보)/);
  if (accMatch) data.accessories = accMatch[1].trim();

  // ── 운전가능범위 ──
  const driverMatch = text.match(/운전가능범위\s*([^\n]+?)(?:\s*운전가능연령|\n)/);
  if (driverMatch) data.driver_range = driverMatch[1].trim();

  // ── 운전가능연령 ──
  const ageMatch = text.match(/운전가능연령\s*([^\n]+?)(?:\n|$)/);
  if (ageMatch) data.age_limit = ageMatch[1].trim();

  // ── 물적사고할증금액 ──
  const surMatch = text.match(/물적사고할증금액\s*[:：]?\s*([\d,]+)\s*만원/);
  if (surMatch) data.deductible_amount = toNum(surMatch[1]) * 10000;

  // ── 담보별 보상한도 ──
  // 대인배상Ⅰ
  const li1 = afterLabel(text, /대\s*인\s*배\s*상\s*[1IⅠ]/);
  if (li1) data.coverage_liability_1 = li1;
  // 대인배상Ⅱ
  const li2 = afterLabel(text, /대\s*인\s*배\s*상\s*[2IⅡ]{1,2}/);
  if (li2) data.coverage_liability_2 = li2;
  // 대물배상
  const prop = afterLabel(text, /대\s*물\s*배\s*상/);
  if (prop) data.coverage_property = prop;
  // 자기신체사고
  const si = afterLabel(text, /자기신체사고/);
  if (si) data.coverage_self_injury = si;
  // 무보험차상해
  const un = afterLabel(text, /무보험차상해/);
  if (un) data.coverage_uninsured = un;
  // 자기차량손해
  const sd = afterLabel(text, /자기차량손해/);
  if (sd) data.coverage_self_damage = sd;

  // ── 긴급출동 ──
  const sosMatch = text.match(/긴급출동서비스\s*\(?\s*(\d+)\s*\)?\s*회\s*,?\s*긴급견인\s*\(?\s*(\d+)\s*[Kk][Mm]\s*\)?/);
  if (sosMatch) {
    data.sos_count = Number(sosMatch[1]);
    data.sos_tow_km = Number(sosMatch[2]);
  }

  // ── 특별약관/특약 ──
  // "특별약관" 헤더 뒤에 나열된 항목들 수집
  const specialIdx = lines.findIndex(l => /특\s*별\s*약\s*관|특\s*별\s*요\s*율/.test(l));
  if (specialIdx >= 0) {
    const terms = new Set();
    const known = ['자동변속기특별요율','에어백2개특별요율','ABS장착특별요율','만21세이상한정','만26세이상한정','만30세이상한정','누구나운전','가족한정','부부한정','블랙박스','Ever Green','유상운송','품질인증부품(신)','품질인증부품','어라운드뷰','후측방충돌경고장치','헤드업디스플레이','자녀할인','마일리지','마일리지특약'];
    for (const k of known) if (text.includes(k)) terms.add(k);
    data.special_terms = Array.from(terms);
  }

  // ── 납입한 보험료 / 총보험료 ──
  const paidMatch = text.match(/납입한\s*보험료\s*([\d,]+)\s*원/);
  if (paidMatch) data.paid_amount = toNum(paidMatch[1]);
  const totalMatch = text.match(/총\s*보험료\s*([\d,]+)\s*원/);
  if (totalMatch) data.total_premium = toNum(totalMatch[1]);

  // ── 분납 자동이체 계좌 ──
  // "분납 자동이체 : 신한은행(통합) / 14001438**** / 스위치플랜(주)"
  const autoMatch = text.match(/분납\s*자동이체\s*[:：]?\s*([^\s/]+?(?:은행)?(?:\([^)]+\))?)\s*\/\s*([\d\-*]+)\s*\/\s*([^\n]+)/);
  if (autoMatch) {
    data.payment_bank = autoMatch[1].trim();
    data.payment_account = autoMatch[2].trim();
    data.payment_holder = autoMatch[3].trim().replace(/\s*-\s*분납보험료.*$/, '');
  }

  // ── 분납보험료 스케줄 ──
  // "2회차: 2026.04.14 / 77,300원, 3회차: 2026.05.14 / 77,300원, ..."
  const instRe = /(\d+)\s*회\s*차\s*[:：]?\s*(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})\s*\/\s*([\d,]+)\s*원/g;
  let im;
  while ((im = instRe.exec(text)) !== null) {
    data.installments.push({
      seq: Number(im[1]),
      date: `${im[2]}-${pad(im[3])}-${pad(im[4])}`,
      amount: toNum(im[5]),
    });
  }
  if (data.installments.length) {
    // 1회차(선납분) 자동 보정: 비고에는 보통 2회차부터 표기됨
    // 1회차가 없고 납입한 보험료 + 보험시작일이 있으면 1회차로 prepend
    const hasFirst = data.installments.some(x => x.seq === 1);
    if (!hasFirst && data.paid_amount && data.start_date) {
      data.installments.unshift({
        seq: 1,
        date: data.start_date,
        amount: data.paid_amount,
      });
    }
    data.installments.sort((a, b) => a.seq - b.seq);
    const maxSeq = Math.max(...data.installments.map(x => x.seq));
    data.installment_count = maxSeq;  // 마지막 회차 = 총 회차 수
  }

  // ── 계약자 이메일 ──
  const emailMatch = text.match(/E-?mail\s*\(?\s*([A-Za-z0-9*._-]+@[A-Za-z0-9.-]+)\s*\)?/i);
  if (emailMatch) data.contact_email = emailMatch[1];

  // ── 계약지점 / 담당자 ──
  const branchMatch = text.match(/계약지점\s*([^\n]+?)(?:\n|담당자)/);
  if (branchMatch) data.branch = branchMatch[1].trim();
  const agentMatch = text.match(/담\s*당\s*자\s*([^\n]+?)(?:\n|고객상담)/);
  if (agentMatch) data.agent = agentMatch[1].trim();

  // ── note 요약 (그리드 표시용) ──
  const noteParts = [];
  if (data.coverage_liability_2) noteParts.push(`대인II ${data.coverage_liability_2}`);
  if (data.coverage_property) noteParts.push(`대물 ${data.coverage_property}`);
  if (data.coverage_self_damage && data.coverage_self_damage !== '미가입') noteParts.push(`자차 ${data.coverage_self_damage}`);
  if (data.installment_count) noteParts.push(`분납 ${data.installment_count}회`);
  if (data.special_terms.length) noteParts.push(`특약 ${data.special_terms.length}종`);
  data.note = noteParts.join(' / ');

  return data;
}

// ─── 유틸 ───────────────────────────────────────────

/** 라벨 뒤에 붙은 값을 한 줄 범위에서 추출 */
function afterLabel(text, labelRe) {
  const src = labelRe.source;
  const re = new RegExp(`${src}\\s*([^\\n]+?)(?:\\n|$)`, 'm');
  const m = text.match(re);
  if (!m) return '';
  return m[1].trim().replace(/\s{2,}/g, ' ');
}

function pad(n) { return String(n).padStart(2, '0'); }
function toNum(s) { return Number(String(s).replace(/,/g, '')); }
