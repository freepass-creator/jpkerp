/**
 * schemas/asset.js — 자산(차량) 스키마
 *
 * 섹션: 차량 → 스펙 → 제원 → 등록 → 취득 → 할부/리스 → 소유 → 기타
 */

export const ASSET_SCHEMA = [
  // ── 차량 기본 ──
  { col: 'car_number',   label: '차량번호',   section: '차량', required: true, gridShow: true },
  { col: 'vin',          label: '차대번호',   section: '차량', required: true, gridShow: true },
  { col: 'manufacturer', label: '제조사',     section: '차량', gridShow: true },
  { col: 'car_model',    label: '모델명',     section: '차량', gridShow: true },
  { col: 'detail_model', label: '세부모델',   section: '차량' },
  { col: 'car_year',     label: '연식',       section: '차량', type: 'number', gridShow: true, num: true },

  // ── 스펙 ──
  { col: 'trim',         label: '트림',       section: '스펙' },
  { col: 'options',      label: '선택옵션',   section: '스펙' },
  { col: 'ext_color',    label: '외부색상',   section: '스펙' },
  { col: 'int_color',    label: '내부색상',   section: '스펙' },
  { col: 'vehicle_price',label: '차량가격',   section: '스펙', type: 'number', num: true },

  // ── 제원 ──
  { col: 'fuel_type',    label: '연료',       section: '제원', type: 'select', options: ['가솔린','디젤','LPG','하이브리드','전기'] },
  { col: 'displacement', label: '배기량',     section: '제원' },
  { col: 'transmission', label: '변속기',     section: '제원', type: 'select', options: ['자동','수동'] },
  { col: 'drive_type',   label: '구동',       section: '제원', type: 'select', options: ['2WD','4WD','AWD'] },
  { col: 'seats',        label: '인승',       section: '제원', type: 'number', num: true },
  { col: 'vehicle_class',label: '차종',       section: '제원' },

  // ── 등록 ──
  { col: 'first_reg_date',  label: '최초등록일',  section: '등록', type: 'date', gridShow: true },
  { col: 'age_expiry',      label: '차령만료일',  section: '등록', type: 'date' },
  { col: 'usage_type',      label: '용도',        section: '등록', type: 'select', options: ['렌터카','리스','자가용','영업용'] },
  { col: 'reg_area',        label: '등록지역',    section: '등록' },
  { col: 'base_location',   label: '사용본거지',  section: '등록' },

  // ── 취득 ──
  { col: 'purchase_method', label: '취득방법',  section: '취득', type: 'select', options: ['할부','리스','현금','인수','위탁'], gridShow: true },
  { col: 'purchase_date',   label: '취득일',    section: '취득', type: 'date', gridShow: true },
  { col: 'dealer',          label: '매입처',    section: '취득' },
  { col: 'purchase_price',  label: '취득원가',  section: '취득', type: 'number', num: true, gridShow: true },

  // ── 할부/리스 실행 ──
  { col: 'loan_company',     label: '할부/리스사',    section: '할부실행' },
  { col: 'loan_exec_date',   label: '실행일',         section: '할부실행', type: 'date' },
  { col: 'loan_principal',   label: '원금(실행금액)',  section: '할부실행', type: 'number', num: true },
  { col: 'loan_down_payment',label: '선수금',         section: '할부실행', type: 'number', num: true },
  { col: 'loan_months',      label: '할부개월',       section: '할부실행', type: 'number', num: true },
  { col: 'loan_rate',        label: '금리(%)',        section: '할부실행', type: 'number', num: true },
  { col: 'loan_monthly',     label: '월 납입금',      section: '할부실행', type: 'number', num: true },
  { col: 'loan_start_date',  label: '납입시작일',     section: '할부실행', type: 'date' },
  { col: 'loan_end_date',    label: '납입종료일',     section: '할부실행', type: 'date' },
  { col: 'loan_account',     label: '출금계좌',       section: '할부실행' },
  { col: 'loan_status',      label: '상환상태',       section: '할부실행', type: 'select', options: ['상환중','완납','연체','조기상환'] },

  // ── 소유 ──
  { col: 'owner_type',  label: '소유구분', section: '소유', type: 'select', options: ['자사','리스사','위탁'] },
  { col: 'owner_name',  label: '소유자명', section: '소유' },

  // ── 기타 ──
  { col: 'mileage', label: '주행거리', section: '기타', type: 'number', num: true },
  { col: 'note',    label: '비고',     section: '기타', type: 'textarea' },
];

export const ASSET_SECTIONS = ['차량', '스펙', '제원', '등록', '취득', '할부실행', '소유', '기타'];
