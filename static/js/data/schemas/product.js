/**
 * schemas/product.js — 상품 스키마
 *
 * 렌터카 상품 정의 (월렌트/단기/장기/리스/카셰어링 등)
 */
export const PRODUCT_SCHEMA = [
  // ── 기본 ──
  { col: 'partner_code',   label: '회원사코드',   section: '기본', sample: 'MEM001' },
  { col: 'product_code',   label: '상품코드',     section: '기본', required: true, gridShow: true, readonly: true, sample: 'PR001' },
  { col: 'product_name',   label: '상품명',       section: '기본', required: true, gridShow: true, sample: '월렌트 36개월' },
  { col: 'product_type',   label: '상품유형',     section: '기본', required: true, gridShow: true,
    type: 'select', options: ['월렌트','단기렌트','장기렌트','리스','카셰어링','법인계약','기타'], sample: '월렌트' },

  // ── 조건 ──
  { col: 'min_months',     label: '최소계약기간(개월)', section: '조건', type: 'number', num: true, sample: '12' },
  { col: 'max_months',     label: '최대계약기간(개월)', section: '조건', type: 'number', num: true, sample: '60' },
  { col: 'mileage_limit',  label: '주행거리제한(km/월)', section: '조건', type: 'number', num: true, sample: '2000' },
  { col: 'extra_mileage_fee', label: '초과주행요금(원/km)', section: '조건', type: 'number', num: true, sample: '100' },

  // ── 금액 ──
  { col: 'base_rent',      label: '기본대여료',   section: '금액', type: 'number', num: true, gridShow: true, sample: '550000' },
  { col: 'deposit',        label: '보증금',       section: '금액', type: 'number', num: true, sample: '3000000' },
  { col: 'payment_cycle',  label: '결제주기',     section: '금액',
    type: 'select', options: ['월납','분기납','반년납','연납','일시납'], sample: '월납' },

  // ── 보험/정비 ──
  { col: 'insurance_included', label: '보험포함',     section: '보험정비',
    type: 'select', options: ['포함','미포함'], sample: '포함' },
  { col: 'maintenance_included', label: '정비포함',   section: '보험정비',
    type: 'select', options: ['포함','미포함','일부포함'], sample: '일부포함' },
  { col: 'maintenance_scope', label: '정비범위',     section: '보험정비', sample: '엔진오일/소모품' },

  // ── 상태 ──
  { col: 'status',         label: '상태',         section: '상태', gridShow: true,
    type: 'select', options: ['판매중','판매중지','단종'], sample: '판매중' },
  { col: 'start_date',     label: '판매시작일',   section: '상태', type: 'date', sample: '2024-04-01' },
  { col: 'end_date',       label: '판매종료일',   section: '상태', type: 'date', sample: '' },
  { col: 'note',           label: '비고',         section: '상태', type: 'textarea', sample: '' },
];

export const PRODUCT_SECTIONS = ['기본', '조건', '금액', '보험정비', '상태'];
