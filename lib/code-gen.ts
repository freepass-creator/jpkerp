/**
 * 엔티티 코드 자동 생성.
 * 형식: XX00000 (약어 2글자 + 숫자 5자리 순번)
 * 예: CU00001, CT00042, AS00130
 *
 * 코드 체계:
 *   CU — 고객 (customer_code)
 *   CT — 계약 (contract_code)
 *   AS — 자산 (asset_code)
 *   BL — 청구 (billing_code)
 *   EV — 이벤트 (event_code)
 *   IN — 보험 (insurance_code)
 *   GP — GPS (gps_code)
 *   PT — 회원사 (partner_code)
 *   VD — 거래처 (vendor_code)
 *   LN — 할부 (loan_code)
 */

// 순번 카운터 (메모리 내, 앱 재시작 시 타임스탬프 기반 리셋)
const counters = new Map<string, number>();

function nextSeq(prefix: string): number {
  const cur = counters.get(prefix) ?? Math.floor(Date.now() % 100000);
  const next = cur + 1;
  counters.set(prefix, next);
  return next;
}

export type CodePrefix =
  | 'CU' | 'CT' | 'AS' | 'BL' | 'EV'
  | 'IN' | 'GP' | 'PT' | 'VD' | 'LN';

export function generateCode(prefix: CodePrefix): string {
  const seq = nextSeq(prefix);
  return `${prefix}${String(seq).padStart(5, '0')}`;
}

/** 편의 함수 */
export const genCustomerCode = () => generateCode('CU');
export const genContractCode = () => generateCode('CT');
export const genAssetCode = () => generateCode('AS');
export const genBillingCode = () => generateCode('BL');
export const genEventCode = () => generateCode('EV');
export const genInsuranceCode = () => generateCode('IN');
export const genGpsCode = () => generateCode('GP');
export const genPartnerCode = () => generateCode('PT');
export const genVendorCode = () => generateCode('VD');
export const genLoanCode = () => generateCode('LN');
