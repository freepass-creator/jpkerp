'use client';

import { BtnGroup } from '@/components/form/btn-group';
import { CarNumberPicker } from '@/components/form/car-number-picker';
import { DateInput, Field, NumberInput, TextArea, TextInput } from '@/components/form/field';
import { useAuth } from '@/lib/auth/context';
import { saveEvent } from '@/lib/firebase/events';
import { sanitizeCarNumber } from '@/lib/format-input';
import { useState } from 'react';
import { toast } from 'sonner';
import { InputFormShell } from './input-form-shell';

const INS_KIND_OPTS = ['종합(대인+대물+자차)', '대인', '대물', '자차', '책임보험'];
const INS_COMPANY_OPTS = [
  'DB손해보험',
  '삼성화재',
  '현대해상',
  'KB손해보험',
  '메리츠화재',
  '한화손해보험',
  '롯데손해보험',
  '흥국화재',
  '기타',
];

export function InsuranceCreateForm() {
  const { user } = useAuth();
  const [carNumber, setCarNumber] = useState('');
  const [partnerCode, setPartnerCode] = useState('');
  const [insKind, setInsKind] = useState('종합(대인+대물+자차)');
  const [insCompany, setInsCompany] = useState('DB손해보험');

  return (
    <InputFormShell
      collection="insurances"
      validate={() => {
        if (!carNumber) return '차량번호를 입력하세요';
        return null;
      }}
      buildPayload={(d) => ({
        car_number: sanitizeCarNumber(carNumber),
        partner_code: partnerCode || undefined,
        insurance_company: insCompany,
        ins_kind: insKind,
        policy_no: d.policy_no || undefined,
        start_date: d.start_date || undefined,
        expire_date: d.expire_date || undefined,
        coverage_amount: d.coverage_amount
          ? Number(String(d.coverage_amount).replace(/,/g, ''))
          : undefined,
        deductible_amount: d.deductible_amount
          ? Number(String(d.deductible_amount).replace(/,/g, ''))
          : undefined,
        amount: d.premium ? Number(String(d.premium).replace(/,/g, '')) : undefined,
        note: d.note || undefined,
      })}
      afterSave={async (key, payload) => {
        // 자산관리 보험 sub-tab은 events(type='insurance')에서 읽으므로 미러링
        try {
          await saveEvent({
            type: 'insurance',
            date: (payload.start_date as string | undefined) || undefined,
            car_number: payload.car_number as string | undefined,
            partner_code: payload.partner_code as string | undefined,
            title:
              `${payload.insurance_company ?? ''} ${payload.ins_kind ?? ''}`.trim() || '보험 가입',
            amount: Number(payload.amount) || undefined,
            insurance_company: payload.insurance_company as string | undefined,
            ins_kind: payload.ins_kind as string | undefined,
            policy_no: payload.policy_no as string | undefined,
            expire_date: payload.expire_date as string | undefined,
            coverage_amount: Number(payload.coverage_amount) || undefined,
            deductible_amount: Number(payload.deductible_amount) || undefined,
            insurance_code: payload.insurance_code as string | undefined,
            insurance_master_key: key,
            handler_uid: user?.uid,
            handler: user?.displayName ?? user?.email ?? undefined,
            memo: payload.note as string | undefined,
          });
          toast.success('보험 등록 + 자산 보험탭 반영');
        } catch (err) {
          toast.error(`보험 events 반영 실패: ${(err as Error).message}`);
        }
      }}
      onSaved={() => {
        setCarNumber('');
        setPartnerCode('');
      }}
    >
      <div className="form-section">
        <div className="form-section-title">
          <i className="ph ph-shield-check" />
          보험 가입 정보
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
              placeholder="자동 매칭 / 수동 입력"
            />
          </Field>
          <Field label="종목" span={3}>
            <BtnGroup value={insKind} onChange={setInsKind} options={INS_KIND_OPTS} />
          </Field>
          <Field label="보험사" span={3}>
            <BtnGroup value={insCompany} onChange={setInsCompany} options={INS_COMPANY_OPTS} />
          </Field>
          <Field label="증권번호" span={2}>
            <TextInput name="policy_no" placeholder="예: KP-2026-001234" />
          </Field>
          <Field label="가입일">
            <DateInput name="start_date" />
          </Field>
          <Field label="만료일">
            <DateInput name="expire_date" />
          </Field>
          <Field label="보험료(연)">
            <NumberInput name="premium" placeholder="0" />
          </Field>
          <Field label="보장금액(대물한도 등)">
            <NumberInput name="coverage_amount" placeholder="0" />
          </Field>
          <Field label="자차 면책금">
            <NumberInput name="deductible_amount" placeholder="0" />
          </Field>
          <Field label="메모" span={3}>
            <TextArea name="note" rows={3} placeholder="특약·운전자 한정 등" />
          </Field>
        </div>
      </div>
    </InputFormShell>
  );
}
