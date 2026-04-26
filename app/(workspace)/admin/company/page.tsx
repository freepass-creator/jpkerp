'use client';

/**
 * 일반관리 (v3) — Phase 8.
 *
 * 5 sub-tab:
 *   1. 회사관리 (default · 회사 정보 form)
 *   2. 직원관리 (users RTDB → AG Grid)
 *   3. 부서·팀 (직원 부서 derived 또는 placeholder)
 *   4. 정책·규정 (placeholder)
 *   5. 일반비용 (placeholder)
 *
 * 디자인은 jpkerp-v3/prototype.html `data-page="general"` 기준.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { get, ref, set } from 'firebase/database';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { EditableField } from '@/components/shared/editable-field';
import { JpkGrid, type JpkGridApi } from '@/components/shared/jpk-grid';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import { getRtdb } from '@/lib/firebase/rtdb';
import { rowNumColumn, typedColumn } from '@/lib/grid/typed-column';
import type { ColDef } from 'ag-grid-community';

type SubpageId =
  | 'general-company'
  | 'general-staff'
  | 'general-dept'
  | 'general-policy'
  | 'general-expense';

interface TabSpec {
  id: SubpageId;
  label: string;
  action: string; // empty string => 버튼 숨김
}

const TABS: TabSpec[] = [
  { id: 'general-company', label: '회사관리', action: '+ 회사 정보 수정' },
  { id: 'general-staff', label: '직원관리', action: '+ 직원 등록' },
  { id: 'general-dept', label: '부서·팀', action: '+ 부서 등록' },
  { id: 'general-policy', label: '정책·규정', action: '+ 정책 등록' },
  { id: 'general-expense', label: '일반비용', action: '+ 비용 등록' },
];

const TAB_CRUMB: Record<SubpageId, string> = {
  'general-company': '회사관리',
  'general-staff': '직원관리',
  'general-dept': '부서·팀',
  'general-policy': '정책·규정',
  'general-expense': '일반비용',
};

export default function GeneralAdminPage() {
  const [active, setActive] = useState<SubpageId>('general-company');
  const activeTab = TABS.find((t) => t.id === active) ?? TABS[0];

  return (
    <>
      <div className="page-head">
        <i className="ph ph-folders" />
        <div className="title">일반관리</div>
        <div className="crumbs">› {TAB_CRUMB[active]}</div>
      </div>

      <div className="v3-tabs">
        <div className="v3-tab-list">
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
        <div className="action">
          {activeTab.action && (
            <button type="button" disabled>
              {activeTab.action}
            </button>
          )}
        </div>
      </div>

      {active === 'general-company' ? (
        <CompanySubpage />
      ) : active === 'general-staff' ? (
        <StaffSubpage />
      ) : active === 'general-dept' ? (
        <DeptSubpage />
      ) : active === 'general-policy' ? (
        <PlaceholderSubpage label="정책·규정" icon="ph-scroll" />
      ) : (
        <PlaceholderSubpage label="일반비용" icon="ph-receipt" />
      )}
    </>
  );
}

/* ── 회사관리 ── */

const COMPANY_FIELDS: Array<{ k: string; l: string; span?: number }> = [
  { k: 'biz_name', l: '회사명' },
  { k: 'biz_no', l: '사업자번호' },
  { k: 'ceo', l: '대표자' },
  { k: 'phone', l: '대표 전화' },
  { k: 'biz_type', l: '업태' },
  { k: 'biz_item', l: '종목' },
  { k: 'address', l: '주소', span: 2 },
  { k: 'reg_no', l: '사업용 등록' },
  { k: 'hometax_id', l: '홈택스 ID' },
  { k: 'bank_name', l: '입금은행' },
  { k: 'bank_account', l: '입금계좌' },
  { k: 'bank_holder', l: '예금주' },
];

const COMPANY_QK = ['settings', 'company'];

async function fetchCompany(): Promise<Record<string, string>> {
  const snap = await get(ref(getRtdb(), 'settings/company'));
  return (snap.val() as Record<string, string>) ?? {};
}

