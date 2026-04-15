/**
 * schemas/loan.js — 할부 스키마
 */
export const LOAN_SCHEMA = [
  // ── 핵심 ──
  { col: 'partner_code',    label: '회원사코드', section: '핵심', required: true, gridShow: true, sample: 'CP01' },
  { col: 'car_number',      label: '차량번호',   section: '핵심', required: true, gridShow: true, sample: '123가4567' },
  { col: 'vin',             label: '차대번호',   section: '핵심', gridShow: true, sample: 'KMHD341DBNU123456' },
  { col: 'loan_company',    label: '금융사',     section: '핵심', required: true, gridShow: true, sample: '현대캐피탈' },
  { col: 'loan_principal',  label: '원금',       section: '핵심', type: 'number', num: true, gridShow: true, sample: '18000000' },
  { col: 'loan_balance',    label: '잔여원금',   section: '핵심', type: 'number', num: true, gridShow: true, sample: '17500000' },
  { col: 'loan_months',     label: '할부기간(개월)', section: '핵심', type: 'number', num: true, gridShow: true, sample: '48' },
  { col: 'loan_rate',       label: '금리(%)',    section: '핵심', type: 'number', num: true, gridShow: true, sample: '5.9' },
  { col: 'loan_end_date',   label: '만기일',     section: '핵심', type: 'date', gridShow: true, sample: '2028-03-25' },
  { col: 'status',          label: '상태',       section: '핵심', gridShow: true,
    type: 'select', options: ['상환중','완납','중도상환','연체'], sample: '상환중' },

  // ── 조건 ──
  { col: 'loan_product',     label: '상품명',           section: '조건', sample: '법인할부 48개월' },
  { col: 'loan_contract_no', label: '대출계약번호',     section: '조건', sample: 'HC2024040001' },
  { col: 'loan_down_payment',label: '선수금',           section: '조건', type: 'number', num: true, sample: '5000000' },
  { col: 'loan_method',      label: '대출방식',         section: '조건', type: 'select', options: ['원리금균등','원금균등','만기일시'], sample: '원리금균등' },
  { col: 'loan_start_date',  label: '초회차 납입일',    section: '조건', type: 'date', sample: '2024-04-25' },
  { col: 'loan_account',     label: '출금계좌',         section: '조건', sample: '신한 110-123-456789' },
  { col: 'loan_prepay_fee_pct', label: '중도상환 수수료(%)', section: '조건', type: 'number', num: true, sample: '2' },

  // ── 메모 ──
  { col: 'note', label: '비고', section: '메모', type: 'textarea', sample: '' },
];

export const LOAN_SECTIONS = ['핵심', '조건', '메모'];
