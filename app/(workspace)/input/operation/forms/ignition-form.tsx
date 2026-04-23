'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import { isActiveContractStatus } from '@/lib/data/contract-status';
import { computeTotalDue, today } from '@/lib/date-utils';
import { fmt } from '@/lib/utils';
import { syncContractActionStatus } from '../op-form-base';
import { saveEvent } from '@/lib/firebase/events';
import { useAuth } from '@/lib/auth/context';
import { CarNumberPicker } from '@/components/form/car-number-picker';
import { useOpContext } from '../op-context-store';
import type { RtdbAsset, RtdbContract, RtdbBilling, RtdbEvent } from '@/lib/types/rtdb-entities';

const REASONS = ['미납', '검사미이행', '계약위반', '연락두절', '기타'];

interface Row {
  contract: RtdbContract;
  asset: RtdbAsset | null;
  unpaidAmount: number;
  maxOverdueDays: number;
  lastIgnitionDate: string;
  lastIgnitionReason: string;
}

export function IgnitionForm() {
  const { user } = useAuth();
  const contracts = useRtdbCollection<RtdbContract>('contracts');
  const billings = useRtdbCollection<RtdbBilling>('billings');
  const assets = useRtdbCollection<RtdbAsset>('assets');
  const events = useRtdbCollection<RtdbEvent>('events');
  const { setCarNumber } = useOpContext();
  const [selectedCarNumber, setSelectedCarNumber] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [reasonMap, setReasonMap] = useState<Record<string, string>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [addCarNumber, setAddCarNumber] = useState('');
  const [addReason, setAddReason] = useState('검사미이행');
  // 수동 추가된 차량번호 (미납 아닌 사유)
  const [manualCars, setManualCars] = useState<Set<string>>(new Set());

  const rows = useMemo<Row[]>(() => {
    const t = today();
    const active = contracts.data.filter(
      (c) => c.status !== 'deleted' && isActiveContractStatus(c.contract_status) && c.car_number,
    );
    const assetMap = new Map<string, RtdbAsset>();
    for (const a of assets.data) {
      if (a.status !== 'deleted' && a.car_number) assetMap.set(a.car_number, a);
    }
    // 차량별 최근 시동제어 이벤트
    const ignitionMap = new Map<string, { date: string; reason: string }>();
    for (const e of events.data) {
      if (e.type !== 'ignition' || !e.car_number || !e.date) continue;
      const cur = ignitionMap.get(e.car_number);
      if (!cur || String(e.date) > cur.date) {
        ignitionMap.set(e.car_number, {
          date: String(e.date),
          reason: String((e as Record<string, unknown>).ignition_reason ?? ''),
        });
      }
    }

    const list: Row[] = [];
    for (const c of active) {
      let unpaidAmount = 0;
      let maxOverdueDays = 0;
      for (const b of billings.data) {
        if (b.contract_code !== c.contract_code) continue;
        const due = computeTotalDue(b);
        const paid = Number(b.paid_total) || 0;
        if (paid >= due || !b.due_date || b.due_date >= t) continue;
        unpaidAmount += due - paid;
        const days = Math.floor((new Date(t).getTime() - new Date(b.due_date).getTime()) / 86400000);
        if (days > maxOverdueDays) maxOverdueDays = days;
      }

      // 미납이 있거나, 이미 시동제어 중이거나, 수동 추가된 차량이면 표시
      const isLocked = c.action_status === '시동제어';
      const isManual = c.car_number ? manualCars.has(c.car_number) : false;
      if (unpaidAmount > 0 || isLocked || isManual) {
        const ign = c.car_number ? ignitionMap.get(c.car_number) : undefined;
        list.push({
          contract: c,
          asset: c.car_number ? assetMap.get(c.car_number) ?? null : null,
          unpaidAmount,
          maxOverdueDays,
          lastIgnitionDate: ign?.date ?? '',
          lastIgnitionReason: ign?.reason ?? '',
        });
      }
    }
    return list.sort((a, b) => {
      const aLocked = a.contract.action_status === '시동제어' ? 1 : 0;
      const bLocked = b.contract.action_status === '시동제어' ? 1 : 0;
      if (aLocked !== bLocked) return bLocked - aLocked;
      return b.maxOverdueDays - a.maxOverdueDays;
    });
  }, [contracts.data, billings.data, assets.data, events.data, manualCars]);

  const toggle = async (row: Row) => {
    const c = row.contract;
    if (!c._key || !c.car_number) return;
    const isLocked = c.action_status === '시동제어';
    const nextAction = isLocked ? '제어해제' : '시동제어';
    const reason = isLocked ? '납부완료' : (reasonMap[c._key!] ?? '미납');

    setBusyKey(c._key);
    try {
      await saveEvent({
        type: 'ignition',
        date: today(),
        car_number: c.car_number,
        contract_code: c.contract_code,
        title: `${nextAction} · ${reason}`,
        ignition_action: nextAction,
        ignition_reason: reason,
        unpaid_amount: row.unpaidAmount,
        handler_uid: user?.uid,
        handler: user?.displayName ?? user?.email ?? undefined,
      });
      await syncContractActionStatus(c._key, nextAction);
      toast.success(`${c.car_number} → ${nextAction}`);
    } catch (err) {
      toast.error(`실패: ${(err as Error).message}`);
    } finally {
      setBusyKey(null);
    }
  };

  const lockedCount = rows.filter((r) => r.contract.action_status === '시동제어').length;

  return (
    <div className="overflow-auto h-full">
      {/* 추가 버튼 */}
      <div className="flex items-center gap-2 px-1.5 py-2 border-b border-border">
        <span className="text-xs text-text-sub font-medium">
          총 {rows.length}대 · 제어중 {lockedCount}대
        </span>
        <span className="flex-1" />
        {showAdd ? (
          <>
            <div className="w-[120px]">
              <CarNumberPicker
                value={addCarNumber}
                onChange={(v) => setAddCarNumber(v)}
                placeholder="차량번호"
                showCreate={false}
              />
            </div>
            <select
              className="text-xs border border-border rounded-[2px] px-1.5 py-1 bg-surface font-[inherit]"
              value={addReason}
              onChange={(e) => setAddReason(e.target.value)}
            >
              {REASONS.filter((r) => r !== '미납').map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={!addCarNumber.trim()}
              onClick={() => {
                if (!addCarNumber.trim()) return;
                setManualCars((s) => new Set(s).add(addCarNumber.trim()));
                setReasonMap((m) => ({ ...m }));
                // 해당 계약 찾아서 reason 기본값 설정
                const target = contracts.data.find((c) => c.car_number === addCarNumber.trim() && c.status !== 'deleted' && isActiveContractStatus(c.contract_status));
                if (target?._key) setReasonMap((m) => ({ ...m, [target._key!]: addReason }));
                setAddCarNumber('');
                setShowAdd(false);
              }}
            >
              확인
            </button>
            <button type="button" className="btn btn-sm" onClick={() => { setShowAdd(false); setAddCarNumber(''); }}>
              취소
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-sm btn-outline" onClick={() => setShowAdd(true)}>
            <i className="ph ph-plus" /> 추가
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="text-text-muted text-xs text-center py-10">
          시동제어 대상 차량이 없습니다
        </div>
      ) : (
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-bg-sub">
            <tr className="text-xs text-text-sub border-b border-border">
              <th className="p-1.5 text-center font-medium w-8">#</th>
              <th className="p-1.5 text-left font-medium">차량번호</th>
              <th className="p-1.5 text-left font-medium">회사</th>
              <th className="p-1.5 text-left font-medium">세부모델</th>
              <th className="p-1.5 text-right font-medium">미납금액</th>
              <th className="p-1.5 text-center font-medium">결제</th>
              <th className="p-1.5 text-right font-medium">연체</th>
              <th className="p-1.5 text-left font-medium">제어사유</th>
              <th className="p-1.5 text-center font-medium">제어일</th>
              <th className="p-1.5 text-center font-medium">상태</th>
              <th className="p-1.5 text-center font-medium w-9"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const isLocked = r.contract.action_status === '시동제어';
              const isBusy = busyKey === r.contract._key;
              const key = r.contract._key!;
              const isSelected = selectedCarNumber === r.contract.car_number;
              return (
                <tr
                  key={key}
                  onClick={() => { setSelectedCarNumber(r.contract.car_number!); setCarNumber(r.contract.car_number!); }}
                  className={`border-b border-border cursor-pointer ${isSelected ? 'bg-bg-active' : ''}`}
                >
                  <td className="text-xs text-text-muted p-1.5 text-center tabular-nums">
                    {idx + 1}
                  </td>
                  <td className="text-xs p-1.5 font-bold tabular-nums">
                    {r.contract.car_number}
                  </td>
                  <td className="text-xs text-text-sub p-1.5 truncate">
                    {r.contract.partner_code ?? '—'}
                  </td>
                  <td className="text-xs text-text-sub p-1.5 truncate">
                    {r.asset?.detail_model ?? r.asset?.car_model ?? '—'}
                  </td>
                  <td className={`text-xs p-1.5 text-right font-bold tabular-nums ${r.unpaidAmount > 0 ? 'text-danger' : 'text-text-muted'}`}>
                    {r.unpaidAmount > 0 ? fmt(r.unpaidAmount) : '—'}
                  </td>
                  <td className="text-xs text-text-sub p-1.5 text-center tabular-nums">
                    {r.contract.auto_debit_day ? `${r.contract.auto_debit_day}일` : '—'}
                  </td>
                  <td className={`text-xs p-1.5 text-right tabular-nums ${r.maxOverdueDays > 30 ? 'text-danger' : r.maxOverdueDays > 0 ? 'text-warn' : 'text-text-muted'}`}>
                    {r.maxOverdueDays > 0 ? `${r.maxOverdueDays}일` : '—'}
                  </td>
                  <td className="text-xs p-1.5">
                    {isLocked ? (
                      <span className="text-text-sub">{r.lastIgnitionReason || '미납'}</span>
                    ) : (
                      <select
                        className="text-xs border border-border rounded-[2px] px-1 py-0.5 bg-surface font-[inherit] text-text-sub"
                        value={reasonMap[key] ?? '미납'}
                        onChange={(e) => setReasonMap((m) => ({ ...m, [key]: e.target.value }))}
                      >
                        {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="text-xs text-text-sub p-1.5 text-center tabular-nums">
                    {r.lastIgnitionDate ? r.lastIgnitionDate.slice(5) : '—'}
                  </td>
                  <td className="p-1.5 text-center">
                    <i className={`ph ${isLocked ? 'ph-lock text-danger' : 'ph-lock-open text-text-muted'} text-[14px]`} />
                  </td>
                  <td className="p-1.5 text-center">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => toggle(r)}
                      className={`btn btn-sm h-[22px] px-2 ${isLocked ? 'text-success' : 'text-danger'} ${isBusy ? 'opacity-40' : ''}`}
                    >
                      {isBusy ? <i className="ph ph-spinner spin" /> : isLocked ? '해제' : '제어'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
