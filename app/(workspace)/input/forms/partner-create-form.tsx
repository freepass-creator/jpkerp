'use client';

import { useState } from 'react';
import { InputFormShell } from './input-form-shell';
import { Field, TextInput, PhoneInput, TextArea } from '@/components/form/field';
import { BtnGroup } from '@/components/form/btn-group';

export function PartnerCreateForm() {
  const [phone, setPhone] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [status, setStatus] = useState('활성');

  return (
    <InputFormShell
      collection="partners"
      validate={(d) => {
        if (!d.partner_name) return '회원사 이름을 입력하세요';
        if (!d.biz_no) return '사업자등록번호를 입력하세요';
        if (!d.corp_no) return '법인등록번호를 입력하세요';
        return null;
      }}
      buildPayload={(d) => ({
        partner_name: d.partner_name,
        ceo: d.ceo || undefined,
        biz_no: d.biz_no,
        corp_no: d.corp_no,
        phone: phone || undefined,
        address: d.address || undefined,
        contact_name: d.contact_name || undefined,
        contact_phone: contactPhone || undefined,
        email: d.email || undefined,
        note: d.note || undefined,
        biz_status: status,  // 한글 표시용 (활성/비활성)
      })}
      onSaved={() => { setPhone(''); setContactPhone(''); }}
    >
      <div className="form-section">
        <div className="form-section-title"><i className="ph ph-buildings" />회원사 기본정보</div>
        <div className="form-grid">
          <Field label="회원사명" required>
            <TextInput name="partner_name" required autoFocus />
          </Field>
          <Field label="대표자">
            <TextInput name="ceo" />
          </Field>
          <Field label="사업자등록번호" required>
            <TextInput name="biz_no" placeholder="000-00-00000" required />
          </Field>
          <Field label="법인등록번호" required>
            <TextInput name="corp_no" placeholder="000000-0000000" required />
          </Field>
          <Field label="대표전화">
            <PhoneInput value={phone} onChange={setPhone} />
          </Field>
          <Field label="이메일">
            <TextInput name="email" type="email" autoComplete="off" />
          </Field>
          <Field label="주소" span={3}>
            <TextInput name="address" />
          </Field>
        </div>
        <div className="text-2xs text-text-muted" style={{ marginTop: 8 }}>
          <i className="ph ph-info" style={{ marginRight: 4 }} />
          회원사 코드(PT00000)는 저장 시 자동 생성됩니다
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-title"><i className="ph ph-user" />담당자</div>
        <div className="form-grid">
          <Field label="담당자명">
            <TextInput name="contact_name" />
          </Field>
          <Field label="담당자 연락처">
            <PhoneInput value={contactPhone} onChange={setContactPhone} />
          </Field>
          <Field label="상태" span={3}>
            <BtnGroup value={status} onChange={setStatus} options={['활성', '비활성']} />
          </Field>
          <Field label="비고" span={3}>
            <TextArea name="note" rows={3} placeholder="정산주기·수수료·특이사항" />
          </Field>
        </div>
      </div>
    </InputFormShell>
  );
}
