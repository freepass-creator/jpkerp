/**
 * schemas/contract.js — 계약 스키마
 *
 * 컬럼 순서 (실무 운영 기준):
 *  핵심 8개 — 회원사코드 / 계약코드 / 차량번호 / 계약자명 / 계약상태 / 계약상품 / 연락처
 *  조건    — 시작일 / 종료일 / 기간 / 월 대여료 / 보증금 / 결제일
 *  관리    — 조치상태 / 모델
 *  부가    — 차대번호 / 등록번호 / 구분 / 주소 / 사업자 / 실운전자 / 메모
 */

export const CONTRACT_SCHEMA = [
  // ── 핵심 (한눈 view) ──
  { col: 'partner_code',    label: '회원사코드', section: '핵심', required: true, gridShow: true, sample: 'CP01' },
  { col: 'contract_code',   label: '계약코드',   section: '핵심', gridShow: true, readonly: true, sample: 'CP01CT00001' },
  { col: 'car_number',      label: '차량번호',   section: '핵심', required: true, gridShow: true, autocomplete: 'asset', sample: '123가4567' },
  { col: 'contractor_name', label: '계약자명',   section: '핵심', required: true, gridShow: true, sample: '홍길동' },
  { col: 'contract_status', label: '계약상태',   section: '핵심', gridShow: true, readonly: true,
    type: 'select', options: ['계약대기','계약진행','계약완료','계약해지'], sample: '계약진행' },
  { col: 'product_type',    label: '계약상품',   section: '핵심', gridShow: true,
    type: 'select', options: ['월렌트','지인대여','장기대여'], sample: '월렌트' },
  { col: 'contractor_phone',label: '연락처',     section: '핵심', required: true, gridShow: true, sample: '010-1234-5678' },

  // ── 조건 ──
  { col: 'start_date',     label: '시작일',     section: '조건', type: 'date',   required: true, gridShow: true, sample: '2024-04-01' },
  { col: 'end_date',       label: '종료일',     section: '조건', type: 'date',                  gridShow: true, sample: '2027-03-31' },
  { col: 'rent_months',    label: '기간(개월)', section: '조건', type: 'number', required: true, gridShow: true, num: true, sample: '36' },
  { col: 'rent_amount',    label: '월 대여료',  section: '조건', type: 'number', required: true, gridShow: true, num: true, sample: '550000' },
  { col: 'deposit_amount', label: '보증금',     section: '조건', type: 'number',                gridShow: true, num: true, sample: '3000000' },
  { col: 'auto_debit_day', label: '결제일',     section: '조건', type: 'select', options: ['1','5','10','15','20','25','말일'], required: true, gridShow: true, sample: '25' },

  // ── 관리 ──
  { col: 'action_status', label: '조치상태', section: '관리', gridShow: true, type: 'select', options: ['납부중','시동제어','회수결정','회수완료'], sample: '납부중' },
  { col: 'car_model',     label: '모델',     section: '관리', gridShow: true, sample: '아반떼' },

  // ── 부가 (식별·증빙) ──
  { col: 'vin',               label: '차대번호',     section: '식별', sample: 'KMHD341DBNU123456' },
  { col: 'contractor_reg_no', label: '고객등록번호', section: '식별', required: true, sample: '900101-1******' },
  { col: 'contractor_type',   label: '구분',         section: '식별', type: 'select', options: ['개인','사업자'], sample: '개인' },
  { col: 'contractor_address',label: '주소',         section: '식별', sample: '서울 강남구 테헤란로 1' },

  // ── 사업자 ──
  { col: 'biz_no',    label: '사업자등록번호', section: '사업자', sample: '123-45-67890' },
  { col: 'biz_name',  label: '상호',           section: '사업자', sample: '(주)제이피케이' },
  { col: 'ceo_name',  label: '대표자명',       section: '사업자', sample: '홍길동' },
  { col: 'biz_type',  label: '업태',           section: '사업자', sample: '서비스' },
  { col: 'biz_item',  label: '종목',           section: '사업자', sample: '자동차대여업' },
  { col: 'tax_email', label: '세금계산서 이메일', section: '사업자', sample: 'tax@example.com' },

  // ── 실운전자 ──
  { col: 'driver_name',    label: '실운전자 이름',     section: '실운전자', sample: '홍길동' },
  { col: 'driver_phone',   label: '실운전자 연락처',   section: '실운전자', sample: '010-1234-5678' },
  { col: 'driver_ssn',     label: '실운전자 주민번호', section: '실운전자', sample: '900101-1******' },
  { col: 'driver_license', label: '실운전자 면허번호', section: '실운전자', sample: '11-12-123456-78' },

  // ── 메모 ──
  { col: 'note', label: '메모', section: '메모', type: 'textarea', sample: '' },
];

export const CONTRACT_SECTIONS = ['핵심', '조건', '관리', '식별', '사업자', '실운전자', '메모'];
