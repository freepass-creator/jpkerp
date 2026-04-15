/**
 * schemas/vendor.js — 거래처 스키마
 */
export const VENDOR_SCHEMA = [
  // ── 핵심 ──
  { col: 'partner_code', label: '회원사코드', section: '핵심', required: true, gridShow: true, sample: 'CP01' },
  { col: 'vendor_name',  label: '거래처명',   section: '핵심', required: true, gridShow: true, sample: 'ABC정비' },
  { col: 'vendor_type',  label: '업종',       section: '핵심', type: 'select', options: ['정비소','세차장','타이어','주유소','탁송','보험사','캐피탈','부품','도색/판금','렌터카','기타'], required: true, gridShow: true, sample: '정비소' },
  { col: 'contact_name', label: '담당자',     section: '핵심', gridShow: true, sample: '김담당' },
  { col: 'phone',        label: '연락처',     section: '핵심', gridShow: true, sample: '02-1234-5678' },
  { col: 'address',      label: '주소',       section: '핵심', sample: '서울 강남구 테헤란로 1' },

  // ── 상세 ──
  { col: 'biz_no',       label: '사업자번호', section: '상세', sample: '123-45-67890' },
  { col: 'bank_name',    label: '은행',       section: '상세', sample: '신한' },
  { col: 'bank_account', label: '계좌번호',   section: '상세', sample: '110-123-456789' },
  { col: 'bank_holder',  label: '예금주',     section: '상세', sample: 'ABC정비' },

  // ── 메모 ──
  { col: 'note', label: '비고', section: '메모', type: 'textarea', sample: '' },
];

export const VENDOR_SECTIONS = ['핵심', '상세', '메모'];
