import { DEFAULT_SETTINGS, mergeSettings, type Settings } from '@oa-lens/shared';
import { storage } from 'wxt/utils/storage';

// Connection settings for the Worker (docs/03 §I). Kept in chrome.storage.local on this device.
export const workerUrlItem = storage.defineItem<string>('local:workerUrl', { fallback: '' });
export const sharedKeyItem = storage.defineItem<string>('local:sharedKey', { fallback: '' });

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
export const settingsItem = storage.defineItem<unknown>('local:settings', { fallback: {} });

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
