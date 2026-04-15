/**
 * schemas/bank-transaction.js — 통장 거래내역 스키마
 * 국민/신한/농협/우리/하나/기업/우체국/카카오뱅크/토스뱅크 등 공통
 */
export const BANK_TRANSACTION_SCHEMA = [
  // ── 계좌 ──
  { col: 'bank_name',     label: '은행',       section: '계좌', gridShow: true,
    type: 'select', options: ['국민','신한','우리','하나','기업','농협','우체국','카카오뱅크','토스뱅크','새마을','신협','SC제일','씨티','부산','대구','경남','광주','전북','제주','케이뱅크'], sample: '신한' },
  { col: 'account_no',    label: '계좌번호',   section: '계좌', gridShow: true, sample: '110-123-456789' },

  // ── 거래 ──
  { col: 'date',          label: '거래일시',   section: '거래', required: true, gridShow: true, type: 'date', sample: '2026-04-14' },
  { col: 'direction',     label: '구분',       section: '거래', required: true, gridShow: true,
    type: 'select', options: ['입금','출금'], sample: '입금' },
  { col: 'amount',        label: '금액',       section: '거래', required: true, gridShow: true, type: 'number', num: true, sample: '550000' },
  { col: 'balance',       label: '잔액',       section: '거래', type: 'number', num: true, sample: '12500000' },
  { col: 'counterparty',  label: '거래처/내용', section: '거래', gridShow: true, sample: '홍길동' },
  { col: 'summary',       label: '적요',       section: '거래', sample: '월렌트' },
  { col: 'memo',          label: '메모',       section: '거래', sample: '' },
  { col: 'branch',        label: '거래점',     section: '거래', sample: '강남지점' },

  // ── 분류 ──
  { col: 'category',      label: '분류',       section: '분류',
    type: 'select', options: ['대여료','할부금','보험료','정비비','세차비','유류비','통행료','주차비','과태료','탁송비','대리운전','수수료','인건비','임차료','세금','기타수입','기타지출'], sample: '대여료' },
  { col: 'matched_contract', label: '매칭계약', section: '분류', sample: 'C2024040001' },
  { col: 'matched_billing',  label: '매칭회차', section: '분류', sample: '1회차' },

  // ── 기타 ──
  { col: 'raw_key',       label: '원본키',     section: '기타', sample: '20260414-001' },
  { col: 'note',          label: '비고',       section: '기타', type: 'textarea', sample: '' },
];

export const BANK_TRANSACTION_SECTIONS = ['계좌', '거래', '분류', '기타'];
