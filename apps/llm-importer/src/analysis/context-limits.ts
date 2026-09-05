/**
 * Fixed caps for the deterministic analysis-context walk (008 research.md D2).
 *
 * The whole point of the bounded-analysis call is that its input is fixed and
 * inspectable: only the model's *response* varies between runs, never the
 * context we hand it. These constants are the single knob-set for that bound.
 *
 * The three input kinds have independent budgets so a README-heavy repo can't
 * starve the source excerpts (reliability fix — a 437-file service was seen
 * producing 14 READMEs and 0 source files).
 */

/**
 * Max directory depth the walk descends (repo root is depth 0). Deep enough to
 * reach controller/service classes nested under
 * `src/main/java/<group>/<several.package.segments>/…` in a conventional
 * Maven/Gradle layout. The `MAX_FILES_EXAMINED` and `MAX_LISTING_ENTRIES` caps
 * keep the cost bounded regardless.
 */
export const MAX_DEPTH = 12;

/** Max repo-relative paths recorded in the directory listing handed to the model. */
export const MAX_LISTING_ENTRIES = 400;

/** Per-README byte cap (each README is truncated, not skipped, past this). */
export const MAX_README_BYTES = 16_384;

/** Max number of README/overview files embedded (shallowest first). */
export const MAX_README_FILES = 4;

/** Combined byte budget across all embedded READMEs. */
export const MAX_README_TOTAL_BYTES = 24_576;

/** Per-manifest byte cap. */
export const MAX_MANIFEST_BYTES = 16_384;

/** Combined byte budget across all embedded manifest/build/compose files. */
export const MAX_MANIFEST_TOTAL_BYTES = 40_960;

/** Max number of relevance-ranked source files embedded as excerpts. */
export const MAX_SOURCE_FILES = 12;

/** Per-source-excerpt byte cap (files are truncated past this). */
export const MAX_SOURCE_BYTES = 6_144;

/**
 * Hard ceiling on the total embedded text (READMEs + manifests + source
 * excerpts). Source excerpts are added in rank order and stop once this is
 * hit; READMEs and manifests have their own sub-budgets above, so at least
 * `MAX_TOTAL_CONTEXT_BYTES - MAX_README_TOTAL_BYTES - MAX_MANIFEST_TOTAL_BYTES`
 * is always available for source.
 */
export const MAX_TOTAL_CONTEXT_BYTES = 131_072;

/**
 * Ceiling on files the walk will *examine* before giving up (independent of how
 * many it keeps).
 */
export const MAX_FILES_EXAMINED = 2_000;
