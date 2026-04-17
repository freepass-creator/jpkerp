/**
 * grid-set-filter.js — AG Grid Community용 커스텀 선택필터
 *
 * 컬럼 값의 고유값을 체크박스 리스트로 보여주고, 빈도 내림차순 정렬.
 * 상단 검색창으로 필터링 가능. 드랍다운형 컬럼(cellEditor: agSelectCellEditor)에 사용.
 *
 * 사용:
 *   colDef: { field: 'status', cellEditor: 'agSelectCellEditor', filter: JpkSetFilter }
 */

export class JpkSetFilter {
  init(params) {
    this.params = params;
    this.selected = null; // null = 전체 선택(필터 비활성), Set = 선택된 값만 통과
    this.search = '';
    this.eGui = document.createElement('div');
    this.eGui.className = 'jpk-set-filter';
    this.eGui.innerHTML = `
      <div class="jpk-set-search">
        <input type="text" placeholder="검색" />
      </div>
      <div class="jpk-set-actions">
        <label><input type="checkbox" class="jpk-set-all" checked /> 전체</label>
        <button type="button" class="jpk-set-reset">초기화</button>
      </div>
      <div class="jpk-set-list"></div>
    `;
    this.eSearch = this.eGui.querySelector('input[type="text"]');
    this.eAll = this.eGui.querySelector('.jpk-set-all');
    this.eReset = this.eGui.querySelector('.jpk-set-reset');
    this.eList = this.eGui.querySelector('.jpk-set-list');

    this.eSearch.addEventListener('input', () => {
      this.search = this.eSearch.value.trim().toLowerCase();
      this.renderList();
    });
    this.eAll.addEventListener('change', () => {
      if (this.eAll.checked) this.selected = null;
      else this.selected = new Set();
      this.renderList();
      this.params.filterChangedCallback();
    });
    this.eReset.addEventListener('click', () => {
      this.selected = null;
      this.eSearch.value = '';
      this.search = '';
      this.eAll.checked = true;
      this.renderList();
      this.params.filterChangedCallback();
    });

    this.computeValues();
    this.renderList();
  }

  computeValues() {
    const counts = new Map();
    const api = this.params.api;
    const field = this.params.colDef.field;
    const valueGetter = this.params.valueGetter;
    api.forEachNode(node => {
      let v;
      if (valueGetter) v = valueGetter({ node, data: node.data });
      else if (field) v = node.data ? node.data[field] : undefined;
      const key = (v === null || v === undefined || v === '') ? '(빈 값)' : String(v);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    this.values = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'ko'));
  }

  renderList() {
    const filtered = this.search
      ? this.values.filter(([v]) => v.toLowerCase().includes(this.search))
      : this.values;
    const sel = this.selected;
    this.eList.innerHTML = filtered.map(([v, n]) => {
      const checked = sel === null || sel.has(v);
      return `<label class="jpk-set-item"><input type="checkbox" data-v="${encodeURIComponent(v)}" ${checked ? 'checked' : ''} /><span class="jpk-set-label">${escapeHtml(v)}</span><span class="jpk-set-count">${n}</span></label>`;
    }).join('');
    this.eList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => this.onToggle(cb));
    });
  }

  onToggle(cb) {
    const v = decodeURIComponent(cb.dataset.v);
    if (this.selected === null) {
      this.selected = new Set(this.values.map(([x]) => x));
    }
    if (cb.checked) this.selected.add(v);
    else this.selected.delete(v);
    this.eAll.checked = this.selected.size === this.values.length;
    this.params.filterChangedCallback();
  }

  isFilterActive() {
    return this.selected !== null && this.selected.size < this.values.length;
  }

  doesFilterPass(params) {
    if (!this.isFilterActive()) return true;
    const field = this.params.colDef.field;
    const valueGetter = this.params.valueGetter;
    let v;
    if (valueGetter) v = valueGetter({ node: params.node, data: params.data });
    else if (field) v = params.data ? params.data[field] : undefined;
    const key = (v === null || v === undefined || v === '') ? '(빈 값)' : String(v);
    return this.selected.has(key);
  }

  getModel() {
    if (!this.isFilterActive()) return null;
    return { values: [...this.selected] };
  }

  setModel(model) {
    if (!model || !Array.isArray(model.values)) {
      this.selected = null;
      this.eAll.checked = true;
    } else {
      this.selected = new Set(model.values);
      this.eAll.checked = this.selected.size === this.values.length;
    }
    this.renderList();
  }

  getGui() { return this.eGui; }

  onNewRowsLoaded() {
    this.computeValues();
    this.renderList();
  }

  destroy() {}
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
