'use client';

/**
 * useAlarmSettings — RTDB `settings/alarms` 단일 ref 실시간 구독.
 *
 * - onValue로 path 변경시 자동 갱신
 * - DEFAULT_ALARM_SETTINGS로 fallback
 * - 모듈 레벨 캐시 + 단일 리스너로 다중 컴포넌트 공유
 */

import { getRtdb } from '@/lib/firebase/rtdb';
import {
  type AlarmSettings,
  DEFAULT_ALARM_SETTINGS,
  withAlarmDefaults,
} from '@/lib/types/alarm-settings';
import { onValue, ref } from 'firebase/database';
import { useCallback, useSyncExternalStore } from 'react';

interface State {
  settings: AlarmSettings;
  loading: boolean;
}

const INITIAL: State = { settings: DEFAULT_ALARM_SETTINGS, loading: true };
const SERVER: State = { settings: DEFAULT_ALARM_SETTINGS, loading: true };

let current: State = INITIAL;
const listeners = new Set<() => void>();
let started = false;

function start(): void {
  if (started) return;
  started = true;
  try {
    const r = ref(getRtdb(), 'settings/alarms');
    onValue(
      r,
      (snap) => {
        const val = snap.val() as Partial<AlarmSettings> | null;
        current = { settings: withAlarmDefaults(val), loading: false };
        for (const cb of listeners) cb();
      },
      () => {
        current = { settings: DEFAULT_ALARM_SETTINGS, loading: false };
        for (const cb of listeners) cb();
      },
    );
    // 영구 구독 — 앱 라이프사이클 동안 유지 (alarms는 모든 페이지에서 사용)
  } catch {
    current = { settings: DEFAULT_ALARM_SETTINGS, loading: false };
    for (const cb of listeners) cb();
  }
}

function subscribe(cb: () => void): () => void {
  start();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): State {
  return current;
}

function getServerSnapshot(): State {
  return SERVER;
}

export function useAlarmSettings(): State {
  const sub = useCallback(subscribe, []);
  return useSyncExternalStore(sub, getSnapshot, getServerSnapshot);
}
