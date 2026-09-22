/**
 * Eval harness types. Model-call-free. Dev-only — nothing under `eval/` is in
 * the published npm tarball (`files: ["dist"]`).
 *
 * Rebuilt from `packages/analysis-runner-local/eval/types.ts` (git dda7094),
 * trimmed for the two evals it now feeds:
 *   - CORRELATION eval (run.ts)  — deterministic, CI-gating
 *   - EXTRACTION eval  (extract.ts) — model-dependent, local-only, never gates
 */

/** Precision / recall / F1 for one set comparison. */
export interface PRF {
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
}

/** The checkable subset of one repo's true architecture (extraction eval). */
export interface RepoGroundTruth {
  /** One-line true purpose. Reference text; not scored by this harness. */
  role: string;
  languages: string[];
  frameworks: string[];
  served: {
    httpRoutes?: string[];
    grpcServices?: string[];
    /** "topic" or "topic:pub" / "topic:sub". */
    topics?: string[];
    datastores?: string[];
  };
  /** Names of other systems this repo calls / depends on / publishes to. */
  outbound?: string[];
}

/** The whole `ground-truth.json` for a golden set. */
export interface WorkspaceGroundTruth {
  repos: Record<string, RepoGroundTruth>;
  /** Directed cross-repo connections (source → target). `kind` is documentation only. */
  connections: Array<{ from: string; to: string; kind?: string }>;
  /**
   * Canonical names of systems OUTSIDE the workspace that every correlation must
   * recover — identity providers, object stores, managed queues, third-party
   * APIs. Scored by `scoreExternalSystems`.
   */
  externalSystems: string[];
}

/** `eval.config.yaml` — where a golden set's repo trees live + how they map to names. */
export interface EvalConfig {
  name: string;
  /** Path (relative to the config file) to a directory containing the repo trees. */
  workspace: { local: string };
  /**
   * Path (relative to the config file) to the directory holding the committed
   * `{repo}.analysis.json` files. Default: `analyses/` next to the config if it
   * exists, else `../analyses` beside the repo trees. Set it to point at analyses
   * that already live elsewhere (e.g. an `examples/` workspace) instead of copying them.
   */
  analyses?: string;
  repos: Array<{ name: string; path: string }>;
}

/** `precision` / `recall` / `f1` only — the shape persisted in `baseline.json`. */
export type PrfLite = Pick<PRF, 'precision' | 'recall' | 'f1'>;

/** `baseline.json` — the `--check` reference, keyed by golden-set name. */
export type Baseline = Record<
  string,
  {
    connections: PrfLite;
    externalSystems: PrfLite;
  }
>;

/** In-memory result of one correlation-eval run. */
export interface CorrelationReport {
  set: string;
  generatedAt: string;
  connections: PRF;
  externalSystems: PRF;
  expected: { connections: string[]; externalSystems: string[] };
  predicted: { connections: string[]; externalSystems: string[] };
}

/** In-memory result of `eval:extract`. Never persisted, never gates. */
export interface ExtractionReport {
  set: string;
  perRepo: Record<string, Record<string, PRF>>;
  aggregate: Record<string, PRF>;
}
