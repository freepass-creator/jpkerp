'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Workspace } from '@/components/shared/panel';
import { INPUT_LABELS, INPUT_SUBS, INPUT_ICONS, type InputKey } from './input-types';
import { InputTypesList } from './input-types-list';
import { InputContextPanel } from './input-context-panel';

import { AssetCreateForm } from './forms/asset-create-form';
import { ContractCreateForm } from './forms/contract-create-form';
import { ContractExtensionForm } from './forms/contract-extension-form';
import { CustomerCreateForm } from './forms/customer-create-form';
import { TaskCreateForm } from './forms/task-create-form';
import { GpsCreateForm } from './forms/gps-create-form';
import { PartnerCreateForm } from './forms/partner-create-form';
import { OcrCaptureForm } from './forms/ocr-capture-form';

const VALID_KEYS: InputKey[] = ['asset', 'contract', 'extension', 'customer', 'task', 'gps', 'partner', 'ocr'];

function FormFor({ k }: { k: InputKey }) {
  switch (k) {
    case 'asset': return <AssetCreateForm />;
    case 'contract': return <ContractCreateForm />;
    case 'extension': return <ContractExtensionForm />;
    case 'customer': return <CustomerCreateForm />;
    case 'task': return <TaskCreateForm />;
    case 'gps': return <GpsCreateForm />;
    case 'partner': return <PartnerCreateForm />;
    case 'ocr': return <OcrCaptureForm />;
    default: return null;
  }
}

function InputWorkspaceInner() {
  const params = useSearchParams();
  const initial = (params.get('type') as InputKey | null);
  const [selected, setSelected] = useState<InputKey>(
    initial && VALID_KEYS.includes(initial) ? initial : 'asset',
  );

  // ?type= 변경 반영
  useEffect(() => {
    const t = params.get('type') as InputKey | null;
    if (t && VALID_KEYS.includes(t) && t !== selected) setSelected(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  return (
    <Workspace layout="layout-254">
      {/* Panel 1 — 유형 선택 */}
      <section className="panel">
        <div className="panel-head">
          <div>
            <i className="ph ph-list-bullets" />
            <span className="panel-title">개별 입력</span>
          </div>
        </div>
        <div className="panel-body no-pad" style={{ overflow: 'hidden' }}>
          <InputTypesList selected={selected} onSelect={setSelected} />
        </div>
      </section>

      {/* Panel 2 — 유형별 폼 */}
      <section className="panel">
        <div className="panel-head">
          <div>
            <i
              className={`ph ${INPUT_ICONS[selected]} text-text-sub text-[18px]`}
            />
            <span className="panel-title">{INPUT_LABELS[selected]}</span>
            <span className="panel-subtitle">{INPUT_SUBS[selected]}</span>
          </div>
          <div className="panel-head-actions">
            <button
              type="reset"
              form="inputForm"
              className="btn btn-sm btn-outline"
            >
              <i className="ph ph-arrow-counter-clockwise" />
              초기화
            </button>
            <button type="submit" form="inputForm" className="btn btn-primary btn-sm">
              <i className="ph ph-check" />
              등록
            </button>
          </div>
        </div>
        <div className="panel-body no-pad" style={{ overflow: 'hidden' }}>
          <FormFor k={selected} />
        </div>
      </section>

      {/* Panel 3 — 최근 등록 */}
      <section className="panel">
        <div className="panel-head">
          <div>
            <i className="ph ph-clock-counter-clockwise" />
            <span className="panel-title">최근 등록</span>
            <span className="panel-subtitle">{INPUT_LABELS[selected]}</span>
          </div>
        </div>
        <div className="panel-body no-pad" style={{ overflow: 'hidden' }}>
          <InputContextPanel selected={selected} />
        </div>
      </section>
    </Workspace>
  );
}


export function InputWorkspace() {
  return <Suspense><InputWorkspaceInner /></Suspense>;
}
