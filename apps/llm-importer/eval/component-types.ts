/**
 * Component eval harness types (014-component-layer-drilldown). Model-call-free,
 * dev-only — nothing under `eval/` is in the published npm tarball
 * (`files: ["dist"]`). Deliberately simpler than `types.ts`'s correlation shapes:
 * a component golden "set" is one repository, not a multi-repo workspace.
 */
import type { PRF } from './types.js';

/** The checkable subset of one repo's true internal structure. */
export interface ComponentGroundTruth {
  components: Array<{ name: string; kind: string; description: string }>;
  /** Directed source -> target. */
  relationships: Array<{ from: string; to: string }>;
}

/** `eval.config.yaml` for one golden-components set. */
export interface ComponentEvalConfig {
  name: string;
  /** Path (relative to the config file) to the one repo's source tree. Reference only. */
  workspace: { local: string };
  /** Path (relative to the config file) to the committed `{repo}.components.json`. */
  artifact: string;
  repo: { name: string; path: string };
}

export type ComponentPrfLite = Pick<PRF, 'precision' | 'recall' | 'f1'>;

/** `component-baseline.json` — the `--check` reference, keyed by golden-set name. */
export type ComponentBaseline = Record<
  string,
  { components: ComponentPrfLite; relationships: ComponentPrfLite }
>;

/** In-memory result of one component-eval run. */
export interface ComponentReport {
  set: string;
  generatedAt: string;
  components: PRF;
  relationships: PRF;
  expected: { components: string[]; relationships: string[] };
  predicted: { components: string[]; relationships: string[] };
}
