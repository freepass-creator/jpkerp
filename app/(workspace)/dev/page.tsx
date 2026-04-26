'use client';

/**
 * 개발도구 (v3) — Phase 8.
 *
 * 9 sub-tab (prototype 기준):
 *   1. 차종 마스터 (default · car_models 마스터 CRUD)
 *   2. 회원사 (partners)
 *   3. 고객 (customers)
 *   4. 거래처 (vendors)
 *   5. 데이터 저장소 (orphan data — 매칭 실패 사진/거래/파일)
 *   6. 데이터 정합성 (cutover-tool 기반 검증)
 *   7. 시스템 설정 (placeholder)
 *   8. 백업·내보내기 (placeholder)
 *   9. 감사 로그 (placeholder)
 *
 * 디자인은 jpkerp-v3/prototype.html `data-page="devtools"` 기준.
 */

import { JpkGrid } from '@/components/shared/jpk-grid';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import { computeTotalDue } from '@/lib/date-utils';
import {
  MONO_CELL_STYLE,
  MONO_CELL_STYLE_BOLD,
  rowNumColumn,
  typedColumn,
} from '@/lib/grid/typed-column';
import type {
  RtdbAsset,
  RtdbBilling,
  RtdbCarModel,
  RtdbContract,
  RtdbCustomer,
  RtdbEvent,
} from '@/lib/types/rtdb-entities';
import { fmt } from '@/lib/utils';
import type { ColDef } from 'ag-grid-community';
import { useMemo, useState } from 'react';

type SubpageId =
  | 'dev-models'
  | 'dev-partners'
  | 'dev-customers'
  | 'dev-vendors'
  | 'dev-orphan'
  | 'dev-integrity'
  | 'dev-settings'
  | 'dev-backup'
  | 'dev-audit';

interface TabSpec {
  id: SubpageId;
  label: string;
  action: string; // empty string => 버튼 숨김
}

const TABS: TabSpec[] = [
  { id: 'dev-models', label: '차종 마스터', action: '+ 차종 등록' },
  { id: 'dev-partners', label: '회원사', action: '+ 회원사 등록' },
  { id: 'dev-customers', label: '고객', action: '+ 고객 등록' },
  { id: 'dev-vendors', label: '거래처', action: '+ 거래처 등록' },
  { id: 'dev-orphan', label: '데이터 저장소', action: '' },
  { id: 'dev-integrity', label: '데이터 정합성', action: '+ 검증 실행' },
  { id: 'dev-settings', label: '시스템 설정', action: '' },
  { id: 'dev-backup', label: '백업·내보내기', action: '' },
  { id: 'dev-audit', label: '감사 로그', action: '' },
];

const TAB_CRUMB: Record<SubpageId, string> = {
  'dev-models': '차종 마스터',
  'dev-partners': '회원사',
  'dev-customers': '고객',
  'dev-vendors': '거래처',
  'dev-orphan': '데이터 저장소',
  'dev-integrity': '데이터 정합성',
  'dev-settings': '시스템 설정',
  'dev-backup': '백업·내보내기',
  'dev-audit': '감사 로그',
};

