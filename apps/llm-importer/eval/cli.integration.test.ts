import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const TSX = join(HERE, '..', 'node_modules', '.bin', 'tsx');
const RUN = join(HERE, 'run.ts');
const EXTRACT = join(HERE, 'extract.ts');

/** execFile that resolves (never rejects) so we can assert on a non-zero exit code. */
async function run(
  script: string,
  args: string[]
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileP(TSX, [script, ...args]);
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

describe('eval/run.ts CLI', () => {
  it('reports every golden set and exits 0', async () => {
    const { code, stdout } = await run(RUN, []);
    expect(code).toBe(0);
    expect(stdout).toContain('=== bookshop ===');
    expect(stdout).toMatch(/connections[\s\S]*precision .* recall .* f1/);
  });

  it('--check passes against the committed baseline (exit 0)', async () => {
    const { code, stdout } = await run(RUN, ['--check']);
    expect(code).toBe(0);
    expect(stdout).toContain('no regression beyond tolerance');
  });

  it('an unknown golden set is a setup error (exit 2)', async () => {
    const { code, stderr } = await run(RUN, ['--set', 'does-not-exist']);
    expect(code).toBe(2);
    expect(stderr).toMatch(/no golden set "does-not-exist"/);
  });

  it('an unknown flag is a setup error (exit 2)', async () => {
    const { code, stderr } = await run(RUN, ['--frobnicate']);
    expect(code).toBe(2);
    expect(stderr).toMatch(/unknown flag: --frobnicate/);
  });
});

describe('eval/extract.ts CLI', () => {
  it("scores a golden set's committed analyses and exits 0, one block per repo", async () => {
    const { code, stdout } = await run(EXTRACT, ['--set', 'bookshop']);
    expect(code).toBe(0);
    expect(stdout).toContain('extraction: bookshop');
    expect(stdout).toContain('aggregate (mean over repos)');
    for (const repo of [
      'bookshop-web',
      'api-gateway',
      'catalog-service',
      'order-service',
      'notification-service',
    ]) {
      expect(stdout).toContain(repo);
    }
  });

  it('with no --set, defaults to the first golden set (alphabetically)', async () => {
    const { code, stdout } = await run(EXTRACT, []);
    expect(code).toBe(0);
    expect(stdout).toContain('extraction: bookshop');
  });

  it('an unknown golden set is reported but still exits 0 (advisory)', async () => {
    const { code, stderr } = await run(EXTRACT, ['--set', 'nope']);
    expect(code).toBe(0);
    expect(stderr).toMatch(/no golden set "nope"/);
  });

  it('an empty --out dir skips every repo and exits 0', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'eval-extract-'));
    try {
      const { code, stderr } = await run(EXTRACT, ['--set', 'bookshop', '--out', empty]);
      expect(code).toBe(0);
      expect(stderr).toMatch(/\[skip\] bookshop-web: no analysis artifact/);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });
});
