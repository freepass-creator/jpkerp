/**
 * schemas/autodebit.js — 자동이체 스키마
 */
export const AUTODEBIT_SCHEMA = [
  // ── 핵심 ──
  { col: 'partner_code',    label: '회원사코드', section: '핵심', required: true, gridShow: true, sample: 'CP01' },
  { col: 'contract_code',   label: '계약코드',   section: '핵심', required: true, gridShow: true, sample: 'CP01CT00001' },
  { col: 'customer_name',   label: '고객명',     section: '핵심', required: true, gridShow: true, sample: '홍길동' },
  { col: 'car_number',      label: '차량번호',   section: '핵심', gridShow: true, sample: '123가4567' },
  { col: 'bank_name',       label: '은행',       section: '핵심', required: true, gridShow: true,
    type: 'select', options: ['국민','신한','우리','하나','기업','농협','우체국','카카오뱅크','토스뱅크','새마을','신협','SC제일','씨티','부산','대구','경남','광주','전북','제주','케이뱅크'], sample: '신한' },
  { col: 'account_no',      label: '계좌번호',   section: '핵심', required: true, gridShow: true, sample: '110-123-456789' },
  { col: 'debit_day',       label: '출금일',     section: '핵심', required: true, gridShow: true,
    type: 'select', options: ['1','5','10','15','20','25','말일'], sample: '25' },
  { col: 'amount',          label: '이체금액',   section: '핵심', required: true, type: 'number', num: true, gridShow: true, sample: '550000' },
  { col: 'status',          label: '상태',       section: '핵심', gridShow: true,
    type: 'select', options: ['등록','사용중','일시중지','해지'], sample: '사용중' },

  // ── 상세 ──
  { col: 'customer_reg_no', label: '등록번호',   section: '상세', sample: '900101-1******' },
  { col: 'account_holder',  label: '예금주',     section: '상세', required: true, sample: '홍길동' },
  { col: 'account_type',    label: '계좌유형',   section: '상세', type: 'select', options: ['본인','가족','법인','기타'], sample: '본인' },
  { col: 'start_month',     label: '시작월',     section: '상세', type: 'date', sample: '2024-04-01' },
  { col: 'end_month',       label: '종료월',     section: '상세', type: 'date', sample: '2027-03-31' },
  { col: 'cms_code',        label: 'CMS코드',    section: '상세', sample: 'CMS001' },
  { col: 'consent_date',    label: '동의일자',   section: '상세', type: 'date', sample: '2024-04-01' },
  { col: 'consent_file',    label: '동의서첨부', section: '상세', type: 'file' },

  // ── 메모 ──
  { col: 'note', label: '비고', section: '메모', type: 'textarea', sample: '' },
];

export const AUTODEBIT_SECTIONS = ['핵심', '상세', '메모'];