function CompanySubpage() {
  const qc = useQueryClient();
  const { data = {}, isLoading } = useQuery({
    queryKey: COMPANY_QK,
    queryFn: fetchCompany,
  });

  const save = (field: string) => async (v: string) => {
    const next = { ...data, [field]: v };
    qc.setQueryData(COMPANY_QK, next);
    try {
      await set(ref(getRtdb(), 'settings/company'), next);
    } catch (e) {
      qc.invalidateQueries({ queryKey: COMPANY_QK });
      toast.error(`저장 실패: ${(e as Error).message}`);
    }
  };

  return (
    <div className="v3-subpage is-active">
      <div className="v3-alerts">
        <div className="v3-alerts-head">
          <i className="ph ph-buildings ico" />
          <span className="title">회사 기본정보</span>
          <span className="count">· {data.biz_name || '회사명 미입력'}</span>
        </div>
      </div>

      <div className="v3-table-wrap">
        {isLoading ? (
          <div style={{ padding: 24, color: 'var(--c-text-muted)', textAlign: 'center' }}>
            <i className="ph ph-spinner spin" /> 회사 정보 로드 중...
          </div>
        ) : (
          <div style={{ padding: 16, maxWidth: 800 }}>
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              {COMPANY_FIELDS.map((f) => (
                <div key={f.k} style={{ gridColumn: f.span ? `span ${f.span}` : undefined }}>
                  <EditableField label={f.l} value={data[f.k] ?? ''} onSave={save(f.k)} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="v3-table-foot">
        <div style={{ color: 'var(--c-text-muted)' }}>필드 클릭 → 자동 저장 (저장 버튼 없음)</div>
      </div>
    </div>
  );
}

/* ── 직원관리 ── */

interface StaffRow {
  _key?: string;
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  department?: string;
  position?: string;
  join_date?: string;
  status?: string;
  [k: string]: unknown;
}

const ROLE_META: Record<string, { label: string; color: string }> = {
  superadmin: { label: '최고관리자', color: 'var(--c-err)' },
  admin: { label: '관리자', color: 'var(--c-accent)' },
  staff: { label: '직원', color: 'var(--c-text)' },
  pending: { label: '승인대기', color: 'var(--c-warn)' },
};

function StaffSubpage() {
  const gridRef = useRef<JpkGridApi<StaffRow> | null>(null);
  const users = useRtdbCollection<StaffRow>('users');

  const stats = useMemo(() => {
    let active = 0;
    let leave = 0;
    let resigned = 0;
    for (const u of users.data) {
      const s = (u.status ?? '재직').toString();
      if (s.includes('휴직')) leave += 1;
      else if (s.includes('퇴직') || s.includes('해지')) resigned += 1;
      else active += 1;
    }
    return { total: users.data.length, active, leave, resigned };
  }, [users.data]);

  const cols = useMemo<ColDef<StaffRow>[]>(
    () => [
      rowNumColumn<StaffRow>(),
      typedColumn('text', {
        headerName: '이름',
        field: 'name',
        width: 100,
        cellStyle: { fontWeight: '600' },
      }),
      typedColumn('text', { headerName: '이메일', field: 'email', width: 200 }),
      typedColumn('text', { headerName: '연락처', field: 'phone', width: 120 }),
      typedColumn('select', {
        headerName: '권한',
        field: 'role',
        width: 100,
        cellStyle: (p: { value: unknown }) => ({
          color: ROLE_META[p.value as string]?.color ?? 'var(--c-text)',
          fontWeight: '600',
        }),
        valueFormatter: (p) => ROLE_META[p.value as string]?.label ?? (p.value as string) ?? '-',
      }),
      typedColumn('select', { headerName: '부서', field: 'department', width: 100 }),
      typedColumn('select', { headerName: '직책', field: 'position', width: 90 }),
      typedColumn('date', { headerName: '입사일', field: 'join_date', width: 100 }),
      typedColumn('select', { headerName: '상태', field: 'status', width: 80 }),
    ],
    [],
  );

  return (
    <div className="v3-subpage is-active">
      <div className="v3-alerts">
        <div className="v3-alerts-head">
          <i className="ph ph-users ico" />
          <span className="title">직원</span>
          <span className="count">
            · 재직 {stats.active}명 · 휴직 {stats.leave}명 · 퇴직 {stats.resigned}명
          </span>
        </div>
      </div>

      <div className="v3-table-wrap">
        {users.loading ? (
          <div style={{ padding: 24, color: 'var(--c-text-muted)', textAlign: 'center' }}>
            <i className="ph ph-spinner spin" /> 직원 데이터 로드 중...
          </div>
        ) : users.error ? (
          <div style={{ padding: 24 }}>
            <div style={{ fontWeight: 600, color: 'var(--c-err)', marginBottom: 4 }}>
              데이터 로드 실패
            </div>
            <div style={{ color: 'var(--c-text-sub)' }}>{users.error.message}</div>
          </div>
        ) : (
          <div className="v3-grid-host">
            <JpkGrid<StaffRow>
              ref={gridRef}
              columnDefs={cols}
              rowData={users.data}
              getRowId={(d) => d._key ?? d.email ?? ''}
              storageKey="jpk.grid.admin.staff"
            />
          </div>
        )}
      </div>

      <div className="v3-table-foot">
        <div>
          총 {stats.total}명<span className="sep">│</span>
          재직 {stats.active}
          <span className="sep">│</span>
          휴직 {stats.leave}
          <span className="sep">│</span>
          퇴직 {stats.resigned}
        </div>
      </div>
    </div>
  );
}

/* ── 부서·팀 — users 데이터에서 부서별 집계 ── */

interface DeptRow {
  dept: string;
  count: number;
  lead?: string;
}

function DeptSubpage() {
  const users = useRtdbCollection<StaffRow>('users');

  const rows = useMemo<DeptRow[]>(() => {
    const map = new Map<string, DeptRow>();
    for (const u of users.data) {
      const d = (u.department ?? '미지정').toString();
      const r = map.get(d) ?? { dept: d, count: 0 };
      r.count += 1;
      // role=admin 이상 직원을 대표자로 추정
      if (!r.lead && (u.role === 'admin' || u.role === 'superadmin')) {
        r.lead = u.name ?? '';
      }
      map.set(d, r);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [users.data]);

  return (
    <div className="v3-subpage is-active">
      <div className="v3-alerts">
        <div className="v3-alerts-head">
          <i className="ph ph-tree-structure ico" />
          <span className="title">부서·팀</span>
          <span className="count">
            · {rows.length}개 부서 · 인원 {users.data.length}
          </span>
        </div>
      </div>

      <div className="v3-table-wrap">
        {users.loading ? (
          <div style={{ padding: 24, color: 'var(--c-text-muted)', textAlign: 'center' }}>
            <i className="ph ph-spinner spin" /> 데이터 로드 중...
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 24, color: 'var(--c-text-muted)', textAlign: 'center' }}>
            등록된 부서가 없습니다. 직원관리에서 부서를 입력하면 자동 집계됩니다.
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
                <th style={{ ...cellTh(), textAlign: 'left' }}>부서명</th>
                <th style={cellTh(120)}>대표자(추정)</th>
                <th style={cellTh(80)}>인원</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.dept} style={{ borderBottom: '1px solid var(--c-border)' }}>
                  <td style={{ ...cellTd(), color: 'var(--c-text-muted)' }}>{i + 1}</td>
                  <td style={{ ...cellTd(), textAlign: 'left', fontWeight: 600 }}>{r.dept}</td>
                  <td style={cellTd()}>{r.lead || '—'}</td>
                  <td style={cellTd()}>{r.count}명</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="v3-table-foot">
        <div>
          {rows.length}개 부서 · 총 {users.data.length}명<span className="sep">│</span>
          <span style={{ color: 'var(--c-text-muted)' }}>
            (직원 department 필드 자동 집계 — 부서 마스터 미구현)
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── 미구현 sub-page placeholder ── */

function PlaceholderSubpage({ label, icon }: { label: string; icon: string }) {
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
        <div className="desc">
          {label === '정책·규정'
            ? '대여 약관·요금 산정·정비 규정 등 사내 규정 관리 화면'
            : '임대료·인건비·광고·통신 등 일반 운영비 관리 화면'}
        </div>
      </div>
    </div>
  );
}

/* ── helpers ── */

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
