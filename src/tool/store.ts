// 偏好保存在本机应用数据目录的 settings.json（kit 的 settingsStore），键名 prefs.e16。只存阈值与上次填的店铺信息，不含任何凭据。
import { settingsStore } from '../kit/platform';
import { DEFAULT_OPTS, type Opts } from './core';

const KEY = 'prefs.e16';
export interface Prefs extends Opts { currency: string }
export const DEFAULT_PREFS: Prefs = { ...DEFAULT_OPTS, currency: 'MYR' };
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d);

export async function loadPrefs(): Promise<Prefs> {
  try {
    const v = (await (await settingsStore()).get<Partial<Prefs>>(KEY)) ?? {};
    return { lowStock: num(v.lowStock, DEFAULT_PREFS.lowStock), spreadPct: num(v.spreadPct, DEFAULT_PREFS.spreadPct), currency: typeof v.currency === 'string' && v.currency ? v.currency : DEFAULT_PREFS.currency };
  } catch { return DEFAULT_PREFS; }
}
export async function savePrefs(p: Prefs) {
  try { await (await settingsStore()).set(KEY, p); } catch { /* 忽略 */ }
}
