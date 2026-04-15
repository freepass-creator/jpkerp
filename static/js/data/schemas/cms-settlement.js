/**
 * schemas/cms-settlement.js — CMS 집금내역서 스키마
 *
 * 은행/결제원에서 제공하는 자동이체 처리결과 명세서
 * 업로드하면 각 건별로 성공/실패 + 수수료 + 실입금액 확정
 */
export const CMS_SETTLEMENT_SCHEMA = [
  { col: 'process_date',   label: '처리일자',   section: '기본', required: true, gridShow: true, type: 'date', sample: '2024-04-25' },
  { col: 'customer_name',  label: '고객명',     section: '기본', required: true, gridShow: true, sample: '홍길동' },
  { col: 'account_no',     label: '계좌번호',   section: '기본', gridShow: true, sample: '110-123-456789' },
  { col: 'bank_name',      label: '은행',       section: '기본', sample: '신한' },

  { col: 'scheduled_amount', label: '이체예정액', section: '이체', required: true, gridShow: true, type: 'number', num: true, sample: '550000' },
  { col: 'result',         label: '처리결과',   section: '이체', required: true, gridShow: true,
    type: 'select', options: ['성공','실패','보류'], sample: '성공' },
  { col: 'fee',            label: '수수료',     section: '이체', type: 'number', num: true, gridShow: true, sample: '300' },
  { col: 'actual_amount',  label: '실입금액',   section: '이체', type: 'number', num: true, gridShow: true, sample: '549700' },

  { col: 'fail_reason',    label: '실패사유',   section: '실패', gridShow: true,
    type: 'select', options: ['잔액부족','계좌없음','계좌해지','출금정지','한도초과','본인명의아님','기타'], sample: '' },
  { col: 'retry_date',     label: '재시도일',   section: '실패', type: 'date', sample: '' },

  { col: 'contract_code',  label: '계약코드',   section: '매칭', sample: 'C2024040001' },
  { col: 'autodebit_id',   label: '자동이체ID', section: '매칭', sample: 'AD001' },
  { col: 'billing_id',     label: '수납회차ID', section: '매칭', sample: 'B001-01' },

  { col: 'note',           label: '비고',       section: '기타', type: 'textarea', sample: '' },
];

export const CMS_SETTLEMENT_SECTIONS = ['기본', '이체', '실패', '매칭', '기타'];
