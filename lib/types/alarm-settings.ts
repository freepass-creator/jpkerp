/**
 * 알람 임계값 설정 (RTDB `settings/alarms`).
 *
 * 관리자가 개발도구 → 시스템 설정 탭에서 N일 단위로 조정 가능.
 * gap-check 엔진, 사이드바 카운트 동기화, 대시보드 반납스케줄 카드,
 * 자산관리 보험·검사 sub-tab이 모두 이 값을 참조한다.
 *
 * 비어 있으면 DEFAULT_ALARM_SETTINGS 사용.
 */

export interface AlarmSettings {
  /** 계약 만기(반납날짜) 알람 — 만기 N일 전부터 임박 처리 */
  contract_expiring_days: number;
  /** 미납 긴급(연체) 임계값 — D+N 이상이면 긴급 */
  contract_overdue_critical_days: number;
  /** 보험 만료 임박 — 만료 N일 전부터 알람 */
  insurance_expiring_days: number;
  /** 정기검사 도래 — 만료 N일 전부터 알람 */
  inspection_expiring_days: number;
  /** 자동차세 납부일 임박 — 납부일 N일 전부터 알람 */
  tax_expiring_days: number;
  /** 할부금 도래 — 결제일 N일 전부터 알람 */
  loan_due_days: number;
  /** 휴차 N일 초과시 알람 */
  idle_alert_days: number;
  /** 받은 요청 마감 임박 — 마감 N일 전부터 알람 */
  request_due_days: number;
  /** 시동제어 권유 — 미납 D+N 이상 + 미접촉 시 권유 알람 */
  ignition_recommend_days: number;
  /** 자금일보 매일 작성 필수 여부 (true면 미작성시 알람) */
  daily_report_required: boolean;
}

export const DEFAULT_ALARM_SETTINGS: AlarmSettings = {
  contract_expiring_days: 30,
  contract_overdue_critical_days: 30,
  insurance_expiring_days: 30,
  inspection_expiring_days: 14,
  tax_expiring_days: 30,
  loan_due_days: 7,
  idle_alert_days: 30,
  request_due_days: 1,
  ignition_recommend_days: 60,
  daily_report_required: true,
};

/** RTDB에서 읽은 부분 객체를 기본값으로 보강 (누락 키 안전) */
export function withAlarmDefaults(
  partial: Partial<AlarmSettings> | null | undefined,
): AlarmSettings {
  if (!partial) return DEFAULT_ALARM_SETTINGS;
  return {
    contract_expiring_days: numOrDefault(
      partial.contract_expiring_days,
      DEFAULT_ALARM_SETTINGS.contract_expiring_days,
    ),
    contract_overdue_critical_days: numOrDefault(
      partial.contract_overdue_critical_days,
      DEFAULT_ALARM_SETTINGS.contract_overdue_critical_days,
    ),
    insurance_expiring_days: numOrDefault(
      partial.insurance_expiring_days,
      DEFAULT_ALARM_SETTINGS.insurance_expiring_days,
    ),
    inspection_expiring_days: numOrDefault(
      partial.inspection_expiring_days,
      DEFAULT_ALARM_SETTINGS.inspection_expiring_days,
    ),
    tax_expiring_days: numOrDefault(
      partial.tax_expiring_days,
      DEFAULT_ALARM_SETTINGS.tax_expiring_days,
    ),
    loan_due_days: numOrDefault(partial.loan_due_days, DEFAULT_ALARM_SETTINGS.loan_due_days),
    idle_alert_days: numOrDefault(partial.idle_alert_days, DEFAULT_ALARM_SETTINGS.idle_alert_days),
    request_due_days: numOrDefault(
      partial.request_due_days,
      DEFAULT_ALARM_SETTINGS.request_due_days,
    ),
    ignition_recommend_days: numOrDefault(
      partial.ignition_recommend_days,
      DEFAULT_ALARM_SETTINGS.ignition_recommend_days,
    ),
    daily_report_required:
      typeof partial.daily_report_required === 'boolean'
        ? partial.daily_report_required
        : DEFAULT_ALARM_SETTINGS.daily_report_required,
  };
}

function numOrDefault(v: unknown, d: number): number {
  if (v === null || v === undefined || v === '') return d;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return d;
  return Math.floor(n);
}
