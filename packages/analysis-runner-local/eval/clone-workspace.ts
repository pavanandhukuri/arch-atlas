import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Shallow-clone an external golden workspace at a pinned SHA into
 * `<goldenDir>/workspace/` (git-ignored). Idempotent — a `.eval-sha` marker
 * skips re-cloning when the SHA already matches.
 */
export function ensureClonedWorkspace(
  goldenDir: string,
  spec: { repo: string; sha: string }
): string {
  const dest = path.join(goldenDir, 'workspace');
  const marker = path.join(dest, '.eval-sha');
  if (fs.existsSync(marker) && fs.readFileSync(marker, 'utf8').trim() === spec.sha) {
    return dest;
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  const git = (...args: string[]): void => {
    execFileSync('git', args, { cwd: dest, stdio: 'inherit' });
  };
  git('init', '-q');
  git('remote', 'add', 'origin', spec.repo);
  git('fetch', '-q', '--depth', '1', 'origin', spec.sha);
  git('checkout', '-q', 'FETCH_HEAD');
  fs.writeFileSync(marker, `${spec.sha}\n`);
  return dest;
}
