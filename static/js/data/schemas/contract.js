/**
 * schemas/contract.js — 계약 스키마
 *
 * 계약 입력 = 차량 + 계약자(고객정보 통합) + 조건 + 상태
 * 저장 시 계약자 등록번호로 고객 upsert (자동).
 */

export const CONTRACT_SCHEMA = [
  // ── 회원사 ──
  { col: 'partner_code', label: '회원사코드', section: '차량' },
  // ── 차량 ──
  { col: 'car_number',   label: '차량번호',   section: '차량',   required: true, gridShow: true, autocomplete: 'asset' },
  { col: 'vin',          label: '차대번호',   section: '차량' },
  { col: 'car_model',    label: '모델',       section: '차량',   gridShow: true },

  // ── 계약자 (고객정보 통합) ──
  { col: 'contractor_reg_no', label: '고객등록번호', section: '계약자', required: true, gridShow: true },
  { col: 'contractor_name',   label: '계약자명',     section: '계약자', required: true, gridShow: true },
  { col: 'contractor_phone',  label: '연락처',       section: '계약자', required: true },
  { col: 'contractor_type',   label: '구분', section: '계약자', type: 'select', options: ['개인','사업자'] },
  { col: 'contractor_address',label: '주소',         section: '계약자' },

  // ── 사업자 (사업자 계약 시) ──
  { col: 'biz_no',    label: '사업자등록번호', section: '사업자' },
  { col: 'biz_name',  label: '상호',           section: '사업자' },
  { col: 'ceo_name',  label: '대표자명',       section: '사업자' },
  { col: 'biz_type',  label: '업태',           section: '사업자' },
  { col: 'biz_item',  label: '종목',           section: '사업자' },
  { col: 'tax_email', label: '세금계산서 이메일', section: '사업자' },

  // ── 실운전자 ──
  { col: 'driver_name',    label: '실운전자 이름',     section: '실운전자' },
  { col: 'driver_phone',   label: '실운전자 연락처',   section: '실운전자' },
  { col: 'driver_ssn',     label: '실운전자 주민번호', section: '실운전자' },
  { col: 'driver_license', label: '실운전자 면허번호', section: '실운전자' },

  // ── 계약 조건 ──
  { col: 'start_date',     label: '시작일',     section: '조건', type: 'date',   required: true, gridShow: true },
  { col: 'rent_months',    label: '기간(개월)', section: '조건', type: 'number', required: true, gridShow: true, num: true },
  { col: 'end_date',       label: '종료일',     section: '조건', type: 'date' },
  { col: 'rent_amount',    label: '월 대여료',  section: '조건', type: 'number', required: true, gridShow: true, num: true },
  { col: 'deposit_amount', label: '보증금',     section: '조건', type: 'number', num: true },
  { col: 'auto_debit_day', label: '결제일',     section: '조건', type: 'select', options: ['1','5','10','15','20','25','말일'], required: true },

  // ── 상태 ──
  { col: 'contract_status', label: '상태', section: '상태', type: 'select', options: ['계약대기','계약진행','계약완료','계약해지'], gridShow: true },
  { col: 'note',            label: '메모', section: '상태', type: 'textarea' },
];

export const CONTRACT_SECTIONS = ['차량', '계약자', '사업자', '실운전자', '조건', '상태'];
