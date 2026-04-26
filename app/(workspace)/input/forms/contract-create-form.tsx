'use client';

import { BtnGroup } from '@/components/form/btn-group';
import { CarNumberPicker } from '@/components/form/car-number-picker';
import { EntityPicker } from '@/components/form/entity-picker';
import {
  DateInput,
  Field,
  NumberInput,
  PhoneInput,
  TextArea,
  TextInput,
} from '@/components/form/field';
import { deriveBillingsFromContract } from '@/lib/derive/billings';
import { sanitizeCarNumber } from '@/lib/format-input';
import type { RtdbContract } from '@/lib/types/rtdb-entities';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { InputFormShell } from './input-form-shell';

const STATUS_OPTS = ['계약진행', '계약대기', '계약해지', '계약완료'];
const PRODUCT_OPTS = ['장기렌트', '단기렌트', '리스', '월렌트', '기타'];

interface CustomerRec extends Record<string, unknown> {
  _key?: string;
  name?: string;
  phone?: string;
  license_no?: string;
  partner_code?: string;
}
interface PartnerRec extends Record<string, unknown> {
  _key?: string;
  partner_code?: string;
  partner_name?: string;
}

function genContractCode(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `CN-${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export function ContractCreateForm() {
  const [carNumber, setCarNumber] = useState('');
  const [contractorName, setContractorName] = useState('');
  const [contractorPhone, setContractorPhone] = useState('');
  const [partnerCode, setPartnerCode] = useState('');
  const [status, setStatus] = useState('계약진행');
  const [productType, setProductType] = useState('장기렌트');
  const [currentUnpaid, setCurrentUnpaid] = useState('');
  const autoCode = useMemo(() => genContractCode(), []);

  return (
    <InputFormShell
      collection="contracts"
      validate={(d) => {
        if (!contractorName) return '계약자 이름을 입력하세요';
        if (!carNumber) return '차량번호를 입력하세요';
        return null;
      }}
      buildPayload={(d) => ({
        contract_code: d.contract_code || autoCode,
        contractor_name: contractorName,
        contractor_phone: contractorPhone || undefined,
        car_number: sanitizeCarNumber(carNumber),
        partner_code: partnerCode || undefined,
        product_type: productType,
        contract_status: status,
        start_date: d.start_date || undefined,
        end_date: d.end_date || undefined,
        rent_months: d.rent_months ? Number(d.rent_months) : undefined,
        rent_amount: d.rent_amount ? Number(String(d.rent_amount).replace(/,/g, '')) : undefined,
        deposit_amount: d.deposit_amount
          ? Number(String(d.deposit_amount).replace(/,/g, ''))
          : undefined,
        auto_debit_day: d.auto_debit_day || undefined,
        current_unpaid: currentUnpaid ? Number(String(currentUnpaid).replace(/,/g, '')) : undefined,
        note: d.note || undefined,
      })}
      afterSave={async (key, payload) => {
        try {
          const contract = { ...payload, _key: key } as RtdbContract;
          const initialUnpaid = Number(payload.current_unpaid) || 0;
          const r = await deriveBillingsFromContract(contract, { initialUnpaid });
          if (r.created > 0) {
            const cutoverNote =
              r.cutoverPaid && r.cutoverPaid > 0 ? ` (이관 ${r.cutoverPaid}회차 선납처리)` : '';
            toast.success(`수납스케줄 ${r.created}회차 생성${cutoverNote}`);
          } else if (r.reason && r.skipped === 0) {
            toast.info(`수납스케줄 생략: ${r.reason}`);
          }
        } catch (err) {
          toast.error(`수납스케줄 생성 실패: ${(err as Error).message}`);
        }
      }}
      onSaved={() => {
        setCarNumber('');
        setContractorName('');
        setContractorPhone('');
        setPartnerCode('');
        setCurrentUnpaid('');
      }}
    >
      <div className="form-section">
        <div className="form-section-title">
          <i className="ph ph-handshake" />
          계약 기본정보
        </div>
        <div className="form-grid">
          <Field label="계약코드">
            <TextInput name="contract_code" defaultValue={autoCode} placeholder={autoCode} />
          </Field>
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
            <EntityPicker<PartnerRec>
              collection="partners"
              value={partnerCode}
              onChange={(v) => setPartnerCode(v.toUpperCase())}
              primaryField="partner_code"
              secondaryField="partner_name"
              searchFields={['partner_code', 'partner_name']}
              placeholder="예: JPK"
              createHref="/input?type=partner"
              createLabel="새 회원사 등록"
            />
          </Field>
          <Field label="계약자" required>
            <EntityPicker<CustomerRec>
              collection="customers"
              value={contractorName}
              onChange={(v, rec) => {
                setContractorName(v);
                // 선택 시 연락처 자동 채움
                if (rec?.phone && !contractorPhone) setContractorPhone(rec.phone);
              }}
              primaryField="name"
              secondaryField="phone"
              tertiaryField="license_no"
              searchFields={['name', 'phone', 'license_no']}
              required
              createHref="/input?type=customer"
              createLabel="새 고객 등록"
            />
          </Field>
          <Field label="연락처" span={2}>
            <PhoneInput value={contractorPhone} onChange={setContractorPhone} />
          </Field>
          <Field label="상태" span={3}>
            <BtnGroup value={status} onChange={setStatus} options={STATUS_OPTS} />
          </Field>
          <Field label="상품" span={3}>
            <BtnGroup value={productType} onChange={setProductType} options={PRODUCT_OPTS} />
          </Field>
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-title">
          <i className="ph ph-calendar" />
          기간 · 금액
        </div>
        <div className="form-grid">
          <Field label="시작일">
            <DateInput name="start_date" />
          </Field>
          <Field label="종료일">
            <DateInput name="end_date" />
          </Field>
          <Field label="기간 (개월)">
            <NumberInput name="rent_months" placeholder="48" />
          </Field>
          <Field label="월 대여료">
            <NumberInput name="rent_amount" placeholder="0" />
          </Field>
          <Field label="보증금">
            <NumberInput name="deposit_amount" placeholder="0" />
          </Field>
          <Field label="결제일">
            <TextInput name="auto_debit_day" placeholder="예: 15" />
          </Field>
          <Field
            label="현재 미납금액 (이관)"
            span={3}
            hint="기존 계약을 본 시스템으로 이관할 때만 입력. 과거 회차에서 자동 선납처리 후 남은 미수만큼 미납으로 산정"
          >
            <NumberInput
              value={currentUnpaid}
              onChange={(e) => setCurrentUnpaid(e.target.value)}
              placeholder="0 (신규 계약은 비워둠)"
            />
          </Field>
          <Field label="메모" span={3}>
            <TextArea name="note" rows={3} placeholder="특이사항" />
          </Field>
        </div>
      </div>
    </InputFormShell>
  );
}
