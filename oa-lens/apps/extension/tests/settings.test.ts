import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  loadWorkerConfig,
  normalizeWorkerUrl,
  sharedKeyItem,
  workerUrlItem,
} from '../lib/settings';

describe('normalizeWorkerUrl', () => {
  it.each([
    ['https://oa-lens.me.workers.dev', 'https://oa-lens.me.workers.dev'],
    ['  https://oa-lens.me.workers.dev/  ', 'https://oa-lens.me.workers.dev'],
    ['https://oa-lens.me.workers.dev/v1/', 'https://oa-lens.me.workers.dev'],
    ['oa-lens.me.workers.dev', 'https://oa-lens.me.workers.dev'],
    ['http://localhost:8787', 'http://localhost:8787'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeWorkerUrl(input)).toBe(expected);
  });

  it.each(['', '   ', 'ftp://example.com', 'https://'])('rejects %j', (input) => {
    expect(normalizeWorkerUrl(input)).toBeNull();
  });
});

describe('loadWorkerConfig', () => {
  beforeEach(() => fakeBrowser.reset());

  it('is null until both values are saved', async () => {
    expect(await loadWorkerConfig()).toBeNull();
    await workerUrlItem.setValue('https://oa-lens.me.workers.dev/');
    expect(await loadWorkerConfig()).toBeNull();
    await sharedKeyItem.setValue(' secret ');
    expect(await loadWorkerConfig()).toEqual({
      url: 'https://oa-lens.me.workers.dev',
      key: 'secret',
    });
  });
});

describe('migrateLocalToSync', () => {
  beforeEach(() => fakeBrowser.reset());

  it('moves values saved by older builds into sync storage', async () => {
    const { migrateLocalToSync, loadSettings } = await import('../lib/settings');
    await fakeBrowser.storage.local.set({
      workerUrl: 'https://oa-lens.me.workers.dev',
      sharedKey: 'k',
      settings: { usePeakFees: true },
    });
    await migrateLocalToSync();
    expect(await workerUrlItem.getValue()).toBe('https://oa-lens.me.workers.dev');
    expect(await sharedKeyItem.getValue()).toBe('k');
    expect((await loadSettings()).usePeakFees).toBe(true);
    expect(await fakeBrowser.storage.local.get(null)).toEqual({});
  });

  it('keeps what sync already has', async () => {
    const { migrateLocalToSync } = await import('../lib/settings');
    await fakeBrowser.storage.sync.set({ sharedKey: 'from-other-pc' });
    await fakeBrowser.storage.local.set({ sharedKey: 'old' });
    await migrateLocalToSync();
    expect(await sharedKeyItem.getValue()).toBe('from-other-pc');
  });
});
