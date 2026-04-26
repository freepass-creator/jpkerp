'use client';

/**
 * 업무현황 (Phase 7) — 4 카테고리 미결 통합 dashboard.
 *
 * 데이터 흐름:
 *   useRtdbCollection(assets·contracts·billings·events·insurances·tasks)
 *   → runGapCheck() → groupByCategory() → 4 .pending-section 렌더
 *
 * 클릭 동작:
 *   - .pending-head .goto: 카테고리 메뉴로 router.push (CATEGORY_META.gotoMenu)
 *   - .pending-row: item.route ?? 카테고리 기본 라우트로 router.push (Phase 7 wiring)
 *
 * Empty state: 모든 미결 0건 → 큰 ✓ 메시지
 */

import { useRtdbCollection } from '@/lib/collections/rtdb';
import {
  CATEGORY_META,
  type PendingCategory,
  type PendingItem,
  gotoRoute,
  groupByCategory,
  runGapCheck,
} from '@/lib/gap-check';
import type { RtdbAsset, RtdbBilling, RtdbContract, RtdbEvent } from '@/lib/types/rtdb-entities';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';

interface InsuranceRow {
  car_number?: string;
  end_date?: string;
  status?: string;
  [k: string]: unknown;
}

interface TaskRow {
  title?: string;
  due_date?: string;
  state?: string;
  car_number?: string;
  [k: string]: unknown;
}

const CATEGORIES: PendingCategory[] = ['재무', '계약', '자산', '업무'];

export default function PendingPage() {
  const router = useRouter();
  const assets = useRtdbCollection<RtdbAsset>('assets');
  const contracts = useRtdbCollection<RtdbContract>('contracts');
  const billings = useRtdbCollection<RtdbBilling>('billings');
  const events = useRtdbCollection<RtdbEvent>('events');
  const insurances = useRtdbCollection<InsuranceRow>('insurances');
  const tasks = useRtdbCollection<TaskRow>('tasks');

  const items = useMemo(
    () =>
      runGapCheck({
        assets: assets.data,
        contracts: contracts.data,
        billings: billings.data,
        events: events.data,
        extra: {
          insurances: insurances.data,
          tasks: tasks.data,
        },
      }),
    [assets.data, contracts.data, billings.data, events.data, insurances.data, tasks.data],
  );

  const grouped = useMemo(() => groupByCategory(items), [items]);
  const totalCount = items.reduce((sum, it) => sum + it.count, 0);

  const anyLoading =
    assets.loading ||
    contracts.loading ||
    billings.loading ||
    events.loading ||
    insurances.loading ||
    tasks.loading;

  const isEmpty = items.length === 0 && !anyLoading;

  const handleRowClick = (item: PendingItem) => {
    router.push(gotoRoute(item));
  };

  const handleGoto = (cat: PendingCategory) => {
    const meta = CATEGORY_META[cat];
    router.push(routeForMenu(meta.gotoMenu));
  };

  return (
    <>
      <div className="page-head">
        <i className="ph ph-push-pin" />
        <div className="title">업무현황</div>
        <div className="crumbs">
          › 전체 {totalCount}건 · {nowLabel()} 기준
        </div>
      </div>

      {anyLoading ? (
        <div
          style={{
            padding: 24,
            color: 'var(--c-text-muted)',
            textAlign: 'center',
            background: 'var(--c-surface)',
            border: '1px solid var(--c-border)',
          }}
        >
          <i className="ph ph-spinner spin" /> 미결 데이터 로드 중...
        </div>
      ) : isEmpty ? (
        <div className="pending-empty">
          <i className="ph ph-check-circle" />
          <div className="title">모든 업무가 정상</div>
          <div className="desc">미결 0건 — 오늘 처리할 업무가 없습니다.</div>
        </div>
      ) : (
        CATEGORIES.map((cat) => {
          const list = grouped[cat];
          if (list.length === 0) return null;
          const meta = CATEGORY_META[cat];
          const sum = list.reduce((s, it) => s + it.count, 0);

          return (
            <div key={cat} className="pending-section">
              <div className="pending-head">
                <i className={`ph ${meta.icon} ico`} />
                <span className="title">{cat}</span>
                <span className="count">· {sum}건</span>
                <button type="button" className="goto" onClick={() => handleGoto(cat)}>
                  {meta.gotoLabel}
                </button>
              </div>
              <div className="pending-list">
                {list.map((item) => (
                  <div
                    key={item.id}
                    className="pending-row"
                    onClick={() => handleRowClick(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleRowClick(item);
                      }
                    }}
                    // biome-ignore lint/a11y/useSemanticElements: 행 내부에 별도 액션 <button>이 있어 button nested 불가
                    role="button"
                    tabIndex={0}
                  >
                    <div className="lbl">{item.label}</div>
                    <div className="desc">{item.description}</div>
                    <div className={`pri ${priorityClass(item.priority)}`}>
                      {priorityLabel(item.priority)}
                    </div>
                    <button
                      type="button"
                      className="act"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRowClick(item);
                      }}
                    >
                      {item.action}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
    </>
  );
}

/* ═════════ helpers ═════════ */

function priorityLabel(p: PendingItem['priority']): string {
  switch (p) {
    case 'urgent':
      return '긴급';
    case 'warn':
      return '중요';
    default:
      return '정기';
  }
}

function priorityClass(p: PendingItem['priority']): string {
  switch (p) {
    case 'urgent':
      return '';
    case 'warn':
      return 'warn';
    default:
      return 'normal';
  }
}

function routeForMenu(menu: 'finance' | 'contract' | 'asset' | 'journal'): string {
  const M: Record<string, string> = {
    finance: '/ledger',
    contract: '/contract',
    asset: '/asset',
    journal: '/operation',
  };
  return M[menu] ?? '/';
}

function nowLabel(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}
