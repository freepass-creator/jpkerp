/**
 * schemas/vendor.js — 거래처 스키마
 */
export const VENDOR_SCHEMA = [
  { col: 'vendor_name',  label: '거래처명',   section: '기본', required: true, gridShow: true },
  { col: 'vendor_type',  label: '업종',       section: '기본', type: 'select', options: ['정비소','세차장','타이어','주유소','탁송','보험사','캐피탈','부품','도색/판금','렌터카','기타'], required: true, gridShow: true },
  { col: 'contact_name', label: '담당자',     section: '기본', gridShow: true },
  { col: 'phone',        label: '연락처',     section: '기본', gridShow: true },
  { col: 'address',      label: '주소',       section: '기본' },
  { col: 'biz_no',       label: '사업자번호', section: '상세' },
  { col: 'bank_name',    label: '은행',       section: '상세' },
  { col: 'bank_account', label: '계좌번호',   section: '상세' },
  { col: 'bank_holder',  label: '예금주',     section: '상세' },
  { col: 'note',         label: '비고',       section: '상세', type: 'textarea' },
];

export const VENDOR_SECTIONS = ['기본', '상세'];
