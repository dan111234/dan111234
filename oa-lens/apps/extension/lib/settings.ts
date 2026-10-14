import { DEFAULT_SETTINGS, mergeSettings, type Settings } from '@oa-lens/shared';
import { storage } from 'wxt/utils/storage';

// Connection and calculator settings live in chrome.storage.sync, so signing in to Chrome on
// another computer brings them along (Chrome Web Store install). Earlier builds used .local;
// migrateLocalToSync() copies those values over once.
export const workerUrlItem = storage.defineItem<string>('sync:workerUrl', { fallback: '' });
export const sharedKeyItem = storage.defineItem<string>('sync:sharedKey', { fallback: '' });

export interface WorkerConfig {
  url: string;
  key: string;
}

/** Trims, drops trailing slashes and a pasted `/v1` suffix. Returns null if not http(s). */
export function normalizeWorkerUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const path = url.pathname.replace(/\/+$/, '').replace(/\/v1$/, '');
  return `${url.origin}${path}`;
}

export async function loadWorkerConfig(): Promise<WorkerConfig | null> {
  const [url, key] = await Promise.all([workerUrlItem.getValue(), sharedKeyItem.getValue()]);
  const normalized = normalizeWorkerUrl(url);
  if (!normalized || !key.trim()) return null;
  return { url: normalized, key: key.trim() };
}

/** Calculator settings (docs/05), merged over the defaults on every read. */
export const settingsItem = storage.defineItem<unknown>('sync:settings', { fallback: {} });

const LEGACY_KEYS = ['workerUrl', 'sharedKey', 'settings'] as const;

/** Copies values saved by older builds (chrome.storage.local) into sync, unless sync has them. */
export async function migrateLocalToSync(): Promise<void> {
  for (const key of LEGACY_KEYS) {
    const [local, synced] = await Promise.all([
      storage.getItem<unknown>(`local:${key}`),
      storage.getItem<unknown>(`sync:${key}`),
    ]);
    if (local != null && synced == null) await storage.setItem(`sync:${key}`, local);
    if (local != null) await storage.removeItem(`local:${key}`);
  }
}

export async function loadSettings(): Promise<Settings> {
  return mergeSettings(await settingsItem.getValue());
}

export async function saveSettings(settings: Settings): Promise<void> {
  await settingsItem.setValue(settings);
}

/** Calls `cb` with the merged settings now and whenever they change (other tabs included). */
export function watchSettings(cb: (settings: Settings) => void): () => void {
  void loadSettings().then(cb);
  return settingsItem.watch((value) => cb(mergeSettings(value)));
}

export { DEFAULT_SETTINGS };