export default function DevToolsPage() {
  const [active, setActive] = useState<SubpageId>('dev-models');
  const activeTab = TABS.find((t) => t.id === active) ?? TABS[0];

  return (
    <>
      <div className="page-head">
        <i className="ph ph-wrench" />
        <div className="title">개발도구</div>
        <div className="crumbs">› {TAB_CRUMB[active]}</div>
      </div>

      <div className="v3-tabs">
        <div className="v3-tab-list" style={{ overflowX: 'auto', flex: 1, minWidth: 0 }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`v3-tab ${active === t.id ? 'is-active' : ''}`}
              onClick={() => setActive(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {activeTab.action && (
          <div className="action">
            <button type="button" disabled>
              {activeTab.action}
            </button>
          </div>
        )}
      </div>

      {active === 'dev-models' ? (
        <CarModelsSubpage />
      ) : active === 'dev-partners' ? (
        <PartnersSubpage />
      ) : active === 'dev-customers' ? (
        <CustomersSubpage />
      ) : active === 'dev-vendors' ? (
        <VendorsSubpage />
      ) : active === 'dev-orphan' ? (
        <OrphanSubpage />
      ) : active === 'dev-integrity' ? (
        <IntegritySubpage />
      ) : active === 'dev-settings' ? (
        <PlaceholderSubpage
          label="시스템 설정"
          icon="ph-gear-six"
          desc="이관 기준일 · 자동이체일 · 미수 알림 기준 · 외부 연동"
        />
      ) : active === 'dev-backup' ? (
        <PlaceholderSubpage
          label="백업·내보내기"
          icon="ph-cloud-arrow-down"
          desc="자동 백업 · 수동 내보내기 · CSV/XLSX export"
        />
      ) : (
        <PlaceholderSubpage
          label="감사 로그"
          icon="ph-clipboard-text"
          desc="로그인·등록·수정·삭제·권한변경 추적"
        />
      )}
    </>
  );
}

/* ═════════ 1. 차종 마스터 ═════════ */

function CarModelsSubpage() {
  const models = useRtdbCollection<RtdbCarModel>('vehicle_master');
  const assets = useRtdbCollection<RtdbAsset>('assets');

  const rows = useMemo(() => {
    const countByKey = new Map<string, number>();
    for (const a of assets.data) {
      if (a.status === 'deleted') continue;
      const k = [a.manufacturer, a.car_model, a.detail_model].filter(Boolean).join('|');
      countByKey.set(k, (countByKey.get(k) ?? 0) + 1);
    }
    return models.data
      .filter((m) => m.status !== 'deleted' && !m.archived)
      .map((m) => ({
        ...(m as RtdbCarModel & { _key: string }),
        asset_count: countByKey.get([m.maker, m.model, m.sub].filter(Boolean).join('|')) ?? 0,
      }))
      .sort((a, b) => b.asset_count - a.asset_count);
  }, [models.data, assets.data]);

  const stats = useMemo(() => {
    const byMaker = new Map<string, number>();
    for (const r of rows) {
      const m = (r.maker ?? '미상').toString();
      byMaker.set(m, (byMaker.get(m) ?? 0) + 1);
    }
    return {
      total: rows.length,
      top: Array.from(byMaker.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4),
    };
  }, [rows]);

  const cols = useMemo<ColDef<RtdbCarModel & { _key: string; asset_count: number }>[]>(
    () => [
      rowNumColumn(),
      typedColumn('select', {
        headerName: '제조사',
        field: 'maker',
        width: 90,
        cellStyle: { fontWeight: '600' },
      }),
      typedColumn('text', { headerName: '모델', field: 'model', width: 120 }),
      typedColumn('text', { headerName: '세부모델', field: 'sub', flex: 1, minWidth: 200 }),
      typedColumn('text', {
        headerName: '코드',
        field: 'code',
        width: 96,
        cellStyle: MONO_CELL_STYLE,
      }),
      typedColumn('text', { headerName: '연식', field: 'year_start', width: 80 }),
      typedColumn('select', { headerName: '동력', field: 'powertrain', width: 80 }),
      typedColumn('select', { headerName: '차급', field: 'category', width: 90 }),
      typedColumn('number', {
        headerName: '보유',
        field: 'asset_count',
        width: 70,
        valueFormatter: (p) => fmt(Number(p.value)),
        cellStyle: (p: { value: unknown }) =>
          Number(p.value) > 0
            ? { color: 'var(--c-accent)', fontWeight: '600' }
            : { color: 'var(--c-text-muted)' },
      }),
    ],
    [],
  );

  return (
    <div className="v3-subpage is-active">
      <div className="v3-alerts">
        <div className="v3-alerts-head">
          <i className="ph ph-car-profile ico" />
          <span className="title">차종 마스터</span>
          <span className="count">· {stats.total}종 (freepass-v2 공유)</span>
        </div>
      </div>

      {models.loading || assets.loading ? (
        <LoadingPanel label="차종 마스터" />
      ) : (
        <div className="v3-table-wrap">
          <div className="v3-grid-host">
            <JpkGrid
              columnDefs={cols}
              rowData={rows}
              getRowId={(d) => d._key}
              storageKey="jpk.grid.dev.carmaster.v3"
            />
          </div>
        </div>
      )}

      <div className="v3-table-foot">
        <div>
          총 {stats.total}종
          {stats.top.map(([maker, n]) => (
            <span key={maker}>
              <span className="sep">│</span>
              {maker} {n}
            </span>
          ))}
        </div>
        <div style={{ color: 'var(--c-text-muted)' }}>
          (편집은 차종 마스터 도구 사용 — Phase 9 통합 예정)
        </div>
      </div>
    </div>
  );
}

/* ═════════ 2. 회원사 ═════════ */

interface PartnerRow {
  _key?: string;
  partner_code?: string;
  partner_name?: string;
  ceo?: string;
  biz_no?: string;
  phone?: string;
  contact_name?: string;
  contact_phone?: string;
  address?: string;
  status?: string;
  [k: string]: unknown;
}

function PartnersSubpage() {
  const partners = useRtdbCollection<PartnerRow>('partners');
  const assets = useRtdbCollection<RtdbAsset>('assets');
  const contracts = useRtdbCollection<RtdbContract>('contracts');

  const rows = useMemo(() => {
    const carCount = new Map<string, number>();
    for (const a of assets.data) {
      if (a.status === 'deleted' || !a.partner_code) continue;
      carCount.set(a.partner_code, (carCount.get(a.partner_code) ?? 0) + 1);
    }
    const contractCount = new Map<string, number>();
    for (const c of contracts.data) {
      if (!c.partner_code) continue;
      contractCount.set(c.partner_code, (contractCount.get(c.partner_code) ?? 0) + 1);
    }
    return partners.data
      .filter((p) => p.status !== 'deleted')
      .map((p) => ({
        ...p,
        car_count: p.partner_code ? (carCount.get(p.partner_code) ?? 0) : 0,
        contract_count: p.partner_code ? (contractCount.get(p.partner_code) ?? 0) : 0,
      }));
  }, [partners.data, assets.data, contracts.data]);

  const stats = useMemo(() => {
    let active = 0;
    let dormant = 0;
    for (const r of rows) {
      const s = (r.status ?? '활성').toString();
      if (s.includes('휴면') || s.includes('해지')) dormant += 1;
      else active += 1;
    }
    return { total: rows.length, active, dormant };
  }, [rows]);

  const cols = useMemo<ColDef<PartnerRow & { car_count: number; contract_count: number }>[]>(
    () => [
      rowNumColumn(),
      typedColumn('text', {
        headerName: '코드',
        field: 'partner_code',
        width: 80,
        cellStyle: MONO_CELL_STYLE_BOLD,
      }),
      typedColumn('text', {
        headerName: '회원사명',
        field: 'partner_name',
        flex: 1,
        minWidth: 160,
      }),
      typedColumn('text', { headerName: '사업자번호', field: 'biz_no', width: 130 }),
      typedColumn('text', { headerName: '대표자', field: 'ceo', width: 90 }),
      typedColumn('text', { headerName: '연락처', field: 'phone', width: 120 }),
      typedColumn('number', {
        headerName: '차량수',
        field: 'car_count',
        width: 80,
        valueFormatter: (p) => `${p.value}`,
      }),
      typedColumn('number', {
        headerName: '계약수',
        field: 'contract_count',
        width: 80,
        valueFormatter: (p) => `${p.value}`,
      }),
      typedColumn('select', { headerName: '상태', field: 'status', width: 80 }),
    ],
    [],
  );

  return (
    <div className="v3-subpage is-active">
      <div className="v3-alerts">
        <div className="v3-alerts-head">
          <i className="ph ph-buildings ico" />
          <span className="title">회원사</span>
          <span className="count">
            · 활성 {stats.active} · 휴면 {stats.dormant}
          </span>
        </div>
      </div>

      {partners.loading ? (
        <LoadingPanel label="회원사" />
      ) : (
        <div className="v3-table-wrap">
          <div className="v3-grid-host">
            <JpkGrid
              columnDefs={cols}
              rowData={rows}
              getRowId={(d) => d._key ?? d.partner_code ?? ''}
              storageKey="jpk.grid.dev.partners"
            />
          </div>
        </div>
      )}

      <div className="v3-table-foot">
        <div>
          총 {stats.total}개<span className="sep">│</span>
          활성 {stats.active}
          <span className="sep">│</span>
          휴면 {stats.dormant}
        </div>
      </div>
    </div>
  );
}

/* ═════════ 3. 고객 ═════════ */

function CustomersSubpage() {
  const customers = useRtdbCollection<RtdbCustomer>('customers');
  const contracts = useRtdbCollection<RtdbContract>('contracts');

  const rows = useMemo(() => {
    const ctById = new Map<string, number>();
    for (const c of contracts.data) {
      if (!c.customer_code) continue;
      ctById.set(c.customer_code, (ctById.get(c.customer_code) ?? 0) + 1);
    }
    return customers.data
      .filter((c) => c.status !== 'deleted')
      .map((c) => ({
        ...c,
        contract_count: c.customer_code ? (ctById.get(c.customer_code) ?? 0) : 0,
      }));
  }, [customers.data, contracts.data]);

  const stats = useMemo(() => {
    let personal = 0;
    let corp = 0;
    for (const r of rows) {
      const t = (r.customer_type ?? '').toString();
      if (t.includes('법인') || t.includes('사업자')) corp += 1;
      else personal += 1;
    }
    return { total: rows.length, personal, corp };
  }, [rows]);

  const cols = useMemo<ColDef<RtdbCustomer & { contract_count: number }>[]>(
    () => [
      rowNumColumn(),
      typedColumn('text', {
        headerName: '고객코드',
        field: 'customer_code',
        width: 110,
        cellStyle: MONO_CELL_STYLE_BOLD,
      }),
      typedColumn('text', {
        headerName: '이름',
        field: 'name',
        width: 120,
        cellStyle: { fontWeight: '600' },
      }),
      typedColumn('select', { headerName: '구분', field: 'customer_type', width: 80 }),
      typedColumn('text', { headerName: '연락처', field: 'phone', width: 120 }),
      typedColumn('text', { headerName: '생년/사업자', field: 'birth', width: 110 }),
      typedColumn('text', {
        headerName: '회원사',
        field: 'partner_code',
        width: 80,
        cellStyle: MONO_CELL_STYLE,
      }),
      typedColumn('text', { headerName: '주소', field: 'address', flex: 1, minWidth: 180 }),
      typedColumn('number', {
        headerName: '계약',
        field: 'contract_count',
        width: 70,
        valueFormatter: (p) => `${p.value}`,
      }),
      typedColumn('select', { headerName: '상태', field: 'status', width: 80 }),
    ],
    [],
  );

  return (
    <div className="v3-subpage is-active">
      <div className="v3-alerts">
        <div className="v3-alerts-head">
          <i className="ph ph-users ico" />
          <span className="title">고객</span>
          <span className="count">
            · 개인 {stats.personal} · 법인 {stats.corp}
          </span>
        </div>
      </div>

      {customers.loading ? (
        <LoadingPanel label="고객" />
      ) : (
        <div className="v3-table-wrap">
          <div className="v3-grid-host">
            <JpkGrid
              columnDefs={cols}
              rowData={rows}
              getRowId={(d) => d._key ?? d.customer_code ?? ''}
              storageKey="jpk.grid.dev.customers"
            />
          </div>
        </div>
      )}

      <div className="v3-table-foot">
        <div>
          총 {stats.total}명<span className="sep">│</span>
          개인 {stats.personal}
          <span className="sep">│</span>
          법인 {stats.corp}
        </div>
      </div>
    </div>
  );
}

/* ═════════ 4. 거래처 ═════════ */

interface VendorRow {
  _key?: string;
  vendor_name?: string;
  vendor_type?: string;
  contact_name?: string;
  phone?: string;
  address?: string;
  biz_no?: string;
  bank_account?: string;
  note?: string;
  status?: string;
  [k: string]: unknown;
}

function VendorsSubpage() {
  const vendors = useRtdbCollection<VendorRow>('vendors');

  const rows = useMemo(() => vendors.data.filter((v) => v.status !== 'deleted'), [vendors.data]);

  const stats = useMemo(() => {
    const byType = new Map<string, number>();
    for (const r of rows) {
      const t = (r.vendor_type ?? '기타').toString();
      byType.set(t, (byType.get(t) ?? 0) + 1);
    }
    return {
      total: rows.length,
      byType: Array.from(byType.entries()).sort((a, b) => b[1] - a[1]),
    };
  }, [rows]);

  const cols = useMemo<ColDef<VendorRow>[]>(
    () => [
      rowNumColumn<VendorRow>(),
      typedColumn('text', {
        headerName: '거래처명',
        field: 'vendor_name',
        width: 160,
        cellStyle: { fontWeight: '600' },
      }),
      typedColumn('select', { headerName: '업종', field: 'vendor_type', width: 100 }),
      typedColumn('text', { headerName: '담당자', field: 'contact_name', width: 100 }),
      typedColumn('text', { headerName: '연락처', field: 'phone', width: 120 }),
      typedColumn('text', { headerName: '사업자번호', field: 'biz_no', width: 130 }),
      typedColumn('text', { headerName: '주소', field: 'address', flex: 1, minWidth: 180 }),
      typedColumn('text', { headerName: '계좌', field: 'bank_account', width: 140 }),
      typedColumn('text', { headerName: '비고', field: 'note', width: 160 }),
    ],
    [],
  );

  return (
    <div className="v3-subpage is-active">
      <div className="v3-alerts">
        <div className="v3-alerts-head">
          <i className="ph ph-handshake ico" />
          <span className="title">거래처</span>
          <span className="count">
            ·{' '}
            {stats.byType.length === 0
              ? '데이터 없음'
              : stats.byType.map(([k, v]) => `${k} ${v}`).join(' · ')}
          </span>
        </div>
      </div>

      {vendors.loading ? (
        <LoadingPanel label="거래처" />
      ) : (
        <div className="v3-table-wrap">
          <div className="v3-grid-host">
            <JpkGrid<VendorRow>
              columnDefs={cols}
              rowData={rows}
              getRowId={(d) => d._key ?? d.vendor_name ?? ''}
              storageKey="jpk.grid.dev.vendors"
            />
          </div>
        </div>
      )}

      <div className="v3-table-foot">
        <div>
          총 {stats.total}곳
          {stats.byType.slice(0, 4).map(([k, v]) => (
            <span key={k}>
              <span className="sep">│</span>
              {k} {v}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═════════ 5. 데이터 저장소 (orphan) ═════════ */

interface OrphanRow {
  key: string;
  date: string;
  kind: 'photo' | 'transaction' | 'file' | 'event';
  source: string;
  identifier: string;
  candidate: string;
  uploader: string;
  status: string;
}

function OrphanSubpage() {
  const events = useRtdbCollection<RtdbEvent>('events');
  const contracts = useRtdbCollection<RtdbContract>('contracts');

  const rows = useMemo<OrphanRow[]>(() => {
    const out: OrphanRow[] = [];
    const contractCodes = new Set(
      contracts.data.map((c) => c.contract_code).filter((v): v is string => Boolean(v)),
    );

    for (const e of events.data) {
      if (e.status === 'deleted') continue;

      // 거래 미매칭 — bank_tx/card_tx 중 contract_code 없거나 contract 매칭 실패
      if (e.type === 'bank_tx' || e.type === 'card_tx') {
        const hasContract = e.contract_code && contractCodes.has(e.contract_code);
        const explicit = e.match_status === 'unmatched';
        if (!hasContract && (explicit || e.match_status !== 'matched')) {
          out.push({
            key: e._key ?? `tx-${out.length}`,
            date: (e.date ?? '').slice(0, 16),
            kind: 'transaction',
            source: e.type === 'bank_tx' ? '신한 CSV' : '카드',
            identifier: `${e.title ?? '—'} · ${fmt(Number(e.amount ?? 0))}`,
            candidate: e.contract_code ? `계약 ${e.contract_code} 미존재` : '—',
            uploader: (e.handler as string) ?? '—',
            status:
              e.match_status === 'matched' ? '매칭완료' : ((e.match_status as string) ?? '미매칭'),
          });
        }
        continue;
      }

      // 사진/파일 미매칭 — 모바일 inbox 등 차량 매칭 실패
      const t = (e.type ?? '').toString();
      if (t === 'mobile_upload' || t === 'orphan_photo' || t === 'orphan_file') {
        out.push({
          key: e._key ?? `up-${out.length}`,
          date: (e.date ?? '').slice(0, 16),
          kind: t === 'orphan_file' ? 'file' : 'photo',
          source: '모바일',
          identifier: e.title ?? e.memo ?? '식별 정보 없음',
          candidate: e.car_number ? `차량 ${e.car_number} 후보` : '—',
          uploader: (e.handler as string) ?? '—',
          status: (e.work_status as string) ?? '미매칭',
        });
        continue;
      }

      // 일반 고아 이벤트 — contract_code 있는데 contract 없음
      if (e.contract_code && !contractCodes.has(e.contract_code)) {
        out.push({
          key: e._key ?? `ev-${out.length}`,
          date: (e.date ?? '').slice(0, 16),
          kind: 'event',
          source: t || '이벤트',
          identifier: `${e.title ?? '—'} (${e.contract_code})`,
          candidate: '계약 미존재',
          uploader: (e.handler as string) ?? '—',
          status: '미매칭',
        });
      }
    }

    return out.sort((a, b) => b.date.localeCompare(a.date));
  }, [events.data, contracts.data]);

  const stats = useMemo(() => {
    let photo = 0;
    let tx = 0;
    let file = 0;
    let evt = 0;
    for (const r of rows) {
      if (r.kind === 'photo') photo += 1;
      else if (r.kind === 'transaction') tx += 1;
      else if (r.kind === 'file') file += 1;
      else evt += 1;
    }
    return { total: rows.length, photo, tx, file, evt };
  }, [rows]);

  const isClear = rows.length === 0;

  return (
    <div className="v3-subpage is-active">
      <div className={`v3-alerts ${isClear ? 'is-clear' : ''}`}>
        <div className="v3-alerts-head">
          <span className="dot" />
          <span className="title">{isClear ? '매칭 미결 없음' : '매칭 안 된 데이터'}</span>
          <span className="count">
            {isClear
              ? '· 0건'
              : `· ${stats.total}건 (사진 ${stats.photo} · 거래 ${stats.tx} · 파일 ${stats.file} · 이벤트 ${stats.evt})`}
          </span>
        </div>
        {!isClear && (
          <div className="v3-alerts-grid">
            {stats.photo > 0 && (
              <div className="v3-alert-card is-info">
                <i className="ph ph-image ico" />
                <div className="body">
                  <div className="head">사진 미매칭 [{stats.photo}]</div>
                  <div className="desc">
                    차량번호 인식 실패 또는 등록 안 된 차량 — 모바일 업로드
                  </div>
                </div>
                <button type="button" className="alert-btn">
                  매칭
                </button>
              </div>
            )}
            {stats.tx > 0 && (
              <div className="v3-alert-card">
                <i className="ph ph-bank ico" />
                <div className="body">
                  <div className="head">거래 미매칭 [{stats.tx}]</div>
                  <div className="desc">계약자/계약코드 매칭 실패 — 예수금 처리됨</div>
                </div>
                <button type="button" className="alert-btn">
                  매칭
                </button>
              </div>
            )}
            {stats.file > 0 && (
              <div className="v3-alert-card is-info">
                <i className="ph ph-file ico" />
                <div className="body">
                  <div className="head">파일 미매칭 [{stats.file}]</div>
                  <div className="desc">업로드 후 분류 안 된 PDF·이미지</div>
                </div>
                <button type="button" className="alert-btn">
                  분류
                </button>
              </div>
            )}
            {stats.evt > 0 && (
              <div className="v3-alert-card is-danger">
                <i className="ph ph-link-break ico" />
                <div className="body">
                  <div className="head">고아 이벤트 [{stats.evt}]</div>
                  <div className="desc">contract_code 존재하나 계약 없음 — 정리 필요</div>
                </div>
                <button type="button" className="alert-btn">
                  정리
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="v3-table-wrap">
        {events.loading ? (
          <div style={{ padding: 24, color: 'var(--c-text-muted)', textAlign: 'center' }}>
            <i className="ph ph-spinner spin" /> 데이터 로드 중...
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 24, color: 'var(--c-text-muted)', textAlign: 'center' }}>
            매칭 미결 데이터가 없습니다.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr
                style={{
                  background: 'var(--c-bg-soft)',
                  borderBottom: '1px solid var(--c-border)',
                }}
              >
                <th style={cellTh(40)}>#</th>
                <th style={cellTh(140)}>일시</th>
                <th style={cellTh(70)}>유형</th>
                <th style={cellTh(100)}>출처</th>
                <th style={{ ...cellTh(), textAlign: 'left' }}>식별 정보</th>
                <th style={{ ...cellTh(), textAlign: 'left' }}>매칭 후보</th>
                <th style={cellTh(80)}>업로더</th>
                <th style={cellTh(80)}>상태</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 200).map((r, i) => (
                <tr key={r.key} style={{ borderBottom: '1px solid var(--c-border)' }}>
                  <td style={{ ...cellTd(), color: 'var(--c-text-muted)' }}>{i + 1}</td>
                  <td style={cellTd()}>{r.date || '—'}</td>
                  <td style={cellTd()}>
                    <span style={{ ...kindBadgeStyle(r.kind) }}>{kindLabel(r.kind)}</span>
                  </td>
                  <td style={cellTd()}>{r.source}</td>
                  <td style={{ ...cellTd(), textAlign: 'left' }}>{r.identifier}</td>
                  <td style={{ ...cellTd(), textAlign: 'left', color: 'var(--c-text-muted)' }}>
                    {r.candidate}
                  </td>
                  <td style={cellTd()}>{r.uploader}</td>
                  <td style={cellTd()}>{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="v3-table-foot">
        <div>
          총 {stats.total}건<span className="sep">│</span>
          사진 {stats.photo}
          <span className="sep">│</span>
          거래 {stats.tx}
          <span className="sep">│</span>
          파일 {stats.file}
          <span className="sep">│</span>
          이벤트 {stats.evt}
        </div>
        <div style={{ color: 'var(--c-text-muted)' }}>보존기간 90일 (자동 만료)</div>
      </div>
    </div>
  );
}

/* ═════════ 6. 데이터 정합성 ═════════ */

interface IntegrityRow {
  key: string;
  detected: string;
  kind: string;
  target: string;
  detail: string;
  severity: 'critical' | 'warn' | 'info';
  status: 'open' | 'resolved';
}

function IntegritySubpage() {
  const billings = useRtdbCollection<RtdbBilling>('billings');
  const contracts = useRtdbCollection<RtdbContract>('contracts');
  const events = useRtdbCollection<RtdbEvent>('events');
  const assets = useRtdbCollection<RtdbAsset>('assets');

  const rows = useMemo<IntegrityRow[]>(() => {
    const out: IntegrityRow[] = [];
    const detectedAt = new Date().toISOString().slice(0, 16).replace('T', ' ');

    // 1) 청구 vs 입금 불일치 — cutover 로직 재사용
    const byCode = new Map<string, RtdbContract>();
    for (const c of contracts.data) {
      if (c.contract_code) byCode.set(c.contract_code, c);
    }
    const billAgg = new Map<string, { paid: number; due: number }>();
    for (const b of billings.data) {
      if (b.status === 'deleted' || !b.contract_code) continue;
      const cur = billAgg.get(b.contract_code) ?? { paid: 0, due: 0 };
      cur.due += computeTotalDue(b);
      cur.paid += Number(b.paid_total) || 0;
      billAgg.set(b.contract_code, cur);
    }
    const eventAgg = new Map<string, number>();
    for (const e of events.data) {
      if (e.status === 'deleted' || !e.contract_code) continue;
      if (e.type !== 'bank_tx' && e.type !== 'card_tx') continue;
      const amt = Number((e as { amount?: number }).amount) || 0;
      if (amt <= 0) continue;
      eventAgg.set(e.contract_code, (eventAgg.get(e.contract_code) ?? 0) + amt);
    }
    for (const [code, agg] of billAgg) {
      const ePaid = eventAgg.get(code) ?? 0;
      const diff = agg.paid - ePaid;
      if (Math.abs(diff) > 100) {
        const c = byCode.get(code);
        out.push({
          key: `mismatch-${code}`,
          detected: detectedAt,
          kind: '청구·입금 불일치',
          target: c?.car_number ?? code,
          detail: `billings 합계 ${fmt(agg.paid)} vs bank/card 합계 ${fmt(ePaid)} (차이 ${diff > 0 ? '+' : ''}${fmt(diff)})`,
          severity: Math.abs(diff) > 100000 ? 'critical' : 'warn',
          status: 'open',
        });
      }
    }

    // 2) 고아 이벤트 — contract_code 있는데 contract 없음
    const contractCodes = new Set(
      contracts.data.map((c) => c.contract_code).filter((v): v is string => Boolean(v)),
    );
    for (const e of events.data) {
      if (e.status === 'deleted') continue;
      if (e.contract_code && !contractCodes.has(e.contract_code)) {
        out.push({
          key: `orphan-${e._key ?? out.length}`,
          detected: detectedAt,
          kind: '고아 이벤트',
          target: e.event_code ?? e._key ?? '—',
          detail: `contract_code "${e.contract_code}" 존재 안 함`,
          severity: 'warn',
          status: 'open',
        });
      }
    }

    // 3) 중복 차량번호 — assets에서 동일 car_number 2건 이상
    const dupCheck = new Map<string, RtdbAsset[]>();
    for (const a of assets.data) {
      if (a.status === 'deleted' || !a.car_number) continue;
      const list = dupCheck.get(a.car_number) ?? [];
      list.push(a);
      dupCheck.set(a.car_number, list);
    }
    for (const [num, list] of dupCheck) {
      if (list.length > 1) {
        out.push({
          key: `dup-${num}`,
          detected: detectedAt,
          kind: '중복 차량번호',
          target: num,
          detail: `asset ${list.length}개 발견 (${list.map((a) => a.partner_code ?? '—').join(', ')})`,
          severity: 'critical',
          status: 'open',
        });
      }
    }

    return out.sort((a, b) => {
      const order: Record<IntegrityRow['severity'], number> = { critical: 0, warn: 1, info: 2 };
      return order[a.severity] - order[b.severity];
    });
  }, [billings.data, contracts.data, events.data, assets.data]);

  const stats = useMemo(() => {
    let critical = 0;
    let warn = 0;
    for (const r of rows) {
      if (r.severity === 'critical') critical += 1;
      else if (r.severity === 'warn') warn += 1;
    }
    return { total: rows.length, critical, warn };
  }, [rows]);

  const loading = billings.loading || contracts.loading || events.loading || assets.loading;
  const isClear = !loading && rows.length === 0;

  // 상위 그룹
  const mismatch = rows.filter((r) => r.kind === '청구·입금 불일치');
  const orphan = rows.filter((r) => r.kind === '고아 이벤트');
  const dup = rows.filter((r) => r.kind === '중복 차량번호');

  return (
    <div className="v3-subpage is-active">
      <div className={`v3-alerts ${isClear ? 'is-clear' : ''}`}>
        <div className="v3-alerts-head">
          <span className="dot" />
          <span className="title">{isClear ? '데이터 정합성 정상' : '데이터 정합성'}</span>
          <span className="count">{isClear ? '· 0건' : `· 검증 결과 ${stats.total}건 불일치`}</span>
        </div>
        {!isClear && (
          <div className="v3-alerts-grid">
            {mismatch.length > 0 && (
              <div className="v3-alert-card is-danger">
                <i className="ph ph-warning ico" />
                <div className="body">
                  <div className="head">청구 vs 입금 불일치 [{mismatch.length}]</div>
                  <div className="desc">
                    {mismatch
                      .slice(0, 3)
                      .map((r) => r.target)
                      .join(' · ') + (mismatch.length > 3 ? ` 외 ${mismatch.length - 3}건` : '')}
                  </div>
                </div>
                <button type="button" className="alert-btn">
                  확인
                </button>
              </div>
            )}
            {orphan.length > 0 && (
              <div className="v3-alert-card">
                <i className="ph ph-link-break ico" />
                <div className="body">
                  <div className="head">고아 이벤트 [{orphan.length}]</div>
                  <div className="desc">contract_code 존재하나 계약 없음 — 정리 필요</div>
                </div>
                <button type="button" className="alert-btn">
                  정리
                </button>
              </div>
            )}
            {dup.length > 0 && (
              <div className="v3-alert-card is-danger">
                <i className="ph ph-copy ico" />
                <div className="body">
                  <div className="head">중복 차량번호 [{dup.length}]</div>
                  <div className="desc">
                    {dup
                      .map((r) => r.target)
                      .slice(0, 3)
                      .join(' · ')}
                  </div>
                </div>
                <button type="button" className="alert-btn">
                  병합
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="v3-table-wrap">
        {loading ? (
          <div style={{ padding: 24, color: 'var(--c-text-muted)', textAlign: 'center' }}>
            <i className="ph ph-spinner spin" /> 검증 중...
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 24, color: 'var(--c-text-muted)', textAlign: 'center' }}>
            정합성 이슈가 없습니다.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr
                style={{
                  background: 'var(--c-bg-soft)',
                  borderBottom: '1px solid var(--c-border)',
                }}
              >
                <th style={cellTh(40)}>#</th>
                <th style={cellTh(140)}>검출일시</th>
                <th style={{ ...cellTh(), textAlign: 'left' }}>구분</th>
                <th style={{ ...cellTh(), textAlign: 'left' }}>대상</th>
                <th style={{ ...cellTh(), textAlign: 'left' }}>상세</th>
                <th style={cellTh(80)}>심각도</th>
                <th style={cellTh(80)}>상태</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 200).map((r, i) => (
                <tr key={r.key} style={{ borderBottom: '1px solid var(--c-border)' }}>
                  <td style={{ ...cellTd(), color: 'var(--c-text-muted)' }}>{i + 1}</td>
                  <td style={cellTd()}>{r.detected}</td>
                  <td style={{ ...cellTd(), textAlign: 'left' }}>{r.kind}</td>
                  <td style={{ ...cellTd(), textAlign: 'left', fontWeight: 600 }}>{r.target}</td>
                  <td style={{ ...cellTd(), textAlign: 'left', color: 'var(--c-text-sub)' }}>
                    {r.detail}
                  </td>
                  <td style={{ ...cellTd(), color: severityColor(r.severity), fontWeight: 600 }}>
                    {severityLabel(r.severity)}
                  </td>
                  <td style={cellTd()}>{r.status === 'open' ? '미해결' : '해결'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="v3-table-foot">
        <div>
          총 {stats.total}건 미해결
          <span className="sep">│</span>
          치명 {stats.critical}
          <span className="sep">│</span>
          경고 {stats.warn}
        </div>
      </div>
    </div>
  );
}

/* ═════════ helpers ═════════ */

function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="v3-table-wrap">
      <div style={{ padding: 24, color: 'var(--c-text-muted)', textAlign: 'center' }}>
        <i className="ph ph-spinner spin" /> {label} 데이터 로드 중...
      </div>
    </div>
  );
}

function PlaceholderSubpage({
  label,
  icon,
  desc,
}: {
  label: string;
  icon: string;
  desc: string;
}) {
  return (
    <div className="v3-subpage is-active">
      <div className="v3-alerts">
        <div className="v3-alerts-head">
          <i className={`ph ${icon} ico`} />
          <span className="title">{label}</span>
          <span className="count">· 준비 중</span>
        </div>
      </div>
      <div className="v3-placeholder">
        <i className="ph ph-hourglass-medium" />
        <div className="title">{label} 준비 중</div>
        <div className="desc">{desc}</div>
      </div>
    </div>
  );
}

function kindLabel(k: OrphanRow['kind']): string {
  switch (k) {
    case 'photo':
      return '사진';
    case 'transaction':
      return '거래';
    case 'file':
      return '파일';
    case 'event':
      return '이벤트';
  }
}

function kindBadgeStyle(k: OrphanRow['kind']): React.CSSProperties {
  const colors: Record<OrphanRow['kind'], { bg: string; fg: string }> = {
    photo: { bg: 'var(--c-bg-soft)', fg: 'var(--c-info)' },
    transaction: { bg: 'var(--c-bg-soft)', fg: 'var(--c-text)' },
    file: { bg: 'var(--c-bg-soft)', fg: 'var(--c-info)' },
    event: { bg: 'var(--c-bg-soft)', fg: 'var(--c-warn)' },
  };
  const c = colors[k];
  return {
    display: 'inline-block',
    padding: '1px 6px',
    background: c.bg,
    color: c.fg,
    fontSize: 11,
    fontWeight: 600,
  };
}

function severityLabel(s: IntegrityRow['severity']): string {
  if (s === 'critical') return '치명';
  if (s === 'warn') return '경고';
  return '안내';
}

function severityColor(s: IntegrityRow['severity']): string {
  if (s === 'critical') return 'var(--c-err)';
  if (s === 'warn') return 'var(--c-warn)';
  return 'var(--c-info)';
}

function cellTh(width?: number): React.CSSProperties {
  return {
    padding: '6px 8px',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--c-text-sub)',
    textAlign: 'center',
    width,
  };
}

function cellTd(): React.CSSProperties {
  return {
    padding: '6px 8px',
    textAlign: 'center',
    color: 'var(--c-text)',
  };
}
