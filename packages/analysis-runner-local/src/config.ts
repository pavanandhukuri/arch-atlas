import { loadConfig, type ImportConfig, type LocalModelConfig } from '@arch-atlas/llm-importer';

/**
 * The runner reads the SAME `import.yaml` the importer core uses, but — unlike
 * the core — it requires the `localModel` block. `analysis.*` knobs
 * (temperature, verifyGrounding, structuredOutput, maxConcurrency, forceRefresh)
 * are runner territory (010 research D6).
 */

export interface RunnerConfig extends ImportConfig {
  localModel: LocalModelConfig;
}

export class RunnerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RunnerConfigError';
  }
}

export async function loadRunnerConfig(filePath: string): Promise<RunnerConfig> {
  const config = await loadConfig(filePath);
  if (!config.localModel) {
    throw new RunnerConfigError(
      `${filePath}: the analysis runner requires a \`localModel\` block ` +
        '({ provider, endpoint, modelId, apiKey? }). The importer core ignores it, but the runner needs it.'
    );
  }
  return { ...config, localModel: config.localModel };
}
