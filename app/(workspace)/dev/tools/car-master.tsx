'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ref, push, set, serverTimestamp, update } from 'firebase/database';
import { getRtdb } from '@/lib/firebase/rtdb';
import { useRtdbCollection } from '@/lib/collections/rtdb';
import { JpkGrid } from '@/components/shared/jpk-grid';
import { typedColumn, rowNumColumn } from '@/lib/grid/typed-column';
import { ToolActions, ToolDetail } from '../tool-actions-context';
import { KOREAN_CAR_MODELS, inferFuel, inferOrigin, inferPowertrain, subWithYear } from '@/lib/data/car-models-seed';
import type { RtdbAsset, RtdbCarModel } from '@/lib/types/rtdb-entities';
import type { ColDef } from 'ag-grid-community';
import { fmt } from '@/lib/utils';
import { CATEGORIES, FUEL_TYPES as FUELS, SEATS_OPTIONS } from '@/lib/data/vehicle-constants';

interface Row extends RtdbCarModel {
  _key: string;
  asset_count: number;
}

type Mode = 'idle' | 'view' | 'edit' | 'new' | 'prep';

interface PrepRow {
  id: string;
  maker: string;
  model: string;
  sub: string;
  fuel_type?: string;
  year_start?: string;
  asset_count: number;          // jpkerp assets 매칭 수
  fp_product_count: number;     // freepass products 매칭 수
  in_fp_master: boolean;         // freepass vehicle_master 존재
  in_jpkerp: boolean;            // jpkerp vehicle_master 존재
  checked: boolean;
}

interface FpProduct extends Record<string, unknown> {
  _key?: string;
  maker?: string;
  model_name?: string;
  sub_model?: string;
  trim_name?: string;
  fuel_type?: string;
  year?: string | number;
  status?: string;
}

const EMPTY_FORM = {
  maker: '', model: '', sub: '', code: '',
  year_start: '', year_end: '현재', category: '', fuel_type: '',
  origin: '' as '' | '국산' | '수입',
  powertrain: '' as '' | '내연' | '하이브리드' | '전기' | '수소',
  seats: '',
  displacement: '',
  battery_kwh: '',
};

const COLLECTION = 'vehicle_master';

