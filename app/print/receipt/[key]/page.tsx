'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ref, get } from 'firebase/database';
import { getRtdb } from '@/lib/firebase/rtdb';
import type { RtdbBilling, RtdbContract } from '@/lib/types/rtdb-entities';
import { fmt, fmtDate } from '@/lib/utils';
import { computeTotalDue, today as todayStr } from '@/lib/date-utils';

async function fetchBillingWithContract(key: string): Promise<{ billing: RtdbBilling | null; contract: RtdbContract | null }> {
  const snap = await get(ref(getRtdb(), `billings/${key}`));
  if (!snap.exists()) return { billing: null, contract: null };
  const billing = snap.val() as RtdbBilling;
  if (!billing.contract_code) return { billing, contract: null };
  const cs = await get(ref(getRtdb(), 'contracts'));
  const cMap = cs.val() as Record<string, RtdbContract> | null;
  const contract = cMap ? Object.values(cMap).find((x) => x.contract_code === billing.contract_code) ?? null : null;
  return { billing, contract };
}

export default function ReceiptPrintPage() {
  const params = useParams<{ key: string }>();
  const key = params.key;
  const { data, isLoading } = useQuery({
    queryKey: ['print-receipt', key],
    queryFn: () => fetchBillingWithContract(key),
    enabled: !!key,
  });
  const billing = data?.billing ?? null;
  const contract = data?.contract ?? null;

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>불러오는 중...</div>;
  if (!billing) return <div style={{ padding: 40, textAlign: 'center', color: '#c00' }}>영수증을 찾을 수 없습니다</div>;

  const due = computeTotalDue(billing);
  const paid = Number(billing.paid_total) || 0;
  const unpaid = due - paid;
  // 미수 = 결제일 지난 미납 / 결제대기 = 결제일 미도래 미납
  const isOverdue = unpaid > 0 && !!billing.due_date && billing.due_date < todayStr();
  const stateLabel = unpaid <= 0 ? '완납' : isOverdue ? '미수' : '결제대기';

  return (
    <div>
      <div className="print-toolbar">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => window.close()}>
          <i className="ph ph-x" />닫기
        </button>
        <span className="spacer" />
        <button type="button" className="btn btn-primary btn-sm" onClick={() => window.print()}>
          <i className="ph ph-printer" />인쇄
        </button>
      </div>

      <div className="print-doc-title">수납 영수증</div>
      <div className="print-doc-subtitle">
        발행일: {new Date().toISOString().slice(0, 10)} · {billing.bill_count ? `${billing.bill_count}회차` : ''}
      </div>

      <div className="print-section-title">계약 정보</div>
      <table className="print-kv">
        <tbody>
          <tr><th>계약코드</th><td>{billing.contract_code ?? '-'}</td></tr>
          <tr><th>계약자</th><td>{contract?.contractor_name ?? '-'}</td></tr>
          <tr><th>차량번호</th><td>{contract?.car_number ?? '-'}</td></tr>
        </tbody>
      </table>

      <div className="print-section-title">수납 내역</div>
      <table className="print-kv">
        <tbody>
          <tr><th>청구일</th><td>{fmtDate(billing.due_date)}</td></tr>
          <tr><th>청구금액</th><td>{fmt(due)}원</td></tr>
          <tr><th>수납금액</th><td className="text-success" style={{ fontWeight: 600 }}>{fmt(paid)}원</td></tr>
          <tr>
            <th>잔액</th>
            <td style={{ color: unpaid > 0 ? 'var(--c-danger)' : 'var(--c-text-muted)', fontWeight: 600 }}>
              {fmt(unpaid)}원
            </td>
          </tr>
          <tr><th>상태</th><td>{stateLabel}</td></tr>
        </tbody>
      </table>

      <div className="text-xl" style={{ marginTop: 40, textAlign: 'center' }}>
        위와 같이 영수하였음을 확인합니다.
      </div>

      <div className="print-sign-area" style={{ marginTop: 30 }}>
        <div className="print-sign-box">
          <div className="print-sign-label">수령인 · 인</div>
        </div>
        <div className="print-sign-box">
          <div className="print-sign-label">발행인 · 인</div>
        </div>
      </div>
    </div>
  );
}
