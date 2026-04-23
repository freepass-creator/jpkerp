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

/**
 * 차종마스터 — 엔카/KAMA 표준 분류 체계 기반.
 *
 * 매칭 우선순위 (등록증 → 마스터):
 *   1. type_number_pattern (형식번호) — 가장 정확
 *   2. car_name + 생산기간 (제작연월이 production_start~end 범위)
 *   3. maker + model + engine_type
 *   4. maker + car_name 퍼지 매칭
 */
export type RtdbCarModel = RtdbBase & {
  // ── 최상위 분류 ──
  origin?: CarOrigin;               // 국산 / 수입

  // ── 브랜드 ──
  maker?: string;                    // "현대", "기아", "벤츠", "테슬라"

  // ── 차급 (엔카/KAMA 기준) ──
  body_type?: '승용' | '승합' | '화물' | '특수';
  size_class?: string;               // "경차" | "소형" | "준중형" | "중형" | "준대형" | "대형"
                                     // "스포츠카" | "소형 SUV" | "중형 SUV" | "대형 SUV"
                                     // "소형 MPV" | "대형 MPV" | "소형 트럭" | "대형 트럭" | "전기차"

  // ── 모델 계층 ──
  model?: string;                    // "아반떼", "Model 3", "G80" (그룹)
  sub?: string;                      // "아반떼 CN7", "모델 3 롱레인지" (세부)
  trim?: string;                     // "프리미엄", "익스클루시브" (선택, 트림)

  // ── ⭐ 등록증 매칭 키 (핵심) ──
  car_name?: string;                 // 등록증 ④ 차명과 정확히 일치 (예: "포터II 내장")
  type_number_pattern?: string;      // 형식번호(⑤) 패턴 (예: "CN7*", "JA51BA*")

  // ── 생산 기간 ──
  production_start?: string;         // "YYYY-MM" (예: "2020-03")
  production_end?: string;           // "YYYY-MM" | "현재"

  // 하위호환용 (연식 단위 기존 데이터)
  year_start?: string | number;
  year_end?: string | number;

  // ── 스펙 ──
  fuel_type?: string;                // "가솔린" | "디젤" | "LPG" | "하이브리드" | "전기" | "수소"
  engine_type?: string;              // 원동기형식 (예: "G4FL", "D4HB")
  displacement?: number;             // cc (전기차는 undefined)
  seats?: number;                    // 승차정원
  drive_type?: '전륜' | '후륜' | '4륜' | 'AWD';
  transmission?: string;             // "6단 자동", "8단 DCT", "CVT"
  battery_kwh?: number;              // EV 배터리 용량
  ev_range?: number;                 // EV 1회 충전 거리 (km)

  // 하위호환 — 기존 필드
  category?: string;                 // 크기+차체 (새 size_class로 통합 예정)
  powertrain?: Powertrain;
  code?: string;                     // 내부 코드 (deprecated, type_number_pattern로 대체)

  // ── 메타 ──
  source?: string;                   // 출처 (예: "encar", "wikicar", "공공데이터", "manual")
  status?: string;
  archived?: boolean;                // 생산종료 15년 초과 — UI 기본 숨김 (자산 보유시 노출)
  maker_eng?: string;                // 영문 제조사명 ("Hyundai")
  maker_code?: string;               // 엔카 제조사 코드 ("001")
  popularity?: number;               // 엔카 세대별 매물 수 — 인기순 정렬 기준 (자산 0대일 때 활용)
  model_popularity?: number;         // 엔카 모델그룹(모델명) 총 매물 수
  created_at?: number;
  updated_at?: number;
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
