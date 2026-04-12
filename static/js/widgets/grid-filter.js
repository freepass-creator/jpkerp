/**
 * grid-filter.js — AG Grid 헤더 클릭 → 값 목록 필터
 *
 * 자동 초기화: initAllGridFilters() — 페이지 내 모든 AG Grid에 바인딩
 */

let popup = null;

let currentCol = null;

export function initAllGridFilters() {
  document.addEventListener('click', (e) => {
    const headerCell = e.target.closest('.ag-header-cell');
    if (!headerCell) {
      if (!e.target.closest('.grid-filter-popup')) closePopup();
      return;
    }

    const colId = headerCell.getAttribute('col-id');
    if (!colId || colId === '0') return;

    const gridEl = headerCell.closest('.ag-theme-alpine');
    if (!gridEl) return;

    e.stopPropagation();

    // 토글: 같은 칸 다시 누르면 닫기
    if (popup && currentCol === colId) { closePopup(); return; }

    let api = gridEl.__agGridApi || gridEl._agApi || null;

    if (!api) {
      showDomFilterPopup(gridEl, colId, headerCell);
    } else {
      showFilterPopup(api, colId, headerCell);
    }
    currentCol = colId;
  });
}

function detectColType(counts, sorted) {
  const vals = sorted.map(([v]) => v).filter(v => v !== '(빈값)');
  const numCount = vals.filter(v => !isNaN(Number(v.replace(/,/g, '')))).length;
  if (numCount > vals.length * 0.7) return 'number';
  if (sorted.length <= 10) return 'select';
  return 'text';
}

