/**
 * research.md D8 / FR-016: a single semaphore shared by repo-level fan-out
 * AND the vendored subagent dispatcher's internal batch fan-out, so a single
 * local model endpoint never receives more concurrent requests than
 * `maxConcurrency` regardless of which layer is asking.
 */
export class SharedLimiter {
  private available: number;
  private readonly waiters: Array<() => void> = [];

  constructor(public readonly maxConcurrency: number) {
    if (maxConcurrency < 1) {
      throw new RangeError(`maxConcurrency must be >= 1, got ${maxConcurrency}`);
    }
    this.available = maxConcurrency;
  }

  async acquire(): Promise<() => void> {
    if (this.available > 0) {
      this.available -= 1;
      return () => {
        this.release();
      };
    }
    await new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
    this.available -= 1;
    return () => {
      this.release();
    };
  }

  private release(): void {
    this.available += 1;
    const next = this.waiters.shift();
    if (next) next();
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
}
