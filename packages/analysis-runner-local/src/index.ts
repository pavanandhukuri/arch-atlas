/**
 * `@arch-atlas/analysis-runner-local` — reference offline analysis producer
 * (010-harness-neutral-importer). Local model endpoint only.
 */
export { chatComplete, ChatCompletionError, REPO_ANALYSIS_JSON_SCHEMA } from './openai-client.js';
export type { ChatCompleteOptions } from './openai-client.js';

export { analyzeRepoLocal } from './analyze-repo.js';
export type { AnalyzeRepoLocalOptions, AnalyzeRepoLocalResult } from './analyze-repo.js';

export { resolveUnresolvedPairs } from './agentic-fallback.js';
export type { ResolveUnresolvedPairsOptions } from './agentic-fallback.js';

export { checkLocalModelReachable, LocalModelUnreachableError } from './reachability.js';

export { loadRunnerConfig, RunnerConfigError } from './config.js';
export type { RunnerConfig } from './config.js';

export { renderPrompt, renderVerifyPrompt } from './prompt.js';
export type { StructuredOutputMode } from './prompt.js';
export { extractJsonObject, parseLenient, coerceModelAnalysis } from './parse.js';
export { sanitizeServed, sanitizeFrameworks } from './sanitize.js';
