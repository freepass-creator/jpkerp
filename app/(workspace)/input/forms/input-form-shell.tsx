'use client';

import { type FormEvent, type ReactNode, useRef } from 'react';
import { toast } from 'sonner';
import { ref, push, serverTimestamp } from 'firebase/database';
import { getRtdb } from '@/lib/firebase/rtdb';
import { useAuth } from '@/lib/auth/context';
import { useFormSave } from '@/lib/hooks/useFormSave';
import { generateCode, type CodePrefix } from '@/lib/code-gen';

interface Props {
  /** RTDB collection path (예: 'customers', 'assets', 'contracts', 'tasks') */
  collection: string;
  /** 폼 제출 시 저장할 payload 빌드 */
  buildPayload: (data: Record<string, string>) => Record<string, unknown>;
  /** 저장 후 추가 작업 (ID 연결, 이벤트 생성 등) */
  afterSave?: (key: string, payload: Record<string, unknown>) => Promise<void>;
  /** 저장 성공 후 폼 초기화 콜백 */
  onSaved?: () => void;
  /** 저장 전 유효성 체크 — false 반환 시 중단 */
  validate?: (data: Record<string, string>) => string | null;
  children: ReactNode;
}

/**
 * 개별입력 공통 폼 shell — panel-head 버튼(form="inputForm")과 연결.
 * save flow는 useFormSave 훅과 공유 (OpFormBase와 동일 패턴).
 */
export function InputFormShell({ collection, buildPayload, afterSave, onSaved, validate, children }: Props) {
  const { user } = useAuth();
  const formRef = useRef<HTMLFormElement | null>(null);
  const { run } = useFormSave({ formRef, onSaved });

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data: Record<string, string> = {};
    fd.forEach((v, k) => { data[k] = String(v ?? ''); });

    if (validate) {
      const err = validate(data);
      if (err) {
        toast.error(err);
        return;
      }
    }

    await run(async () => {
      // 컬렉션별 코드 자동 부여
      const CODE_MAP: Record<string, { field: string; prefix: CodePrefix }> = {
        customers: { field: 'customer_code', prefix: 'CU' },
        assets: { field: 'asset_code', prefix: 'AS' },
        contracts: { field: 'contract_code', prefix: 'CT' },
        partners: { field: 'partner_code', prefix: 'PT' },
        vendors: { field: 'vendor_code', prefix: 'VD' },
        gps_devices: { field: 'gps_code', prefix: 'GP' },
        loans: { field: 'loan_code', prefix: 'LN' },
        insurances: { field: 'insurance_code', prefix: 'IN' },
      };
      const codeSpec = CODE_MAP[collection];
      const built = buildPayload(data);
      const autoCode = codeSpec && !built[codeSpec.field]
        ? { [codeSpec.field]: generateCode(codeSpec.prefix) }
        : {};

      const payload = {
        ...built,
        ...autoCode,
        handler_uid: user?.uid,
        handler: user?.displayName ?? user?.email ?? undefined,
        created_at: Date.now(),
        updated_at: serverTimestamp(),
        status: 'active',
      };
      const r = push(ref(getRtdb(), collection));
      const key = r.key!;
      const { set } = await import('firebase/database');
      await set(r, payload);
      if (afterSave) await afterSave(key, payload);
    });
  }

  return (
    <form
      ref={formRef}
      id="inputForm"
      onSubmit={onSubmit}
      className="p-5 overflow-y-auto scrollbar-thin"
      style={{ height: '100%' }}
    >
      {children}
    </form>
  );
}
