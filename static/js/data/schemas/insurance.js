/**
 * schemas/insurance.js — 보험 스키마
 */
export const INSURANCE_SCHEMA = [
  // ── 핵심 ──
  { col: 'partner_code',      label: '회원사코드', section: '핵심', required: true, gridShow: true, sample: 'CP01' },
  { col: 'car_number',        label: '차량번호',   section: '핵심', required: true, gridShow: true, sample: '123가4567' },
  { col: 'vin',               label: '차대번호',   section: '핵심', gridShow: true, sample: 'KMHD341DBNU123456' },
  { col: 'insurance_company', label: '보험사',     section: '핵심', required: true, gridShow: true,
    type: 'select', options: ['삼성화재','현대해상','DB손해보험','KB손해보험','메리츠화재','한화손해보험','롯데손해보험','AXA','MG손해보험','캐롯','하나손해보험'], sample: '삼성화재' },
  { col: 'insurance_type',    label: '보험유형',   section: '핵심', required: true, gridShow: true,
    type: 'select', options: ['종합보험','책임보험','업무용','영업용'], sample: '업무용' },
  { col: 'policy_no',         label: '증권번호',   section: '핵심', gridShow: true, sample: 'P202404000001' },
  { col: 'start_date',        label: '개시일',     section: '핵심', type: 'date', required: true, gridShow: true, sample: '2024-04-01' },
  { col: 'end_date',          label: '만기일',     section: '핵심', type: 'date', required: true, gridShow: true, sample: '2025-03-31' },
  { col: 'premium',           label: '보험료',     section: '핵심', type: 'number', num: true, gridShow: true, sample: '850000' },
  { col: 'status',            label: '상태',       section: '핵심', gridShow: true,
    type: 'select', options: ['가입중','만료','해지'], sample: '가입중' },

  // ── 조건 ──
  { col: 'coverage_level',    label: '담보등급',   section: '조건', type: 'select', options: ['기본','표준','고급','최고급'], sample: '표준' },
  { col: 'age_limit',         label: '연령한정',   section: '조건', type: 'select', options: ['전연령','만21세이상','만24세이상','만26세이상','만28세이상','만30세이상','만35세이상','만43세이상','만48세이상'], sample: '만26세이상' },
  { col: 'driver_range',      label: '운전자범위', section: '조건', type: 'select', options: ['누구나','가족한정','부부한정','기명1인','기명1인+배우자','임직원'], sample: '누구나' },
  { col: 'deductible',        label: '자기부담금', section: '조건', type: 'number', num: true, sample: '300000' },
  { col: 'payment_cycle',     label: '납입주기',   section: '조건', type: 'select', options: ['일시납','월납','분기납','반년납'], sample: '일시납' },

  // ── 대리점 ──
  { col: 'agency_name',    label: '대리점',     section: '대리점', sample: 'ABC보험대리점' },
  { col: 'agency_contact', label: '대리점연락처', section: '대리점', sample: '02-1234-5678' },

  // ── 메모 ──
  { col: 'note', label: '비고', section: '메모', type: 'textarea', sample: '' },
];

export const INSURANCE_SECTIONS = ['핵심', '조건', '대리점', '메모'];