function showDomFilterPopup(gridEl, colId, headerEl) {
  closePopup();

  const headers = gridEl.querySelectorAll('.ag-header-cell');
  let colIdx = -1;
  headers.forEach((h, i) => { if (h.getAttribute('col-id') === colId) colIdx = i; });
  if (colIdx < 0) return;

  const counts = {};
  gridEl.querySelectorAll('.ag-row').forEach(row => {
    const cells = row.querySelectorAll('.ag-cell');
    const cell = cells[colIdx];
    const val = (cell?.textContent || '').trim() || '(빈값)';
    counts[val] = (counts[val] || 0) + 1;
  });

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, c]) => s + c, 0);
  const colType = detectColType(counts, sorted);
  const rect = headerEl.getBoundingClientRect();

  popup = document.createElement('div');
  popup.className = 'grid-filter-popup';
  popup.style.top = rect.bottom + 2 + 'px';
  popup.style.left = rect.left + 'px';
  popup.style.minWidth = Math.max(rect.width, 160) + 'px';

  const clearAll = () => { gridEl.querySelectorAll('.ag-row').forEach(row => { row.style.display = ''; }); };
  const filterRows = (fn) => {
    gridEl.querySelectorAll('.ag-row').forEach(row => {
      const cells = row.querySelectorAll('.ag-cell');
      const cell = cells[colIdx];
      const cellVal = (cell?.textContent || '').trim();
      row.style.display = fn(cellVal) ? '' : 'none';
    });
  };

  if (colType === 'number') {
    popup.innerHTML = `
      <div style="padding:8px;display:flex;flex-direction:column;gap:6px;font-size:var(--font-size-sm)">
        <div style="display:flex;gap:4px">
          <button class="btn gf-sort" data-dir="asc" style="flex:1;font-size:var(--font-size-xs)">오름차순 ↑</button>
          <button class="btn gf-sort" data-dir="desc" style="flex:1;font-size:var(--font-size-xs)">내림차순 ↓</button>
        </div>
        <div style="display:flex;gap:4px;align-items:center">
          <input type="text" class="gf-num" id="gfMin" placeholder="이상" style="flex:1;height:24px;padding:0 6px;border:1px solid var(--c-border);border-radius:2px;font-size:var(--font-size-xs)">
          <span>~</span>
          <input type="text" class="gf-num" id="gfMax" placeholder="이하" style="flex:1;height:24px;padding:0 6px;border:1px solid var(--c-border);border-radius:2px;font-size:var(--font-size-xs)">
          <button class="btn" id="gfNumApply" style="font-size:var(--font-size-xs)">적용</button>
        </div>
      </div>
      <div class="gf-footer"><button class="btn gf-reset">초기화</button><button class="btn btn-primary gf-apply">적용</button></div>
    `;
    popup.querySelectorAll('.gf-sort').forEach(btn => {
      btn.addEventListener('click', () => {
        const dir = btn.dataset.dir;
        const rows = Array.from(gridEl.querySelectorAll('.ag-row'));
        rows.sort((a, b) => {
          const va = Number((a.querySelectorAll('.ag-cell')[colIdx]?.textContent || '0').replace(/[^0-9.-]/g, '')) || 0;
          const vb = Number((b.querySelectorAll('.ag-cell')[colIdx]?.textContent || '0').replace(/[^0-9.-]/g, '')) || 0;
          return dir === 'asc' ? va - vb : vb - va;
        });
        const parent = rows[0]?.parentNode;
        if (parent) rows.forEach(r => parent.appendChild(r));
        closePopup();
      });
    });
    popup.querySelector('#gfNumApply')?.addEventListener('click', () => {
      const min = Number(popup.querySelector('#gfMin').value.replace(/,/g, '')) || -Infinity;
      const max = Number(popup.querySelector('#gfMax').value.replace(/,/g, '')) || Infinity;
      filterRows(v => { const n = Number(v.replace(/[^0-9.-]/g, '')) || 0; return n >= min && n <= max; });
      closePopup();
    });
  } else if (colType === 'select') {
    popup.innerHTML = `
      <input class="gf-search" placeholder="검색..." autofocus>
      <div class="gf-list">
        ${sorted.map(([val, cnt]) =>
          `<div class="gf-item" data-val="${val}">${val}<span class="gf-count">${cnt}</span></div>`
        ).join('')}
      </div>
      <div class="gf-footer"><button class="btn gf-reset">초기화</button><button class="btn btn-primary gf-apply">적용</button></div>
    `;
    popup.querySelector('.gf-search').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      popup.querySelectorAll('.gf-item').forEach(item => {
        item.style.display = item.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
    popup.querySelectorAll('.gf-item').forEach(item => {
      item.addEventListener('click', () => {
        const val = item.dataset.val;
        filterRows(v => (v || '(빈값)') === val);
        closePopup();
      });
    });
  } else {
    popup.innerHTML = `
      <input class="gf-search" placeholder="검색어 입력 후 Enter..." autofocus>
      <div class="gf-footer"><button class="btn gf-reset">초기화</button><button class="btn btn-primary gf-apply">적용</button></div>
    `;
    popup.querySelector('.gf-search').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = e.target.value.toLowerCase();
        filterRows(v => !q || v.toLowerCase().includes(q));
        closePopup();
      }
    });
  }

  // 초기화/적용 바인딩
  popup.querySelector('.gf-reset')?.addEventListener('click', () => { clearAll(); closePopup(); });
  popup.querySelector('.gf-apply')?.addEventListener('click', () => {
    const search = popup.querySelector('.gf-search');
    if (search?.value) {
      const q = search.value.toLowerCase();
      filterRows(v => !q || v.toLowerCase().includes(q));
    }
    closePopup();
  });

  document.body.appendChild(popup);
  popup.querySelector('.gf-search')?.focus();
}

