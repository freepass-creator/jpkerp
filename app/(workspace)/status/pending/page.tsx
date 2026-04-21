'use client';

import { useRef, useState } from 'react';
import { Workspace } from '@/components/shared/panel';
import { GridPanel } from '@/components/shared/grid-panel';
import type { JpkGridApi } from '@/components/shared/jpk-grid';
import { PendingClient, CAT_META, type PendingRow, type Cat } from './pending-client';

export default function Page() {
  const gridRef = useRef<JpkGridApi<PendingRow> | null>(null);
  const [count, setCount] = useState(0);
  const [filter, setFilter] = useState<'all' | Cat>('all');

  return (
    <Workspace layout="layout-1">
      <GridPanel<PendingRow>
        icon="ph-shield-check"
        title="미결업무"
        subtitle="사고진행 · 차량케어 · 미출고 통합"
        count={count}
        unit="건"
        gridRef={gridRef}
        exportFileName="미결업무"
        primaryActions={
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              type="button"
              className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setFilter('all')}
            >
              전체
            </button>
            {(Object.keys(CAT_META) as Cat[]).map((k) => (
              <button
                key={k}
                type="button"
                className={`btn btn-sm ${filter === k ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setFilter(k)}
              >
                <i className={`ph ${CAT_META[k].icon}`} style={{ color: filter === k ? '#fff' : CAT_META[k].color }} />
                {CAT_META[k].label}
              </button>
            ))}
          </div>
        }
      >
        <PendingClient gridRef={gridRef} onCountChange={setCount} filter={filter} />
      </GridPanel>
    </Workspace>
  );
}
