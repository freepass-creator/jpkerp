/**
 * schemas/cms-summary.js — CMS 정산 요약 (정산 건별)
 *
 * CMS 업체/결제원에서 월별/정산일별로 제공하는 정산 요약 데이터
 * 은행 입금 1건 = 여기 정산 1행과 매칭
 *
 * 검증용: 통장 실정산금액 = 여기 실정산금액
 */
export const CMS_SUMMARY_SCHEMA = [
  // ── 정산 기본 ──
  { col: 'seq_no',         label: 'NO',         section: '기본', type: 'number', num: true, sample: '1' },
  { col: 'payment_date',   label: '결제일',     section: '기본', required: true, gridShow: true, type: 'date', sample: '2024-04-25' },
  { col: 'payment_method', label: '결제수단',   section: '기본', required: true, gridShow: true,
    type: 'select', options: ['CMS','카드','체크카드','계좌이체','기타'], sample: 'CMS' },
  { col: 'settle_date',    label: '정산일',     section: '기본', type: 'date', gridShow: true, sample: '2024-04-26' },
  { col: 'settle_type',    label: '구분',       section: '기본',
    type: 'select', options: ['결제','취소','환불','조정'], sample: '결제' },

  // ── 금액 ──
  { col: 'gross_amount',   label: '결제금액',   section: '금액', type: 'number', num: true, gridShow: true, sample: '5500000' },
  { col: 'total_fee',      label: '총수수료',   section: '금액', type: 'number', num: true, gridShow: true, sample: '3000' },
  { col: 'settled_amount', label: '정산금액',   section: '금액', type: 'number', num: true, sample: '5497000' },
  { col: 'deduction',      label: '공제금액',   section: '금액', type: 'number', num: true, sample: '0' },
  { col: 'actual_amount',  label: '실정산금액', section: '금액', type: 'number', num: true, gridShow: true, sample: '5497000' },

  // ── 건수 ──
  { col: 'request_count',  label: '의뢰건수',   section: '건수', type: 'number', num: true, gridShow: true, sample: '10' },
  { col: 'payment_count',  label: '결제건수',   section: '건수', type: 'number', num: true, gridShow: true, sample: '10' },
  { col: 'settle_status',  label: '정산여부',   section: '건수', gridShow: true,
    type: 'select', options: ['완료','진행중','보류','취소'], sample: '완료' },

  // ── 수수료 상세 ──
  { col: 'request_fee',    label: '의뢰수수료', section: '수수료', type: 'number', num: true, sample: '1000' },
  { col: 'payment_fee',    label: '결제수수료', section: '수수료', type: 'number', num: true, sample: '2000' },
  { col: 'vat',            label: '부가세',     section: '수수료', type: 'number', num: true, sample: '300' },

  // ── 기타 ──
  { col: 'vendor',         label: 'CMS업체',    section: '기타', sample: '금융결제원' },
  { col: 'bank_account',   label: '입금계좌',   section: '기타', sample: '신한 110-123-456789' },
  { col: 'matched_bank_txn', label: '매칭통장', section: '기타', sample: '' },
  { col: 'note',           label: '비고',       section: '기타', type: 'textarea', sample: '' },
];

export const CMS_SUMMARY_SECTIONS = ['기본', '금액', '건수', '수수료', '기타'];