export function CarMasterTool() {
  // jpkerp 자체 DB의 vehicle_master가 소스. freepass 연동은 추후 Cloud Function sync.
  const models = useRtdbCollection<RtdbCarModel>(COLLECTION);
  const assets = useRtdbCollection<RtdbAsset>('assets');
  const fpModels = useRtdbCollection<RtdbCarModel>('vehicle_master', { app: 'freepass' });
  const fpProducts = useRtdbCollection<FpProduct>('products', { app: 'freepass' });
  const [prepRows, setPrepRows] = useState<PrepRow[]>([]);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('idle');
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const rows = useMemo<Row[]>(() => {
    const countByKey = new Map<string, number>();
    for (const a of assets.data) {
      if (a.status === 'deleted') continue;
      const k = [a.manufacturer, a.car_model, a.detail_model].filter(Boolean).join('|');
      countByKey.set(k, (countByKey.get(k) ?? 0) + 1);
    }
    return models.data
      .filter((m) => m.status !== 'deleted')
      // 15년 초과 단종 (archived) 기본 숨김 — 토글로만 노출
      .filter((m) => showArchived || !m.archived)
      .map((m) => ({
        ...(m as RtdbCarModel & { _key: string }),
        asset_count: countByKey.get([m.maker, m.model, m.sub].filter(Boolean).join('|')) ?? 0,
      }))
      .sort((a, b) => b.asset_count - a.asset_count);
  }, [models.data, assets.data, showArchived]);

  const archivedCount = useMemo(
    () => models.data.filter((m) => m.status !== 'deleted' && m.archived).length,
    [models.data],
  );

  const selected = useMemo(() => rows.find((r) => r._key === selectedKey) ?? null, [rows, selectedKey]);

  const formFromRow = (r: Row) => ({
    maker: r.maker ?? '',
    model: r.model ?? '',
    sub: r.sub ?? '',
    code: r.code ?? '',
    year_start: String(r.year_start ?? ''),
    year_end: String(r.year_end ?? '현재'),
    category: r.category ?? '',
    fuel_type: r.fuel_type ?? '',
    origin: (r.origin ?? '') as '' | '국산' | '수입',
    powertrain: (r.powertrain ?? '') as '' | '내연' | '하이브리드' | '전기' | '수소',
    seats: r.seats ? String(r.seats) : '',
    displacement: r.displacement ? String(r.displacement) : '',
    battery_kwh: r.battery_kwh ? String(r.battery_kwh) : '',
  });

  const selectRow = (r: Row) => {
    setSelectedKey(r._key);
    setForm(formFromRow(r));
    setMode('view');
  };

  const startNew = () => {
    setSelectedKey(null);
    setForm(EMPTY_FORM);
    setMode('new');
  };

  const cancel = () => {
    if (mode === 'new') {
      setMode('idle');
      setForm(EMPTY_FORM);
    } else if (mode === 'edit' && selected) {
      setForm(formFromRow(selected));
      setMode('view');
    }
  };

  const startEdit = () => { if (selected) setMode('edit'); };

  const save = async () => {
    if (!form.maker || !form.model || !form.sub) {
      toast.error('제조사·모델명·세부모델 필수');
      return;
    }
    setBusy(true);
    try {
      const raw: Record<string, unknown> = {
        maker: form.maker,
        model: form.model,
        sub: form.sub,
        year_start: form.year_start || undefined,
        year_end: form.year_end || '현재',
        category: form.category || undefined,
        fuel_type: form.fuel_type || undefined,
        code: form.code || undefined,
        origin: form.origin || inferOrigin(form.maker),
        powertrain: form.powertrain || (form.category ? inferPowertrain(form.category) : undefined),
        seats: form.seats ? Number(form.seats) : undefined,
        displacement: form.displacement ? Number(form.displacement) : undefined,
        battery_kwh: form.battery_kwh ? Number(form.battery_kwh) : undefined,
        status: 'active',
        updated_at: serverTimestamp(),
      };
      // undefined/빈 값 제거 — Firebase reject 방지
      const payload = Object.fromEntries(
        Object.entries(raw).filter(([, v]) => v !== undefined && v !== ''),
      );
      if (mode === 'edit' && selectedKey) {
        await update(ref(getRtdb(), `${COLLECTION}/${selectedKey}`), payload);
        toast.success(`${form.maker} ${form.sub} 수정`);
        setMode('view');
      } else {
        const exists = models.data.some(
          (m) => m.status !== 'deleted' && m.maker === form.maker && m.model === form.model && m.sub === form.sub,
        );
        if (exists) { toast.error('이미 등록된 세부모델'); setBusy(false); return; }
        const r = push(ref(getRtdb(), COLLECTION));
        await set(r, { ...payload, created_at: Date.now() });
        toast.success(`${form.maker} ${form.sub} 추가`);
        setSelectedKey(r.key);
        setMode('view');
      }
    } catch (err) {
      toast.error(`저장 실패: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  /** 기존 vehicle_master 레코드의 분류/구분/동력 일괄 보완 */
  const enrichExisting = async () => {
    const seedByKey = new Map<string, typeof KOREAN_CAR_MODELS[number]>();
    for (const s of KOREAN_CAR_MODELS) {
      seedByKey.set(`${s.maker}|${s.model}|${s.sub}`, s);
    }
    // 시드 sanity 체크
    const sampleNiro = seedByKey.get('기아|니로|니로 SG2');
    console.log('[carmaster] SEED CHECK · 총:', KOREAN_CAR_MODELS.length, '· 니로샘플:', sampleNiro);
    if (!sampleNiro?.displacement) {
      alert(`시드 데이터에 스펙이 없음 (displacement=${sampleNiro?.displacement}).\n페이지 하드 새로고침(Ctrl+Shift+R) 필요.`);
      return;
    }

    const allActive = models.data.filter((m) => m.status !== 'deleted');
    console.log('[carmaster] enrich start · 총 활성:', allActive.length, '· 시드:', KOREAN_CAR_MODELS.length);

    // 어느 필드라도 비어 있으면 보완 대상
    const targets = allActive.filter((m) => {
      const isEv = (m.powertrain === '전기') || /EV|전기/i.test(m.category ?? '');
      return !m.category || !m.origin || !m.powertrain || !m.displacement || !m.seats
        || !m.code || !m.year_start
        || (isEv && !m.battery_kwh)
        || (!isEv && m.fuel_type === undefined);
    });
    console.log('[carmaster] 보완 대상:', targets.length, '/ 전체 활성:', allActive.length);

    if (targets.length === 0) {
      toast.info(`모든 ${allActive.length}개 레코드 스펙 완성 상태`);
      return;
    }

    const matchedBySeed = targets.filter((m) => seedByKey.has(`${m.maker}|${m.model}|${m.sub}`)).length;
    const unmatched = targets.length - matchedBySeed;
    console.log('[carmaster] 시드 매칭:', matchedBySeed, '· 매칭 실패:', unmatched);

    if (!confirm(`${targets.length}개 레코드 보완 대상:\n· 한국 시드 매칭 ${matchedBySeed}개 (스펙 전부 채움)\n· 매칭 실패 ${unmatched}개 (제조사로 구분만 추정)\n\n진행?`)) {
      console.log('[carmaster] 사용자 취소');
      return;
    }

    setBusy(true);
    let ok = 0; let fail = 0;
    const errors: string[] = [];
    try {
      let traceLogged = 0;
      for (const m of targets) {
        try {
          const key = [m.maker, m.model, m.sub].filter(Boolean).join('|');
          const seed = seedByKey.get(key);
          const patch: Record<string, unknown> = { updated_at: serverTimestamp() };
          // trace용 패치 생성 후 로그 찍기 (아래 블록 끝나고)
          if (seed) {
            if (!m.category && seed.category) patch.category = seed.category;
            if (!m.code && seed.code) patch.code = seed.code;
            if (!m.year_start && seed.year_start) patch.year_start = seed.year_start;
            if (!m.year_end && seed.year_end) patch.year_end = seed.year_end;
            if (!m.origin) patch.origin = inferOrigin(seed.maker);
            if (!m.powertrain) patch.powertrain = inferPowertrain(seed.category);
            if (!m.fuel_type && (seed.fuel_type || inferFuel(seed.category))) patch.fuel_type = seed.fuel_type ?? inferFuel(seed.category);
            if (!m.displacement && seed.displacement) patch.displacement = seed.displacement;
            if (!m.seats && seed.seats) patch.seats = seed.seats;
            if (!m.battery_kwh && seed.battery_kwh) patch.battery_kwh = seed.battery_kwh;
          } else {
            if (!m.origin && m.maker) patch.origin = inferOrigin(m.maker);
            if (!m.powertrain && m.category) patch.powertrain = inferPowertrain(m.category);
            if (!m.fuel_type && m.category) {
              const f = inferFuel(m.category);
              if (f) patch.fuel_type = f;
            }
          }
          if (traceLogged < 3) {
            console.log('[carmaster] TRACE', {
              key,
              seed_found: !!seed,
              m_snapshot: { cat: m.category, disp: m.displacement, seats: m.seats, origin: m.origin, fuel: m.fuel_type, power: m.powertrain, code: m.code, ys: m.year_start, ye: m.year_end, bat: m.battery_kwh },
              seed_snapshot: seed ? { disp: seed.displacement, seats: seed.seats, bat: seed.battery_kwh, cat: seed.category } : null,
              patch_keys: Object.keys(patch),
              patch: { ...patch, updated_at: '__ts__' },
            });
            traceLogged++;
          }
          if (Object.keys(patch).length > 1) {
            await update(ref(getRtdb(), `${COLLECTION}/${m._key}`), patch);
            ok++;
          } else {
            console.log('[carmaster] skip (no patch):', m.maker, m.model, m.sub, 'category=', m.category);
          }
        } catch (err) {
          fail++;
          if (errors.length < 3) errors.push((err as Error).message);
          console.error('[carmaster] update 실패:', m.maker, m.sub, err);
        }
      }
      console.log('[carmaster] enrich 결과:', { ok, fail, targets: targets.length });
      if (ok === 0 && fail === 0) {
        toast.info(`매칭/추정 가능한 패치 없음 (${targets.length}개 대상)`);
      } else if (fail === 0) {
        toast.success(`${ok}건 보완 완료`);
      } else {
        console.warn('[carmaster] enrich 실패:', errors);
        toast.error(`${ok}건 성공 / ${fail}건 실패`);
      }
    } finally {
      setBusy(false);
    }
  };

  /** vehicle_master 전체 soft-delete (개발용) */
  const deleteAll = async () => {
    const active = models.data.filter((m) => m.status !== 'deleted');
    if (active.length === 0) { toast.info('삭제할 레코드 없음'); return; }
    if (!confirm(`⚠ vehicle_master ${active.length}건 전체 삭제 (soft-delete).\n복구 가능하지만 목록/드랍다운에서 사라짐.\n\n진행?`)) return;
    if (!confirm(`마지막 확인: ${active.length}건 전체 삭제`)) return;
    setBusy(true);
    try {
      const updates: Record<string, unknown> = {};
      for (const m of active) {
        if (!m._key) continue;
        updates[`${COLLECTION}/${m._key}/status`] = 'deleted';
        updates[`${COLLECTION}/${m._key}/deleted_at`] = Date.now();
      }
      await update(ref(getRtdb()), updates);
      toast.success(`${active.length}건 삭제 완료`);
      setSelectedKey(null);
      setMode('idle');
    } catch (err) {
      toast.error(`삭제 실패: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const seedKorean = async () => {
    const existing = new Set(
      models.data
        .filter((m) => m.status !== 'deleted')
        .map((m) => [m.maker, m.model, m.sub].filter(Boolean).join('|')),
    );
    // 저장될 sub = "니로 SG2" + year_start(22-) → "니로 SG2 22-"
    const toAdd = KOREAN_CAR_MODELS.filter((s) => {
      const finalSub = subWithYear(s.sub, s.year_start);
      return !existing.has(`${s.maker}|${s.model}|${finalSub}`);
    });
    if (toAdd.length === 0) {
      toast.info(`차종 ${KOREAN_CAR_MODELS.length}종 모두 이미 등록됨`);
      return;
    }
    if (!confirm(`차종 ${toAdd.length}종 등록 (이미 ${KOREAN_CAR_MODELS.length - toAdd.length}종 존재). 진행?`)) return;
    setBusy(true);
    const errors: string[] = [];
    try {
      let ok = 0; let fail = 0;
      for (const s of toAdd) {
        try {
          const raw: Record<string, unknown> = {
            maker: s.maker,
            model: s.model,
            sub: subWithYear(s.sub, s.year_start),
            code: s.code,
            year_start: s.year_start,
            year_end: s.year_end,
            category: s.category,
            origin: inferOrigin(s.maker),
            powertrain: inferPowertrain(s.category),
            fuel_type: s.fuel_type ?? inferFuel(s.category),
            displacement: s.displacement,
            seats: s.seats,
            battery_kwh: s.battery_kwh,
            status: 'active',
            created_at: Date.now(),
            updated_at: serverTimestamp(),
            seeded_from: 'korean_seed',
          };
          const payload = Object.fromEntries(
            Object.entries(raw).filter(([, v]) => v !== undefined && v !== ''),
          );
          const dbRef = push(ref(getRtdb(), COLLECTION));
          await set(dbRef, payload);
          ok++;
        } catch (err) {
          fail++;
          if (errors.length < 3) errors.push(`${s.maker} ${s.sub}: ${(err as Error).message}`);
        }
      }
      if (fail === 0) toast.success(`${ok}종 시드 완료`);
      else {
        console.warn('[carmaster] seed 실패:', errors);
        toast.error(`${ok}종 성공 / ${fail}종 실패. 콘솔 확인`);
      }
    } catch (err) {
      toast.error(`시드 실패: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const startPrep = () => {
    const merged = new Map<string, PrepRow>();

    const getOrCreate = (maker: string, model: string, sub: string): PrepRow => {
      const id = [maker, model, sub].filter(Boolean).join('|') || 'unknown';
      let cur = merged.get(id);
      if (!cur) {
        cur = {
          id,
          maker: maker || '미지정',
          model: model || '—',
          sub: sub || model || '—',
          asset_count: 0,
          fp_product_count: 0,
          in_fp_master: false,
          in_jpkerp: false,
          checked: true,
        };
        merged.set(id, cur);
      }
      return cur;
    };

    // 1) jpkerp assets → 고유 조합
    for (const a of assets.data) {
      if (a.status === 'deleted') continue;
      const maker = (a.manufacturer ?? '').trim();
      const model = (a.car_model ?? '').trim();
      const sub = (a.detail_model ?? '').trim();
      if (!maker && !model && !sub) continue;
      const row = getOrCreate(maker, model, sub);
      row.asset_count++;
      if (!row.fuel_type && a.fuel_type) row.fuel_type = a.fuel_type;
      if (!row.year_start && a.car_year) row.year_start = String(a.car_year);
    }

    // 2) freepass products → 실운영 차량 (공개 읽기)
    for (const p of fpProducts.data) {
      if ((p.status as string) === 'deleted') continue;
      const maker = (p.maker ?? '').trim();
      const model = (p.model_name ?? '').trim();
      const sub = (p.sub_model ?? '').trim();
      if (!maker && !model && !sub) continue;
      const row = getOrCreate(maker, model, sub);
      row.fp_product_count++;
      if (!row.fuel_type && p.fuel_type) row.fuel_type = p.fuel_type;
      if (!row.year_start && p.year) row.year_start = String(p.year);
    }

    // 3) freepass vehicle_master → 공식 마스터 (auth 필요, 읽기 가능 시)
    for (const m of fpModels.data) {
      if (m.status === 'deleted') continue;
      const maker = (m.maker ?? '').trim();
      const model = (m.model ?? '').trim();
      const sub = (m.sub ?? '').trim();
      if (!maker && !model && !sub) continue;
      const row = getOrCreate(maker, model, sub);
      row.in_fp_master = true;
      if (!row.fuel_type && m.fuel_type) row.fuel_type = m.fuel_type;
      if (!row.year_start && m.year_start) row.year_start = String(m.year_start);
    }

    // 4) 이미 jpkerp vehicle_master에 있는 것
    for (const m of models.data) {
      if (m.status === 'deleted') continue;
      const id = [m.maker, m.model, m.sub].filter(Boolean).join('|');
      const cur = merged.get(id);
      if (cur) {
        cur.in_jpkerp = true;
        cur.checked = false;
      }
    }

    const rows = Array.from(merged.values()).sort((a, b) => {
      if (a.in_jpkerp !== b.in_jpkerp) return a.in_jpkerp ? 1 : -1;
      const totalA = a.asset_count + a.fp_product_count;
      const totalB = b.asset_count + b.fp_product_count;
      return totalB - totalA;
    });
    setPrepRows(rows);
    setMode('prep');
  };

  const commitPrep = async () => {
    const toAdd = prepRows.filter((r) => r.checked && !r.in_jpkerp);
    if (toAdd.length === 0) { toast.info('등록 대상 없음'); return; }
    if (!confirm(`${toAdd.length}종 jpkerp vehicle_master에 등록?`)) return;
    setBusy(true);
    const errors: string[] = [];
    try {
      let ok = 0; let fail = 0;
      for (const r of toAdd) {
        try {
          const raw: Record<string, unknown> = {
            maker: r.maker,
            model: r.model,
            sub: r.sub,
            fuel_type: r.fuel_type,
            year_start: r.year_start,
            year_end: '현재',
            status: 'active',
            created_at: Date.now(),
            updated_at: serverTimestamp(),
            seeded_from: [
              r.asset_count > 0 ? 'assets' : null,
              r.fp_product_count > 0 ? 'fp_products' : null,
              r.in_fp_master ? 'fp_master' : null,
            ].filter(Boolean).join('+') || 'manual',
          };
          // undefined / 빈 문자열 제거 — Firebase set() reject 방지
          const payload = Object.fromEntries(
            Object.entries(raw).filter(([, v]) => v !== undefined && v !== ''),
          );
          const dbRef = push(ref(getRtdb(), COLLECTION));
          await set(dbRef, payload);
          ok++;
        } catch (err) {
          fail++;
          if (errors.length < 3) errors.push(`${r.maker} ${r.sub}: ${(err as Error).message}`);
        }
      }
      if (fail === 0) {
        toast.success(`${ok}종 등록 완료`);
      } else {
        console.warn('[carmaster] 실패 사례:', errors);
        toast.error(`${ok}종 성공 / ${fail}종 실패. 콘솔(F12) 확인`);
      }
      setMode('idle');
      setPrepRows([]);
    } catch (err) {
      toast.error(`등록 실패: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const seedFromAssets = async () => {
    const uniques = new Map<string, { maker: string; model: string; sub: string; fuel_type?: string; year_start?: string; count: number }>();
    for (const a of assets.data) {
      if (a.status === 'deleted') continue;
      const maker = (a.manufacturer ?? '').trim();
      const model = (a.car_model ?? '').trim();
      const sub = (a.detail_model ?? '').trim();
      if (!maker && !model && !sub) continue;
      const k = [maker, model, sub].filter(Boolean).join('|');
      const cur = uniques.get(k);
      if (cur) { cur.count++; continue; }
      uniques.set(k, {
        maker: maker || '미지정',
        model: model || '—',
        sub: sub || model || '—',
        fuel_type: a.fuel_type,
        year_start: a.car_year ? String(a.car_year) : undefined,
        count: 1,
      });
    }
    const items = Array.from(uniques.values()).sort((a, b) => b.count - a.count);
    if (items.length === 0) { toast.info('자산에 유효한 차종 조합 없음'); return; }
    const preview = items.slice(0, 5).map((x) => `• ${x.maker} ${x.model} ${x.sub} (${x.count}대)`).join('\n');
    if (!confirm(`자산 ${assets.data.length}대에서 ${items.length}종 추출.\n\n상위 5종:\n${preview}\n\n초기 시드로 등록?`)) return;
    setBusy(true);
    try {
      let ok = 0; let fail = 0;
      for (const it of items) {
        try {
          const r = push(ref(getRtdb(), COLLECTION));
          await set(r, {
            maker: it.maker,
            model: it.model,
            sub: it.sub,
            fuel_type: it.fuel_type,
            year_start: it.year_start,
            year_end: '현재',
            status: 'active',
            created_at: Date.now(),
            updated_at: serverTimestamp(),
            seeded_from: 'assets_initial',
          });
          ok++;
        } catch { fail++; }
      }
      toast.success(`${ok}종 시드 완료${fail > 0 ? ` (실패 ${fail})` : ''}`);
    } catch (err) {
      toast.error(`시드 실패: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!selected) return;
    if (selected.asset_count > 0) {
      if (!confirm(`⚠ 이 차종으로 등록된 차량 ${selected.asset_count}대 있음. 마스터만 삭제하고 차량은 유지됩니다. 진행?`)) return;
    } else {
      if (!confirm(`${selected.maker} ${selected.sub} 삭제?`)) return;
    }
    setBusy(true);
    try {
      await update(ref(getRtdb(), `${COLLECTION}/${selected._key}`), {
        status: 'deleted',
        deleted_at: serverTimestamp(),
      });
      toast.success('삭제 완료');
      setSelectedKey(null);
      setMode('idle');
      setForm(EMPTY_FORM);
    } catch (err) {
      toast.error(`삭제 실패: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const cols = useMemo<ColDef<Row>[]>(() => [
    rowNumColumn<Row>(),
    typedColumn('select', { headerName: '제조사', field: 'maker', width: 90, cellStyle: { fontWeight: '600' } }),
    typedColumn('text',   { headerName: '모델', field: 'model', width: 110 }),
    typedColumn('text',   { headerName: '세부모델', field: 'sub', flex: 1, minWidth: 200 }),
    typedColumn('select', {
      headerName: '제조국', field: 'origin', width: 70,
      cellStyle: (p: { value: unknown }) => {
        if (p.value === '수입') return { color: 'var(--c-primary)', fontWeight: '600' } as const;
        return { color: p.value === '국산' ? 'var(--c-text-sub)' : 'var(--c-text-muted)', fontWeight: '400' } as const;
      },
    }),
    typedColumn('select', { headerName: '차종구분', field: 'category', width: 110 }),
    typedColumn('text', {
      headerName: '생산시작', field: 'production_start', width: 90,
      cellStyle: { color: 'var(--c-text-sub)' },
    }),
    typedColumn('text', {
      headerName: '생산종료', field: 'production_end', width: 90,
      cellStyle: (p: { value: unknown }) => p.value === '현재'
        ? { color: 'var(--c-success)', fontWeight: '600' }
        : { color: 'var(--c-text-sub)' },
    }),
    typedColumn('number', {
      headerName: '보유', field: 'asset_count', width: 70,
      valueFormatter: (p) => fmt(Number(p.value)),
      cellStyle: (p: { value: unknown }) => {
        const v = Number(p.value);
        return v > 0 ? { color: 'var(--c-primary)', fontWeight: '600' } : { color: 'var(--c-text-muted)', fontWeight: '400' };
      },
    }),
  ], []);

  const loading = models.loading || assets.loading;
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 text-text-muted" style={{ height: '100%', minHeight: 200 }}>
        <i className="ph ph-spinner spin" /> 로드 중...
      </div>
    );
  }

  const editable = mode === 'edit' || mode === 'new';

  return (
    <>
      <ToolActions>
        {mode === 'view' && selected && (
          <>
            <button type="button" className="btn btn-sm btn-outline" onClick={startEdit}>
              <i className="ph ph-pencil" />수정
            </button>
            <button type="button" className="btn btn-sm btn-outline text-danger" onClick={remove} disabled={busy}>
              <i className={`ph ${busy ? 'ph-spinner spin' : 'ph-trash'}`} />삭제
            </button>
          </>
        )}
        {editable && (
          <>
            <button type="button" className="btn btn-sm btn-ghost" onClick={cancel}>
              <i className="ph ph-x" />취소
            </button>
            <button type="button" className="btn btn-sm btn-primary" onClick={save} disabled={busy}>
              <i className={`ph ${busy ? 'ph-spinner spin' : 'ph-check'}`} />
              {mode === 'edit' ? '수정 저장' : '등록'}
            </button>
          </>
        )}
        {mode === 'idle' && (
          <>
            <button
              type="button"
              className={`btn btn-sm ${showArchived ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setShowArchived((v) => !v)}
              title="15년 초과 단종 모델 포함/제외 (자산 보유시엔 무조건 노출)"
            >
              <i className={`ph ${showArchived ? 'ph-eye' : 'ph-eye-slash'}`} />
              {showArchived ? '전체 보기' : `단종 숨김 (${archivedCount})`}
            </button>
            <button type="button" className="btn btn-sm btn-outline text-danger" onClick={deleteAll} disabled={busy} title="vehicle_master 전체 soft-delete (개발용)">
              <i className={`ph ${busy ? 'ph-spinner spin' : 'ph-trash'}`} />전체 삭제
            </button>
            <button type="button" className="btn btn-sm btn-outline" onClick={seedKorean} disabled={busy} title={`차종 시드 ${KOREAN_CAR_MODELS.length}종 일괄 등록 (국산+수입 스펙 포함)`}>
              <i className={`ph ${busy ? 'ph-spinner spin' : 'ph-flag'}`} />차종 시드
            </button>
            <button type="button" className="btn btn-sm btn-outline" onClick={enrichExisting} disabled={busy} title="기존 레코드의 빈 스펙을 시드 데이터로 보완">
              <i className={`ph ${busy ? 'ph-spinner spin' : 'ph-wrench'}`} />기존 보완
            </button>
            <button type="button" className="btn btn-sm btn-outline" onClick={startPrep}>
              <i className="ph ph-table" />데이터 준비
            </button>
            <button type="button" className="btn btn-sm btn-primary" onClick={startNew}>
              <i className="ph ph-plus" />차종 추가
            </button>
          </>
        )}
        {mode === 'view' && (
          <button type="button" className="btn btn-sm btn-primary" onClick={startNew}>
            <i className="ph ph-plus" />차종 추가
          </button>
        )}
        {mode === 'prep' && (
          <>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setMode('idle'); setPrepRows([]); }}>
              <i className="ph ph-x" />취소
            </button>
            <button type="button" className="btn btn-sm btn-primary" onClick={commitPrep} disabled={busy}>
              <i className={`ph ${busy ? 'ph-spinner spin' : 'ph-check'}`} />
              선택 {prepRows.filter((r) => r.checked && !r.in_jpkerp).length}건 등록
            </button>
          </>
        )}
      </ToolActions>

      {mode === 'prep' ? (
        <PrepTable rows={prepRows} setRows={setPrepRows} fpMasterError={fpModels.error} fpProductsCount={fpProducts.data.length} />
      ) : (
        <div className="flex flex-col" style={{ height: '100%' }}>
          <div className="text-base" style={{ padding: '8px 14px', borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="ph ph-car" />
            <b>{fmt(rows.length)}</b>
            <span className="text-text-muted">종</span>
            <span className="text-text-muted text-2xs" style={{ fontFamily: 'monospace' }}>· vehicle_master</span>
            {rows.length === 0 && !models.loading && (
              <span className="text-text-muted text-xs" style={{ marginLeft: 'auto' }}>
                "데이터 준비" 또는 "+ 차종 추가"로 시작
              </span>
            )}
          </div>
          <div className="flex-1 min-h-0">
            <JpkGrid<Row>
              columnDefs={cols}
              rowData={rows}
              getRowId={(d) => d._key}
              storageKey="jpk.grid.dev.carmaster"
              onRowClicked={selectRow}
            />
          </div>
        </div>
      )}

      <ToolDetail active={mode !== 'idle' && mode !== 'prep'}>
        {mode === 'view' && selected && (
          <div style={{ padding: 16, overflow: 'auto', flex: 1 }}>
            <div className="text-[18px]" style={{ fontWeight: 700, marginBottom: 4 }}>
              {selected.maker} <span className="text-text-sub" style={{ fontWeight: 500 }}>{selected.model}</span>
            </div>
            <div className="text-xl text-text-sub" style={{ marginBottom: 14 }}>
              {selected.sub}
            </div>
            <dl className="text-base" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', margin: 0 }}>
              <KV k="구분" v={<b style={{ color: selected.origin === '수입' ? 'var(--c-primary)' : 'var(--c-text)' }}>{selected.origin ?? '—'}</b>} />
              <KV k="동력" v={<b style={{ color: selected.powertrain === '전기' ? 'var(--c-success)' : selected.powertrain === '수소' ? 'var(--c-primary)' : selected.powertrain === '하이브리드' ? 'var(--c-warn)' : 'var(--c-text)' }}>{selected.powertrain ?? '—'}</b>} />
              <KV k="코드" v={selected.code} />
              <KV k="연식" v={`${selected.year_start ?? '?'} ~ ${selected.year_end ?? '현재'}`} />
              <KV k="분류" v={selected.category} />
              <KV k="연료" v={selected.fuel_type} />
              <KV k="승차정원" v={selected.seats ? `${selected.seats}인승` : undefined} />
              <KV k="배기량" v={selected.displacement ? `${selected.displacement.toLocaleString()}cc` : undefined} />
              {(selected.powertrain === '전기' || selected.battery_kwh) && (
                <KV k="배터리" v={selected.battery_kwh ? `${selected.battery_kwh} kWh` : undefined} />
              )}
              <KV k="보유 차량" v={<b style={{ color: selected.asset_count > 0 ? 'var(--c-primary)' : 'var(--c-text-muted)' }}>{selected.asset_count}대</b>} />
            </dl>
          </div>
        )}

        {editable && (
          <div style={{ padding: 16, overflow: 'auto', flex: 1 }}>
            <div className="text-xl" style={{ fontWeight: 600, marginBottom: 14 }}>
              <i className={`ph ${mode === 'edit' ? 'ph-pencil' : 'ph-plus-circle'}`} style={{ marginRight: 4 }} />
              {mode === 'edit' ? '차종 수정' : '새 차종 추가'}
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <FieldRow label="제조사 *">
                <input type="text" className="ctrl" value={form.maker} onChange={(e) => setForm({ ...form, maker: e.target.value })} placeholder="현대" autoFocus />
              </FieldRow>
              <FieldRow label="모델명 *">
                <input type="text" className="ctrl" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="아반떼" />
              </FieldRow>
              <FieldRow label="세부모델 *">
                <input type="text" className="ctrl" value={form.sub} onChange={(e) => setForm({ ...form, sub: e.target.value })} placeholder="CN7 스마트 1.6 GDI" />
              </FieldRow>

              <details style={{ marginTop: 4 }}>
                <summary className="text-xs text-text-muted" style={{ cursor: 'pointer', padding: '4px 0' }}>
                  추가 정보 (선택)
                </summary>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginTop: 8 }}>
                  <FieldRow label="구분">
                    <select className="ctrl" value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value as '' | '국산' | '수입' })}>
                      <option value="">자동 (제조사 기반)</option>
                      <option value="국산">국산</option>
                      <option value="수입">수입</option>
                    </select>
                  </FieldRow>
                  <FieldRow label="동력">
                    <select className="ctrl" value={form.powertrain} onChange={(e) => setForm({ ...form, powertrain: e.target.value as '' | '내연' | '하이브리드' | '전기' | '수소' })}>
                      <option value="">자동 (분류 기반)</option>
                      <option value="내연">내연</option>
                      <option value="하이브리드">하이브리드</option>
                      <option value="전기">전기</option>
                      <option value="수소">수소</option>
                    </select>
                  </FieldRow>
                  <FieldRow label="코드">
                    <input type="text" className="ctrl" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="CN7" />
                  </FieldRow>
                  <FieldRow label="시작년">
                    <input type="text" inputMode="numeric" className="ctrl" value={form.year_start} onChange={(e) => setForm({ ...form, year_start: e.target.value })} placeholder="2021" />
                  </FieldRow>
                  <FieldRow label="종료년">
                    <input type="text" className="ctrl" value={form.year_end} onChange={(e) => setForm({ ...form, year_end: e.target.value })} placeholder="현재" />
                  </FieldRow>
                  <FieldRow label="분류">
                    <select className="ctrl" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                      <option value="">선택</option>
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </FieldRow>
                  <FieldRow label="연료" span={2}>
                    <select className="ctrl" value={form.fuel_type} onChange={(e) => setForm({ ...form, fuel_type: e.target.value })}>
                      <option value="">선택</option>
                      {FUELS.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </FieldRow>
                </div>
              </details>

              <details open style={{ marginTop: 4 }}>
                <summary className="text-xs text-text-muted" style={{ cursor: 'pointer', padding: '4px 0' }}>
                  스펙 (자산 등록 시 드랍다운으로 사용)
                </summary>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginTop: 8 }}>
                  <FieldRow label="승차정원">
                    <select className="ctrl" value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })}>
                      <option value="">선택</option>
                      {SEATS_OPTIONS.map((s) => <option key={s} value={s}>{s}인승</option>)}
                    </select>
                  </FieldRow>
                  <FieldRow label="배기량 (cc)">
                    <input type="text" inputMode="numeric" className="ctrl" value={form.displacement} onChange={(e) => setForm({ ...form, displacement: e.target.value.replace(/[^\d]/g, '') })} placeholder="1598" />
                  </FieldRow>
                  {(form.powertrain === '전기' || form.powertrain === '하이브리드' || /EV|전기/i.test(form.category)) && (
                    <FieldRow label="배터리 용량 (kWh)">
                      <input type="text" inputMode="decimal" className="ctrl" value={form.battery_kwh} onChange={(e) => setForm({ ...form, battery_kwh: e.target.value.replace(/[^\d.]/g, '') })} placeholder="77.4" />
                    </FieldRow>
                  )}
                </div>
              </details>
            </div>
          </div>
        )}
      </ToolDetail>
    </>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <>
      <dt className="text-text-muted" style={{ whiteSpace: 'nowrap' }}>{k}</dt>
      <dd className="text-text" style={{ margin: 0 }}>{v || '—'}</dd>
    </>
  );
}

function PrepTable({
  rows,
  setRows,
  fpMasterError,
  fpProductsCount,
}: {
  rows: PrepRow[];
  setRows: (rows: PrepRow[]) => void;
  fpMasterError: Error | null;
  fpProductsCount: number;
}) {
  const toAdd = rows.filter((r) => r.checked && !r.in_jpkerp).length;
  const pending = rows.filter((r) => !r.in_jpkerp);
  const jCount = pending.filter((r) => r.asset_count > 0).length;
  const fCount = pending.filter((r) => r.fp_product_count > 0 || r.in_fp_master).length;
  const bothCount = pending.filter((r) => r.asset_count > 0 && (r.fp_product_count > 0 || r.in_fp_master)).length;
  const alreadyIn = rows.filter((r) => r.in_jpkerp).length;

  const toggleAll = (checked: boolean) => {
    setRows(rows.map((r) => ({ ...r, checked: r.in_jpkerp ? false : checked })));
  };
  const toggleOne = (id: string) => {
    setRows(rows.map((r) => r.id === id ? { ...r, checked: !r.checked } : r));
  };
  const updateField = (id: string, field: 'maker' | 'model' | 'sub', value: string) => {
    setRows(rows.map((r) => r.id === id ? { ...r, [field]: value } : r));
  };

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <div className="text-base" style={{ padding: '8px 14px', borderBottom: '1px solid var(--c-border)', background: 'var(--c-bg-sub)', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <i className="ph ph-table" />
        <b>{rows.length}</b>
        <span className="text-text-muted">종 대조 ·</span>
        <span title="jpkerp 자산에 존재"><b className="text-warn">J</b> {jCount}</span>
        <span className="text-text-muted">·</span>
        <span title="freepass(상품+마스터)에 존재"><b className="text-primary">F</b> {fCount}</span>
        <span className="text-text-muted">·</span>
        <span title="양쪽 모두"><b className="text-success">JF</b> {bothCount}</span>
        <span className="text-text-muted">·</span>
        <span className="text-text-muted">이미등록 {alreadyIn}</span>
        <span className="text-xs text-primary" style={{ marginLeft: 'auto', fontWeight: 600 }}>
          등록 대상: {toAdd}건
        </span>
        {fpMasterError && (
          <span className="text-warn text-xs" style={{ width: '100%' }}>
            <i className="ph ph-warning" /> freepass vehicle_master 읽기 실패 ({fpMasterError.message}) · /products는 읽기 OK (총 {fpProductsCount}건 참조)
          </span>
        )}
      </div>

      <div className="text-xs" style={{ padding: '6px 14px', borderBottom: '1px solid var(--c-border)', display: 'flex', gap: 10 }}>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => toggleAll(true)} style={{ padding: '0 8px' }}>
          전체 선택
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => toggleAll(false)} style={{ padding: '0 8px' }}>
          전체 해제
        </button>
      </div>

      <div className="flex-1 min-h-0" style={{ overflow: 'auto' }}>
        <table className="text-base" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--c-surface)', borderBottom: '1px solid var(--c-border)' }}>
            <tr>
              <th style={{ width: 32, padding: 6, textAlign: 'center' }}></th>
              <th className="text-text-muted" style={{ width: 140, padding: 6, textAlign: 'left', fontWeight: 500 }}>출처</th>
              <th style={{ padding: 6, textAlign: 'left', fontWeight: 500 }}>제조사</th>
              <th style={{ padding: 6, textAlign: 'left', fontWeight: 500 }}>모델</th>
              <th style={{ padding: 6, textAlign: 'left', fontWeight: 500 }}>세부모델</th>
              <th style={{ width: 50, padding: 6, textAlign: 'right', fontWeight: 500 }} title="jpkerp 자산 수">자산</th>
              <th style={{ width: 50, padding: 6, textAlign: 'right', fontWeight: 500 }} title="freepass 상품 수">fp상품</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--c-border)', opacity: r.in_jpkerp ? 0.5 : 1 }}>
                <td style={{ padding: 4, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={r.checked}
                    disabled={r.in_jpkerp}
                    onChange={() => toggleOne(r.id)}
                  />
                </td>
                <td className="text-2xs" style={{ padding: 4 }}>
                  {r.in_jpkerp ? (
                    <span className="text-text-muted">등록됨</span>
                  ) : (() => {
                    const inJ = r.asset_count > 0;
                    const inF = r.fp_product_count > 0 || r.in_fp_master;
                    const bg = 'var(--c-bg-sub)';
                    if (inJ && inF) return <span className="text-success" style={{ background: bg, padding: '1px 6px', borderRadius: 2, fontWeight: 600 }} title="jpkerp 자산 + freepass 양쪽">JF</span>;
                    if (inJ) return <span className="text-warn" style={{ background: bg, padding: '1px 6px', borderRadius: 2, fontWeight: 600 }} title="jpkerp에만 존재">J</span>;
                    if (inF) return <span className="text-primary" style={{ background: bg, padding: '1px 6px', borderRadius: 2, fontWeight: 600 }} title="freepass에만 존재">F</span>;
                    return null;
                  })()}
                </td>
                <td style={{ padding: 2 }}>
                  <input
                    type="text"
                    value={r.maker}
                    onChange={(e) => updateField(r.id, 'maker', e.target.value)}
                    disabled={r.in_jpkerp}
                    className="text-base" style={{ width: '100%', padding: '2px 4px', border: 'none', background: 'transparent' }}
                  />
                </td>
                <td style={{ padding: 2 }}>
                  <input
                    type="text"
                    value={r.model}
                    onChange={(e) => updateField(r.id, 'model', e.target.value)}
                    disabled={r.in_jpkerp}
                    className="text-base" style={{ width: '100%', padding: '2px 4px', border: 'none', background: 'transparent' }}
                  />
                </td>
                <td style={{ padding: 2 }}>
                  <input
                    type="text"
                    value={r.sub}
                    onChange={(e) => updateField(r.id, 'sub', e.target.value)}
                    disabled={r.in_jpkerp}
                    className="text-base" style={{ width: '100%', padding: '2px 4px', border: 'none', background: 'transparent' }}
                  />
                </td>
                <td style={{ padding: 6, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: r.asset_count > 0 ? 'var(--c-primary)' : 'var(--c-text-muted)' }}>
                  {r.asset_count || '—'}
                </td>
                <td style={{ padding: 6, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: r.fp_product_count > 0 ? 'var(--c-primary)' : 'var(--c-text-muted)' }}>
                  {r.fp_product_count || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FieldRow({ label, children, span }: { label: string; children: React.ReactNode; span?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, gridColumn: span ? `span ${span}` : undefined }}>
      <label className="text-2xs text-text-muted">{label}</label>
      {children}
    </div>
  );
}
