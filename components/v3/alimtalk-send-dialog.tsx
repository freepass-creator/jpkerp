'use client';

/**
 * AlimtalkSendDialog — 미납자 알림톡 발송 다이얼로그
 *
 * - 이름·차량번호·연락처·미납액·연체일 prefilled
 * - 메시지 템플릿 자동 생성 (수정 가능)
 * - 발송 시 events/contact 이벤트 push (channel='알림톡')
 *   ↳ 기존 message-tool.tsx 가 이 채널을 picker 함
 * - 실제 Aligo 연동은 out-of-scope (이벤트만 기록, '발송 예약' 결과)
 */

import { EditDialog } from '@/components/shared/edit-dialog';
import { useAuth } from '@/lib/auth/context';
import { saveEvent } from '@/lib/firebase/events';
import { fmt } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export interface AlimtalkTarget {
  contract_code?: string;
  car_number?: string;
  contractor_name?: string;
  contractor_phone?: string;
  unpaid_total?: number;
  bill_count?: number;
  max_days?: number;
}

interface Props {
  open: boolean;
  target: AlimtalkTarget | null;
  onClose: () => void;
}

function buildTemplate(t: AlimtalkTarget): string {
  const name = t.contractor_name ?? '고객';
  const car = t.car_number ?? '';
  const amt = t.unpaid_total ? `${fmt(t.unpaid_total)}원` : '';
  const days = t.max_days ? `${t.max_days}일` : '';
  const lines = [
    `[JPK 장기렌터카] ${name}님 안녕하세요.`,
    car
      ? `차량 ${car}의 렌탈료가 ${days ? `${days} ` : ''}연체되어 안내 드립니다.`
      : '렌탈료가 연체되어 안내 드립니다.',
    amt ? `미납액: ${amt}` : '',
    '빠른 시일 내 입금 부탁드립니다.',
    '문의: 02-1234-5678',
  ].filter(Boolean);
  return lines.join('\n');
}

export function AlimtalkSendDialog({ open, target, onClose }: Props) {
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && target) {
      setMessage(buildTemplate(target));
      setPhone(target.contractor_phone ?? '');
    }
  }, [open, target]);

  if (!target) return null;

  const onSend = async () => {
    if (!phone.trim()) {
      toast.error('수신자 연락처를 입력하세요');
      return;
    }
    if (!message.trim()) {
      toast.error('메시지를 입력하세요');
      return;
    }
    setBusy(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      // contact 이벤트 push — message-tool.tsx 이력에서 픽업
      await saveEvent({
        type: 'contact',
        date: today,
        title: '미납 독촉 알림톡',
        contact_channel: '알림톡',
        contact_result: '발송 예약',
        memo: message,
        car_number: target.car_number,
        contract_code: target.contract_code,
        customer_name: target.contractor_name,
        customer_phone: phone,
        handler_uid: user?.uid,
        handler: user?.displayName ?? user?.email ?? undefined,
      });

      // 추가로 collect 이벤트도 기록 — 미납관리 grid 의 sms_count 집계 반영
      await saveEvent({
        type: 'collect',
        date: today,
        title: '알림톡 독촉',
        memo: `알림톡: ${message.slice(0, 60)}${message.length > 60 ? '…' : ''}`,
        collect_result: '발송 예약',
        car_number: target.car_number,
        contract_code: target.contract_code,
        handler_uid: user?.uid,
        handler: user?.displayName ?? user?.email ?? undefined,
      });

      toast.success('알림톡 발송 예약 완료 (이력 등록)');
      onClose();
    } catch (e) {
      toast.error(`발송 실패: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const lbl: React.CSSProperties = {
    fontSize: 11,
    color: 'var(--c-text-sub)',
    marginBottom: 2,
    fontWeight: 600,
  };
  const inp: React.CSSProperties = {
    width: '100%',
    padding: '6px 8px',
    border: '1px solid var(--c-border)',
    background: 'var(--c-surface)',
    color: 'var(--c-text)',
    fontFamily: 'inherit',
    fontSize: 13,
    borderRadius: 2,
  };

  return (
    <EditDialog
      open={open}
      title="알림톡 발송"
      subtitle={`${target.contractor_name ?? '-'} · ${target.car_number ?? '-'}${
        target.unpaid_total ? ` · 미납 ${fmt(target.unpaid_total)}원` : ''
      }`}
      onClose={onClose}
      onSave={onSend}
      saving={busy}
      width={520}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label>
          <div style={lbl}>수신 연락처 *</div>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="010-0000-0000"
            style={inp}
          />
        </label>
        <label>
          <div style={lbl}>메시지</div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={8}
            style={{ ...inp, fontFamily: 'inherit', resize: 'vertical' }}
          />
        </label>
        <div className="text-text-muted" style={{ fontSize: 11 }}>
          * Aligo 실연동 전 — 발송 이력만 기록됩니다 (events/contact + events/collect)
        </div>
      </div>
    </EditDialog>
  );
}