function showFilterPopup(api, colId, headerEl) {
  closePopup();

  const counts = {};
  api.forEachNode(node => {
    const val = String(node.data?.[colId] ?? '').trim() || '(빈값)';
    counts[val] = (counts[val] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, c]) => s + c, 0);
  const colType = detectColType(counts, sorted);
  const rect = headerEl.getBoundingClientRect();
  const filterInstance = api.getFilterInstance(colId);

  popup = document.createElement('div');
  popup.className = 'grid-filter-popup';
  popup.style.top = rect.bottom + 2 + 'px';
  popup.style.left = rect.left + 'px';
  popup.style.minWidth = Math.max(rect.width, 160) + 'px';

  const applyFilter = (model) => { if (filterInstance) { filterInstance.setModel(model); api.onFilterChanged(); } };

  if (colType === 'number') {
    popup.innerHTML = `
      <div style="padding:8px;display:flex;flex-direction:column;gap:6px;font-size:var(--font-size-sm)">
        <div style="display:flex;gap:4px">
          <button class="btn gf-sort" data-dir="asc" style="flex:1;font-size:var(--font-size-xs)">오름차순 ↑</button>
          <button class="btn gf-sort" data-dir="desc" style="flex:1;font-size:var(--font-size-xs)">내림차순 ↓</button>
        </div>
        <div style="display:flex;gap:4px;align-items:center">
          <input type="text" id="gfMin" placeholder="이상" style="flex:1;height:24px;padding:0 6px;border:1px solid var(--c-border);border-radius:2px;font-size:var(--font-size-xs)">
          <span>~</span>
          <input type="text" id="gfMax" placeholder="이하" style="flex:1;height:24px;padding:0 6px;border:1px solid var(--c-border);border-radius:2px;font-size:var(--font-size-xs)">
          <button class="btn" id="gfNumApply" style="font-size:var(--font-size-xs)">적용</button>
        </div>
      </div>
      <div class="gf-footer"><button class="btn gf-reset">초기화</button><button class="btn btn-primary gf-apply">적용</button></div>
    `;
    popup.querySelectorAll('.gf-sort').forEach(btn => {
      btn.addEventListener('click', () => {
        const colState = [{ colId, sort: btn.dataset.dir }];
        api.applyColumnState({ state: colState });
        closePopup();
      });
    });
    popup.querySelector('#gfNumApply')?.addEventListener('click', () => {
      const min = popup.querySelector('#gfMin').value.replace(/,/g, '');
      const max = popup.querySelector('#gfMax').value.replace(/,/g, '');
      const conditions = [];
      if (min) conditions.push({ type: 'greaterThanOrEqual', filter: Number(min) });
      if (max) conditions.push({ type: 'lessThanOrEqual', filter: Number(max) });
      if (conditions.length === 2) applyFilter({ operator: 'AND', conditions });
      else if (conditions.length === 1) applyFilter(conditions[0]);
      closePopup();
    });
  } else if (colType === 'select') {
    const currentFilter = filterInstance?.getModel()?.filter || '';
    popup.innerHTML = `
      <input class="gf-search" placeholder="검색..." autofocus>
      <div class="gf-list">
        ${sorted.map(([val, cnt]) => {
          const active = currentFilter === val ? ' is-active' : '';
          return `<div class="gf-item${active}" data-val="${val === '(빈값)' ? '' : val}">${val}<span class="gf-count">${cnt}</span></div>`;
        }).join('')}
      </div>
      <div class="gf-footer"><button class="btn gf-reset">초기화</button><button class="btn btn-primary gf-apply">적용</button></div>
    `;
    popup.querySelector('.gf-search').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      popup.querySelectorAll('.gf-item').forEach(item => {
        item.style.display = item.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
    popup.querySelectorAll('.gf-item').forEach(item => {
      item.addEventListener('click', () => {
        const val = item.dataset.val;
        applyFilter(val ? { type: 'equals', filter: val } : null);
        closePopup();
      });
    });
  } else {
    popup.innerHTML = `
      <input class="gf-search" placeholder="검색어 입력 후 Enter..." autofocus>
      <div class="gf-footer"><button class="btn gf-reset">초기화</button><button class="btn btn-primary gf-apply">적용</button></div>
    `;
    popup.querySelector('.gf-search').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = e.target.value.trim();
        applyFilter(q ? { type: 'contains', filter: q } : null);
        closePopup();
      }
    });
  }

  popup.querySelector('.gf-reset')?.addEventListener('click', () => { applyFilter(null); closePopup(); });
  popup.querySelector('.gf-apply')?.addEventListener('click', () => {
    const search = popup.querySelector('.gf-search');
    if (search?.value) applyFilter({ type: 'contains', filter: search.value.trim() });
    closePopup();
  });
  document.body.appendChild(popup);
  popup.querySelector('.gf-search')?.focus();
}

function closePopup() {
  if (popup) { popup.remove(); popup = null; }
}
