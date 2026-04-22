'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import { computeDashboardStats } from '@/lib/dashboard-stats';
import { KpiCard } from '@/components/shared/kpi-card';
import { fmt, fmtDate } from '@/lib/utils';
import { metaFor } from '@/lib/event-meta';
import type { RtdbEvent } from '@/lib/types/rtdb-entities';

export function DashboardClient() {
  const assets = useRtdbCollection<Record<string, unknown>>('assets');
  const contracts = useRtdbCollection<Record<string, unknown>>('contracts');
  const billings = useRtdbCollection<Record<string, unknown>>('billings');
  const events = useRtdbCollection<RtdbEvent>('events');

  const loading = assets.loading || contracts.loading || billings.loading || events.loading;
  const error = assets.error || contracts.error || billings.error || events.error;

  const stats = useMemo(() => {
    if (loading) return null;
    return computeDashboardStats({
      assets: assets.data,
      contracts: contracts.data,
      billings: billings.data,
      events: events.data,
    });
  }, [assets.data, contracts.data, billings.data, events.data, loading]);

  const recent = useMemo(() => {
    return events.data
      .filter((e) => e.status !== 'deleted')
      .sort((a, b) => Number(b.created_at ?? 0) - Number(a.created_at ?? 0))
      .slice(0, 8);
  }, [events.data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-text-muted">
        <i className="ph ph-spinner spin" />
        <span>데이터 불러오는 중...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="panel p-4">
          <div className="font-bold text-danger mb-1">데이터 로드 실패</div>
          <div className="text-text-sub">{error.message}</div>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const pendingRows = [
    { icon: 'ph-truck', label: '출고 대기', count: stats.pending_tasks.not_delivered, href: '/status/pending' },
    { icon: 'ph-warning-circle', label: '통장·카드 미매칭', count: stats.pending_tasks.unmatched_bank, href: '/ledger' },
    { icon: 'ph-warning-octagon', label: '사고 미종결', count: stats.pending_tasks.open_accidents, href: '/status/pending', tone: 'danger' as const },
    { icon: 'ph-coins', label: '면책금 미수', count: stats.pending_tasks.unpaid_deductibles, href: '/operation/accident', tone: 'warn' as const },
    { icon: 'ph-wrench', label: '차량케어 진행중', count: stats.pending_tasks.open_works, href: '/status/pending' },
    { icon: 'ph-phone', label: '응대 진행중', count: stats.pending_tasks.open_contacts, href: '/operation/contact' },
    { icon: 'ph-clock-countdown', label: '미수 조치 미완료', count: stats.pending_tasks.open_collects, href: '/status/overdue', tone: 'warn' as const },
  ];

  const quickActions = [
    { icon: 'ph-stack-plus', label: '운영업무 입력', href: '/input/operation', tone: 'primary' as const },
    { icon: 'ph-receipt', label: '과태료작업', href: '/input/operation?type=penalty_notice' },
    { icon: 'ph-bank', label: '자금 CSV 업로드', href: '/fund' },
    { icon: 'ph-upload-simple', label: '일괄 불러오기', href: '/upload' },
    { icon: 'ph-file-text', label: '개별 입력', href: '/input' },
  ];

  return (
    <div className="space-y-6">
      {/* KPI */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="활성 계약" value={fmt(stats.active_contracts)} sub={`자산 ${stats.total_assets}대 · 가동률 ${stats.utilization_rate}%`} />
        <KpiCard label="이번달 신규" value={fmt(stats.month_new_contracts)} tone="primary" />
        <KpiCard label="만기 임박 (14일)" value={fmt(stats.month_expiring_14d)} tone="warn" />
        <KpiCard label="미납 현황" value={`${fmt(Math.round(stats.overdue_amount))}원`} sub={`${stats.overdue_count}건 · 총 미수 ${fmt(Math.round(stats.total_unpaid))}`} tone="danger" />
      </section>

      {/* Quick actions */}
      <section>
        <div className="font-bold mb-3 flex items-center gap-2">
          <i className="ph ph-lightning text-primary" />바로가기
        </div>
        <div className="flex gap-2 flex-wrap">
          {quickActions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className={`btn btn-sm ${a.tone === 'primary' ? 'btn-primary' : 'btn-outline'}`}
              style={{ textDecoration: 'none' }}
            >
              <i className={`ph ${a.icon}`} />
              {a.label}
            </Link>
          ))}
        </div>
      </section>

      {/* Pending + Recent 2-column */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* 미결업무 */}
        <div>
          <div className="font-bold mb-3 flex items-center gap-2">
            <i className="ph ph-warning-circle text-warn" />
            오늘 처리해야 할 일
            <span className="text-text-muted text-xs font-normal">· 클릭하면 해당 목록으로</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {pendingRows.map((row) => {
              const toneClass =
                row.tone === 'danger' ? 'text-danger'
                  : row.tone === 'warn' ? 'text-warn'
                    : row.count > 0 ? 'text-text' : 'text-text-muted';
              return (
                <Link
                  key={row.label}
                  href={row.href}
                  className="panel dashboard-row"
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <i className={`ph ${row.icon} ${toneClass} text-[16px]`} />
                  <div className="flex-1">{row.label}</div>
                  <div className={`text-base font-bold num ${row.count > 0 ? toneClass : 'text-text-muted'}`}>
                    {row.count}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* 최근 이벤트 */}
        <div>
          <div className="font-bold mb-3 flex items-center gap-2">
            <i className="ph ph-clock-counter-clockwise text-text-sub" />
            최근 입력 이력
            <span className="text-text-muted text-xs font-normal">· 최신 {recent.length}건</span>
          </div>
          <div className="panel" style={{ padding: 0 }}>
            {recent.length === 0 ? (
              <div className="text-text-muted text-xs" style={{ padding: 24, textAlign: 'center' }}>
                입력 이력이 없습니다
              </div>
            ) : (
              <div>
                {recent.map((e) => {
                  const meta = metaFor(e.type ?? '');
                  return (
                    <Link
                      key={e._key}
                      href={e.car_number ? `/asset/${encodeURIComponent(e.car_number)}` : '/operation'}
                      className="dashboard-recent-row"
                      style={{ textDecoration: 'none', color: 'inherit' }}
                    >
                      <span className="dashboard-recent-date num">{fmtDate(e.date)}</span>
                      <i className={`ph ${meta.icon} text-xl`} style={{ color: meta.color }} />
                      <span className="dashboard-recent-type">{meta.label}</span>
                      <span className="dashboard-recent-car num">{e.car_number ?? '—'}</span>
                      <span className="dashboard-recent-title">{e.title ?? '-'}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
