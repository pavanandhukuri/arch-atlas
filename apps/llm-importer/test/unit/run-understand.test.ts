import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const promptMock = vi.fn();
const disposeMock = vi.fn();
const subscribeMock = vi.fn();

vi.mock('@earendil-works/pi-coding-agent', async () => {
  const actual = await vi.importActual<typeof import('@earendil-works/pi-coding-agent')>(
    '@earendil-works/pi-coding-agent'
  );
  return {
    ...actual,
    createAgentSession: vi.fn(() =>
      Promise.resolve({
        session: { prompt: promptMock, dispose: disposeMock, subscribe: subscribeMock },
        extensionsResult: { extensions: [], errors: [] },
      })
    ),
  };
});

const { runUnderstand } = await import('../../src/analysis/run-understand.js');
const { SharedLimiter } = await import('../../src/concurrency/shared-limiter.js');
const pi = await import('@earendil-works/pi-coding-agent');

let repoDir: string;

const VALID_GRAPH = {
  project: { name: 'test-repo', description: 'a fixture repo' },
  nodes: [{ id: 'file:a.ts', type: 'file', name: 'a.ts', summary: 'entry point' }],
  edges: [],
};

async function writeUaGraph(content: unknown): Promise<void> {
  await mkdir(join(repoDir, '.ua'), { recursive: true });
  await writeFile(join(repoDir, '.ua', 'knowledge-graph.json'), JSON.stringify(content), 'utf8');
}

beforeEach(async () => {
  repoDir = await mkdtemp(join(tmpdir(), 'arch-atlas-run-understand-test-'));
  promptMock.mockReset().mockResolvedValue(undefined);
  disposeMock.mockReset();
  subscribeMock.mockReset();
  vi.mocked(pi.createAgentSession).mockClear();
});

afterEach(async () => {
  await rm(repoDir, { recursive: true, force: true });
});

const baseOptions = () => ({
  repoName: 'test-repo',
  repoPath: repoDir,
  model: { id: 'llama3', provider: 'ollama' } as never,
  modelRuntime: {} as never,
});

describe('runUnderstand', () => {
  it('returns a complete result with the filtered graph when the session succeeds on the first attempt', async () => {
    await writeUaGraph(VALID_GRAPH);
    const limiter = new SharedLimiter(2);

    const result = await runUnderstand({ ...baseOptions(), limiter });

    expect(result.status).toBe('complete');
    if (result.status === 'complete') {
      expect(result.graph.repository.name).toBe('test-repo');
      expect(result.graph.nodes).toHaveLength(1);
      expect(result.graph.retryCount).toBe(0);
    }
    expect(pi.createAgentSession).toHaveBeenCalledTimes(1);
    expect(promptMock).toHaveBeenCalledWith('/skill:understand --full');
  });

  it('cleans up .ua/ from the analyzed repo after a successful run (research.md D4 adaptation 3)', async () => {
    await writeUaGraph(VALID_GRAPH);
    const limiter = new SharedLimiter(2);

    await runUnderstand({ ...baseOptions(), limiter });

    await expect(access(join(repoDir, '.ua'))).rejects.toThrow();
  });

  it('retries exactly once when the first attempt produces no knowledge-graph.json, then fails (FR-010a)', async () => {
    // Never write the graph file — every attempt's readFile will fail.
    const limiter = new SharedLimiter(2);

    const result = await runUnderstand({ ...baseOptions(), limiter });

    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.retryCount).toBe(1);
    }
    expect(pi.createAgentSession).toHaveBeenCalledTimes(2); // initial attempt + one retry
  });

  it('succeeds on the retry if the second attempt produces a valid graph', async () => {
    const limiter = new SharedLimiter(2);
    let callCount = 0;
    vi.mocked(pi.createAgentSession).mockImplementation(async () => {
      callCount += 1;
      if (callCount === 2) await writeUaGraph(VALID_GRAPH);
      return {
        session: { prompt: promptMock, dispose: disposeMock, subscribe: subscribeMock },
        extensionsResult: { extensions: [], errors: [] },
      } as never;
    });

    const result = await runUnderstand({ ...baseOptions(), limiter });

    expect(result.status).toBe('complete');
    if (result.status === 'complete') {
      expect(result.graph.retryCount).toBe(1);
    }
  });

  it('disposes the session even when the run fails', async () => {
    const limiter = new SharedLimiter(2);
    await runUnderstand({ ...baseOptions(), limiter });
    expect(disposeMock).toHaveBeenCalled();
  });

  // T062 live-run finding: local models often end their turn after reading
  // the skill without executing it. runOnce must nudge the same session
  // (cheap — context retained) before the FR-010a outer retry (expensive —
  // starts over) gets involved.
  it('nudges the session up to 3 times per attempt when no graph appears', async () => {
    const limiter = new SharedLimiter(2);

    const result = await runUnderstand({ ...baseOptions(), limiter });

    expect(result.status).toBe('failed');
    // 2 attempts × (1 skill prompt + 3 continue nudges)
    expect(promptMock).toHaveBeenCalledTimes(8);
    const nudgeCalls = promptMock.mock.calls.filter(([text]) =>
      String(text).includes('NOT complete')
    );
    expect(nudgeCalls).toHaveLength(6);
  });

  it('completes without an outer retry when a nudge gets the graph written', async () => {
    const limiter = new SharedLimiter(2);
    let promptCount = 0;
    promptMock.mockImplementation(async () => {
      promptCount += 1;
      // Initial skill prompt stalls; the first nudge produces the graph.
      if (promptCount === 2) await writeUaGraph(VALID_GRAPH);
    });

    const result = await runUnderstand({ ...baseOptions(), limiter });

    expect(result.status).toBe('complete');
    if (result.status === 'complete') {
      expect(result.graph.retryCount).toBe(0);
    }
    expect(pi.createAgentSession).toHaveBeenCalledTimes(1);
    expect(promptMock).toHaveBeenCalledTimes(2); // skill prompt + one nudge, then done
  });
});
