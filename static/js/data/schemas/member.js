/**
 * schemas/member.js — 회원사 스키마
 *
 * 회원사코드(partner_code)는 저장 시 자동 부여 (MB001, MB002...)
 */
export const MEMBER_SCHEMA = [
  // ── 기본 ── (2열 배치: 좌-우 쌍)
  { col: 'partner_code',  label: '회원사코드',     section: '기본', gridShow: true, readonly: true },
  { col: 'corp_no',       label: '법인등록번호',   section: '기본' },
  { col: 'company_name',  label: '회사명',         section: '기본', required: true, gridShow: true },
  { col: 'biz_no',        label: '사업자등록번호', section: '기본', required: true, gridShow: true },
  { col: 'ceo_name',      label: '대표자',         section: '기본', gridShow: true },
  { col: 'biz_address',   label: '사업장소재지',   section: '기본' },
  { col: 'biz_type',      label: '업태',           section: '기본' },
  { col: 'biz_item',      label: '종목',           section: '기본' },

  // ── 연락 ──
  { col: 'contact_name',  label: '담당자',         section: '연락', gridShow: true },
  { col: 'phone',         label: '대표전화',       section: '연락', gridShow: true },
  { col: 'contact_phone', label: '담당자연락처',   section: '연락' },
  { col: 'email',         label: '이메일',         section: '연락', gridShow: true },
  { col: 'fax',           label: '팩스',           section: '연락' },

  // ── 계약 ──
  { col: 'contract_date', label: '계약일',         section: '계약', type: 'date', gridShow: true },
  { col: 'contract_end',  label: '계약종료일',     section: '계약', type: 'date' },
  { col: 'fee_type',      label: '수수료구분',     section: '계약', type: 'select', options: ['정액','정률'] },
  { col: 'fee_amount',    label: '수수료금액/율',  section: '계약', type: 'number', num: true },
  { col: 'billing_day',   label: '정산일',         section: '계약', type: 'select', options: ['1','5','10','15','20','25','말일'] },

  // ── 정산계좌 ──
  { col: 'bank_name',     label: '은행',           section: '정산계좌' },
  { col: 'bank_account',  label: '계좌번호',       section: '정산계좌' },
  { col: 'bank_holder',   label: '예금주',         section: '정산계좌' },

  // ── 상태 ──
  { col: 'status',        label: '상태', section: '상태', type: 'select', options: ['정상','해지','일시중지'], gridShow: true },
  { col: 'car_count',     label: '차량대수',       section: '상태', type: 'number', num: true, gridShow: true },
  { col: 'note',          label: '비고',           section: '상태', type: 'textarea' },
];

export const MEMBER_SECTIONS = ['기본', '연락', '계약', '정산계좌', '상태'];
