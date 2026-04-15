/**
 * schemas/customer.js — 고객 스키마
 *
 * 컬럼 순서:
 *  핵심 — 회원사코드 / 고객코드 / 이름·상호 / 연락처 / 구분 / 등록번호
 *  부가 — 주소 / 이메일 / 사업자 / 메모
 */
export const CUSTOMER_SCHEMA = [
  { col: 'partner_code',    label: '회원사코드',   section: '핵심', required: true, gridShow: true, sample: 'CP01' },
  { col: 'customer_code',   label: '고객코드',     section: '핵심', gridShow: true, readonly: true, sample: 'CP01CU00001' },
  { col: 'code_name',       label: '이름/상호',   section: '핵심', required: true, gridShow: true, sample: '홍길동' },
  { col: 'phone',           label: '연락처',       section: '핵심', required: true, gridShow: true, sample: '010-1234-5678' },
  { col: 'type',            label: '구분',         section: '핵심', type: 'select', options: ['개인','사업자'], gridShow: true, sample: '개인' },
  { col: 'customer_reg_no', label: '고객등록번호', section: '핵심', required: true, gridShow: true, sample: '900101-1******' },

  // 부가
  { col: 'address',         label: '주소',         section: '상세', sample: '서울 강남구 테헤란로 1' },
  { col: 'email',           label: '이메일',       section: '상세', sample: 'hong@example.com' },
  { col: 'biz_no',          label: '사업자등록번호', section: '상세', sample: '123-45-67890' },
  { col: 'biz_name',        label: '상호',         section: '상세', sample: '(주)제이피케이' },
  { col: 'ceo_name',        label: '대표자명',     section: '상세', sample: '홍길동' },
  { col: 'note',            label: '메모',         section: '메모', type: 'textarea', sample: '' },
];

export const CUSTOMER_SECTIONS = ['핵심', '상세', '메모'];
