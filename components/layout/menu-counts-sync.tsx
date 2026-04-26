'use client';

import { useRtdbCollection } from '@/lib/collections/rtdb';
import {
  computeContractEnd,
  computeTotalDue,
  isActiveContract,
  normalizeDate,
  today,
} from '@/lib/date-utils';
import { useAlarmSettings } from '@/lib/hooks/useAlarmSettings';
import { useMenuCounts } from '@/lib/stores/menu-counts';
import type { RtdbAsset, RtdbBilling, RtdbContract, RtdbEvent } from '@/lib/types/rtdb-entities';
import { useEffect, useRef } from 'react';

/**
 * RTDB 전체 구독 → 메뉴 카운트 Zustand 스토어로 동기화.
 * 워크스페이스 루트에 1회만 마운트.
 */
export function MenuCountsSync() {
  const assets = useRtdbCollection<RtdbAsset>('assets');
  const contracts = useRtdbCollection<RtdbContract>('contracts');
  const billings = useRtdbCollection<RtdbBilling>('billings');
  const events = useRtdbCollection<RtdbEvent>('events');
  const customers = useRtdbCollection<Record<string, unknown>>('customers');
  const vendors = useRtdbCollection<Record<string, unknown>>('vendors');
  const cards = useRtdbCollection<Record<string, unknown>>('cards');
  const bankAccounts = useRtdbCollection<Record<string, unknown>>('bank_accounts');
  const partners = useRtdbCollection<Record<string, unknown>>('partners');
  const users = useRtdbCollection<Record<string, unknown>>('users');
  const loans = useRtdbCollection<Record<string, unknown>>('loans');
  const insurances = useRtdbCollection<Record<string, unknown>>('insurances');
  const { settings: alarm } = useAlarmSettings();
  const setCounts = useMenuCounts((s) => s.setCounts);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    // 12개 컬렉션 변경 시마다 전체 재계산하지 않고 400ms 디바운스
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      compute();
    }, 400);
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    function compute() {
      const t = today();
      const tDate = new Date(t);

      // 활성 계약 차량
      const activeCars = new Set(
        contracts.data
          .filter((c) => isActiveContract(c))
          .map((c) => c.car_number)
          .filter(Boolean) as string[],
      );

      // 휴차 (계약 없음)
      const idle = assets.data.filter(
        (a) => a.status !== 'deleted' && a.car_number && !activeCars.has(a.car_number),
      ).length;

      // 상품대기 = 휴차와 같은 기준 (freepasserp 연동 전)
      const product = idle;

      // 만기도래 (alarm.contract_expiring_days 이내)
      const limit = new Date(tDate);
      limit.setDate(limit.getDate() + alarm.contract_expiring_days);
      const limitStr = limit.toISOString().slice(0, 10);
      const expiring = contracts.data.filter((c) => {
        if (c.status === 'deleted') return false;
        if (!c.contractor_name?.trim()) return false;
        const end = computeContractEnd(c);
        return end && end >= t && end <= limitStr;
      }).length;

      // 미납 (계약자별이 아닌 레코드 수)
      const overdue = billings.data.filter((b) => {
        const due = computeTotalDue(b);
        const paid = Number(b.paid_total) || 0;
        return paid < due && b.due_date && b.due_date < t;
      }).length;

      // 시동제어
      const ignition = contracts.data.filter(
        (c) =>
          c.status !== 'deleted' &&
          c.action_status &&
          ['시동제어', '제어해제'].includes(c.action_status),
      ).length;

      // 미결업무 (3종)
      const openAccident = events.data.filter(
        (e) =>
          e.type === 'accident' &&
          e.status !== 'deleted' &&
          e.accident_status &&
          e.accident_status !== '종결',
      ).length;
      const openCare = events.data.filter(
        (e) =>
          e.status !== 'deleted' &&
          ['maint', 'maintenance', 'repair', 'product', 'wash'].includes(e.type ?? '') &&
          e.work_status !== '완료',
      ).length;
      const delivered = new Set(
        events.data
          .filter((e) => e.type === 'delivery' && e.status !== 'deleted')
          .map((e) => e.car_number),
      );
      const notDelivered = contracts.data.filter((c) => {
        if (c.status === 'deleted') return false;
        if (!c.contractor_name?.trim()) return false;
        const s = normalizeDate(c.start_date);
        if (!s || s > t) return false;
        const e = computeContractEnd(c);
        if (e && e < t) return false;
        return !delivered.has(c.car_number);
      }).length;
      const pending = openAccident + openCare + notDelivered;

      // 반납 일정 = 만기도래와 동일 로직
      const returnSchedule = expiring;

      // 계약
      const contractCount = contracts.data.filter((c) => c.status !== 'deleted').length;

      // 운영이력 타입별
      const byType = (type: string | string[]) => {
        const types = Array.isArray(type) ? type : [type];
        return events.data.filter((e) => e.status !== 'deleted' && e.type && types.includes(e.type))
          .length;
      };

      setCounts({
        overdue,
        idle,
        product,
        expiring,
        pending,
        ignition,
        operationTotal: assets.data.filter((a) => a.status !== 'deleted').length,

        asset: assets.data.filter((a) => a.status !== 'deleted').length,
        loan: loans.data.filter((l) => (l as { status?: string }).status !== 'deleted').length,
        insurance: insurances.data.filter((i) => (i as { status?: string }).status !== 'deleted')
          .length,
        disposal: assets.data.filter((a) => {
          const s = (a as { asset_status?: string }).asset_status;
          return (
            a.status !== 'deleted' &&
            (s === '매각' || s === '매각대기' || (a as { disposed_at?: string }).disposed_at)
          );
        }).length,

        operation: events.data.filter((e) => e.status !== 'deleted').length,
        opContact: byType('contact'),
        opDelivery: byType(['delivery', 'return', 'force', 'transfer']),
        opMaint: byType(['maint', 'maintenance', 'repair']),
        opAccident: byType('accident'),
        opWash: byType('wash'),
        returnSchedule,
        contract: contractCount,
        customer: customers.data.length,
        billing: billings.data.filter((b) => b.status !== 'deleted').length,

        staff: users.data.length,
        member: partners.data.length,
        vendor: vendors.data.length,
        card: cards.data.length,
        account: bankAccounts.data.length,
      });
    }
  }, [
    assets.data,
    contracts.data,
    billings.data,
    events.data,
    customers.data,
    vendors.data,
    cards.data,
    bankAccounts.data,
    partners.data,
    users.data,
    loans.data,
    insurances.data,
    alarm,
    setCounts,
  ]);

  return null;
}
