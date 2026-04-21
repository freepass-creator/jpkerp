'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import { INPUT_LABELS, type InputKey } from './input-types';
import type { RtdbAsset, RtdbContract } from '@/lib/types/rtdb-entities';
import type { RtdbCustomer } from '../customer/customer-client';
import { fmtDate } from '@/lib/utils';
import { EmptyState } from '@/components/shared/empty-state';

interface Props {
  selected: InputKey;
}

interface Row {
  key: string;
  primary: string;
  secondary: string;
  when: string;
  href?: string;
}

export function InputContextPanel({ selected }: Props) {
  const assets = useRtdbCollection<RtdbAsset>('assets');
  const contracts = useRtdbCollection<RtdbContract>('contracts');
  const customers = useRtdbCollection<RtdbCustomer>('customers');
  const tasks = useRtdbCollection<{ _key?: string; title?: string; assignee_name?: string; due_date?: string; state?: string; created_at?: number }>('tasks');
  const gpsDevices = useRtdbCollection<{ _key?: string; car_number?: string; gps_company?: string; gps_status?: string; gps_install_date?: string; created_at?: number; status?: string }>('gps_devices');
  const partners = useRtdbCollection<{ _key?: string; partner_code?: string; partner_name?: string; ceo?: string; created_at?: number; status?: string }>('partners');
  const ocrDocs = useRtdbCollection<{ _key?: string; doc_type?: string; doc_name?: string; car_number?: string; created_at?: number; status?: string }>('ocr_documents');

  const rows = useMemo<Row[]>(() => {
    const byCreated = <T extends { _key?: string; created_at?: number; status?: string }>(arr: T[]) =>
      arr.filter((r) => r.status !== 'deleted').sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0)).slice(0, 30);

    if (selected === 'asset') {
      return byCreated(assets.data).map((a) => ({
        key: a._key!,
        primary: a.car_number ?? '—',
        secondary: [a.manufacturer, a.car_model].filter(Boolean).join(' ') || '—',
        when: a.created_at ? fmtDate(new Date(a.created_at as number).toISOString().slice(0, 10)) : '—',
        href: a.car_number ? `/asset/${encodeURIComponent(a.car_number)}` : undefined,
      }));
    }
    if (selected === 'contract') {
      return byCreated(contracts.data).map((c) => ({
        key: c._key!,
        primary: c.contractor_name ?? '—',
        secondary: `${c.car_number ?? '—'} · ${c.contract_status ?? ''}`,
        when: c.created_at ? fmtDate(new Date(c.created_at).toISOString().slice(0, 10)) : '—',
      }));
    }
    if (selected === 'extension') {
      const extContracts = contracts.data.filter((c) => (c as RtdbContract & { is_extension?: boolean }).is_extension);
      return byCreated(extContracts).map((c) => ({
        key: c._key!,
        primary: c.contractor_name ?? '—',
        secondary: `${c.car_number ?? '—'} · ${c.rent_months ?? '—'}개월 연장`,
        when: c.created_at ? fmtDate(new Date(c.created_at).toISOString().slice(0, 10)) : '—',
      }));
    }
    if (selected === 'customer') {
      return byCreated(customers.data).map((c) => ({
        key: c._key!,
        primary: c.name ?? '—',
        secondary: c.phone ?? '',
        when: c.created_at ? fmtDate(new Date(c.created_at).toISOString().slice(0, 10)) : '—',
      }));
    }
    if (selected === 'gps') {
      return byCreated(gpsDevices.data).map((g) => ({
        key: g._key!,
        primary: g.car_number ?? '—',
        secondary: `${g.gps_company ?? ''} · ${g.gps_status ?? ''}`.trim(),
        when: g.gps_install_date ? fmtDate(g.gps_install_date) : (g.created_at ? fmtDate(new Date(g.created_at).toISOString().slice(0, 10)) : '—'),
        href: g.car_number ? `/asset/${encodeURIComponent(g.car_number)}` : undefined,
      }));
    }
    if (selected === 'partner') {
      return byCreated(partners.data).map((p) => ({
        key: p._key!,
        primary: p.partner_name ?? p.partner_code ?? '—',
        secondary: `${p.partner_code ?? ''} · ${p.ceo ?? ''}`.trim(),
        when: p.created_at ? fmtDate(new Date(p.created_at).toISOString().slice(0, 10)) : '—',
      }));
    }
    if (selected === 'ocr') {
      return byCreated(ocrDocs.data).map((o) => ({
        key: o._key!,
        primary: o.doc_name || o.doc_type || '—',
        secondary: `${o.doc_type ?? ''}${o.car_number ? ' · ' + o.car_number : ''}`.trim(),
        when: o.created_at ? fmtDate(new Date(o.created_at).toISOString().slice(0, 10)) : '—',
        href: o.car_number ? `/asset/${encodeURIComponent(o.car_number)}` : undefined,
      }));
    }
    return byCreated(tasks.data).map((t) => ({
      key: t._key!,
      primary: t.title ?? '—',
      secondary: `${t.assignee_name ?? '미지정'} · ${t.state ?? '대기'}`,
      when: t.due_date ? `마감 ${fmtDate(t.due_date)}` : '—',
    }));
  }, [selected, assets.data, contracts.data, customers.data, tasks.data, gpsDevices.data, partners.data, ocrDocs.data]);

  const loading = assets.loading || contracts.loading || customers.loading || tasks.loading || gpsDevices.loading || partners.loading || ocrDocs.loading;

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 text-text-muted" style={{ height: '100%', minHeight: 200 }}>
        <i className="ph ph-spinner spin" /> 로드 중...
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div style={{ height: '100%', minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <EmptyState
          icon="ph-tray"
          title={`${INPUT_LABELS[selected]} 내역 없음`}
          description="상단에서 신규 등록 시 여기 표시됩니다"
        />
      </div>
    );
  }

  return (
    <div className="overflow-y-auto scrollbar-thin" style={{ height: '100%' }}>
      {rows.map((r) => {
        const content = (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <span className="text-base text-text" style={{ fontWeight: 600 }}>{r.primary}</span>
              <span className="text-2xs text-text-muted">{r.when}</span>
            </div>
            {r.secondary && (
              <div className="text-xs text-text-sub" style={{ marginTop: 2 }}>{r.secondary}</div>
            )}
          </>
        );
        return r.href ? (
          <Link
            key={r.key}
            href={r.href}
            className="ctx-row"
            style={{ display: 'block', padding: '10px 12px', borderBottom: '1px solid var(--c-border)', textDecoration: 'none', color: 'inherit' }}
          >
            {content}
          </Link>
        ) : (
          <div
            key={r.key}
            style={{ padding: '10px 12px', borderBottom: '1px solid var(--c-border)' }}
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}
