/**
 * grid-filter.js — AG Grid 필터 UI 커스텀
 *
 * AG Grid 기본 필터 기능 그대로 사용, UI만 커스텀 드롭다운.
 * 헤더 칸 클릭 → 값 목록/검색/숫자구간 드롭다운
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

    // 토글
    if (popup && currentCol === colId) { closePopup(); return; }

    // AG Grid API — agGrid.createGrid이 반환한 api를 찾기
    // gridEl에서 gridApi를 찾는 방법: AG Grid v32+ 에서는 gridEl.__agGridApi
    const api = findGridApi(gridEl);
    if (!api) return;

    showFilterPopup(api, colId, headerCell);
    currentCol = colId;
  });
}

function findGridApi(gridEl) {
  // AG Grid 내부에서 API 접근
  if (gridEl._agApi) return gridEl._agApi;
  // ag-grid v31+ stores in __agGridApi
  if (gridEl.__agGridApi) return gridEl.__agGridApi;
  // 시도: ag-root-wrapper에서
  try {
    const wrapper = gridEl.querySelector('.ag-root-wrapper');
    if (wrapper?.__agGridApi) return wrapper.__agGridApi;
  } catch {}
  return null;
}

function detectColType(sorted) {
  const vals = sorted.map(([v]) => v).filter(v => v !== '(빈값)');
  const numCount = vals.filter(v => !isNaN(Number(v.replace(/,/g, '')))).length;
  if (numCount > vals.length * 0.7 && vals.length > 0) return 'number';
  if (sorted.length <= 10) return 'select';
  return 'text';
}

function showFilterPopup(api, colId, headerEl) {
  closePopup();

  // 데이터 수집
  const counts = {};
  api.forEachNode(node => {
    const raw = node.data?.[colId];
    const val = (raw == null || raw === '') ? '(빈값)' : String(raw).trim();
    counts[val] = (counts[val] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, c]) => s + c, 0);
  const colType = detectColType(sorted);
  const rect = headerEl.getBoundingClientRect();
  const filterInstance = null; // deprecated, use setColumnFilterModel

  popup = document.createElement('div');
  popup.className = 'grid-filter-popup';
  popup.style.top = rect.bottom + 2 + 'px';
  popup.style.left = rect.left + 'px';
  popup.style.minWidth = Math.max(rect.width, 160) + 'px';

  const applyFilter = (model) => {
    try { api.setColumnFilterModel(colId, model).then(() => api.onFilterChanged()); } catch { try { api.setColumnFilterModel(colId, model); api.onFilterChanged(); } catch(e) { console.warn('[filter]', e); } }
    updateBadge(headerEl, colId, model);
  };

  function updateBadge(el, col, model) {
    let badge = el.querySelector('.gf-badge');
    if (!model) {
      if (badge) badge.remove();
      return;
    }
    const count = model.conditions ? model.conditions.length : 1;
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'gf-badge';
      el.querySelector('.ag-header-cell-label')?.appendChild(badge);
    }
    badge.textContent = count;
  }

  if (colType === 'number') {
    popup.innerHTML = `
      <div style="padding:8px;display:flex;flex-direction:column;gap:6px">
        <div style="display:flex;gap:4px">
          <button class="btn gf-sort" data-dir="asc" style="flex:1;font-size:var(--font-size-xs)">오름차순 ↑</button>
          <button class="btn gf-sort" data-dir="desc" style="flex:1;font-size:var(--font-size-xs)">내림차순 ↓</button>
        </div>
        <div style="display:flex;gap:4px;align-items:center">
          <input type="text" id="gfMin" placeholder="이상" style="flex:1;height:24px;padding:0 6px;border:1px solid var(--c-border);border-radius:var(--r-sm);font-size:var(--font-size-xs)">
          <span style="color:var(--c-text-muted)">~</span>
          <input type="text" id="gfMax" placeholder="이하" style="flex:1;height:24px;padding:0 6px;border:1px solid var(--c-border);border-radius:var(--r-sm);font-size:var(--font-size-xs)">
        </div>
      </div>
      <div class="gf-footer">
        <button class="btn gf-reset">초기화</button>
        <button class="btn btn-primary gf-apply">적용</button>
      </div>
    `;
    popup.querySelectorAll('.gf-sort').forEach(btn => {
      btn.addEventListener('click', () => {
        api.applyColumnState({ state: [{ colId, sort: btn.dataset.dir }] });
        closePopup();
      });
    });
    popup.querySelector('.gf-apply')?.addEventListener('click', () => {
      const min = popup.querySelector('#gfMin').value.replace(/,/g, '');
      const max = popup.querySelector('#gfMax').value.replace(/,/g, '');
      if (!min && !max) { applyFilter(null); closePopup(); return; }
      const conditions = [];
      if (min) conditions.push({ type: 'greaterThanOrEqual', filter: Number(min) });
      if (max) conditions.push({ type: 'lessThanOrEqual', filter: Number(max) });
      applyFilter(conditions.length === 2 ? { operator: 'AND', conditions } : conditions[0]);
      closePopup();
    });

  } else if (colType === 'select') {
    let currentFilter = ''; try { const m = api.getColumnFilterModel(colId); currentFilter = m?.filter || ''; } catch {}
    const selected = new Set();
    if (currentFilter) selected.add(currentFilter);
    popup.innerHTML = `
      <input class="gf-search" placeholder="검색..." autofocus>
      <div class="gf-list">
        ${sorted.map(([val, cnt]) => {
          const dataVal = val === '(빈값)' ? '' : val;
          const active = selected.has(dataVal) ? ' is-active' : '';
          return `<div class="gf-item${active}" data-val="${dataVal}">${val}<span class="gf-count">${cnt}</span></div>`;
        }).join('')}
      </div>
      <div class="gf-footer">
        <button class="btn gf-reset">초기화</button>
        <button class="btn btn-primary gf-apply">적용</button>
      </div>
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
        item.classList.toggle('is-active');
        if (item.classList.contains('is-active')) selected.add(val);
        else selected.delete(val);
        // 즉시 반영
        applySetFilter(selected);
      });
    });
    const applySetFilter = (set) => {
      if (set.size === 0 || set.size === sorted.length) {
        api.setGridOption('isExternalFilterPresent', () => false);
        api.onFilterChanged();
        updateBadge(headerEl, colId, null);
        return;
      }
      api.setGridOption('isExternalFilterPresent', () => set.size > 0 && set.size < sorted.length);
      api.setGridOption('doesExternalFilterPass', (node) => {
        const v = String(node.data?.[colId] ?? '').trim() || '';
        return set.has(v);
      });
      api.onFilterChanged();
      updateBadge(headerEl, colId, { conditions: [...set] });
    };

    popup.querySelector('.gf-apply')?.addEventListener('click', () => { closePopup(); });

  } else {
    popup.innerHTML = `
      <input class="gf-search" placeholder="검색..." autofocus>
      <div class="gf-footer">
        <button class="btn gf-reset">초기화</button>
        <button class="btn btn-primary gf-apply">적용</button>
      </div>
    `;
    popup.querySelector('.gf-apply')?.addEventListener('click', () => {
      const q = popup.querySelector('.gf-search').value.trim();
      applyFilter(q ? { type: 'contains', filter: q } : null);
      closePopup();
    });
    popup.querySelector('.gf-search').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        popup.querySelector('.gf-apply')?.click();
      }
    });
  }

  // 공통: 초기화
  popup.querySelector('.gf-reset')?.addEventListener('click', () => {
    applyFilter(null);
    api.applyColumnState({ state: [{ colId, sort: null }] });
    api.setGridOption('isExternalFilterPresent', () => false);
    api.onFilterChanged();
    updateBadge(headerEl, colId, null);
    closePopup();
  });

  document.body.appendChild(popup);
  popup.querySelector('.gf-search')?.focus();
}

function closePopup() {
  if (popup) { popup.remove(); popup = null; currentCol = null; }
}
