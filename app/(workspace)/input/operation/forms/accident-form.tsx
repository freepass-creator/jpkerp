'use client';

import { useState } from 'react';
import { OpFormBase } from '../op-form-base';
import { Field, TextInput, NumberInput, TextArea, PhoneInput } from '@/components/form/field';
import { BtnGroup, BtnGroupMulti } from '@/components/form/btn-group';
import { FavChips } from '@/components/form/fav-chips';
import { useInsuranceCompanies, useTitles, useLocations } from '@/lib/hooks/useOpPrefs';

const ACC_TYPES = ['단독', '쌍방'];
const ROLES = ['가해', '피해'];
const STATUS = ['접수', '처리중', '수리중', '종결'];
const RENTAL = ['미정', '대차제공', '대차없음'];
const DEDUCT_STATUS = ['미수', '수납완료', '면제'];
const FAULT_STEPS = ['0', '10', '20', '30', '40', '50', '60', '70', '80', '90', '100'];
const INS_OPTIONS: { key: string; label: string }[] = [
  { key: 'ins_car', label: '자차' },
  { key: 'ins_property', label: '대물' },
  { key: 'ins_person', label: '대인' },
  { key: 'ins_self', label: '자손' },
  { key: 'ins_uninsured', label: '무보험' },
];

export function AccidentForm() {
  const [accType, setAccType] = useState('단독');
  const [role, setRole] = useState('피해');
  const [status, setStatus] = useState('접수');
  const [rental, setRental] = useState('미정');
  const [faultPct, setFaultPct] = useState('0');
  const [insFlags, setInsFlags] = useState<Record<string, boolean>>({
    ins_car: false, ins_property: false, ins_person: false, ins_self: false, ins_uninsured: false,
  });
  const [ourInsurance, setOurInsurance] = useState('');
  const [otherInsurance, setOtherInsurance] = useState('');
  const [location, setLocation] = useState('');
  const [otherPhone, setOtherPhone] = useState('');
  const [insContact, setInsContact] = useState(''); // 우리 보험사 담당자 연락처
  const [otherInsContact, setOtherInsContact] = useState(''); // 상대 보험사 담당자 연락처
  const [deductStatus, setDeductStatus] = useState('미수'); // 면책금 수납 상태
  const titles = useTitles('accident');
  const locations = useLocations();
  const insCo = useInsuranceCompanies();

  const toggleIns = (key: string) => setInsFlags((s) => ({ ...s, [key]: !s[key] }));

  return (
    <OpFormBase
      eventType="accident"
      buildPayload={(d) => {
        if (d.title) titles.add(d.title);
        if (location) locations.add(location);
        if (ourInsurance) insCo.use(ourInsurance);
        if (otherInsurance) insCo.use(otherInsurance);
        return {
          title: d.title || '사고',
          acc_type: accType,
          acc_role: role,
          accident_status: status,
          fault_pct: Number(faultPct) || 0,
          rental_car: rental,
          ...insFlags,
          other_party_name: d.other_party_name || undefined,
          other_party_phone: otherPhone || undefined,
          accident_other: d.accident_other || undefined,
          other_party_insurance: otherInsurance || undefined,
          our_insurance: ourInsurance || undefined,
          insurance_no: d.insurance_no || undefined,
          insurance_contact: insContact || undefined,
          other_insurance_no: d.other_insurance_no || undefined,
          other_insurance_contact: otherInsContact || undefined,
          amount: Number(String(d.amount ?? '').replace(/,/g, '')) || 0,
          insurance_amount: Number(String(d.insurance_amount ?? '').replace(/,/g, '')) || undefined,
          deductible_amount: Number(String(d.deductible_amount ?? '').replace(/,/g, '')) || 0,
          deductible_paid: Number(String(d.deductible_paid ?? '').replace(/,/g, '')) || 0,
          deductible_status: deductStatus,
          location,
          memo: d.memo,
        };
      }}
    >
      <div className="form-section-title">
        <i className="ph ph-car-profile" />사고 접수
      </div>
      <div className="form-grid">
        <div className="form-row" style={{ gridColumn: '1 / -1' }}>
          <Field label="사고형태" required>
            <BtnGroup value={accType} onChange={setAccType} options={ACC_TYPES} />
          </Field>
          <Field label="가해/피해" required>
            <BtnGroup value={role} onChange={setRole} options={ROLES} />
          </Field>
        </div>
        <Field label="보험유형 (복수선택)" span={2}>
          <BtnGroupMulti
            options={INS_OPTIONS.map((o) => ({ value: o.key, label: o.label }))}
            values={insFlags}
            onChange={setInsFlags}
          />
        </Field>
        <Field label="진행 상태" required span={2}>
          <BtnGroup value={status} onChange={setStatus} options={STATUS} />
        </Field>
        <Field label="내 과실 (%)" span={2}>
          <BtnGroup value={faultPct} onChange={setFaultPct} options={FAULT_STEPS} />
        </Field>
        <Field label="대차" span={2}>
          <BtnGroup value={rental} onChange={setRental} options={RENTAL} />
        </Field>
        {/* 우리쪽 */}
        <Field label="우리 보험사" span={2}>
          <TextInput
            value={ourInsurance}
            onChange={(e) => setOurInsurance(e.target.value)}
            autoComplete="off"
          />
          <FavChips items={insCo.list} onPick={setOurInsurance} onDelete={(v) => insCo.remove(v)} />
        </Field>
        <Field label="접수번호">
          <TextInput name="insurance_no" />
        </Field>
        <Field label="담당자 연락처" span={2}>
          <PhoneInput value={insContact} onChange={setInsContact} />
        </Field>

        {/* 상대쪽 */}
        <Field label="상대 차량번호">
          <TextInput name="accident_other" placeholder="예: 12가3456" />
        </Field>
        <Field label="상대방 이름">
          <TextInput name="other_party_name" />
        </Field>
        <Field label="상대방 연락처">
          <PhoneInput value={otherPhone} onChange={setOtherPhone} />
        </Field>
        <Field label="상대 보험사" span={2}>
          <TextInput
            value={otherInsurance}
            onChange={(e) => setOtherInsurance(e.target.value)}
            autoComplete="off"
          />
          <FavChips items={insCo.list} onPick={setOtherInsurance} onDelete={(v) => insCo.remove(v)} />
        </Field>
        <Field label="상대 접수번호">
          <TextInput name="other_insurance_no" />
        </Field>
        <Field label="상대 담당자 연락처" span={2}>
          <PhoneInput value={otherInsContact} onChange={setOtherInsContact} />
        </Field>
        <Field label="사고 장소" span={2}>
          <TextInput
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            autoComplete="off"
          />
          <FavChips items={locations.list} onPick={setLocation} onDelete={(v) => locations.remove(v)} />
        </Field>
        <Field label="총 수리비">
          <NumberInput name="amount" placeholder="0" />
        </Field>
        <Field label="보험처리 금액">
          <NumberInput name="insurance_amount" placeholder="0" />
        </Field>
        <Field label="면책금 (고객부담)">
          <NumberInput name="deductible_amount" placeholder="0" />
        </Field>
        <Field label="수납한 면책금">
          <NumberInput name="deductible_paid" placeholder="0" />
        </Field>
        <Field label="면책금 상태" span={2}>
          <BtnGroup value={deductStatus} onChange={setDeductStatus} options={DEDUCT_STATUS} />
          <div className="text-2xs text-text-muted" style={{ marginTop: 4 }}>
            <i className="ph ph-warning-circle" style={{ marginRight: 4 }} />
            미수 면책금은 대시보드 미결업무에 표시됩니다
          </div>
        </Field>
        <Field label="제목">
          <TextInput name="title" placeholder="사고 요약" autoComplete="off" />
          <FavChips
            items={titles.list}
            onPick={(v) => {
              const el = document.querySelector<HTMLInputElement>('input[name="title"]');
              if (el) {
                el.value = v;
                el.dispatchEvent(new Event('input', { bubbles: true }));
              }
            }}
          />
        </Field>
        <Field label="상세 내용" span={2}>
          <TextArea name="memo" rows={3} placeholder="사고 경위·조치 사항·증빙" />
        </Field>
      </div>
    </OpFormBase>
  );
}
