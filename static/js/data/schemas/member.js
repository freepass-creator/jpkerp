/**
 * schemas/member.js — 회원사 스키마
 *
 * 회원사 자체이므로 partner_code = 회원사코드 (자동 채번 CP01, CP02...)
 *
 * 순서: 핵심 — 회원사코드 / 회사명 / 사업자번호 / 대표자 / 담당자 / 대표전화 / 이메일 / 상태
 */
export const MEMBER_SCHEMA = [
  // ── 핵심 ──
  { col: 'partner_code',  label: '회원사코드',     section: '핵심', gridShow: true, readonly: true, sample: 'CP01' },
  { col: 'company_name',  label: '회사명',         section: '핵심', required: true, gridShow: true, sample: '(주)제이피케이' },
  { col: 'biz_no',        label: '사업자등록번호', section: '핵심', required: true, gridShow: true, sample: '123-45-67890' },
  { col: 'ceo_name',      label: '대표자',         section: '핵심', gridShow: true, sample: '홍길동' },
  { col: 'contact_name',  label: '담당자',         section: '핵심', gridShow: true, sample: '김담당' },
  { col: 'phone',         label: '대표전화',       section: '핵심', gridShow: true, sample: '02-1234-5678' },
  { col: 'email',         label: '이메일',         section: '핵심', gridShow: true, sample: 'contact@example.com' },
  { col: 'status',        label: '상태',           section: '핵심', type: 'select', options: ['정상','해지','일시중지'], gridShow: true, sample: '정상' },
  { col: 'car_count',     label: '차량대수',       section: '핵심', type: 'number', num: true, gridShow: true, sample: '10' },

  // ── 상세 ──
  { col: 'corp_no',       label: '법인등록번호',   section: '상세', sample: '110111-1234567' },
  { col: 'biz_address',   label: '사업장소재지',   section: '상세', sample: '서울 강남구 테헤란로 1' },
  { col: 'biz_type',      label: '업태',           section: '상세', sample: '서비스' },
  { col: 'biz_item',      label: '종목',           section: '상세', sample: '자동차대여업' },
  { col: 'contact_phone', label: '담당자연락처',   section: '상세', sample: '010-1234-5678' },
  { col: 'fax',           label: '팩스',           section: '상세', sample: '02-1234-5679' },

  // ── 계약 ──
  { col: 'contract_date', label: '계약일',         section: '계약', type: 'date', sample: '2024-04-01' },
  { col: 'contract_end',  label: '계약종료일',     section: '계약', type: 'date', sample: '2025-03-31' },
  { col: 'fee_type',      label: '수수료구분',     section: '계약', type: 'select', options: ['정액','정률'], sample: '정률' },
  { col: 'fee_amount',    label: '수수료금액/율',  section: '계약', type: 'number', num: true, sample: '10' },
  { col: 'billing_day',   label: '정산일',         section: '계약', type: 'select', options: ['1','5','10','15','20','25','말일'], sample: '25' },

  // ── 정산계좌 ──
  { col: 'bank_name',     label: '은행',           section: '정산계좌', sample: '신한' },
  { col: 'bank_account',  label: '계좌번호',       section: '정산계좌', sample: '110-123-456789' },
  { col: 'bank_holder',   label: '예금주',         section: '정산계좌', sample: '(주)제이피케이' },

  // ── 메모 ──
  { col: 'note', label: '비고', section: '메모', type: 'textarea', sample: '' },
];

export const MEMBER_SECTIONS = ['핵심', '상세', '계약', '정산계좌', '메모'];
