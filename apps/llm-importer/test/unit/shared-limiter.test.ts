import { describe, it, expect } from 'vitest';
import { SharedLimiter } from '../../src/concurrency/shared-limiter.js';

describe('SharedLimiter', () => {
  it('throws for a non-positive maxConcurrency', () => {
    expect(() => new SharedLimiter(0)).toThrow(RangeError);
    expect(() => new SharedLimiter(-1)).toThrow(RangeError);
  });

  it('runs tasks below the limit without queueing', async () => {
    const limiter = new SharedLimiter(3);
    const results = await Promise.all([1, 2, 3].map((n) => limiter.run(() => Promise.resolve(n))));
    expect(results).toEqual([1, 2, 3]);
  });

  it('never exceeds maxConcurrency concurrent executions — FR-016', async () => {
    const limiter = new SharedLimiter(2);
    let current = 0;
    let maxObserved = 0;

    const task = async () => {
      current += 1;
      maxObserved = Math.max(maxObserved, current);
      await new Promise((resolve) => setTimeout(resolve, 10));
      current -= 1;
    };

    await Promise.all(Array.from({ length: 8 }, () => limiter.run(task)));
    expect(maxObserved).toBeLessThanOrEqual(2);
  });

  it('releases the slot even when the task throws', async () => {
    const limiter = new SharedLimiter(1);
    await expect(
      limiter.run(() => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    // If the slot wasn't released, this would hang forever — vitest's
    // default timeout makes that failure visible rather than silent.
    await expect(limiter.run(() => Promise.resolve('ok'))).resolves.toBe('ok');
  });

  it('represents multiple call sites sharing one pool (FR-016 intent)', async () => {
    // Simulates two independent call sites (repo-level analysis fan-out and
    // the agentic correlation fallback) drawing from the SAME limiter
    // instance, as run-import.ts wires it.
    const limiter = new SharedLimiter(2);
    let current = 0;
    let maxObserved = 0;
    const track = async () => {
      current += 1;
      maxObserved = Math.max(maxObserved, current);
      await new Promise((resolve) => setTimeout(resolve, 5));
      current -= 1;
    };

    const repoLevelCalls = Array.from({ length: 4 }, () => limiter.run(track));
    const internalBatchCalls = Array.from({ length: 4 }, () => limiter.run(track));
    await Promise.all([...repoLevelCalls, ...internalBatchCalls]);

    expect(maxObserved).toBeLessThanOrEqual(2);
  });
});
