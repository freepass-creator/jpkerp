/**
 * schemas/finance.js — 재무 스키마
 *
 * 월별/항목별 매출·비용 원장
 * 수납/입출금에서 자동 집계 or 직접입력
 */
export const FINANCE_SCHEMA = [
  // ── 기본 ──
  { col: 'partner_code',   label: '회원사코드',   section: '기본', sample: 'MEM001' },
  { col: 'year',           label: '연도',         section: '기본', required: true, gridShow: true, type: 'number', num: true, sample: '2024' },
  { col: 'month',          label: '월',           section: '기본', required: true, gridShow: true, type: 'number', num: true, sample: '4' },
  { col: 'date',           label: '일자',         section: '기본', type: 'date', gridShow: true, sample: '2024-04-25' },

  // ── 분류 ──
  { col: 'direction',      label: '구분',         section: '분류', required: true, gridShow: true,
    type: 'select', options: ['매출','비용'], sample: '매출' },
  { col: 'category',       label: '계정',         section: '분류', required: true, gridShow: true,
    type: 'select', options: [
      '대여료수입','보증금','위약금','기타수입',
      '할부이자','리스료','보험료','정비비','세차비','유류비','탁송비','과태료','통행료','주차비',
      '인건비','임차료','공과금','세금','법무비','수수료','기타지출',
    ], sample: '대여료수입' },
  { col: 'account',        label: '세부계정',     section: '분류', sample: '월렌트 4월분' },

  // ── 대상 ──
  { col: 'car_number',     label: '차량번호',     section: '대상', gridShow: true, sample: '123가4567' },
  { col: 'contract_code',  label: '계약코드',     section: '대상', sample: 'C2024040001' },
  { col: 'customer_name',  label: '고객명',       section: '대상', sample: '홍길동' },
  { col: 'vendor_name',    label: '거래처',       section: '대상', sample: '' },

  // ── 금액 ──
  { col: 'amount',         label: '금액',         section: '금액', required: true, gridShow: true, type: 'number', num: true, sample: '550000' },
  { col: 'vat',            label: '부가세',       section: '금액', type: 'number', num: true, sample: '50000' },
  { col: 'tax_type',       label: '세금구분',     section: '금액',
    type: 'select', options: ['과세','영세','면세','기타'], sample: '과세' },

  // ── 결제 ──
  { col: 'payment_method', label: '결제방법',     section: '결제',
    type: 'select', options: ['현금','계좌이체','카드','자동이체','CMS','기타'], sample: '자동이체' },
  { col: 'bank_account',   label: '계좌',         section: '결제', sample: '신한 110-123-456789' },
  { col: 'payment_status', label: '입/출금상태',  section: '결제',
    type: 'select', options: ['확정','예정','미확정'], sample: '확정' },

  // ── 증빙 ──
  { col: 'voucher_no',     label: '전표번호',     section: '증빙', sample: 'V202404001' },
  { col: 'tax_invoice',    label: '세금계산서',   section: '증빙', sample: '발행완료' },
  { col: 'note',           label: '비고',         section: '증빙', type: 'textarea', sample: '' },
];

export const FINANCE_SECTIONS = ['기본', '분류', '대상', '금액', '결제', '증빙'];
