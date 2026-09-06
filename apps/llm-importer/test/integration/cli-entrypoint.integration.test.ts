import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);

/**
 * Regression guard: npm / npx / pnpm expose the `arch-atlas-import` bin as a
 * SYMLINK into node_modules/.bin. The entry-point check in cli.ts must resolve
 * realpaths — a naive `import.meta.url === file://${process.argv[1]}` silently
 * no-ops when invoked through that symlink (exit 0, no output, nothing written),
 * which broke `npx @archatlas/llm-importer` before this test existed.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI_SRC = join(HERE, '..', '..', 'src', 'cli.ts');
const TSX = join(HERE, '..', '..', 'node_modules', '.bin', 'tsx');

let dir: string;
let linkedCli: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cli-entrypoint-'));
  // mimic node_modules/.bin/arch-atlas-import -> ../<pkg>/src/cli.ts
  linkedCli = join(dir, 'arch-atlas-import');
  await symlink(CLI_SRC, linkedCli);
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('cli.ts entry-point detection', () => {
  it('still parses argv when invoked through a bin symlink', async () => {
    const { stdout } = await execFileP(TSX, [linkedCli, '--help']);
    expect(stdout).toContain('arch-atlas-import');
    expect(stdout).toContain('gather-context');
    expect(stdout).toContain('import');
  });

  it('runs a subcommand (exit non-zero + message on a bad config) through the symlink', async () => {
    // A missing config file must produce an error, not a silent no-op exit 0.
    await expect(
      execFileP(TSX, [linkedCli, 'import', join(dir, 'does-not-exist.yaml')])
    ).rejects.toMatchObject({ code: 1 });
  });
});
