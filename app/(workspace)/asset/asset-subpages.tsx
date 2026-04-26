'use client';

/**
 * 자산관리 sub-tab 활성화 (Phase 13)
 *  - 보험 / 수선 / 검사 / 자동차세 / 처분
 * 각 sub-tab은 events 컬렉션의 특정 type을 추출해 v3 패턴 (alert + table)으로 표시.
 */

import { useRtdbCollection } from '@/lib/collections/rtdb';
import { useAlarmSettings } from '@/lib/hooks/useAlarmSettings';
import type { RtdbAsset, RtdbEvent } from '@/lib/types/rtdb-entities';
import { fmt, fmtDate } from '@/lib/utils';
import { useMemo, useState } from 'react';

type EventLike = RtdbEvent;

function StatusFilter({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { key: string; label: string; count: number }[];
}) {
  return (
    <div className="timeline-filter">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          className={`chip ${value === o.key ? 'is-active' : ''}`}
          onClick={() => onChange(o.key)}
        >
          {o.label}
          {o.count > 0 && <span className="cnt">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="v3-subtab-empty">{label}</div>;
}

interface AlertCardProps {
  severity: 'danger' | 'warn' | 'info';
  icon: string;
  head: string;
  desc: string;
  count: number;
}

function AlertSection({ alerts }: { alerts: AlertCardProps[] }) {
  const isClear = alerts.length === 0;
  const total = alerts.reduce((s, a) => s + a.count, 0);
  return (
    <div className={`v3-alerts ${isClear ? 'is-clear' : ''}`}>
      <div className="v3-alerts-head">
        <span className="dot" />
        <span className="title">{isClear ? '정상' : '점검 필요'}</span>
        <span className="count">{isClear ? '· 0건' : `· ${total}건`}</span>
      </div>
      {!isClear && (
        <div className="v3-alerts-grid">
          {alerts.map((a) => (
            <div
              key={a.head}
              className={`v3-alert-card ${a.severity === 'danger' ? 'is-danger' : a.severity === 'info' ? 'is-info' : ''}`}
            >
              <i className={`ph ${a.icon} ico`} />
              <div className="body">
                <div className="head">{a.head}</div>
                <div className="desc">{a.desc}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────── 보험 sub-tab ─────────────── */

export function InsuranceSubpage() {
  const events = useRtdbCollection<EventLike>('events');
  const assets = useRtdbCollection<RtdbAsset>('assets');
  const { settings: alarm } = useAlarmSettings();
  const [filter, setFilter] = useState<string>('all');
  const insThreshold = alarm.insurance_expiring_days;

  const insurances = useMemo(
    () =>
      events.data
        .filter((e) => e.type === 'insurance')
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')),
    [events.data],
  );

  const noIns = useMemo(
    () =>
      assets.data.filter(
        (a) =>
          !insurances.some((e) => e.car_number === a.car_number) &&
          a.asset_status !== '매각' &&
          a.asset_status !== '폐차',
      ),
    [assets.data, insurances],
  );

  // 만기 임박 (expire_date가 today + insThreshold 이내)
  const expiring = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getTime() + insThreshold * 86400000);
    return insurances.filter((e) => {
      const v = e.expire_date as string | undefined;
      if (!v) return false;
      const d = new Date(String(v));
      if (Number.isNaN(d.getTime())) return false;
      return d >= now && d <= cutoff;
    });
  }, [insurances, insThreshold]);

  const filterOpts = [
    { key: 'all', label: '전체', count: insurances.length },
    {
      key: 'kind:대인',
      label: '대인',
      count: insurances.filter((e) => String(e.ins_kind ?? '').includes('대인')).length,
    },
    {
      key: 'kind:자차',
      label: '자차',
      count: insurances.filter((e) => String(e.ins_kind ?? '').includes('자차')).length,
    },
    { key: 'expiring', label: `${insThreshold}일내 만기`, count: expiring.length },
  ];

  const filtered = useMemo(() => {
    if (filter === 'all') return insurances;
    if (filter === 'expiring') return expiring;
    if (filter.startsWith('kind:')) {
      const k = filter.slice(5);
      return insurances.filter((e) => String(e.ins_kind ?? '').includes(k));
    }
    return insurances;
  }, [filter, insurances, expiring]);

  const alerts: AlertCardProps[] = [];
  if (noIns.length > 0) {
    alerts.push({
      severity: 'warn',
      icon: 'ph-shield-warning',
      head: `보험 미연결 ${noIns.length}대`,
      desc: noIns
        .slice(0, 3)
        .map((a) => a.car_number)
        .filter(Boolean)
        .join(' · '),
      count: noIns.length,
    });
  }
  if (expiring.length > 0) {
    alerts.push({
      severity: 'warn',
      icon: 'ph-clock',
      head: `${insThreshold}일내 만기 ${expiring.length}건`,
      desc: expiring
        .slice(0, 3)
        .map((e) => `${e.car_number ?? '—'} (${String(e.expire_date ?? '')})`)
        .join(' · '),
      count: expiring.length,
    });
  }

  return (
    <div className="v3-subpage is-active">
      <AlertSection alerts={alerts} />
      <StatusFilter value={filter} onChange={setFilter} options={filterOpts} />
      <div className="v3-table-wrap">
        {events.loading ? (
          <EmptyState label="로드 중..." />
        ) : filtered.length === 0 ? (
          <EmptyState label="보험 이벤트가 없습니다" />
        ) : (
          <table className="v3-subtab-table">
            <thead>
              <tr>
                <th style={{ width: 100 }}>가입일</th>
                <th style={{ width: 110 }}>차량번호</th>
                <th>보험사</th>
                <th>종목</th>
                <th>가입자</th>
                <th className="right" style={{ width: 110 }}>
                  보험료
                </th>
                <th style={{ width: 110 }}>만기일</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e._key}>
                  <td>{fmtDate(e.date) || '—'}</td>
                  <td>{e.car_number ?? '—'}</td>
                  <td>{String(e.insurance_company ?? e.vendor ?? '—')}</td>
                  <td>{String(e.ins_kind ?? '—')}</td>
                  <td>{String(e.contractor_name ?? e.customer_name ?? '—')}</td>
                  <td className="right">{Number(e.amount) > 0 ? fmt(Number(e.amount)) : '—'}</td>
                  <td>{fmtDate(String(e.expire_date ?? '')) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="v3-table-foot">
        <div>
          총 {filtered.length}건<span className="sep">│</span>
          보험료 합계 {fmt(filtered.reduce((s, e) => s + (Number(e.amount) || 0), 0))}원
        </div>
      </div>
    </div>
  );
}

/* ─────────────── 수선 sub-tab ─────────────── */

export function RepairSubpage() {
  const events = useRtdbCollection<EventLike>('events');
  const [filter, setFilter] = useState<string>('all');

  const repairs = useMemo(
    () =>
      events.data
        .filter((e) => e.type === 'maint' || e.type === 'maintenance' || e.type === 'repair')
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')),
    [events.data],
  );

  const filterOpts = [
    { key: 'all', label: '전체', count: repairs.length },
    {
      key: 'open',
      label: '진행',
      count: repairs.filter((e) => String(e.work_status ?? '') === '진행').length,
    },
    {
      key: 'done',
      label: '완료',
      count: repairs.filter((e) => String(e.work_status ?? '') === '완료').length,
    },
  ];

  const filtered = useMemo(() => {
    if (filter === 'all') return repairs;
    if (filter === 'open') return repairs.filter((e) => String(e.work_status ?? '') === '진행');
    if (filter === 'done') return repairs.filter((e) => String(e.work_status ?? '') === '완료');
    return repairs;
  }, [filter, repairs]);

  return (
    <div className="v3-subpage is-active">
      <AlertSection alerts={[]} />
      <StatusFilter value={filter} onChange={setFilter} options={filterOpts} />
      <div className="v3-table-wrap">
        {events.loading ? (
          <EmptyState label="로드 중..." />
        ) : filtered.length === 0 ? (
          <EmptyState label="수선 이벤트가 없습니다" />
        ) : (
          <table className="v3-subtab-table">
            <thead>
              <tr>
                <th style={{ width: 100 }}>입고일</th>
                <th style={{ width: 110 }}>차량번호</th>
                <th>수선처</th>
                <th>내용</th>
                <th style={{ width: 80 }}>상태</th>
                <th className="right" style={{ width: 110 }}>
                  금액
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e._key}>
                  <td>{fmtDate(e.date) || '—'}</td>
                  <td>{e.car_number ?? '—'}</td>
                  <td>{e.vendor ?? '—'}</td>
                  <td>{e.title ?? e.memo ?? '—'}</td>
                  <td>{String(e.work_status ?? '—')}</td>
                  <td className="right">{Number(e.amount) > 0 ? fmt(Number(e.amount)) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="v3-table-foot">
        <div>
          총 {filtered.length}건<span className="sep">│</span>
          수선비 합계 {fmt(filtered.reduce((s, e) => s + (Number(e.amount) || 0), 0))}원
        </div>
      </div>
    </div>
  );
}

/* ─────────────── 검사 sub-tab ─────────────── */

export function InspectionSubpage() {
  const events = useRtdbCollection<EventLike>('events');
  const assets = useRtdbCollection<RtdbAsset>('assets');
  const { settings: alarm } = useAlarmSettings();
  const [filter, setFilter] = useState<string>('all');
  const inspThreshold = alarm.inspection_expiring_days;

  const inspections = useMemo(
    () =>
      events.data
        .filter((e) => e.type === 'inspection')
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')),
    [events.data],
  );

  // 검사 만료 예정 (자산.inspection_valid_until 기준 — alarm.inspection_expiring_days)
  const expiring = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getTime() + inspThreshold * 86400000);
    return assets.data.filter((a) => {
      const v = a.inspection_valid_until;
      if (!v) return false;
      const d = new Date(String(v));
      return d <= cutoff && d >= now;
    });
  }, [assets.data, inspThreshold]);

  const overdue = useMemo(() => {
    const now = new Date();
    return assets.data.filter((a) => {
      const v = a.inspection_valid_until;
      if (!v) return false;
      const d = new Date(String(v));
      return d < now;
    });
  }, [assets.data]);

  const filterOpts = [
    { key: 'all', label: '전체이력', count: inspections.length },
    { key: 'expiring', label: `${inspThreshold}일내 만료`, count: expiring.length },
    { key: 'overdue', label: '만료', count: overdue.length },
  ];

  const filtered = useMemo(() => {
    if (filter === 'all') return inspections;
    return inspections;
  }, [filter, inspections]);

  const alerts: AlertCardProps[] = [];
  if (overdue.length > 0) {
    alerts.push({
      severity: 'danger',
      icon: 'ph-warning',
      head: `검사 만료 ${overdue.length}대`,
      desc: overdue
        .slice(0, 3)
        .map((a) => `${a.car_number} (${a.inspection_valid_until})`)
        .join(' · '),
      count: overdue.length,
    });
  }
  if (expiring.length > 0) {
    alerts.push({
      severity: 'warn',
      icon: 'ph-clock',
      head: `${inspThreshold}일내 만료 ${expiring.length}대`,
      desc: expiring
        .slice(0, 3)
        .map((a) => `${a.car_number} (${a.inspection_valid_until})`)
        .join(' · '),
      count: expiring.length,
    });
  }

  return (
    <div className="v3-subpage is-active">
      <AlertSection alerts={alerts} />
      <StatusFilter value={filter} onChange={setFilter} options={filterOpts} />
      <div className="v3-table-wrap">
        {filter === 'expiring' || filter === 'overdue' ? (
          (() => {
            const list = filter === 'expiring' ? expiring : overdue;
            if (list.length === 0) {
              return <EmptyState label="해당 차량이 없습니다" />;
            }
            return (
              <table className="v3-subtab-table">
                <thead>
                  <tr>
                    <th style={{ width: 110 }}>차량번호</th>
                    <th>차종</th>
                    <th style={{ width: 110 }}>만료일</th>
                    <th>회원사</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((a) => (
                    <tr key={a._key}>
                      <td>{a.car_number ?? '—'}</td>
                      <td>
                        {[a.manufacturer, a.car_model, a.detail_model].filter(Boolean).join(' ') ||
                          '—'}
                      </td>
                      <td>{fmtDate(String(a.inspection_valid_until ?? '')) || '—'}</td>
                      <td>{a.partner_code ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()
        ) : events.loading ? (
          <EmptyState label="로드 중..." />
        ) : filtered.length === 0 ? (
          <EmptyState label="검사 이력이 없습니다" />
        ) : (
          <table className="v3-subtab-table">
            <thead>
              <tr>
                <th style={{ width: 100 }}>검사일</th>
                <th style={{ width: 110 }}>차량번호</th>
                <th>검사처</th>
                <th>결과</th>
                <th className="right" style={{ width: 110 }}>
                  비용
                </th>
                <th style={{ width: 110 }}>다음 만료</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e._key}>
                  <td>{fmtDate(e.date) || '—'}</td>
                  <td>{e.car_number ?? '—'}</td>
                  <td>{e.vendor ?? '—'}</td>
                  <td>{String(e.work_status ?? e.title ?? '—')}</td>
                  <td className="right">{Number(e.amount) > 0 ? fmt(Number(e.amount)) : '—'}</td>
                  <td>{fmtDate(String(e.expire_date ?? '')) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="v3-table-foot">
        <div>
          이력 {inspections.length}건<span className="sep">│</span>
          만료 {overdue.length}대<span className="sep">│</span>
          {inspThreshold}일내 {expiring.length}대
        </div>
      </div>
    </div>
  );
}

/* ─────────────── 자동차세 sub-tab ─────────────── */

export function TaxSubpage() {
  const events = useRtdbCollection<EventLike>('events');
  const [filter, setFilter] = useState<string>('all');

  const taxes = useMemo(
    () =>
      events.data
        .filter(
          (e) =>
            e.type === 'tax_payment' ||
            (e.type === 'bank_tx' && /자동차세|자동\s*차\s*세/.test(String(e.title ?? ''))),
        )
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')),
    [events.data],
  );

  const yearGroups = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of taxes) {
      const y = String(e.date ?? '').slice(0, 4);
      if (!y) continue;
      map.set(y, (map.get(y) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [taxes]);

  const filterOpts = [
    { key: 'all', label: '전체', count: taxes.length },
    ...yearGroups.slice(0, 4).map(([y, c]) => ({ key: `y:${y}`, label: y, count: c })),
  ];

  const filtered = useMemo(() => {
    if (filter === 'all') return taxes;
    if (filter.startsWith('y:')) {
      const y = filter.slice(2);
      return taxes.filter((e) => String(e.date ?? '').startsWith(y));
    }
    return taxes;
  }, [filter, taxes]);

  return (
    <div className="v3-subpage is-active">
      <AlertSection alerts={[]} />
      <StatusFilter value={filter} onChange={setFilter} options={filterOpts} />
      <div className="v3-table-wrap">
        {events.loading ? (
          <EmptyState label="로드 중..." />
        ) : filtered.length === 0 ? (
          <EmptyState label="자동차세 이력이 없습니다" />
        ) : (
          <table className="v3-subtab-table">
            <thead>
              <tr>
                <th style={{ width: 100 }}>납부일</th>
                <th style={{ width: 110 }}>차량번호</th>
                <th>구분</th>
                <th>회원사</th>
                <th className="right" style={{ width: 110 }}>
                  금액
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e._key}>
                  <td>{fmtDate(e.date) || '—'}</td>
                  <td>{e.car_number ?? '—'}</td>
                  <td>{e.title ?? '자동차세'}</td>
                  <td>{e.partner_code ?? '—'}</td>
                  <td className="right">{Number(e.amount) > 0 ? fmt(Number(e.amount)) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="v3-table-foot">
        <div>
          총 {filtered.length}건<span className="sep">│</span>
          납부 합계 {fmt(filtered.reduce((s, e) => s + (Number(e.amount) || 0), 0))}원
        </div>
      </div>
    </div>
  );
}

/* ─────────────── 처분 sub-tab ─────────────── */

export function DisposalSubpage() {
  const events = useRtdbCollection<EventLike>('events');
  const assets = useRtdbCollection<RtdbAsset>('assets');
  const [filter, setFilter] = useState<string>('all');

  // 처분 이벤트 (sale/scrap/disposal type) + 처분 자산
  const disposals = useMemo(() => {
    const evtList = events.data.filter(
      (e) => e.type === 'sale' || e.type === 'scrap' || e.type === 'disposal',
    );
    const assetList = assets.data.filter((a) => {
      const s = String(a.asset_status ?? '');
      return s === '매각' || s === '폐차' || s === '처분' || s === '매각예정';
    });
    return { evtList, assetList };
  }, [events.data, assets.data]);

  const filterOpts = [
    { key: 'all', label: '전체', count: disposals.assetList.length + disposals.evtList.length },
    {
      key: 'sale',
      label: '매각',
      count: disposals.assetList.filter((a) => String(a.asset_status) === '매각').length,
    },
    {
      key: 'scrap',
      label: '폐차',
      count: disposals.assetList.filter((a) => String(a.asset_status) === '폐차').length,
    },
    {
      key: 'pending',
      label: '예정',
      count: disposals.assetList.filter((a) => String(a.asset_status) === '매각예정').length,
    },
  ];

  const filteredAssets = useMemo(() => {
    if (filter === 'all') return disposals.assetList;
    if (filter === 'sale')
      return disposals.assetList.filter((a) => String(a.asset_status) === '매각');
    if (filter === 'scrap')
      return disposals.assetList.filter((a) => String(a.asset_status) === '폐차');
    if (filter === 'pending')
      return disposals.assetList.filter((a) => String(a.asset_status) === '매각예정');
    return disposals.assetList;
  }, [filter, disposals.assetList]);

  return (
    <div className="v3-subpage is-active">
      <AlertSection alerts={[]} />
      <StatusFilter value={filter} onChange={setFilter} options={filterOpts} />
      <div className="v3-table-wrap">
        {assets.loading ? (
          <EmptyState label="로드 중..." />
        ) : filteredAssets.length === 0 ? (
          <EmptyState label="처분 차량이 없습니다" />
        ) : (
          <table className="v3-subtab-table">
            <thead>
              <tr>
                <th style={{ width: 110 }}>차량번호</th>
                <th>차종</th>
                <th style={{ width: 80 }}>상태</th>
                <th>처분유형</th>
                <th>사유</th>
                <th style={{ width: 110 }}>처분일</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssets.map((a) => (
                <tr key={a._key}>
                  <td>{a.car_number ?? '—'}</td>
                  <td>
                    {[a.manufacturer, a.car_model, a.detail_model].filter(Boolean).join(' ') || '—'}
                  </td>
                  <td>{a.asset_status ?? '—'}</td>
                  <td>{a.disposal_kind ?? '—'}</td>
                  <td>{a.disposal_reason ?? '—'}</td>
                  <td>
                    {a.disposed_at
                      ? fmtDate(new Date(Number(a.disposed_at)).toISOString().slice(0, 10))
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="v3-table-foot">
        <div>
          총 {filteredAssets.length}대<span className="sep">│</span>이벤트{' '}
          {disposals.evtList.length}건
        </div>
      </div>
    </div>
  );
}
