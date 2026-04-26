export type InputKey =
  | 'asset'
  | 'contract'
  | 'extension'
  | 'customer'
  | 'task'
  | 'gps'
  | 'partner'
  | 'ocr'
  | 'insurance'
  | 'loan';

export const INPUT_LABELS: Record<InputKey, string> = {
  asset: '자산 신규',
  contract: '계약 신규',
  extension: '계약 연장',
  customer: '고객 신규',
  task: '업무 생성',
  gps: 'GPS 장착',
  partner: '회원사 신규',
  ocr: 'OCR 문서',
  insurance: '보험 신규',
  loan: '할부 신규',
};

export const INPUT_SUBS: Record<InputKey, string> = {
  asset: '차량 단건 등록 · 제조사·모델·VIN',
  contract: '렌트·리스 계약 등록 · 대여조건',
  extension: '기존 계약 연장 · 원본 완료 + 새 계약 파생',
  customer: '고객 정보 등록 · 연락처·면허·주소',
  task: '담당자 지정 · todo/할 일 등록',
  gps: 'GPS 장착·해제 이력 · 시리얼·제조사',
  partner: '회원사 등록 · 대표·사업자·연락처',
  ocr: '자동차등록증·보험증권 등 · 자유 형식 저장',
  insurance: '차량 보험 가입 · 증권·만료일·보장금액',
  loan: '할부 매입 · 회차별 스케줄 자동 생성',
};

export const INPUT_ICONS: Record<InputKey, string> = {
  asset: 'ph-car',
  contract: 'ph-handshake',
  extension: 'ph-arrow-clockwise',
  customer: 'ph-user-circle-plus',
  task: 'ph-check-square',
  gps: 'ph-navigation-arrow',
  partner: 'ph-buildings',
  ocr: 'ph-scan',
  insurance: 'ph-shield-check',
  loan: 'ph-chart-line-up',
};
