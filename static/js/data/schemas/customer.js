/**
 * schemas/customer.js — 고객 스키마
 */
export const CUSTOMER_SCHEMA = [
  { col: 'partner_code',    label: '회원사코드',   section: '기본' },
  { col: 'customer_reg_no', label: '고객등록번호', section: '기본', required: true, gridShow: true },
  { col: 'code_name',       label: '이름/상호',   section: '기본', required: true, gridShow: true },
  { col: 'phone',           label: '연락처',       section: '기본', required: true, gridShow: true },
  { col: 'type',            label: '구분',         section: '기본', type: 'select', options: ['개인','사업자'], gridShow: true },

  { col: 'address',         label: '주소',         section: '상세' },
  { col: 'email',           label: '이메일',       section: '상세' },
  { col: 'biz_no',          label: '사업자등록번호', section: '상세' },
  { col: 'biz_name',        label: '상호',         section: '상세' },
  { col: 'ceo_name',        label: '대표자명',     section: '상세' },
  { col: 'note',            label: '메모',         section: '상세', type: 'textarea' },
];

export const CUSTOMER_SECTIONS = ['기본', '상세'];
