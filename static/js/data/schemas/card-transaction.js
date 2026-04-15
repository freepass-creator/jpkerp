/**
 * schemas/card-transaction.js — 카드 이용내역 스키마
 * 법인/개인 / 신한·국민·삼성·현대·롯데카드 등
 */
export const CARD_TRANSACTION_SCHEMA = [
  // ── 카드 ──
  { col: 'card_company',  label: '카드사',     section: '카드', gridShow: true,
    type: 'select', options: ['신한','국민','삼성','현대','롯데','우리','하나','BC','농협','씨티','카카오페이','토스','기타'], sample: '신한' },
  { col: 'card_no',       label: '카드번호',   section: '카드', gridShow: true, sample: '1234-56**-****-7890' },
  { col: 'card_user',     label: '사용자',     section: '카드', gridShow: true, sample: '홍길동' },
  { col: 'card_type',     label: '구분',       section: '카드',
    type: 'select', options: ['법인','개인'], sample: '법인' },

  // ── 거래 ──
  { col: 'date',          label: '이용일시',   section: '거래', required: true, gridShow: true, type: 'date', sample: '2024-04-14' },
  { col: 'counterparty',  label: '가맹점',     section: '거래', required: true, gridShow: true, sample: 'GS칼텍스 강남점' },
  { col: 'amount',        label: '이용금액',   section: '거래', required: true, gridShow: true, type: 'number', num: true, sample: '80000' },
  { col: 'installment',   label: '할부',       section: '거래', sample: '일시불' },
  { col: 'pay_date',      label: '결제예정일', section: '거래', type: 'date', sample: '2024-05-15' },
  { col: 'approval_no',   label: '승인번호',   section: '거래', sample: '12345678' },
  { col: 'cancel_flag',   label: '취소',       section: '거래', sample: '' },

  // ── 분류 ──
  { col: 'expense_category', label: '비용분류', section: '분류',
    type: 'select', options: ['연료','정비','세차','식대','접대','교통','통신','사무용품','마케팅','교육','소모품','수수료','기타'], sample: '연료' },
  { col: 'matched_car',      label: '매칭차량', section: '분류', sample: '123가4567' },
  { col: 'matched_vendor',   label: '매칭거래처', section: '분류', sample: 'GS칼텍스' },

  // ── 기타 ──
  { col: 'raw_key',       label: '원본키',     section: '기타', sample: '20240414-001' },
  { col: 'note',          label: '비고',       section: '기타', type: 'textarea', sample: '' },
];

export const CARD_TRANSACTION_SECTIONS = ['카드', '거래', '분류', '기타'];
