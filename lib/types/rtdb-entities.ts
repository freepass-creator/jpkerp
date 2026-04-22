/**
 * RTDB에서 읽는 엔티티 타입 — 모든 필드 optional.
 * 이후 마이그레이션할 때 zod 스키마(lib/types/*.ts)로 엄격 검증.
 */
import type { CarOrigin, Powertrain, DriveType } from '@/lib/data/vehicle-constants';

export type RtdbBase = { _key?: string; [k: string]: unknown };

export type RtdbAsset = RtdbBase & {
  asset_code?: string;        // 자산 고유코드
  car_number?: string;
  vin?: string;
  partner_code?: string;
  customer_code?: string;     // 현재 사용 고객
  manufacturer?: string;
  car_model?: string;
  detail_model?: string;
  trim?: string;
  car_year?: number | string;
  fuel_type?: string;
  drive_type?: DriveType;
  transmission?: string;
  // 차종 마스터에서 복사되는 필드
  category?: string;
  origin?: CarOrigin;
  powertrain?: Powertrain;
  displacement?: number;       // 배기량 (cc)
  seats?: number;              // 승차정원
  battery_kwh?: number;        // 배터리 (EV/하이브리드)
  model_code?: string;         // 차종 코드 (CN7 등)
  // 자동차등록증 기재 (개별 차량 고유)
  type_number?: string;          // 형식번호
  engine_type?: string;          // 원동기 형식
  body_shape?: string;           // 차체형상 (세단/SUV/해치백/왜건/쿠페 등)
  curb_weight_kg?: number;       // 차량자중
  gross_weight_kg?: number;      // 총중량
  usage_type?: string;           // 용도 (렌터카/자가용/영업용)
  inspection_valid_until?: string; // 검사유효기간
  certification_number?: string; // 자기인증 관리번호
  ext_color?: string;
  int_color?: string;
  current_mileage?: number | string;
  last_maint_date?: string;
  first_registration_date?: string;
  acquisition_cost?: number | string;
  status?: string;
  key_count?: number;
  asset_status?: string;
  disposal_kind?: string;
  disposal_reason?: string;
  disposed_at?: number;
};

export type RtdbCustomer = RtdbBase & {
  customer_code?: string;
  partner_code?: string;
  name?: string;
  phone?: string;
  birth?: string;
  address?: string;
  license_no?: string;
  biz_no?: string;            // 법인/사업자번호
  customer_type?: string;     // 개인/법인/개인사업자
  note?: string;
  status?: string;
  created_at?: number;
};

export type RtdbContract = RtdbBase & {
  contract_code?: string;
  customer_code?: string;     // 고객코드 — 고객 엔티티 연결
  partner_code?: string;
  car_number?: string;
  contractor_name?: string;
  contractor_phone?: string;
  start_date?: string;
  end_date?: string;
  rent_months?: number;
  rent_amount?: number;
  deposit_amount?: number;
  product_type?: string;
  auto_debit_day?: string | number;
  note?: string;
  contract_status?: string;
  action_status?: string;     // 시동제어
  status?: string;
  created_at?: number;
  updated_at?: number | object;
};

export type RtdbBilling = RtdbBase & {
  contract_code?: string;
  customer_code?: string;     // 역정규화 — 고객 직접 조회용
  car_number?: string;        // 역정규화 — 차량별 청구 조회용
  partner_code?: string;      // 역정규화 — 회원사별 조회용
  bill_count?: number;
  due_date?: string;
  amount?: number;
  paid_total?: number;
  installments?: { amount?: number }[];
  status?: string;
};

export type RtdbCarModel = RtdbBase & {
  maker?: string;
  model?: string;
  sub?: string;          // 세부모델 (트림 포함)
  code?: string;         // 내부 코드
  year_start?: string | number;
  year_end?: string | number;   // "현재" or 숫자
  category?: string;     // 세단/SUV/해치백/트럭 등 (크기+차체)
  origin?: CarOrigin;
  powertrain?: Powertrain;
  fuel_type?: string;    // 세부 연료 (가솔린·디젤·LPG·전기·수소)
  // 스펙 (자산 등록 시 드랍다운 소스)
  transmission?: string;        // 자동/수동/CVT/DCT/8단 자동 등
  seats?: number;               // 승차정원 (2/4/5/7/9/11/15/25)
  drive_type?: '전륜' | '후륜' | '4륜' | 'AWD';
  displacement?: number;        // 배기량 (cc)
  // EV 전용
  battery_kwh?: number;         // 배터리 용량 (kWh)
  ev_range?: number;            // 1회 충전 주행거리 (km)
  status?: string;
  created_at?: number;
};

export type RtdbGpsDevice = RtdbBase & {
  gps_code?: string;          // GPS 고유코드
  asset_code?: string;        // 자산 연결
  car_number?: string;
  partner_code?: string;
  gps_status?: string;        // 장착/해제/고장/점검중
  gps_company?: string;       // 제조사·서비스사
  gps_serial?: string;        // 시리얼 번호
  gps_install_date?: string;
  gps_uninstall_date?: string;
  gps_location?: string;      // 장착 위치 (차량 내부)
  gps_note?: string;
  last_ping?: number;
  status?: string;
  created_at?: number;
};

export type RtdbEvent = RtdbBase & {
  event_code?: string;        // 이벤트 고유코드
  type?: string;
  date?: string;
  title?: string;
  amount?: number;
  car_number?: string;
  asset_code?: string;        // 자산 연결
  contract_code?: string;
  customer_code?: string;
  partner_code?: string;
  insurance_code?: string;    // 보험 이벤트 시 보험코드
  memo?: string;
  vendor?: string;
  to_location?: string;
  from_location?: string;
  delivery_location?: string;
  return_location?: string;
  accident_status?: string;
  deductible_amount?: number;
  deductible_paid?: number;
  deductible_status?: string;
  work_status?: string;
  contact_result?: string;
  contact_channel?: string;
  collect_result?: string;
  match_status?: string;
  handler?: string;
  age_after?: string;
  age_before?: string;
  photo_urls?: string[];
};
