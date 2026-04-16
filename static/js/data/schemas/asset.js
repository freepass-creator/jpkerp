/**
 * schemas/asset.js — 자산(차량) 스키마
 *
 * 컬럼 순서:
 *  핵심 — 회원사코드 / 자산코드 / 차량번호 / 차대번호 / 자산상태 / 제조사 / 모델명 / 세부모델 / 세부트림 / 선택옵션
 *  스펙 — 연식 / 주행거리 / 연료 / 외부색상 / 내부색상
 *  부가 — 가격 / 등록 / 취득 / 할부 / 소유 / 차키 / GPS / 기타
 */

export const ASSET_SCHEMA = [
  // ── 핵심 ──
  { col: 'partner_code',  label: '회원사코드', section: '핵심', required: true, gridShow: true, sample: 'CP01' },
  { col: 'asset_code',    label: '자산코드',   section: '핵심', gridShow: true, readonly: true, sample: 'CP01AS00001' },
  { col: 'car_number',    label: '차량번호',   section: '핵심', required: true, gridShow: true, sample: '123가4567' },
  { col: 'vin',           label: '차대번호',   section: '핵심', required: true, gridShow: true, sample: 'KMHD341DBNU123456' },
  { col: 'asset_status',  label: '자산상태',   section: '핵심', gridShow: true, type: 'select', options: ['가동중','상품대기','상품화중','정비중','매각예정','폐차'], sample: '가동중' },
  { col: 'manufacturer',  label: '제조사',     section: '핵심', gridShow: true, sample: '현대' },
  { col: 'car_model',     label: '모델명',     section: '핵심', gridShow: true, sample: '아반떼' },
  { col: 'detail_model',  label: '세부모델',   section: '핵심', gridShow: true, sample: 'CN7' },
  { col: 'trim',          label: '세부트림',   section: '핵심', gridShow: true, sample: '스마트' },
  { col: 'options',       label: '선택옵션',   section: '핵심', gridShow: true, sample: '선루프,네비' },

  // ── 스펙 (외관·연식·연료) ──
  { col: 'car_year',      label: '연식',       section: '스펙', type: 'number', gridShow: true, num: true, sample: '2024' },
  { col: 'mileage',       label: '주행거리',   section: '스펙', type: 'number', gridShow: true, num: true, sample: '15000' },
  { col: 'fuel_type',     label: '연료',       section: '스펙', type: 'select', options: ['가솔린','디젤','LPG','하이브리드','전기'], gridShow: true, sample: '가솔린' },
  { col: 'ext_color',     label: '외부색상',   section: '스펙', gridShow: true, sample: '화이트' },
  { col: 'int_color',     label: '내부색상',   section: '스펙', gridShow: true, sample: '블랙' },

  // ── 제원 ──
  { col: 'displacement',  label: '배기량',     section: '제원', sample: '1598' },
  { col: 'transmission',  label: '변속기',     section: '제원', type: 'select', options: ['자동','수동'], sample: '자동' },
  { col: 'drive_type',    label: '구동',       section: '제원', type: 'select', options: ['2WD','4WD','AWD'], sample: '2WD' },
  { col: 'seats',         label: '인승',       section: '제원', type: 'number', num: true, sample: '5' },
  { col: 'vehicle_class', label: '차종',       section: '제원', sample: '승용' },

  // ── 가격 ──
  { col: 'consumer_price',label: '소비자가격', section: '가격', type: 'number', num: true, sample: '25000000' },
  { col: 'vehicle_price', label: '차량가격',   section: '가격', type: 'number', num: true, sample: '23000000' },

  // ── 등록 ──
  { col: 'first_reg_date',label: '최초등록일',  section: '등록', type: 'date', sample: '2024-03-15' },
  { col: 'age_expiry',    label: '차령만료일',  section: '등록', type: 'date', sample: '2035-03-14' },
  { col: 'usage_type',    label: '용도',        section: '등록', type: 'select', options: ['렌터카','리스','자가용','영업용'], sample: '렌터카' },
  { col: 'reg_area',      label: '등록지역',    section: '등록', sample: '서울' },
  { col: 'base_location', label: '사용본거지',  section: '등록', sample: '서울 강남구' },

  // ── 취득 ──
  { col: 'purchase_method',label: '취득방법',  section: '취득', type: 'select', options: ['할부','리스','현금','인수','위탁'], sample: '할부' },
  { col: 'purchase_date',  label: '취득일',    section: '취득', type: 'date', sample: '2024-03-10' },
  { col: 'dealer',         label: '매입처',    section: '취득', sample: '현대오토' },
  { col: 'purchase_price', label: '취득원가',  section: '취득', type: 'number', num: true, sample: '22000000' },

  // ── 취득비용 ──
  { col: 'delivery_fee',          label: '신차탁송',     section: '취득비용', type: 'number', num: true, sample: '150000' },
  { col: 'actual_purchase_price', label: '실제구입가격', section: '취득비용', type: 'number', num: true, sample: '23500000' },
  { col: 'acquisition_tax',       label: '취등록세',     section: '취득비용', type: 'number', num: true, sample: '1540000' },
  { col: 'sales_commission',      label: '매도비',       section: '취득비용', type: 'number', num: true, sample: '0' },
  { col: 'performance_insurance', label: '성능보험료',   section: '취득비용', type: 'number', num: true, sample: '0' },
  { col: 'transfer_fee',          label: '이전대행료',   section: '취득비용', type: 'number', num: true, sample: '50000' },
  { col: 'local_bond',            label: '지역공채',     section: '취득비용', type: 'number', num: true, sample: '120000' },
  { col: 'stamp_duty',            label: '인지대',       section: '취득비용', type: 'number', num: true, sample: '3000' },
  { col: 'other_fees',            label: '기타수수료',   section: '취득비용', type: 'number', num: true, sample: '0' },

  // ── 할부실행 ──
  { col: 'loan_company',        label: '금융사',           section: '할부실행', sample: '현대캐피탈' },
  { col: 'loan_principal',      label: '원금',             section: '할부실행', type: 'number', num: true, sample: '18000000' },
  { col: 'loan_down_payment',   label: '선수금',           section: '할부실행', type: 'number', num: true, sample: '5000000' },
  { col: 'loan_months',         label: '할부기간(개월)',    section: '할부실행', type: 'number', num: true, sample: '48' },
  { col: 'loan_rate',           label: '금리(%)',          section: '할부실행', type: 'number', num: true, sample: '5.9' },
  { col: 'loan_method',         label: '대출방식',         section: '할부실행', type: 'select', options: ['원리금균등','원금균등','만기일시'], sample: '원리금균등' },
  { col: 'loan_start_date',     label: '초회차 납입일',    section: '할부실행', type: 'date', sample: '2024-04-25' },
  { col: 'loan_account',        label: '출금계좌',         section: '할부실행', sample: '신한 110-123-456789' },
  { col: 'loan_prepay_fee_pct', label: '중도상환 수수료(%)', section: '할부실행', type: 'number', num: true, sample: '2' },
  { col: 'loan_doc',            label: '등록증 첨부',     section: '할부실행', type: 'file' },

  // ── 소유 ──
  { col: 'owner_type',  label: '소유구분', section: '소유', type: 'select', options: ['자사','리스사','위탁'], sample: '자사' },
  { col: 'owner_name',  label: '소유자명', section: '소유', sample: '(주)제이피케이' },

  // ── 차키 ──
  { col: 'key_count',     label: '차키 수량',   section: '차키', type: 'number', num: true, sample: '2' },
  { col: 'key_etc_count', label: '기타키 수량', section: '차키', type: 'number', num: true, sample: '0' },
  { col: 'key_note',      label: '키비고',      section: '차키' },

  // ── GPS ──
  { col: 'gps_installed', label: 'GPS 장착',   section: 'GPS', type: 'select', options: ['Y','N'], sample: 'Y' },
  { col: 'gps_company',   label: 'GPS 업체',   section: 'GPS', sample: '아이나비' },
  { col: 'gps_model',     label: 'GPS 단말기', section: 'GPS' },
  { col: 'gps_number',    label: 'GPS 번호',   section: 'GPS' },

  // ── 메모 ──
  { col: 'note', label: '비고', section: '메모', type: 'textarea' },
];

export const ASSET_SECTIONS = ['핵심', '스펙', '제원', '가격', '등록', '취득', '취득비용', '할부실행', '소유', '차키', 'GPS', '메모'];
