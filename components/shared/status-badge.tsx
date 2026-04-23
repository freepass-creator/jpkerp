/**
 * 상태 뱃지 — 계약상태·차량상태·D-day 등 텍스트 + 색상 tone 을 하나로.
 *
 * 사용 예:
 *   <StatusBadge tone="success">계약진행</StatusBadge>
 *   <StatusBadge tone={dDay < 0 ? 'danger' : dDay <= 30 ? 'warn' : 'success'}>D-{dDay}</StatusBadge>
 *   <StatusBadge dDay={matchedContract ? daysBetween(today(), contractEnd) : null} />
 *
 * 내부적으로 `.jpk-pill tone-*` 클래스 재사용 — 웹·모바일 공통 스타일.
 */
import type { ReactNode } from 'react';

export type BadgeTone = 'success' | 'warn' | 'danger' | 'primary' | 'neutral';

interface Props {
  /** 직접 톤 지정. `dDay` 있으면 자동 계산됨. */
  tone?: BadgeTone;
  /** D-day 숫자. 음수=경과, <=30=임박, 그 외=여유. 자동 라벨링. */
  dDay?: number | null;
  children?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function StatusBadge({ tone, dDay, children, className = '', style }: Props) {
  // dDay 자동 포맷팅
  if (dDay !== undefined && dDay !== null) {
    const autoTone: BadgeTone =
      dDay < 0 ? 'danger'
      : dDay === 0 ? 'warn'
      : dDay <= 30 ? 'warn'
      : 'success';
    const label = dDay < 0 ? `만기 ${-dDay}일 경과`
      : dDay === 0 ? 'D-day'
      : `D-${dDay}`;
    return (
      <span className={`jpk-pill tone-${tone ?? autoTone} ${className}`} style={style}>
        {children ?? label}
      </span>
    );
  }
  return (
    <span className={`jpk-pill tone-${tone ?? 'neutral'} ${className}`} style={style}>
      {children}
    </span>
  );
}

/**
 * 계약상태 문자열 → 톤 매핑 헬퍼 (단독 사용 가능).
 */
export function toneForContractStatus(status?: string | null): BadgeTone {
  switch (status) {
    case '계약진행': return 'success';
    case '계약해지': return 'danger';
    case '계약완료': return 'neutral';
    case '휴차': return 'warn';
    case '가동중':
    case '사용중': return 'success';
    case '상품':
    case '상품화대기': return 'primary';
    case '정비중': return 'warn';
    default: return 'neutral';
  }
}
