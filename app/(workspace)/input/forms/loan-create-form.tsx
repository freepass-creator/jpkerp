'use client';

import { BtnGroup } from '@/components/form/btn-group';
import { CarNumberPicker } from '@/components/form/car-number-picker';
import { DateInput, Field, NumberInput, TextArea, TextInput } from '@/components/form/field';
import { useAuth } from '@/lib/auth/context';
import { getRtdb } from '@/lib/firebase/rtdb';
import { sanitizeCarNumber } from '@/lib/format-input';
import { push, ref, serverTimestamp, set } from 'firebase/database';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { InputFormShell } from './input-form-shell';

const REPAY_TYPES = ['원리금균등', '원금균등', '만기일시', '리스/렌탈'];
const FIN_COMPANIES = [
  '현대캐피탈',
  'KB캐피탈',
  '하나캐피탈',
  'BNK캐피탈',
  '신한캐피탈',
  '롯데캐피탈',
  '우리금융캐피탈',
  '메리츠캐피탈',
  '기타',
];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function addMonths(date: string, n: number): string {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + n);
  if (d.getDate() !== day) d.setDate(0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dateOnDay(start: string, day: number): string {
  const s = new Date(start);
  if (Number.isNaN(s.getTime())) return start;
  const candidate = new Date(s.getFullYear(), s.getMonth(), Math.min(28, day));
  if (candidate < s) candidate.setMonth(candidate.getMonth() + 1);
  return `${candidate.getFullYear()}-${pad(candidate.getMonth() + 1)}-${pad(candidate.getDate())}`;
}

/**
 * 원리금균등 — 매월 동일 납부.
 *   PMT = P * r / (1 - (1+r)^-n), r = annualRate/12.
 * 0% 이자면 P/n.
 */
function buildAmortSchedule(
  principal: number,
  annualRatePct: number,
  months: number,
  firstDue: string,
): { due_date: string; principal: number; interest: number; total: number; balance: number }[] {
  const r = annualRatePct / 100 / 12;
  const pmt = r === 0 ? principal / months : (principal * r) / (1 - (1 + r) ** -months);
  const out: {
    due_date: string;
    principal: number;
    interest: number;
    total: number;
    balance: number;
  }[] = [];
  let balance = principal;
  for (let i = 0; i < months; i++) {
    const interest = Math.round(balance * r);
    let principalPart = Math.round(pmt - interest);
    // 마지막 회차 원금 = 잔액으로 보정 (라운딩 누적 흡수)
    if (i === months - 1) principalPart = Math.round(balance);
    const total = principalPart + interest;
    balance = Math.max(0, balance - principalPart);
    out.push({
      due_date: i === 0 ? firstDue : addMonths(firstDue, i),
      principal: principalPart,
      interest,
      total,
      balance,
    });
  }
  return out;
}

export function LoanCreateForm() {
  const { user } = useAuth();
  const [carNumber, setCarNumber] = useState('');
  const [partnerCode, setPartnerCode] = useState('');
  const [finCompany, setFinCompany] = useState('현대캐피탈');
  const [repayType, setRepayType] = useState('원리금균등');

  // 미리보기 (원리금 균등 기준)
  const [previewPrincipal, setPreviewPrincipal] = useState('');
  const [previewRate, setPreviewRate] = useState('');
  const [previewMonths, setPreviewMonths] = useState('');

  const previewMonthly = useMemo(() => {
    const p = Number(previewPrincipal);
    const r = Number(previewRate) / 100 / 12;
    const n = Number(previewMonths);
    if (!p || !n) return 0;
    if (!r) return Math.round(p / n);
    return Math.round((p * r) / (1 - (1 + r) ** -n));
  }, [previewPrincipal, previewRate, previewMonths]);

  return (
    <InputFormShell
      collection="loans"
      validate={(d) => {
        if (!carNumber) return '차량번호를 입력하세요';
        if (!d.principal) return '할부원금을 입력하세요';
        if (!d.months) return '기간(개월)을 입력하세요';
        if (!d.start_date) return '시작일을 입력하세요';
        if (!d.debit_day) return '매월 납부일을 입력하세요';
        return null;
      }}
      buildPayload={(d) => ({
        car_number: sanitizeCarNumber(carNumber),
        partner_code: partnerCode || undefined,
        finance_company: finCompany,
        repay_type: repayType,
        principal: Number(String(d.principal).replace(/,/g, '')),
        annual_rate: Number(d.rate) || 0,
        months: Number(d.months),
        debit_day: Number(d.debit_day),
        start_date: d.start_date,
        contract_no: d.contract_no || undefined,
        note: d.note || undefined,
      })}
      afterSave={async (key, payload) => {
        try {
          const principal = Number(payload.principal) || 0;
          const rate = Number(payload.annual_rate) || 0;
          const months = Number(payload.months) || 0;
          const debitDay = Number(payload.debit_day) || 1;
          const startDate = String(payload.start_date ?? '');
          const carNum = String(payload.car_number ?? '');
          const loanCode = String(payload.loan_code ?? '');
          if (!principal || !months || !startDate) {
            toast.warning('회차 자동생성 생략 — 입력값 부족');
            return;
          }

          const firstDue = dateOnDay(startDate, debitDay);
          const rows = buildAmortSchedule(principal, rate, months, firstDue);
          const db = getRtdb();
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const r = push(ref(db, 'loan_schedules'));
            await set(r, {
              loan_key: key,
              loan_code: loanCode,
              car_number: carNum,
              partner_code: payload.partner_code,
              finance_company: payload.finance_company,
              schedule_no: i + 1,
              due_date: row.due_date,
              principal_amount: row.principal,
              interest_amount: row.interest,
              amount: row.total,
              balance_after: row.balance,
              paid_total: 0,
              status: 'active',
              handler_uid: user?.uid,
              handler: user?.displayName ?? user?.email ?? undefined,
              created_at: Date.now(),
              updated_at: serverTimestamp(),
            });
          }
          toast.success(`할부 회차 ${rows.length}회 자동 생성`);
        } catch (err) {
          toast.error(`회차 생성 실패: ${(err as Error).message}`);
        }
      }}
      onSaved={() => {
        setCarNumber('');
        setPartnerCode('');
        setPreviewPrincipal('');
        setPreviewRate('');
        setPreviewMonths('');
      }}
    >
      <div className="form-section">
        <div className="form-section-title">
          <i className="ph ph-chart-line-up" />
          할부 기본정보
        </div>
        <div className="form-grid">
          <Field label="차량번호" required>
            <CarNumberPicker
              value={carNumber}
              onChange={(v, asset) => {
                setCarNumber(v);
                if (asset?.partner_code && !partnerCode) setPartnerCode(asset.partner_code);
              }}
              required
              autoFocus
            />
          </Field>
          <Field label="회원사">
            <TextInput
              value={partnerCode}
              onChange={(e) => setPartnerCode(e.target.value.toUpperCase())}
              placeholder="자동 매칭 / 수동"
            />
          </Field>
          <Field label="금융사" span={3}>
            <BtnGroup value={finCompany} onChange={setFinCompany} options={FIN_COMPANIES} />
          </Field>
          <Field label="상환방식" span={3}>
            <BtnGroup value={repayType} onChange={setRepayType} options={REPAY_TYPES} />
          </Field>
          <Field label="할부계약번호">
            <TextInput name="contract_no" placeholder="금융사 계약번호" />
          </Field>
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-title">
          <i className="ph ph-calendar-blank" />
          원금 · 이자 · 기간
        </div>
        <div className="form-grid">
          <Field label="할부원금" required>
            <NumberInput
              name="principal"
              placeholder="0"
              value={previewPrincipal}
              onChange={(e) => setPreviewPrincipal(e.target.value)}
            />
          </Field>
          <Field label="연이자율(%)">
            <NumberInput
              name="rate"
              placeholder="예: 5.9"
              value={previewRate}
              onChange={(e) => setPreviewRate(e.target.value)}
            />
          </Field>
          <Field label="기간(개월)" required>
            <NumberInput
              name="months"
              placeholder="예: 60"
              value={previewMonths}
              onChange={(e) => setPreviewMonths(e.target.value)}
            />
          </Field>
          <Field label="시작일" required>
            <DateInput name="start_date" />
          </Field>
          <Field label="매월 납부일" required>
            <NumberInput name="debit_day" placeholder="예: 25" />
          </Field>
          {previewMonthly > 0 && (
            <Field label="월 납부 예상액 (원리금균등)" span={3}>
              <div
                className="num"
                style={{
                  padding: '8px 10px',
                  background: 'var(--c-bg-sub)',
                  borderRadius: 2,
                  fontWeight: 600,
                }}
              >
                {previewMonthly.toLocaleString()}원
                <span
                  className="text-text-muted"
                  style={{ marginLeft: 8, fontWeight: 400, fontSize: 12 }}
                >
                  · 저장 시 회차 {previewMonths || '?'}회 자동 생성
                </span>
              </div>
            </Field>
          )}
          <Field label="메모" span={3}>
            <TextArea name="note" rows={3} placeholder="잔존가치·옵션 등" />
          </Field>
        </div>
      </div>
    </InputFormShell>
  );
}
