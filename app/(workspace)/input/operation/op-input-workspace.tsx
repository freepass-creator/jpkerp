'use client';

import { Suspense, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSearchParams } from 'next/navigation';
import { Workspace } from '@/components/shared/panel';
import { useOpContext } from './op-context-store';
import { OP_LABELS, OP_SUBS, type OpKey } from './op-types';
import { opIconOf } from './op-icons';
import { TypesList } from './types-list';
import { OpContextPanel } from './op-context-panel';

const VISIBLE_KEYS: OpKey[] = ['ioc', 'pc', 'contact', 'accident', 'ignition', 'insurance', 'product_register', 'penalty_notice', 'disposal'];

// 유형별 폼
import { ContactForm } from './forms/contact-form';
import { MaintForm } from './forms/maint-form';
import { AccidentForm } from './forms/accident-form';
import { WashForm } from './forms/wash-form';
import { FuelForm } from './forms/fuel-form';
import { PenaltyForm } from './forms/penalty-form';
import { IocForm } from './forms/ioc-form';
import { InsuranceForm } from './forms/insurance-form';
import { CollectForm } from './forms/collect-form';
import { IgnitionForm } from './forms/ignition-form';
import { ProductForm } from './forms/product-form';
import { ProductRegisterForm } from './forms/product-register-form';
import { PcForm } from './forms/pc-form';
import { KeyForm } from './forms/key-form';
import { PenaltyNoticeForm } from './forms/penalty-notice-form';
import { DisposalForm } from './forms/disposal-form';
import { PenaltyContextPanel, usePenaltyComplete } from './penalty-context-panel';
import { downloadPenaltyZip } from '@/lib/penalty-pdf';
import { IgnitionContextPanel } from './ignition-context-panel';
import { usePenaltyStore, type PenaltyWorkItem } from './penalty-notice-store';

function FormFor({ k }: { k: OpKey }) {
  switch (k) {
    case 'ioc': return <IocForm />;
    case 'pc': return <PcForm />;
    case 'contact': return <ContactForm />;
    case 'accident': return <AccidentForm />;
    case 'ignition': return <IgnitionForm />;
    case 'insurance': return <InsuranceForm />;
    case 'product_register': return <ProductRegisterForm />;
    case 'penalty_notice': return <PenaltyNoticeForm />;
    case 'disposal': return <DisposalForm />;
    // hidden types
    case 'maint': return <MaintForm />;
    case 'repair': return <MaintForm />;
    case 'wash': return <WashForm />;
    case 'fuel': return <FuelForm />;
    case 'product': return <ProductForm />;
    case 'penalty': return <PenaltyForm />;
    case 'collect': return <CollectForm />;
    case 'key': return <KeyForm />;
    default: return <IocForm />;
  }
}

function OpInputWorkspaceInner() {
  const params = useSearchParams();
  const initial = params.get('type') as OpKey | null;
  const [selected, setSelected] = useState<OpKey>(
    initial && VISIBLE_KEYS.includes(initial) ? initial : 'ioc',
  );
  const { carNumber, reset } = useOpContext();

  useEffect(() => {
    const t = params.get('type') as OpKey | null;
    if (t && VISIBLE_KEYS.includes(t) && t !== selected) setSelected(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  const isPenaltyMode = selected === 'penalty_notice';
  const isIgnitionMode = selected === 'ignition';
  const penaltyCount = usePenaltyStore((s) => s.items.length);
  const penaltyClear = usePenaltyStore((s) => s.clear);
  const penaltyItems = usePenaltyStore((s) => s.items);
  const { completeAll: penaltyCompleteAll } = usePenaltyComplete();

  return (
    <Workspace layout="layout-254">
      {/* Panel 1 — 유형 선택 */}
      <section className="panel">
        <div className="panel-head">
          <div>
            <i className="ph ph-list-bullets" />
            <span className="panel-title">업무 선택</span>
          </div>
        </div>
        <div className="panel-body no-pad" style={{ overflow: 'hidden' }}>
          <TypesList selected={selected} onSelect={setSelected} />
        </div>
      </section>

      {/* Panel 2 — 유형별 폼 */}
      <section className="panel">
        <div className="panel-head">
          <div>
            <i
              className={`ph ${opIconOf(selected).name} text-[18px]`} style={{ color: opIconOf(selected).color }}
            />
            <span className="panel-title">{OP_LABELS[selected]}</span>
            <span className="panel-subtitle">{OP_SUBS[selected]}</span>
          </div>
          <div className="panel-head-actions">
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={reset}
            >
              <i className="ph ph-arrow-counter-clockwise" />
              초기화
            </button>
            <button type="submit" form="opForm" className="btn btn-primary btn-sm">
              <i className="ph ph-check" />
              등록
            </button>
          </div>
        </div>
        <div className="panel-body no-pad" style={{ overflow: 'hidden' }}>
          <FormFor k={selected} />
        </div>
      </section>

      {/* Panel 3 — 컨텍스트 (이력 or 과태료 매칭 결과) */}
      <section className="panel">
        <div className="panel-head">
          <div>
            <i className={`ph ${isPenaltyMode ? 'ph-receipt' : isIgnitionMode ? 'ph-engine' : 'ph-clock-counter-clockwise'}`} />
            <span className="panel-title">
              {isPenaltyMode ? '매칭 결과' : isIgnitionMode ? '시동제어 이력' : '이력관리'}
            </span>
            <span className="panel-subtitle">
              {isPenaltyMode
                ? (penaltyCount > 0 ? `${penaltyCount}건` : '고지서 업로드 시 표시')
                : (carNumber || '차량을 선택하세요')}
            </span>
          </div>
          {isPenaltyMode && penaltyCount > 0 && (
            <div className="panel-head-actions">
              <button type="button" className="btn btn-sm btn-outline" onClick={async () => {
                try {
                  toast.info('PDF 생성 중...');
                  await downloadPenaltyZip(penaltyItems, (done, total) => {
                    if (done === total) toast.success(`${total}건 ZIP 다운로드 완료`);
                  });
                } catch (err) { toast.error(`다운로드 실패: ${(err as Error).message}`); }
              }}>
                <i className="ph ph-download-simple" />전체 다운로드
              </button>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => {
                if (confirm(`대기 ${penaltyCount}건을 모두 비우시겠습니까?`)) penaltyClear();
              }}>
                <i className="ph ph-trash" />초기화
              </button>
              <button type="button" className="btn btn-sm btn-primary" onClick={penaltyCompleteAll}>
                <i className="ph ph-check-circle" />전체 처리완료
              </button>
            </div>
          )}
        </div>
        <div className="panel-body no-pad" style={{ overflow: 'hidden' }}>
          {isPenaltyMode ? <PenaltyContextPanel /> : isIgnitionMode ? <IgnitionContextPanel /> : <OpContextPanel />}
        </div>
      </section>
    </Workspace>
  );
}


export function OpInputWorkspace() {
  return <Suspense><OpInputWorkspaceInner /></Suspense>;
}
