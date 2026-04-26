'use client';

/**
 * useGapCheckCounts — 사이드바 카운트 ↔ gap-check 실시간 동기화 (Phase 12).
 *
 * - useRtdbCollection으로 6개 컬렉션 구독
 * - runGapCheck() → getCategoryCounts() → 5종 카운트 반환
 * - lib/stores/menu-counts와 별개의 derived view (기존 v2 카운트와 충돌 없음)
 */

import { useRtdbCollection } from '@/lib/collections/rtdb';
import { type GapCheckCounts, getCategoryCounts, runGapCheck } from '@/lib/gap-check';
import { useAlarmSettings } from '@/lib/hooks/useAlarmSettings';
import type { RtdbAsset, RtdbBilling, RtdbContract, RtdbEvent } from '@/lib/types/rtdb-entities';
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

const EMPTY_COUNTS: GapCheckCounts = {
  pending: 0,
  finance: 0,
  contract: 0,
  asset: 0,
  journal: 0,
};

export function useGapCheckCounts(): GapCheckCounts {
  const assets = useRtdbCollection<RtdbAsset>('assets');
  const contracts = useRtdbCollection<RtdbContract>('contracts');
  const billings = useRtdbCollection<RtdbBilling>('billings');
  const events = useRtdbCollection<RtdbEvent>('events');
  const insurances = useRtdbCollection<InsuranceRow>('insurances');
  const tasks = useRtdbCollection<TaskRow>('tasks');
  const { settings: alarm } = useAlarmSettings();

  return useMemo(() => {
    const anyLoading =
      assets.loading ||
      contracts.loading ||
      billings.loading ||
      events.loading ||
      insurances.loading ||
      tasks.loading;
    if (anyLoading) return EMPTY_COUNTS;

    const items = runGapCheck({
      assets: assets.data,
      contracts: contracts.data,
      billings: billings.data,
      events: events.data,
      extra: {
        insurances: insurances.data,
        tasks: tasks.data,
      },
      alarm,
    });
    return getCategoryCounts(items);
  }, [
    assets.data,
    assets.loading,
    contracts.data,
    contracts.loading,
    billings.data,
    billings.loading,
    events.data,
    events.loading,
    insurances.data,
    insurances.loading,
    tasks.data,
    tasks.loading,
    alarm,
  ]);
}
