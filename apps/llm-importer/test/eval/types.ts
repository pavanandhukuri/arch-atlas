/**
 * 008 research.md D14 follow-up: an eval harness for the bounded analysis call.
 *
 * Two golden sets (`test/eval/golden/*`): `fixtures` (in-repo, tiny, exact
 * ground truth, offline) and `online-boutique` (GoogleCloudPlatform/
 * microservices-demo cloned at a pinned SHA — the same demo repo
 * Understand-Anything's README points at). `pnpm eval` runs `analyzeRepo` N
 * times per repo against a live local model, scores the output against the
 * hand-labelled ground truth, and writes a baseline the next run can diff.
 */

/** The checkable subset of a repo's true architecture. */
export interface RepoGroundTruth {
  /** One-line true purpose — the reference for the description LLM-judge. */
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

export interface WorkspaceGroundTruth {
  repos: Record<string, RepoGroundTruth>;
  /** Directed cross-repo connections (source → target). */
  connections: Array<{ from: string; to: string; kind?: string }>;
}

/** `eval.config.yaml` — where the repos live + how to get them. */
export interface EvalConfig {
  name: string;
  workspace:
    | { local: string } // path (relative to the golden dir) to a dir containing the repos
    | {
        clone: { repo: string; sha: string; subdir?: string };
      };
  repos: Array<{ name: string; path: string }>;
}

export interface PRF {
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
}

/** Per-field score for one repo, averaged over N runs. */
export interface RepoFieldScores {
  languages: PRF;
  frameworks: PRF;
  httpRoutes: PRF;
  grpcServices: PRF;
  topics: PRF;
  datastores: PRF;
  outbound: PRF;
  /** Mean pairwise Jaccard of each served-field set across the N runs (1 = identical every run). */
  consistency: Record<string, number>;
  /** Mean LLM-judge score for `description` (1–5), or null when judging was skipped. */
  descriptionScore: number | null;
}

export interface EvalReport {
  set: string;
  runs: number;
  model: string;
  generatedAt: string;
  perRepo: Record<string, RepoFieldScores>;
  aggregate: Record<string, number>;
}
