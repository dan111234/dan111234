import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestQueue } from '../lib/queue';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe('RequestQueue', () => {
  it('spaces task starts by intervalMs', async () => {
    const q = new RequestQueue({ concurrency: 5, intervalMs: 500 });
    const starts: number[] = [];
    const all = [1, 2, 3].map(() => q.run(async () => void starts.push(Date.now())));
    await vi.runAllTimersAsync();
    await Promise.all(all);
    expect(starts).toEqual([0, 500, 1000]);
  });

  it('never runs more than `concurrency` tasks at once', async () => {
    const q = new RequestQueue({ concurrency: 2, intervalMs: 0 });
    let running = 0;
    let peak = 0;
    const gates = [deferred(), deferred(), deferred()];
    const all = gates.map((g) =>
      q.run(async () => {
        running++;
        peak = Math.max(peak, running);
        await g.promise;
        running--;
      }),
    );
    await vi.runAllTimersAsync();
    expect(running).toBe(2);
    expect(q.size).toBe(1);
    gates.forEach((g) => g.resolve());
    await vi.runAllTimersAsync();
    await Promise.all(all);
    expect(peak).toBe(2);
  });

  it('runs higher priority first, FIFO otherwise', async () => {
    const q = new RequestQueue({ concurrency: 1, intervalMs: 0 });
    const gate = deferred();
    const order: string[] = [];
    const first = q.run(async () => {
      order.push('first');
      await gate.promise;
    });
    const rest = [
      q.run(async () => void order.push('low-a')),
      q.run(async () => void order.push('high'), 10),
      q.run(async () => void order.push('low-b')),
    ];
    gate.resolve();
    await vi.runAllTimersAsync();
    await Promise.all([first, ...rest]);
    expect(order).toEqual(['first', 'high', 'low-a', 'low-b']);
  });

  it('propagates rejections and keeps going', async () => {
    const q = new RequestQueue({ concurrency: 1, intervalMs: 0 });
    const bad = q.run(async () => {
      throw new Error('boom');
    });
    const good = q.run(async () => 42);
    await expect(bad).rejects.toThrow('boom');
    await vi.runAllTimersAsync();
    await expect(good).resolves.toBe(42);
  });
});
