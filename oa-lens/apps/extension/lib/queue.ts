interface Job {
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  priority: number;
}

export interface QueueOptions {
  /** Max tasks running at once. */
  concurrency: number;
  /** Minimum gap between task starts, in ms. */
  intervalMs: number;
}

/**
 * Per-operation request queue (docs/01 §4). Higher priority runs first; equal priority is FIFO.
 */
export class RequestQueue {
  private readonly pending: Job[] = [];
  private active = 0;
  private lastStart = Number.NEGATIVE_INFINITY;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly options: QueueOptions) {}

  get size(): number {
    return this.pending.length;
  }

  run<T>(task: () => Promise<T>, priority = 0): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const job: Job = { run: task, resolve: resolve as (v: unknown) => void, reject, priority };
      const index = this.pending.findIndex((j) => j.priority < priority);
      if (index === -1) this.pending.push(job);
      else this.pending.splice(index, 0, job);
      this.pump();
    });
  }

  private pump(): void {
    if (this.timer !== undefined) return;
    while (this.active < this.options.concurrency && this.pending.length > 0) {
      const wait = this.lastStart + this.options.intervalMs - Date.now();
      if (wait > 0) {
        this.timer = setTimeout(() => {
          this.timer = undefined;
          this.pump();
        }, wait);
        return;
      }
      const job = this.pending.shift()!;
      this.active++;
      this.lastStart = Date.now();
      Promise.resolve()
        .then(job.run)
        .then(job.resolve, job.reject)
        .finally(() => {
          this.active--;
          this.pump();
        });
    }
  }
}
